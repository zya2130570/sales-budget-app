import type {
  Account,
  Category,
  Contribution,
  SavedScenarioSet,
  SavedTargetSet,
  Target,
  Transaction,
  TransactionRule,
} from '../types'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CloudPersistEntity =
  | 'accounts'
  | 'categories'
  | 'transactions'
  | 'transaction_rules'
  | 'savings_goals'
  | 'savings_goal_contributions'
  | 'savings_goal_sets'
  | 'scenarios'

export type CloudPersistResult = {
  entity: CloudPersistEntity
  attempted: number
  synced: number
  failed: number
  message?: string
}

export type CloudPersistSummary = {
  attempted: number
  synced: number
  failed: number
  results: CloudPersistResult[]
  lastSyncedAt?: string
}

export type CloudConnectionTestResult = {
  ok: boolean
  error?: string
}

type Client = SupabaseClient

type MaybeRecord = Record<string, unknown>

const nowIso = () => new Date().toISOString()

const safeNumber = (value: unknown, fallback = 0): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Performs a minimal, non-destructive read to verify Supabase connectivity
 * and that the authenticated user has permission to access their data.
 *
 * This is intentionally tiny: a single SELECT with limit(1). It does NOT
 * write, delete, or modify any data. If this returns a 403 / RLS error,
 * full sync will also fail, so we surface the error here before attempting
 * a bulk write.
 */
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
        return {
          ok: false,
          error: `Access denied (${status ?? 403}): Row-level security policy blocked the request. Check your Supabase RLS rules or API key.`,
        }
      }
      if (status === 401 || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('jwt')) {
        return {
          ok: false,
          error: `Not authenticated (${status ?? 401}): Your session may have expired. Try signing out and back in.`,
        }
      }
      return { ok: false, error: `Supabase error: ${msg}` }
    }

    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Connection test failed — unknown error.',
    }
  }
}

async function findCloudId(
  supabase: Client,
  table: string,
  userId: string,
  localId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .eq('local_id', localId)
    .maybeSingle()

  if (error || !data) return null
  return typeof data.id === 'string' ? data.id : null
}

async function upsertByLocalId(
  supabase: Client,
  table: string,
  userId: string,
  localId: string,
  payload: MaybeRecord,
): Promise<boolean> {
  try {
    const existingId = await findCloudId(supabase, table, userId, localId)
    if (existingId) {
      const { error } = await supabase
        .from(table)
        .update({ ...payload, updated_at: nowIso() })
        .eq('id', existingId)
        .eq('user_id', userId)
      return !error
    }

    const { error } = await supabase
      .from(table)
      .insert({ user_id: userId, local_id: localId, ...payload })
    return !error
  } catch {
    return false
  }
}

async function resolveCloudIdMap(
  supabase: Client,
  table: string,
  userId: string,
  localIds: string[],
): Promise<Record<string, string>> {
  const uniqueIds = Array.from(new Set(localIds.filter(Boolean)))
  if (!uniqueIds.length) return {}

  const { data, error } = await supabase
    .from(table)
    .select('id, local_id')
    .eq('user_id', userId)
    .in('local_id', uniqueIds)

  if (error || !Array.isArray(data)) return {}

  return data.reduce<Record<string, string>>((map, row) => {
    const localId = typeof row.local_id === 'string' ? row.local_id : ''
    const id = typeof row.id === 'string' ? row.id : ''
    if (localId && id) map[localId] = id
    return map
  }, {})
}

async function syncRows<T>(
  entity: CloudPersistEntity,
  rows: T[],
  syncOne: (row: T) => Promise<boolean>,
): Promise<CloudPersistResult> {
  let synced = 0
  let failed = 0

  for (const row of rows) {
    const ok = await syncOne(row)
    if (ok) synced += 1
    else failed += 1
  }

  return { entity, attempted: rows.length, synced, failed }
}

export async function persistAccountsToCloud(
  supabase: Client,
  userId: string,
  accounts: Account[],
): Promise<CloudPersistResult> {
  return syncRows('accounts', accounts, account => upsertByLocalId(supabase, 'accounts', userId, account.id, {
    name: account.name,
    type: account.type,
    balance: safeNumber(account.balance),
    institution: account.institution ?? '',
    starting_balance: account.startingBalance ?? null,
    last_reconciled_at: account.lastReconciledAt ?? null,
    created_at: account.createdAt ?? nowIso(),
  }))
}

export async function persistCategoriesToCloud(
  supabase: Client,
  userId: string,
  categories: Category[],
): Promise<CloudPersistResult> {
  return syncRows('categories', categories, category => upsertByLocalId(supabase, 'categories', userId, category.id, {
    name: category.name,
    type: category.type,
    amount: safeNumber(category.amount),
  }))
}

export async function persistTransactionsToCloud(
  supabase: Client,
  userId: string,
  transactions: Transaction[],
): Promise<CloudPersistResult> {
  const accountIds = await resolveCloudIdMap(supabase, 'accounts', userId, transactions.flatMap(tx => [tx.accountId, tx.toAccountId ?? '']))
  const categoryIds = await resolveCloudIdMap(supabase, 'categories', userId, transactions.map(tx => tx.categoryId ?? ''))
  const importBatchIds = await resolveCloudIdMap(supabase, 'import_batches', userId, transactions.map(tx => tx.importBatchId ?? tx.batchId ?? ''))

  return syncRows('transactions', transactions, tx => upsertByLocalId(supabase, 'transactions', userId, tx.id, {
    date: tx.date,
    merchant: tx.merchant,
    amount: safeNumber(tx.amount),
    type: tx.type,
    account_id: accountIds[tx.accountId] ?? null,
    to_account_id: tx.toAccountId ? (accountIds[tx.toAccountId] ?? null) : null,
    category_id: tx.categoryId ? (categoryIds[tx.categoryId] ?? null) : null,
    notes: tx.notes ?? null,
    source: tx.source ?? tx.importSource ?? 'manual',
    import_batch_id: importBatchIds[tx.importBatchId ?? tx.batchId ?? ''] ?? null,
    review_status: tx.reviewStatus ?? null,
    applied_by_rule: Boolean(tx.appliedByRule),
    imported_category_hint: tx.importedCategoryHint ?? null,
    created_at: tx.createdAt ?? nowIso(),
  }))
}

export async function persistTransactionRulesToCloud(
  supabase: Client,
  userId: string,
  rules: TransactionRule[],
): Promise<CloudPersistResult> {
  const categoryIds = await resolveCloudIdMap(supabase, 'categories', userId, rules.map(rule => rule.categoryId))
  return syncRows('transaction_rules', rules, rule => upsertByLocalId(supabase, 'transaction_rules', userId, rule.id, {
    name: rule.name,
    match_text: rule.matchText,
    match_field: rule.matchField,
    category_id: categoryIds[rule.categoryId] ?? null,
    type: rule.type ?? null,
    created_at: rule.createdAt ?? nowIso(),
  }))
}

export async function persistSavingsGoalsToCloud(
  supabase: Client,
  userId: string,
  targets: Target[],
): Promise<CloudPersistResult> {
  return syncRows('savings_goals', targets, target => upsertByLocalId(supabase, 'savings_goals', userId, target.id, {
    name: target.name,
    goal_amount: safeNumber(target.goalAmount),
    current_saved: safeNumber(target.currentSaved),
    start_date: target.startDate || null,
    deadline: target.deadline || null,
    type: target.type ?? 'savings',
    completed: Boolean(target.completed),
    paused: Boolean(target.paused),
    created_at: target.createdAt ?? nowIso(),
  }))
}

export async function persistSavingsGoalContributionsToCloud(
  supabase: Client,
  userId: string,
  targets: Target[],
): Promise<CloudPersistResult> {
  const goalIds = await resolveCloudIdMap(supabase, 'savings_goals', userId, targets.map(target => target.id))
  const contributions: Array<Contribution & { goalLocalId: string }> = targets.flatMap(target =>
    (target.contributions ?? []).map(contribution => ({ ...contribution, goalLocalId: target.id })),
  )

  return syncRows('savings_goal_contributions', contributions, contribution => {
    const goalId = goalIds[contribution.goalLocalId]
    if (!goalId) return Promise.resolve(false)
    return upsertByLocalId(supabase, 'savings_goal_contributions', userId, contribution.id, {
      goal_id: goalId,
      date: contribution.date,
      amount: safeNumber(contribution.amount),
      note: contribution.note ?? null,
      created_at: nowIso(),
    })
  })
}

export async function persistSavingsGoalSetsToCloud(
  supabase: Client,
  userId: string,
  savedTargetSets: SavedTargetSet[],
): Promise<CloudPersistResult> {
  return syncRows('savings_goal_sets', savedTargetSets, set => {
    const localId = `${set.name}-${set.savedAt}`
    return upsertByLocalId(supabase, 'savings_goal_sets', userId, localId, {
      name: set.name,
      targets_snapshot: set.targets ?? [],
      saved_at: set.savedAt ?? nowIso(),
    })
  })
}

export async function persistScenariosToCloud(
  supabase: Client,
  userId: string,
  savedScenarios: SavedScenarioSet[],
): Promise<CloudPersistResult> {
  return syncRows('scenarios', savedScenarios, scenario => {
    const localId = `${scenario.name}-${scenario.savedAt}`
    return upsertByLocalId(supabase, 'scenarios', userId, localId, {
      name: scenario.name,
      period: scenario.period,
      scenario_values: scenario.scenarios ?? {},
      saved_at: scenario.savedAt ?? nowIso(),
    })
  })
}

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
}): Promise<CloudPersistSummary> {
  const results: CloudPersistResult[] = []

  // Parent data first so child foreign keys can resolve.
  results.push(await persistAccountsToCloud(params.supabase, params.userId, params.accounts))
  results.push(await persistCategoriesToCloud(params.supabase, params.userId, params.categories))
  results.push(await persistSavingsGoalsToCloud(params.supabase, params.userId, params.targets))

  // Child/linked data second.
  results.push(await persistTransactionsToCloud(params.supabase, params.userId, params.transactions))
  results.push(await persistTransactionRulesToCloud(params.supabase, params.userId, params.rules))
  results.push(await persistSavingsGoalContributionsToCloud(params.supabase, params.userId, params.targets))
  results.push(await persistSavingsGoalSetsToCloud(params.supabase, params.userId, params.savedTargetSets))
  results.push(await persistScenariosToCloud(params.supabase, params.userId, params.savedScenarios))

  return {
    attempted: results.reduce((sum, result) => sum + result.attempted, 0),
    synced: results.reduce((sum, result) => sum + result.synced, 0),
    failed: results.reduce((sum, result) => sum + result.failed, 0),
    results,
    lastSyncedAt: nowIso(),
  }
}
