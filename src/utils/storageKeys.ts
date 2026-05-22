// Centralized localStorage keys. Do not rename existing values unless a migration is added.
export const STORAGE_KEYS = {
  schemaVersion: 'v42-schema-version',

  tab: 'v42-tab',
  period: 'v42-period',
  categories: 'v42-cats',
  savedBudgets: 'v42-budgets',
  savedScenarios: 'v42-scenarios',
  scenarioNotes: 'flow_scenario_notes',

  savingsGoals: 'v42-targets',
  savedGoalSets: 'v42-target-sets',

  accounts: 'v42-accounts',
  transactions: 'v42-transactions',
  transactionRules: 'v42-transaction-rules',
  takeHomeSettings: 'v42-take-home',

  categoryMemory: 'flow_category_memory',
  budgetActuals: 'flow_actuals',
  reviewMonth: 'flow_review_month',
  monthlyNotes: 'flow_monthly_notes',
  reviewedMonths: 'flow_reviewed_months',

  // Reserved centralized names for state that may become persisted later.
  importHistory: 'flow_import_history',
  recurringState: 'flow_recurring_state',
  duplicateState: 'flow_duplicate_state',
  needsReviewState: 'flow_needs_review_state',
  undoRedoState: 'flow_undo_redo_state',
  pendingDeletes: 'flow_pending_deletes',
} as const

export type StorageKeyName = keyof typeof STORAGE_KEYS
export type StorageKey = (typeof STORAGE_KEYS)[StorageKeyName]

export const PENDING_DELETES_KEY = STORAGE_KEYS.pendingDeletes

// V18 — last sync timestamp (moved from hardcoded string in useCloudPersistence)
// Note: appended separately so existing key values are not changed
export const LAST_SYNC_AT_KEY = 'flow_cloud_last_sync_at'
