export type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Scenarios' | 'Targets' | 'Accounts' | 'Transactions'
export type Period = 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'

/**
 * Current local data schema version.
 * This is separate from UI versions and is used to keep localStorage migrations safe before cloud sync.
 */
export const CURRENT_SCHEMA_VERSION = 2

/** Budget category persisted in v42-cats. Cloud-important: stable id, amount, and type. */
export type CategoryType = 'fixed bill' | 'variable spending' | 'savings' | 'investing'
export type Category = { id: string; name: string; amount: number; type: CategoryType }

/** Saved budget snapshot persisted in v42-budgets. This stores copied categories, not live references. */
export type SavedBudget = { name: string; categories: Category[]; savedAt: string }
export type BudgetSnapshot = { categories: Category[]; form: { name: string; amount: string; type: CategoryType }; editId: string | null }

/** Scenario input model persisted in v42-scenarios. Values are gross profit assumptions by period. */
export type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'
export type SavedScenarioSet = { name: string; scenarios: Record<ScenarioName, number>; period: Period; savedAt: string }

/** Contribution attached to a savings goal. Cloud-important: stable id + date + amount. */
export type Contribution = { id: string; date: string; amount: number; note: string }

/**
 * Savings goal model persisted in v42-targets.
 * The app currently calls goals "targets" internally. Goal sets are snapshot copies of these objects.
 */
export type Target = {
  id: string
  name: string
  goalAmount: number
  currentSaved: number
  startDate?: string
  deadline: string
  createdAt?: string
  updatedAt?: string
  type: 'savings'
  contributions: Contribution[]
  completed?: boolean
  paused?: boolean
}

/** Saved goal set persisted in v42-target-sets. Current behavior: snapshot copies of goals, not live references. */
export type SavedTargetSet = { name: string; targets: Target[]; savedAt: string }

/** Account model persisted in v42-accounts. Cloud-important: balance and reconciliation metadata. */
export type AccountType = 'checking' | 'savings' | 'credit card' | 'investment' | 'cash' | 'roth ira' | 'retirement' | 'other'
export type Account = {
  id: string
  name: string
  type: AccountType
  balance: number
  institution: string
  createdAt: string
  updatedAt?: string
  startingBalance?: number
  lastReconciledAt?: string
}

/** Transaction model persisted in v42-transactions. Cloud-important: account/category/import linkage. */
export type TransactionType = 'expense' | 'income' | 'transfer' | 'credit card payment'
export type TransactionSource = 'manual' | 'csv' | 'pdf' | 'generated'
export type TransactionReviewStatus = 'needs-review' | 'reviewed' | 'ignored'
export type Transaction = {
  id: string
  date: string
  accountId: string
  merchant: string
  amount: number
  type: TransactionType
  categoryId?: string
  notes?: string
  appliedByRule?: string
  toAccountId?: string
  /** Legacy import batch field used by existing UI. Keep until a migration can fully replace it. */
  batchId?: string
  /** Cloud-ready import batch field. Kept in sync with batchId during migrations/new imports where safe. */
  importBatchId?: string
  source?: TransactionSource
  importSource?: TransactionSource
  importedAt?: string
  importedCategoryHint?: string
  reviewStatus?: TransactionReviewStatus
  createdAt: string
  updatedAt?: string
}

/** Import batch record persisted in component state today and cloud-ready for future persistence. */
export type ImportPreset = 'auto' | 'apple-card' | 'generic-csv' | 'chase-pdf-experimental'
export type ImportSource = 'csv' | 'pdf' | 'manual' | 'generated'
export type ImportBatch = {
  id: string
  source?: ImportSource
  accountId: string
  accountName: string
  importMonth: string
  importedCount: number
  skippedCount: number
  skippedDuplicateCount?: number
  failedRowCount?: number
  createdAt: string
  importedAt?: string
  importSource: string
  preset: ImportPreset
}

/** Transaction rule model persisted in v42-transaction-rules. */
export type TransactionRule = {
  id: string
  name: string
  matchText: string
  matchField: 'merchant' | 'notes'
  categoryId: string
  type?: TransactionType
  createdAt: string
  updatedAt?: string
}

/** Stable duplicate-resolution model for future persistence/cloud mapping. */
export type DuplicateResolutionStatus = 'unresolved' | 'kept-both' | 'deleted' | 'not-duplicate'
export type DuplicateResolution = {
  id: string
  groupId: string
  transactionIds: string[]
  status: DuplicateResolutionStatus
  resolvedAt?: string
}

/** Month-keyed monthly review model for future persistence/cloud mapping. */
export type MonthlyReview = {
  month: string
  notes: string
  reviewedAt?: string
  status?: 'draft' | 'reviewed'
  checklist?: Record<string, boolean>
}

export type TakeHomeMode = 'simple' | 'manual'
export type TakeHomeSettings = { mode: TakeHomeMode; simpleRate: number; manualMonthlyNet: number }
export const DEFAULT_TAKE_HOME_SETTINGS: TakeHomeSettings = { mode: 'simple', simpleRate: 0.8243, manualMonthlyNet: 0 }
