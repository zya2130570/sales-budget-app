import { STORAGE_KEYS } from './storageKeys'
import { loadFromStorage } from './storage'
import type { Account, Category, Transaction, TransactionRule, Target, SavedTargetSet, SavedScenarioSet, ImportBatch, MonthlyReview } from '../types'
import type { SupabaseClient } from '@supabase/supabase-js'

export type DatasetSource = 'local' | 'cloud'

export type DatasetEntityKey =
  | 'accounts'
  | 'categories'
  | 'transactions'
  | 'transactionRules'
  | 'importBatches'
  | 'duplicateResolutions'
  | 'monthlyReviews'
  | 'savingsGoals'
  | 'savingsGoalContributions'
  | 'savingsGoalSets'
  | 'scenarios'
  | 'scenarioNotes'
  | 'budgetActuals'
  | 'categoryMemory'

export type EntitySummary = {
  key: DatasetEntityKey
  label: string
  count: number
  lastModifiedAt: string | null
}

export type DatasetSummary = {
  source: DatasetSource
  available: boolean
  generatedAt: string
  lastModifiedAt: string | null
  entities: EntitySummary[]
  totals: {
    accounts: number
    categories: number
    transactions: number
    importBatches: number
    savingsGoals: number
    savingsGoalContributions: number
    monthlyReviews: number
  }
  warnings: string[]
}

export type ReconciliationConflict = {
  key: string
  label: string
  severity: 'info' | 'warning' | 'danger'
  message: string
}

export type ReconciliationAnalysis = {
  hasLocalData: boolean
  hasCloudData: boolean
  recommendedAction: 'continue-guest' | 'upload-local' | 'choose-source' | 'safe-merge-review'
  safeMergeAreas: string[]
  unsafeMergeAreas: string[]
  conflicts: ReconciliationConflict[]
}

const ENTITY_LABELS: Record<DatasetEntityKey, string> = {
  accounts: 'Accounts',
  categories: 'Categories',
  transactions: 'Transactions',
  transactionRules: 'Rules',
  importBatches: 'Import batches',
  duplicateResolutions: 'Duplicate resolutions',
  monthlyReviews: 'Monthly reviews',
  savingsGoals: 'Savings goals',
  savingsGoalContributions: 'Goal contributions',
  savingsGoalSets: 'Goal sets',
  scenarios: 'Scenarios',
  scenarioNotes: 'Scenario notes',
  budgetActuals: 'Budget actuals',
  categoryMemory: 'Category memory',
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function validIso(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? new Date(time).toISOString() : null
}

function latestDate(values: Array<unknown>): string | null {
  const dates = values
    .map(validIso)
    .filter((value): value is string => Boolean(value))
    .map(value => new Date(value).getTime())
    .filter(Number.isFinite)

  if (!dates.length) return null
  return new Date(Math.max(...dates)).toISOString()
}

function latestFromRecords(records: unknown[], fields: string[]): string | null {
  const values: unknown[] = []
  for (const item of records) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    for (const field of fields) values.push(row[field])
  }
  return latestDate(values)
}

function countRecordEntries(value: unknown): number {
  return Object.keys(asRecord(value)).length
}

function buildEntity(key: DatasetEntityKey, count: number, lastModifiedAt: string | null): EntitySummary {
  return { key, label: ENTITY_LABELS[key], count, lastModifiedAt }
}

function overallLatest(entities: EntitySummary[]): string | null {
  return latestDate(entities.map(entity => entity.lastModifiedAt))
}

export function getLocalDatasetSummary(): DatasetSummary {
  const accounts = asArray<Account>(loadFromStorage(STORAGE_KEYS.accounts, []))
  const categories = asArray<Category>(loadFromStorage(STORAGE_KEYS.categories, []))
  const transactions = asArray<Transaction>(loadFromStorage(STORAGE_KEYS.transactions, []))
  const rules = asArray<TransactionRule>(loadFromStorage(STORAGE_KEYS.transactionRules, []))
  const importBatches = asArray<ImportBatch>(loadFromStorage(STORAGE_KEYS.importHistory, []))
  const duplicateResolutions = asRecord(loadFromStorage(STORAGE_KEYS.duplicateState, {}))
  const monthlyNotes = asRecord(loadFromStorage(STORAGE_KEYS.monthlyNotes, {}))
  const reviewedMonths = asArray<string>(loadFromStorage(STORAGE_KEYS.reviewedMonths, []))
  const monthlyReviews: MonthlyReview[] = Object.keys(monthlyNotes).map(month => ({
    month,
    notes: String(monthlyNotes[month] ?? ''),
    reviewedAt: reviewedMonths.includes(month) ? new Date().toISOString() : undefined,
  }))
  const goals = asArray<Target>(loadFromStorage(STORAGE_KEYS.savingsGoals, []))
  const goalSets = asArray<SavedTargetSet>(loadFromStorage(STORAGE_KEYS.savedGoalSets, []))
  const scenarios = asArray<SavedScenarioSet>(loadFromStorage(STORAGE_KEYS.savedScenarios, []))
  const scenarioNotes = asRecord(loadFromStorage(STORAGE_KEYS.scenarioNotes, {}))
  const budgetActuals = asRecord(loadFromStorage(STORAGE_KEYS.budgetActuals, {}))
  const categoryMemory = asRecord(loadFromStorage(STORAGE_KEYS.categoryMemory, {}))

  const goalContributions = goals.flatMap(goal => asArray((goal as unknown as { contributions?: unknown[] }).contributions))

  const entities = [
    buildEntity('accounts', accounts.length, latestFromRecords(accounts, ['updatedAt', 'createdAt', 'lastReconciledAt'])),
    buildEntity('categories', categories.length, latestFromRecords(categories, ['updatedAt', 'createdAt'])),
    buildEntity('transactions', transactions.length, latestFromRecords(transactions, ['updatedAt', 'createdAt', 'date'])),
    buildEntity('transactionRules', rules.length, latestFromRecords(rules, ['updatedAt', 'createdAt'])),
    buildEntity('importBatches', importBatches.length, latestFromRecords(importBatches, ['updatedAt', 'createdAt', 'importedAt'])),
    buildEntity('duplicateResolutions', Object.keys(duplicateResolutions).length, null),
    buildEntity('monthlyReviews', Math.max(Object.keys(monthlyNotes).length, reviewedMonths.length), latestFromRecords(monthlyReviews, ['reviewedAt'])),
    buildEntity('savingsGoals', goals.length, latestFromRecords(goals, ['updatedAt', 'createdAt', 'deadline'])),
    buildEntity('savingsGoalContributions', goalContributions.length, latestFromRecords(goalContributions, ['updatedAt', 'createdAt', 'date'])),
    buildEntity('savingsGoalSets', goalSets.length, latestFromRecords(goalSets, ['updatedAt', 'createdAt', 'savedAt'])),
    buildEntity('scenarios', scenarios.length, latestFromRecords(scenarios, ['updatedAt', 'createdAt', 'savedAt'])),
    buildEntity('scenarioNotes', Object.keys(scenarioNotes).length, null),
    buildEntity('budgetActuals', countRecordEntries(budgetActuals), null),
    buildEntity('categoryMemory', countRecordEntries(categoryMemory), null),
  ]

  const totalRecords = entities.reduce((sum, entity) => sum + entity.count, 0)

  return {
    source: 'local',
    available: true,
    generatedAt: new Date().toISOString(),
    lastModifiedAt: overallLatest(entities),
    entities,
    totals: {
      accounts: accounts.length,
      categories: categories.length,
      transactions: transactions.length,
      importBatches: importBatches.length,
      savingsGoals: goals.length,
      savingsGoalContributions: goalContributions.length,
      monthlyReviews: Math.max(Object.keys(monthlyNotes).length, reviewedMonths.length),
    },
    warnings: totalRecords === 0 ? ['No local data was found on this device.'] : [],
  }
}

type CloudTableSpec = {
  key: DatasetEntityKey
  table: string
  timestampColumn?: string
}

const CLOUD_TABLES: CloudTableSpec[] = [
  { key: 'accounts', table: 'accounts' },
  { key: 'categories', table: 'categories' },
  { key: 'transactions', table: 'transactions' },
  { key: 'transactionRules', table: 'transaction_rules' },
  { key: 'importBatches', table: 'import_batches', timestampColumn: 'imported_at' },
  { key: 'duplicateResolutions', table: 'duplicate_resolutions' },
  { key: 'monthlyReviews', table: 'monthly_reviews' },
  { key: 'savingsGoals', table: 'savings_goals' },
  { key: 'savingsGoalContributions', table: 'savings_goal_contributions' },
  { key: 'savingsGoalSets', table: 'savings_goal_sets', timestampColumn: 'saved_at' },
  { key: 'scenarios', table: 'scenarios', timestampColumn: 'saved_at' },
  { key: 'scenarioNotes', table: 'scenario_notes' },
  { key: 'budgetActuals', table: 'budget_actuals' },
  { key: 'categoryMemory', table: 'category_memory', timestampColumn: 'last_used_at' },
]

async function getTableSummary(
  supabase: SupabaseClient,
  userId: string,
  spec: CloudTableSpec,
): Promise<EntitySummary> {
  const { count, error: countError } = await supabase
    .from(spec.table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (countError) {
    throw new Error(`${spec.table}: ${countError.message}`)
  }

  const timestampColumn = spec.timestampColumn ?? 'updated_at'
  const { data } = await supabase
    .from(spec.table)
    .select(timestampColumn)
    .eq('user_id', userId)
    .order(timestampColumn, { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  const lastModifiedAt = validIso((data as Record<string, unknown> | null)?.[timestampColumn])

  return buildEntity(spec.key, count ?? 0, lastModifiedAt)
}

export async function getCloudDatasetSummary(
  supabase: SupabaseClient | null,
  userId: string | null | undefined,
): Promise<DatasetSummary> {
  if (!supabase || !userId) {
    return {
      source: 'cloud',
      available: false,
      generatedAt: new Date().toISOString(),
      lastModifiedAt: null,
      entities: CLOUD_TABLES.map(spec => buildEntity(spec.key, 0, null)),
      totals: {
        accounts: 0,
        categories: 0,
        transactions: 0,
        importBatches: 0,
        savingsGoals: 0,
        savingsGoalContributions: 0,
        monthlyReviews: 0,
      },
      warnings: ['Cloud is unavailable until Supabase is configured and the user is signed in.'],
    }
  }

  const warnings: string[] = []
  const entities: EntitySummary[] = []

  for (const spec of CLOUD_TABLES) {
    try {
      entities.push(await getTableSummary(supabase, userId, spec))
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `Could not load ${spec.table}.`)
      entities.push(buildEntity(spec.key, 0, null))
    }
  }

  return {
    source: 'cloud',
    available: warnings.length < CLOUD_TABLES.length,
    generatedAt: new Date().toISOString(),
    lastModifiedAt: overallLatest(entities),
    entities,
    totals: {
      accounts: entities.find(entity => entity.key === 'accounts')?.count ?? 0,
      categories: entities.find(entity => entity.key === 'categories')?.count ?? 0,
      transactions: entities.find(entity => entity.key === 'transactions')?.count ?? 0,
      importBatches: entities.find(entity => entity.key === 'importBatches')?.count ?? 0,
      savingsGoals: entities.find(entity => entity.key === 'savingsGoals')?.count ?? 0,
      savingsGoalContributions: entities.find(entity => entity.key === 'savingsGoalContributions')?.count ?? 0,
      monthlyReviews: entities.find(entity => entity.key === 'monthlyReviews')?.count ?? 0,
    },
    warnings,
  }
}

function entityCount(summary: DatasetSummary, key: DatasetEntityKey): number {
  return summary.entities.find(entity => entity.key === key)?.count ?? 0
}

export function analyzeLocalCloudReconciliation(
  local: DatasetSummary,
  cloud: DatasetSummary,
): ReconciliationAnalysis {
  const localTotal = local.entities.reduce((sum, entity) => sum + entity.count, 0)
  const cloudTotal = cloud.entities.reduce((sum, entity) => sum + entity.count, 0)
  const hasLocalData = localTotal > 0
  const hasCloudData = cloudTotal > 0

  const conflicts: ReconciliationConflict[] = []

  if (hasLocalData && hasCloudData) {
    conflicts.push({
      key: 'both-datasets-exist',
      label: 'Both local and cloud data exist',
      severity: 'warning',
      message: 'Do not blindly upload or overwrite. Choose a source or run a safe merge preview first.',
    })
  }

  if (entityCount(local, 'transactions') > 0 && entityCount(cloud, 'transactions') > 0) {
    conflicts.push({
      key: 'transaction-merge-risk',
      label: 'Transaction merge risk',
      severity: 'danger',
      message: 'Transactions should not auto-merge when both local and cloud records exist because duplicates/import overlap can corrupt history.',
    })
  }

  if (entityCount(local, 'importBatches') > 0 && entityCount(cloud, 'importBatches') > 0) {
    conflicts.push({
      key: 'import-batch-overlap-risk',
      label: 'Import batch overlap risk',
      severity: 'danger',
      message: 'CSV/PDF imports for the same account and month must be reviewed before any merge.',
    })
  }

  if (entityCount(local, 'budgetActuals') > 0 && entityCount(cloud, 'budgetActuals') > 0) {
    conflicts.push({
      key: 'budget-actuals-risk',
      label: 'Budget actuals conflict risk',
      severity: 'warning',
      message: 'Budget actuals need period-aware comparison before they can merge safely.',
    })
  }

  if (entityCount(local, 'duplicateResolutions') > 0 && entityCount(cloud, 'duplicateResolutions') > 0) {
    conflicts.push({
      key: 'duplicate-resolution-risk',
      label: 'Duplicate decisions conflict risk',
      severity: 'warning',
      message: 'Duplicate resolution decisions must stay attached to stable duplicate groups.',
    })
  }

  let recommendedAction: ReconciliationAnalysis['recommendedAction'] = 'continue-guest'
  if (hasLocalData && !hasCloudData) recommendedAction = 'upload-local'
  if (!hasLocalData && hasCloudData) recommendedAction = 'choose-source'
  if (hasLocalData && hasCloudData) recommendedAction = conflicts.some(conflict => conflict.severity === 'danger') ? 'choose-source' : 'safe-merge-review'

  return {
    hasLocalData,
    hasCloudData,
    recommendedAction,
    safeMergeAreas: [
      'categories',
      'scenarios',
      'scenario notes',
      'monthly review notes',
      'settings',
      'goal set snapshots',
      'non-conflicting accounts',
    ],
    unsafeMergeAreas: [
      'transactions when both datasets have records',
      'CSV/PDF import batches that overlap by account and month',
      'account balance conflicts',
      'duplicate resolutions',
      'budget actuals',
      'recurring item detection',
    ],
    conflicts,
  }
}
