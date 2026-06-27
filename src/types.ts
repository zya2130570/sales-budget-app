export type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Scenarios' | 'Targets' | 'Accounts' | 'Transactions'
export type Period = 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'

/**
 * Current local data schema version.
 * v3 — adds updatedAt to Category.
 * v4 — normalizes batchId→importBatchId and backfills updatedAt on all transactions.
 */
export const CURRENT_SCHEMA_VERSION = 4

/** Budget category persisted in v42-cats. Cloud-important: stable id, amount, type, and updatedAt. */
export type CategoryType = 'fixed bill' | 'variable spending' | 'savings' | 'investing'
export type BreakdownItem = { id: string; label: string; amount: number }  // V33
export type Category = {
  id: string
  name: string
  amount: number
  type: CategoryType
  updatedAt?: string  // Added v3 — set on every create/edit
  breakdown?: BreakdownItem[]  // V33 — optional sub-item breakdown (local only)
}

/** Saved budget snapshot persisted in v42-budgets. */
export type SavedBudget = { name: string; categories: Category[]; savedAt: string }
export type BudgetSnapshot = { categories: Category[]; form: { name: string; amount: string; type: CategoryType }; editId: string | null }

/** Scenario input model persisted in v42-scenarios. */
export type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'
export type SavedScenarioSet = { name: string; scenarios: Record<ScenarioName, number>; period: Period; savedAt: string }

/** Contribution attached to a savings goal. */
export type Contribution = { id: string; date: string; amount: number; note: string }

/** Savings goal model persisted in v42-targets. */
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

/** Saved goal set persisted in v42-target-sets. */
export type SavedTargetSet = { name: string; targets: Target[]; savedAt: string }

/** Account model persisted in v42-accounts. */
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

/** Transaction model persisted in v42-transactions. */
export type TransactionType = 'expense' | 'income' | 'transfer' | 'credit card payment' | 'savings-goal'
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
  /** Legacy import batch field. Keep until migration can fully replace it. */
  batchId?: string
  /** Cloud-ready import batch field. Kept in sync with batchId. */
  importBatchId?: string
  source?: TransactionSource
  importSource?: TransactionSource
  importedAt?: string
  importedCategoryHint?: string
  reviewStatus?: TransactionReviewStatus
  createdAt: string
  updatedAt?: string
}

/** Import batch record. */
export type ImportPreset = 'auto' | 'apple-card' | 'generic-csv' | 'chase-pdf-experimental'
export type ImportSource = 'csv' | 'pdf' | 'manual' | 'generated'
export type ImportBatchRow = {
  date: string
  merchant: string
  amount: number
  type: string
  notes?: string
}

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
  // V55 — snapshot of the rows exactly as they were imported (before any edits/deletes)
  rowsSnapshot?: ImportBatchRow[]
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

/** Duplicate resolution model. */
export type DuplicateResolutionStatus = 'unresolved' | 'kept-both' | 'deleted' | 'not-duplicate'
export type DuplicateResolution = {
  id: string
  groupId: string
  transactionIds: string[]
  status: DuplicateResolutionStatus
  resolvedAt?: string
}

/** Monthly review model. */
export type MonthlyReview = {
  month: string
  notes: string
  reviewedAt?: string
  status?: 'draft' | 'reviewed'
  checklist?: Record<string, boolean>
}

export type TakeHomeMode = 'simple' | 'manual' | 'paystub'
export type TakeHomeSettings = { mode: TakeHomeMode; simpleRate: number; manualMonthlyNet: number; manualCheckAmount?: number; manualCheckFrequency?: PayFrequency; baseSalary?: number; updatedAt?: string }
export const DEFAULT_TAKE_HOME_SETTINGS: TakeHomeSettings = { mode: "simple", simpleRate: 0.8243, manualMonthlyNet: 0, manualCheckFrequency: 'bi-weekly' }

export type PayFrequency = 'weekly' | 'bi-weekly' | 'semi-monthly' | 'monthly'
export type PayStub = {
  id: string
  date: string
  netPay: number
  grossPay: number
  payFrequency: PayFrequency
  isActive: boolean
  label?: string
}

// V45 — additional income sources (side income, rental, partner, etc.)
export type ExtraIncome = { id: string; label: string; monthlyAmount: number }
export type ExportRecord = { id: string; exportedAt: string; fileSizeKb: number }


export type BudgetActualsByPeriod = Record<string, Record<string, string>>
export type BudgetActualsEnvelope = { version: 2; lastPeriodKey?: string; actualsByPeriod: BudgetActualsByPeriod }

// ─── Budget Sandbox ───────────────────────────────────────────────────────────

export type SandboxCategoryBehavior = 'fixed' | 'flexible' | 'percentage' | 'overflow'
export type SandboxSortMode = 'custom' | 'grouped' | 'fixed-first' | 'flexible-first' | 'savings-first' | 'investing-first' | 'amount-desc' | 'amount-asc'

export type SandboxCategory = {
  id: string
  name: string
  amount: number        // monthly, same convention as Category
  type: CategoryType
  behavior: SandboxCategoryBehavior
  minAmount?: number
  targetAmount?: number
  maxAmount?: number
  percentageOfIncome?: number
  notes?: string
}

export type SandboxIncomeScenario = {
  id: string
  name: string
  monthlyIncome: number
}

export type SandboxChangeRule = {
  id: string
  label: string
}

export type SandboxDraft = {
  id: string
  name: string
  categories: SandboxCategory[]
  scenarios: SandboxIncomeScenario[]
  activeScenarioId: string
  period: Period
  startingFrom: string   // 'current' | 'blank' | saved-budget name
  sortMode: SandboxSortMode
  categoryOrder: string[] // category ids for custom drag order
  increaseRules: SandboxChangeRule[]
  decreaseRules: SandboxChangeRule[]
  createdAt: string
  updatedAt: string
}
