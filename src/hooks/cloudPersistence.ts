/**
 * cloudPersistence.ts — V12.5
 *
 * Batch-upsert cloud persistence with conflict detection.
 *
 * Key changes from V12.4:
 * - N+1 pattern replaced: each entity type is one batch upsert request
 * - Conflict detection: fetches cloud timestamps before writing, flags records
 *   where the cloud version is newer than local
 * - Conflict resolutions passed in from the UI: 'local' forces overwrite,
 *   'cloud' skips the row so the cloud version is preserved
 * - New entities: saved_budgets, budget_actuals
 * - Soft delete: deleted_at column supported in schema; local deletes tracked separately (V12.6+)
 */
import type {
  Account,
  Category,
  Contribution,
  ImportBatch,
  SavedBudget,
  SavedScenarioSet,
  SavedTargetSet,
  Target,
  Transaction,
  TransactionRule,
  TakeHomeSettings,
} from '../types'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Public types ──────────────────────────────────────────────────────────────

export type CloudPersistEntity =
  | 'accounts'
  | 'categories'
  | 'import_batches'
  | 'transactions'
  | 'transaction_rules'
  | 'savings_goals'
  | 'savings_goal_contributions'
  | 'savings_goal_sets'
  | 'scenarios'
  | 'saved_budgets'
  | 'budget_actuals'
  | 'monthly_reviews'
  | 'take_home_settings'
  | 'scenario_notes'
  | 'category_memory'

export type CloudPersistResult = {
  entity: CloudPersistEntity
  attempted: number
  synced: number
  failed: number
  skipped: number   // rows skipped because user chose 'cloud' for that conflict
  message?: string
  errorDetail?: string  // exact Supabase error message for debugging
}

export type CloudPersistSummary = {
  attempted: number
  synced: number
  failed: number
  skipped: number
  conflicts: ConflictRecord[]
  results: CloudPersistResult[]
  lastSyncedAt?: string
}

export type CloudConnectionTestResult = {
  ok: boolean
  error?: string
}

/**
 * A conflict: local record exists AND cloud version has a newer updated_at.
 * The UI shows both sides and asks the user to pick one.
 * dataIsIdentical is computed in the modal from the fields array — if all values
 * match exactly, the conflict is auto-resolved without showing it to the user.
 */
export type ConflictRecord = {
  entity: CloudPersistEntity
  localId: string
  displayName: string
  localUpdatedAt: string | null
  cloudUpdatedAt: string | null
  fields: Array<{ label: string; localValue: string; cloudValue: string }>
}

/** User decision per conflict: keep local version or keep cloud version. */
export type ConflictResolution = 'local' | 'cloud'
export type ConflictResolutions = Record<string, ConflictResolution>  // key = localId

// ─── Internal helpers ──────────────────────────────────────────────────────────

type Client = SupabaseClient
type Row = Record<string, unknown>

const nowIso = () => new Date().toISOString()

const safeNum = (v: unknown, fallback = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

const fmtCurrency = (v: unknown): string => {
  const n = safeNum(v)
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

/**
 * Fetch (local_id → updated_at) map from cloud for conflict detection.
 * Single SELECT — one request regardless of dataset size.
 */
async function fetchCloudTimestamps(
  supabase: Client,
  table: string,
  userId: string,
): Promise<Record<string, string | null>> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('local_id, updated_at')
      .eq('user_id', userId)
      .is('deleted_at', null)

    if (error || !Array.isArray(data)) return {}

    return data.reduce<Record<string, string | null>>((map, row) => {
      if (typeof row.local_id === 'string') {
        map[row.local_id] = typeof row.updated_at === 'string' ? row.updated_at : null
      }
      return map
    }, {})
  } catch {
    return {}
  }
}

/**
 * Fetch full cloud row for a specific local_id (used to populate conflict display fields).
 */
async function fetchCloudRow(
  supabase: Client,
  table: string,
  userId: string,
  localId: string,
): Promise<Row | null> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .eq('local_id', localId)
      .maybeSingle()

    if (error || !data) return null
    return data as Row
  } catch {
    return null
  }
}

/**
 * Batch upsert rows using ON CONFLICT (user_id, local_id) DO UPDATE.
 * Single network request for all rows — replaces N+1 pattern entirely.
 */
/**
 * Deduplicates rows by local_id, keeping the last occurrence of each.
 * Prevents "ON CONFLICT DO UPDATE command cannot affect a row a second time"
 * which happens when two records share the same local_id in a single batch.
 */
function deduplicateByLocalId(rows: Row[]): Row[] {
  const seen = new Map<string, Row>()
  for (const row of rows) {
    const key = String(row['local_id'] ?? '')
    seen.set(key, row)   // later occurrence wins (most-recently saved version)
  }
  return Array.from(seen.values())
}

async function batchUpsert(
  supabase: Client,
  table: string,
  rows: Row[],
): Promise<{ synced: number; failed: number; errorDetail?: string }> {
  if (!rows.length) return { synced: 0, failed: 0 }
  try {
    const { error } = await supabase
      .from(table)
      .upsert(rows, { onConflict: 'user_id,local_id' })

    if (error) {
      const detail = `[${table}] ${error.message}${error.details ? ` — ${error.details}` : ''}${error.hint ? ` (hint: ${error.hint})` : ''}`
      return { synced: 0, failed: rows.length, errorDetail: detail }
    }
    return { synced: rows.length, failed: 0 }
  } catch (err) {
    const detail = `[${table}] ${err instanceof Error ? err.message : 'Unknown error'}`
    return { synced: 0, failed: rows.length, errorDetail: detail }
  }
}

/**
 * Resolves (local_id → cloud UUID) for FK lookups after a batch upsert.
 * Single SELECT — replaces the old resolveCloudIdMap helper.
 */
async function resolveCloudIds(
  supabase: Client,
  table: string,
  userId: string,
  localIds: string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(localIds.filter(Boolean)))
  if (!unique.length) return {}
  try {
    const { data, error } = await supabase
      .from(table)
      .select('id, local_id')
      .eq('user_id', userId)
      .in('local_id', unique)

    if (error || !Array.isArray(data)) return {}
    return data.reduce<Record<string, string>>((map, row) => {
      if (typeof row.local_id === 'string' && typeof row.id === 'string') {
        map[row.local_id] = row.id
      }
      return map
    }, {})
  } catch {
    return {}
  }
}

/**
 * Split rows into safe-to-upsert vs conflicts based on cloud timestamps.
 * A conflict exists when the cloud version has a newer updated_at than local.
 * Rows that the user has already resolved are treated according to their resolution.
 */
function splitByConflict<T extends { id: string; updatedAt?: string }>(
  rows: T[],
  cloudTimestamps: Record<string, string | null>,
  resolutions: ConflictResolutions,
): { safe: T[]; conflicted: T[] } {
  const safe: T[] = []
  const conflicted: T[] = []

  for (const row of rows) {
    const resolution = resolutions[row.id]

    // Resolved as 'local' → always upsert (override cloud)
    if (resolution === 'local') { safe.push(row); continue }

    // Resolved as 'cloud' → skip (keep cloud version)
    if (resolution === 'cloud') continue

    const cloudTs = cloudTimestamps[row.id]
    const localTs = row.updatedAt ?? null

    // No cloud record yet → always safe to insert
    if (cloudTs === undefined) { safe.push(row); continue }

    // Cloud has no timestamp → show conflict popup (we can't compare)
    if (cloudTs === null && localTs === null) { conflicted.push(row); continue }

    // Cloud timestamp is strictly newer than local → conflict
    if (cloudTs && localTs && new Date(cloudTs) > new Date(localTs)) {
      conflicted.push(row)
      continue
    }

    // Cloud timestamp exists but local has none → conflict (cloud might be newer)
    if (cloudTs && !localTs) { conflicted.push(row); continue }

    safe.push(row)
  }

  return { safe, conflicted }
}

// ─── Connection test ───────────────────────────────────────────────────────────

export async function testCloudConnection(
  supabase: Client,
  userId: string,
): Promise<CloudConnectionTestResult> {
  try {
    const { error } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .limit(1)

    if (error) {
      const msg = error.message ?? String(error)
      const status = (error as { status?: number }).status
      if (status === 403 || msg.toLowerCase().includes('forbidden') || msg.toLowerCase().includes('rls')) {
        return { ok: false, error: `Access denied (${status ?? 403}): RLS policy blocked the request. Check your Supabase RLS rules and GRANT statements.` }
      }
      if (status === 401 || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('jwt')) {
        return { ok: false, error: `Not authenticated (${status ?? 401}): Your session may have expired. Try signing out and back in.` }
      }
      return { ok: false, error: `Supabase error: ${msg}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Connection test failed.' }
  }
}

// ─── Entity sync functions ─────────────────────────────────────────────────────

export async function persistAccountsToCloud(
  supabase: Client,
  userId: string,
  accounts: Account[],
  resolutions: ConflictResolutions = {},
): Promise<{ result: CloudPersistResult; conflicts: ConflictRecord[] }> {
  const entity: CloudPersistEntity = 'accounts'
  const cloudTs = await fetchCloudTimestamps(supabase, 'accounts', userId)
  const { safe, conflicted } = splitByConflict(accounts, cloudTs, resolutions)

  const rows: Row[] = safe.map(a => ({
    user_id: userId,
    local_id: a.id,
    name: a.name,
    type: a.type,
    balance: safeNum(a.balance),
    institution: a.institution ?? '',
    starting_balance: a.startingBalance ?? null,
    last_reconciled_at: a.lastReconciledAt ?? null,
    created_at: a.createdAt ?? nowIso(),
    updated_at: a.updatedAt ?? nowIso(),
  }))

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'accounts', rows)

  // Build conflict records (fetch cloud row for display)
  const conflictRecords: ConflictRecord[] = await Promise.all(
    conflicted.map(async a => {
      const cloud = await fetchCloudRow(supabase, 'accounts', userId, a.id)
      return {
        entity,
        localId: a.id,
        displayName: a.name,
        localUpdatedAt: a.updatedAt ?? null,
        cloudUpdatedAt: cloudTs[a.id] ?? null,
        fields: [
          { label: 'Name', localValue: a.name, cloudValue: String(cloud?.name ?? '—') },
          { label: 'Balance', localValue: fmtCurrency(a.balance), cloudValue: fmtCurrency(cloud?.balance) },
          { label: 'Type', localValue: a.type, cloudValue: String(cloud?.type ?? '—') },
        ],
      } satisfies ConflictRecord
    }),
  )

  return {
    result: { entity, attempted: accounts.length, synced, failed, skipped: conflicted.length, errorDetail },
    conflicts: conflictRecords,
  }
}

export async function persistCategoriesToCloud(
  supabase: Client,
  userId: string,
  categories: Category[],
  resolutions: ConflictResolutions = {},
): Promise<{ result: CloudPersistResult; conflicts: ConflictRecord[] }> {
  const entity: CloudPersistEntity = 'categories'
  const cloudTs = await fetchCloudTimestamps(supabase, 'categories', userId)
  const { safe, conflicted } = splitByConflict(categories, cloudTs, resolutions)

  const rows: Row[] = safe.map(c => ({
    user_id: userId,
    local_id: c.id,
    name: c.name,
    type: c.type,
    amount: safeNum(c.amount),
    created_at: nowIso(),
    updated_at: c.updatedAt ?? nowIso(),
  }))

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'categories', rows)

  const conflictRecords: ConflictRecord[] = await Promise.all(
    conflicted.map(async c => {
      const cloud = await fetchCloudRow(supabase, 'categories', userId, c.id)
      return {
        entity,
        localId: c.id,
        displayName: c.name,
        localUpdatedAt: c.updatedAt ?? null,
        cloudUpdatedAt: cloudTs[c.id] ?? null,
        fields: [
          { label: 'Name', localValue: c.name, cloudValue: String(cloud?.name ?? '—') },
          { label: 'Amount', localValue: fmtCurrency(c.amount), cloudValue: fmtCurrency(cloud?.amount) },
          { label: 'Type', localValue: c.type, cloudValue: String(cloud?.type ?? '—') },
        ],
      } satisfies ConflictRecord
    }),
  )

  return {
    result: { entity, attempted: categories.length, synced, failed, skipped: conflicted.length, errorDetail },
    conflicts: conflictRecords,
  }
}

export async function persistTransactionRulesToCloud(
  supabase: Client,
  userId: string,
  rules: TransactionRule[],
  resolutions: ConflictResolutions = {},
): Promise<{ result: CloudPersistResult; conflicts: ConflictRecord[] }> {
  const entity: CloudPersistEntity = 'transaction_rules'
  const cloudTs = await fetchCloudTimestamps(supabase, 'transaction_rules', userId)
  const { safe, conflicted } = splitByConflict(rules, cloudTs, resolutions)

  const categoryIds = await resolveCloudIds(supabase, 'categories', userId, safe.map(r => r.categoryId))

  const rows: Row[] = safe.map(r => ({
    user_id: userId,
    local_id: r.id,
    name: r.name,
    match_text: r.matchText,
    match_field: r.matchField,
    category_id: categoryIds[r.categoryId] ?? null,
    type: r.type ?? null,
    created_at: r.createdAt ?? nowIso(),
    updated_at: r.updatedAt ?? nowIso(),
  }))

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'transaction_rules', rows)

  const conflictRecords: ConflictRecord[] = await Promise.all(
    conflicted.map(async r => {
      const cloud = await fetchCloudRow(supabase, 'transaction_rules', userId, r.id)
      return {
        entity,
        localId: r.id,
        displayName: r.name,
        localUpdatedAt: r.updatedAt ?? null,
        cloudUpdatedAt: cloudTs[r.id] ?? null,
        fields: [
          { label: 'Name', localValue: r.name, cloudValue: String(cloud?.name ?? '—') },
          { label: 'Match text', localValue: r.matchText, cloudValue: String(cloud?.match_text ?? '—') },
          { label: 'Match field', localValue: r.matchField, cloudValue: String(cloud?.match_field ?? '—') },
        ],
      } satisfies ConflictRecord
    }),
  )

  return {
    result: { entity, attempted: rules.length, synced, failed, skipped: conflicted.length, errorDetail },
    conflicts: conflictRecords,
  }
}

export async function persistSavingsGoalsToCloud(
  supabase: Client,
  userId: string,
  targets: Target[],
  resolutions: ConflictResolutions = {},
): Promise<{ result: CloudPersistResult; conflicts: ConflictRecord[] }> {
  const entity: CloudPersistEntity = 'savings_goals'
  const cloudTs = await fetchCloudTimestamps(supabase, 'savings_goals', userId)
  const { safe, conflicted } = splitByConflict(targets, cloudTs, resolutions)

  const rows: Row[] = safe.map(t => ({
    user_id: userId,
    local_id: t.id,
    name: t.name,
    goal_amount: safeNum(t.goalAmount),
    current_saved: safeNum(t.currentSaved),
    start_date: t.startDate || null,
    deadline: t.deadline || null,
    type: t.type ?? 'savings',
    completed: Boolean(t.completed),
    paused: Boolean(t.paused),
    created_at: t.createdAt ?? nowIso(),
    updated_at: t.updatedAt ?? nowIso(),
  }))

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'savings_goals', rows)

  const conflictRecords: ConflictRecord[] = await Promise.all(
    conflicted.map(async t => {
      const cloud = await fetchCloudRow(supabase, 'savings_goals', userId, t.id)
      return {
        entity,
        localId: t.id,
        displayName: t.name,
        localUpdatedAt: t.updatedAt ?? null,
        cloudUpdatedAt: cloudTs[t.id] ?? null,
        fields: [
          { label: 'Name', localValue: t.name, cloudValue: String(cloud?.name ?? '—') },
          { label: 'Goal', localValue: fmtCurrency(t.goalAmount), cloudValue: fmtCurrency(cloud?.goal_amount) },
          { label: 'Saved', localValue: fmtCurrency(t.currentSaved), cloudValue: fmtCurrency(cloud?.current_saved) },
        ],
      } satisfies ConflictRecord
    }),
  )

  return {
    result: { entity, attempted: targets.length, synced, failed, skipped: conflicted.length, errorDetail },
    conflicts: conflictRecords,
  }
}

export async function persistSavingsGoalContributionsToCloud(
  supabase: Client,
  userId: string,
  targets: Target[],
): Promise<CloudPersistResult> {
  const entity: CloudPersistEntity = 'savings_goal_contributions'
  const goalIds = await resolveCloudIds(supabase, 'savings_goals', userId, targets.map(t => t.id))

  const allContributions: Array<Contribution & { goalLocalId: string }> = targets.flatMap(t =>
    (t.contributions ?? []).map(c => ({ ...c, goalLocalId: t.id })),
  )

  if (!allContributions.length) {
    return { entity, attempted: 0, synced: 0, failed: 0, skipped: 0 }
  }

  const rows: Row[] = allContributions
    .filter(c => goalIds[c.goalLocalId])
    .map(c => ({
      user_id: userId,
      local_id: c.id,
      goal_id: goalIds[c.goalLocalId],
      date: c.date,
      amount: safeNum(c.amount),
      note: c.note ?? null,
      created_at: nowIso(),
      updated_at: nowIso(),
    }))

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'savings_goal_contributions', rows)
  const skipped = allContributions.length - rows.length

  return { entity, attempted: allContributions.length, synced, failed, skipped, errorDetail }
}

export async function persistSavingsGoalSetsToCloud(
  supabase: Client,
  userId: string,
  savedTargetSets: SavedTargetSet[],
): Promise<CloudPersistResult> {
  const entity: CloudPersistEntity = 'savings_goal_sets'
  const rawRows: Row[] = savedTargetSets.map(s => ({
    user_id: userId,
    local_id: `${userId}-goalset-${encodeURIComponent(s.name)}`,
    name: s.name,
    targets_snapshot: s.targets ?? [],
    saved_at: s.savedAt ?? nowIso(),
    updated_at: s.savedAt ?? nowIso(),
  }))
  const rows = deduplicateByLocalId(rawRows)

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'savings_goal_sets', rows)
  return { entity, attempted: savedTargetSets.length, synced, failed, skipped: 0, errorDetail }
}

export async function persistScenariosToCloud(
  supabase: Client,
  userId: string,
  savedScenarios: SavedScenarioSet[],
): Promise<CloudPersistResult> {
  const entity: CloudPersistEntity = 'scenarios'
  const rawRows: Row[] = savedScenarios.map(s => ({
    user_id: userId,
    local_id: `${userId}-scenario-${encodeURIComponent(s.name)}`,
    name: s.name,
    period: s.period,
    scenario_values: s.scenarios ?? {},
    saved_at: s.savedAt ?? nowIso(),
    updated_at: s.savedAt ?? nowIso(),
  }))
  const rows = deduplicateByLocalId(rawRows)

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'scenarios', rows)
  return { entity, attempted: savedScenarios.length, synced, failed, skipped: 0, errorDetail }
}

export async function persistSavedBudgetsToCloud(
  supabase: Client,
  userId: string,
  savedBudgets: SavedBudget[],
): Promise<CloudPersistResult> {
  const entity: CloudPersistEntity = 'saved_budgets'
  const rawRows: Row[] = savedBudgets.map(b => ({
    user_id: userId,
    local_id: `${userId}-budget-${encodeURIComponent(b.name)}`,
    name: b.name,
    categories_snapshot: b.categories ?? [],
    saved_at: b.savedAt ?? nowIso(),
    updated_at: b.savedAt ?? nowIso(),
  }))
  const rows = deduplicateByLocalId(rawRows)

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'saved_budgets', rows)
  return { entity, attempted: savedBudgets.length, synced, failed, skipped: 0, errorDetail }
}

/**
 * Persists budget actuals as a single JSONB row per user.
 * The actuals are tagged with a snapshot timestamp so future restores
 * can show when the data was captured.
 */
export async function persistBudgetActualsToCloud(
  supabase: Client,
  userId: string,
  actuals: Record<string, string>,
  period?: string,
  periodStart?: string,
): Promise<CloudPersistResult> {
  const entity: CloudPersistEntity = 'budget_actuals'
  if (!Object.keys(actuals).length) {
    return { entity, attempted: 0, synced: 0, failed: 0, skipped: 0 }
  }

  const periodKey = [period ?? 'unknown-period', periodStart ?? 'unknown-start'].join(':')

  // One row per user + period. This prevents May actuals from overwriting June actuals.
  const rows: Row[] = [{
    user_id: userId,
    local_id: periodKey,
    period_key: periodKey,
    period: period ?? null,
    period_start: periodStart ?? null,
    actuals,
    updated_at: nowIso(),
    deleted_at: null,
  }]

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'budget_actuals', rows)
  return { entity, attempted: 1, synced, failed, skipped: 0, errorDetail }
}

export async function persistTakeHomeSettingsToCloud(
  supabase: Client,
  userId: string,
  settings: TakeHomeSettings | null | undefined,
): Promise<CloudPersistResult> {
  const entity: CloudPersistEntity = 'take_home_settings'
  if (!settings) return { entity, attempted: 0, synced: 0, failed: 0, skipped: 0 }

  const rows: Row[] = [{
    user_id: userId,
    local_id: userId,
    mode: settings.mode,
    simple_rate: safeNum(settings.simpleRate, 0.8243),
    manual_monthly_net: safeNum(settings.manualMonthlyNet, 0),
    updated_at: settings.updatedAt ?? nowIso(),
    deleted_at: null,
  }]

  const { synced, failed } = await batchUpsert(supabase, 'take_home_settings', rows)
  return { entity, attempted: 1, synced, failed, skipped: 0 }
}

// ─── Import batch sync ─────────────────────────────────────────────────────────

export async function persistImportBatchesToCloud(
  supabase: Client,
  userId: string,
  importBatches: ImportBatch[],
): Promise<CloudPersistResult> {
  const entity: CloudPersistEntity = 'import_batches'
  if (!importBatches.length) return { entity, attempted: 0, synced: 0, failed: 0, skipped: 0 }

  // Import batches are append-only — no conflict detection needed.
  // Once a batch is created it never changes.
  const rows: Row[] = importBatches.map(b => ({
    user_id: userId,
    local_id: b.id,
    account_name: b.accountName,
    import_month: b.importMonth,
    imported_count: b.importedCount,
    skipped_count: b.skippedCount,
    skipped_duplicate_count: b.skippedDuplicateCount ?? 0,
    failed_row_count: b.failedRowCount ?? 0,
    import_source: b.importSource ?? b.source ?? 'csv',
    preset: b.preset ?? 'auto',
    imported_at: b.importedAt ?? b.createdAt ?? nowIso(),
    created_at: b.createdAt ?? nowIso(),
  }))

  // Resolve account_id FK separately since accounts must be synced first
  const accountIds = await resolveCloudIds(supabase, 'accounts', userId,
    importBatches.map(b => b.accountId).filter(Boolean))
  rows.forEach((row, i) => {
    row.account_id = accountIds[importBatches[i].accountId] ?? null
  })

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'import_batches', rows)
  return { entity, attempted: importBatches.length, synced, failed, skipped: 0, errorDetail }
}

// ─── Transaction sync ──────────────────────────────────────────────────────────

export async function persistTransactionsToCloud(
  supabase: Client,
  userId: string,
  transactions: Transaction[],
  resolutions: ConflictResolutions = {},
): Promise<{ result: CloudPersistResult; conflicts: ConflictRecord[] }> {
  const entity: CloudPersistEntity = 'transactions'
  if (!transactions.length) {
    return { result: { entity, attempted: 0, synced: 0, failed: 0, skipped: 0 }, conflicts: [] }
  }

  const cloudTs = await fetchCloudTimestamps(supabase, 'transactions', userId)
  const { safe, conflicted } = splitByConflict(transactions, cloudTs, resolutions)

  // Resolve all FKs in three parallel batch selects
  const [accountIds, categoryIds, batchIds] = await Promise.all([
    resolveCloudIds(supabase, 'accounts', userId, [
      ...safe.map(tx => tx.accountId),
      ...safe.map(tx => tx.toAccountId ?? ''),
    ]),
    resolveCloudIds(supabase, 'categories', userId, safe.map(tx => tx.categoryId ?? '')),
    resolveCloudIds(supabase, 'import_batches', userId, safe.map(tx => tx.importBatchId ?? tx.batchId ?? '')),
  ])

  const rows: Row[] = safe.map(tx => ({
    user_id: userId,
    local_id: tx.id,
    account_id: accountIds[tx.accountId] ?? null,
    to_account_id: tx.toAccountId ? (accountIds[tx.toAccountId] ?? null) : null,
    category_id: tx.categoryId ? (categoryIds[tx.categoryId] ?? null) : null,
    import_batch_id: (tx.importBatchId ?? tx.batchId)
      ? (batchIds[tx.importBatchId ?? tx.batchId ?? ''] ?? null)
      : null,
    date: tx.date,
    merchant: tx.merchant,
    amount: safeNum(tx.amount),
    type: tx.type,
    notes: tx.notes ?? null,
    source: tx.source ?? tx.importSource ?? 'manual',
    review_status: tx.reviewStatus ?? null,
    applied_by_rule: Boolean(tx.appliedByRule),
    imported_category_hint: tx.importedCategoryHint ?? null,
    created_at: tx.createdAt ?? nowIso(),
    updated_at: tx.updatedAt ?? tx.createdAt ?? nowIso(),
  }))

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'transactions', rows)

  const conflictRecords: ConflictRecord[] = await Promise.all(
    conflicted.map(async tx => {
      const cloud = await fetchCloudRow(supabase, 'transactions', userId, tx.id)
      return {
        entity,
        localId: tx.id,
        displayName: `${tx.merchant} — ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(tx.amount)}`,
        localUpdatedAt: tx.updatedAt ?? null,
        cloudUpdatedAt: cloudTs[tx.id] ?? null,
        fields: [
          { label: 'Date',     localValue: tx.date,                           cloudValue: String(cloud?.date ?? '—') },
          { label: 'Merchant', localValue: tx.merchant,                       cloudValue: String(cloud?.merchant ?? '—') },
          { label: 'Amount',   localValue: fmtCurrency(tx.amount),            cloudValue: fmtCurrency(cloud?.amount) },
          { label: 'Type',     localValue: tx.type,                           cloudValue: String(cloud?.type ?? '—') },
        ],
      } satisfies ConflictRecord
    }),
  )

  return {
    result: { entity, attempted: transactions.length, synced, failed, skipped: conflicted.length, errorDetail },
    conflicts: conflictRecords,
  }
}

// ─── Delete propagation ────────────────────────────────────────────────────────

export type CloudPendingDelete = {
  table: string
  localId: string
  deletedAt: string
}

/**
 * Marks cloud records as soft-deleted for any locally deleted records.
 * Sets deleted_at on the cloud row; the row is never physically removed.
 */
export async function syncPendingDeletes(
  supabase: Client,
  userId: string,
  pendingDeletes: CloudPendingDelete[],
): Promise<{ synced: CloudPendingDelete[]; failed: CloudPendingDelete[] }> {
  if (!pendingDeletes.length) return { synced: [], failed: [] }

  const synced: CloudPendingDelete[] = []
  const failed: CloudPendingDelete[] = []

  // Group by table so we can batch per table
  const byTable = pendingDeletes.reduce<Record<string, CloudPendingDelete[]>>((map, d) => {
    if (!map[d.table]) map[d.table] = []
    map[d.table].push(d)
    return map
  }, {})

  for (const [table, deletes] of Object.entries(byTable)) {
    const localIds = deletes.map(d => d.localId)
    try {
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('user_id', userId)
        .in('local_id', localIds)
        .is('deleted_at', null)

      if (error) {
        failed.push(...deletes)
      } else {
        synced.push(...deletes)
      }
    } catch {
      failed.push(...deletes)
    }
  }

  return { synced, failed }
}

// ─── Monthly reviews sync ──────────────────────────────────────────────────────

/**
 * Syncs monthly review notes and reviewed status to the monthly_reviews table.
 * Uses (user_id, month) as the conflict key — one row per user per calendar month.
 */
export async function persistMonthlyReviewsToCloud(
  supabase: Client,
  userId: string,
  monthlyNotes: Record<string, string>,
  reviewedMonths: Record<string, string>,
): Promise<CloudPersistResult> {
  const entity: CloudPersistEntity = 'monthly_reviews'

  const allMonths = Array.from(new Set([
    ...Object.keys(monthlyNotes),
    ...Object.keys(reviewedMonths),
  ]))

  if (!allMonths.length) return { entity, attempted: 0, synced: 0, failed: 0, skipped: 0 }

  const rows = allMonths.map(month => ({
    user_id: userId,
    month,
    notes: monthlyNotes[month] ?? '',
    reviewed_at: reviewedMonths[month] ? new Date(reviewedMonths[month]).toISOString() : null,
    status: reviewedMonths[month] ? 'reviewed' : 'draft',
    updated_at: new Date().toISOString(),
  }))

  try {
    const { error } = await supabase
      .from('monthly_reviews')
      .upsert(rows, { onConflict: 'user_id,month' })

    if (error) return { entity, attempted: rows.length, synced: 0, failed: rows.length, skipped: 0 }
    return { entity, attempted: rows.length, synced: rows.length, failed: 0, skipped: 0 }
  } catch {
    return { entity, attempted: rows.length, synced: 0, failed: rows.length, skipped: 0 }
  }
}

// ─── Scenario notes sync ───────────────────────────────────────────────────────

export async function persistScenarioNotesToCloud(
  supabase: Client,
  userId: string,
  notes: Record<string, string>,
): Promise<CloudPersistResult> {
  const entity: CloudPersistEntity = 'scenario_notes'
  if (!Object.keys(notes).length) return { entity, attempted: 0, synced: 0, failed: 0, skipped: 0 }

  const rows: Row[] = [{
    user_id: userId,
    local_id: userId,           // one row per user
    notes_blob: notes,
    updated_at: nowIso(),
  }]

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'scenario_notes', rows)
  return { entity, attempted: 1, synced, failed, skipped: 0, errorDetail }
}

// ─── Category memory sync ──────────────────────────────────────────────────────

export async function persistCategoryMemoryToCloud(
  supabase: Client,
  userId: string,
  memory: Record<string, string>,
): Promise<CloudPersistResult> {
  const entity: CloudPersistEntity = 'category_memory'
  if (!Object.keys(memory).length) return { entity, attempted: 0, synced: 0, failed: 0, skipped: 0 }

  const rows: Row[] = [{
    user_id: userId,
    local_id: userId,           // one row per user
    memory_blob: memory,
    updated_at: nowIso(),
  }]

  const { synced, failed, errorDetail } = await batchUpsert(supabase, 'category_memory', rows)
  return { entity, attempted: 1, synced, failed, skipped: 0, errorDetail }
}

// ─── Core sync orchestrator ────────────────────────────────────────────────────

export async function persistCoreDataToCloud(params: {
  supabase: Client
  userId: string
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  rules: TransactionRule[]
  targets: Target[]
  savedTargetSets: SavedTargetSet[]
  savedScenarios: SavedScenarioSet[]
  savedBudgets: SavedBudget[]
  actuals: Record<string, string>
  takeHomeSettings?: TakeHomeSettings | null
  actualsperiod?: string
  actualsPeriodStart?: string
  importBatches: ImportBatch[]
  monthlyNotes: Record<string, string>
  reviewedMonths: Record<string, string>
  pendingDeletes: CloudPendingDelete[]
  scenarioNotes?: Record<string, string>
  categoryMemory?: Record<string, string>
  resolutions?: ConflictResolutions
}): Promise<CloudPersistSummary & { syncedDeletes: CloudPendingDelete[] }> {
  const res = params.resolutions ?? {}
  const allConflicts: ConflictRecord[] = []
  const results: CloudPersistResult[] = []

  // ── Stage 0: Delete propagation ──
  const { synced: syncedDeletes } = await syncPendingDeletes(
    params.supabase, params.userId, params.pendingDeletes,
  )

  // ── Stage 1: Parent entities (FK targets for transactions) ──
  const acct  = await persistAccountsToCloud(params.supabase, params.userId, params.accounts, res)
  results.push(acct.result); allConflicts.push(...acct.conflicts)

  const cat   = await persistCategoriesToCloud(params.supabase, params.userId, params.categories, res)
  results.push(cat.result); allConflicts.push(...cat.conflicts)

  const goals = await persistSavingsGoalsToCloud(params.supabase, params.userId, params.targets, res)
  results.push(goals.result); allConflicts.push(...goals.conflicts)

  // Import batches must be synced before transactions (FK dependency)
  results.push(await persistImportBatchesToCloud(params.supabase, params.userId, params.importBatches))

  // ── Stage 2: Child/linked entities ──
  const rules = await persistTransactionRulesToCloud(params.supabase, params.userId, params.rules, res)
  results.push(rules.result); allConflicts.push(...rules.conflicts)

  const txns  = await persistTransactionsToCloud(params.supabase, params.userId, params.transactions, res)
  results.push(txns.result); allConflicts.push(...txns.conflicts)

  results.push(await persistSavingsGoalContributionsToCloud(params.supabase, params.userId, params.targets))
  results.push(await persistSavingsGoalSetsToCloud(params.supabase, params.userId, params.savedTargetSets))
  results.push(await persistScenariosToCloud(params.supabase, params.userId, params.savedScenarios))
  results.push(await persistSavedBudgetsToCloud(params.supabase, params.userId, params.savedBudgets))
  results.push(await persistBudgetActualsToCloud(
    params.supabase, params.userId, params.actuals,
    params.actualsperiod, params.actualsPeriodStart,
  ))
  results.push(await persistTakeHomeSettingsToCloud(
    params.supabase, params.userId, params.takeHomeSettings,
  ))
  results.push(await persistMonthlyReviewsToCloud(
    params.supabase, params.userId, params.monthlyNotes, params.reviewedMonths,
  ))
  if (params.scenarioNotes && Object.keys(params.scenarioNotes).length > 0) {
    results.push(await persistScenarioNotesToCloud(params.supabase, params.userId, params.scenarioNotes))
  }
  if (params.categoryMemory && Object.keys(params.categoryMemory).length > 0) {
    results.push(await persistCategoryMemoryToCloud(params.supabase, params.userId, params.categoryMemory))
  }

  return {
    attempted: results.reduce((s, r) => s + r.attempted, 0),
    synced:    results.reduce((s, r) => s + r.synced, 0),
    failed:    results.reduce((s, r) => s + r.failed, 0),
    skipped:   results.reduce((s, r) => s + r.skipped, 0),
    conflicts: allConflicts,
    results,
    lastSyncedAt: nowIso(),
    syncedDeletes,
  }
}
