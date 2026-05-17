export type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Scenarios' | 'Targets' | 'Accounts' | 'Transactions'
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
export type AccountType = 'checking' | 'savings' | 'credit card' | 'investment' | 'cash' | 'roth ira' | 'retirement' | 'other'
export type Account = { id: string; name: string; type: AccountType; balance: number; institution: string; createdAt: string }
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
  appliedByRule?: string
  toAccountId?: string            // V9.2 — destination for transfers / CC payments
  batchId?: string                // V9.0 — import batch identifier
  importedCategoryHint?: string   // V9.6 — raw category from CSV (e.g. Apple Card Category column)
  createdAt: string
}

// V9.6 — Import batch record (tracks each CSV import session)
// V9.10 — extended with importSource and preset
export type ImportPreset = 'auto' | 'apple-card' | 'generic-csv' | 'chase-pdf-experimental'
export type ImportBatch = {
  id: string
  accountId: string
  accountName: string
  importMonth: string       // YYYY-MM
  importedCount: number
  skippedCount: number
  createdAt: string
  importSource: string      // V9.10 — 'csv' | 'pdf' | etc.
  preset: ImportPreset      // V9.10 — which preset was used
}
export type TransactionRule = { id: string; name: string; matchText: string; matchField: 'merchant' | 'notes'; categoryId: string; type?: TransactionType; createdAt: string }
export type TakeHomeMode = 'simple' | 'manual'
export type TakeHomeSettings = { mode: TakeHomeMode; simpleRate: number; manualMonthlyNet: number }
export const DEFAULT_TAKE_HOME_SETTINGS: TakeHomeSettings = { mode: 'simple', simpleRate: 0.8243, manualMonthlyNet: 0 }
