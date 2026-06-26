import type { Tab, Period, Category, SavedBudget, SavedScenarioSet, Target, SavedTargetSet, Account, Transaction, TransactionRule, TakeHomeSettings, ImportBatch, ExtraIncome, ExportRecord, PayStub, SandboxDraft } from '../types'
import { CURRENT_SCHEMA_VERSION } from '../types'
import { STORAGE_KEYS } from './storageKeys'
import { wsKey } from './workspace'

export const KEYS = {
  tab: STORAGE_KEYS.tab,
  cats: STORAGE_KEYS.categories,
  budgets: STORAGE_KEYS.savedBudgets,
  scenarios: STORAGE_KEYS.savedScenarios,
  targets: STORAGE_KEYS.savingsGoals,
  targetSets: STORAGE_KEYS.savedGoalSets,
  period: STORAGE_KEYS.period,
  accounts: STORAGE_KEYS.accounts,
  transactions: STORAGE_KEYS.transactions,
  transactionRules: STORAGE_KEYS.transactionRules,
  takeHome: STORAGE_KEYS.takeHomeSettings,
} as const

export const STORAGE_VERSION = CURRENT_SCHEMA_VERSION
export const STORAGE_VERSION_KEY = STORAGE_KEYS.schemaVersion

const VALID_TABS: Tab[] = ['Dashboard', 'Income', 'Budget', 'Scenarios', 'Targets', 'Accounts', 'Transactions']
const VALID_PERIODS: Period[] = ['weekly', 'bi-weekly', 'monthly', 'yearly']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const cleanString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const cleanNumber = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

const cleanArray = <T>(value: unknown, fallback: T[] = []): T[] =>
  Array.isArray(value) ? value as T[] : fallback

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function safeJsonStringify(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    return safeJsonParse<T>(localStorage.getItem(wsKey(key)), fallback)
  } catch {
    return fallback
  }
}

export function loadRawFromStorage(key: string, fallback = ''): string {
  try {
    const raw = localStorage.getItem(wsKey(key))
    return raw === null ? fallback : raw
  } catch {
    return fallback
  }
}

export function saveToStorage(key: string, value: unknown): void {
  try {
    const raw = safeJsonStringify(value)
    if (raw !== null) localStorage.setItem(wsKey(key), raw)
  } catch {
    // Ignore quota/private browsing failures.
  }
}

export function saveRawToStorage(key: string, value: string): void {
  try {
    localStorage.setItem(wsKey(key), value)
  } catch {
    // Ignore quota/private browsing failures.
  }
}

export function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(wsKey(key))
  } catch {
    // Ignore storage failures.
  }
}

// Backward-compatible aliases used by older imports.
export function storageGet<T>(key: string): T | null {
  return loadFromStorage<T | null>(key, null)
}

export function storageSet(key: string, value: unknown): void {
  saveToStorage(key, value)
}

export function storageSetRaw(key: string, value: string): void {
  saveRawToStorage(key, value)
}

function normalizeTarget(raw: Record<string, unknown>): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10)
  raw['id'] = cleanString(raw['id'], crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  raw['name'] = cleanString(raw['name'], 'Untitled Goal')
  raw['goalAmount'] = cleanNumber(raw['goalAmount'])
  raw['currentSaved'] = cleanNumber(raw['currentSaved'])
  raw['deadline'] = cleanString(raw['deadline'])
  raw['type'] = 'savings'
  raw['contributions'] = cleanArray<Record<string, unknown>>(raw['contributions']).map(contribution => ({
    id: cleanString(contribution['id'], crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
    date: cleanString(contribution['date'], today),
    amount: cleanNumber(contribution['amount']),
    note: cleanString(contribution['note']),
  }))
  if (typeof raw['completed'] !== 'boolean') raw['completed'] = false
  if (typeof raw['paused'] !== 'boolean' && raw['paused'] !== undefined) raw['paused'] = Boolean(raw['paused'])
  if (!raw['startDate'] || typeof raw['startDate'] !== 'string') {
    raw['startDate'] = cleanString(raw['createdAt'], today)
  }
  if (!raw['createdAt'] || typeof raw['createdAt'] !== 'string') raw['createdAt'] = today
  return raw
}

function normalizeTransaction(raw: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString()
  raw['id'] = cleanString(raw['id'], crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  raw['date'] = cleanString(raw['date'], now.slice(0, 10))
  raw['accountId'] = cleanString(raw['accountId'])
  raw['merchant'] = cleanString(raw['merchant'], 'Unknown')
  raw['amount'] = Math.abs(cleanNumber(raw['amount']))
  raw['type'] = cleanString(raw['type'], 'expense')
  raw['createdAt'] = cleanString(raw['createdAt'], now)

  const batchId = cleanString(raw['batchId'] || raw['importBatchId'])
  if (batchId) {
    raw['batchId'] = batchId
    raw['importBatchId'] = batchId
  }

  if (!raw['source']) {
    raw['source'] = batchId ? cleanString(raw['importSource'], 'csv') : 'manual'
  }
  if (!raw['updatedAt']) raw['updatedAt'] = cleanString(raw['createdAt'], now)
  return raw
}

function normalizeAccount(raw: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString()
  raw['id'] = cleanString(raw['id'], crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  raw['name'] = cleanString(raw['name'], 'Untitled Account')
  raw['type'] = cleanString(raw['type'], 'checking')
  raw['balance'] = cleanNumber(raw['balance'])
  raw['institution'] = cleanString(raw['institution'])
  raw['createdAt'] = cleanString(raw['createdAt'], now)
  if (!raw['updatedAt']) raw['updatedAt'] = cleanString(raw['createdAt'], now)
  return raw
}

function normalizeImportBatch(raw: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString()
  const skippedCount = cleanNumber(raw['skippedCount'])
  raw['id'] = cleanString(raw['id'], crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`)
  raw['accountId'] = cleanString(raw['accountId'])
  raw['accountName'] = cleanString(raw['accountName'])
  raw['importMonth'] = cleanString(raw['importMonth'], now.slice(0, 7))
  raw['importedCount'] = cleanNumber(raw['importedCount'])
  raw['skippedCount'] = skippedCount
  raw['skippedDuplicateCount'] = cleanNumber(raw['skippedDuplicateCount'], skippedCount)
  raw['failedRowCount'] = cleanNumber(raw['failedRowCount'])
  raw['createdAt'] = cleanString(raw['createdAt'], now)
  raw['importedAt'] = cleanString(raw['importedAt'], cleanString(raw['createdAt'], now))
  raw['importSource'] = cleanString(raw['importSource'], cleanString(raw['source'], 'csv'))
  raw['source'] = cleanString(raw['source'], cleanString(raw['importSource'], 'csv'))
  raw['preset'] = cleanString(raw['preset'], 'auto')
  return raw
}

export function runMigrations(): void {
  try {
    const stored = loadRawFromStorage(STORAGE_VERSION_KEY, '')
    const currentVersion = stored !== '' ? parseInt(stored, 10) : 0
    if (currentVersion >= STORAGE_VERSION) return
    if (currentVersion < 1) {
      const targets = loadFromStorage<Array<Record<string, unknown>> | null>(KEYS.targets, null)
      if (Array.isArray(targets)) {
        saveToStorage(KEYS.targets, targets.map(t => normalizeTarget({ ...t })))
      }

      const targetSets = loadFromStorage<Array<Record<string, unknown>> | null>(KEYS.targetSets, null)
      if (Array.isArray(targetSets)) {
        const migrated = targetSets.map(set => {
          if (Array.isArray(set['targets'])) {
            return { ...set, targets: (set['targets'] as Record<string, unknown>[]).filter(isRecord).map(t => normalizeTarget({ ...t })) }
          }
          return set
        })
        saveToStorage(KEYS.targetSets, migrated)
      }
    }
    if (currentVersion < 2) {
      const transactions = loadFromStorage<Array<Record<string, unknown>> | null>(KEYS.transactions, null)
      if (Array.isArray(transactions)) {
        saveToStorage(KEYS.transactions, transactions.filter(isRecord).map(t => normalizeTransaction({ ...t })))
      }

      const accounts = loadFromStorage<Array<Record<string, unknown>> | null>(KEYS.accounts, null)
      if (Array.isArray(accounts)) {
        saveToStorage(KEYS.accounts, accounts.filter(isRecord).map(a => normalizeAccount({ ...a })))
      }

      const importHistory = loadFromStorage<Array<Record<string, unknown>> | null>(STORAGE_KEYS.importHistory, null)
      if (Array.isArray(importHistory)) {
        saveToStorage(STORAGE_KEYS.importHistory, importHistory.filter(isRecord).map(b => normalizeImportBatch({ ...b })))
      }
    }
    // v3 — backfill updatedAt on all existing categories that lack it
    if (currentVersion < 3) {
      const categories = loadFromStorage<Array<Record<string, unknown>> | null>(KEYS.cats, null)
      if (Array.isArray(categories)) {
        const now = new Date().toISOString()
        saveToStorage(KEYS.cats, categories.filter(isRecord).map(c => ({
          ...c,
          updatedAt: c['updatedAt'] ?? now,
        })))
      }
    }
    // v4 — normalize batchId→importBatchId and backfill updatedAt on all transactions
    if (currentVersion < 4) {
      const transactions = loadFromStorage<Array<Record<string, unknown>> | null>(KEYS.transactions, null)
      if (Array.isArray(transactions)) {
        saveToStorage(KEYS.transactions, transactions.filter(isRecord).map(t => ({
          ...t,
          importBatchId: t['importBatchId'] ?? t['batchId'] ?? undefined,
          updatedAt: t['updatedAt'] ?? t['createdAt'] ?? new Date().toISOString(),
        })))
      }
    }
    saveRawToStorage(STORAGE_VERSION_KEY, String(STORAGE_VERSION))
  } catch {
    // Never block app startup because migration failed.
  }
}

export function loadTab(): Tab | null {
  const raw = loadRawFromStorage(KEYS.tab, '')
  if ((VALID_TABS as string[]).includes(raw)) return raw as Tab
  return null
}

export function loadPeriod(): Period | null {
  const raw = loadRawFromStorage(KEYS.period, '')
  if ((VALID_PERIODS as string[]).includes(raw)) return raw as Period
  return null
}

export function loadCategories(): Category[] | null              { return storageGet<Category[]>(KEYS.cats) }
export function loadSavedBudgets(): SavedBudget[] | null         { return storageGet<SavedBudget[]>(KEYS.budgets) }
export function loadSavedScenarios(): SavedScenarioSet[] | null  { return storageGet<SavedScenarioSet[]>(KEYS.scenarios) }
export function loadTargets(): Target[] | null                   { return storageGet<Target[]>(KEYS.targets) }
export function loadSavedTargetSets(): SavedTargetSet[] | null   { return storageGet<SavedTargetSet[]>(KEYS.targetSets) }
export function loadAccounts(): Account[] | null                 { return storageGet<Account[]>(KEYS.accounts) }
export function loadTransactions(): Transaction[] | null         { return storageGet<Transaction[]>(KEYS.transactions) }
export function loadTransactionRules(): TransactionRule[] | null { return storageGet<TransactionRule[]>(KEYS.transactionRules) }
export function loadTakeHomeSettings(): TakeHomeSettings | null  { return storageGet<TakeHomeSettings>(KEYS.takeHome) }
export function loadImportBatches(): ImportBatch[] | null        { return storageGet<ImportBatch[]>(STORAGE_KEYS.importHistory) }

export function saveTab(tab: Tab): void                         { saveRawToStorage(KEYS.tab, tab) }
export function savePeriod(p: Period): void                     { saveRawToStorage(KEYS.period, p) }
export function saveCategories(c: Category[]): void             { saveToStorage(KEYS.cats, c) }
export function saveSavedBudgets(b: SavedBudget[]): void        { saveToStorage(KEYS.budgets, b) }
export function saveSavedScenarios(s: SavedScenarioSet[]): void { saveToStorage(KEYS.scenarios, s) }
export function saveTargets(t: Target[]): void                  { saveToStorage(KEYS.targets, t) }
export function saveSavedTargetSets(s: SavedTargetSet[]): void  { saveToStorage(KEYS.targetSets, s) }
export function saveAccounts(a: Account[]): void                { saveToStorage(KEYS.accounts, a) }
export function saveTransactions(t: Transaction[]): void        { saveToStorage(KEYS.transactions, t) }
export function saveTransactionRules(r: TransactionRule[]): void { saveToStorage(KEYS.transactionRules, r) }
export function saveTakeHomeSettings(s: TakeHomeSettings): void { saveToStorage(KEYS.takeHome, s) }
export function saveImportBatches(b: ImportBatch[]): void       { saveToStorage(STORAGE_KEYS.importHistory, b) }

// ── Pending cloud deletions ──────────────────────────────────────────────────
// When the user deletes a record locally, we track its ID here so the next sync
// can mark the corresponding cloud record as deleted_at (soft delete).
// Cleared per-item after the sync confirms each deletion.

import { PENDING_DELETES_KEY } from './storageKeys'

export type PendingDeleteRecord = {
  table: string   // cloud table name
  localId: string
  deletedAt: string
}

export function loadPendingDeletes(): PendingDeleteRecord[] {
  try {
    const raw = localStorage.getItem(wsKey(PENDING_DELETES_KEY))
    return raw ? (JSON.parse(raw) as PendingDeleteRecord[]) : []
  } catch { return [] }
}

export function addPendingDelete(table: string, localId: string): void {
  try {
    const current = loadPendingDeletes()
    // Avoid duplicates
    if (current.some(d => d.table === table && d.localId === localId)) return
    current.push({ table, localId, deletedAt: new Date().toISOString() })
    localStorage.setItem(wsKey(PENDING_DELETES_KEY), JSON.stringify(current))
    // V55 — Notify the cloud sync hook so it can schedule an auto-sync.
    // addPendingDelete writes to localStorage only (not React state), so the
    // fingerprint never changes and auto-sync never fires unless we dispatch here.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('flow:pendingdelete'))
    }
  } catch { /* quota — ignore */ }
}

export function clearSyncedDeletes(synced: PendingDeleteRecord[]): void {
  try {
    const current = loadPendingDeletes()
    const remaining = current.filter(d =>
      !synced.some(s => s.table === d.table && s.localId === d.localId),
    )
    localStorage.setItem(wsKey(PENDING_DELETES_KEY), JSON.stringify(remaining))
  } catch { /* ignore */ }
}

// ── Backup / restore ──────────────────────────────────────────────────────────

/**
 * Serialises all known localStorage keys to a JSON string.
 * The result is self-contained and can be re-imported via importFromBackup().
 */
export function exportLocalBackup(): string {
  const data: Record<string, unknown> = {}
  for (const key of Object.values(STORAGE_KEYS)) {
    // Read from workspace-prefixed key (wsKey handles guest vs authenticated)
    const raw = localStorage.getItem(wsKey(key))
    if (raw !== null) {
      try { data[key] = JSON.parse(raw) }
      catch { data[key] = raw }
    }
  }
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    data,
  }, null, 2)
}

/**
 * Triggers a browser download of the current local backup as a .json file.
 */
export function downloadBackupFile(): void {
  const json = exportLocalBackup()
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `flow-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Imports a backup JSON file (produced by exportLocalBackup) back into localStorage.
 * Returns ok: false with an error message if the file is invalid.
 */
export function importFromBackup(json: string): { ok: boolean; error?: string } {
  try {
    const parsed = JSON.parse(json)
    const data: Record<string, unknown> = parsed.data ?? parsed
    for (const [key, value] of Object.entries(data)) {
      if (typeof key === 'string' && value !== undefined && value !== null) {
        try { localStorage.setItem(wsKey(key), JSON.stringify(value)) }
        catch { /* quota exceeded — skip */ }
      }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Invalid backup file.' }
  }
}

/**
 * Applies a CloudRestoreData object to localStorage so the app can reload with cloud state.
 * This is called after fetchCloudDataForRestore succeeds.
 */
export function applyCloudRestoreToLocalStorage(data: {
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
  actualsByPeriod?: Record<string, Record<string, string>>
  takeHomeSettings?: TakeHomeSettings | null
  monthlyNotes?: Record<string, string>
  reviewedMonths?: Record<string, string>
  scenarioNotes?: Record<string, string>
  categoryMemory?: Record<string, string>
}): void {
  saveAccounts(data.accounts)
  saveCategories(data.categories)
  saveTransactions(data.transactions)
  saveImportBatches(data.importBatches)
  saveTransactionRules(data.rules)
  saveTargets(data.targets)
  saveSavedTargetSets(data.savedTargetSets)
  saveSavedScenarios(data.savedScenarios)
  saveSavedBudgets(data.savedBudgets)
  if (data.actualsByPeriod && Object.keys(data.actualsByPeriod).length > 0) {
    saveToStorage(STORAGE_KEYS.budgetActuals, { version: 2, actualsByPeriod: data.actualsByPeriod })
  } else if (data.actuals) {
    saveToStorage(STORAGE_KEYS.budgetActuals, { version: 2, lastPeriodKey: 'restored', actualsByPeriod: { restored: data.actuals } })
  }
  if (data.takeHomeSettings) {
    saveTakeHomeSettings(data.takeHomeSettings)
  }
  if (data.monthlyNotes && Object.keys(data.monthlyNotes).length > 0) {
    saveToStorage(STORAGE_KEYS.monthlyNotes, data.monthlyNotes)
  }
  if (data.reviewedMonths && Object.keys(data.reviewedMonths).length > 0) {
    saveToStorage(STORAGE_KEYS.reviewedMonths, data.reviewedMonths)
  }
  if (data.scenarioNotes && Object.keys(data.scenarioNotes).length > 0) {
    saveToStorage(STORAGE_KEYS.scenarioNotes, data.scenarioNotes)
  }
  if (data.categoryMemory && Object.keys(data.categoryMemory).length > 0) {
    saveToStorage(STORAGE_KEYS.categoryMemory, data.categoryMemory)
  }
}

// ─── V45: Extra incomes ───────────────────────────────────────────────────────

export function loadPayStubs(): PayStub[] | null {
  return storageGet<PayStub[]>('flow-pay-stubs')
}
export function savePayStubs(stubs: PayStub[]): void {
  saveToStorage('flow-pay-stubs', stubs)
}

export function loadExtraIncomes(): ExtraIncome[] {
  return storageGet<ExtraIncome[]>(STORAGE_KEYS.extraIncomes) ?? []
}
export function saveExtraIncomes(items: ExtraIncome[]): void {
  saveToStorage(STORAGE_KEYS.extraIncomes, items)
}

// ─── V45: Export history ──────────────────────────────────────────────────────

export function loadExportHistory(): ExportRecord[] {
  return storageGet<ExportRecord[]>(STORAGE_KEYS.exportHistory) ?? []
}
export function saveExportHistory(history: ExportRecord[]): void {
  saveToStorage(STORAGE_KEYS.exportHistory, history.slice(0, 50)) // keep last 50
}

export function loadSandboxDrafts(): SandboxDraft[] {
  return storageGet<SandboxDraft[]>(STORAGE_KEYS.sandboxDrafts) ?? []
}
export function saveSandboxDrafts(drafts: SandboxDraft[]): void {
  saveToStorage(STORAGE_KEYS.sandboxDrafts, drafts)
}

export function recordExportAndDownload(): void {
  const json = exportLocalBackup()
  const blob = new Blob([json], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  const dateStr = new Date().toISOString().slice(0, 10)
  a.href     = url
  a.download = `flow-backup-${dateStr}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  // Record in history
  const record: ExportRecord = {
    id: crypto.randomUUID(),
    exportedAt: new Date().toISOString(),
    fileSizeKb: Math.round(blob.size / 1024),
  }
  saveExportHistory([record, ...loadExportHistory()])
}
