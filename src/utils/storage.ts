import type { Tab, Period, Category, SavedBudget, SavedScenarioSet, Target, SavedTargetSet, Account, Transaction } from '../types'

// ─── Storage key constants ────────────────────────────────────────────────────

export const KEYS = {
  tab:          'v42-tab',
  cats:         'v42-cats',
  budgets:      'v42-budgets',
  scenarios:    'v42-scenarios',
  targets:      'v42-targets',
  targetSets:   'v42-target-sets',
  period:       'v42-period',
  accounts:     'v42-accounts',
  transactions: 'v42-transactions',
} as const

// ─── Schema versioning ────────────────────────────────────────────────────────

export const STORAGE_VERSION = 1
export const STORAGE_VERSION_KEY = 'v42-schema-version'

// ─── Valid tab names (used for Tab validation on load) ────────────────────────

const VALID_TABS: Tab[] = ['Dashboard', 'Income', 'Budget', 'Accounts', 'Transactions', 'Scenarios', 'Targets']

// ─── Low-level safe helpers ───────────────────────────────────────────────────

export function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function storageSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Silently ignore (e.g. private browsing quota exceeded)
  }
}

export function storageSetRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Silently ignore
  }
}

// ─── V0 → V1 target normalizer ───────────────────────────────────────────────

function normalizeTarget(raw: Record<string, unknown>): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10)
  if (typeof raw['completed'] !== 'boolean') raw['completed'] = false
  if (!raw['startDate'] || typeof raw['startDate'] !== 'string') {
    raw['startDate'] = (raw['createdAt'] && typeof raw['createdAt'] === 'string')
      ? raw['createdAt']
      : today
  }
  return raw
}

// ─── Migration runner ─────────────────────────────────────────────────────────

export function runMigrations(): void {
  try {
    const stored = localStorage.getItem(STORAGE_VERSION_KEY)
    const currentVersion = stored !== null ? parseInt(stored, 10) : 0
    if (currentVersion >= STORAGE_VERSION) return
    if (currentVersion < 1) {
      try {
        const raw = localStorage.getItem(KEYS.targets)
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            localStorage.setItem(KEYS.targets, JSON.stringify(
              parsed.map((t: Record<string, unknown>) => normalizeTarget({ ...t }))
            ))
          }
        }
      } catch { /* leave untouched */ }
      try {
        const raw = localStorage.getItem(KEYS.targetSets)
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          if (Array.isArray(parsed)) {
            localStorage.setItem(KEYS.targetSets, JSON.stringify(
              parsed.map((set: Record<string, unknown>) => {
                if (Array.isArray(set['targets'])) {
                  return { ...set, targets: (set['targets'] as Record<string, unknown>[]).map(t => normalizeTarget({ ...t })) }
                }
                return set
              })
            ))
          }
        }
      } catch { /* leave untouched */ }
    }
    localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION))
  } catch { /* migration failure is non-fatal */ }
}

// ─── Typed load helpers ───────────────────────────────────────────────────────

export function loadTab(): Tab | null {
  try {
    const raw = localStorage.getItem(KEYS.tab)
    if (raw === null) return null
    if ((VALID_TABS as string[]).includes(raw)) return raw as Tab
    return null
  } catch { return null }
}

export function loadPeriod(): Period | null {
  try {
    const raw = localStorage.getItem(KEYS.period)
    if (raw === null) return null
    const valid: Period[] = ['weekly', 'bi-weekly', 'monthly', 'yearly']
    if ((valid as string[]).includes(raw)) return raw as Period
    return null
  } catch { return null }
}

export function loadCategories(): Category[] | null        { return storageGet<Category[]>(KEYS.cats) }
export function loadSavedBudgets(): SavedBudget[] | null   { return storageGet<SavedBudget[]>(KEYS.budgets) }
export function loadSavedScenarios(): SavedScenarioSet[] | null { return storageGet<SavedScenarioSet[]>(KEYS.scenarios) }
export function loadTargets(): Target[] | null             { return storageGet<Target[]>(KEYS.targets) }
export function loadSavedTargetSets(): SavedTargetSet[] | null { return storageGet<SavedTargetSet[]>(KEYS.targetSets) }
export function loadAccounts(): Account[] | null           { return storageGet<Account[]>(KEYS.accounts) }
export function loadTransactions(): Transaction[] | null   { return storageGet<Transaction[]>(KEYS.transactions) }

// ─── Typed save helpers ───────────────────────────────────────────────────────

export function saveTab(tab: Tab): void                        { storageSetRaw(KEYS.tab, tab) }
export function savePeriod(p: Period): void                    { storageSetRaw(KEYS.period, p) }
export function saveCategories(categories: Category[]): void  { storageSet(KEYS.cats, categories) }
export function saveSavedBudgets(budgets: SavedBudget[]): void { storageSet(KEYS.budgets, budgets) }
export function saveSavedScenarios(scenarios: SavedScenarioSet[]): void { storageSet(KEYS.scenarios, scenarios) }
export function saveTargets(targets: Target[]): void          { storageSet(KEYS.targets, targets) }
export function saveSavedTargetSets(sets: SavedTargetSet[]): void { storageSet(KEYS.targetSets, sets) }
export function saveAccounts(accounts: Account[]): void       { storageSet(KEYS.accounts, accounts) }
export function saveTransactions(txns: Transaction[]): void   { storageSet(KEYS.transactions, txns) }
