export type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Accounts' | 'Transactions' | 'Scenarios' | 'Targets'
export type Period = 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'
export type CategoryType = 'fixed bill' | 'variable spending' | 'savings' | 'investing'
export type Category = { id: string; name: string; amount: number; type: CategoryType }
export type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'
export type SavedBudget = { name: string; categories: Category[]; savedAt: string }
export type SavedScenarioSet = { name: string; scenarios: Record<ScenarioName, number>; period: Period; savedAt: string }
export type BudgetSnapshot = { categories: Category[]; form: { name: string; amount: string; type: CategoryType }; editId: string | null }
export type Contribution = { id: string; date: string; amount: number; note: string }
export type Target = { id: string; name: string; goalAmount: number; currentSaved: number; startDate?: string; deadline: string; createdAt?: string; type: 'savings'; contributions: Contribution[]; completed?: boolean }
export type SavedTargetSet = { name: string; targets: Target[]; savedAt: string }

// ── V8 — Accounts ─────────────────────────────────────────────────────────────

export type AccountType = 'checking' | 'savings' | 'credit card' | 'investment' | 'cash' | 'roth ira' | 'retirement' | 'other'

export type Account = {
  id: string
  name: string
  type: AccountType
  balance: number
  institution: string
  createdAt: string
}

// ── V8 — Transactions ─────────────────────────────────────────────────────────

export type TransactionType = 'expense' | 'income' | 'transfer' | 'credit card payment'

export type Transaction = {
  id: string
  date: string
  accountId: string
  toAccountId?: string          // V9.2 — destination account for transfers / CC payments
  transferGroupId?: string      // V9.2 — links paired debit+credit sides of a transfer
  merchant: string
  amount: number
  type: TransactionType
  categoryId?: string
  notes?: string
  appliedByRule?: string        // rule id that auto-assigned the category (V8.5)
  createdAt: string
  // ── V9.0 CSV import metadata ──
  importedAt?: string
  importBatchId?: string
  importSource?: 'csv'
}

// ── V9.1 — Take-home settings ─────────────────────────────────────────────────
// Persisted overrides for the income take-home rate calculation.
// All fields are optional so existing storage without them still loads safely.

export type TakeHomeSettings = {
  /** Override the default TAKE_HOME_RATE (e.g. 0.78 for a lower net rate). */
  takeHomeRate?: number
  /** If true, use the custom rate instead of the calculated default. */
  useCustomRate?: boolean
  /** Filing status used for tax estimation. */
  filingStatus?: 'single' | 'married_jointly' | 'married_separately' | 'head_of_household'
  /** State abbreviation for state-tax estimation (e.g. "CA", "TX"). */
  state?: string
}
// Keyword-based rules that auto-assign a budget category to matching transactions.
// matchText supports comma-separated aliases: "Target, TGT, Target Store"

export type TransactionRule = {
  id: string
  name: string
  matchText: string              // comma-separated aliases, case-insensitive
  matchField: 'merchant' | 'notes'
  categoryId: string
  type?: TransactionType         // optional filter: only fire for this transaction type
  createdAt: string
}
