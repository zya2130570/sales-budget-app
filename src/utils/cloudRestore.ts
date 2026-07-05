/**
 * cloudRestore.ts — V12.7
 *
 * Fetches all cloud data for the authenticated user and converts it back
 * to local format (camelCase, local UUIDs as IDs) ready to write to localStorage.
 *
 * FK resolution: every cloud record stores the original client UUID in local_id.
 * Parent records are fetched first so we can build cloudId → localId maps
 * before resolving child FKs (e.g. transactions → account_id).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from './cloudPersistence'
import type {
  Account,
  AccountType,
  Category,
  CategoryType,
  Contribution,
  ImportBatch,
  ImportPreset,
  SavedBudget,
  SavedScenarioSet,
  SavedTargetSet,
  Target,
  Transaction,
  TransactionReviewStatus,
  TransactionRule,
  TransactionSource,
  TransactionType,
  TakeHomeSettings,
} from '../types'

export type CloudRestoreSummary = {
  accounts: number
  categories: number
  transactions: number
  importBatches: number
  transactionRules: number
  savingsGoals: number
  contributions: number
  scenarios: number
  savedTargetSets: number
  savedBudgets: number
  actualsRestored: boolean
  takeHomeSettingsRestored: boolean
  errors: string[]
}

type Row = Record<string, unknown>
type IdMap = Record<string, string>  // cloudId → localId

function str(v: unknown, fallback = ''): string {
  return v != null ? String(v) : fallback
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function bool(v: unknown): boolean {
  return Boolean(v)
}

/** Build a cloudId → localId reverse map from fetched rows */
function buildIdMap(rows: Row[]): IdMap {
  return rows.reduce<IdMap>((map, row) => {
    if (typeof row.id === 'string' && typeof row.local_id === 'string') {
      map[row.id] = row.local_id
    }
    return map
  }, {})
}

async function fetchTable(
  supabase: SupabaseClient,
  table: string,
  userId: string,
): Promise<{ rows: Row[]; error: string | null }> {
  try {
    const tablesWithSoftDelete = [
      'accounts', 'categories', 'transactions', 'transaction_rules',
      'import_batches', 'savings_goals', 'savings_goal_contributions',
      'savings_goal_sets', 'scenarios', 'saved_budgets', 'budget_actuals',
      'monthly_reviews', 'take_home_settings',
    ]
    const softDelete = tablesWithSoftDelete.includes(table)
    // Paged read: PostgREST silently truncates unranged SELECTs at 1000 rows.
    // Filters and a stable order are re-applied per page (builders are single-use).
    return await fetchAllRows<Row>((from, to) => {
      let q = supabase.from(table).select('*').eq('user_id', userId)
      if (softDelete) q = q.is('deleted_at', null)
      return q.order('id', { ascending: true }).range(from, to)
    })
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : `Failed to fetch ${table}` }
  }
}

// ── Converters: cloud row → local type ────────────────────────────────────────

function toAccount(row: Row): Account {
  return {
    id: str(row.local_id),
    name: str(row.name),
    type: str(row.type) as AccountType,
    balance: num(row.balance),
    institution: str(row.institution),
    createdAt: str(row.created_at, new Date().toISOString()),
    updatedAt: row.updated_at ? str(row.updated_at) : undefined,
    startingBalance: row.starting_balance != null ? num(row.starting_balance) : undefined,
    lastReconciledAt: row.last_reconciled_at ? str(row.last_reconciled_at) : undefined,
  }
}

function toCategory(row: Row): Category {
  return {
    id: str(row.local_id),
    name: str(row.name),
    type: str(row.type) as CategoryType,
    amount: num(row.amount),
    updatedAt: row.updated_at ? str(row.updated_at) : undefined,
  }
}

function toTransaction(row: Row, accountMap: IdMap, categoryMap: IdMap, batchMap: IdMap): Transaction {
  return {
    id: str(row.local_id),
    date: str(row.date),
    accountId: row.account_id ? (accountMap[str(row.account_id)] ?? str(row.account_id)) : '',
    merchant: str(row.merchant),
    amount: num(row.amount),
    type: str(row.type) as TransactionType,
    categoryId: row.category_id ? (categoryMap[str(row.category_id)] ?? undefined) : undefined,
    toAccountId: row.to_account_id ? (accountMap[str(row.to_account_id)] ?? undefined) : undefined,
    importBatchId: row.import_batch_id ? (batchMap[str(row.import_batch_id)] ?? undefined) : undefined,
    batchId: row.import_batch_id ? (batchMap[str(row.import_batch_id)] ?? undefined) : undefined,
    notes: row.notes ? str(row.notes) : undefined,
    source: (row.source as TransactionSource) ?? 'manual',
    reviewStatus: row.review_status ? (str(row.review_status) as TransactionReviewStatus) : undefined,
    appliedByRule: row.applied_by_rule ? str(row.applied_by_rule) : undefined,
    importedCategoryHint: row.imported_category_hint ? str(row.imported_category_hint) : undefined,
    createdAt: str(row.created_at, new Date().toISOString()),
    updatedAt: row.updated_at ? str(row.updated_at) : undefined,
  }
}

function toImportBatch(row: Row, accountMap: IdMap): ImportBatch {
  let rowsSnapshot: ImportBatch['rowsSnapshot']
  if (row.rows_snapshot) {
    try {
      const parsed = typeof row.rows_snapshot === 'string'
        ? JSON.parse(row.rows_snapshot)
        : row.rows_snapshot
      if (Array.isArray(parsed)) rowsSnapshot = parsed
    } catch { /* ignore malformed snapshot */ }
  }
  return {
    id: str(row.local_id),
    accountId: row.account_id ? (accountMap[str(row.account_id)] ?? str(row.account_id)) : '',
    accountName: str(row.account_name),
    importMonth: str(row.import_month),
    importedCount: num(row.imported_count),
    skippedCount: num(row.skipped_count),
    skippedDuplicateCount: num(row.skipped_duplicate_count),
    failedRowCount: num(row.failed_row_count),
    importSource: str(row.import_source, 'csv'),
    source: str(row.import_source, 'csv') as TransactionSource,
    preset: str(row.preset, 'auto') as ImportPreset,
    createdAt: str(row.created_at, new Date().toISOString()),
    importedAt: row.imported_at ? str(row.imported_at) : undefined,
    rowsSnapshot,
  }
}

function toTransactionRule(row: Row, categoryMap: IdMap): TransactionRule {
  return {
    id: str(row.local_id),
    name: str(row.name),
    matchText: str(row.match_text),
    matchField: (str(row.match_field) as 'merchant' | 'notes') ?? 'merchant',
    categoryId: row.category_id ? (categoryMap[str(row.category_id)] ?? str(row.category_id)) : '',
    type: row.type ? (str(row.type) as TransactionType) : undefined,
    createdAt: str(row.created_at, new Date().toISOString()),
    updatedAt: row.updated_at ? str(row.updated_at) : undefined,
  }
}

function toContribution(row: Row): Contribution {
  return {
    id: str(row.local_id),
    date: str(row.date),
    amount: num(row.amount),
    note: str(row.note),
  }
}

function toTarget(row: Row, contributions: Contribution[]): Target {
  return {
    id: str(row.local_id),
    name: str(row.name),
    goalAmount: num(row.goal_amount),
    currentSaved: num(row.current_saved),
    startDate: row.start_date ? str(row.start_date) : undefined,
    deadline: str(row.deadline),
    type: 'savings',
    completed: bool(row.completed),
    paused: bool(row.paused),
    createdAt: row.created_at ? str(row.created_at) : undefined,
    updatedAt: row.updated_at ? str(row.updated_at) : undefined,
    contributions,
  }
}

// ── Main restore function ──────────────────────────────────────────────────────

export type CloudRestoreData = {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  importBatches: ImportBatch[]
  rules: TransactionRule[]
  targets: Target[]
  savedTargetSets: SavedTargetSet[]
  savedScenarios: SavedScenarioSet[]
  savedBudgets: SavedBudget[]
  actuals: Record<string, string> | null
  actualsByPeriod: Record<string, Record<string, string>>
  takeHomeSettings: TakeHomeSettings | null
  monthlyNotes: Record<string, string>
  reviewedMonths: Record<string, string>
  scenarioNotes: Record<string, string>
  categoryMemory: Record<string, string>
  summary: CloudRestoreSummary
}

export async function fetchCloudDataForRestore(
  supabase: SupabaseClient,
  userId: string,
): Promise<CloudRestoreData> {
  const errors: string[] = []

  // ── Stage 1: Fetch parent entities in parallel ──
  const [accountsFetch, categoriesFetch, goalsFetch, batchesFetch] = await Promise.all([
    fetchTable(supabase, 'accounts', userId),
    fetchTable(supabase, 'categories', userId),
    fetchTable(supabase, 'savings_goals', userId),
    fetchTable(supabase, 'import_batches', userId),
  ])

  if (accountsFetch.error)    errors.push(`accounts: ${accountsFetch.error}`)
  if (categoriesFetch.error)  errors.push(`categories: ${categoriesFetch.error}`)
  if (goalsFetch.error)       errors.push(`savings_goals: ${goalsFetch.error}`)
  if (batchesFetch.error)     errors.push(`import_batches: ${batchesFetch.error}`)

  // Build FK reverse maps
  const accountMap  = buildIdMap(accountsFetch.rows)
  const categoryMap = buildIdMap(categoriesFetch.rows)
  const goalMap     = buildIdMap(goalsFetch.rows)
  const batchMap    = buildIdMap(batchesFetch.rows)

  // ── Stage 2: Fetch child entities in parallel ──
  const [txnFetch, rulesFetch, contribFetch, setsFetch, scenariosFetch, budgetsFetch, actualsFetch, reviewsFetch, takeHomeFetch, scenarioNotesFetch, categoryMemoryFetch] = await Promise.all([
    fetchTable(supabase, 'transactions', userId),
    fetchTable(supabase, 'transaction_rules', userId),
    fetchTable(supabase, 'savings_goal_contributions', userId),
    fetchTable(supabase, 'savings_goal_sets', userId),
    fetchTable(supabase, 'scenarios', userId),
    fetchTable(supabase, 'saved_budgets', userId),
    (async () => {
      try {
        const { rows } = await fetchAllRows<{ period_key: string | null; actuals: Record<string, string>; updated_at?: string }>((from, to) =>
          supabase.from('budget_actuals').select('period_key, actuals, updated_at').eq('user_id', userId).is('deleted_at', null).order('period_key', { ascending: true }).range(from, to))
        return rows
      } catch { return [] }
    })(),
    (async () => {
      try {
        const { rows } = await fetchAllRows<{ month: string; notes: string; reviewed_at: string | null }>((from, to) =>
          supabase.from('monthly_reviews').select('month, notes, reviewed_at').eq('user_id', userId).is('deleted_at', null).order('month', { ascending: true }).range(from, to))
        return rows
      } catch { return [] }
    })(),
    (async () => {
      try {
        const { data } = await supabase.from('take_home_settings').select('*').eq('user_id', userId).is('deleted_at', null).maybeSingle()
        return data as Record<string, unknown> | null
      } catch { return null }
    })(),
    (async () => {
      try {
        const { data } = await supabase.from('scenario_notes').select('notes_blob').eq('user_id', userId).maybeSingle()
        return (data as { notes_blob: Record<string, string> } | null)?.notes_blob ?? null
      } catch { return null }
    })(),
    (async () => {
      try {
        const { data } = await supabase.from('category_memory').select('memory_blob').eq('user_id', userId).maybeSingle()
        return (data as { memory_blob: Record<string, string> } | null)?.memory_blob ?? null
      } catch { return null }
    })(),
  ])

  if (txnFetch.error)       errors.push(`transactions: ${txnFetch.error}`)
  if (rulesFetch.error)     errors.push(`transaction_rules: ${rulesFetch.error}`)
  if (contribFetch.error)   errors.push(`contributions: ${contribFetch.error}`)

  // ── Stage 3: Convert ──
  const accounts    = accountsFetch.rows.map(toAccount)
  const categories  = categoriesFetch.rows.map(toCategory)
  const importBatches = batchesFetch.rows.map(r => toImportBatch(r, accountMap))
  const rules       = rulesFetch.rows.map(r => toTransactionRule(r, categoryMap))
  const transactions = txnFetch.rows.map(r => toTransaction(r, accountMap, categoryMap, batchMap))

  // Group contributions by goal local_id
  const contribsByGoal = contribFetch.rows.reduce<Record<string, Contribution[]>>((map, c) => {
    const goalLocalId = c.goal_id ? (goalMap[str(c.goal_id)] ?? null) : null
    if (!goalLocalId) return map
    if (!map[goalLocalId]) map[goalLocalId] = []
    map[goalLocalId].push(toContribution(c))
    return map
  }, {})

  const targets = goalsFetch.rows.map(r =>
    toTarget(r, contribsByGoal[str(r.local_id)] ?? []))

  const savedTargetSets: SavedTargetSet[] = setsFetch.rows.map(r => ({
    name: str(r.name),
    savedAt: str(r.saved_at, new Date().toISOString()),
    targets: Array.isArray(r.targets_snapshot) ? (r.targets_snapshot as Target[]) : [],
  }))

  const savedScenarios: SavedScenarioSet[] = scenariosFetch.rows.map(r => ({
    name: str(r.name),
    period: str(r.period, 'monthly') as import('../types').Period,
    savedAt: str(r.saved_at, new Date().toISOString()),
    scenarios: (r.scenario_values ?? {}) as Record<import('../types').ScenarioName, number>,
  }))

  const savedBudgets: SavedBudget[] = budgetsFetch.rows.map(r => ({
    name: str(r.name),
    savedAt: str(r.saved_at, new Date().toISOString()),
    categories: Array.isArray(r.categories_snapshot) ? (r.categories_snapshot as Category[]) : [],
  }))

  const actualsRows = Array.isArray(actualsFetch) ? actualsFetch as Array<{ period_key: string | null; actuals: Record<string, string>; updated_at?: string }> : []
  const actualsByPeriod = actualsRows.reduce<Record<string, Record<string, string>>>((map, row) => {
    const key = row.period_key || 'legacy'
    map[key] = row.actuals ?? {}
    return map
  }, {})
  const latestActualsRow = [...actualsRows].sort((a, b) => String(b.updated_at ?? '').localeCompare(String(a.updated_at ?? '')))[0]
  const actuals = latestActualsRow?.actuals ?? null

  const takeHomeSettings: TakeHomeSettings | null = takeHomeFetch ? {
    mode: str((takeHomeFetch as Row).mode, 'simple') as TakeHomeSettings['mode'],
    simpleRate: num((takeHomeFetch as Row).simple_rate, 0.8243),
    manualMonthlyNet: num((takeHomeFetch as Row).manual_monthly_net, 0),
    baseSalary: (takeHomeFetch as Row).base_salary ? num((takeHomeFetch as Row).base_salary, 40000) : undefined,
    updatedAt: (takeHomeFetch as Row).updated_at ? str((takeHomeFetch as Row).updated_at) : undefined,
  } : null

  const monthlyNotes: Record<string, string> = {}
  const reviewedMonths: Record<string, string> = {}
  for (const row of (reviewsFetch as Array<{ month: string; notes: string; reviewed_at: string | null }>) ?? []) {
    if (row.notes) monthlyNotes[row.month] = row.notes
    if (row.reviewed_at) reviewedMonths[row.month] = row.reviewed_at
  }

  const totalContributions = Object.values(contribsByGoal).reduce((s, c) => s + c.length, 0)

  const scenarioNotes: Record<string, string> = scenarioNotesFetch ?? {}
  const categoryMemory: Record<string, string> = categoryMemoryFetch ?? {}

  return {
    accounts,
    categories,
    transactions,
    importBatches,
    rules,
    targets,
    savedTargetSets,
    savedScenarios,
    savedBudgets,
    actuals,
    actualsByPeriod,
    takeHomeSettings,
    monthlyNotes,
    reviewedMonths,
    scenarioNotes,
    categoryMemory,
    summary: {
      accounts: accounts.length,
      categories: categories.length,
      transactions: transactions.length,
      importBatches: importBatches.length,
      transactionRules: rules.length,
      savingsGoals: targets.length,
      contributions: totalContributions,
      scenarios: savedScenarios.length,
      savedTargetSets: savedTargetSets.length,
      savedBudgets: savedBudgets.length,
      actualsRestored: actuals !== null,
      takeHomeSettingsRestored: takeHomeSettings !== null,
      errors,
    },
  }
}
