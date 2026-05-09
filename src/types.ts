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
  merchant: string
  amount: number
  type: TransactionType
  categoryId?: string
  notes?: string
  createdAt: string
}

// ── V8.3 — Transaction Rules ──────────────────────────────────────────────────
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
