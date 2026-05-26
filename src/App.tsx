import { useEffect, useMemo, useRef, useState } from 'react'
import type { Tab, Period, CategoryType, Category, ScenarioName, SavedBudget, BudgetSnapshot, Contribution, Target, SavedTargetSet, AccountType, Account, TransactionType, Transaction, TransactionRule, ImportBatch, ImportPreset } from './types'

import { currency, labelPeriod } from './utils/formatting'
import {
  BASE_SALARY,
  HOURS_PER_WEEK,
  BUMP_THRESHOLDS,
  convertFromMonthly,
  convertToMonthly,
  remainingTierFromPeriodValue,
  income,
  estimateTaxBreakdown,
  computeTargetStatus,
  requiredForTarget,
} from './utils/calculations'
import type { DashboardStatus } from './utils/calculations'
import {
  loadPeriod,
  loadCategories,
  loadSavedBudgets,
  loadTargets,
  loadSavedTargetSets,
  loadAccounts,
  loadTransactions,
  loadTransactionRules,
  savePeriod,
  saveCategories,
  saveSavedBudgets,
  saveTargets,
  saveSavedTargetSets,
  saveAccounts,
  saveTransactions,
  saveTransactionRules,
  runMigrations,
  downloadBackupFile,
  addPendingDelete,
  loadPendingDeletes,
  loadTakeHomeSettings,
  saveTakeHomeSettings,
  saveImportBatches,
  saveToStorage,
  applyCloudRestoreToLocalStorage,
} from './utils/storage'
import {
  loadBudgetActuals,
  loadBudgetActualsForPeriod,
  saveBudgetActualsForPeriod,
  loadAllBudgetActualsByPeriod,
  currentReviewMonth,
  prevMonthKey,
  loadCategoryRollovers,
  saveCategoryRollovers,
  loadReviewMonth,
  saveReviewMonth,
  loadMonthlyNotes,
  saveMonthlyNotes,
  loadReviewedMonths,
  saveReviewedMonths,
  loadManualRecurringItems,
  saveManualRecurringItems,
} from './utils/persistence'
// V9.0 — CSV import pipeline
import { runImportPipeline, buildImportedTransactions } from './utils/importHelpers'
import type { ImportPipelineResult } from './utils/importHelpers'
import { parseCsv, detectColumns, generateSampleCsvString } from './utils/csv'
// V10.1 — extracted helpers
import { normalizeMerchant } from './utils/merchantNormalization'
import { loadCategoryMemory, saveCategoryMemory } from './utils/categoryMemory'
import { resolveHint } from './utils/importHints'
import { detectRecurringPatterns } from './utils/recurring'
// V10.2 — extracted calculation helpers
import { getPeriodDateRange } from './utils/calculations'
import { varianceTone, catStatus } from './utils/budgetMath'
import {
  computeNetWorth, computeBalanceCheckData, computeReconciliationData,
} from './utils/accountMath'
import type { BalanceCheckEntry, ReconciliationEntry } from './utils/accountMath'
import type { RecurringCadence, ManualRecurringItem } from './utils/forecastMath'
// V10.3 — extracted UI components and helpers
import { Card, Pill, Metric, Info, ActionCard, Row } from './components/ui'
import { txNeedsReview } from './utils/transactionHelpers'
import { TXN_TYPE_LABELS, TXN_FILTER_OPTIONS } from './utils/transactionHelpers'
import { TransactionsTab } from './components/TransactionsTab'
import { detectRuleConflict } from './utils/rulesEngine'
import {
  addAccount,
  updateAccount,
  reconcileAccountAction,
  addTransaction,
  buildTransactionFromForm,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
  assignTransactionCategoryBulk,
  applyTransactionRulesAction,
  buildRuleFromForm,
  addRule,
  updateRule,
  createBulkMerchantRuleSuggestionForTransactions,
  addSavingsGoal,
  buildTargetFromForm,
  updateSavingsGoal,
  addContribution,
  updateContribution,
  saveGoalSet,
  loadGoalSet,
  renameGoalSet,
  deleteGoalSet,
} from './utils/actions'
import { hasDuplicateTransaction } from './utils/duplicateDetection'
import { GoalPlanningSummary } from './components/GoalPlanningSummary'
import { GoalCard } from './components/GoalCard'
import { useScenarios } from './hooks/useScenarios'
import { useForecast } from './hooks/useForecast'
import { useImportPipeline } from './hooks/useImportPipeline'
import { useDashboardMetrics } from './hooks/useDashboardMetrics'
import { useToastSystem } from './hooks/useToastSystem'
import { useUiState } from './hooks/useUiState'
import { useInlineEditTimer } from './hooks/useInlineEdit'
import { useNeedsReview } from './hooks/useNeedsReview'
// V12.2 — Supabase auth foundation
import { AuthPanel } from './components/AuthPanel'
import { ProfilePanel } from './components/ProfilePanel'
import { OnboardingGuide } from './components/OnboardingGuide'
import { CommandPalette } from './components/CommandPalette'
import { Sidebar } from './components/Sidebar'
import { CloudStatusButton } from './components/CloudStatusButton'
import { BankSelector } from './components/BankSelector'
import { AIChatDrawer } from './components/AIChatDrawer'
import { BreakdownEditor } from './components/BreakdownEditor'
import type { BreakdownItem } from './types'
import { KeyboardShortcutsPanel } from './components/KeyboardShortcutsPanel'
import { ConflictResolutionModal } from './components/ConflictResolutionModal'
import { useCloudPersistence } from './hooks/useCloudPersistence'
import { supabase } from './lib/supabaseClient'
// V13 — Intelligence layer
import { SpendingInsightsPanel } from './components/SpendingInsightsPanel'
import { generateSpendingInsights, generateMonthlyReviewSummary } from './utils/spendingInsights'
// V14 — AI assistant
import { AIAssistantPanel } from './components/AIAssistantPanel'
import { useAIAssistant } from './hooks/useAIAssistant'
// V15 — Version badge
import { VersionBadge } from './components/VersionBadge'
import { CURRENT_VERSION } from './utils/changelog'
// V16 — Settings, onboarding, demo mode
import { SettingsPanel } from './components/SettingsPanel'
import { OnboardingCard } from './components/OnboardingCard'
import { PersonalPreloadCard } from './components/PersonalPreloadCard'
import { DEMO_ACCOUNTS, DEMO_CATEGORIES, DEMO_TRANSACTIONS, DEMO_TARGETS, DEMO_RULES } from './utils/demoData'
import { ZYAN_PERSONAL_PRELOAD } from './utils/personalPreloadData'
import type { PersonalPreloadData } from './utils/personalPreloadData'
import { loadZyanCustomPreload, saveZyanCustomPreload } from './utils/personalDefault'
import { STORAGE_KEYS } from './utils/storageKeys'
import { useAuth } from './hooks/useAuth'
import { fetchCloudDataForRestore } from './utils/cloudRestore'
import { importFromBackup } from './utils/storage'

// Helper: true for transaction types that represent money movement between accounts
const isMoneyMovement = (type: TransactionType): boolean =>
  type === 'transfer' || type === 'credit card payment'

// ── V9.6 Apple Card & payment helpers ────────────────────────────────────────
/** True if CSV headers look like an Apple Card export. */
const detectAppleCard = (headerLine: string): boolean => {
  const h = headerLine.toLowerCase()
  return h.includes('merchant') && (h.includes('amount (usd)') || h.includes('transaction date'))
}

/** Normalize Apple Card CSV header row so detectColumns() maps correctly. */
function normalizeAppleCardHeaders(csvText: string): string {
  const lines = csvText.split('\n')
  if (!lines.length) return csvText
  lines[0] = lines[0]
    .replace(/Transaction Date/gi, 'Date')
    .replace(/Amount \(USD\)/gi, 'Amount')
    .replace(/Clearing Date/gi, 'ClearingDate')   // prevent accidental date mapping
    .replace(/Purchased By/gi, 'PurchasedBy')      // prevent mapping to merchant
  return lines.join('\n')
}

/** Extract category hints keyed by "date|merchant|absAmount" from raw parsed rows. */
function extractCategoryHints(rows: Array<Record<string, string>>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const row of rows) {
    const cat      = (row['Category'] ?? row['category'] ?? '').trim()
    const merchant = (row['Merchant'] ?? row['merchant'] ?? row['Description'] ?? '').trim()
    const date     = (row['Date'] ?? row['date'] ?? row['Transaction Date'] ?? '').trim()
    const amt      = Math.abs(parseFloat((row['Amount'] ?? row['amount'] ?? '0').replace(/[^0-9.-]/g, '')) || 0).toFixed(2)
    if (cat && merchant && date) map[`${date}|${merchant.toLowerCase()}|${amt}`] = cat
  }
  return map
}

// ── V10.0 Category Memory ─────────────────────────────────────────────────────
// Persists normalized-merchant → categoryId to improve future import hints.
/** Payment/transfer merchant patterns that should be flagged for review rather than categorized. */
const PAYMENT_PATTERNS = /payment|transfer|zelle|venmo|paypal|apple cash|e-payment|gsbank|discover e|online transfer/i

// ── V9.9 PDF Import ───────────────────────────────────────────────────────────
type PdfImportRow = { date: string; merchant: string; amount: number; confidence: 'high' | 'medium' | 'low'; isDup?: boolean }

/**
 * Extract transaction rows from raw PDF text (text-based/accessible PDFs only).
 * Parses common bank statement line formats using date + description + amount patterns.
 * Does not attempt OCR — image-only PDFs will return an empty result with a warning.
 */
function parsePdfText(raw: string): { rows: PdfImportRow[]; warning: string } {
  // Normalize raw text: strip common PDF binary noise, collapse whitespace
  const text = raw
    .replace(/\r\n/g, '\n')
    .replace(/[^\x09\x0A\x20-\x7E]/g, ' ')  // keep tab, newline, printable ASCII
    .replace(/\s{3,}/g, '\n')                 // dense whitespace → newline (common in PDF extraction)
    .replace(/[ \t]+/g, ' ')

  const rows: PdfImportRow[] = []
  const seen = new Set<string>()

  // Pattern A: MM/DD or MM/DD/YY or MM/DD/YYYY  DESCRIPTION  AMOUNT
  // e.g. "01/15 Netflix.com 15.99" or "01/15/2025 STARBUCKS #1234 6.75"
  const patA = /(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\s+([\w *&\-'/.,#]{3,55}?)\s+(-?[\d,]+\.\d{2})\b/g
  // Pattern B: lines where amount appears first then description then date (some Chase formats)
  const patB = /(-?[\d,]+\.\d{2})\s+([\w *&\-'/.,#]{3,55}?)\s+(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/g

  const addRow = (dateRaw: string, desc: string, amtRaw: string) => {
    const amount = Math.abs(parseFloat(amtRaw.replace(/,/g, '')))
    if (!amount || amount > 99_999) return
    const parts = dateRaw.split('/')
    const month = String(parseInt(parts[0])).padStart(2, '0')
    const day   = String(parseInt(parts[1])).padStart(2, '0')
    const rawYr = parts[2]
    const year  = rawYr ? (rawYr.length === 2 ? '20' + rawYr : rawYr) : String(new Date().getFullYear())
    const date  = `${year}-${month}-${day}`
    const merchant = desc.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (merchant.length < 2) return
    const key = `${date}|${merchant.toLowerCase()}|${amount.toFixed(2)}`
    if (seen.has(key)) return
    seen.add(key)
    rows.push({ date, merchant, amount, confidence: 'medium' })
  }

  let m: RegExpExecArray | null
  while ((m = patA.exec(text)) !== null) addRow(m[1], m[2], m[3])
  while ((m = patB.exec(text)) !== null) addRow(m[3], m[2], m[1])

  const warning = rows.length === 0
    ? 'PDF statement parsing is still experimental. This file could not be parsed automatically yet. Try a CSV export or an "accessible" PDF export from your bank.'
    : rows.length < 3
    ? `PDF statement parsing is still experimental. Only ${rows.length} transaction${rows.length > 1 ? 's' : ''} detected — review carefully before importing.`
    : ''

  return { rows, warning }
}
// Reserved for the upcoming AI PDF parsing fallback flow. Do not remove; this keeps the parser available while the UI wiring is being completed.
void parsePdfText

// ── V9.7 Recurring detection ──────────────────────────────────────────────────
// RecurringCadence and ManualRecurringItem types imported from forecastMath.ts

// ── V9.5 Review classification ────────────────────────────────────────────────
// txNeedsReview and txConfidence imported from utils/transactionHelpers
// TXN_TYPE_LABELS, TXN_FILTER_OPTIONS imported from utils/transactionHelpers

const presetTypeMap: Record<string, CategoryType> = {
  Bike: 'fixed bill',
  Braiding: 'fixed bill',
  BTM: 'fixed bill',
  Car: 'variable spending',
  Cash: 'variable spending',
  'Emergency Fund': 'savings',
  Gas: 'variable spending',
  Haircut: 'fixed bill',
  'Long-term Savings': 'savings',
  Passive: 'investing',
  Shopping: 'variable spending',
  Story: 'investing',
  Subscriptions: 'fixed bill',
  Takeout: 'variable spending',
  Tuition: 'fixed bill',
}
const categorySuggestions = Object.keys(presetTypeMap).sort((a, b) => a.localeCompare(b))

const ACCOUNT_TYPES: AccountType[] = ['checking', 'savings', 'credit card', 'investment', 'cash', 'roth ira', 'retirement', 'other']
const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  'checking':    'Checking',
  'savings':     'Savings',
  'credit card': 'Credit Card',
  'investment':  'Investment',
  'cash':        'Cash',
  'roth ira':    'Roth IRA',
  'retirement':  'Retirement',
  'other':       'Other',
}
// TXN_TYPES local constant (not exported, only used by Log Transaction form in App)
const TXN_TYPES: TransactionType[] = ['expense', 'income', 'transfer', 'credit card payment']
const targetPresets = ['Bike', 'Emergency Fund', 'Long-term Savings', 'Tuition', 'Custom']
// tabTips removed — navigation moved to Sidebar component (V29)

// ── V8.4 Period date-range helper ────────────────────────────────────────────
// Returns the [start, end] date strings (YYYY-MM-DD) for the current calendar
// window of the selected period. Used to filter transactions into actuals.
// ── V8.4.2 Sample generator data pools ───────────────────────────────────────
// Typed merchant pools — ensures type always matches merchant context
const EXPENSE_MERCHANTS  = ['Target', 'Walmart', "Fry's", 'Shell', 'Chevron', 'Costco', 'Amazon', 'Starbucks', 'Chipotle', 'Uber', 'Best Buy', 'CVS', "McDonald's", 'Walgreens', 'Apple', 'Lyft']
const INCOME_MERCHANTS   = ['Payroll', 'Direct Deposit', 'Paycheck', 'Bonus', 'Refund', 'Venmo Cashout', 'Tax Refund']
const TRANSFER_MERCHANTS = ['Chase Transfer', 'Savings Transfer', 'Internal Transfer', 'Brokerage Transfer']
// Keep for backward-compat references (generateTenSamples uses it)
const SAMPLE_ACCOUNT_TEMPLATES: Array<{ name: string; type: AccountType; balance: number; institution: string }> = [
  { name: 'Chase Checking',       type: 'checking',    balance: 2500,   institution: 'Chase'            },
  { name: 'Ally Savings',         type: 'savings',     balance: 8500,   institution: 'Ally'             },
  { name: 'SoFi Checking',        type: 'checking',    balance: 1800,   institution: 'SoFi'             },
  { name: 'Robinhood Investing',  type: 'investment',  balance: 12000,  institution: 'Robinhood'        },
  { name: 'Fidelity Roth IRA',    type: 'roth ira',    balance: 25000,  institution: 'Fidelity'         },
  { name: 'Amex Gold',            type: 'credit card', balance: -1200,  institution: 'American Express' },
  { name: 'Capital One Venture',  type: 'credit card', balance: -450,   institution: 'Capital One'      },
  { name: 'Wells Fargo Checking', type: 'checking',    balance: 3200,   institution: 'Wells Fargo'      },
  { name: 'Cash Wallet',          type: 'cash',        balance: 80,     institution: ''                 },
  { name: 'Vanguard Retirement',  type: 'retirement',  balance: 48000,  institution: 'Vanguard'         },
]
const SAMPLE_GOAL_NAMES = ['Emergency Fund', 'Vacation', 'New Car', 'Roth IRA', 'Moving Fund', 'Wedding', 'New Bike', 'Laptop', 'Tuition', 'House Down Payment', 'Car Repair', 'Travel Fund']
const SAMPLE_RULE_TEMPLATES: Array<{ name: string; matchText: string }> = [
  { name: 'Target Shopping', matchText: 'Target, TGT'     },
  { name: 'Gas Stations',    matchText: 'Shell, Chevron'  },
  { name: 'Coffee Shops',    matchText: 'Starbucks'       },
  { name: 'Ride Share',      matchText: 'Uber, Lyft'      },
  { name: 'Groceries',       matchText: 'Walmart, Costco' },
  { name: 'Fast Food',       matchText: "McDonald's, Chipotle" },
]
const SAMPLE_BUDGET_CATS: Array<{ name: string; type: CategoryType; monthly: number }> = [
  { name: 'Groceries',      type: 'variable spending', monthly: 400  },
  { name: 'Gas',            type: 'variable spending', monthly: 120  },
  { name: 'Dining',         type: 'variable spending', monthly: 200  },
  { name: 'Rent',           type: 'fixed bill',        monthly: 1800 },
  { name: 'Internet',       type: 'fixed bill',        monthly: 60   },
  { name: 'Insurance',      type: 'fixed bill',        monthly: 180  },
  { name: 'Investing',      type: 'investing',         monthly: 300  },
  { name: 'Emergency Fund', type: 'savings',           monthly: 200  },
  { name: 'Entertainment',  type: 'variable spending', monthly: 80   },
  { name: 'Travel',         type: 'savings',           monthly: 150  },
]

// TXN_FILTER_OPTIONS imported from utils/transactionHelpers

const periods: Period[] = ['weekly', 'bi-weekly', 'monthly', 'yearly']

export default function App() {
  const appAuth = useAuth()
  const autoCloudRestoreAttemptedRef = useRef(false)
  const incomeRef = useRef<HTMLInputElement>(null)
  const budgetCategoryTableRef = useRef<HTMLDivElement>(null)
  const budgetNameRef = useRef<HTMLInputElement>(null)
  const autocompleteWrapRef = useRef<HTMLDivElement>(null)
  const budgetAmountRef = useRef<HTMLInputElement>(null)
  const budgetTypeRef = useRef<HTMLSelectElement>(null)
  const scenarioSlowRef = useRef<HTMLInputElement>(null)
  const targetNameRef = useRef<HTMLInputElement>(null)
  const targetGoalRef = useRef<HTMLInputElement>(null)
  const targetSavedRef = useRef<HTMLInputElement>(null)
  const targetDeadlineRef = useRef<HTMLInputElement>(null)
  const targetStartDateRef = useRef<HTMLInputElement>(null)
  const targetAutocompleteWrapRef = useRef<HTMLDivElement>(null)
  const editGoalAmountRef = useRef<HTMLInputElement>(null)
  const startDateArrowCount = useRef(0)
  const deadlineArrowCount = useRef(0)
  const startDateLeftArrowCount = useRef(0)
  const deadlineLeftArrowCount = useRef(0)

  const {
    tab,
    setTab,
    showScrollTop,
    fullyFundedOpen,
    setFullyFundedOpen,
    completedOpen,
    setCompletedOpen,
    showRecentlyDeleted,
    setShowRecentlyDeleted,
    reviewOpen,
    setReviewOpen,
  } = useUiState()
  const {
    selectedTxnIds,
    setSelectedTxnIds,
    bulkCategoryId,
    setBulkCategoryId,
    ruleSuggestion,
    setRuleSuggestion,
    lastReviewSelectIdxRef,
    clearReviewSelection,
  } = useNeedsReview()

  const [period, setPeriod] = useState<Period>('weekly')
  const [gpInput, setGpInput] = useState('0')
  const [categories, setCategories] = useState<Category[]>([])
  const [savedBudgets, setSavedBudgets] = useState<SavedBudget[]>([])

  // ══════════════════════════════════════════════════════════════════════════════
  // V11.3 — Scenario state/workflows extracted to useScenarios()
  // ══════════════════════════════════════════════════════════════════════════════
  const {
    scenario,
    setScenario,
    savedScenarios,
    setSavedScenarios,
    scenarioNotes,
    setScenarioNotes,
    editingScenarioName,
    setEditingScenarioName,
    renameScenarioValue,
    setRenameScenarioValue,
    scenarioStressMode,
    setScenarioStressMode,
    showStressTest,
    setShowStressTest,
    scenarioTitle,
    setScenarioTitle,
    saveScenarioSet,
    renameScenarioSet,
  } = useScenarios()
  const [targets, setTargets] = useState<Target[]>([])
  const [savedTargetSets, setSavedTargetSets] = useState<SavedTargetSet[]>([])
  const [targetSetName, setTargetSetName] = useState('')
  const [targetForm, setTargetForm] = useState(() => ({ name: '', goalAmount: '', currentSaved: '', startDate: new Date().toISOString().slice(0, 10), deadline: '' }))
  const [targetLogForm, setTargetLogForm] = useState<Record<string, { date: string; amount: string; note: string }>>({})
  const [dashboardQuickDate, setDashboardQuickDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dashboardQuickTargetId, setDashboardQuickTargetId] = useState('')
  const [dashboardQuickAmount, setDashboardQuickAmount] = useState('')
  const [baseBumpsAchieved, setBaseBumpsAchieved] = useState(0)
  const [budgetTitle, setBudgetTitle] = useState('')
  const [changeSummary, setChangeSummary] = useState<string[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [sIndex, setSIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [showTargetSuggestions, setShowTargetSuggestions] = useState(false)
  const [targetSuggestionIndex, setTargetSuggestionIndex] = useState(-1)
  const [editTargetHint, setEditTargetHint] = useState('') 
  const [budgetFormHint, setBudgetFormHint] = useState('')
  const [targetFormHint, setTargetFormHint] = useState('')
  const [budgetHistory, setBudgetHistory] = useState<BudgetSnapshot[]>([])
  const [budgetRedo, setBudgetRedo] = useState<BudgetSnapshot[]>([])
  const [form, setForm] = useState({ name: '', amount: '', type: 'fixed bill' as CategoryType })

  // ── V7.5 Plan vs Actual ──────────────────────────────────────────────────────
  // Keyed by category id → raw string so blank stays blank, never forced to "0".
  // Lazy-initialized from localStorage so the save effect can't overwrite stored
  // data with the empty default on the first render (effects fire after render).
  // V19 — period-keyed actuals (YYYY-MM). Falls back to legacy data on first load.
  const currentActualsPeriodKey = currentReviewMonth()
  const [actuals, setActuals] = useState<Record<string, string>>(() => {
    const periodActuals = loadBudgetActualsForPeriod(currentActualsPeriodKey)
    return Object.keys(periodActuals).length > 0 ? periodActuals : loadBudgetActuals()
  })

  // Persist actuals under current period key
  useEffect(() => {
    saveBudgetActualsForPeriod(currentActualsPeriodKey, actuals)
  }, [actuals, currentActualsPeriodKey])

  // Target edit state
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [editTargetForm, setEditTargetForm] = useState({ name: '', goalAmount: '', currentSaved: '', startDate: '', deadline: '' })
  const [editTargetOriginal, setEditTargetOriginal] = useState<Target | null>(null)

  // Contribution edit state
  const [editContributionId, setEditContributionId] = useState<string | null>(null)
  const [editContributionTargetId, setEditContributionTargetId] = useState<string | null>(null)
  const [editContributionForm, setEditContributionForm] = useState({ date: '', amount: '', note: '' })

  // Target undo/redo
  const [targetHistory, setTargetHistory] = useState<Target[][]>([])
  const [targetRedo, setTargetRedo] = useState<Target[][]>([])

  // Form-level undo history for Create Savings Goal form (for Duplicate preload undo)
  const [targetFormHistory, setTargetFormHistory] = useState<Array<{ name: string; goalAmount: string; currentSaved: string; startDate: string; deadline: string }>>([])
  const [targetFormRedo, setTargetFormRedo] = useState<Array<{ name: string; goalAmount: string; currentSaved: string; startDate: string; deadline: string }>>([])

  // Track which targets have already been shown the deadline-passed popup
  const [deadlinePassedPrompted, setDeadlinePassedPrompted] = useState<Set<string>>(new Set())

  // Track which goal cards have expanded details visible
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  // V11.5 — Toast notification state/helpers extracted to useToastSystem()
  const {
    toast,
    showToast,
    showUndoableToast,
    dismissToast,
    runToastUndo,
  } = useToastSystem()

  // Highlighted budget category (after Add to Current Budget)
  const [highlightedCategoryId, setHighlightedCategoryId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [highlightedAccountId, setHighlightedAccountId]     = useState<string | null>(null)
  const [highlightedTxnId, setHighlightedTxnId]             = useState<string | null>(null)
  const [highlightedRuleId, setHighlightedRuleId]           = useState<string | null>(null)
  const [highlightedTargetId, setHighlightedTargetId]       = useState<string | null>(null)
  const highlightAccountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightTxnTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightRuleTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightTargetTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // V7.7: Budget Pressure Focus — highlights the over-plan row and focuses its actual input
  const [pressureFocusCategoryId, setPressureFocusCategoryId] = useState<string | null>(null)
  const pressureFocusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keyed by category id → ref to that row's actual input
  const actualInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // V7.7.1: Parallel undo/redo stacks for actuals (mirrors budget history timing)
  const [, setActualsHistory] = useState<Array<Record<string, string>>>([])
  const [, setActualsRedo] = useState<Array<Record<string, string>>>([])

  // Refs for edit-mode fields inside target cards
  const editCurrentSavedRef = useRef<HTMLInputElement>(null)
  const editStartDateRef = useRef<HTMLInputElement>(null)
  const editDeadlineRef = useRef<HTMLInputElement>(null)
  const editStartDateArrowCount = useRef(0)
  const editDeadlineArrowCount = useRef(0)
  const editStartDateLeftArrowCount = useRef(0)
  const editDeadlineLeftArrowCount = useRef(0)
  // Blur-save timer: delays save so focus moving between edit fields doesn't trigger premature save
  const { timerRef: editBlurTimerRef } = useInlineEditTimer()

  // Auto-clear timers for inline hint/warning messages
  const budgetHintTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const targetHintTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const editTargetHintTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accountHintTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const txnHintTimerRef          = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setTimedBudgetFormHint = (msg: string) => {
    setBudgetFormHint(msg)
    if (budgetHintTimerRef.current) clearTimeout(budgetHintTimerRef.current)
    if (msg) budgetHintTimerRef.current = setTimeout(() => setBudgetFormHint(''), 10000)
  }
  const setTimedTargetFormHint = (msg: string) => {
    setTargetFormHint(msg)
    if (targetHintTimerRef.current) clearTimeout(targetHintTimerRef.current)
    if (msg) targetHintTimerRef.current = setTimeout(() => setTargetFormHint(''), 10000)
  }
  const setTimedEditTargetHint = (msg: string) => {
    setEditTargetHint(msg)
    if (editTargetHintTimerRef.current) clearTimeout(editTargetHintTimerRef.current)
    if (msg) editTargetHintTimerRef.current = setTimeout(() => setEditTargetHint(''), 10000)
  }

  const setTimedAccountHint = (msg: string) => {
    setAccountHint(msg)
    if (accountHintTimerRef.current) clearTimeout(accountHintTimerRef.current)
    if (msg) accountHintTimerRef.current = setTimeout(() => setAccountHint(''), 10000)
  }

  const setTimedTxnHint = (msg: string) => {
    setTxnHint(msg)
    if (txnHintTimerRef.current) clearTimeout(txnHintTimerRef.current)
    if (msg) txnHintTimerRef.current = setTimeout(() => setTxnHint(''), 10000)
  }

  // V8 — Account form refs
  const accountNameRef    = useRef<HTMLInputElement>(null)
  const accountTypeRef    = useRef<HTMLSelectElement>(null)
  const accountBalanceRef = useRef<HTMLInputElement>(null)
  const accountInstRef    = useRef<HTMLInputElement>(null)

  // V8 — Transaction form refs
  const txnDateRef          = useRef<HTMLInputElement>(null)
  const txnAccountRef       = useRef<HTMLSelectElement>(null)
  const txnMerchantRef      = useRef<HTMLInputElement>(null)
  const txnAmountRef        = useRef<HTMLInputElement>(null)
  const txnTypeRef          = useRef<HTMLSelectElement>(null)
  const txnCategoryRef      = useRef<HTMLSelectElement>(null)
  const txnNotesRef         = useRef<HTMLInputElement>(null)
  // V8.10 — guards Amount onBlur from re-writing state after Enter-submit
  const txnSubmittingRef    = useRef(false)
  // V8.10 — counts ArrowRight presses inside date input (3 segments: mm / dd / yyyy)
  const txnDateArrowCountRef = useRef(0)

// V8.3 — Rule form refs
  const ruleNameRef           = useRef<HTMLInputElement>(null)
  const ruleMatchTextRef      = useRef<HTMLInputElement>(null)

  // V8.6.1 — Inline txn edit field refs (programmatic focus on Edit click + ArrowLeft/Right nav)
  const inlineTxnAmountRef    = useRef<HTMLInputElement>(null)
  const inlineTxnMerchantRef  = useRef<HTMLInputElement>(null)
  const inlineTxnTypeRef      = useRef<HTMLSelectElement>(null)
  const inlineTxnCategoryRef  = useRef<HTMLSelectElement>(null)
  // V10.3 — Row ref for transaction inline edit blur-save (extracted to TransactionsTab component)
  const inlineTxnRowRef       = useRef<HTMLTableRowElement | null>(null)
// V8.6.1 — Inline rule edit refs
  const inlineRuleNameRef   = useRef<HTMLInputElement>(null)
  const inlineRuleMatchRef  = useRef<HTMLInputElement>(null)
  const inlineRuleFieldRef  = useRef<HTMLSelectElement>(null)
  const inlineRuleCatRef    = useRef<HTMLSelectElement>(null)
  const inlineRuleTypeRef   = useRef<HTMLSelectElement>(null)
  const inlineRuleSaveRef   = useRef<HTMLButtonElement>(null)
  // V8.6.1 — Blur-save: timer lets focus move between inline fields without premature save
  const { timerRef: inlineEditBlurTimerRef, cancel: cancelInlineEditBlur, schedule: scheduleInlineEditBlurSave } = useInlineEditTimer()

  // Refs for Log Contribution fields per target card (keyed by target id)
  const logDateRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const logAmountRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const logNoteRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const logDateArrowCounts = useRef<Record<string, number>>({})

  // V8 — Accounts
  const [accounts, setAccounts]               = useState<Account[]>([])
  const [accountForm, setAccountForm]         = useState({ name: '', type: 'checking' as AccountType, balance: '', institution: '' })
  const [editAccountId, setEditAccountId]     = useState<string | null>(null)
  const [accountHistory, setAccountHistory]   = useState<Account[][]>([])
  const [accountRedo, setAccountRedo]         = useState<Account[][]>([])

  // V9.3 — Inline account edit (row-level, top form stays create-only)
  const [inlineAccountEditId, setInlineAccountEditId] = useState<string | null>(null)
  const [inlineAccountEditForm, setInlineAccountEditForm] = useState({
    name: '', type: 'checking' as AccountType, balance: '', institution: '',
  })
  const inlineAccountNameRef    = useRef<HTMLInputElement>(null)
  const inlineAccountBalanceRef = useRef<HTMLInputElement>(null)
  // V9.3.2 — Row-level ref for account inline edit blur-save (mirrors inlineCatRowRef pattern)
  const inlineAccountRowRef     = useRef<HTMLTableRowElement | null>(null)
  // V9.3.2 — Row-level ref for savings goal set rename blur-save
  const renameSetRowRef         = useRef<HTMLDivElement | null>(null)

  // V9.3 — Saved budget inline rename (mirrors Savings Goal Set pattern)
  const [editingBudgetIdx, setEditingBudgetIdx]   = useState<number | null>(null)
  const [renameBudgetValue, setRenameBudgetValue] = useState('')
  const renameBudgetInputRef = useRef<HTMLInputElement>(null)

  // V8 — Transactions
  const [transactions, setTransactions]       = useState<Transaction[]>([])
  const [txnForm, setTxnForm]                 = useState({
    date: new Date().toISOString().slice(0, 10),
    accountId: '',
    merchant: '',
    amount: '',
    type: 'expense' as TransactionType,
    categoryId: '',
    notes: '',
    toAccountId: '',
  })
  const [txnHistory, setTxnHistory]           = useState<Transaction[][]>([])
  const [txnRedo, setTxnRedo]                 = useState<Transaction[][]>([])

// V8.5 — review / filter
  const [txnFilter, setTxnFilter]             = useState<typeof TXN_FILTER_OPTIONS[number]['value']>('all')
  const [txnDupWarning, setTxnDupWarning]     = useState(false)
  // V8.7 — tracks how many uncategorized txns were visible when pill was last clicked
  const [accountHint, setAccountHint]         = useState('')
  const [txnHint, setTxnHint]                 = useState('')

  // V11.4 — Import pipeline state/orchestration hook
  const csvFileInputRef = useRef<HTMLInputElement>(null)
  const {
    csvImportOpen,
    setCsvImportOpen,
    csvImportPreview,
    setCsvImportPreview,
    csvImportLoading,
    setCsvImportLoading,
    csvImportError,
    setCsvImportError,
    csvImportAccountId,
    setCsvImportAccountId,
    csvImportMonth,
    setCsvImportMonth,
    csvIsAppleCard,
    setCsvIsAppleCard,
    csvCategoryHints,
    setCsvCategoryHints,
    importBatches,
    setImportBatches,
    csvShowHistory,
    setCsvShowHistory,
    csvImportPreset,
    setCsvImportPreset,
    csvColumnMapping,
    setCsvColumnMapping,
    batchToDelete,
    setBatchToDelete,
    csvImportIsPdf,
    setCsvImportIsPdf,
    pdfPreviewRows,
    setPdfPreviewRows,
    pdfParseWarning,
    setPdfParseWarning,
    resetImportPreview,
    resetImportSession,
  } = useImportPipeline()

  // V9.11 — Budget evolution state
  const [categoryRollovers, setCategoryRollovers] = useState<Record<string, boolean>>(loadCategoryRollovers)

  useEffect(() => { saveCategoryRollovers(categoryRollovers) }, [categoryRollovers])
  const [budgetFilter, setBudgetFilter]               = useState<'all' | 'over-budget' | 'no-activity'>('all')
  const [budgetSearch, setBudgetSearch]                 = useState('')  // V32 — category search
  // V9.11 — Uncategorized expenses collapsible (default open)
  const [uncatOpen, setUncatOpen]                     = useState(true)
  // V9.11 — Delete all duplicates confirmation
  const [deleteDupsConfirm, setDeleteDupsConfirm]     = useState(false)
  // V9.12 — Goal priority + pause state
  const [goalPriorities, setGoalPriorities]           = useState<Record<string, 'high' | 'medium' | 'low'>>({})
  const [pausedGoals, setPausedGoals]                 = useState<Set<string>>(new Set())
  // V9.12 — Delete filtered transactions confirmation
  const [deleteFilteredConfirm, setDeleteFilteredConfirm] = useState(false)

  // V9.14 — Soft-delete: recently deleted transactions (recoverable within session)
  const [deletedTxns, setDeletedTxns]               = useState<Transaction[]>([])
  // Soft-delete helper: moves transaction to deletedTxns instead of permanent removal
  const softDeleteTxn = (txId: string) => {
    const tx = transactions.find(t => t.id === txId)
    if (!tx) return
    addPendingDelete('transactions', txId)
    setTxnWithHistory(prev => deleteTransaction(prev, txId))
    setDeletedTxns(prev => [{ ...tx }, ...prev.slice(0, 29)]) // keep last 30
  }
  const restoreDeletedTxn = (txId: string) => {
    const tx = deletedTxns.find(t => t.id === txId)
    if (!tx) return
    setTxnWithHistory(prev => restoreTransaction(prev, tx))
    setDeletedTxns(prev => prev.filter(t => t.id !== txId))
    showToast(`Restored "${tx.merchant}"`)
  }
  const permanentlyDeleteTxn = (txId: string) => {
    setDeletedTxns(prev => prev.filter(t => t.id !== txId))
  }
  const [txnSearch, setTxnSearch]               = useState('')
  const [txnAccountFilter, setTxnAccountFilter] = useState('')
  const [txnCategoryFilter, setTxnCategoryFilter] = useState('')
  // V9.6.1 — Duplicate resolution: IDs the user has explicitly dismissed from dup review
  const [dismissedDupIds, setDismissedDupIds]   = useState<Set<string>>(new Set())
  // V9.7 — Duplicate resolution: confirmed-as-intentional IDs (badge changes to "Kept Both")
  const [confirmedDupIds, setConfirmedDupIds]   = useState<Set<string>>(new Set())
  // V9.7 — Recurring detection state
  const [recurringOpen, setRecurringOpen]         = useState(true)
  const [confirmedRecurring, setConfirmedRecurring] = useState<Set<string>>(new Set()) // merchantKeys
  const [dismissedRecurring, setDismissedRecurring] = useState<Set<string>>(new Set()) // merchantKeys
  // V9.8 — Manual recurring items (user-entered)
  const [manualRecurringItems, setManualRecurringItems] = useState<ManualRecurringItem[]>(loadManualRecurringItems)
  const [showAddRecurring, setShowAddRecurring]         = useState(false)
  const [recurringForm, setRecurringForm]               = useState<{
    name: string; amount: string; cadence: RecurringCadence; nextDueDate: string; type: 'expense' | 'income'
  }>({ name: '', amount: '', cadence: 'monthly', nextDueDate: new Date().toISOString().slice(0, 10), type: 'expense' })
  // V9.9 — Monthly Review
  const [reviewMonth, setReviewMonth]     = useState(loadReviewMonth)
  const [monthlyNotes, setMonthlyNotes]   = useState<Record<string, string>>(loadMonthlyNotes)
  const [reviewedMonths, setReviewedMonths] = useState<Record<string, string>>(loadReviewedMonths)
  // V15 — Pending cloud deletes: loaded fresh on each sync, not stored in component state
  const getPendingDeletes = () => loadPendingDeletes()

  // V16 — Settings panel
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [onboardingGuideOpen, setOnboardingGuideOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarW, setSidebarW] = useState<number>(() => {
    try { return Math.min(400, Math.max(180, parseInt(localStorage.getItem('flow_sidebar_width') ?? '260'))) }
    catch { return 260 }
  })
  const [merchantSuggestList, setMerchantSuggestList] = useState<string[]>([]) // V37 — suggest panel
  const [aiChatOpen, setAiChatOpen] = useState(false)  // V33 — persistent AI chat
  const [cloudOpenSignal, setCloudOpenSignal] = useState(0)    // V39 — Ctrl+S toggles cloud panel (signal counter)
  const [versionOpen, setVersionOpen] = useState(false) // V34 — V opens version badge
  // V33 — category breakdowns stored locally (not synced)
  const [breakdowns, setBreakdowns] = useState<Record<string, BreakdownItem[]>>(() => {
    try { return JSON.parse(localStorage.getItem('flow_breakdowns') ?? '{}') } catch { return {} }
  })
  const [breakdownEditId, setBreakdownEditId] = useState<string | null>(null)

  // V33.1: Persist breakdowns to localStorage when they change
  useEffect(() => {
    localStorage.setItem('flow_breakdowns', JSON.stringify(breakdowns))
  }, [breakdowns])

  // V33.1: Seed Bills to Mom breakdown from preload data (.name not .label)
  useEffect(() => {
    const btmCat = categories.find(c => c.name === 'Bills to Mom')
    if (btmCat && !breakdowns[btmCat.id] && ZYAN_PERSONAL_PRELOAD.billsToMomBreakdown?.length) {
      setBreakdowns(prev => ({
        ...prev,
        [btmCat.id]: ZYAN_PERSONAL_PRELOAD.billsToMomBreakdown.map(
          (item: { name: string; amount: number }, i: number) => ({
            id: `btm-${i}`, label: item.name, amount: item.amount
          })
        )
      }))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.length])
  const [profileOpenSignal, setProfileOpenSignal] = useState(0)
  const [keyboardShortcutsOpen, setKeyboardShortcutsOpen] = useState(false)
  // V22 — dark/light theme
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('flow_theme') as 'dark' | 'light') ?? 'dark'
  )
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('flow_theme', next)
  }
  // V17 — Collapsible dashboard sections
  const [forecastOpen, setForecastOpen] = useState(false)
  const [billsToMomBudgetOpen, setBillsToMomBudgetOpen] = useState(true)
  const [hasCustomPersonalDefault, setHasCustomPersonalDefault] = useState(() => !!loadZyanCustomPreload())
  // reviewOpen already provided by useUiState()

  const isAppEmpty = accounts.length === 0 && categories.length === 0 && transactions.length === 0

  const handleLoadDemo = () => {
    setAccountsWithHistory(() => DEMO_ACCOUNTS)
    setCategories(DEMO_CATEGORIES)
    setTxnWithHistory(() => DEMO_TRANSACTIONS)
    setTargetsWithHistory(() => DEMO_TARGETS)
    setRulesWithHistory(() => DEMO_RULES)
  }

  const handleClearAllData = () => {
    setAccountsWithHistory(() => [])
    setCategories([])
    setTxnWithHistory(() => [])
    setTargetsWithHistory(() => [])
    setRulesWithHistory(() => [])
    setSavedBudgets([])
    setSavedScenarios([])
    setSavedTargetSets([])
  }

  const handleImportFromFile = (json: string) => {
    const result = importFromBackup(json)
    if (!result.ok) throw new Error(result.error ?? 'Import failed')
  }

  const handleLoadPersonalPreload = () => {
    const data = loadZyanCustomPreload() ?? ZYAN_PERSONAL_PRELOAD
    setAccountsWithHistory(() => data.accounts)
    setCategories(data.categories)
    setTxnWithHistory(() => data.transactions)
    setTargetsWithHistory(() => data.targets)
    setRulesWithHistory(() => data.rules)
    setSavedTargetSets(data.savedTargetSets)
    setSavedBudgets(data.savedBudgets)
    setSavedScenarios(data.savedScenarios)
    setImportBatches(data.importBatches)
    setManualRecurringItems(data.manualRecurringItems)
    setCategoryMemory(data.categoryMemory)
    setMonthlyNotes(data.monthlyNotes)
    setReviewedMonths(data.reviewedMonths)
    saveTakeHomeSettings(data.takeHomeSettings)
    saveToStorage(STORAGE_KEYS.scenarioNotes, data.scenarioNotes)
    saveToStorage(STORAGE_KEYS.categoryMemory, data.categoryMemory)
    saveToStorage(STORAGE_KEYS.budgetActuals, data.budgetActualsEnvelope)
    saveImportBatches(data.importBatches)
    showToast('Loaded Zyan starter data. Sync to cloud when ready.')
  }

  const handleSavePersonalDefault = () => {
    const currentDefault: PersonalPreloadData = {
      accounts,
      categories,
      transactions,
      importBatches,
      rules,
      targets,
      savedTargetSets,
      savedBudgets,
      savedScenarios,
      takeHomeSettings: loadTakeHomeSettings() ?? ZYAN_PERSONAL_PRELOAD.takeHomeSettings,
      scenarioNotes,
      categoryMemory,
      budgetActualsEnvelope: {
        version: 2,
        lastPeriodKey: currentActualsPeriodKey,
        actualsByPeriod: loadAllBudgetActualsByPeriod(),
      },
      monthlyNotes,
      reviewedMonths,
      manualRecurringItems,
      billsToMomBreakdown: ZYAN_PERSONAL_PRELOAD.billsToMomBreakdown,
      metadata: {
        name: 'Zyan Custom Default',
        createdAt: new Date().toISOString(),
        transactionCount: transactions.length,
        importBatchCount: importBatches.length,
      },
    }
    saveZyanCustomPreload(currentDefault)
    setHasCustomPersonalDefault(true)
    showToast('Saved current setup as Zyan default. Re-load it anytime from the starter data card.')
  }
  // V9.7.1 — Collapsible main transaction list
  const [txnListOpen, setTxnListOpen]             = useState(true)

  // V8.6.3 — Uncategorized glow: suppressed once the user clicks the pill; re-arms on new items
  const uncategorizedGlowSeenRef  = useRef(false)
  const prevUncategorizedCountRef = useRef(0)

  // V8.3.1 — Inline transaction editing (rows edit in place; top form is create-only)
  const [inlineTxnEditId, setInlineTxnEditId] = useState<string | null>(null)
  const [inlineTxnEditForm, setInlineTxnEditForm] = useState({
    date: '', accountId: '', merchant: '', amount: '',
    type: 'expense' as TransactionType, categoryId: '', notes: '', toAccountId: '',
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // V10 ARCHITECTURE — DATA MODELS & STATE
  // Core state: accounts, transactions, categories, rules, targets, scenarios.
  // All persisted to storage helpers via useEffect save effects below.
  // ══════════════════════════════════════════════════════════════════════════════

  // V8.3 — Transaction Rules
  const [rules, setRules]                     = useState<TransactionRule[]>([])
  // V10.0 — Category memory: normalized merchant → categoryId, persisted to localStorage
  const [categoryMemory, setCategoryMemory]   = useState<Record<string, string>>(loadCategoryMemory)
  const [ruleForm, setRuleForm]               = useState<{
    name: string; matchText: string; matchField: 'merchant' | 'notes'
    categoryId: string; type: TransactionType | ''
  }>({ name: '', matchText: '', matchField: 'merchant', categoryId: '', type: '' })
  const [ruleHint, setRuleHint]               = useState('')
  // V8.3.1 — Inline rule editing (rows edit in place; top form is create-only)
  const [inlineRuleEditId, setInlineRuleEditId] = useState<string | null>(null)
  const [inlineRuleEditForm, setInlineRuleEditForm] = useState<{
    name: string; matchText: string; matchField: 'merchant' | 'notes'
    categoryId: string; type: TransactionType | ''
  }>({ name: '', matchText: '', matchField: 'merchant', categoryId: '', type: '' })
  const [ruleHistory, setRuleHistory]         = useState<TransactionRule[][]>([])
  const [ruleRedo, setRuleRedo]               = useState<TransactionRule[][]>([])
  const [overwriteCategories, setOverwriteCategories] = useState(false)
  const [applyRulesMsg, setApplyRulesMsg]     = useState('')

  // V9.1 — Budget category inline edit
  const [inlineCatEditId, setInlineCatEditId]   = useState<string | null>(null)
  const [inlineCatEditForm, setInlineCatEditForm] = useState<{
    name: string; type: CategoryType; amount: string; actual: string; actualAtStart: string
  }>({ name: '', type: 'fixed bill', amount: '', actual: '', actualAtStart: '' })
  const inlineCatRowRef    = useRef<HTMLTableRowElement | null>(null)
  const inlineCatNameRef   = useRef<HTMLInputElement>(null)
  const inlineCatTypeRef   = useRef<HTMLSelectElement>(null)
  const inlineCatAmountRef = useRef<HTMLInputElement>(null)
  const inlineCatActualRef = useRef<HTMLInputElement>(null)
  const inlineCatSaveRef   = useRef<HTMLButtonElement>(null)

  // V9.1 — Savings Goal Set rename state + undo history
  const [editingSetIdx, setEditingSetIdx]   = useState<number | null>(null)
  const [renameSetValue, setRenameSetValue] = useState('')
  const [savedTargetSetsHistory, setSavedTargetSetsHistory] = useState<SavedTargetSet[][]>([])
  const [savedTargetSetsRedo, setSavedTargetSetsRedo]       = useState<SavedTargetSet[][]>([])

  const pushSetHistory = (prev: SavedTargetSet[]) => {
    setSavedTargetSetsHistory(h => [...h.slice(-19), prev])
    setSavedTargetSetsRedo([])
  }
  const undoSavedSets = () => {
    setSavedTargetSetsHistory(h => {
      if (!h.length) return h
      const next = [...h]
      const prior = next.pop()!
      setSavedTargetSetsRedo(r => [...r.slice(-19), savedTargetSets])
      setSavedTargetSets(prior)
      return next
    })
  }
  const redoSavedSets = () => {
    setSavedTargetSetsRedo(r => {
      if (!r.length) return r
      const next = [...r]
      const snap = next.pop()!
      setSavedTargetSetsHistory(h => [...h.slice(-19), savedTargetSets])
      setSavedTargetSets(snap)
      return next
    })
  }

  const gp = Math.max(0, Number(gpInput) || 0)
  const adjustedSalary = BASE_SALARY + (baseBumpsAchieved * 5000)
  const eligibleBumps = BUMP_THRESHOLDS.filter(t => gp >= t).length
  const nextUnreachedThreshold = BUMP_THRESHOLDS[eligibleBumps]
  const inc = useMemo(() => income(gp, adjustedSalary), [gp, adjustedSalary])
  const grossSalary = adjustedSalary + (inc.cMonthly * 12)

  // Reset base bumps if GP drops below 20000
  useEffect(() => {
    if (gp < 20000 && baseBumpsAchieved > 0) setBaseBumpsAchieved(0)
  }, [gp, baseBumpsAchieved])

  // Prevent scroll-wheel from changing number input values
  useEffect(() => {
    const handler = (e: WheelEvent) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'number') {
        e.preventDefault()
      }
    }
    document.addEventListener('wheel', handler, { passive: false })
    return () => document.removeEventListener('wheel', handler)
  }, [])

  // localStorage
  useEffect(() => {
    runMigrations()
    const savedPeriod = loadPeriod(); if (savedPeriod) setPeriod(savedPeriod)
    const c = loadCategories(); if (c) setCategories(c)
    const b = loadSavedBudgets(); if (b) setSavedBudgets(b)
    const t = loadTargets(); if (t) setTargets(t)
    const ts = loadSavedTargetSets(); if (ts) setSavedTargetSets(ts)
    const ac = loadAccounts(); if (ac) setAccounts(ac)
    const tx = loadTransactions(); if (tx) setTransactions(tx)
    const rl = loadTransactionRules(); if (rl) setRules(rl)
  }, [])
  useEffect(() => savePeriod(period), [period])
  useEffect(() => saveCategories(categories), [categories])
  useEffect(() => saveSavedBudgets(savedBudgets), [savedBudgets])
  useEffect(() => saveTargets(targets), [targets])
  useEffect(() => saveSavedTargetSets(savedTargetSets), [savedTargetSets])
  useEffect(() => saveAccounts(accounts), [accounts])
  useEffect(() => saveTransactions(transactions), [transactions])
 useEffect(() => saveTransactionRules(rules), [rules])
  // V10.0 — Persist category memory
  useEffect(() => saveCategoryMemory(categoryMemory), [categoryMemory])
  // V9.9.1 — Monthly Review persistence
  useEffect(() => saveReviewMonth(reviewMonth), [reviewMonth])
  useEffect(() => saveMonthlyNotes(monthlyNotes), [monthlyNotes])
  useEffect(() => saveReviewedMonths(reviewedMonths), [reviewedMonths])
  useEffect(() => saveManualRecurringItems(manualRecurringItems), [manualRecurringItems])

  // V8.7 — auto-select the only account in the transaction form
  useEffect(() => {
    if (accounts.length === 1) {
      setTxnForm(prev => ({ ...prev, accountId: accounts[0].id }))
    }
  }, [accounts.length, accounts[0]?.id]) // eslint-disable-line react-hooks/exhaustive-deps


  // Auto-load cloud data after login when the local workspace is empty.
  // This makes login feel like loading the account, without overwriting local data.
  useEffect(() => {
    if (autoCloudRestoreAttemptedRef.current) return
    if (!appAuth.user || !supabase) return
    if (!isAppEmpty) return
    autoCloudRestoreAttemptedRef.current = true

    fetchCloudDataForRestore(supabase, appAuth.user.id).then(restored => {
      const hasCloudData = restored.summary.accounts + restored.summary.categories + restored.summary.transactions + restored.summary.savingsGoals > 0
      if (!hasCloudData) return
      applyCloudRestoreToLocalStorage(restored)
      window.location.reload()
    }).catch(() => {
      // Ignore auto-restore errors; manual Cloud Status restore still exists.
    })
  }, [appAuth.user, isAppEmpty])

  // Deadline-passed detection: show a one-time prompt per target when today is past the deadline
  // and the target is still active (not completed, not fully funded).
  useEffect(() => {
    const todayMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()
    const overdue = targets.filter(t => {
      if (t.completed) return false
      if (t.goalAmount > 0 && t.currentSaved >= t.goalAmount) return false
      if (!t.deadline) return false
      const dl = new Date(t.deadline + 'T00:00:00')
      if (isNaN(dl.getTime())) return false
      dl.setHours(0, 0, 0, 0)
      return dl.getTime() < todayMs && !deadlinePassedPrompted.has(t.id)
    })
    if (!overdue.length) return
    const t = overdue[0]
    setDeadlinePassedPrompted(prev => new Set([...prev, t.id]))
    const choice = window.confirm(
      `The deadline for "${t.name}" has passed.\n\nChoose OK to move it to Completed, or Cancel to keep it Active.`
    )
    if (choice) {
      setTargetsWithHistory(prev => prev.map(x => x.id === t.id ? { ...x, completed: true } : x))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets])

  // V30: Scroll to top on every tab change — prevents landing mid-page
  // V32: Also blur any focused input to prevent highlight carryover between tabs
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    (document.activeElement as HTMLElement)?.blur()
  }, [tab])

  // Close autocomplete on outside click
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!autocompleteWrapRef.current?.contains(e.target as Node)) setShowSuggestions(false)
      if (!targetAutocompleteWrapRef.current?.contains(e.target as Node)) setShowTargetSuggestions(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  const byType = useMemo(() => ({
    fixed: categories.filter(x => x.type === 'fixed bill').reduce((s, x) => s + x.amount, 0),
    variable: categories.filter(x => x.type === 'variable spending').reduce((s, x) => s + x.amount, 0),
    savings: categories.filter(x => x.type === 'savings').reduce((s, x) => s + x.amount, 0),
    investing: categories.filter(x => x.type === 'investing').reduce((s, x) => s + x.amount, 0),
  }), [categories])

  const monthlyBudget = byType.fixed + byType.variable + byType.savings + byType.investing
  const monthlyLeft = inc.totalMonthly - monthlyBudget
  const fixedRatio = inc.totalMonthly > 0 ? (byType.fixed / inc.totalMonthly) * 100 : 0
  const savingsRate = inc.totalMonthly > 0 ? ((byType.savings + byType.investing) / inc.totalMonthly) * 100 : 0
  const dep = inc.commissionPct
  const depColor = dep <= 35 ? 'text-green-400' : dep <= 55 ? 'text-yellow-300' : 'text-red-400'
  const baseNetByPeriod = period === 'weekly' ? inc.baseWeekly : period === 'bi-weekly' ? inc.baseBiWeekly : period === 'yearly' ? inc.baseMonthly * 12 : inc.baseMonthly

  const top = [...categories].sort((a, b) => b.amount - a.amount)
  const suggestionList = form.name.trim() ? categorySuggestions.filter(s => s.toLowerCase().includes(form.name.toLowerCase())) : categorySuggestions
  const targetSuggestionList = targetForm.name.trim() ? targetPresets.filter(s => s.toLowerCase().includes(targetForm.name.toLowerCase())) : targetPresets

  const hasBudgetData = monthlyBudget > 0
  const selectedPeriodRemaining = convertFromMonthly(monthlyLeft, period)
  const selectedPeriodTotalNet = convertFromMonthly(inc.totalMonthly, period)
  const remainingTier = remainingTierFromPeriodValue(selectedPeriodRemaining, period)
  const remainingTone = remainingTier.tone
  const statusLabel = !hasBudgetData ? 'No Data' : selectedPeriodRemaining < 0 ? 'Over Budget' : remainingTier.label
  const statusTone: 'good' | 'warn' | 'risk' | 'danger' = !hasBudgetData ? 'warn' : selectedPeriodRemaining < 0 ? 'danger' : statusLabel === 'Moderate' ? 'warn' : statusLabel === 'Risk' ? 'risk' : 'good'
  const remainingCushionPct = selectedPeriodTotalNet > 0 ? (selectedPeriodRemaining / selectedPeriodTotalNet) * 100 : 0
  const savingsTone: 'good' | 'warn' | 'danger' = savingsRate >= 35 ? 'good' : savingsRate >= 20 ? 'warn' : 'danger'
  const cushionTone: 'good' | 'warn' | 'risk' | 'danger' = remainingTone
  const biggestExpenseTone: 'neutral' | 'good' | 'warn' | 'danger' = top[0] && selectedPeriodTotalNet > 0 && convertFromMonthly(top[0].amount, period) > selectedPeriodTotalNet * 0.5 ? 'danger' : 'neutral'
  const totalBudgetTone: 'neutral' = 'neutral'

  // ── V7.5 Actuals computations ────────────────────────────────────────────────
  // Period-aware variance coloring: small misses should not look dangerous
  // ══════════════════════════════════════════════════════════════════════════════
  // V10 ARCHITECTURE — BUDGET ENGINE
  // categories[] → effectiveCatActual() → plan vs actual variance
  // Budget health: catStatus(), budgetHealth useMemo
  // Rollover: categoryRollovers state — calc in rolloverByCatId memo below (V19)
  // ══════════════════════════════════════════════════════════════════════════════
  // varianceTone imported from utils/budgetMath

  // Planned total for the selected period (sum of all categories)
  const plannedPeriodTotal = convertFromMonthly(monthlyBudget, period)

  // ── V8.4 Transaction-driven actuals ──────────────────────────────────────────
  // V9.2: Transfers and credit card payments are money movements — excluded from
  // budget category spending totals. Only genuine expenses count toward actuals.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const txnActuals = useMemo(() => {
    const range = getPeriodDateRange(period)
    const result: Record<string, number> = {}
    for (const tx of transactions) {
      if (!tx.categoryId) continue
      if (tx.date < range.start || tx.date > range.end) continue
      // V9.2 — exclude transfers and credit card payments from budget spending
      if (isMoneyMovement(tx.type)) continue
      result[tx.categoryId] = (result[tx.categoryId] ?? 0) + tx.amount
    }
    return result
  }, [transactions, period])

  // Effective actual for one category = transaction total + manual adjustment.
  // If no transactions and no manual entry: null (nothing to show).
  // When no transactions exist, manual entry is the full actual (backward-compat).
  const effectiveCatActual = (catId: string): {
    total: number; txnAmt: number; manualAmt: number; hasTxn: boolean; hasManual: boolean
  } | null => {
    const txnAmt    = txnActuals[catId] ?? 0
    const manualStr = actuals[catId]
    const hasManual = manualStr !== '' && manualStr !== undefined
    const manualAmt = hasManual ? (Number(manualStr) || 0) : 0
    const hasTxn    = txnAmt > 0
    if (!hasTxn && !hasManual) return null
    return { total: txnAmt + manualAmt, txnAmt, manualAmt, hasTxn, hasManual }
  }

  // Actual total for the selected period (transactions + manual adjustments)
  const actualPeriodTotal = categories.reduce((sum, c) => {
    const eff = effectiveCatActual(c.id)
    return eff !== null ? sum + eff.total : sum
  }, 0)

  // Any actuals present = transactions OR manual entries
  const hasAnyActual = categories.some(c => effectiveCatActual(c.id) !== null)

  // catStatus imported from utils/budgetMath — signature: catStatus(actual: number | null, planned: number)

  // V9.11 — Budget health summary
  // V19 — Budget history state
  const [historyMonth, setHistoryMonth] = useState<string | null>(null)
  const allActualsByPeriod = useMemo(() => loadAllBudgetActualsByPeriod(), [actuals])
  const historyPeriodKeys = useMemo(() => {
    return Object.keys(allActualsByPeriod)
      .filter(k => k !== currentActualsPeriodKey && Object.keys(allActualsByPeriod[k]).length > 0)
      .sort((a, b) => b.localeCompare(a)) // newest first
  }, [allActualsByPeriod, currentActualsPeriodKey])

  // V19 — Rollover: for rollover-enabled categories, add previous month's underspend to this month's plan
  const rolloverByCatId = useMemo(() => {
    const result: Record<string, number> = {}
    const hasRollovers = Object.values(categoryRollovers).some(Boolean)
    if (!hasRollovers) return result
    const prevKey = prevMonthKey(currentActualsPeriodKey)
    const prevActuals = loadBudgetActualsForPeriod(prevKey)
    for (const cat of categories) {
      if (!categoryRollovers[cat.id]) continue
      const monthlyPlan = cat.amount
      const prevActual = parseFloat(prevActuals[cat.id] ?? '0')
      const underspend = Math.max(0, monthlyPlan - prevActual)
      if (underspend > 0) result[cat.id] = underspend
    }
    return result
  }, [categoryRollovers, categories, currentActualsPeriodKey])

  const budgetHealth = useMemo(() => {
    const overBudget   = categories.filter(c => !budgetSearch || c.name.toLowerCase().includes(budgetSearch.toLowerCase())).filter(c => { const e = effectiveCatActual(c.id); return e !== null && e.total > convertFromMonthly(c.amount, period) })
    const noActivity   = categories.filter(c => effectiveCatActual(c.id) === null)
    const totalPlanned = categories.reduce((s, c) => s + convertFromMonthly(c.amount, period), 0)
    const totalActual  = categories.reduce((s, c) => { const e = effectiveCatActual(c.id); return s + (e?.total ?? 0) }, 0)
    return { overBudget, noActivity, totalPlanned, totalActual, remaining: totalPlanned - totalActual }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, period, effectiveCatActual])

  // Variance total (actual - planned); positive = overspend
  const variancePeriodTotal = hasAnyActual ? actualPeriodTotal - plannedPeriodTotal : 0

  // actualOverspendPct: how far over plan we are as a % of planned (for dashboard)
  const actualOverspendPct = hasAnyActual && plannedPeriodTotal > 0
    ? Math.max(0, (variancePeriodTotal / plannedPeriodTotal) * 100)
    : 0

  // Biggest over-plan category (for pressure card)
  const biggestOverPlanCategory: { id: string; name: string; overBy: number } | null = (() => {
    if (!hasAnyActual) return null
    let best: { id: string; name: string; overBy: number } | null = null
    for (const c of categories) {
      const eff = effectiveCatActual(c.id)
      if (!eff) continue
      const planned = convertFromMonthly(c.amount, period)
      const overBy  = eff.total - planned
      if (overBy > 0.005 && (best === null || overBy > best.overBy)) {
        best = { id: c.id, name: c.name, overBy }
      }
    }
    return best
  })()

  // ── V7.3 Dashboard Status Engine ───────────────────────────────────────────
  const activeTargets = targets.filter(t => !t.completed && (t.goalAmount <= 0 || t.currentSaved < t.goalAmount) && !pausedGoals.has(t.id))
  const pausedTargets = targets.filter(t => pausedGoals.has(t.id))

  // ── V9.2 Account Balance Engine ─────────────────────────────────────────────
  // Computes transaction-adjusted balances by applying all transactions on top of
  // the manual base balance set on each account. This is additive — base balance
  // is the user's starting point, transactions adjust from there.
  const computedAccountBalances = useMemo((): Record<string, number> => {
    const deltas: Record<string, number> = {}
    for (const tx of transactions) {
      // Expense: decreases source account
      if (tx.type === 'expense') {
        deltas[tx.accountId] = (deltas[tx.accountId] ?? 0) - tx.amount
      }
      // Income: increases destination account
      if (tx.type === 'income') {
        deltas[tx.accountId] = (deltas[tx.accountId] ?? 0) + tx.amount
      }
      // Transfer: decreases source, increases destination
      if (tx.type === 'transfer') {
        deltas[tx.accountId] = (deltas[tx.accountId] ?? 0) - tx.amount
        if (tx.toAccountId) {
          deltas[tx.toAccountId] = (deltas[tx.toAccountId] ?? 0) + tx.amount
        }
      }
      // Credit card payment: decreases checking (source), decreases card balance owed (destination)
      if (tx.type === 'credit card payment') {
        deltas[tx.accountId] = (deltas[tx.accountId] ?? 0) - tx.amount
        if (tx.toAccountId) {
          // Credit card balance is negative (debt) — payment reduces the debt (increases toward 0)
          deltas[tx.toAccountId] = (deltas[tx.toAccountId] ?? 0) + tx.amount
        }
      }
    }
    const result: Record<string, number> = {}
    for (const acct of accounts) {
      result[acct.id] = acct.balance + (deltas[acct.id] ?? 0)
    }
    return result
  }, [accounts, transactions])

  // V9.2/V9.3.1 — Net worth summary (computeNetWorth extracted to utils/accountMath)
  const netWorthSummary = useMemo(
    () => computeNetWorth(accounts),
    [accounts]
  )

  // V9.3 — Reconciliation (computeReconciliationData extracted to utils/accountMath)
  const reconciliationData = useMemo(
    (): Record<string, ReconciliationEntry> => computeReconciliationData(accounts, computedAccountBalances),
    [accounts, computedAccountBalances]
  )

  // V9.4 — Balance check (computeBalanceCheckData extracted to utils/accountMath)
  const balanceCheckData = useMemo(
    (): Record<string, BalanceCheckEntry> => computeBalanceCheckData(accounts, transactions),
    [accounts, transactions]
  )

  // needsReviewCount: accounts whose balance isn't explained by tracked transactions
  const needsReviewCount = accounts.filter(a => {
    const bc = balanceCheckData[a.id]
    return bc ? bc.hasReconciliationBaseline && !bc.isMatched : false
  }).length

  // ── V8.6.3 Uncategorized expense count ──────────────────────────────────────
  // Single source of truth: expense transactions with no budget category assigned.
  // Income, Transfer, and Credit Card Payment are intentionally excluded.
  const uncategorizedExpenseCount = transactions.filter(
    tx => tx.type === 'expense' && !tx.categoryId
  ).length

  // V9.5 — Review Center data
  const reviewableTxns = useMemo(() =>
    [...transactions]
      .filter(tx => txNeedsReview(tx, transactions, dismissedDupIds))
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, dismissedDupIds]
  )
  const needsReviewTxnCount = reviewableTxns.length

  // ══════════════════════════════════════════════════════════════════════════════
  // V10 ARCHITECTURE — RECURRING / SUBSCRIPTION ENGINE
  // detectRecurringPatterns() → recurringCandidates useMemo
  // Manual items: manualRecurringItems state
  // Both feed into: estimatedMonthlyRecurring + cashFlowForecast
  // ══════════════════════════════════════════════════════════════════════════════
  // V9.7 — Recurring detection
  const recurringCandidates = useMemo(
    () => detectRecurringPatterns(transactions).filter(c => !dismissedRecurring.has(c.merchantKey)),
    [transactions, dismissedRecurring]
  )
  // V11.3 — Forecast period state and cash-flow calculations extracted to useForecast().
  const {
    forecastPeriod,
    setForecastPeriod,
    estimatedMonthlyRecurring,
    cashFlowForecast,
  } = useForecast({
    totalCash: netWorthSummary.totalCash,
    manualRecurringItems,
    recurringCandidates,
    confirmedRecurring,
    estimatedMonthlyIncome: inc.totalMonthly,
  })

  // ══════════════════════════════════════════════════════════════════════════════
  // V10 ARCHITECTURE — MONTHLY REVIEW ENGINE
  // monthlyReview useMemo → category breakdown, biggest txns, checklist
  // Persistence: reviewMonth, monthlyNotes, reviewedMonths → localStorage
  // ══════════════════════════════════════════════════════════════════════════════
  // V9.9 — Monthly Review computed data
  const monthlyReview = useMemo(() => {
    const txns = transactions.filter(tx => tx.date.startsWith(reviewMonth))
    const income    = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0)
    const expenses  = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const transfers = txns.filter(t => t.type === 'transfer').reduce((s, t) => s + t.amount, 0)
    const ccPayments = txns.filter(t => t.type === 'credit card payment').reduce((s, t) => s + t.amount, 0)
    const netCash   = income - expenses - ccPayments

    // Category breakdown
    const catSpend: Record<string, number> = {}
    txns.filter(t => t.type === 'expense').forEach(t => {
      const key = t.categoryId ?? '__none__'
      catSpend[key] = (catSpend[key] ?? 0) + t.amount
    })
    const catBreakdown = Object.entries(catSpend)
      .map(([catId, actual]) => {
        const cat = catId === '__none__' ? null : categories.find(c => c.id === catId)
        const planned = cat ? cat.amount : 0
        return { catId, name: cat?.name ?? 'Uncategorized', planned, actual, diff: actual - planned }
      })
      .sort((a, b) => b.actual - a.actual)

    // Biggest transactions (top 10 by amount)
    const bigTxns = [...txns]
      .filter(t => t.type === 'expense')
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)

    // Checklist
    const uncatExpenses = txns.filter(t => t.type === 'expense' && !t.categoryId).length
    const unresolvedDups = txns.filter(t =>
      txNeedsReview(t, transactions, dismissedDupIds) &&
      hasDuplicateTransaction(t, transactions, { dismissedDupIds, includeAccount: false })
    ).length
    const recurringReviewed = recurringCandidates.length === 0 ||
      recurringCandidates.every(c => confirmedRecurring.has(c.merchantKey) || dismissedRecurring.has(c.merchantKey))

    return { txns, income, expenses, transfers, ccPayments, netCash, catBreakdown, bigTxns, uncatExpenses, unresolvedDups, recurringReviewed }
  }, [transactions, reviewMonth, categories, dismissedDupIds, recurringCandidates, confirmedRecurring, dismissedRecurring])

  // V13 — Spending insights (needs cashFlowForecast + monthlyReview, both defined above)
  const spendingInsights = useMemo(() => generateSpendingInsights({
    categories,
    transactions,
    targets,
    overBudget:      budgetHealth.overBudget,
    totalPlanned:    budgetHealth.totalPlanned,
    totalActual:     budgetHealth.totalActual,
    forecast:        cashFlowForecast,
    reviewMonth,
    uncatExpenses:   monthlyReview.uncatExpenses,
    catBreakdown:    monthlyReview.catBreakdown,
    bigTxns:         monthlyReview.bigTxns,
    monthlyIncome:   monthlyReview.income,
    monthlyExpenses: monthlyReview.expenses,
    monthlyNetCash:  monthlyReview.netCash,
  }), [categories, transactions, targets, budgetHealth, cashFlowForecast, reviewMonth, monthlyReview])

  // V13 — Monthly review prose summary
  const monthlyReviewSummary = useMemo(() => generateMonthlyReviewSummary({
    reviewMonth,
    txnCount:      monthlyReview.txns.length,
    income:        monthlyReview.income,
    expenses:      monthlyReview.expenses,
    netCash:       monthlyReview.netCash,
    catBreakdown:  monthlyReview.catBreakdown,
    uncatExpenses: monthlyReview.uncatExpenses,
    bigTxns:       monthlyReview.bigTxns,
  }), [reviewMonth, monthlyReview])

  const bulkAssign = () => {
    if (!bulkCategoryId || selectedTxnIds.size === 0) return
    const affectedTxns = transactions.filter(tx => selectedTxnIds.has(tx.id) && tx.type === 'expense')
    setTxnWithHistory(prev => assignTransactionCategoryBulk(prev, selectedTxnIds, bulkCategoryId))
    // Offer rule creation for unique merchants without existing rules
    const suggestion = createBulkMerchantRuleSuggestionForTransactions(
      affectedTxns,
      bulkCategoryId,
      selectedTxnIds,
      rules,
    )
    if (suggestion) setRuleSuggestion(suggestion)
    clearReviewSelection()
    showToast(`Assigned category to ${selectedTxnIds.size} transaction${selectedTxnIds.size !== 1 ? 's' : ''}`)
  }
  // Re-arm the glow whenever the count grows above the previous watermark
  if (uncategorizedExpenseCount > prevUncategorizedCountRef.current) {
    uncategorizedGlowSeenRef.current = false
  }
  prevUncategorizedCountRef.current = uncategorizedExpenseCount
  // Glow is active when there are uncategorized expenses and the pill hasn't been clicked yet
  const showUncategorizedGlow = uncategorizedExpenseCount > 0 && !uncategorizedGlowSeenRef.current

  const dashboardStatus = useDashboardMetrics({
    totalMonthly: inc.totalMonthly,
    monthlyBudget,
    monthlyLeft,
    savingsRate,
    fixedRatio,
    commissionPct: inc.commissionPct,
    categories,
    activeTargets,
    period,
    hasBudgetData,
    selectedPeriodRemaining,
    remainingTierLabel: remainingTier.label,
    actualOverspendPct,
  })

  const createSnapshot = (): BudgetSnapshot => ({ categories: categories.map((c) => ({ ...c })), form: { ...form }, editId })

  // Push budget snapshot + matching actuals snapshot together so undo/redo stays in sync
  const pushBudgetHistory = (prevActuals?: Record<string, string>) => {
    const snap = createSnapshot()
    const aSnap = prevActuals ?? { ...actuals }
    setBudgetHistory((prev) => [...prev.slice(-19), snap])
    setActualsHistory((prev) => [...prev.slice(-19), aSnap])
    setBudgetRedo([])
    setActualsRedo([])
  }

  const commitFormCheckpoint = () => {
    const snap = createSnapshot()
    setBudgetHistory((prev) => {
      const last = prev[prev.length - 1]
      if (last && JSON.stringify(last.form) === JSON.stringify(snap.form) && last.editId === snap.editId) return prev
      setActualsHistory((aPrev) => [...aPrev.slice(-19), { ...actuals }])
      return [...prev.slice(-19), snap]
    })
  }

  // Push only actuals snapshot (for actual edits that don't change categories/form)
  const pushActualsHistory = (prevActuals: Record<string, string>) => {
    setBudgetHistory((prev) => [...prev.slice(-19), createSnapshot()])
    setActualsHistory((prev) => [...prev.slice(-19), prevActuals])
    setBudgetRedo([])
    setActualsRedo([])
  }

  const undoBudget = () => {
    setBudgetHistory((prev) => {
      if (!prev.length) return prev
      const next = [...prev]
      const prior = next.pop()!
      setBudgetRedo((redo) => [...redo.slice(-19), createSnapshot()])
      setActualsRedo((redo) => [...redo.slice(-19), { ...actuals }])
      setActualsHistory((aPrev) => {
        const aNext = [...aPrev]
        const priorActuals = aNext.pop()
        setActuals(priorActuals ?? {})
        return aNext
      })
      setCategories(prior.categories)
      setForm(prior.form)
      setEditId(prior.editId)
      return next
    })
  }
  const redoBudget = () => {
    setBudgetRedo((prev) => {
      if (!prev.length) return prev
      const next = [...prev]
      const snapshot = next.pop()!
      setBudgetHistory((undo) => [...undo.slice(-19), createSnapshot()])
      setActualsHistory((undo) => [...undo.slice(-19), { ...actuals }])
      setActualsRedo((aRedo) => {
        const aNext = [...aRedo]
        const redoActuals = aNext.pop()
        setActuals(redoActuals ?? {})
        return aNext
      })
      setCategories(snapshot.categories)
      setForm(snapshot.form)
      setEditId(snapshot.editId)
      return next
    })
  }

  // Target undo/redo helpers
  const pushTargetHistory = (prev: Target[]) => {
    setTargetHistory(h => [...h.slice(-19), prev])
    setTargetRedo([])
    setTargetFormRedo([])
  }
  const undoTarget = () => {
    setTargetFormHistory(fh => {
      if (fh.length > 0) {
        const next = [...fh]
        const prior = next.pop()!
        setTargetFormRedo(fr => [...fr.slice(-19), targetForm])
        setTargetForm(prior)
        return next
      }
      setTargetHistory(h => {
        if (!h.length) return h
        const next = [...h]
        const prior = next.pop()!
        setTargetRedo(r => [...r.slice(-19), targets])
        setTargets(prior)
        return next
      })
      return fh
    })
  }
  const redoTarget = () => {
    setTargetFormRedo(fr => {
      if (fr.length > 0) {
        const next = [...fr]
        const snapshot = next.pop()!
        setTargetFormHistory(fh => [...fh.slice(-19), targetForm])
        setTargetForm(snapshot)
        return next
      }
      setTargetRedo(r => {
        if (!r.length) return r
        const next = [...r]
        const snapshot = next.pop()!
        setTargetHistory(h => [...h.slice(-19), targets])
        setTargets(snapshot)
        return next
      })
      return fr
    })
  }

  const setTargetsWithHistory = (updater: (prev: Target[]) => Target[]) => {
    setTargets(prev => {
      const next = updater(prev)
      pushTargetHistory(prev)
      return next
    })
  }

  // ── V8 Account helpers ────────────────────────────────────────────────────────

  const setAccountsWithHistory = (updater: (prev: Account[]) => Account[]) => {
    setAccounts(prev => {
      setAccountHistory(h => [...h.slice(-19), prev])
      setAccountRedo([])
      return updater(prev)
    })
  }
  const undoAccount = () => {
    setAccountHistory(h => {
      if (!h.length) return h
      const next = [...h]; const prior = next.pop()!
      setAccountRedo(r => [...r.slice(-19), accounts])
      setAccounts(prior)
      return next
    })
  }
  const redoAccount = () => {
    setAccountRedo(r => {
      if (!r.length) return r
      const next = [...r]; const snap = next.pop()!
      setAccountHistory(h => [...h.slice(-19), accounts])
      setAccounts(snap)
      return next
    })
  }
  const clearAccountForm = () => {
    setAccountForm({ name: '', type: 'checking', balance: '', institution: '' })
    setEditAccountId(null)
    setAccountHint('')
  }

  // V9.3.1 — Inline account edit helpers
  const startInlineAccountEdit = (a: Account) => {
    setInlineAccountEditId(a.id)
    setInlineAccountEditForm({
      name: a.name,
      type: a.type,
      balance: a.balance === 0 ? '' : String(Math.abs(a.balance)),
      institution: a.institution ?? '',
    })
    setTimeout(() => { inlineAccountBalanceRef.current?.focus(); inlineAccountBalanceRef.current?.select() }, 0)
  }
  const saveInlineAccountEdit = (accountId: string) => {
    const name = inlineAccountEditForm.name.trim()
    if (!name) return
    setAccountsWithHistory(prev => updateAccount(prev, accountId, inlineAccountEditForm))
    setInlineAccountEditId(null)
    showToast('Account updated')
  }
  const cancelInlineAccountEdit = () => {
    setInlineAccountEditId(null)
    // No toast on cancel
  }

  // V9.3.1 — Reconcile: sets startingBalance so that expectedBalance equals actualBalance,
  // making difference = 0. Formula: startingBalance = actualBalance - txnImpact.
  // Uses setAccountsWithHistory so Accounts Undo/Redo picks it up.
  const reconcileAccount = (accountId: string) => {
    const recon = reconciliationData[accountId]
    if (!recon) return
    const now = new Date().toISOString().slice(0, 10)
    // New startingBalance = actualBalance - txnImpact so that:
    //   expectedBalance (= newStartingBalance + txnImpact) = actualBalance → difference = 0
    setAccountsWithHistory(prev => reconcileAccountAction(prev, accountId, recon.actualBalance, recon.txnImpact, now))
    showToast('Account reconciled')
  }
  const createOrSaveAccount = () => {
    const name = accountForm.name.trim()
    if (!name) { setTimedAccountHint('Enter an account name before adding.'); accountNameRef.current?.focus(); return }
    if (editAccountId) {
      setAccountsWithHistory(prev => updateAccount(prev, editAccountId, accountForm))
      showToast('Account updated')
    } else {
      setAccountsWithHistory(prev => addAccount(prev, accountForm, crypto.randomUUID(), new Date().toISOString().slice(0, 10)))
    }
    clearAccountForm()
    accountNameRef.current?.focus()
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // V10 ARCHITECTURE — TRANSACTION REVIEW CENTER
  // txNeedsReview() → drives reviewableTxns → Needs Review UI
  // Duplicate detection: merchant + amount + date match
  // Rule application: applyRules() runs on every transaction save
  // ══════════════════════════════════════════════════════════════════════════════

  // ── V8 Transaction helpers ────────────────────────────────────────────────────

  const setTxnWithHistory = (updater: (prev: Transaction[]) => Transaction[]) => {
    setTransactions(prev => {
      setTxnHistory(h => [...h.slice(-19), prev])
      setTxnRedo([])
      return updater(prev)
    })
  }
  const undoTxn = () => {
    setTxnHistory(h => {
      if (!h.length) return h
      const next = [...h]; const prior = next.pop()!
      setTxnRedo(r => [...r.slice(-19), transactions])
      setTransactions(prior)
      return next
    })
  }
  const redoTxn = () => {
    setTxnRedo(r => {
      if (!r.length) return r
      const next = [...r]; const snap = next.pop()!
      setTxnHistory(h => [...h.slice(-19), transactions])
      setTransactions(snap)
      return next
    })
  }
 const clearTxnForm = () => {
    setTxnForm({ date: new Date().toISOString().slice(0, 10), accountId: '', merchant: '', amount: '', type: 'expense', categoryId: '', notes: '', toAccountId: '' })
    setTxnHint('')
    setTxnDupWarning(false)
  }
  // Soft reset after successful add — preserves accountId/type/date for fast sequential entry
  const resetTxnFormAfterAdd = () => {
    setTxnForm(prev => ({ ...prev, merchant: '', amount: '', categoryId: '', notes: '' }))
    setTxnHint('')
    setTxnDupWarning(false)
  }
  // Soft reset after a successful add — keeps account, type, date so rapid entry is frictionless
  const createOrSaveTxn = () => {
    const merchant = txnForm.merchant.trim()
    // V8.6.1 — If exactly one account exists, treat it as implicitly selected
    const resolvedAccountId = txnForm.accountId || (accounts.length === 1 ? accounts[0].id : '')
    if (!resolvedAccountId) { setTimedTxnHint('Choose an account before logging this transaction.'); txnAccountRef.current?.focus(); return }
    if (!merchant) { setTimedTxnHint('Enter a merchant or description before logging.'); txnMerchantRef.current?.focus(); return }
    const amount = parseFloat(txnForm.amount) || 0
    if (amount <= 0) { setTimedTxnHint('Enter a transaction amount before logging.'); txnAmountRef.current?.focus(); return }

    // Duplicate detection — same merchant + amount + date
    const isDup = hasDuplicateTransaction(
      { id: '__new__', date: txnForm.date, accountId: resolvedAccountId, merchant, amount },
      transactions,
      { includeAccount: false },
    )
    if (isDup && !txnDupWarning) {
      setTxnDupWarning(true)
      setTimedTxnHint('Possible duplicate — same merchant, amount, and date already exists. Click Add again to save anyway.')
      return
    }
    setTxnDupWarning(false)

    // V9.3.1 — Credit card payment guard: prevent payment exceeding card balance owed
    if (txnForm.type === 'credit card payment' && txnForm.toAccountId) {
      const cardAcct = accounts.find(a => a.id === txnForm.toAccountId)
      if (cardAcct && cardAcct.type === 'credit card') {
        const amountOwed = Math.abs(Math.min(0, cardAcct.balance))
        if (amountOwed === 0) {
          setTimedTxnHint(`${cardAcct.name} has no balance owed — no payment needed.`)
          return
        }
        if (amount > amountOwed + 0.005) {
          setTimedTxnHint(`Payment of ${currency(amount)} exceeds ${cardAcct.name} balance owed (${currency(amountOwed)}). Reduce the amount.`)
          return
        }
      }
    }

 setTxnWithHistory(prev => addTransaction(prev, buildTransactionFromForm({
  form: txnForm,
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  resolvedAccountId,
  merchant,
  amount,
  rules,
})))

// Set blur guard BEFORE moving focus so Amount's onBlur skips format-back
txnSubmittingRef.current = true

resetTxnFormAfterAdd()
txnMerchantRef.current?.focus()
  }
  const saveInlineTxnEdit = () => {
    if (!inlineTxnEditId) return
    const merchant = inlineTxnEditForm.merchant.trim()
    const amount = parseFloat(inlineTxnEditForm.amount) || 0
    // Show validation hints rather than silently refusing
    if (!inlineTxnEditForm.accountId) { setTimedTxnHint('Choose an account for this transaction.'); return }
    if (!merchant) { setTimedTxnHint('Enter a merchant or description.'); return }
    if (amount <= 0) { setTimedTxnHint('Enter a valid amount greater than zero.'); return }

    // V8.5.2 — Duplicate detection: same merchant + amount + date, excluding self
    const isDup = hasDuplicateTransaction(
      { id: inlineTxnEditId, date: inlineTxnEditForm.date, accountId: inlineTxnEditForm.accountId, merchant, amount },
      transactions,
      { includeAccount: false },
    )
    if (isDup && !txnDupWarning) {
      setTxnDupWarning(true)
      setTimedTxnHint('Possible duplicate — same merchant, amount, and date already exists. Save again to confirm.')
      return
    }
    setTxnDupWarning(false)
    setTxnHint('')

    // V8.6.1 — Determine the original transaction to detect manual category changes
    const originalTx = transactions.find(x => x.id === inlineTxnEditId)
    setTxnWithHistory(prev => updateTransaction(prev, inlineTxnEditId, inlineTxnEditForm, originalTx))
    setInlineTxnEditId(null)
  }
  const cancelInlineTxnEdit = () => {
    if (inlineEditBlurTimerRef.current) clearTimeout(inlineEditBlurTimerRef.current)
    setInlineTxnEditId(null)
    setTxnDupWarning(false)
    setTxnHint('')
  }

  // V10.0 — Update category memory when user manually assigns a category
  const updateCategoryMemory = (merchant: string, categoryId: string) => {
    const key = normalizeMerchant(merchant).toLowerCase()
    if (!key || !categoryId) return
    setCategoryMemory(prev => {
      if (prev[key] === categoryId) return prev
      return { ...prev, [key]: categoryId }
    })
  }

  const setRulesWithHistory = (updater: (prev: TransactionRule[]) => TransactionRule[]) => {
    setRules(prev => {
      setRuleHistory(h => [...h.slice(-19), prev])
      setRuleRedo([])
      return updater(prev)
    })
  }
  const undoRule = () => {
    setRuleHistory(h => {
      if (!h.length) return h
      const next = [...h]; const prior = next.pop()!
      setRuleRedo(r => [...r.slice(-19), rules])
      setRules(prior)
      return next
    })
  }
  const redoRule = () => {
    setRuleRedo(r => {
      if (!r.length) return r
      const next = [...r]; const snap = next.pop()!
      setRuleHistory(h => [...h.slice(-19), rules])
      setRules(snap)
      return next
    })
  }
  const clearRuleForm = () => {
    setRuleForm({ name: '', matchText: '', matchField: 'merchant', categoryId: '', type: '' })
    setRuleHint('')
  }
  const createOrSaveRule = () => {
    const name = ruleForm.name.trim()
    const matchText = ruleForm.matchText.trim()
    if (!name) { setRuleHint('Enter a rule name.'); ruleNameRef.current?.focus(); return }
    if (!matchText) { setRuleHint('Enter match text before adding this rule.'); ruleMatchTextRef.current?.focus(); return }
    if (!ruleForm.categoryId) { setRuleHint('Choose a budget category before adding this rule.'); return }

    // V8.5.2 — Conflict detection: same field + overlapping alias + overlapping type → different category
    const conflict = detectRuleConflict(rules, {
      matchText,
      matchField: ruleForm.matchField,
      categoryId: ruleForm.categoryId,
      type: ruleForm.type,
    })
    if (conflict) {
      setRuleHint(`This rule conflicts with an existing rule for "${conflict.overlapAlias}". Change the match text or choose the same category.`)
      return
    }


    setRuleHint('')
    setRulesWithHistory(prev => addRule(prev, buildRuleFromForm(ruleForm, crypto.randomUUID(), new Date().toISOString())))
    clearRuleForm()
    ruleNameRef.current?.focus()
  }
  const saveInlineRuleEdit = () => {
    if (!inlineRuleEditId) return
    const name = inlineRuleEditForm.name.trim()
    const matchText = inlineRuleEditForm.matchText.trim()
    if (!name || !matchText || !inlineRuleEditForm.categoryId) return

    // V8.5.2 — Conflict detection (exclude self)
    const conflict = detectRuleConflict(rules, {
      matchText,
      matchField: inlineRuleEditForm.matchField,
      categoryId: inlineRuleEditForm.categoryId,
      type: inlineRuleEditForm.type,
    }, inlineRuleEditId)
    if (conflict) {
      setRuleHint(`This rule conflicts with an existing rule for "${conflict.overlapAlias}". Change the match text or choose the same category.`)
      return
    }


    setRulesWithHistory(prev => updateRule(prev, inlineRuleEditId, inlineRuleEditForm))
    setInlineRuleEditId(null)
  }
  const cancelInlineRuleEdit = () => setInlineRuleEditId(null)
 const applyAllRules = () => {
    let count = 0
    setTxnWithHistory(prev => {
      const result = applyTransactionRulesAction(prev, rules, overwriteCategories)
      count = result.updatedCount
      return result.transactions
    })
    setApplyRulesMsg(`${count} transaction${count !== 1 ? 's' : ''} updated.`)
    setTimeout(() => setApplyRulesMsg(''), 5000)
  }

  // ── V8.4.2 Sample generators — instant-create with highlight ─────────────────

  const flashHighlight = (
    id: string,
    setter: (id: string | null) => void,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
    ms = 2500,
  ) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setter(id)
    timerRef.current = setTimeout(() => setter(null), ms)
  }

 const generateSampleAccount = () => {
    const used = new Set(accounts.map(a => a.name))
    const pool = SAMPLE_ACCOUNT_TEMPLATES.filter(t => !used.has(t.name))
    const tpl = (pool.length ? pool : SAMPLE_ACCOUNT_TEMPLATES)[Math.floor(Math.random() * (pool.length || SAMPLE_ACCOUNT_TEMPLATES.length))]
    const jitter = Math.round((Math.random() - 0.5) * Math.abs(tpl.balance) * 0.3)
    const rawBalance = parseFloat((tpl.balance + jitter).toFixed(2))
    // Credit card templates are already negative; ensure jitter can't flip sign
    const balance = tpl.type === 'credit card' ? Math.min(0, rawBalance) : rawBalance
    const id = crypto.randomUUID()
    setAccountsWithHistory(prev => [
      { id, name: tpl.name, type: tpl.type, balance, institution: tpl.institution, createdAt: new Date().toISOString().slice(0, 10) },
      ...prev,
    ])
    flashHighlight(id, setHighlightedAccountId, highlightAccountTimerRef)
  }

  const generateSampleTransaction = () => {
    // Pick type first, then choose a believable merchant for that type
    const roll = Math.random()
    const type: TransactionType = roll < 0.72 ? 'expense' : roll < 0.84 ? 'income' : roll < 0.93 ? 'transfer' : 'credit card payment'
    const merchant =
      type === 'income'              ? INCOME_MERCHANTS[Math.floor(Math.random() * INCOME_MERCHANTS.length)]
      : type === 'transfer'          ? TRANSFER_MERCHANTS[Math.floor(Math.random() * TRANSFER_MERCHANTS.length)]
      : type === 'credit card payment' ? 'Credit Card Payment'
      : EXPENSE_MERCHANTS[Math.floor(Math.random() * EXPENSE_MERCHANTS.length)]
    const amount = (Math.floor(Math.random() * 19) + 1) * 5
    const catPool = type === 'expense' ? categories.filter(c => c.type !== 'savings' && c.type !== 'investing') : categories
    const categoryId = catPool.length ? catPool[Math.floor(Math.random() * catPool.length)].id : undefined
    const accountId = accounts[0]?.id ?? ''
    const range = getPeriodDateRange(period)
    const startMs = new Date(range.start + 'T00:00:00').getTime()
    const endMs   = Math.min(new Date(range.end + 'T23:59:59').getTime(), Date.now())
    const date = new Date(startMs + Math.random() * (endMs - startMs)).toISOString().slice(0, 10)
    const id = crypto.randomUUID()
    setTxnWithHistory(prev => [
      { id, date, accountId, merchant, amount, type, categoryId, createdAt: new Date().toISOString() },
      ...prev,
    ])
    flashHighlight(id, setHighlightedTxnId, highlightTxnTimerRef)
  }

  const generateSampleRule = () => {
    const used = new Set(rules.map(r => r.name))
    const pool = SAMPLE_RULE_TEMPLATES.filter(t => !used.has(t.name))
    const tpl = (pool.length ? pool : SAMPLE_RULE_TEMPLATES)[Math.floor(Math.random() * (pool.length || SAMPLE_RULE_TEMPLATES.length))]
    const catPool = categories.filter(c => c.type === 'variable spending')
    const categoryId = (catPool.length ? catPool : categories)[Math.floor(Math.random() * ((catPool.length || categories.length)))]?.id ?? ''
    if (!categoryId) return
    const id = crypto.randomUUID()
    setRulesWithHistory(prev => [
      { id, name: tpl.name, matchText: tpl.matchText, matchField: 'merchant', categoryId, type: 'expense', createdAt: new Date().toISOString() },
      ...prev,
    ])
    flashHighlight(id, setHighlightedRuleId, highlightRuleTimerRef)
  }

  const generateSampleCategory = () => {
    const used = new Set(categories.map(c => c.name))
    const pool = SAMPLE_BUDGET_CATS.filter(c => !used.has(c.name))
    if (!pool.length) return
    const tpl = pool[Math.floor(Math.random() * pool.length)]
    const jitter = Math.round((tpl.monthly * (Math.random() * 0.3 - 0.15)) / 5) * 5
    const monthly = Math.max(5, tpl.monthly + jitter)
    const id = crypto.randomUUID()
    pushBudgetHistory()
    setCategories(prev => [...prev, { id, name: tpl.name, amount: monthly, type: tpl.type, updatedAt: new Date().toISOString() }])
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    setHighlightedCategoryId(id)
    highlightTimerRef.current = setTimeout(() => setHighlightedCategoryId(null), 2500)
  }

  const generateSampleGoal = () => {
    const name = SAMPLE_GOAL_NAMES[Math.floor(Math.random() * SAMPLE_GOAL_NAMES.length)]
    const goalAmount = (Math.floor(Math.random() * 145) + 5) * 100
    const currentSaved = Math.round(goalAmount * (Math.random() * 0.85) / 50) * 50
    const today = new Date()
    const startYearOffset = Math.floor(Math.random() * (today.getFullYear() - 2020 + 1))
    const startDate = `${2020 + startYearOffset}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-01`
    const dlYear = today.getFullYear() + Math.floor(Math.random() * 5) + 1
    const deadline = `${dlYear}-${String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')}-01`
    const id = crypto.randomUUID()
    const todayStr = today.toISOString().slice(0, 10)
    setTargetsWithHistory(prev => [
      { id, name, goalAmount, currentSaved, startDate, deadline, createdAt: todayStr, type: 'savings', contributions: [], completed: false },
      ...prev,
    ])
    flashHighlight(id, setHighlightedTargetId, highlightTargetTimerRef)
  }

  const generateTenSamples = () => {
    const range = getPeriodDateRange(period)
    const startMs = new Date(range.start + 'T00:00:00').getTime()
    const endMs   = Math.min(new Date(range.end + 'T23:59:59').getTime(), Date.now())
    // Build 10 varied transactions — mix of types, ~30% uncategorized, ~15% duplicate-like
    const batch: Transaction[] = []
    for (let i = 0; i < 10; i++) {
      const roll     = Math.random()
      const type: TransactionType = roll < 0.72 ? 'expense' : roll < 0.84 ? 'income' : roll < 0.93 ? 'transfer' : 'credit card payment'
      const merchant =
        type === 'income'               ? INCOME_MERCHANTS[Math.floor(Math.random() * INCOME_MERCHANTS.length)]
        : type === 'transfer'           ? TRANSFER_MERCHANTS[Math.floor(Math.random() * TRANSFER_MERCHANTS.length)]
        : type === 'credit card payment'? 'Credit Card Payment'
        : EXPENSE_MERCHANTS[Math.floor(Math.random() * EXPENSE_MERCHANTS.length)]
      const amount   = (Math.floor(Math.random() * 19) + 1) * 5
      const catPool  = type === 'expense' ? categories.filter(c => c.type !== 'savings' && c.type !== 'investing') : categories
      const categoryId = Math.random() < 0.7 && catPool.length ? catPool[Math.floor(Math.random() * catPool.length)].id : undefined
      const accountId  = accounts[0]?.id ?? ''
      const date       = new Date(startMs + Math.random() * (endMs - startMs)).toISOString().slice(0, 10)
      // ~15% chance to duplicate a previous entry in this batch (realistic scenario)
      const dupSrc = batch.length >= 2 && Math.random() < 0.15 ? batch[Math.floor(Math.random() * batch.length)] : null
      batch.push(dupSrc
        ? { ...dupSrc, id: crypto.randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : { id: crypto.randomUUID(), date, accountId, merchant, amount, type, categoryId, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      )
    }
    const firstId = batch[0].id
    // Single undo entry for the whole batch
    setTxnWithHistory(prev => [...batch, ...prev])
    // Highlight the first generated row so the user knows where to look
    flashHighlight(firstId, setHighlightedTxnId, highlightTxnTimerRef)
    showToast(`${batch.length} sample transactions added`)
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // V10 ARCHITECTURE — IMPORT ENGINE
  // CSV/PDF import pipeline: processCsvText → runImportPipeline → commitCsvImport
  // Hint resolution: resolveHint() → rule > memory > CSV category
  // Batch identity: every import creates an ImportBatch record.
  // ══════════════════════════════════════════════════════════════════════════════

  // ── V9.0 CSV Import handlers ──────────────────────────────────────────────────

  const openCsvImport = () => {
    setCsvImportOpen(true)
    resetImportSession()
  }
  const closeCsvImport = () => {
    setCsvImportOpen(false)
    resetImportSession()
  }
  const processCsvText = (text: string) => {
    setCsvImportLoading(true)
    setCsvImportError('')
    try {
      // Detect / normalize format based on preset or auto-detection
      const firstLine = text.split('\n')[0] ?? ''
      const isApple = csvImportPreset === 'apple-card' || (csvImportPreset === 'auto' && detectAppleCard(firstLine))
      const isPdfPreset = false // V36: All PDFs now use AI parsing via /api/parse-pdf
      setCsvIsAppleCard(isApple)
      const processedText = isApple ? normalizeAppleCardHeaders(text) : text

      const parsed = parseCsv(processedText)
      if (parsed.errorMessage) { setCsvImportError(parsed.errorMessage); return }
      if (parsed.rows.length === 0) {
        setCsvImportError('No rows found. Make sure the CSV has a header row and at least one data row.')
        return
      }
      setCsvCategoryHints(extractCategoryHints(parsed.rows))

      const mapping = detectColumns(parsed.headers)
      // V9.10 — Store mapping for column preview
      setCsvColumnMapping(mapping as Record<string, string>)

      const effectiveAccountId = (csvImportAccountId || accounts[0]?.id) ?? ''
      const existingForAccount = transactions.filter(tx => tx.accountId === effectiveAccountId)
      const preview = runImportPipeline({
        rows: parsed.rows,
        mapping,
        existing: existingForAccount,
        rules,
        defaultAccountId: effectiveAccountId,
      })
      if (isPdfPreset) {
        // Chase PDF experimental — treat as low-confidence and note it
        setCsvImportError('Chase PDF experimental mode: preview shown but parsing confidence is low. Review all rows before importing.')
      }
      setCsvImportPreview(preview)
    } catch {
      setCsvImportError('Failed to parse the CSV. Please check the file format and try again.')
    } finally {
      setCsvImportLoading(false)
    }
  }
  const processPdfFile = (file: File) => {
    setCsvImportLoading(true)
    setCsvImportError('')
    setCsvImportIsPdf(true)
    setCsvImportPreview(null)

    // V36 — AI-powered PDF parsing via Gemini (replaces brittle text extraction)
    const reader = new FileReader()
    reader.onload = async ev => {
      try {
        const dataUrl = ev.target?.result as string
        if (!dataUrl) { setCsvImportError('Could not read PDF file.'); setCsvImportLoading(false); return }

        // Strip the data URL prefix to get raw base64
        const base64 = dataUrl.split(',')[1]
        if (!base64) { setCsvImportError('Could not encode PDF.'); setCsvImportLoading(false); return }

        const response = await fetch('/api/parse-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdfBase64: base64 }),
        })

        const result = await response.json() as { transactions?: any[]; error?: string; count?: number }

        if (result.error) {
          setCsvImportError(result.error)
          setCsvImportLoading(false)
          return
        }

        const parsed = result.transactions ?? []
        const effectiveAccountId = csvImportAccountId || (accounts[0]?.id ?? '')
        const existingForAccount = transactions.filter(tx => tx.accountId === effectiveAccountId)

        const marked = parsed.map((r: any) => ({
          ...r,
          isDup: existingForAccount.some(tx =>
            tx.date === r.date &&
            tx.merchant.toLowerCase() === r.merchant.toLowerCase() &&
            Math.abs(tx.amount - Math.abs(r.amount)) < 0.01
          ),
        }))

        setPdfPreviewRows(marked)
        setPdfParseWarning(
          `AI extracted ${marked.length} transaction${marked.length !== 1 ? 's' : ''} from your PDF. Review carefully before importing.`
        )
        setCsvImportLoading(false)
      } catch (err: any) {
        setCsvImportError(`Failed to parse PDF: ${err?.message ?? 'unknown error'}`)
        setCsvImportLoading(false)
      }
    }
    reader.onerror = () => { setCsvImportError('Could not read the PDF file.'); setCsvImportLoading(false) }
    reader.readAsDataURL(file)
  }
  const commitPdfImport = () => {
    const readyRows = pdfPreviewRows.filter(r => !r.isDup)
    if (readyRows.length === 0) { closeCsvImport(); return }
    const effectiveAccountId = csvImportAccountId || (accounts[0]?.id ?? '')
    const batchId = crypto.randomUUID().slice(0, 8)
    const newTxns: Transaction[] = readyRows.map(r => ({
      id: crypto.randomUUID(),
      date: r.date,
      accountId: effectiveAccountId,
      merchant: r.merchant,
      amount: r.amount,
      type: (PAYMENT_PATTERNS.test(r.merchant) ? 'credit card payment' : 'expense') as TransactionType,
      batchId,
      importBatchId: batchId,
      importedCategoryHint: 'pdf',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }))
    setTxnWithHistory(prev => [...newTxns, ...prev])
    const acct = accounts.find(a => a.id === effectiveAccountId)
    const batch: ImportBatch = {
      id: batchId, accountId: effectiveAccountId,
      accountName: acct?.name ?? 'Unknown Account',
      importMonth: csvImportMonth,
      importedCount: newTxns.length,
      skippedCount: pdfPreviewRows.filter(r => r.isDup).length,
      createdAt: new Date().toISOString(),
      importSource: 'pdf',
      preset: 'chase-pdf-experimental',
    }
    setImportBatches(prev => [batch, ...prev.slice(0, 49)])
    closeCsvImport()
    if (newTxns[0]) flashHighlight(newTxns[0].id, setHighlightedTxnId, highlightTxnTimerRef)
    const skipped = pdfPreviewRows.filter(r => r.isDup).length
    showUndoableToast(
      `Imported ${newTxns.length} transaction${newTxns.length !== 1 ? 's' : ''} from PDF.${skipped > 0 ? ` Skipped ${skipped} duplicate${skipped !== 1 ? 's' : ''}.` : ''}`,
      undoTxn
    )
  }
  const handleCsvFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      processPdfFile(file)
    } else {
      const reader = new FileReader()
      reader.onload = ev => { const text = ev.target?.result; if (typeof text === 'string') processCsvText(text) }
      reader.onerror = () => setCsvImportError('Could not read the file. Please try again.')
      reader.readAsText(file)
    }
    e.target.value = ''
  }
  const handleCsvDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf') {
      processPdfFile(file)
      return
    }
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'text/plain') {
      setCsvImportError('Please drop a .csv or .pdf file.')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => { const text = ev.target?.result; if (typeof text === 'string') processCsvText(text) }
    reader.onerror = () => setCsvImportError('Could not read the file.')
    reader.readAsText(file)
  }
  const commitCsvImport = () => {
    if (!csvImportPreview) return
    const effectiveAccountId = (csvImportAccountId || accounts[0]?.id) ?? ''
    const batchId = crypto.randomUUID().slice(0, 8)
    let newTxns = buildImportedTransactions(
      csvImportPreview.importRows,
      effectiveAccountId,
      batchId,
      false,
    )
    // Apply category hints and payment/transfer detection using enriched hint resolver
    newTxns = newTxns.map(tx => {
      const amtKey = `${tx.date}|${tx.merchant.toLowerCase()}|${tx.amount.toFixed(2)}`
      const csvHint = csvCategoryHints[amtKey] ?? ''
      const normalized = normalizeMerchant(tx.merchant)
      const hint = resolveHint(normalized, csvHint, rules, categories, categoryMemory)
      const isPayment = PAYMENT_PATTERNS.test(tx.merchant)
      return {
        ...tx,
        ...(csvHint ? { importedCategoryHint: csvHint } : {}),
        ...(hint && !isPayment ? { categoryId: hint.categoryId } : {}),
        ...(isPayment && tx.type === 'expense' ? { type: 'credit card payment' as TransactionType } : {}),
        batchId,
      }
    })
    // V10.0 — Update category memory for all auto-categorized imports
    const memoryUpdates: Record<string, string> = {}
    newTxns.forEach(tx => {
      if (tx.categoryId && !PAYMENT_PATTERNS.test(tx.merchant)) {
        memoryUpdates[normalizeMerchant(tx.merchant).toLowerCase()] = tx.categoryId
      }
    })
    if (Object.keys(memoryUpdates).length > 0) {
      setCategoryMemory(prev => ({ ...prev, ...memoryUpdates }))
    }
    if (newTxns.length === 0) { closeCsvImport(); return }
    setTxnWithHistory(prev => [...newTxns, ...prev])
    // Record the import batch for history
    const acct = accounts.find(a => a.id === effectiveAccountId)
    const batch: ImportBatch = {
      id: batchId,
      accountId: effectiveAccountId,
      accountName: acct?.name ?? 'Unknown Account',
      importMonth: csvImportMonth,
      importedCount: newTxns.length,
      skippedCount: csvImportPreview.duplicateCount ?? 0,
      createdAt: new Date().toISOString(),
      importSource: 'csv',
      preset: csvIsAppleCard ? 'apple-card' : csvImportPreset,
    }
    setImportBatches(prev => [batch, ...prev.slice(0, 49)])
    closeCsvImport()
    if (newTxns[0]) flashHighlight(newTxns[0].id, setHighlightedTxnId, highlightTxnTimerRef)
    const skipped = csvImportPreview.duplicateCount ?? 0
    const dupNote = skipped > 0 ? ` Skipped ${skipped} duplicate${skipped !== 1 ? 's' : ''}.` : ''
    showUndoableToast(`Imported ${newTxns.length} transaction${newTxns.length !== 1 ? 's' : ''} to ${acct?.name ?? 'account'}${dupNote}`, undoTxn)
  }
  const downloadSampleCsv = () => {
    const text = generateSampleCsvString()
    const blob = new Blob([text], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'flow-sample-transactions.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // V9.10 — Delete an import batch and all its transactions (undo-able)
  const deleteImportBatch = (batchId: string) => {
    const batch = importBatches.find(b => b.id === batchId)
    const removed = transactions.filter(tx => tx.batchId === batchId)
    if (removed.length === 0 && !batch) return
    setTxnWithHistory(prev => prev.filter(tx => tx.batchId !== batchId))
    setImportBatches(prev => prev.filter(b => b.id !== batchId))
    setBatchToDelete(null)
    showUndoableToast(
      `Deleted ${removed.length} transaction${removed.length !== 1 ? 's' : ''} from "${batch?.accountName ?? 'import'}" (${batch?.importMonth ?? ''}).`,
      undoTxn
    )
  }

  const upsert = () => {
    const amt = Math.max(0, Number(form.amount) || 0)
    const monthlyAmt = convertToMonthly(amt, period)
    const n = form.name.trim()
    if (!n || monthlyAmt <= 0) {
      setTimedBudgetFormHint('Enter a category and amount.')
      setShowSuggestions(true)
      budgetNameRef.current?.focus()
      return
    }
    setBudgetFormHint('')
    pushBudgetHistory()
    if (editId) {
      setCategories(prev => prev.map(c => c.id === editId ? { ...c, name: n, amount: monthlyAmt, type: form.type, updatedAt: new Date().toISOString() } : c))
      setEditId(null)
    } else {
      setCategories(prev => {
        const i = prev.findIndex(c => c.name.trim().toLowerCase() === n.toLowerCase() && c.type === form.type)
        if (i >= 0) { const cp = [...prev]; cp[i] = { ...cp[i], amount: cp[i].amount + monthlyAmt, updatedAt: new Date().toISOString() }; return cp }
        return [...prev, { id: crypto.randomUUID(), name: n, amount: monthlyAmt, type: form.type, updatedAt: new Date().toISOString() }]
      })
    }
    setForm({ name: '', amount: '', type: 'fixed bill' })
    budgetNameRef.current?.focus()
  }

  const cancelBudgetEdit = () => {
    setEditId(null)
    setForm({ name: '', amount: '', type: 'fixed bill' })
    setBudgetFormHint('')
    budgetNameRef.current?.focus()
  }

  // V9.1 — Budget category inline edit helpers
  const saveInlineCatEdit = () => {
    if (!inlineCatEditId) return
    const n = inlineCatEditForm.name.trim()
    if (!n) return
    const amt = Math.max(0, Number(inlineCatEditForm.amount) || 0)
    const monthlyAmt = convertToMonthly(amt, period)
    if (monthlyAmt <= 0) return
    const actualStr = inlineCatEditForm.actual.replace(/[^0-9.-]/g, '')
    // Snapshot both budget and actuals together so undo restores both
    pushBudgetHistory({ ...actuals })
    setCategories(prev => prev.map(c => c.id === inlineCatEditId ? { ...c, name: n, amount: monthlyAmt, type: inlineCatEditForm.type, updatedAt: new Date().toISOString() } : c))
    setActuals(prev => ({ ...prev, [inlineCatEditId]: actualStr || '' }))
    setInlineCatEditId(null)
  }
  const cancelInlineCatEdit = () => {
    if (!inlineCatEditId) return
    // Restore actual to its pre-edit value
    setActuals(prev => ({ ...prev, [inlineCatEditId]: inlineCatEditForm.actualAtStart }))
    setInlineCatEditId(null)
  }

  const addTargetContribution = (targetId: string, amount: number, date: string, note: string) => {
    if (amount <= 0) return
    setTargetsWithHistory(prev => addContribution(prev, targetId, amount, date, note, crypto.randomUUID()))
  }

  const createTarget = () => {
    const name = targetForm.name.trim()
    const goalAmount = Number(targetForm.goalAmount) || 0
    const deadline = targetForm.deadline
    if (!name || goalAmount <= 0 || !deadline) return

    const sameName = (t: Target) => t.name.trim().toLowerCase() === name.toLowerCase()
    const sameDeadline = (t: Target) => t.deadline === deadline
    const sameGoal = (t: Target) => t.goalAmount === goalAmount
    const hardConflict = targets.find(t => sameName(t) && sameDeadline(t) && sameGoal(t))
    if (hardConflict) {
      setTimedTargetFormHint('A savings goal with this name, deadline, and goal amount already exists.')
      targetNameRef.current?.focus()
      return
    }
    const softConflict = targets.find(t => (sameName(t) && sameDeadline(t)) || (sameName(t) && sameGoal(t)))
    if (softConflict && !targetFormHint.startsWith('Possible duplicate')) {
      setTimedTargetFormHint('Possible duplicate: please confirm this is not the same savings goal.')
      return
    }

    const today = new Date().toISOString().slice(0, 10)
    setTargetsWithHistory(prev => addSavingsGoal(prev, buildTargetFromForm(targetForm, crypto.randomUUID(), today)))
    setTargetFormHint('')
    setTargetForm({ name: '', goalAmount: '', currentSaved: '', startDate: new Date().toISOString().slice(0, 10), deadline: '' })
    setTimeout(() => targetNameRef.current?.focus(), 0)
  }

  const saveEditTarget = (targetId: string) => {
    const name = editTargetForm.name.trim()
    const goalAmount = Number(editTargetForm.goalAmount) || 0
    const deadline = editTargetForm.deadline
    if (!name || goalAmount <= 0 || !deadline) return
    const other = (t: Target) => t.id !== targetId
    const sameName = (t: Target) => t.name.trim().toLowerCase() === name.toLowerCase()
    const sameDeadline = (t: Target) => t.deadline === deadline
    const sameGoal = (t: Target) => t.goalAmount === goalAmount
    const hardConflict = targets.find(t => other(t) && sameName(t) && sameDeadline(t) && sameGoal(t))
    if (hardConflict) {
      setTimedEditTargetHint('A savings goal with this name, deadline, and goal amount already exists.')
      return
    }
    const softConflict = targets.find(t => other(t) && ((sameName(t) && sameDeadline(t)) || (sameName(t) && sameGoal(t))))
    if (softConflict && !editTargetHint.startsWith('Possible duplicate')) {
      setTimedEditTargetHint('Possible duplicate: please confirm this is not the same savings goal.')
      return
    }
    setEditTargetHint('')
    setTargetsWithHistory(prev => updateSavingsGoal(prev, targetId, editTargetForm))
    setEditTargetId(null)
    setEditTargetOriginal(null)
  }

  const cancelEditTarget = (targetId: string) => {
    if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current)
    if (editTargetOriginal && editTargetOriginal.id === targetId) {
      setTargets(prev => prev.map(t => t.id === targetId ? editTargetOriginal! : t))
    }
    setEditTargetId(null)
    setEditTargetOriginal(null)
    setEditTargetHint('')
  }

  const startEditContribution = (targetId: string, c: Contribution) => {
    setEditContributionId(c.id)
    setEditContributionTargetId(targetId)
    setEditContributionForm({ date: c.date, amount: String(c.amount), note: c.note })
  }

  const saveEditContribution = () => {
    if (!editContributionId || !editContributionTargetId) return
    const newAmount = Number(editContributionForm.amount) || 0
    setTargetsWithHistory(prev => updateContribution(prev, editContributionTargetId, editContributionId, newAmount, editContributionForm.date, editContributionForm.note))
    setEditContributionId(null)
    setEditContributionTargetId(null)
    setEditContributionForm({ date: '', amount: '', note: '' })
  }

  const cancelEditContribution = () => {
    setEditContributionId(null)
    setEditContributionTargetId(null)
    setEditContributionForm({ date: '', amount: '', note: '' })
  }

  const goToIncomeAndFocus = () => {
    setTab('Income')
    setTimeout(() => incomeRef.current?.focus(), 80)
  }

  // Target sections
  const fullyFundedTargets = targets.filter(t => !t.completed && t.goalAmount > 0 && t.currentSaved >= t.goalAmount)
  const completedTargets = targets.filter(t => t.completed)

  // V9.12 — Filtered transactions (shared between results summary + table + delete action)
  const filteredTxns = useMemo(() =>
    [...transactions]
      .filter(tx => {
        if (txnFilter === 'uncategorized') { if (!(tx.type === 'expense' && !tx.categoryId)) return false }
        else if (txnFilter === 'needs-review') { if (!txNeedsReview(tx, transactions, dismissedDupIds)) return false }
        else if (txnFilter !== 'all') { if (tx.type !== txnFilter) return false }
        if (txnSearch) {
          const q = txnSearch.toLowerCase()
          if (!tx.merchant.toLowerCase().includes(q) && !(tx.notes ?? '').toLowerCase().includes(q)) return false
        }
        if (txnAccountFilter && tx.accountId !== txnAccountFilter) return false
        if (txnCategoryFilter === '__none__' && tx.categoryId) return false
        if (txnCategoryFilter && txnCategoryFilter !== '__none__' && tx.categoryId !== txnCategoryFilter) return false
        return true
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, txnFilter, txnSearch, txnAccountFilter, txnCategoryFilter, dismissedDupIds]
  )
  const hasActiveFilters = txnFilter !== 'all' || !!txnSearch || !!txnAccountFilter || !!txnCategoryFilter

  // V9.12 — Goal planning summary
  const goalPlanSummary = useMemo(() => {
    const active   = targets.filter(t => !t.completed && t.goalAmount > t.currentSaved && !pausedGoals.has(t.id))
    const totalGoal = active.reduce((s, t) => s + t.goalAmount, 0)
    const totalSaved = active.reduce((s, t) => s + t.currentSaved, 0)
    const weeklyRequired = active.reduce((s, t) => {
      const req = requiredForTarget(t); return s + (req?.weekly ?? 0)
    }, 0)
    return {
      activeCount: active.length,
      pausedCount: targets.filter(t => pausedGoals.has(t.id)).length,
      fundedCount: targets.filter(t => !t.completed && t.goalAmount > 0 && t.currentSaved >= t.goalAmount).length,
      totalGoal, totalSaved, remaining: totalGoal - totalSaved, weeklyRequired,
    }
  }, [targets, pausedGoals])

  // ══════════════════════════════════════════════════════════════════════════════
  // V10 ARCHITECTURE — SAVINGS GOALS ENGINE
  // Target[] → activeTargets / pausedTargets / fullyFundedTargets / completedTargets
  // Contributions: addTargetContribution() → updates Target.currentSaved
  // Pace: computeTargetStatus() + requiredForTarget() → goal cards
  // Priority/pause: goalPriorities, pausedGoals state
  // ══════════════════════════════════════════════════════════════════════════════
  const getTargetCardProps = (t: Target) => {
    const req = requiredForTarget(t)
    const progressPct = t.goalAmount > 0 ? Math.min(100, (t.currentSaved / t.goalAmount) * 100) : 0
    const status = computeTargetStatus(t)
    const log = targetLogForm[t.id] ?? { date: new Date().toISOString().slice(0, 10), amount: '', note: '' }
    const isEditingTarget = editTargetId === t.id
    const isExpanded = expandedCards.has(t.id)
    const toggleExpanded = () => setExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(t.id)) next.delete(t.id)
      else next.add(t.id)
      return next
    })

    const isPaused = pausedGoals.has(t.id)
    const priority = goalPriorities[t.id] ?? null

    const statusBadge =
      status === 'Complete' || status === 'Ahead'
        ? 'bg-green-900/60 text-green-300 border border-green-700/50'
        : status === 'Behind'
          ? 'bg-red-900/60 text-red-300 border border-red-700/50'
          : 'bg-slate-700/80 text-slate-200 border border-slate-600/50'

    const barColor =
      status === 'Complete' || status === 'Ahead'
        ? 'bg-green-500'
        : status === 'Behind'
          ? 'bg-red-500'
          : 'bg-blue-500'

    return {
      t, req, progressPct, status, log, isEditingTarget, isExpanded, isPaused, priority,
      statusBadge, barColor, highlighted: highlightedTargetId === t.id,
      editTargetForm, editTargetHint, editContributionId, editContributionTargetId, editContributionForm,
      editGoalAmountRef, editCurrentSavedRef, editStartDateRef, editDeadlineRef, editBlurTimerRef,
      editStartDateArrowCount, editDeadlineArrowCount, editStartDateLeftArrowCount, editDeadlineLeftArrowCount,
      logDateRefs, logAmountRefs, logNoteRefs, logDateArrowCounts,
      setGoalPriorities, setPausedGoals, cancelEditTarget, setEditTargetId, setEditTargetOriginal,
      setEditTargetForm, saveEditTarget, setEditTargetHint, toggleExpanded, setEditContributionForm,
      saveEditContribution, cancelEditContribution, startEditContribution, setTargetsWithHistory,
      setTargetLogForm, addTargetContribution, period, convertToMonthly, convertFromMonthly, categories,
      pushBudgetHistory, setCategories, setTab, highlightTimerRef, setHighlightedCategoryId, showToast,
      setTargetFormHistory, setTargetFormRedo, targetForm, setTargetForm, setTargetFormHint, targetNameRef,
      onDeleteTarget: (id: string) => addPendingDelete('savings_goals', id),
      onDeleteContribution: (id: string) => addPendingDelete('savings_goal_contributions', id),
    }
  }

  // V12.4 — Local-first cloud persistence. localStorage remains runtime source of truth.
  // V14 — AI assistant
  const aiAssistant = useAIAssistant()
  const aiContext = useMemo(() => ({
    income: { monthlyNet: inc.totalMonthly, weeklyNet: convertFromMonthly(inc.totalMonthly, 'weekly') },
    budget: { monthlyTotal: monthlyBudget, monthlyRemaining: monthlyLeft, isOverIncome: monthlyBudget > inc.totalMonthly },
    cashFlow: { status: cashFlowForecast.status, projectedEnd: cashFlowForecast.projectedEnd, safeToSpend: cashFlowForecast.safeToSpend },
    categories: categories.slice(0, 12).map(c => ({ name: c.name, type: c.type, monthlyBudget: c.amount })),
    savingsGoals: targets.filter(t => !t.completed).map(t => ({ name: t.name, saved: t.currentSaved, goal: t.goalAmount, deadline: t.deadline, pct: t.goalAmount > 0 ? Math.round((t.currentSaved / t.goalAmount) * 100) : 0 })),
    recentSpending: { last30DaysTotal: monthlyReview.expenses, txnCount: monthlyReview.txns.length, reviewMonth },
    currentInsights: spendingInsights.map(i => `[${i.priority}] ${i.title}`),
  }), [inc, monthlyBudget, monthlyLeft, cashFlowForecast, categories, targets, monthlyReview, reviewMonth, spendingInsights])

  const cloudPersistence = useCloudPersistence({
    accounts,
    categories,
    transactions,
    rules,
    targets,
    savedTargetSets,
    savedScenarios,
    savedBudgets,
    actuals,
    importBatches,
    monthlyNotes,
    reviewedMonths,
    pendingDeletes: getPendingDeletes(),
    // V18 — previously unsynced entities
    takeHomeSettings: loadTakeHomeSettings() ?? ZYAN_PERSONAL_PRELOAD.takeHomeSettings,
    scenarioNotes,
    categoryMemory,
  })

  // V8.8 — Merchant suggestion: check rules then past transactions (no-op when category already chosen)

  const effectiveSidebarW = sidebarCollapsed ? 64 : sidebarW

  return (
    <div data-theme={theme} style={{ background: '#0B0B0F', minHeight: '100vh', color: '#f1f5f9' }}>

      {/* V29 — Fixed left sidebar (position:fixed, no layout impact on divs) */}
      <Sidebar
        currentTab={tab}
        onNavigate={setTab}
        onOpenSettings={() => setSettingsOpen(v => !v)}
        onOpenProfile={() => setProfileOpenSignal(v => v + 1)}
        onOpenKeyboardShortcuts={() => setKeyboardShortcutsOpen(true)}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSync={() => cloudPersistence.syncNow()}
        onOpenAIChat={() => setAiChatOpen(true)}
        onOpenCloud={() => setCloudOpenSignal(v => v + 1)}
        onOpenVersion={() => setVersionOpen(v => !v)}
        onWidthChange={(w) => setSidebarW(w)}
      />

      {/* Single inner container with dynamic left margin */}
      <div className="min-h-screen" style={{ marginLeft: effectiveSidebarW, width: `calc(100vw - ${effectiveSidebarW}px)`, minWidth: 0, transition: 'margin-left 0.2s cubic-bezier(0.4,0,0.2,1), width 0.2s cubic-bezier(0.4,0,0.2,1)' }}>

        {/* Compact sticky header — logo + utility only, no tabs */}
        <header style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 48, borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(11,11,15,0.95)', backdropFilter: 'blur(12px)' }}>
          <div className="flex items-center gap-2">
            <VersionBadge version={CURRENT_VERSION} open={versionOpen} onOpenChange={setVersionOpen} />
          </div>
          <div className="flex items-center gap-1.5">
            {appAuth.user
              ? <ProfilePanel
                  hasData={!isAppEmpty}
                  onLoadStarterData={handleLoadPersonalPreload}
                  onOpenSettings={() => setSettingsOpen(true)}
                  onOpenGuide={() => setOnboardingGuideOpen(true)}
                  openSignal={profileOpenSignal}
                />
              : <AuthPanel />
            }
            <CloudStatusButton
              theme={theme}
              externalOpenSignal={cloudOpenSignal}
              onExternalClose={() => {/* no-op: signal-based toggle */}}
              status={cloudPersistence.status}
              canSync={cloudPersistence.canSync}
              connectionTested={cloudPersistence.connectionTested}
              connectionTestError={cloudPersistence.connectionTestError}
              autoSyncEnabled={cloudPersistence.autoSyncEnabled}
              autoSyncPaused={cloudPersistence.autoSyncPaused}
              pendingCount={cloudPersistence.pendingCount}
              lastSyncedAt={cloudPersistence.lastSyncedAt}
              error={cloudPersistence.error}
              lastResult={cloudPersistence.lastResult}
              onTestConnection={cloudPersistence.runConnectionTest}
              onSyncNow={cloudPersistence.syncNow}
              onToggleAutoSync={cloudPersistence.setAutoSyncEnabled}
              onDownloadBackup={downloadBackupFile}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          </div>
        </header>

        {/* Main content — max-width constraint + padding */}
        <div className="max-w-7xl mx-auto px-5 py-5 space-y-4">

      {/* V33 — Persistent AI chat drawer */}
      <AIChatDrawer open={aiChatOpen} onClose={() => setAiChatOpen(false)} />

      {/* V33 — Breakdown editor modal */}
      {breakdownEditId && (() => {
        const cat = categories.find(c => c.id === breakdownEditId)
        if (!cat) return null
        return (
          <BreakdownEditor
            key={breakdownEditId}
            categoryName={cat.name}
            categoryAmount={cat.amount}
            items={breakdowns[breakdownEditId] ?? []}
            allCategories={categories}
            excludeCategoryId={breakdownEditId}
            onSave={items => setBreakdowns(prev => ({ ...prev, [breakdownEditId]: items }))}
            onClose={() => setBreakdownEditId(null)}
          />
        )
      })()}

      {cloudPersistence.pendingConflicts.length > 0 && (
        <ConflictResolutionModal
          conflicts={cloudPersistence.pendingConflicts}
          onResolve={cloudPersistence.resolveConflicts}
          onDismiss={cloudPersistence.dismissConflicts}
        />
      )}


      {keyboardShortcutsOpen && (
        <KeyboardShortcutsPanel onClose={() => setKeyboardShortcutsOpen(false)} />
      )}

      {/* V27 — Command Palette (Ctrl+K / ⌘+K) */}
      <CommandPalette
        onNavigate={(tab) => setTab(tab as Tab)}
        onOpenGuide={() => setOnboardingGuideOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onLoadDemo={handleLoadDemo}
        onSync={() => cloudPersistence.syncNow()}
      />

      {/* V24 — Onboarding Guide */}
      {onboardingGuideOpen && (
        <OnboardingGuide
          onClose={() => setOnboardingGuideOpen(false)}
          onNavigate={(tab) => { setTab(tab as Tab); }}
        />
      )}

      {/* V16 — Settings panel */}
      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onLoadDemo={handleLoadDemo}
          onClearAllData={handleClearAllData}
          onDownloadBackup={downloadBackupFile}
          onImportFromFile={handleImportFromFile}
          lastSyncedAt={cloudPersistence.lastSyncedAt}
          version={CURRENT_VERSION}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}

        {/* ── DASHBOARD ── */}
        {tab === 'Dashboard' && (
          <section className="space-y-4 transition-all duration-300">

            {/* V20 — Print/PDF export button */}
            {!isAppEmpty && (
              <div className="flex justify-end print:hidden">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                  title="Export dashboard as PDF via browser print"
                >
                  ↓ Export PDF
                </button>
              </div>
            )}

            {/* V16 — Onboarding card when empty */}
            {isAppEmpty && (
              <>
              <OnboardingCard
                onLoadDemo={handleLoadDemo}
                onOpenSettings={() => setSettingsOpen(true)}
              />
              <div className="flex justify-center">
                <button
                  onClick={() => setOnboardingGuideOpen(true)}
                  className="flex items-center gap-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-colors shadow-lg"
                >
                  📖 Open Setup Guide
                </button>
              </div>
              </>
            )}

            {/* V23 — Starter data card only shown when app is empty */}
            {isAppEmpty && (
            <PersonalPreloadCard
              onLoadPersonalData={handleLoadPersonalPreload}
              onDownloadBackup={downloadBackupFile}
              onSavePersonalDefault={handleSavePersonalDefault}
              hasCustomDefault={hasCustomPersonalDefault}
            />
            )}

            {/* ── V7.3 Dashboard Status Banner ── */}
            <DashboardStatusBanner status={dashboardStatus} theme={theme} />

            {/* ── Action Cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <ActionCard
                title="Review Budget"
                description={
                  actualOverspendPct >= 10
                    ? `Actual spending is above plan. Review the largest variance first.`
                    : "See how your income is allocated across bills, spending, and savings."
                }
                onClick={() => setTab('Budget')}
                tone={actualOverspendPct >= 10 ? 'warn' : 'neutral'}
              />
              <ActionCard
                title="Check Savings Goals"
                description={activeTargets.length > 0 ? `${activeTargets.length} active goal${activeTargets.length > 1 ? 's' : ''} — log contributions and track progress.` : 'Set savings goals and track your progress toward each one.'}
                onClick={() => setTab('Targets')}
                tone={activeTargets.filter(t => computeTargetStatus(t) === 'Behind').length > 0 ? 'warn' : 'neutral'}
              />
              <ActionCard
                title="Adjust Income Forecast"
                description="Update your gross income to see how your take-home and commission change."
                onClick={goToIncomeAndFocus}
                tone="neutral"
              />
              <ActionCard
                title="Test a Scenario"
                description="Compare Slow, Medium, and Fast income levels against your current budget."
                onClick={() => setTab('Scenarios')}
                tone={inc.commissionPct > 45 ? 'warn' : 'neutral'}
              />
            </div>

            {/* ── V13 Spending Insights ── */}
            <SpendingInsightsPanel
              insights={spendingInsights}
              onAction={(tab) => setTab(tab as Tab)}
            />

            {/* ── V14 AI Financial Assistant ── */}
            <AIAssistantPanel
              messages={aiAssistant.messages}
              status={aiAssistant.status}
              error={aiAssistant.error}
              onSend={(text) => aiAssistant.sendMessage(text, aiContext)}
              onClear={aiAssistant.clearHistory}
            />

            <Card title="Dashboard Summary">
              <div className="flex gap-2 mb-4">{periods.map(p => <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>{labelPeriod(p)}</Pill>)}</div>
              <p className="mb-4">
                Monthly Gross Income Reference:{' '}
                <span
                  className={`${gp > 10000 ? 'text-green-400' : ''} font-semibold underline cursor-pointer hover:opacity-75 transition-opacity`}
                  onClick={goToIncomeAndFocus}
                  title="Click to edit in Income tab"
                >
                  {currency(gp)}
                </span>
              </p>
              <div className="grid md:grid-cols-3 gap-3">
                <Metric title="Base Gross Income (salary only)" value={currency(convertFromMonthly(inc.baseGrossMonthly, period))} />
                <Metric title="Base Net Income (salary take-home)" value={currency(baseNetByPeriod)} />
                <Metric title="Commission Income (net)" value={currency(convertFromMonthly(inc.cMonthly, period))} />
                <Metric title="Total Net Income (salary + commission take-home)" value={currency(convertFromMonthly(inc.totalMonthly, period))} featured />
                <Metric title="Total Budget" value={currency(convertFromMonthly(monthlyBudget, period))} tone={totalBudgetTone} />
                <Metric title="Remaining After Budget" value={currency(selectedPeriodRemaining)} tone={remainingTone} glow={selectedPeriodRemaining < 0} />
              </div>
              {/* Financial Intelligence — folded in */}
              <div className="mt-4 pt-4 border-t border-slate-700/60">
                <div className="grid md:grid-cols-3 gap-3">
                  <Info title="Biggest Expense" value={top[0] ? `${top[0].name} (${currency(convertFromMonthly(top[0].amount, period))} ${labelPeriod(period)})` : 'None'} tone={biggestExpenseTone} />
                  <Info title="Fixed Bills Ratio" value={`${fixedRatio.toFixed(1)}%`} />
                  <Info title="Savings Rate" value={`${savingsRate.toFixed(1)}%`} tone={savingsTone} />
                  <Info title="Commission Dependency" value={`${dep.toFixed(1)}%`} className={depColor} />
                  <Info title="Remaining Cushion" value={`${remainingCushionPct.toFixed(1)}%`} tone={cushionTone} />
                  <Info title="Budget Status / Health Tier" value={statusLabel} tone={statusTone} glow={selectedPeriodRemaining < 0} />
                </div>
              </div>
            </Card>

            {/* ── V9.8 Cash Flow Forecast ── */}
            <div className="rounded-2xl border border-slate-700 bg-slate-800/60">
              <button
                onClick={() => setForecastOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-700/20 transition-colors rounded-2xl"
              >
                <h2 className="text-lg font-semibold text-slate-100">Cash Flow Forecast</h2>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-medium ${cashFlowForecast.status === 'comfortable' ? 'text-emerald-400' : cashFlowForecast.status === 'tight' ? 'text-amber-400' : 'text-red-400'}`}>
                    {currency(cashFlowForecast.projectedEnd)} · {cashFlowForecast.status}
                  </span>
                  <span className="text-slate-500 text-sm">{forecastOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {forecastOpen && (
              <div className="px-5 pb-5">
              {/* Period selector */}
              <div className="flex gap-1.5 mb-4">
                {([7, 14, 30, 60] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setForecastPeriod(d)}
                    className={`px-3 py-1 text-xs rounded-full transition-colors ${forecastPeriod === d ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                  >{d} days</button>
                ))}
                <span className="text-xs text-slate-500 self-center ml-2">{cashFlowForecast.todayStr} → {cashFlowForecast.endStr}</span>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="rounded-lg bg-slate-800 border border-slate-700/60 px-3 py-2.5">
                  <div className="text-xs text-slate-400 mb-0.5">Starting Cash</div>
                  <div className={`text-lg font-bold ${cashFlowForecast.startingCash >= 0 ? 'text-green-400' : 'text-red-400'}`}>{currency(cashFlowForecast.startingCash)}</div>
                  <div className="text-[10px] text-slate-500">checking + savings</div>
                </div>
                <div className="rounded-lg bg-slate-800 border border-slate-700/60 px-3 py-2.5">
                  <div className="text-xs text-slate-400 mb-0.5">Expected Income</div>
                  <div className="text-lg font-bold text-green-400">+{currency(cashFlowForecast.totalIncome)}</div>
                  <div className="text-[10px] text-slate-500">recurring / manual</div>
                </div>
                <div className="rounded-lg bg-slate-800 border border-slate-700/60 px-3 py-2.5">
                  <div className="text-xs text-slate-400 mb-0.5">Expected Expenses</div>
                  <div className="text-lg font-bold text-red-400">−{currency(cashFlowForecast.totalExpenses)}</div>
                  <div className="text-[10px] text-slate-500">recurring / subscriptions</div>
                </div>
                <div className={`rounded-lg border px-3 py-2.5 ${cashFlowForecast.status === 'risk' ? 'bg-red-900/20 border-red-700/40' : cashFlowForecast.status === 'tight' ? 'bg-amber-900/20 border-amber-700/40' : 'bg-green-900/20 border-green-700/40'}`}>
                  <div className="text-xs text-slate-400 mb-0.5">Projected End</div>
                  <div className={`text-lg font-bold ${cashFlowForecast.status === 'risk' ? 'text-red-400' : cashFlowForecast.status === 'tight' ? 'text-amber-300' : 'text-green-400'}`}>{currency(cashFlowForecast.projectedEnd)}</div>
                  <div className={`text-[10px] font-medium ${cashFlowForecast.status === 'risk' ? 'text-red-400' : cashFlowForecast.status === 'tight' ? 'text-amber-300' : 'text-green-400'}`}>
                    {cashFlowForecast.status === 'risk' ? '⚠ Risk — cash may go negative' : cashFlowForecast.status === 'tight' ? '· Tight — staying low' : '✓ Comfortable'}
                  </div>
                </div>
              </div>

              {/* Safe to spend */}
              <div className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-4 py-2.5 mb-4 flex items-center justify-between">
                <div>
                  <span className="text-sm font-medium text-slate-200">Safe to spend over {forecastPeriod} days</span>
                  <span className="text-xs text-slate-500 ml-2">(after expenses + $250 buffer)</span>
                </div>
                <span className={`text-lg font-bold ${cashFlowForecast.safeToSpend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{currency(cashFlowForecast.safeToSpend)}</span>
              </div>

              {/* Upcoming items list */}
              {cashFlowForecast.items.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-xs text-slate-400 mb-2 font-medium">Upcoming items</p>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {cashFlowForecast.items.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500 w-20 shrink-0">{item.date}</span>
                          <span className="text-slate-300">{item.name}</span>
                          <span className={`text-[9px] px-1 py-0.5 rounded ${item.source === 'manual' ? 'bg-blue-900/40 text-blue-300 border border-blue-700/30' : 'bg-teal-900/40 text-teal-300 border border-teal-700/30'}`}>{item.source}</span>
                        </div>
                        <span className={`font-medium ${item.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                          {item.type === 'income' ? '+' : '−'}{currency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-2">
                  No upcoming recurring items found. Confirm or add recurring items in the Transactions tab to populate the forecast.
                </p>
              )}</div>)}
            </div>

            {/* ── V9.9 Monthly Review ── */}
            <div className="rounded-2xl border border-slate-700 bg-slate-800/60">
              <button
                onClick={() => setReviewOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-700/20 transition-colors rounded-2xl"
              >
                <h2 className="text-lg font-semibold text-slate-100">Monthly Review</h2>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">{reviewMonth}</span>
                  <span className="text-slate-500 text-sm">{reviewOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {reviewOpen && (<div className="px-5 pb-5">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <input
                  type="month" value={reviewMonth} onChange={e => setReviewMonth(e.target.value)}
                  className="px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                />
                {reviewedMonths[reviewMonth] ? (
                  <span className="text-xs text-green-400 bg-green-900/30 border border-green-700/30 px-2 py-0.5 rounded flex items-center gap-1.5">
                    ✓ Reviewed {new Date(reviewedMonths[reviewMonth]).toLocaleDateString()}
                    <button className="text-slate-400 hover:text-red-400" onClick={() => setReviewedMonths(p => { const n = {...p}; delete n[reviewMonth]; return n })}>×</button>
                  </span>
                ) : (
                  <button
                    className="text-xs bg-blue-600 hover:bg-blue-500 px-3 py-1.5 rounded transition-colors"
                    onClick={() => setReviewedMonths(p => ({ ...p, [reviewMonth]: new Date().toISOString() }))}
                  >Mark Month Reviewed</button>
                )}
                <span className="text-xs text-slate-500 ml-auto">{monthlyReview.txns.length} transaction{monthlyReview.txns.length !== 1 ? 's' : ''}</span>
              </div>

              {/* V13 — Prose insight summary */}
              {monthlyReviewSummary && (
                <p className="text-xs text-slate-400 leading-relaxed mb-4 px-0.5">
                  {monthlyReviewSummary}
                </p>
              )}

              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Total Income', val: `+${currency(monthlyReview.income)}`, color: 'text-green-400' },
                  { label: 'Total Spending', val: `−${currency(monthlyReview.expenses)}`, color: 'text-red-400' },
                  { label: 'Net Cash Flow', val: `${monthlyReview.netCash >= 0 ? '+' : '−'}${currency(Math.abs(monthlyReview.netCash))}`, color: monthlyReview.netCash >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'CC Payments', val: currency(monthlyReview.ccPayments), color: 'text-purple-300' },
                ].map(({ label, val, color }) => (
                  <div key={label} className="rounded-lg bg-slate-800 border border-slate-700/60 px-3 py-2.5">
                    <div className="text-xs text-slate-400 mb-0.5">{label}</div>
                    <div className={`text-lg font-bold ${color}`}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Checklist */}
              <div className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-4 py-3 mb-4">
                <p className="text-xs text-slate-400 font-medium mb-2">Checklist</p>
                <div className="space-y-1.5">
                  {[
                    { label: 'All expenses categorized', ok: monthlyReview.uncatExpenses === 0, note: monthlyReview.uncatExpenses > 0 ? `${monthlyReview.uncatExpenses} uncategorized` : '' },
                    { label: 'Duplicates resolved', ok: monthlyReview.unresolvedDups === 0, note: monthlyReview.unresolvedDups > 0 ? `${monthlyReview.unresolvedDups} unresolved` : '' },
                    { label: 'Recurring items reviewed', ok: monthlyReview.recurringReviewed, note: !monthlyReview.recurringReviewed ? 'Confirm or dismiss in Subscriptions' : '' },
                    { label: 'Month marked reviewed', ok: !!reviewedMonths[reviewMonth], note: '' },
                  ].map(({ label, ok, note }) => (
                    <div key={label} className="flex items-center gap-2 text-xs">
                      <span className={`shrink-0 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-bold ${ok ? 'bg-green-500/30 text-green-400' : 'bg-amber-500/30 text-amber-300'}`}>{ok ? '✓' : '!'}</span>
                      <span className={ok ? 'text-slate-300' : 'text-amber-200'}>{label}</span>
                      {note && <span className="text-slate-500">— {note}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Category breakdown + biggest transactions */}
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                {monthlyReview.catBreakdown.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">Category Breakdown</p>
                    <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[300px]">
                      <thead><tr className="text-left text-slate-500 border-b border-slate-700/60">
                        <th className="pb-1 pr-2 font-medium">Category</th>
                        <th className="pb-1 pr-2 text-right font-medium">Planned</th>
                        <th className="pb-1 pr-2 text-right font-medium">Actual</th>
                        <th className="pb-1 text-right font-medium">+/−</th>
                      </tr></thead>
                      <tbody>
                        {monthlyReview.catBreakdown.slice(0, 8).map(({ catId, name, planned, actual, diff }) => (
                          <tr key={catId} className="border-b border-slate-800/60">
                            <td className="py-1 pr-2 text-slate-300">{name}</td>
                            <td className="py-1 pr-2 text-right text-slate-500">{planned > 0 ? currency(planned) : '—'}</td>
                            <td className="py-1 pr-2 text-right font-medium text-slate-200">{currency(actual)}</td>
                            <td className={`py-1 text-right font-medium ${planned > 0 ? (diff > 0 ? 'text-red-400' : 'text-green-400') : 'text-slate-600'}`}>
                              {planned > 0 ? (diff > 0 ? `+${currency(diff)}` : `−${currency(Math.abs(diff))}`) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </div>
                )}
                {monthlyReview.bigTxns.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-400 font-medium mb-2">Biggest Transactions</p>
                    <div className="space-y-1">
                      {monthlyReview.bigTxns.slice(0, 8).map(tx => {
                        const cat = categories.find(c => c.id === tx.categoryId)
                        const acct = accounts.find(a => a.id === tx.accountId)
                        return (
                          <div key={tx.id} className="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0 gap-2">
                            <div className="min-w-0">
                              <span className="text-slate-300 block truncate">{normalizeMerchant(tx.merchant)}</span>
                              <span className="text-slate-600">{tx.date}{acct ? ` · ${acct.name}` : ''}{cat ? ` · ${cat.name}` : ''}</span>
                            </div>
                            <span className="font-semibold text-red-400 shrink-0">−{currency(tx.amount)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <p className="text-xs text-slate-400 font-medium mb-1.5">Notes — What happened this month?</p>
                <textarea
                  className="w-full px-3 py-2 text-xs rounded-lg bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none resize-none text-slate-300 placeholder:text-slate-600"
                  rows={3}
                  placeholder="Any big expenses, income changes, or things to remember…"
                  value={monthlyNotes[reviewMonth] ?? ''}
                  onChange={e => setMonthlyNotes(p => ({ ...p, [reviewMonth]: e.target.value }))}
                />
              </div>
              {monthlyReview.txns.length === 0 && (
                <p className="text-xs text-slate-500 text-center mt-2">No transactions for {reviewMonth}. Log or import transactions to see the monthly review.</p>
              )}</div>)}
            </div>
          </section>
        )}

        {tab === 'Dashboard' && targets.length > 0 && period === 'bi-weekly' && (
          <Card title="Log Savings From This Paycheck">
            <div className="grid md:grid-cols-4 gap-2">
              <input type="date" className="p-2 rounded bg-slate-800 border border-slate-600" value={dashboardQuickDate} onChange={(e) => setDashboardQuickDate(e.target.value)} />
              <select className="p-2 rounded bg-slate-800 border border-slate-600" value={dashboardQuickTargetId} onChange={(e) => setDashboardQuickTargetId(e.target.value)}>
                <option value="">Select target</option>
                {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input type="number" min={0} step={25} className="p-2 rounded bg-slate-800 border border-slate-600" value={dashboardQuickAmount} onChange={(e) => setDashboardQuickAmount(e.target.value)} placeholder="Amount" />
              <button className="rounded bg-blue-600" onClick={() => { if (!dashboardQuickTargetId) return; addTargetContribution(dashboardQuickTargetId, Number(dashboardQuickAmount) || 0, dashboardQuickDate, 'Paycheck quick add'); setDashboardQuickAmount('') }}>Add Contribution</button>
            </div>
          </Card>
        )}

        {/* ── INCOME ── */}
        {tab === 'Income' && (
          <section className="space-y-4 transition-all duration-300">
            <Card title="Income Input">
              <label className="text-sm">Monthly Gross Income</label>
              <div className="relative mt-2">
                <span className="absolute left-3 top-2.5 text-slate-400">$</span>
                <input
                  ref={incomeRef}
                  type="number"
                  min={0}
                  step={100}
                  value={gpInput}
                  onChange={e => setGpInput(String(Math.max(0, Number(e.target.value) || 0)))}
                  className="w-full pl-7 p-2 rounded-lg bg-slate-800 border border-slate-600"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">{currency(gp)}</p>
              <div className="mt-3 space-y-0.5">
                <Row l="Current base salary" v={currency(adjustedSalary)} />
                <Row l="Eligible base bumps (from GP)" v={`${eligibleBumps}`} />
                <Row l="Applied base bumps" v={`${baseBumpsAchieved}`} />
                <Row
                  l="Next base bump threshold"
                  v={nextUnreachedThreshold !== undefined ? currency(nextUnreachedThreshold) : 'All bumps achieved'}
                />
              </div>
              {eligibleBumps !== baseBumpsAchieved && (
                <button
                  className="mt-3 rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm transition-colors"
                  onClick={() => setBaseBumpsAchieved(eligibleBumps)}
                >
                  Apply eligible bumps ({eligibleBumps - baseBumpsAchieved} new)
                </button>
              )}
              {baseBumpsAchieved > 0 && eligibleBumps === baseBumpsAchieved && (
                <p className="mt-2 text-xs text-green-400">
                  {baseBumpsAchieved} base {baseBumpsAchieved === 1 ? 'bump' : 'bumps'} applied — salary is {currency(adjustedSalary)}
                </p>
              )}
            </Card>
            {/* V9.14 — Arizona take-home estimate: effective rates, 4 reference levels */}
            {(() => {
              const bd = estimateTaxBreakdown(grossSalary)
              const effectiveFedPct = bd.grossAnnual > 0 ? (bd.fedTax / bd.grossAnnual) * 100 : 0
              const withholdingPct = (1 - bd.takeHomeRate) * 100
              // Reference lines for the 4 spec benchmark levels
              const refLevels = [40000, 60000, 80000, 100000].map(g => {
                const r = estimateTaxBreakdown(g)
                const fp = r.grossAnnual > 0 ? (r.fedTax / r.grossAnnual) * 100 : 0
                const total = fp + 2.5 + 6.2 + 1.45
                return { g, fp, total }
              })
              return (
                <Card title="Estimated Take-Home (Arizona, Single Filer)">
                  <div className="text-xs text-slate-500 mb-4 space-y-0.5">
                    {refLevels.map(({ g, fp, total }) => (
                      <div key={g}>
                        At {currency(g)}: Federal ({fp.toFixed(2)}%) + AZ state (2.5%) + SS (6.2%) + Medicare (1.45%) = {total.toFixed(2)}%
                      </div>
                    ))}
                    <div className="text-slate-400 pt-1">
                      Current estimate: Federal ({effectiveFedPct.toFixed(2)}%) + AZ state (2.5%) + SS (6.2%) + Medicare (1.45%) = {withholdingPct.toFixed(2)}% withheld → {(bd.takeHomeRate * 100).toFixed(2)}% take-home
                      {' '}<span className="italic text-slate-500">Planning estimate only, not tax advice.</span>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-2 gap-3 mb-3">
                    <div className="rounded-lg bg-slate-800/60 border border-slate-700/60 px-3 py-2.5">
                      <div className="text-xs text-slate-400 mb-1">Estimated Annual Gross</div>
                      <div className="text-lg font-bold text-slate-200">{currency(bd.grossAnnual)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-800/60 border border-slate-700/60 px-3 py-2.5">
                      <div className="text-xs text-slate-400 mb-1">Est. Effective Take-Home Rate</div>
                      <div className="text-lg font-bold text-green-400">{(bd.takeHomeRate * 100).toFixed(1)}%</div>
                    </div>
                    <div className="rounded-lg bg-slate-800/60 border border-slate-700/60 px-3 py-2.5">
                      <div className="text-xs text-slate-400 mb-1">Est. Annual Take-Home</div>
                      <div className="text-lg font-bold text-slate-200">{currency(bd.takeHomeAnnual)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-800/60 border border-slate-700/60 px-3 py-2.5">
                      <div className="text-xs text-slate-400 mb-1">Est. Effective Withholding Rate</div>
                      <div className="text-lg font-bold text-slate-300">{withholdingPct.toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="space-y-0.5">
                    <Row l={`Federal income tax (est. ${effectiveFedPct.toFixed(2)}%)`} v={currency(bd.fedTax)} valueClass="text-slate-300" />
                    <Row l="Arizona state tax (2.5%)" v={currency(bd.azTax)} valueClass="text-slate-300" />
                    <Row l="Social Security (6.2%)" v={currency(bd.ssTax)} valueClass="text-slate-300" />
                    <Row l="Medicare (1.45%)" v={currency(bd.medicareTax)} valueClass="text-slate-300" />
                    <Row l="Total estimated withholding" v={currency(bd.totalTax)} valueClass="text-slate-300" />
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-700/60 grid md:grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className="text-xs text-slate-400 mb-0.5">Weekly take-home</div>
                      <div className="font-semibold text-slate-200">{currency(bd.takeHomeAnnual / 52)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-slate-400 mb-0.5">Bi-weekly take-home</div>
                      <div className="font-semibold text-slate-200">{currency(bd.takeHomeAnnual / 26)}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-slate-400 mb-0.5">Monthly take-home</div>
                      <div className="font-semibold text-slate-200">{currency(bd.takeHomeAnnual / 12)}</div>
                    </div>
                  </div>
                </Card>
              )
            })()}
            <div className="grid md:grid-cols-2 gap-4">
              <Card title="Base Income">
                <Row l="Weekly Net" v={currency(inc.baseWeekly)} />
                <Row l="Bi-weekly Net" v={currency(inc.baseBiWeekly)} />
                <Row l="Monthly Net" v={currency(inc.baseMonthly)} />
              </Card>
              <Card title="Commission Income">
                <Row l="Weekly Commission" v={currency(inc.cWeekly)} />
                <Row l="Bi-weekly Commission" v={currency(inc.cBiWeekly)} />
                <Row l="Monthly Commission" v={currency(inc.cMonthly)} />
              </Card>
              <Card title="Total Income">
                <Row l="Weekly Net" v={currency(inc.totalWeekly)} />
                <Row l="Bi-weekly Net" v={currency(inc.totalBiWeekly)} />
                <Row l="Monthly Net" v={currency(inc.totalMonthly)} />
                <Row l="Gross Salary (annual)" v={currency(grossSalary)} />
              </Card>
              <Card title="Efficiency Metrics">
                <Row l="Effective hourly net rate" v={currency(inc.totalWeekly / HOURS_PER_WEEK) + ' per hour'} />
                <Row l="Commission as % of total" v={`${dep.toFixed(1)}%`} />
                <Row l="Commission per hour" v={currency(inc.cWeekly / HOURS_PER_WEEK)} />
              </Card>
            </div>
          </section>
        )}

        {/* ── BUDGET ── */}
        {tab === 'Budget' && (
          <section className="space-y-4 transition-all duration-300">
            <Card title="Budget Summary">
              <div className="flex gap-2 flex-wrap mb-4">{periods.map(p => <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>{labelPeriod(p)}</Pill>)}</div>
              <div className="grid md:grid-cols-4 gap-3">
                <Metric title="Available income" value={currency(selectedPeriodTotalNet)} />
                <Metric title="Total planned" value={currency(plannedPeriodTotal)} />
                <Metric title="Remaining" value={currency(selectedPeriodRemaining)} tone={remainingTone} glow={selectedPeriodRemaining < 0} />
                <Metric title="Budget status" value={statusLabel} tone={statusTone} glow={selectedPeriodRemaining < 0} />
              </div>

              {/* V9.11 — Budget Health summary + review actions */}
              {categories.length > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-700/60">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Budget Health</span>
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* V32 — Category search */}
                      <input
                        type="text"
                        value={budgetSearch}
                        onChange={e => setBudgetSearch(e.target.value)}
                        placeholder="Search categories…"
                        className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none w-40"
                      />
                      <div className="flex gap-1.5">
                      <button
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${budgetFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                        onClick={() => { setBudgetFilter('all'); budgetCategoryTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
                      >All</button>
                      <button
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${budgetFilter === 'over-budget' ? 'bg-red-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                        onClick={() => { setBudgetFilter(v => v === 'over-budget' ? 'all' : 'over-budget'); budgetCategoryTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
                      >Over Budget {budgetHealth.overBudget.length > 0 && `(${budgetHealth.overBudget.length})`}</button>
                      <button
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${budgetFilter === 'no-activity' ? 'bg-slate-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                        onClick={() => { setBudgetFilter(v => v === 'no-activity' ? 'all' : 'no-activity'); budgetCategoryTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
                      >No Activity {budgetHealth.noActivity.length > 0 && `(${budgetHealth.noActivity.length})`}</button>
                    </div>
                  </div>
                </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { label: 'Total Planned', val: currency(budgetHealth.totalPlanned), color: 'text-slate-200' },
                      { label: 'Total Actual', val: hasAnyActual ? currency(budgetHealth.totalActual) : '—', color: 'text-slate-200' },
                      { label: 'Remaining', val: hasAnyActual ? currency(budgetHealth.remaining) : '—', color: budgetHealth.remaining >= 0 ? 'text-green-400' : 'text-red-400' },
                      { label: 'Over Budget', val: String(budgetHealth.overBudget.length), color: budgetHealth.overBudget.length > 0 ? 'text-red-400' : 'text-green-400' },
                    ].map(({ label, val, color }) => (
                      <div key={label} className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-2.5 py-2">
                        <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
                        <div className={`text-base font-bold ${color}`}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* ── Plan vs Actual summary — always visible ── */}
              <div className="mt-3 pt-3 border-t border-slate-700/60">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Plan vs Actual</span>
                    <p className="text-[10px] text-slate-500 mt-0.5 normal-case tracking-normal">Actuals combine categorized transactions plus any manual adjustment.</p>
                  </div>
                  {hasAnyActual && (
                    <button
                      className="rounded px-2 py-0.5 text-xs bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                      onClick={() => {
                        pushActualsHistory({ ...actuals })
                        setActuals({})
                        setPressureFocusCategoryId(null)
                      }}
                    >
                      Clear All Actuals
                    </button>
                  )}
                </div>
                <div className="grid md:grid-cols-3 gap-3">
                  <Metric
                    title="Total actual"
                    value={hasAnyActual ? currency(actualPeriodTotal) : '—'}
                  />
                  <Metric
                    title="Total variance"
                    value={
                      !hasAnyActual
                        ? '—'
                        : Math.abs(variancePeriodTotal) < 0.005
                          ? 'On plan'
                          : variancePeriodTotal < 0
                            ? `Under by ${currency(Math.abs(variancePeriodTotal))}`
                            : `Over by ${currency(variancePeriodTotal)}`
                    }
                    tone={!hasAnyActual ? 'neutral' : (() => {
                      const t = varianceTone(variancePeriodTotal, period)
                      return t === 'danger' ? 'danger' : t === 'warn' ? 'warn' : t === 'good' ? 'good' : 'neutral'
                    })()}
                  />
                  <Metric
                    title="Overspend %"
                    value={
                      !hasAnyActual
                        ? '—'
                        : actualOverspendPct > 0
                          ? `${actualOverspendPct.toFixed(1)}% over plan`
                          : 'Under / on plan'
                    }
                    tone={!hasAnyActual ? 'neutral' : actualOverspendPct > 20 ? 'danger' : actualOverspendPct > 5 ? 'warn' : 'good'}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {(() => {
                    const r = getPeriodDateRange(period)
                    const hasTxnActuals = Object.keys(txnActuals).length > 0
                    if (hasTxnActuals) {
                      return `Actuals include categorized transactions from ${r.start} to ${r.end}. Use the +adj field to add manual adjustments.`
                    }
                    return `No categorized transactions found for ${r.start} to ${r.end}. Enter actuals manually or assign budget categories to transactions.`
                  })()}
                </p>

                {/* ── V7.7 Budget Pressure Focus card ── */}
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">What should I look at first?</p>
                  {!hasAnyActual ? (
                    <p className="text-sm text-slate-400">Enter actuals to see what needs attention first.</p>
                  ) : biggestOverPlanCategory ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-900/10 px-3 py-2.5">
                      <div>
                        <p className="text-sm text-slate-200">
                          Start with <span className="font-semibold text-amber-300">{biggestOverPlanCategory.name}</span> — it is over plan by <span className="font-semibold text-amber-300">{currency(biggestOverPlanCategory.overBy)}</span>.
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {actualOverspendPct >= 20
                            ? 'Spending is significantly over plan overall.'
                            : actualOverspendPct >= 5
                              ? 'Spending is running over plan this period.'
                              : 'Most categories are close to plan.'}
                        </p>
                      </div>
                      <button
                        className="shrink-0 rounded px-2.5 py-1.5 text-xs font-medium bg-amber-700/60 hover:bg-amber-700/80 text-amber-100 transition-colors"
                        onClick={() => {
                          if (pressureFocusTimerRef.current) clearTimeout(pressureFocusTimerRef.current)
                          setPressureFocusCategoryId(biggestOverPlanCategory.id)
                          // Focus the actual input for that row
                          setTimeout(() => {
                            actualInputRefs.current[biggestOverPlanCategory.id]?.focus()
                          }, 50)
                          pressureFocusTimerRef.current = setTimeout(() => setPressureFocusCategoryId(null), 2500)
                        }}
                      >
                        Review this category
                      </button>
                    </div>
                  ) : variancePeriodTotal > 0 ? (
                    <p className="text-sm text-slate-400">Actuals are close to plan. No major pressure area yet.</p>
                  ) : (
                    <p className="text-sm text-slate-400">Actuals are currently under plan. Keep tracking before making changes.</p>
                  )}
                </div>
              </div>
            </Card>
            <div ref={budgetCategoryTableRef} className="scroll-mt-4"><Card title="Budget Categories">
              <div className="grid md:grid-cols-4 gap-2">
                <div ref={autocompleteWrapRef} className="relative">
                  <input
                    ref={budgetNameRef}
                    className="w-full p-2 rounded-lg bg-slate-800 border border-slate-600"
                    placeholder="Category name"
                    value={form.name}
                    onFocus={() => setShowSuggestions(true)}
                    onBlur={commitFormCheckpoint}
                    onChange={e => { setForm(v => ({ ...v, name: e.target.value })); setSIndex(-1); setShowSuggestions(true); setBudgetFormHint('') }}
                    onKeyDown={e => {
                      if (!suggestionList.length) { if (e.key === 'Enter') { commitFormCheckpoint(); budgetAmountRef.current?.focus() }; return }
                      if (e.key === 'ArrowDown') { e.preventDefault(); setSIndex(v => Math.min(v + 1, suggestionList.length - 1)) }
                      if (e.key === 'ArrowUp') { e.preventDefault(); setSIndex(v => Math.max(v - 1, 0)) }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (sIndex >= 0) { const selected = suggestionList[sIndex]; setForm(v => ({ ...v, name: selected, type: presetTypeMap[selected] ?? v.type })); setShowSuggestions(false); commitFormCheckpoint(); budgetAmountRef.current?.focus() }
                        else { commitFormCheckpoint(); budgetAmountRef.current?.focus() }
                      }
                    }}
                  />
                  {showSuggestions && suggestionList.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg">
                      {suggestionList.map((x, i) => (
                        <button key={x} className={`w-full text-left px-2 py-1 ${i === sIndex ? 'bg-slate-700' : 'hover:bg-slate-700'}`} onClick={() => { setForm(v => ({ ...v, name: x, type: presetTypeMap[x] ?? v.type })); setShowSuggestions(false); setBudgetFormHint(''); commitFormCheckpoint(); budgetAmountRef.current?.focus() }}>{x}</button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  ref={budgetAmountRef}
                  type="number"
                  min={0}
                  step={25}
                  placeholder={`${labelPeriod(period)} Amount`}
                  className="p-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={form.amount}
                  onBlur={commitFormCheckpoint}
                  onChange={e => {
                    const raw = e.target.value
                    // Allow blank; treat 0 as blank for cleaner UX
                    if (raw === '' || raw === '0') { setForm(v => ({ ...v, amount: '' })); setBudgetFormHint(''); return }
                    setForm(v => ({ ...v, amount: raw })); setBudgetFormHint('')
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitFormCheckpoint(); upsert() }
                    if (e.key === 'ArrowRight') { e.preventDefault(); commitFormCheckpoint(); budgetTypeRef.current?.focus() }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); commitFormCheckpoint(); budgetNameRef.current?.focus() }
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault()
                      const cur = Number(form.amount) || 0
                      const next = e.key === 'ArrowUp' ? cur + 25 : Math.max(0, cur - 25)
                      setForm(v => ({ ...v, amount: next === 0 ? '' : String(next) }))
                    }
                  }}
                />
                <select
                  ref={budgetTypeRef}
                  className="p-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={form.type}
                  onKeyDown={e => {
                    if (['1', '2', '3', '4'].includes(e.key)) { const m = { '1': 'fixed bill', '2': 'variable spending', '3': 'savings', '4': 'investing' } as const; setForm(v => ({ ...v, type: m[e.key as keyof typeof m] })) }
                    if (e.key === 'Enter') { e.preventDefault(); commitFormCheckpoint(); upsert() }
                    if (e.key === 'ArrowRight') { e.preventDefault() }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); commitFormCheckpoint(); budgetAmountRef.current?.focus() }
                  }}
                  onChange={e => { setForm(v => ({ ...v, type: e.target.value as CategoryType })); commitFormCheckpoint() }}
                >
                  <option value="fixed bill">1 - Fixed Bill</option>
                  <option value="variable spending">2 - Variable Spending</option>
                  <option value="savings">3 - Savings</option>
                  <option value="investing">4 - Investing</option>
                </select>
                <div className="flex gap-2">
                  <button onClick={upsert} className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm transition-colors">{editId ? 'Save Changes' : 'Add'}</button>
                  {editId && (
                    <button onClick={cancelBudgetEdit} className="rounded-lg bg-slate-600 hover:bg-slate-500 px-3 py-2 text-sm transition-colors">Cancel</button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={undoBudget} disabled={!budgetHistory.length} className={`rounded-lg px-3 py-1.5 ${budgetHistory.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Undo</button>
                <button onClick={redoBudget} disabled={!budgetRedo.length} className={`rounded-lg px-3 py-1.5 ${budgetRedo.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Redo</button>
                <button onClick={() => { if (!categories.length) return; pushBudgetHistory(); setCategories([]); showUndoableToast('Budget reset', undoBudget) }} className="rounded-lg px-3 py-1.5 bg-slate-700 hover:bg-slate-600">Reset Budget</button>
                <button onClick={generateSampleCategory} className="rounded-lg px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors" title="Instantly add a sample budget category">Generate Sample</button>
              </div>
              {budgetFormHint && <p className="mt-2 text-sm text-amber-300">{budgetFormHint}</p>}
              <div className="mt-3 grid md:grid-cols-3 gap-2">
                <input className="p-2 rounded-lg bg-slate-800 border border-slate-600" placeholder="Budget name" value={budgetTitle} onChange={e => setBudgetTitle(e.target.value)} />
                <button className="rounded-lg bg-blue-600" onClick={() => { const n = budgetTitle.trim(); if (!n) return; const ex = savedBudgets.find(x => x.name.toLowerCase() === n.toLowerCase()); if (ex && !window.confirm('Overwrite existing budget?')) return; setSavedBudgets([{ name: n, categories, savedAt: new Date().toISOString() }, ...savedBudgets.filter(x => x.name.toLowerCase() !== n.toLowerCase())]); if (ex) setChangeSummary([`Monthly expenses change: ${currency(monthlyBudget - (ex.categories.reduce((s, c) => s + c.amount, 0)))}`]) }}>Save Budget</button>
                <div className="text-xs text-slate-400 self-center">Saved locally</div>
              </div>
              {changeSummary.length > 0 && <div className="mt-2 text-sm rounded border border-slate-700 p-2">What Changed: {changeSummary.join(' • ')}</div>}
              <div className="mt-2 space-y-2">
                {savedBudgets.map((b, idx) => (
                  <div key={b.name} className="rounded border border-slate-700 p-2 flex justify-between items-center gap-2">
                    {editingBudgetIdx === idx ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          ref={renameBudgetInputRef}
                          className="flex-1 min-w-0 px-2 py-1 text-sm rounded bg-slate-800 border border-blue-500 focus:outline-none text-slate-100"
                          value={renameBudgetValue}
                          onChange={e => setRenameBudgetValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const nn = renameBudgetValue.trim()
                              if (nn && nn !== b.name) setSavedBudgets(prev => prev.map((x, i) => i === idx ? { ...x, name: nn } : x))
                              setEditingBudgetIdx(null)
                            }
                            if (e.key === 'Escape') { e.preventDefault(); setEditingBudgetIdx(null) }
                          }}
                          onBlur={() => {
                            const nn = renameBudgetValue.trim()
                            if (nn && nn !== b.name) setSavedBudgets(prev => prev.map((x, i) => i === idx ? { ...x, name: nn } : x))
                            setEditingBudgetIdx(null)
                          }}
                        />
                        <button className="text-slate-400 hover:text-slate-200 text-xs whitespace-nowrap" onClick={() => setEditingBudgetIdx(null)}>Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0">
                          <div className="truncate">{b.name}</div>
                          <div className="text-xs text-slate-400">{new Date(b.savedAt).toLocaleString()}</div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            className="text-blue-300 hover:text-blue-200 text-xs"
                            onClick={() => {
                              if (window.confirm(`Apply "${b.name}" as your budget? This replaces your current categories.`)) {
                                pushBudgetHistory()
                                setCategories(b.categories)
                                showToast(`Applied template "${b.name}".`)
                              }
                            }}
                          >Apply</button>
                          <button className="text-amber-300 hover:text-amber-200 text-xs" onClick={() => {
                            setEditingBudgetIdx(idx)
                            setRenameBudgetValue(b.name)
                            setTimeout(() => { renameBudgetInputRef.current?.focus(); renameBudgetInputRef.current?.select() }, 0)
                          }}>Rename</button>
                          <button className="text-red-300 hover:text-red-200 text-xs" onClick={() => { setSavedBudgets(prev => prev.filter(x => x.name !== b.name)); showToast(`Deleted saved budget "${b.name}".`) }}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
              <table className="w-full text-sm mt-3 min-w-[480px]">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-1.5 pr-2">Name</th>
                    <th className="pb-1.5 pr-2">Type</th>
                    {period === 'weekly'    && <th className="pb-1.5 pr-2">Weekly Planned</th>}
                    {period === 'bi-weekly' && <th className="pb-1.5 pr-2">Bi-weekly Planned</th>}
                    {period === 'monthly'   && <th className="pb-1.5 pr-2">Planned</th>}
                    {period === 'yearly'    && <th className="pb-1.5 pr-2">Yearly Planned</th>}
                    {(period === 'weekly' || period === 'bi-weekly') && <th className="pb-1.5 pr-2">Monthly</th>}
                    {period === 'yearly'    && <th className="pb-1.5 pr-2">Monthly</th>}
                    <th className="pb-1.5 pr-2">
                      <span className="inline-flex items-center gap-2">
                        <span>
                          {period === 'weekly'    && 'Weekly Actual'}
                          {period === 'bi-weekly' && 'Bi-weekly Actual'}
                          {period === 'monthly'   && 'Actual'}
                          {period === 'yearly'    && 'Yearly Actual'}
                        </span>
                        {hasAnyActual && (
                          <button
                            className="rounded px-1.5 py-0.5 text-[10px] bg-slate-700 hover:bg-slate-600 text-slate-300 font-normal normal-case tracking-normal transition-colors"
                            onClick={() => {
                              pushActualsHistory({ ...actuals })
                              setActuals({})
                              setPressureFocusCategoryId(null)
                            }}
                          >
                            Clear All
                          </button>
                        )}
                      </span>
                    </th>
                    <th className="pb-1.5 pr-2">Variance</th>
                    <th className="pb-1.5 pr-2 hidden md:table-cell">Status</th>
                    <th className="pb-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {top.filter(c => {
                    if (budgetFilter === 'over-budget') {
                      const e = effectiveCatActual(c.id)
                      return e !== null && e.total > convertFromMonthly(c.amount, period)
                    }
                    if (budgetFilter === 'no-activity') return effectiveCatActual(c.id) === null
                    return true
                  }).map(c => {
                    const planned     = convertFromMonthly(c.amount, period)
                    const eff         = effectiveCatActual(c.id)
                    const rawActual   = actuals[c.id]
                    const hasTxn      = (txnActuals[c.id] ?? 0) > 0
                    const txnAmt      = txnActuals[c.id] ?? 0
                    const hasManual   = rawActual !== '' && rawActual !== undefined
                    const hasActual   = eff !== null
                    const actualVal   = eff !== null ? eff.total : null
                    const variance    = actualVal !== null ? actualVal - planned : null
                    const vTone       = variance !== null ? varianceTone(variance, period) : 'neutral'
                    const varClass    =
                      variance === null ? 'text-slate-500' :
                      vTone === 'good' ? 'text-green-400' :
                      vTone === 'neutral' ? 'text-slate-300' :
                      vTone === 'warn' ? 'text-yellow-300' : 'text-red-400'
                    const isPressure  = pressureFocusCategoryId === c.id
                    const isInlineCatEdit = inlineCatEditId === c.id

                    // ── Inline edit row ──────────────────────────────────────
                    if (isInlineCatEdit) {
                      // colSpan math: Name + Type + planned + [monthly ref?] + Actual + Variance + Actions
                      // We show inputs spanning all columns. Blur-save fires when focus leaves the row.
                      const extraCols = (period === 'weekly' || period === 'bi-weekly' || period === 'yearly') ? 1 : 0
                      return (
                        <tr
                          key={c.id}
                          ref={el => { inlineCatRowRef.current = el }}
                          className="border-b border-slate-700 bg-blue-950/20"
                          onBlur={e => {
                            // Save only if focus left the row entirely
                            if (!inlineCatRowRef.current?.contains(e.relatedTarget as Node)) {
                              saveInlineCatEdit()
                            }
                          }}
                        >
                          {/* Name */}
                          <td className="py-1 pr-1.5">
                            <input
                              ref={inlineCatNameRef}
                              className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                              value={inlineCatEditForm.name}
                              onChange={e => setInlineCatEditForm(v => ({ ...v, name: e.target.value }))}
                              onKeyDown={e => {
                                if (e.key === 'ArrowRight') { e.preventDefault(); inlineCatTypeRef.current?.focus() }
                                if (e.key === 'Enter') { e.preventDefault(); inlineCatTypeRef.current?.focus() }
                                if (e.key === 'Escape') { e.preventDefault(); cancelInlineCatEdit() }
                              }}
                            />
                          </td>
                          {/* Type */}
                          <td className="py-1 pr-1.5">
                            <select
                              ref={inlineCatTypeRef}
                              className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                              value={inlineCatEditForm.type}
                              onChange={e => setInlineCatEditForm(v => ({ ...v, type: e.target.value as CategoryType }))}
                              onKeyDown={e => {
                                if (e.key === 'ArrowLeft')  { e.preventDefault(); inlineCatNameRef.current?.focus() }
                                if (e.key === 'ArrowRight') { e.preventDefault(); inlineCatAmountRef.current?.focus() }
                                if (e.key === 'Enter') { e.preventDefault(); inlineCatAmountRef.current?.focus() }
                                if (e.key === 'Escape') { e.preventDefault(); cancelInlineCatEdit() }
                              }}
                            >
                              <option value="fixed bill">Fixed</option>
                              <option value="variable spending">Variable</option>
                              <option value="savings">Savings</option>
                              <option value="investing">Investing</option>
                            </select>
                          </td>
                          {/* Planned amount — spans period planned + monthly ref columns */}
                          <td className="py-1 pr-1.5" colSpan={1 + extraCols}>
                            <input
                              ref={inlineCatAmountRef}
                              type="number"
                              min={0}
                              step={25}
                              className="w-24 px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none text-right"
                              value={inlineCatEditForm.amount}
                              onChange={e => setInlineCatEditForm(v => ({ ...v, amount: e.target.value }))}
                              onFocus={e => e.target.select()}
                              onKeyDown={e => {
                                if (e.key === 'ArrowLeft')  { e.preventDefault(); inlineCatTypeRef.current?.focus() }
                                if (e.key === 'ArrowRight') { e.preventDefault(); inlineCatActualRef.current?.focus() }
                                if (e.key === 'Enter') { e.preventDefault(); inlineCatActualRef.current?.focus() }
                                if (e.key === 'Escape') { e.preventDefault(); cancelInlineCatEdit() }
                              }}
                            />
                            <span className="ml-1 text-[10px] text-slate-500">{labelPeriod(period)}</span>
                          </td>
                          {/* Actual adjustment */}
                          <td className="py-1 pr-1.5">
                            <div className="flex items-center gap-1">
                              <input
                                ref={inlineCatActualRef}
                                type="number"
                                min={0}
                                step={25}
                                className="w-20 px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none text-right"
                                placeholder="—"
                                value={inlineCatEditForm.actual}
                                onChange={e => setInlineCatEditForm(v => ({ ...v, actual: e.target.value }))}
                                onFocus={e => e.target.select()}
                                onKeyDown={e => {
                                  if (e.key === 'ArrowLeft')  { e.preventDefault(); inlineCatAmountRef.current?.focus() }
                                  if (e.key === 'ArrowRight') { e.preventDefault(); inlineCatSaveRef.current?.focus() }
                                  if (e.key === 'Enter') { e.preventDefault(); saveInlineCatEdit() }
                                  if (e.key === 'Escape') { e.preventDefault(); cancelInlineCatEdit() }
                                }}
                              />
                              {hasTxn && <span className="text-[9px] text-slate-500">adj</span>}
                            </div>
                          </td>
                          {/* Variance — empty during edit */}
                          <td className="py-1 pr-1.5" />
                          {/* Save / Cancel */}
                          <td className="py-1 whitespace-nowrap space-x-2">
                            <button
                              ref={inlineCatSaveRef}
                              className="text-blue-400 hover:text-blue-300 text-xs"
                              onClick={saveInlineCatEdit}
                              onKeyDown={e => { if (e.key === 'Escape') cancelInlineCatEdit() }}
                            >Save</button>
                            <button className="text-slate-400 hover:text-slate-300 text-xs" onClick={cancelInlineCatEdit}>Cancel</button>
                          </td>
                        </tr>
                      )
                    }

                    // ── Normal display row ────────────────────────────────────
                    const isBillsToMom = c.id === 'cat-bills-mom' || c.name.toLowerCase() === 'bills to mom'
                    const normalRow = (
                      <tr
                        key={c.id}
                        className={`border-b border-slate-800 transition-colors duration-300 ${
                          highlightedCategoryId === c.id
                            ? 'bg-blue-600/20'
                            : isPressure
                              ? 'bg-amber-500/15'
                              : ''
                        }`}
                      >
                        <td className="py-1.5 pr-2">{isBillsToMom ? (
                          <button type="button" onClick={() => setBillsToMomBudgetOpen(v => !v)} className="inline-flex items-center gap-1 text-left hover:text-blue-300" title="Show Bills to Mom breakdown">
                            <span>{billsToMomBudgetOpen ? '▾' : '▸'}</span><span>{c.name}</span>
                          </button>
                        ) : c.name}</td>
                        <td className="py-1.5 pr-2 text-slate-400 text-xs">
                          {c.type === 'fixed bill' ? 'Fixed' : c.type === 'variable spending' ? 'Variable' : c.type === 'savings' ? 'Savings' : 'Investing'}
                        </td>
                        {period === 'weekly'    && <td className="py-1.5 pr-2">{currency(convertFromMonthly(c.amount, 'weekly'))}</td>}
                        {period === 'bi-weekly' && <td className="py-1.5 pr-2">{currency(convertFromMonthly(c.amount, 'bi-weekly'))}</td>}
                        {period === 'monthly'   && <td className="py-1.5 pr-2">{currency(c.amount)}</td>}
                        {period === 'yearly'    && <td className="py-1.5 pr-2">{currency(convertFromMonthly(c.amount, 'yearly'))}</td>}
                        {(period === 'weekly' || period === 'bi-weekly') && <td className="py-1.5 pr-2 text-slate-400">{currency(c.amount)}</td>}
                        {period === 'yearly' && <td className="py-1.5 pr-2 text-slate-400">{currency(c.amount)}</td>}
                        {/* Actual cell: txn-driven breakdown or plain manual entry */}
                        <td className="py-1 pr-2">
                          {hasTxn ? (
                            <div className="space-y-0.5 text-xs min-w-[8rem]">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-500">Transactions</span>
                                <span className="font-medium text-slate-300">{currency(txnAmt)}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-600 shrink-0">+ Adj</span>
                                <input
                                  ref={el => { actualInputRefs.current[c.id] = el }}
                                  type="number" inputMode="decimal" min={0} step={25}
                                  className="w-16 px-1 py-0.5 rounded bg-slate-700 border border-slate-600 text-slate-100 text-xs focus:border-blue-500 focus:outline-none"
                                  placeholder="0"
                                  value={rawActual ?? ''}
                                  onFocus={e => { if (e.target.value !== '') e.target.select() }}
                                  onChange={e => {
                                    const cleaned = e.target.value.replace(/[^0-9.]/g, '')
                                    setActuals(prev => ({ ...prev, [c.id]: cleaned === '' || Number(cleaned) === 0 ? '' : cleaned }))
                                  }}
                                  onBlur={() => { pushActualsHistory({ ...actuals }) }}
                                  onKeyDown={e => {
                                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                      e.preventDefault()
                                      const cur = Number(rawActual) || 0
                                      const next = e.key === 'ArrowUp' ? cur + 25 : Math.max(0, cur - 25)
                                      setActuals(prev => ({ ...prev, [c.id]: next === 0 ? '' : String(next) }))
                                    }
                                  }}
                                />
                                {hasManual && (
                                  <button
                                    className="rounded px-1 py-0.5 text-slate-400 hover:text-slate-200 bg-slate-700 hover:bg-slate-600 transition-colors text-xs"
                                    title="Clear adjustment"
                                    onClick={() => { pushActualsHistory({ ...actuals }); setActuals(prev => ({ ...prev, [c.id]: '' })) }}
                                  >×</button>
                                )}
                              </div>
                              {eff && (
                                <div className="flex items-center justify-between gap-2 border-t border-slate-700/60 pt-0.5 mt-0.5">
                                  <span className="text-slate-500">Total Actual</span>
                                  <span className="font-semibold text-slate-200">{currency(eff.total)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <input
                                ref={el => { actualInputRefs.current[c.id] = el }}
                                type="number" inputMode="decimal" min={0} step={25}
                                className="w-24 p-1 rounded bg-slate-700 border border-slate-600 text-slate-100 text-sm focus:border-blue-500 focus:outline-none"
                                placeholder="—"
                                value={rawActual ?? ''}
                                onFocus={e => { if (e.target.value !== '') e.target.select() }}
                                onChange={e => {
                                  const cleaned = e.target.value.replace(/[^0-9.]/g, '')
                                  setActuals(prev => ({ ...prev, [c.id]: cleaned === '' || Number(cleaned) === 0 ? '' : cleaned }))
                                }}
                                onBlur={() => { pushActualsHistory({ ...actuals }) }}
                                onKeyDown={e => {
                                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                    e.preventDefault()
                                    const cur = Number(rawActual) || 0
                                    const next = e.key === 'ArrowUp' ? cur + 25 : Math.max(0, cur - 25)
                                    setActuals(prev => ({ ...prev, [c.id]: next === 0 ? '' : String(next) }))
                                  }
                                }}
                              />
                              {hasActual && (
                                <button
                                  className="rounded px-1.5 py-0.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-700 hover:bg-slate-600 transition-colors"
                                  title="Clear actual"
                                  onClick={() => { pushActualsHistory({ ...actuals }); setActuals(prev => ({ ...prev, [c.id]: '' })) }}
                                >×</button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className={`py-1.5 pr-2 font-medium ${varClass}`}>
                          {variance === null
                            ? '—'
                            : Math.abs(variance) < 0.005
                              ? 'On plan'
                              : variance < 0
                                ? `Under by ${currency(Math.abs(variance))}`
                                : `Over by ${currency(variance)}`}
                        </td>
                        {/* V9.11 — Status badge */}
                        <td className="py-1.5 pr-2 hidden md:table-cell">
                          {(() => {
                            const st  = catStatus(effectiveCatActual(c.id)?.total ?? null, planned)
                            const cls = st === 'Over Budget'  ? 'text-red-400 bg-red-900/30 border-red-700/30'
                              : st === 'Near Limit'   ? 'text-amber-300 bg-amber-900/30 border-amber-700/30'
                              : st === 'On Track'     ? 'text-green-400 bg-green-900/30 border-green-700/30'
                              : st === 'Under Budget' ? 'text-blue-300 bg-blue-900/20 border-blue-700/20'
                              : 'text-slate-600 bg-slate-800/40 border-slate-700/20'
                            return <span className={`text-[9px] border px-1.5 py-0.5 rounded font-medium ${cls}`}>{st}</span>
                          })()}
                        </td>
                        <td className="py-1.5 space-x-2 whitespace-nowrap">
                          <button className="text-blue-300 hover:text-blue-200" onClick={() => {
                            setInlineCatEditId(c.id)
                            setInlineCatEditForm({
                              name: c.name,
                              type: c.type,
                              amount: String(convertFromMonthly(c.amount, period)),
                              actual: actuals[c.id] ?? '',
                              actualAtStart: actuals[c.id] ?? '',
                            })
                            setTimeout(() => { inlineCatAmountRef.current?.focus(); inlineCatAmountRef.current?.select() }, 0)
                          }}>Edit</button>
                          <button className="text-red-300 hover:text-red-200" onClick={() => { pushBudgetHistory(); addPendingDelete('categories', c.id); setCategories(prev => prev.filter(x => x.id !== c.id)) }}>Delete</button>
                          {/* V33 — Breakdown group */}
                          <button
                            onClick={() => setBreakdownEditId(c.id)}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${ breakdowns[c.id]?.length ? 'text-violet-300 bg-violet-900/20 border-violet-700/30' : 'text-slate-600 border-slate-700/30 hover:text-slate-400'}`}
                            title={breakdowns[c.id]?.length ? `Edit ${breakdowns[c.id].length} breakdown items` : 'Add breakdown'}
                          >{breakdowns[c.id]?.length ? `${breakdowns[c.id].length} items` : '+ Group'}</button>
                          {/* V9.11 — Rollover toggle */}
                          <button
                            title={categoryRollovers[c.id]
                              ? `Rollover ON — if you underspend, the difference carries forward. Example: budget $400, spend $300 → next month gets $500. Click to disable.`
                              : `Rollover OFF — enable for lumpy expenses (car repairs, haircuts, clothing). Underspend this month = bigger budget next month. Click to enable.`}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${categoryRollovers[c.id] ? 'text-teal-300 bg-teal-900/30 border-teal-700/30' : 'text-slate-600 border-slate-700/30 hover:text-slate-400'}`}
                            onClick={() => setCategoryRollovers(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                          >{categoryRollovers[c.id] ? 'Rollover ✓' : 'Rollover'}</button>
                          {/* V19 — Show rollover amount when applicable */}
                          {categoryRollovers[c.id] && rolloverByCatId[c.id] > 0 && (
                            <span className="text-[10px] text-teal-400 ml-1" title={`+${currency(rolloverByCatId[c.id])}/mo underspend rolled over from last month`}>
                              +{currency(convertFromMonthly(rolloverByCatId[c.id], period))} rolled
                            </span>
                          )}
                        </td>
                      </tr>
                    )

                    if (!isBillsToMom) return normalRow

                    return (
                      <>
                        {normalRow}
                        {/* V33 — Generalized breakdown: show for Bills to Mom (legacy) OR any category with breakdown data */}
                        {(billsToMomBudgetOpen && breakdowns[c.id]?.length > 0) && (
                          <tr className="border-b border-slate-800 bg-slate-900/40">
                            <td colSpan={8} className="py-2 pl-6 pr-2">
                              <div className="rounded-xl border border-violet-700/30 bg-violet-950/10 p-3">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-xs font-semibold text-slate-200">{c.name} breakdown</div>
                                  <div className="flex items-center gap-2">
                                    <div className="text-[11px] text-slate-400">
                                      Total: {currency(breakdowns[c.id].reduce((s, i) => s + i.amount, 0))}/mo
                                    </div>
                                    <button onClick={() => setBreakdownEditId(c.id)} className="text-[10px] text-violet-400 hover:text-violet-300 px-1.5 py-0.5 rounded border border-violet-700/30 transition-colors">Edit</button>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                                  {breakdowns[c.id].map(item => (
                                    <div key={item.id} className="rounded-lg border border-slate-700 bg-slate-800/70 p-2">
                                      <div className="text-[11px] text-slate-400">{item.label}</div>
                                      <div className="text-sm font-semibold text-slate-100">{currency(item.amount)}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </Card></div>

            {/* V19 — Budget History */}
            {historyPeriodKeys.length > 0 && (
              <div className="rounded-2xl border border-slate-700 bg-slate-800/60">
                <button
                  onClick={() => setHistoryMonth(prev => prev ? null : historyPeriodKeys[0])}
                  className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-700/20 transition-colors rounded-2xl"
                >
                  <h2 className="text-lg font-semibold text-slate-100">Budget History</h2>
                  <span className="text-slate-500 text-sm">{historyMonth ? '▲' : `▼ ${historyPeriodKeys.length} month${historyPeriodKeys.length === 1 ? '' : 's'} available`}</span>
                </button>
                {historyMonth !== null && (
                  <div className="px-5 pb-5">
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                      <label className="text-xs text-slate-400">Viewing:</label>
                      <select
                        value={historyMonth}
                        onChange={e => setHistoryMonth(e.target.value)}
                        className="px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                      >
                        {historyPeriodKeys.map(key => (
                          <option key={key} value={key}>
                            {key === 'legacy' ? 'Previous data' : (() => {
                              const [y, m] = key.split('-')
                              return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                            })()}
                          </option>
                        ))}
                      </select>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-slate-700">
                          <th className="text-left py-1.5 pr-3">Category</th>
                          <th className="text-right py-1.5 pr-3">Plan / mo</th>
                          <th className="text-right py-1.5 pr-3">Actual</th>
                          <th className="text-right py-1.5">Variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {categories.map(cat => {
                          const hist = parseFloat(allActualsByPeriod[historyMonth!]?.[cat.id] ?? '0')
                          const diff = hist - cat.amount
                          return (
                            <tr key={cat.id} className="border-b border-slate-700/40">
                              <td className="py-1.5 pr-3 text-slate-300">{cat.name}</td>
                              <td className="py-1.5 pr-3 text-right text-slate-400">{currency(cat.amount)}</td>
                              <td className="py-1.5 pr-3 text-right text-slate-200">{hist > 0 ? currency(hist) : '—'}</td>
                              <td className={`py-1.5 text-right font-medium ${diff > 0 ? 'text-red-400' : diff < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                                {hist > 0 ? (diff > 0 ? `+${currency(diff)}` : `-${currency(Math.abs(diff))}`) : '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ── ACCOUNTS ── */}
        {tab === 'Accounts' && (
          <section className="space-y-4 transition-all duration-300">
            <Card title="Add Account" noHover>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                {/* Account Name */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Account Name</label>
                  <input
                    ref={accountNameRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. Chase Checking"
                    value={accountForm.name}
                    onChange={e => setAccountForm(v => ({ ...v, name: e.target.value }))}
                    onFocus={e => e.target.select()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); if (!e.shiftKey) accountTypeRef.current?.focus() }
                    }}
                  />
                </div>
                {/* Account Type */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Account Type</label>
                  <select
                    ref={accountTypeRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={accountForm.type}
                    onChange={e => setAccountForm(v => ({ ...v, type: e.target.value as AccountType }))}
                    onKeyDown={e => {
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault()
                        const idx = ACCOUNT_TYPES.indexOf(accountForm.type)
                        const next = e.key === 'ArrowUp'
                          ? ACCOUNT_TYPES[Math.max(0, idx - 1)]
                          : ACCOUNT_TYPES[Math.min(ACCOUNT_TYPES.length - 1, idx + 1)]
                        setAccountForm(v => ({ ...v, type: next }))
                      }
                      if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) accountNameRef.current?.focus(); else accountBalanceRef.current?.focus() }
                    }}
                  >
                    {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                {/* Current Balance */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Current Balance</label>
                  <input
                    ref={accountBalanceRef}
                    type="text"
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="0.00"
                    value={accountForm.balance}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^0-9.]/g, '')
                      const parts = raw.split('.')
                      setAccountForm(v => ({ ...v, balance: parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : raw }))
                    }}
                    onFocus={e => e.target.select()}
                    onBlur={e => {
                      const num = parseFloat(e.target.value)
                      if (!isNaN(num) && num > 0) setAccountForm(v => ({ ...v, balance: num.toFixed(2) }))
                      else if (e.target.value !== '') setAccountForm(v => ({ ...v, balance: '' }))
                    }}
                    onKeyDown={e => {
                      if (['e', 'E', '+', '-'].includes(e.key)) { e.preventDefault(); return }
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault()
                        const cur = parseFloat(accountForm.balance) || 0
                        const next = e.key === 'ArrowUp' ? cur + 25 : Math.max(0, cur - 25)
                        setAccountForm(v => ({ ...v, balance: next === 0 ? '' : String(next) }))
                      }
                      if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) accountTypeRef.current?.focus(); else accountInstRef.current?.focus() }
                    }}
                  />
                </div>
                {/* Institution */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Institution <span className="text-slate-600">(optional)</span></label>
                  <input
                    ref={accountInstRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. Chase Bank"
                    value={accountForm.institution}
                    onChange={e => setAccountForm(v => ({ ...v, institution: e.target.value }))}
                    onFocus={e => e.target.select()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) accountBalanceRef.current?.focus(); else createOrSaveAccount() }
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={createOrSaveAccount} className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-1.5 text-sm transition-colors">
                  Add Account
                </button>
                <button onClick={clearAccountForm} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-1.5 text-sm transition-colors">Clear</button>
                <button onClick={undoAccount} disabled={!accountHistory.length} className={`rounded-lg px-3 py-1.5 text-sm ${accountHistory.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Undo</button>
                <button onClick={redoAccount} disabled={!accountRedo.length} className={`rounded-lg px-3 py-1.5 text-sm ${accountRedo.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Redo</button>
                {accounts.length > 0 && (
                  <button onClick={() => { if (!accounts.length) return; setAccountsWithHistory(() => []); showUndoableToast(`${accounts.length} account${accounts.length !== 1 ? 's' : ''} cleared`, undoAccount) }} className="rounded-lg px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors">Clear All</button>
                )}
                <button onClick={generateSampleAccount} className="rounded-lg px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors" title="Instantly add a sample account">Generate Sample</button>
              </div>
              {accountHint && <p className="mt-2 text-sm text-amber-300">{accountHint}</p>}
            </Card>

            {accounts.length > 0 ? (
              <Card title="Your Accounts">
                {/* V9.3 — Summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-lg bg-slate-800 border border-slate-700/60 px-3 py-2.5">
                    <div className="text-xs text-slate-400 mb-0.5">Cash &amp; Bank</div>
                    <div className={`text-lg font-bold ${netWorthSummary.totalCash >= 0 ? 'text-green-400' : 'text-red-400'}`}>{currency(netWorthSummary.totalCash)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-800 border border-slate-700/60 px-3 py-2.5">
                    <div className="text-xs text-slate-400 mb-0.5">Investments</div>
                    <div className="text-lg font-bold text-blue-300">{currency(netWorthSummary.totalInvestments)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-800 border border-slate-700/60 px-3 py-2.5">
                    <div className="text-xs text-slate-400 mb-0.5">Total Debt</div>
                    <div className="text-lg font-bold text-red-400">{currency(netWorthSummary.totalDebt)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-800 border border-slate-700/60 px-3 py-2.5">
                    <div className="text-xs text-slate-400 mb-0.5">Net Worth</div>
                    <div className={`text-lg font-bold ${netWorthSummary.netWorth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{currency(netWorthSummary.netWorth)}</div>
                  </div>
                </div>
                {/* V9.3.4 — Balance check notice */}
                {needsReviewCount > 0 && (
                  <div className="mb-3 flex items-center gap-2 text-xs text-amber-300">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                    {needsReviewCount} account{needsReviewCount !== 1 ? 's have' : ' has'} unexplained activity — tracked transactions don&apos;t fully account for the current balance.
                  </div>
                )}
                {/* V9.3.4 — Balance check helper text */}
                <p className="text-xs text-slate-500 mb-3">
                  <span className="text-slate-400 font-medium">Current Balance</span> = what you entered or restored for this account.{' '}
                  <span className="text-slate-400 font-medium">Imported Activity</span> = net effect of logged transactions for review only.{' '}
                  <span className="text-slate-400 font-medium">Unexplained</span> only appears after you reconcile an account; partial imports are not treated as errors.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-1.5 pr-4 font-medium">Name</th>
                        <th className="pb-1.5 pr-4 font-medium">Type</th>
                        <th className="pb-1.5 pr-4 font-medium text-right">Current Balance</th>
                        <th className="pb-1.5 pr-4 font-medium text-right">Imported Activity</th>
                        <th className="pb-1.5 pr-4 font-medium">Unexplained</th>
                        <th className="pb-1.5 pr-4 font-medium">Institution</th>
                        <th className="pb-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map(a => {
                        const isEdit = inlineAccountEditId === a.id
                        return (
                          <tr
                            key={a.id}
                            ref={isEdit ? el => { inlineAccountRowRef.current = el } : undefined}
                            className={`border-b border-slate-800 transition-colors duration-300 ${
                              highlightedAccountId === a.id ? 'bg-blue-600/20' : isEdit ? 'bg-slate-700/30' : 'hover:bg-slate-800/40'
                            }`}
                            onBlur={isEdit ? e => {
                              // Only blur-save when focus leaves the entire row (not between fields)
                              if (!inlineAccountRowRef.current?.contains(e.relatedTarget as Node)) {
                                saveInlineAccountEdit(a.id)
                              }
                            } : undefined}
                          >
                            {/* Name */}
                            <td className="py-2 pr-4 font-medium">
                              {isEdit ? (
                                <input
                                  ref={inlineAccountNameRef}
                                  className="w-full px-1.5 py-0.5 text-sm rounded bg-slate-800 border border-slate-500 focus:border-blue-500 focus:outline-none"
                                  value={inlineAccountEditForm.name}
                                  onChange={e => setInlineAccountEditForm(v => ({ ...v, name: e.target.value }))}
                                  onFocus={e => e.target.select()}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); saveInlineAccountEdit(a.id) }
                                    if (e.key === 'Escape') { e.preventDefault(); cancelInlineAccountEdit() }
                                    if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) { e.preventDefault(); inlineAccountBalanceRef.current?.focus() }
                                  }}
                                />
                              ) : a.name}
                            </td>
                            {/* Type */}
                            <td className="py-2 pr-4 text-slate-400 text-sm">
                              {isEdit ? (
                                <select
                                  className="rounded bg-slate-800 border border-slate-500 text-xs px-1 py-0.5 focus:border-blue-500 focus:outline-none"
                                  value={inlineAccountEditForm.type}
                                  onChange={e => setInlineAccountEditForm(v => ({ ...v, type: e.target.value as AccountType }))}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); saveInlineAccountEdit(a.id) }
                                    if (e.key === 'Escape') { e.preventDefault(); cancelInlineAccountEdit() }
                                  }}
                                >
                                  {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
                                </select>
                              ) : ACCOUNT_TYPE_LABELS[a.type]}
                            </td>
                            {/* Current Balance */}
                            <td className={`py-2 pr-4 text-right font-semibold ${isEdit ? '' : a.type === 'credit card' ? (a.balance === 0 ? 'text-green-400' : 'text-red-400') : a.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {isEdit ? (
                                <input
                                  ref={inlineAccountBalanceRef}
                                  type="text" inputMode="decimal"
                                  className="w-24 px-1.5 py-0.5 text-sm text-right rounded bg-slate-800 border border-slate-500 focus:border-blue-500 focus:outline-none"
                                  value={inlineAccountEditForm.balance}
                                  onChange={e => { const raw = e.target.value.replace(/[^0-9.]/g, ''); setInlineAccountEditForm(v => ({ ...v, balance: raw })) }}
                                  onFocus={e => e.target.select()}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); saveInlineAccountEdit(a.id) }
                                    if (e.key === 'Escape') { e.preventDefault(); cancelInlineAccountEdit() }
                                    if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) { e.preventDefault(); inlineAccountNameRef.current?.focus() }
                                  }}
                                />
                              ) : a.type === 'credit card'
                                  ? (a.balance === 0 ? 'Paid Off' : `${currency(Math.abs(a.balance))} owed`)
                                  : a.balance < 0 ? `\u2212${currency(Math.abs(a.balance))}` : currency(a.balance)
                              }
                            </td>
                            {/* Tracked Activity */}
                            <td className="py-2 pr-4 text-right text-slate-400 text-xs">
                              {(() => {
                                const bc = balanceCheckData[a.id]
                                if (!bc || Math.abs(bc.trackedActivity) < 0.005) return <span className="text-slate-600">—</span>
                                if (a.type === 'credit card') {
                                  return bc.trackedActivity >= 0
                                    ? `${currency(bc.trackedActivity)} charged`
                                    : `${currency(Math.abs(bc.trackedActivity))} net paid`
                                }
                                return bc.trackedActivity >= 0
                                  ? `+${currency(bc.trackedActivity)}`
                                  : `\u2212${currency(Math.abs(bc.trackedActivity))}`
                              })()}
                            </td>
                            {/* Unexplained gap */}
                            <td className="py-2 pr-4 text-xs">
                              {(() => {
                                const bc = balanceCheckData[a.id]
                                if (!bc) return null
                                if (!bc.hasReconciliationBaseline) {
                                  return (
                                    <span className="text-slate-600 text-[10px] leading-snug">
                                      Not reconciled yet<br />
                                      <span className="text-slate-700">Current balance is still trusted.</span>
                                    </span>
                                  )
                                }
                                if (bc.isMatched) return <span className="text-green-400 font-medium">Looks matched.</span>
                                const amt = Math.abs(bc.unexplained)
                                const cls = `font-medium ${amt > 100 ? 'text-red-400' : 'text-amber-300'}`
                                return bc.unexplained > 0
                                  ? <span className={cls}>{currency(amt)} is not explained yet.</span>
                                  : <span className={cls}>Imported activity is {currency(amt)} higher than current balance.</span>
                              })()}
                            </td>
                            {/* Institution */}
                            <td className="py-2 pr-4 text-slate-400 text-xs">
                              {isEdit ? (
                                <input
                                  className="w-full px-1.5 py-0.5 text-xs rounded bg-slate-800 border border-slate-500 focus:border-blue-500 focus:outline-none"
                                  value={inlineAccountEditForm.institution}
                                  placeholder="Institution"
                                  onChange={e => setInlineAccountEditForm(v => ({ ...v, institution: e.target.value }))}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); saveInlineAccountEdit(a.id) }
                                    if (e.key === 'Escape') { e.preventDefault(); cancelInlineAccountEdit() }
                                  }}
                                />
                              ) : (a.institution || '—')}
                            </td>
                            {/* Actions */}
                            <td className="py-2 whitespace-nowrap space-x-2">
                              {isEdit ? (
                                <>
                                  <button className="text-green-400 hover:text-green-300 text-xs" onMouseDown={e => { e.preventDefault(); saveInlineAccountEdit(a.id) }}>Save</button>
                                  <button className="text-slate-400 hover:text-slate-200 text-xs" onMouseDown={e => { e.preventDefault(); cancelInlineAccountEdit() }}>Cancel</button>
                                </>
                              ) : (
                                <>
                                  <button className="text-blue-400 hover:text-blue-300 text-xs" onClick={() => startInlineAccountEdit(a)}>Edit</button>
                                  <button
                                    className="text-blue-400 hover:text-blue-300 text-xs"
                                    title="Set this account’s current balance as the trusted reconciliation baseline"
                                    onClick={() => reconcileAccount(a.id)}
                                  >
                                    Reconcile
                                  </button>
                                  <button className="text-red-400 hover:text-red-300 text-xs" onClick={() => {
                                    addPendingDelete('accounts', a.id)
                                    setAccountsWithHistory(prev => prev.filter(x => x.id !== a.id))
                                    showUndoableToast(`Deleted "${a.name}"`, undoAccount)
                                  }}>Delete</button>
                                </>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-700">
                        <td colSpan={2} className="pt-2 text-xs text-slate-500 font-medium">Net Balance (actual)</td>
                        <td className={`pt-2 text-right text-sm font-bold ${accounts.reduce((s, a) => s + a.balance, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {currency(accounts.reduce((s, a) => s + a.balance, 0))}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            ) : (
              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-6 text-center">
                <p className="text-slate-400 text-sm font-medium">No accounts yet</p>
                <p className="text-slate-500 text-xs mt-1">Add a checking, savings, or investment account above to start tracking your net worth.</p>
              </div>
            )}
          </section>
        )}

        {/* ── TRANSACTIONS ── */}
        {tab === 'Transactions' && (
          <TransactionsTab
            transactions={transactions}
            accounts={accounts}
            categories={categories}
            rules={rules}
            period={period}
            filteredTxns={filteredTxns}
            hasActiveFilters={hasActiveFilters}
            needsReviewTxnCount={needsReviewTxnCount}
            reviewableTxns={reviewableTxns}
            uncategorizedExpenseCount={uncategorizedExpenseCount}
            recurringCandidates={recurringCandidates}
            dismissedDupIds={dismissedDupIds}
            confirmedDupIds={confirmedDupIds}
            highlightedTxnId={highlightedTxnId}
            txnFilter={txnFilter}
            setTxnFilter={setTxnFilter as (value: string) => void}
            txnSearch={txnSearch}
            setTxnSearch={setTxnSearch}
            txnAccountFilter={txnAccountFilter}
            setTxnAccountFilter={setTxnAccountFilter}
            txnCategoryFilter={txnCategoryFilter}
            setTxnCategoryFilter={setTxnCategoryFilter}
            txnListOpen={txnListOpen}
            setTxnListOpen={setTxnListOpen}
            deleteFilteredConfirm={deleteFilteredConfirm}
            setDeleteFilteredConfirm={setDeleteFilteredConfirm}
            inlineTxnEditId={inlineTxnEditId}
            inlineTxnEditForm={inlineTxnEditForm}
            setInlineTxnEditId={setInlineTxnEditId}
            setInlineTxnEditForm={setInlineTxnEditForm}
            inlineTxnMerchantRef={inlineTxnMerchantRef}
            inlineTxnAmountRef={inlineTxnAmountRef}
            inlineTxnTypeRef={inlineTxnTypeRef}
            inlineTxnCategoryRef={inlineTxnCategoryRef}
            inlineTxnRowRef={inlineTxnRowRef}
            inlineEditBlurTimerRef={inlineEditBlurTimerRef}
            txnDupWarning={txnDupWarning}
            setTxnDupWarning={setTxnDupWarning}
            showUncategorizedGlow={showUncategorizedGlow}
            uncategorizedGlowSeenRef={uncategorizedGlowSeenRef}
            setTxnWithHistory={setTxnWithHistory}
            saveInlineTxnEdit={saveInlineTxnEdit}
            cancelInlineTxnEdit={cancelInlineTxnEdit}
            softDeleteTxn={softDeleteTxn}
            showUndoableToast={showUndoableToast}
            undoTxn={undoTxn}
            needsReviewProps={{
              reviewableTxns, transactions, accounts, categories, rules,
              reviewOpen, setReviewOpen,
              selectedTxnIds, setSelectedTxnIds, lastReviewSelectIdxRef,
              confirmedDupIds, setDismissedDupIds, setConfirmedDupIds,
              deleteDupsConfirm, setDeleteDupsConfirm,
              bulkCategoryId, setBulkCategoryId, bulkAssign,
              ruleSuggestion, setRuleSuggestion,
              setTxnWithHistory, setRulesWithHistory, updateCategoryMemory, softDeleteTxn,
              setTxnFilter: setTxnFilter as (v: string) => void, showToast,
              uncatOpen, setUncatOpen, uncategorizedExpenseCount,
              setInlineTxnEditId, setInlineTxnEditForm: setInlineTxnEditForm as (v: { date: string; accountId: string; merchant: string; amount: string; type: string; categoryId: string; notes: string; toAccountId: string }) => void, setTxnDupWarning, inlineTxnAmountRef,
            }}
            recurringSectionProps={{
              recurringCandidates, manualRecurringItems, setManualRecurringItems,
              estimatedMonthlyRecurring,
              recurringOpen, setRecurringOpen,
              confirmedRecurring, setConfirmedRecurring,
              dismissedRecurring, setDismissedRecurring,
              showAddRecurring, setShowAddRecurring,
              recurringForm, setRecurringForm,
            }}
            importHistoryProps={{
              importBatches, transactions, accounts,
              reviewableTxns, deletedTxns,
              csvShowHistory, setCsvShowHistory,
              batchToDelete, setBatchToDelete, deleteImportBatch, setImportBatches,
              showRecentlyDeleted, setShowRecentlyDeleted,
              restoreDeletedTxn, permanentlyDeleteTxn,
            }}
            logTransactionSlot={
            <Card title="Log Transaction" noHover>
             <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                {/* Date — native left/right used by date picker; Enter navigates forward */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Date</label>
                  <input
                    ref={txnDateRef}
                    type="date"
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={txnForm.date}
                    onChange={e => setTxnForm(v => ({ ...v, date: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'ArrowRight') {
                        // Count rightward presses; after 3rd (past year segment) move to Account
                        txnDateArrowCountRef.current += 1
                        if (txnDateArrowCountRef.current > 2) {
                          e.preventDefault()
                          txnDateArrowCountRef.current = 0
                          txnAccountRef.current?.focus()
                        }
                      } else if (e.key === 'ArrowLeft') {
                        txnDateArrowCountRef.current = 0
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        txnDateArrowCountRef.current = 0
                        txnAccountRef.current?.focus()
                      } else {
                        txnDateArrowCountRef.current = 0
                      }
                    }}
                  />
                </div>
                {/* Account */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Account</label>
                  <select
                    ref={txnAccountRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={txnForm.accountId}
                    onChange={e => setTxnForm(v => ({ ...v, accountId: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'ArrowLeft')  { e.preventDefault(); txnDateRef.current?.focus() }
                      if (e.key === 'ArrowRight') { e.preventDefault(); txnMerchantRef.current?.focus(); txnMerchantRef.current?.select() }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (e.shiftKey) { txnDateRef.current?.focus() }
                        else { txnMerchantRef.current?.focus(); txnMerchantRef.current?.select() }
                      }
                    }}
                  >
                    <option value="">Select account…</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                {/* Merchant — boundary-aware arrows so normal cursor movement still works */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Merchant / Description</label>
                  <input
                    ref={txnMerchantRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. Whole Foods"
                    value={txnForm.merchant}
                    onChange={e => setTxnForm(v => ({ ...v, merchant: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
                        e.preventDefault(); txnAccountRef.current?.focus()
                      }
                      if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) {
                        e.preventDefault(); txnAmountRef.current?.focus(); txnAmountRef.current?.select()
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (e.shiftKey) {
                          txnAccountRef.current?.focus()
                        } else if (!txnForm.accountId) {
                          txnAccountRef.current?.focus(); setTimedTxnHint('Choose an account first.')
                        } else if (!txnForm.merchant.trim()) {
                          // stay — still typing
                        } else if (parseFloat(txnForm.amount) > 0) {
                          createOrSaveTxn()
                        } else {
                          txnAmountRef.current?.focus(); txnAmountRef.current?.select()
                        }
                      }
                    }}
                  />
                </div>
                {/* Amount */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Amount</label>
                  <input
                    ref={txnAmountRef}
                    type="text"
                    inputMode="decimal"
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="0.00"
                    value={txnForm.amount}
                    onChange={e => {
                      const raw = e.target.value.replace(/[^0-9.]/g, '')
                      const parts = raw.split('.')
                      setTxnForm(v => ({ ...v, amount: parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : raw }))
                    }}
                    onFocus={e => e.target.select()}
                    onBlur={e => {
                      // Skip format-back when blur is caused by an Enter-submit — form was already reset
                      if (txnSubmittingRef.current) { txnSubmittingRef.current = false; return }
                      const num = parseFloat(e.target.value)
                      if (!isNaN(num) && num > 0) setTxnForm(v => ({ ...v, amount: num.toFixed(2) }))
                      else if (e.target.value !== '') setTxnForm(v => ({ ...v, amount: '' }))
                    }}
                    onKeyDown={e => {
                      if (['e', 'E', '+', '-'].includes(e.key)) { e.preventDefault(); return }
                      if (e.key === 'ArrowLeft')  { e.preventDefault(); txnMerchantRef.current?.focus(); txnMerchantRef.current?.select(); return }
                      if (e.key === 'ArrowRight') { e.preventDefault(); txnTypeRef.current?.focus(); return }
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault()
                        const cur = parseFloat(txnForm.amount) || 0
                        const next = e.key === 'ArrowUp' ? cur + 25 : Math.max(0, cur - 25)
                        setTxnForm(v => ({ ...v, amount: next === 0 ? '' : String(next) }))
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (e.shiftKey) {
                          txnMerchantRef.current?.focus(); txnMerchantRef.current?.select()
                        } else if (!txnForm.accountId) {
                          txnAccountRef.current?.focus(); setTimedTxnHint('Choose an account first.')
                        } else if (!txnForm.merchant.trim()) {
                          txnMerchantRef.current?.focus(); setTimedTxnHint('Enter a merchant or description.')
                        } else if (parseFloat(txnForm.amount) <= 0) {
                          txnAmountRef.current?.focus(); txnAmountRef.current?.select()
                        } else {
                          createOrSaveTxn()
                        }
                      }
                    }}
                  />
                </div>
                {/* Type — left/right navigate between fields; up/down cycle options natively */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Type</label>
                  <select
                    ref={txnTypeRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={txnForm.type}
                    onChange={e => setTxnForm(v => ({ ...v, type: e.target.value as TransactionType, toAccountId: '' }))}
                    onKeyDown={e => {
                      if (e.key === 'ArrowLeft')  { e.preventDefault(); txnAmountRef.current?.focus(); txnAmountRef.current?.select() }
                      if (e.key === 'ArrowRight') { e.preventDefault(); txnCategoryRef.current?.focus() }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (e.shiftKey) { txnAmountRef.current?.focus(); txnAmountRef.current?.select() }
                        else txnCategoryRef.current?.focus()
                      }
                    }}
                  >
                    {TXN_TYPES.map(t => <option key={t} value={t}>{TXN_TYPE_LABELS[t]}</option>)}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-0.5">Use Credit Card Payment when checking pays down a credit card.</p>
                </div>
                {/* V9.2 — Transfer To account (only for transfer + credit card payment) */}
                {isMoneyMovement(txnForm.type) && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      {txnForm.type === 'credit card payment' ? 'Credit Card Being Paid' : 'Transfer To Account'}
                    </label>
                    <select
                      className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                      value={txnForm.toAccountId}
                      onChange={e => setTxnForm(v => ({ ...v, toAccountId: e.target.value }))}
                    >
                      <option value="">— optional —</option>
                      {accounts
                        .filter(a => a.id !== txnForm.accountId)
                        .filter(a =>
                          txnForm.type === 'credit card payment'
                            ? a.type === 'credit card'
                            : a.type !== 'credit card'
                        )
                        .map(a => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      {txnForm.type === 'credit card payment'
                        ? 'Selecting the card updates both account balances.'
                        : 'Selecting a destination updates both account balances.'}
                    </p>
                  </div>
                )}
                {/* Category */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Category <span className="text-slate-600">(optional)</span></label>
                  <select
                    ref={txnCategoryRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={txnForm.categoryId}
                    onChange={e => setTxnForm(v => ({ ...v, categoryId: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'ArrowLeft')  { e.preventDefault(); txnTypeRef.current?.focus() }
                      if (e.key === 'ArrowRight') { e.preventDefault(); txnNotesRef.current?.focus() }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (e.shiftKey) txnTypeRef.current?.focus()
                        else txnNotesRef.current?.focus()
                      }
                    }}
                  >
                    <option value="">— none —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {/* Notes */}
                <div className="lg:col-span-2">
                  <label className="block text-xs text-slate-400 mb-1">Notes <span className="text-slate-600">(optional)</span></label>
                  <input
                    ref={txnNotesRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="optional"
                    value={txnForm.notes}
                    onChange={e => setTxnForm(v => ({ ...v, notes: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) {
                        e.preventDefault(); txnCategoryRef.current?.focus()
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (e.shiftKey) {
                          txnCategoryRef.current?.focus()
                        } else if (!txnForm.accountId) {
                          txnAccountRef.current?.focus(); setTimedTxnHint('Choose an account first.')
                        } else if (!txnForm.merchant.trim()) {
                          txnMerchantRef.current?.focus(); setTimedTxnHint('Enter a merchant or description.')
                        } else if (parseFloat(txnForm.amount) <= 0) {
                          txnAmountRef.current?.focus(); setTimedTxnHint('Enter a transaction amount.')
                        } else {
                          createOrSaveTxn()
                        }
                      }
                    }}
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={createOrSaveTxn} className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${txnDupWarning ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
                  {txnDupWarning ? 'Save Anyway' : 'Add Transaction'}
                </button>
                <button onClick={clearTxnForm} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-1.5 text-sm transition-colors">Clear</button>
                <button onClick={undoTxn} disabled={!txnHistory.length} className={`rounded-lg px-3 py-1.5 text-sm ${txnHistory.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Undo</button>
                <button onClick={redoTxn} disabled={!txnRedo.length} className={`rounded-lg px-3 py-1.5 text-sm ${txnRedo.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Redo</button>
                {transactions.length > 0 && (
                  <button onClick={() => { if (!transactions.length) return; setTxnWithHistory(() => []); showUndoableToast(`${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} cleared`, undoTxn) }} className="rounded-lg px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors">Clear All</button>
                )}
                <button onClick={generateSampleTransaction} className="rounded-lg px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors" title="Instantly add a random sample transaction">Generate Sample</button>
                <button onClick={generateTenSamples} className="rounded-lg px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors" title="Add 10 varied samples — mixed categories, some uncategorized, some duplicate-like">Generate 10 Samples</button>
                <button onClick={openCsvImport} className="rounded-lg px-3 py-1.5 text-xs bg-indigo-800/70 hover:bg-indigo-700/80 text-indigo-200 border border-indigo-700/50 transition-colors" title="Import transactions from a CSV file">Import CSV</button>
              </div>
              {txnHint && <p className="mt-2 text-sm text-amber-300">{txnHint}</p>}
            </Card>
            }
            transactionRulesSlot={
            <Card title="Transaction Rules" noHover>
              <div className="flex items-start justify-between gap-4 mb-3">
                <p className="text-xs text-slate-400">Rules auto-categorize transactions based on merchant names or notes. Applied on import and when you manually categorize.</p>
                <button
                  onClick={() => {
                    // V37 — Show actual merchant list, not just a toast
                    const uncategorized = transactions.filter(t => !t.categoryId)
                    if (uncategorized.length === 0) { showToast('No uncategorized transactions found'); return }
                    const existing = new Set(rules.flatMap(r => r.matchText?.toLowerCase().split(',').map((s: string) => s.trim()) ?? []))
                    const merchants = [...new Set(
                      uncategorized.map(t => t.merchant).filter(Boolean)
                        .filter(m => !existing.has(m.toLowerCase()))
                    )].sort() as string[]
                    if (merchants.length === 0) { showToast('All uncategorized merchants already have rules'); return }
                    setMerchantSuggestList(merchants)
                  }}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg border border-violet-700/40 bg-violet-900/20 text-violet-300 hover:bg-violet-800/30 transition-colors flex-shrink-0 whitespace-nowrap"
                >
                  ⚡ Suggest from history
                </button>
              </div>

              {/* V37 — Merchant suggestion panel */}
              {merchantSuggestList.length > 0 && (
                <div className="mb-4 rounded-xl border border-violet-700/40 bg-violet-900/15 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] font-semibold text-violet-300 uppercase tracking-wide">
                      {merchantSuggestList.length} merchants need rules — click to pre-fill the form
                    </p>
                    <button onClick={() => setMerchantSuggestList([])} className="text-[10px] text-slate-500 hover:text-slate-300">✕ Dismiss</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {merchantSuggestList.map(m => (
                      <button
                        key={m}
                        onClick={() => {
                          setRuleForm((v: any) => ({ ...v, name: m, matchText: m }))
                          setMerchantSuggestList(prev => prev.filter(x => x !== m))
                          ruleNameRef.current?.focus()
                        }}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-violet-600/40 bg-violet-800/20 hover:bg-violet-700/30 text-violet-200 hover:text-white transition-all"
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2">Click a merchant to pre-fill the rule form. Choose a budget category, then click Add Rule.</p>
                </div>
              )}

              {/* V35 — Common merchant quick-rules */}
              {rules.length === 0 && (
                <div className="mb-4 rounded-xl border border-slate-700/40 bg-slate-800/30 p-3">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Quick-add common rules</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { name: 'Amazon', match: 'amazon', cat: 'Shopping' },
                      { name: 'DoorDash', match: 'doordash', cat: 'Takeout' },
                      { name: 'Uber Eats', match: 'uber eats', cat: 'Takeout' },
                      { name: 'Netflix', match: 'netflix', cat: 'Subscriptions' },
                      { name: 'Spotify', match: 'spotify', cat: 'Subscriptions' },
                      { name: 'Walmart', match: 'walmart', cat: 'Groceries' },
                      { name: 'Target', match: 'target', cat: 'Shopping' },
                      { name: 'Whole Foods', match: 'whole foods', cat: 'Groceries' },
                      { name: 'Starbucks', match: 'starbucks', cat: 'Dining Out' },
                      { name: 'Apple', match: 'apple.com/bill', cat: 'Subscriptions' },
                      { name: 'Shell / Gas', match: 'shell,chevron,bp,exxon', cat: 'Gas' },
                      { name: 'CVS / Walgreens', match: 'cvs,walgreens', cat: 'Health' },
                    ].filter(q => !rules.some(r => r.matchText?.toLowerCase().includes(q.match))).map(q => {
                      const matchingCat = categories.find(c => c.name.toLowerCase().includes(q.cat.toLowerCase()))
                      if (!matchingCat) return null
                      return (
                        <button
                          key={q.name}
                          onClick={() => {
                            const newRule = { id: `rule-quick-${Date.now()}-${q.name}`, name: q.name, matchText: q.match, matchField: 'merchant' as const, categoryId: matchingCat.id, createdAt: new Date().toISOString() }
                            setRules(prev => [...prev, newRule])
                            showToast(`Rule added: ${q.name} → ${matchingCat.name}`)
                          }}
                          className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-600/40 bg-slate-700/40 hover:bg-slate-600/50 text-slate-300 hover:text-slate-100 transition-all"
                        >
                          + {q.name} → {matchingCat.name}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2">Only shows rules you don{"'"}t have yet, matched to your existing budget categories.</p>
                </div>
              )}
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 items-start">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Rule Name</label>
                  <input
                    ref={ruleNameRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. Groceries"
                    value={ruleForm.name}
                    onChange={e => { setRuleForm(v => ({ ...v, name: e.target.value })); setRuleHint('') }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ruleMatchTextRef.current?.focus() } }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Match Text</label>
                  <input
                    ref={ruleMatchTextRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. Whole Foods, WFM"
                    value={ruleForm.matchText}
                    onChange={e => { setRuleForm(v => ({ ...v, matchText: e.target.value })); setRuleHint('') }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); createOrSaveRule() }
                      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); ruleNameRef.current?.focus() }
                    }}
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Comma-separated: Target, TGT, Target Store</p>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Match Field</label>
                  <select
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={ruleForm.matchField}
                    onChange={e => setRuleForm(v => ({ ...v, matchField: e.target.value as 'merchant' | 'notes' }))}
                  >
                    <option value="merchant">Merchant</option>
                    <option value="notes">Notes</option>
                  </select>
                  <p className="text-[10px] text-slate-500 mt-0.5">Where to look for the match text</p>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Assign to Budget Category</label>
                  <select
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={ruleForm.categoryId}
                    onChange={e => { setRuleForm(v => ({ ...v, categoryId: e.target.value })); setRuleHint('') }}
                  >
                    <option value="">Select category…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-0.5">The budget category this transaction counts toward</p>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Transaction Type <span className="text-slate-600">(optional filter)</span></label>
                  <select
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={ruleForm.type}
                    onChange={e => setRuleForm(v => ({ ...v, type: e.target.value as TransactionType | '' }))}
                  >
                    <option value="">— any type —</option>
                    {TXN_TYPES.map(t => <option key={t} value={t}>{TXN_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                <button onClick={createOrSaveRule} className="rounded-lg bg-blue-600 hover:bg-blue-500 px-4 py-1.5 text-sm transition-colors">Add Rule</button>
                <button onClick={clearRuleForm} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-1.5 text-sm transition-colors">Clear</button>
                <button onClick={undoRule} disabled={!ruleHistory.length} className={`rounded-lg px-3 py-1.5 text-sm ${ruleHistory.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Undo</button>
                <button onClick={redoRule} disabled={!ruleRedo.length} className={`rounded-lg px-3 py-1.5 text-sm ${ruleRedo.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Redo</button>
                {rules.length > 0 && (
                  <button onClick={() => { if (!rules.length) return; setRulesWithHistory(() => []); showUndoableToast(`${rules.length} rule${rules.length !== 1 ? 's' : ''} cleared`, undoRule) }} className="rounded-lg px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors">Clear All</button>
                )}
                <button onClick={generateSampleRule} className="rounded-lg px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors" title="Instantly add a sample rule">Generate Sample</button>
              </div>
              {ruleHint && <p className="mt-2 text-sm text-amber-300">{ruleHint}</p>}

              {transactions.length > 0 && rules.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-700/60 flex items-center gap-3 flex-wrap">
                  <button onClick={applyAllRules} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-1.5 text-sm transition-colors">Apply Rules to Transactions</button>
                  <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
                    <input type="checkbox" className="rounded" checked={overwriteCategories} onChange={e => setOverwriteCategories(e.target.checked)} />
                    Overwrite existing categories
                  </label>
                  {applyRulesMsg && <span className="text-sm text-green-400">{applyRulesMsg}</span>}
                </div>
              )}

              {rules.length > 0 ? (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                     <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-1.5 pr-3 font-medium">Rule Name</th>
                        <th className="pb-1.5 pr-3 font-medium">Matches</th>
                        <th className="pb-1.5 pr-3 font-medium">In Field</th>
                        <th className="pb-1.5 pr-3 font-medium">Assign to Category</th>
                        <th className="pb-1.5 pr-3 font-medium">Type Filter</th>
                        <th className="pb-1.5 pr-3 font-medium">Usage</th>
                        <th className="pb-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map(r => {
                        const cat = categories.find(c => c.id === r.categoryId)
                        const isInlineEdit = inlineRuleEditId === r.id
                        if (isInlineEdit) {
                          const blurSave = () => scheduleInlineEditBlurSave(saveInlineRuleEdit)
                          const blurCancel = () => cancelInlineEditBlur()
                          return (
                            <tr key={r.id} className="border-b border-slate-700 bg-blue-950/20">
                              {/* Rule Name — normal text editing, no arrow nav override */}
                              <td className="py-1.5 pr-2">
                                <input
                                  ref={inlineRuleNameRef}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                  value={inlineRuleEditForm.name}
                                  onFocus={e => { e.target.select(); blurCancel() }}
                                  onBlur={blurSave}
                                  onChange={e => setInlineRuleEditForm(v => ({ ...v, name: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); inlineRuleMatchRef.current?.focus() } if (e.key === 'Escape') cancelInlineRuleEdit() }}
                                />
                              </td>
                              {/* Matches — preserve normal cursor movement; only Enter/Escape special */}
                              <td className="py-1.5 pr-2">
                                <input
                                  ref={inlineRuleMatchRef}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none font-mono"
                                  value={inlineRuleEditForm.matchText}
                                  onFocus={e => { e.target.select(); blurCancel() }}
                                  onBlur={blurSave}
                                  onChange={e => setInlineRuleEditForm(v => ({ ...v, matchText: e.target.value }))}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') { e.preventDefault(); inlineRuleFieldRef.current?.focus() }
                                    if (e.key === 'Escape') cancelInlineRuleEdit()
                                  }}
                                />
                              </td>
                              {/* In Field — ArrowLeft → Matches, ArrowRight → Category */}
                              <td className="py-1.5 pr-2">
                                <select
                                  ref={inlineRuleFieldRef}
                                  className="px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                  value={inlineRuleEditForm.matchField}
                                  onFocus={blurCancel}
                                  onBlur={blurSave}
                                  onChange={e => setInlineRuleEditForm(v => ({ ...v, matchField: e.target.value as 'merchant' | 'notes' }))}
                                  onKeyDown={e => {
                                    if (e.key === 'ArrowLeft')  { e.preventDefault(); inlineRuleMatchRef.current?.focus() }
                                    if (e.key === 'ArrowRight') { e.preventDefault(); inlineRuleCatRef.current?.focus() }
                                    if (e.key === 'Enter')      { e.preventDefault(); inlineRuleCatRef.current?.focus() }
                                    if (e.key === 'Escape')     cancelInlineRuleEdit()
                                  }}
                                >
                                  <option value="merchant">Merchant</option>
                                  <option value="notes">Notes</option>
                                </select>
                              </td>
                              {/* Assign to Category — ArrowLeft → In Field, ArrowRight → Type */}
                              <td className="py-1.5 pr-2">
                                <select
                                  ref={inlineRuleCatRef}
                                  className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                  value={inlineRuleEditForm.categoryId}
                                  onFocus={blurCancel}
                                  onBlur={blurSave}
                                  onChange={e => setInlineRuleEditForm(v => ({ ...v, categoryId: e.target.value }))}
                                  onKeyDown={e => {
                                    if (e.key === 'ArrowLeft')  { e.preventDefault(); inlineRuleFieldRef.current?.focus() }
                                    if (e.key === 'ArrowRight') { e.preventDefault(); inlineRuleTypeRef.current?.focus() }
                                    if (e.key === 'Enter')      { e.preventDefault(); inlineRuleTypeRef.current?.focus() }
                                    if (e.key === 'Escape')     cancelInlineRuleEdit()
                                  }}
                                >
                                  <option value="">— none —</option>
                                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </td>
                              {/* Type Filter — ArrowLeft → Category, ArrowRight/Enter → Save */}
                              <td className="py-1.5 pr-2">
                                <select
                                  ref={inlineRuleTypeRef}
                                  className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                  value={inlineRuleEditForm.type}
                                  onFocus={blurCancel}
                                  onBlur={blurSave}
                                  onChange={e => setInlineRuleEditForm(v => ({ ...v, type: e.target.value as TransactionType | '' }))}
                                  onKeyDown={e => {
                                    if (e.key === 'ArrowLeft')  { e.preventDefault(); inlineRuleCatRef.current?.focus() }
                                    if (e.key === 'ArrowRight') { e.preventDefault(); blurCancel(); inlineRuleSaveRef.current?.focus() }
                                    if (e.key === 'Enter')      { e.preventDefault(); blurCancel(); saveInlineRuleEdit() }
                                    if (e.key === 'Escape')     cancelInlineRuleEdit()
                                  }}
                                >
                                  <option value="">— any —</option>
                                  {TXN_TYPES.map(t => <option key={t} value={t}>{TXN_TYPE_LABELS[t]}</option>)}
                                </select>
                              </td>
                              <td className="py-1.5 whitespace-nowrap space-x-2">
                                <button
                                  ref={inlineRuleSaveRef}
                                  className="text-blue-400 hover:text-blue-300 text-xs"
                                  onClick={() => { blurCancel(); saveInlineRuleEdit() }}
                                >Save</button>
                                <button className="text-slate-400 hover:text-slate-300 text-xs" onClick={() => { blurCancel(); cancelInlineRuleEdit() }}>Cancel</button>
                              </td>
                            </tr>
                          )
                        }
                      const usageCount = transactions.filter(tx => tx.appliedByRule === r.id).length
                        return (
                          <tr key={r.id} className={`border-b border-slate-800 transition-colors duration-300 ${highlightedRuleId === r.id ? 'bg-blue-600/20' : 'hover:bg-slate-800/40'}`}>
                            <td className="py-2 pr-3 font-medium">{r.name}</td>
                            <td className="py-2 pr-3 font-mono text-xs text-slate-300">{r.matchText}</td>
                            <td className="py-2 pr-3 text-slate-400 text-xs capitalize">{r.matchField}</td>
                            <td className="py-2 pr-3 text-xs">{cat ? <span className="text-slate-400">{cat.name}</span> : <span className="text-red-400">missing</span>}</td>
                            <td className="py-2 pr-3 text-slate-400 text-xs">{r.type ? TXN_TYPE_LABELS[r.type] : '—'}</td>
                            <td className="py-2 pr-3 text-xs">
                              {usageCount > 0 && (
                                <span className="text-indigo-400 bg-indigo-900/30 border border-indigo-700/40 px-1.5 py-0.5 rounded text-[10px]">Used {usageCount}</span>
                              )}
                            </td>
                            <td className="py-2 whitespace-nowrap space-x-2">
                           <button className="text-blue-400 hover:text-blue-300 text-xs" onClick={() => {
                                setInlineRuleEditId(r.id)
                                setInlineRuleEditForm({ name: r.name, matchText: r.matchText, matchField: r.matchField, categoryId: r.categoryId, type: r.type ?? '' })
                                setTimeout(() => { inlineRuleMatchRef.current?.focus(); inlineRuleMatchRef.current?.select() }, 0)
                              }}>Edit</button>
                             <button className="text-red-400 hover:text-red-300 text-xs" onClick={() => {
                                const deletedId = r.id
                                addPendingDelete('transaction_rules', deletedId)
                                setRulesWithHistory(prev => prev.filter(x => x.id !== deletedId))
                                // V8.6 — When a rule is deleted, clear the category AND the badge on any
                                // transaction that the rule assigned and the user hasn't manually changed
                                // since (appliedByRule still points to this rule = no manual override).
                                // Uses setTxnWithHistory so the cleanup is undoable.
                                setTxnWithHistory(prev => prev.map(tx =>
                                  tx.appliedByRule === deletedId
                                    ? { ...tx, categoryId: undefined, appliedByRule: undefined }
                                    : tx
                                ))
                              }}>Delete</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-slate-700/50 bg-slate-800/40 px-4 py-3 text-center">
                  <p className="text-slate-400 text-sm font-medium">No rules yet</p>
                  <p className="text-slate-500 text-xs mt-0.5">Add a rule above to auto-categorize new transactions by merchant name or notes.</p>
                </div>
              )}
            </Card>
            }
            txnTypes={[]}
          />
        )}

        {/* ── SCENARIOS ── */}
        {tab === 'Scenarios' && (
          <section className="space-y-4 transition-all duration-300">
            {/* ── Scenario inputs ── */}
            <Card title="Scenario Inputs">
              <div className="flex gap-2 mb-3">{periods.map(p => <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>{labelPeriod(p)}</Pill>)}</div>
              <div className="grid md:grid-cols-4 gap-2">
                {(['Slow', 'Medium', 'Fast', 'Custom'] as ScenarioName[]).map(n => (
                  <div key={n}>
                    <label className="text-xs text-slate-400">{n}</label>
                    <input ref={n === 'Slow' ? scenarioSlowRef : undefined} type="number" min={0} step={100} value={scenario[n]} onChange={e => setScenario(v => ({ ...v, [n]: Math.max(0, Number(e.target.value) || 0) }))} className="w-full p-2 rounded bg-slate-800 border border-slate-600" />
                  </div>
                ))}
              </div>

              {/* V9.13 — Stress test panel */}
              <div className="mt-3 pt-3 border-t border-slate-700/60">
                <button
                  className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                  onClick={() => setShowStressTest(v => !v)}
                >
                  <span>{showStressTest ? '▾' : '▸'}</span> Stress Test Options
                </button>
                {showStressTest && (
                  <div className="mt-2 flex gap-2 flex-wrap">
                    {([
                      { key: 'none',            label: 'No stress test' },
                      { key: 'commission-25',   label: '−25% commission' },
                      { key: 'commission-50',   label: '−50% commission' },
                      { key: 'extra-expense',   label: '+$1,000 expense' },
                      { key: 'higher-bills',    label: '+$500 fixed bills' },
                    ] as const).map(({ key, label }) => (
                      <button
                        key={key}
                        className={`text-xs px-2.5 py-1 rounded transition-colors ${scenarioStressMode === key ? 'bg-orange-700 text-orange-100' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                        onClick={() => setScenarioStressMode(key)}
                      >{label}</button>
                    ))}
                    {scenarioStressMode !== 'none' && (
                      <span className="text-xs text-orange-300 self-center">Stress mode active — scenario cards show adjusted results</span>
                    )}
                  </div>
                )}
              </div>

              {/* Save / Load */}
              <div className="grid md:grid-cols-3 gap-2 mt-3">
                <input className="p-2 rounded bg-slate-800 border border-slate-600" placeholder="Scenario set name" value={scenarioTitle} onChange={e => setScenarioTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveScenarioSet(scenarioTitle, period) }}
                />
                <button className="rounded bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm transition-colors" onClick={() => saveScenarioSet(scenarioTitle, period)}>Save Scenario Set</button>
                <div className="text-xs text-slate-400 self-center">Saved locally · Enter to save</div>
              </div>

              {/* Saved scenario list with rename + duplicate + notes */}
              {savedScenarios.length > 0 && (
                <div className="space-y-2 mt-2">
                  {savedScenarios.map(s => (
                    <div key={s.name} className="rounded border border-slate-700 p-2.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {editingScenarioName === s.name ? (
                            <input
                              className="px-1.5 py-0.5 text-sm rounded bg-slate-800 border border-blue-500 focus:outline-none text-slate-100 w-48"
                              value={renameScenarioValue}
                              onChange={e => setRenameScenarioValue(e.target.value)}
                              autoFocus
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  renameScenarioSet(s.name, renameScenarioValue)
                                }
                                if (e.key === 'Escape') setEditingScenarioName(null)
                              }}
                              onBlur={() => setEditingScenarioName(null)}
                            />
                          ) : (
                            <span className="font-medium text-slate-200 text-sm">{s.name}</span>
                          )}
                          <div className="text-[10px] text-slate-500 mt-0.5">{new Date(s.savedAt).toLocaleString()}</div>
                        </div>
                        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                          <button className="text-blue-300 hover:text-blue-200 text-xs" onClick={() => { setScenario(s.scenarios); setPeriod(s.period) }}>Load</button>
                          <button className="text-slate-400 hover:text-slate-200 text-xs" onClick={() => { setEditingScenarioName(s.name); setRenameScenarioValue(s.name) }}>Rename</button>
                          <button className="text-slate-400 hover:text-slate-200 text-xs" onClick={() => {
                            const dupeBase = s.name + ' (copy)'
                            let dupeName = dupeBase
                            let i = 2
                            while (savedScenarios.find(x => x.name === dupeName)) { dupeName = `${dupeBase} ${i++}` }
                            setSavedScenarios(prev => [{ ...s, name: dupeName, savedAt: new Date().toISOString() }, ...prev])
                          }}>Duplicate</button>
                          <button className="text-red-300 hover:text-red-200 text-xs" onClick={() => { setSavedScenarios(prev => prev.filter(x => x.name !== s.name)); setScenarioNotes(prev => { const n = { ...prev }; delete n[s.name]; return n }) }}>Delete</button>
                        </div>
                      </div>
                      {/* Per-scenario notes */}
                      <textarea
                        className="w-full px-2 py-1.5 text-xs rounded bg-slate-800/60 border border-slate-700/40 focus:border-blue-500 focus:outline-none resize-none text-slate-400 placeholder:text-slate-600"
                        rows={1}
                        placeholder="Notes — What assumptions are you making?"
                        value={scenarioNotes[s.name] ?? ''}
                        onChange={e => setScenarioNotes(prev => ({ ...prev, [s.name]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* ── Scenario comparison cards ── */}
            <div className="grid md:grid-cols-2 gap-3">
              {(['Slow', 'Medium', 'Fast', 'Custom'] as ScenarioName[]).map(n => {
                // Apply stress test adjustments
                let gpForScenario = scenario[n]
                let extraMonthlyExpense = 0
                if (scenarioStressMode === 'commission-25') gpForScenario = gpForScenario * 0.75
                else if (scenarioStressMode === 'commission-50') gpForScenario = gpForScenario * 0.5
                else if (scenarioStressMode === 'extra-expense') extraMonthlyExpense = 1000
                else if (scenarioStressMode === 'higher-bills') extraMonthlyExpense = 500

                const ii = income(gpForScenario, adjustedSalary)
                const adjustedMonthlyBudget = monthlyBudget + extraMonthlyExpense
                const rem = convertFromMonthly(ii.totalMonthly - adjustedMonthlyBudget, period)
                const remMonthly = ii.totalMonthly - adjustedMonthlyBudget

                const toneClass = n === 'Slow' ? 'border-yellow-500/60' : n === 'Medium' ? 'border-blue-500/60' : n === 'Fast' ? 'border-green-500/60' : 'border-slate-300/60'
                const borderColor = n === 'Slow' ? '#facc15' : n === 'Medium' ? '#60a5fa' : n === 'Fast' ? '#4ade80' : '#cbd5e1'

                // Plain-language scenario summary
                const summary = (() => {
                  if (rem < -500) return 'This scenario leaves you in the red — expenses exceed income.'
                  if (rem < 0) return 'This scenario is slightly over budget. Something needs to flex.'
                  if (rem < convertFromMonthly(200, period)) return 'Very little margin here. One unexpected expense could cause a shortfall.'
                  if (savingsRate < 10) return 'Income covers expenses, but there is not much left for savings goals.'
                  return rem >= convertFromMonthly(500, period)
                    ? 'This scenario supports your active savings goals comfortably.'
                    : 'This scenario is workable — savings goals stay on track with discipline.'
                })()

                // Confidence badge
                const confidence: 'Stable' | 'Moderate' | 'Risky' = rem < 0 ? 'Risky' : rem < convertFromMonthly(200, period) ? 'Moderate' : 'Stable'
                const confColor = confidence === 'Stable' ? 'bg-green-900/50 text-green-300 border-green-700/40' : confidence === 'Moderate' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-700/40' : 'bg-red-900/50 text-red-300 border-red-700/40'

                // Savings goal impact: months to complete each active goal under this scenario
                const activeGoals = targets.filter(t => !t.completed && t.goalAmount > t.currentSaved)
                const savingsAvailableMonthly = Math.max(0, remMonthly)
                const goalImpacts = activeGoals.slice(0, 3).map(t => {
                  const remaining = t.goalAmount - t.currentSaved
                  if (savingsAvailableMonthly <= 0) return { name: t.name, months: null }
                  const months = Math.ceil(remaining / savingsAvailableMonthly)
                  return { name: t.name, months }
                })

                return (
                  <Card key={n} title={`${n} Scenario`} className={toneClass} style={{ borderColor, borderWidth: 2 }}>
                    {/* Confidence badge + summary */}
                    <div className="flex items-start gap-2 mb-3">
                      <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${confColor}`}>{confidence}</span>
                      <p className="text-xs text-slate-300 leading-relaxed">{summary}</p>
                    </div>

                    {scenarioStressMode !== 'none' && (
                      <div className="mb-2 px-2 py-1 rounded bg-orange-900/20 border border-orange-500/20 text-[10px] text-orange-300">
                        {scenarioStressMode === 'commission-25' && `GP adjusted to ${currency(gpForScenario)} (−25%)`}
                        {scenarioStressMode === 'commission-50' && `GP adjusted to ${currency(gpForScenario)} (−50%)`}
                        {scenarioStressMode === 'extra-expense' && `+$1,000/mo unexpected expense applied`}
                        {scenarioStressMode === 'higher-bills' && `+$500/mo fixed bills applied`}
                      </div>
                    )}

                    <Row l="Monthly Gross Income" v={currency(gpForScenario)} />
                    <Row l={`Gross Income (${labelPeriod(period)})`} v={currency(convertFromMonthly(gpForScenario, period))} />
                    <Row l="Commission (net)" v={currency(convertFromMonthly(ii.cMonthly, period))} />
                    <Row l="Base net income" v={currency(convertFromMonthly(ii.baseMonthly, period))} />
                    <Row l="Total net income" v={currency(convertFromMonthly(ii.totalMonthly, period))} />
                    <Row l="Effective hourly rate" v={`${currency(ii.totalWeekly / HOURS_PER_WEEK)} /hr`} />
                    {extraMonthlyExpense > 0 && (
                      <Row l="Adjusted budget (with stress)" v={currency(convertFromMonthly(adjustedMonthlyBudget, period))} valueClass="text-orange-300" />
                    )}
                    <Row l="Remaining after budget" v={currency(rem)} valueClass={
                      rem >= 0 ? 'text-green-400'
                        : varianceTone(-rem, period) === 'neutral' ? 'text-slate-300'
                        : varianceTone(-rem, period) === 'warn' ? 'text-yellow-300'
                        : 'text-red-400'
                    } />

                    {/* Savings goal impact */}
                    {goalImpacts.length > 0 && (
                      <div className="mt-3 pt-2 border-t border-slate-700/40">
                        <p className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wide">Savings Goal Pace</p>
                        {goalImpacts.map(({ name, months }) => (
                          <div key={name} className="flex justify-between text-xs py-0.5">
                            <span className="text-slate-400 truncate mr-2">{name}</span>
                            <span className={months === null ? 'text-red-400' : months <= 12 ? 'text-green-400' : months <= 36 ? 'text-yellow-300' : 'text-slate-400'}>
                              {months === null ? 'Not reachable' : months === 1 ? '1 month' : `${months} months`}
                            </span>
                          </div>
                        ))}
                        {savingsAvailableMonthly <= 0 && (
                          <p className="text-[10px] text-red-400 mt-1">No surplus available — savings goals stall under this scenario.</p>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </section>
        )}

        {/* ── SAVINGS GOALS ── */}
        {tab === 'Targets' && (
          <section className="space-y-4">
            <Card title="Create Savings Goal" noHover>
              <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Goal Name</label>
                  <div ref={targetAutocompleteWrapRef} className="relative">
                    <input
                      ref={targetNameRef}
                      className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
                      value={targetForm.name}
                      placeholder="e.g. Emergency Fund"
                      onFocus={() => setShowTargetSuggestions(true)}
                      onChange={(e) => { setTargetForm((v) => ({ ...v, name: e.target.value })); setTargetSuggestionIndex(-1); setShowTargetSuggestions(true); setTargetFormHint('') }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          if (targetSuggestionList.length) { setTargetSuggestionIndex((v) => Math.min(v + 1, targetSuggestionList.length - 1)); setShowTargetSuggestions(true) }
                          return
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault()
                          if (targetSuggestionList.length) { setTargetSuggestionIndex((v) => Math.max(v - 1, 0)); setShowTargetSuggestions(true) }
                          return
                        }
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          if (targetSuggestionIndex >= 0 && targetSuggestionList.length) {
                            setTargetForm((v) => ({ ...v, name: targetSuggestionList[targetSuggestionIndex] }))
                            setShowTargetSuggestions(false); setTargetSuggestionIndex(-1); targetGoalRef.current?.focus(); return
                          }
                          if (targetSuggestionList.length === 1) {
                            setTargetForm((v) => ({ ...v, name: targetSuggestionList[0] }))
                            setShowTargetSuggestions(false); setTargetSuggestionIndex(-1); targetGoalRef.current?.focus(); return
                          }
                          if (targetForm.name.trim()) { setShowTargetSuggestions(false); setTargetSuggestionIndex(-1); targetGoalRef.current?.focus() }
                        }
                      }}
                    />
                    {showTargetSuggestions && targetSuggestionList.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 max-h-48 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg">
                        {targetSuggestionList.map((preset, i) => (
                          <button
                            key={preset}
                            type="button"
                            className={`w-full text-left px-2 py-1 text-sm ${i === targetSuggestionIndex ? 'bg-slate-700' : 'hover:bg-slate-700'}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setTargetForm((v) => ({ ...v, name: preset })); setShowTargetSuggestions(false); setTargetSuggestionIndex(-1); targetGoalRef.current?.focus() }}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Goal Amount</label>
                  <input
                    ref={targetGoalRef}
                    type="number"
                    min={0}
                    step={25}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
                    value={targetForm.goalAmount}
                    onChange={(e) => setTargetForm((v) => ({ ...v, goalAmount: e.target.value }))}
                    onFocus={e => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); targetSavedRef.current?.focus() }
                    }}
                    placeholder="e.g. 1000"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Current Saved</label>
                  <input
                    ref={targetSavedRef}
                    type="number"
                    min={0}
                    step={25}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
                    value={targetForm.currentSaved}
                    onChange={(e) => setTargetForm((v) => ({ ...v, currentSaved: e.target.value }))}
                    onFocus={e => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); targetStartDateRef.current?.focus() }
                      if (e.key === 'ArrowLeft') { e.preventDefault(); targetGoalRef.current?.focus() }
                    }}
                    placeholder="e.g. 250"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Start Date (when you began saving)</label>
                  <input
                    ref={targetStartDateRef}
                    type="date"
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
                    value={targetForm.startDate}
                    onChange={(e) => setTargetForm((v) => ({ ...v, startDate: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight') {
                        startDateLeftArrowCount.current = 0
                        startDateArrowCount.current += 1
                        if (startDateArrowCount.current > 2) {
                          e.preventDefault()
                          startDateArrowCount.current = 0
                          targetDeadlineRef.current?.focus()
                        }
                      } else if (e.key === 'ArrowLeft') {
                        startDateArrowCount.current = 0
                        startDateLeftArrowCount.current += 1
                        if (startDateLeftArrowCount.current > 2) {
                          e.preventDefault()
                          startDateLeftArrowCount.current = 0
                          targetSavedRef.current?.focus()
                        }
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        startDateArrowCount.current = 0
                        startDateLeftArrowCount.current = 0
                        targetDeadlineRef.current?.focus()
                      } else {
                        startDateArrowCount.current = 0
                        startDateLeftArrowCount.current = 0
                      }
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Deadline (when the goal is due)</label>
                  <input
                    ref={targetDeadlineRef}
                    type="date"
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
                    value={targetForm.deadline}
                    onChange={(e) => setTargetForm((v) => ({ ...v, deadline: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowRight') {
                        deadlineLeftArrowCount.current = 0
                        deadlineArrowCount.current += 1
                        if (deadlineArrowCount.current > 2) {
                          e.preventDefault()
                          deadlineArrowCount.current = 0
                          createTarget()
                        }
                      } else if (e.key === 'ArrowLeft') {
                        deadlineArrowCount.current = 0
                        deadlineLeftArrowCount.current += 1
                        if (deadlineLeftArrowCount.current > 2) {
                          e.preventDefault()
                          deadlineLeftArrowCount.current = 0
                          targetStartDateRef.current?.focus()
                        }
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        deadlineArrowCount.current = 0
                        deadlineLeftArrowCount.current = 0
                        createTarget()
                      } else {
                        deadlineArrowCount.current = 0
                        deadlineLeftArrowCount.current = 0
                      }
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <button className="w-full px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 transition-colors" onClick={createTarget}>Create Savings Goal</button>
                  <button
                    className="w-full px-3 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors"
                    title="Instantly add a randomized sample savings goal"
                    onClick={generateSampleGoal}
                  >Generate Sample</button>
                </div>
              </div>
              {targetFormHint && (
                <p className="mt-2 text-sm text-amber-300">{targetFormHint}</p>
              )}
              {editTargetHint && (
  <p className="text-xs text-yellow-300 mt-1">
    {editTargetHint}
  </p>
)}
            </Card>

            {/* Target Undo / Redo / Clear row */}
            <div className="flex gap-2 items-center">
              <button
                onClick={undoTarget}
                disabled={!targetHistory.length && !targetFormHistory.length}
                className={`rounded-lg px-3 py-1.5 text-sm ${(targetHistory.length || targetFormHistory.length) ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
              >
                Undo
              </button>
              <button
                onClick={redoTarget}
                disabled={!targetRedo.length && !targetFormRedo.length}
                className={`rounded-lg px-3 py-1.5 text-sm ${(targetRedo.length || targetFormRedo.length) ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
              >
                Redo
              </button>
              <button
                onClick={() => { if (!targets.length) return; setTargetsWithHistory(() => []); showUndoableToast(`${targets.length} savings goal${targets.length !== 1 ? 's' : ''} cleared`, undoTarget) }}
                className="rounded-lg px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 text-red-200"
              >
                Clear Savings Goals
              </button>
            </div>

            <Card title="Savings Goal Sets" noHover>
              <div className="grid md:grid-cols-3 gap-2">
                <input className="p-2 rounded bg-slate-800 border border-slate-600" value={targetSetName} onChange={(e) => setTargetSetName(e.target.value)} placeholder="Savings goal set name" />
                <button className="rounded bg-blue-600" onClick={() => {
                  const n = targetSetName.trim()
                  if (!n) return
                  pushSetHistory(savedTargetSets)
                  setSavedTargetSets(prev => saveGoalSet(prev, n, targets, new Date().toISOString()))
                  showToast('Savings goal set saved')
                }}>Save</button>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-slate-400">Saved locally</div>
                  {savedTargetSetsHistory.length > 0 && (
                    <button onClick={undoSavedSets} className="text-xs text-slate-400 hover:text-slate-200 underline">Undo</button>
                  )}
                  {savedTargetSetsRedo.length > 0 && (
                    <button onClick={redoSavedSets} className="text-xs text-slate-400 hover:text-slate-200 underline">Redo</button>
                  )}
                </div>
              </div>
              <div className="space-y-2 mt-2">
                {savedTargetSets.map((s, idx) => (
                  <div key={s.name} className="rounded border border-slate-700 p-2 flex justify-between items-center gap-2">
                    {editingSetIdx === idx ? (
                      <div
                        ref={el => { renameSetRowRef.current = el }}
                        className="flex flex-1 items-center gap-2"
                        onBlur={e => {
                          // Blur-save only when focus leaves the entire rename container
                          if (!renameSetRowRef.current?.contains(e.relatedTarget as Node)) {
                            const newName = renameSetValue.trim()
                            if (newName && newName !== s.name) {
                              pushSetHistory(savedTargetSets)
                              setSavedTargetSets(prev => renameGoalSet(prev, idx, newName, new Date().toISOString()))
                              showToast('Savings goal set renamed')
                            }
                            setEditingSetIdx(null)
                          }
                        }}
                      >
                        <input
                          className="flex-1 p-1 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                          value={renameSetValue}
                          onChange={e => setRenameSetValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              const newName = renameSetValue.trim()
                              if (!newName) return
                              pushSetHistory(savedTargetSets)
                              setSavedTargetSets(prev => renameGoalSet(prev, idx, newName, new Date().toISOString()))
                              showToast('Savings goal set renamed')
                              setEditingSetIdx(null)
                            }
                            if (e.key === 'Escape') setEditingSetIdx(null)
                          }}
                          autoFocus
                        />
                        <div className="flex gap-2 shrink-0">
                          <button className="text-blue-300 hover:text-blue-200 text-sm" onMouseDown={e => {
                            e.preventDefault()
                            const newName = renameSetValue.trim()
                            if (!newName) return
                            pushSetHistory(savedTargetSets)
                            setSavedTargetSets(prev => renameGoalSet(prev, idx, newName, new Date().toISOString()))
                            showToast('Savings goal set renamed')
                            setEditingSetIdx(null)
                          }}>Save</button>
                          <button className="text-slate-400 hover:text-slate-300 text-sm" onMouseDown={e => { e.preventDefault(); setEditingSetIdx(null) }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <div className="text-sm font-medium">{s.name}</div>
                          <div className="text-xs text-slate-400">{new Date(s.savedAt).toLocaleString()}</div>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button className="text-blue-300 hover:text-blue-200 text-sm" onClick={() => {
                            const same = JSON.stringify(targets) === JSON.stringify(s.targets)
                            if (!same) {
                              pushTargetHistory(targets)
                              setTargets(loadGoalSet(s))
                              showToast('Savings goal set loaded')
                            }
                          }}>Load</button>
                          <button className="text-slate-400 hover:text-slate-300 text-sm" onClick={() => { setEditingSetIdx(idx); setRenameSetValue(s.name) }}>Rename</button>
                          <button className="text-red-300 hover:text-red-200 text-sm" onClick={() => { pushSetHistory(savedTargetSets); setSavedTargetSets(prev => deleteGoalSet(prev, s.name)) }}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* V9.12 — Goal Planning Summary */}
            {targets.length > 0 && <GoalPlanningSummary summary={goalPlanSummary} />}

            {/* Active Targets */}
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-slate-200">Active Savings Goals ({activeTargets.length})</h3>
              {activeTargets.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-3">
                  {activeTargets.map(t => <GoalCard key={t.id} {...getTargetCardProps(t)} />)}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 p-5 text-center">
                  <p className="text-slate-400 text-sm font-medium">No active savings goals</p>
                  <p className="text-slate-500 text-xs mt-1">Create a goal above — set a name, target amount, and deadline to start tracking your progress.</p>
                </div>
              )}
            </section>

            {/* V9.12 — Paused Targets */}
            {pausedTargets.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-base font-semibold text-slate-400">Paused Savings Goals ({pausedTargets.length})</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  {pausedTargets.map(t => <GoalCard key={t.id} {...getTargetCardProps(t)} />)}
                </div>
              </section>
            )}

            {/* Fully Funded Targets */}
            <section className="space-y-3">
              <button
                className="flex items-center gap-2 text-base font-semibold text-green-300 hover:text-green-200 transition-colors"
                onClick={() => setFullyFundedOpen(v => !v)}
              >
                <span>{fullyFundedOpen ? '▾' : '▸'}</span>
                <span>Fully Funded Savings Goals ({fullyFundedTargets.length})</span>
              </button>
              {fullyFundedOpen && (
                fullyFundedTargets.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-3">
                    {fullyFundedTargets.map(t => <GoalCard key={t.id} {...getTargetCardProps(t)} />)}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No fully funded savings goals.</p>
                )
              )}
            </section>

            {/* Completed Targets */}
            <section className="space-y-3">
              <button
                className="flex items-center gap-2 text-base font-semibold text-slate-400 hover:text-slate-300 transition-colors"
                onClick={() => setCompletedOpen(v => !v)}
              >
                <span>{completedOpen ? '▾' : '▸'}</span>
                <span>Completed Savings Goals ({completedTargets.length})</span>
              </button>
              {completedOpen && (
                completedTargets.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-3">
                    {completedTargets.map(t => <GoalCard key={t.id} {...getTargetCardProps(t)} />)}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No completed savings goals.</p>
                )
              )}
            </section>
          </section>
        )}

      </div>

      {/* V9.0 CSV Import Modal */}
      {csvImportOpen && (
        <CsvImportModal
          preview={csvImportPreview}
          loading={csvImportLoading}
          error={csvImportError}
          accounts={accounts}
          categories={categories}
          importAccountId={csvImportAccountId}
          importMonth={csvImportMonth}
          isAppleCard={csvIsAppleCard}
          categoryHints={csvCategoryHints}
          hintRules={rules}
          hintCategories={categories}
          hintMemory={categoryMemory}
          isPdf={csvImportIsPdf}
          pdfRows={pdfPreviewRows}
          pdfWarning={pdfParseWarning}
          preset={csvImportPreset}
          columnMapping={csvColumnMapping}
          onPresetChange={p => { setCsvImportPreset(p); setCsvImportPreview(null); setCsvColumnMapping(null); setCsvImportIsPdf(p === 'chase-pdf-experimental') }}
          onImportAccountChange={id => { setCsvImportAccountId(id); setCsvImportPreview(null); setCsvCategoryHints({}); setPdfPreviewRows([]) }}
          onImportMonthChange={setCsvImportMonth}
          onFileSelect={handleCsvFileSelect}
          onDrop={handleCsvDrop}
          onCommit={commitCsvImport}
          onCommitPdf={commitPdfImport}
          onCancel={closeCsvImport}
          onResetPreview={resetImportPreview}
          onDownloadSample={downloadSampleCsv}
          onUseSampleData={() => processCsvText(generateSampleCsvString())}
          fileInputRef={csvFileInputRef}
        />
      )}
      {/* Hidden file input for CSV selection */}
      <input ref={csvFileInputRef} type="file" accept=".csv,.pdf,text/csv,text/plain,application/pdf" className="hidden" onChange={handleCsvFileSelect} />

      {/* V9.0.4 Back-to-Top button — top-left, visible after scroll */}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed top-20 left-3 z-40 rounded-full bg-slate-700 hover:bg-slate-600 border border-slate-600 shadow-lg px-3 py-2 text-xs text-slate-300 transition-all duration-200 hover:translate-y-0.5"
          title="Back to top"
          aria-label="Scroll to top"
        >
          ↑ Top
        </button>
      )}

      {/* Toast notification — top-left, amber/warning style, Undo when applicable, click anywhere to dismiss */}
      {toast && (
        <div
          className="fixed top-5 left-5 z-50 flex items-center gap-3 rounded-xl border border-amber-600/60 bg-amber-950/90 px-4 py-3 shadow-2xl text-sm text-amber-100 transition-all duration-300 cursor-pointer max-w-sm"
          style={{ opacity: toast.visible ? 1 : 0 }}
          onClick={dismissToast}
        >
          <span className="flex-1">{toast.message}</span>
          {toast.onUndo && (
            <button
              className="ml-1 rounded bg-amber-700 hover:bg-amber-600 px-2 py-0.5 text-xs font-semibold transition-colors shrink-0"
              onClick={e => {
                e.stopPropagation()
                runToastUndo()
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
      </div>
    </div>
  )
}

// ── V7.3 Dashboard Status Banner ─────────────────────────────────────────────

function DashboardStatusBanner({ status, theme }: { status: DashboardStatus; theme: 'dark' | 'light' }) {
  const toneStyles: Record<string, { border: string; bg: string; bgLight: string; labelColor: string; labelColorLight: string; dot: string; badgeBg: string; badgeText: string; badgeBorder: string; signal: string }> = {
    excellent: {
      border: 'border-emerald-500/60',
      bg: 'bg-gradient-to-br from-emerald-950/70 via-slate-800/92 to-slate-900/95',
      bgLight: 'bg-gradient-to-br from-emerald-50 via-white to-emerald-100/70',
      labelColor: 'text-emerald-300',
      labelColorLight: 'text-emerald-800',
      dot: 'bg-emerald-400',
      badgeBg: 'bg-emerald-900/60', badgeText: 'text-emerald-300', badgeBorder: 'border-emerald-500/40',
      signal: 'All signals clear',
    },
    good: {
      border: 'border-green-500/50',
      bg: 'bg-gradient-to-br from-green-950/70 via-slate-800/92 to-slate-900/95',
      bgLight: 'bg-gradient-to-br from-green-50 via-white to-green-100/70',
      labelColor: 'text-green-300',
      labelColorLight: 'text-green-800',
      dot: 'bg-green-400',
      badgeBg: 'bg-green-900/60', badgeText: 'text-green-300', badgeBorder: 'border-green-500/40',
      signal: 'On track',
    },
    warn: {
      border: 'border-yellow-500/50',
      bg: 'bg-gradient-to-br from-yellow-950/70 via-slate-800/92 to-slate-900/95',
      bgLight: 'bg-gradient-to-br from-amber-50 via-white to-yellow-100/80',
      labelColor: 'text-yellow-300',
      labelColorLight: 'text-amber-800',
      dot: 'bg-yellow-400',
      badgeBg: 'bg-yellow-900/60', badgeText: 'text-yellow-300', badgeBorder: 'border-yellow-500/40',
      signal: 'Worth watching',
    },
    risk: {
      border: 'border-orange-500/50',
      bg: 'bg-gradient-to-br from-orange-950/70 via-slate-800/92 to-slate-900/95',
      bgLight: 'bg-gradient-to-br from-orange-50 via-white to-amber-100/80',
      labelColor: 'text-orange-300',
      labelColorLight: 'text-orange-800',
      dot: 'bg-orange-400',
      badgeBg: 'bg-orange-900/60', badgeText: 'text-orange-300', badgeBorder: 'border-orange-500/40',
      signal: 'Needs attention',
    },
    danger: {
      border: 'border-red-500/60',
      bg: 'bg-gradient-to-br from-red-950/75 via-slate-800/92 to-slate-900/95',
      bgLight: 'bg-gradient-to-br from-red-50 via-white to-orange-100/80',
      labelColor: 'text-red-300',
      labelColorLight: 'text-red-800',
      dot: 'bg-red-400',
      badgeBg: 'bg-red-900/60', badgeText: 'text-red-300', badgeBorder: 'border-red-500/40',
      signal: 'Action required',
    },
  }
  const s = toneStyles[status.tone] ?? toneStyles.warn
  const isLight = theme === 'light'
  return (
    <div className={`rounded-2xl border ${s.border} ${isLight ? s.bgLight : s.bg} shadow-lg p-4 md:p-5`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 shrink-0 h-2.5 w-2.5 rounded-full ${s.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <div className={`text-xl font-bold tracking-tight ${isLight ? s.labelColorLight : s.labelColor}`}>{status.label}</div>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.badgeBg} ${s.badgeText} ${s.badgeBorder}`}>
              {s.signal}
            </span>
          </div>
          {/* V26: Dollar sign via CSS ::before — cannot be stripped by browser extensions */}
          <p className={`${isLight ? "text-slate-800" : "text-slate-200"} text-sm leading-relaxed`}>
            {status.explanation.split(/(\$[\d,]+\.\d{2})/g).map((part, i) =>
              /^\$[\d,]+\.\d{2}$/.test(part)
                ? <span key={i} className="flow-dollar">{part.slice(1)}</span>
                : part
            )}
          </p>
          {status.context && (
            <p className={`mt-2 text-xs leading-relaxed border-t pt-2 ${isLight ? "text-slate-600 border-slate-300/80" : "text-slate-400 border-slate-700/60"}`}>{status.context}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Shared UI primitives imported from ./components/ui ────────────────────────
// Card, Pill, Metric, Info, ActionCard, Row

// ── V9.6 CSV Import Modal ─────────────────────────────────────────────────────

interface CsvImportModalProps {
  preview: ImportPipelineResult | null
  loading: boolean
  error: string
  accounts: Account[]
  categories: Category[]
  importAccountId: string
  importMonth: string
  isAppleCard: boolean
  categoryHints: Record<string, string>
  hintRules: { id: string; matchText: string; matchField: string; categoryId: string }[]
  hintCategories: { id: string; name: string }[]
  hintMemory: Record<string, string>
  isPdf: boolean
  pdfRows: PdfImportRow[]
  pdfWarning: string
  preset: ImportPreset
  columnMapping: Record<string, string> | null
  onImportAccountChange: (id: string) => void
  onImportMonthChange: (month: string) => void
  onPresetChange: (preset: ImportPreset) => void
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  onCommit: () => void
  onCommitPdf: () => void
  onCancel: () => void
  onDownloadSample: () => void
  onUseSampleData: () => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onResetPreview: () => void
}

function CsvImportModal({
  preview, loading, error, accounts,
  importAccountId, importMonth, isAppleCard, categoryHints,
  hintRules, hintCategories, hintMemory,
  isPdf, pdfRows, pdfWarning,
  preset, columnMapping,
  onImportAccountChange, onImportMonthChange, onPresetChange,
  onFileSelect, onDrop,
  onCommit, onCommitPdf, onCancel, onDownloadSample, onUseSampleData, fileInputRef, onResetPreview,
}: CsvImportModalProps) {
  const [dragOver, setDragOver] = useState(false)

  // ESC key closes modal
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onCancel])

  const effectiveAccount = accounts.find(a => a.id === importAccountId) ?? accounts[0]
  const noAccounts = accounts.length === 0

  return (
    // Backdrop: click outside panel to close
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 px-4 pb-8 bg-black/70 overflow-y-auto"
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}
    >
      {/* Panel */}
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col" onMouseDown={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-100">Import CSV / PDF</h2>
              {isPdf && (
                <span className="text-[10px] bg-blue-900/50 text-blue-300 border border-blue-700/30 px-1.5 py-0.5 rounded font-medium">PDF mode</span>
              )}
              {isAppleCard && !isPdf && (
                <span className="text-[10px] bg-slate-700 text-slate-300 border border-slate-600 px-1.5 py-0.5 rounded font-medium">Apple Card detected</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Import transactions from a bank or financial export.</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-200 text-xl leading-none px-2">×</button>
        </div>

        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* V9.6 — Account + Month selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Import to Account <span className="text-red-400">*</span></label>
              {noAccounts ? (
                <p className="text-xs text-amber-300 bg-amber-900/20 border border-amber-700/30 rounded px-2 py-1.5">Add an account first before importing.</p>
              ) : (
                <select
                  value={(importAccountId || accounts[0]?.id) ?? ''}
                  onChange={e => onImportAccountChange(e.target.value)}
                  className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                >
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.type})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Import Month</label>
              <input
                type="month"
                value={importMonth}
                onChange={e => onImportMonthChange(e.target.value)}
                className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* V35 — Bank selector with export instructions */}
          <BankSelector
            selected={preset ?? 'generic-csv'}
            onSelect={p => onPresetChange(p)}
          />

          {effectiveAccount && (
            <div className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-xs text-slate-400 flex items-center gap-2">
              <span>Importing to:</span>
              <span className="text-slate-200 font-medium">{effectiveAccount.name}</span>
              <span className="text-slate-600">·</span>
              <span>{effectiveAccount.type}</span>
              {effectiveAccount.type === 'credit card' && (
                <span className="ml-auto text-[10px] bg-purple-900/40 text-purple-300 border border-purple-700/30 px-1.5 py-0.5 rounded">
                  CC amount rules apply
                </span>
              )}
            </div>
          )}

          {/* Drop zone (only shown before preview) */}
          {!preview && !isPdf && !loading && (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${dragOver ? 'border-blue-500 bg-blue-900/20' : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'}`}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { setDragOver(false); onDrop(e) }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="text-4xl mb-3">📄</div>
              <p className="text-slate-200 font-medium mb-1">Drop a CSV or PDF file here</p>
              <p className="text-slate-400 text-sm mb-3">or click to browse</p>
              <div className="inline-flex items-center gap-1.5 text-[11px] text-violet-300 bg-violet-900/25 border border-violet-700/40 px-3 py-1 rounded-full mb-2">
                <span>✦</span>
                <span>PDFs parsed by AI — works with any bank statement</span>
              </div>
              <p className="text-slate-600 text-[10px]">CSV or PDF · Apple Card, Chase, BofA, Wells Fargo, and more</p>
              <input type="file" accept=".csv,.pdf,text/csv,text/plain,application/pdf" className="hidden" onChange={onFileSelect} ref={fileInputRef} />
            </div>
          )}

          {loading && <div className="text-center py-8 space-y-2"><div className="text-slate-400">{isPdf ? '✦ AI is reading your PDF…' : 'Parsing CSV…'}</div>{isPdf && <div className="text-xs text-slate-600">Gemini is extracting transactions from your statement</div>}</div>}

          {error && (
            <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          {/* V9.9 — PDF preview section */}
          {isPdf && !loading && pdfRows.length > 0 && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-center">
                  <div className="text-xs text-slate-400 mb-0.5">Detected</div>
                  <div className="text-xl font-bold text-blue-300">{pdfRows.length}</div>
                </div>
                <div className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-center">
                  <div className="text-xs text-slate-400 mb-0.5">Ready</div>
                  <div className="text-xl font-bold text-green-400">{pdfRows.filter(r => !r.isDup).length}</div>
                </div>
                <div className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-center">
                  <div className="text-xs text-slate-400 mb-0.5">Duplicates</div>
                  <div className={`text-xl font-bold ${pdfRows.filter(r => r.isDup).length > 0 ? 'text-amber-300' : 'text-slate-400'}`}>{pdfRows.filter(r => r.isDup).length}</div>
                </div>
              </div>
              {pdfWarning && (
                <p className="text-xs text-amber-300 bg-amber-900/20 border border-amber-700/30 rounded px-3 py-2">{pdfWarning}</p>
              )}
              <p className="text-xs text-slate-400">
                Review detected transactions. All will be marked <span className="font-medium text-slate-300">Needs Review</span> for category assignment after import.{' '}
                <button onClick={onResetPreview} className="underline text-blue-400 hover:text-blue-300">Choose a different file</button>
              </p>
              <div className="overflow-y-auto max-h-64 rounded-lg border border-slate-700/60">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-800 z-10">
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="py-1.5 px-2 font-medium whitespace-nowrap">Date</th>
                      <th className="py-1.5 px-2 font-medium">Merchant</th>
                      <th className="py-1.5 px-2 font-medium text-right whitespace-nowrap">Amount</th>
                      <th className="py-1.5 px-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {pdfRows.map((row, i) => (
                      <tr key={i} className={`border-b border-slate-800 ${row.isDup ? 'opacity-50' : 'hover:bg-slate-800/40'}`}>
                        <td className="py-1 px-2 text-slate-300 whitespace-nowrap">{row.date}</td>
                        <td className="py-1 px-2 text-slate-200 max-w-[180px] truncate">{normalizeMerchant(row.merchant)}</td>
                        <td className="py-1 px-2 text-right text-slate-300">${row.amount.toFixed(2)}</td>
                        <td className="py-1 px-2">
                          {row.isDup
                            ? <span className="text-[10px] text-amber-400 bg-amber-900/30 border border-amber-700/30 px-1 py-0.5 rounded">Duplicate</span>
                            : <span className="text-[10px] bg-green-900/60 text-green-300 border border-green-700/40 px-1.5 py-0.5 rounded">New</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PDF parse failure */}
          {isPdf && !loading && pdfRows.length === 0 && !error && (
            <div className="rounded-lg border border-amber-700/40 bg-amber-900/15 px-4 py-4 text-sm text-amber-300 text-center space-y-2">
              <p className="font-medium">PDF statement parsing is still experimental.</p>
              <p className="text-xs text-amber-400/80">{pdfWarning || 'This file could not be parsed automatically yet.'}</p>
              <p className="text-xs text-slate-400 mt-1">Try a CSV export or an "Accessible PDF" export from your bank. Chase: Accounts → Statements → Accessible PDF.</p>
              <button onClick={onResetPreview} className="text-xs text-blue-400 hover:text-blue-300 underline mt-1">Try a different file</button>
            </div>
          )}

          {!preview && !loading && (
            <div className="flex gap-3 flex-wrap text-xs">
              <button onClick={onDownloadSample} className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Download sample CSV</button>
              <span className="text-slate-600">·</span>
              <button onClick={onUseSampleData} className="text-blue-400 hover:text-blue-300 underline underline-offset-2">Preview sample data</button>
            </div>
          )}

          {preview && !loading && (
            <div className="space-y-3">
              {/* Summary counts */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-center">
                  <div className="text-xs text-slate-400 mb-0.5">Ready</div>
                  <div className="text-xl font-bold text-green-400">{preview.readyCount}</div>
                </div>
                <div className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-center">
                  <div className="text-xs text-slate-400 mb-0.5">Duplicates</div>
                  <div className={`text-xl font-bold ${preview.duplicateCount > 0 ? 'text-amber-300' : 'text-slate-400'}`}>{preview.duplicateCount}</div>
                </div>
                <div className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2.5 text-center">
                  <div className="text-xs text-slate-400 mb-0.5">Invalid</div>
                  <div className={`text-xl font-bold ${preview.invalidCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>{preview.invalidCount}</div>
                </div>
              </div>

              {preview.duplicateCount > 0 && (
                <p className="text-xs text-amber-300/80">
                  Duplicates compared against {effectiveAccount?.name ?? 'selected account'} only. Matching transactions on other accounts are not flagged.
                </p>
              )}

              {/* V9.10 — Column mapping preview */}
              {columnMapping && Object.keys(columnMapping).length > 0 && (
                <details className="text-xs">
                  <summary className="text-slate-500 cursor-pointer hover:text-slate-300 transition-colors">Column mapping detected ▸</summary>
                  <div className="mt-2 rounded-lg bg-slate-800/60 border border-slate-700/40 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1">
                    {Object.entries(columnMapping).map(([field, col]) => col ? (
                      <div key={field} className="flex items-center justify-between">
                        <span className="text-slate-500 capitalize">{field.replace(/_/g, ' ')}</span>
                        <span className="text-slate-300 font-medium truncate max-w-[120px]">{String(col)}</span>
                      </div>
                    ) : null)}
                  </div>
                </details>
              )}
              {preview.readyCount === 0 && (
                <p className="text-xs text-red-300">No importable rows — all are duplicates or invalid. Check your CSV format.</p>
              )}

              {preview.readyCount > 0 && (
                <>
                  <p className="text-xs text-slate-400">
                    Rule matching, type inference, and category hints applied. Click{' '}
                    <span className="font-medium text-slate-300">Import Transactions</span> to commit, or{' '}
                    <button onClick={onResetPreview} className="underline text-blue-400 hover:text-blue-300">choose a different file</button>.
                  </p>

                  {/* Upgraded preview table */}
                  <div className="overflow-y-auto max-h-64 rounded-lg border border-slate-700/60">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-slate-800 z-10">
                        <tr className="text-left text-slate-400 border-b border-slate-700">
                          <th className="py-1.5 px-2 font-medium whitespace-nowrap">Date</th>
                          <th className="py-1.5 px-2 font-medium">Merchant</th>
                          <th className="py-1.5 px-2 font-medium text-right whitespace-nowrap">Amount</th>
                          <th className="py-1.5 px-2 font-medium">Cat. Hint</th>
                          <th className="py-1.5 px-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        {(preview.importRows as Array<{ date?: string; merchant?: string; description?: string; amount?: number; type?: string }>).map((row, i) => {
                          const rawMerchant = row.merchant ?? row.description ?? ''
                          const amtKey      = `${row.date ?? ''}|${rawMerchant.toLowerCase()}|${Math.abs(row.amount ?? 0).toFixed(2)}`
                          const csvHint     = categoryHints[amtKey] ?? ''
                          const normalized  = normalizeMerchant(rawMerchant)
                          const hint        = resolveHint(normalized, csvHint, hintRules, hintCategories, hintMemory)
                          const isPayment   = /payment|transfer|zelle|venmo|paypal/i.test(rawMerchant)
                          const confBadge   = hint?.confidence === 'high'
                            ? 'bg-green-900/50 text-green-300 border-green-700/40'
                            : hint?.confidence === 'medium'
                              ? 'bg-blue-900/40 text-blue-300 border-blue-700/30'
                              : 'bg-slate-700/60 text-slate-400 border-slate-600/40'
                          const srcLabel    = hint?.source === 'rule' ? '⚡rule' : hint?.source === 'memory' ? '◎mem' : 'csv'
                          return (
                            <tr key={i} className={`border-b border-slate-800 ${isPayment ? 'bg-amber-950/10' : 'hover:bg-slate-800/40'}`}>
                              <td className="py-1 px-2 text-slate-300 whitespace-nowrap">{row.date ?? '—'}</td>
                              <td className="py-1 px-2 text-slate-200 max-w-[130px] truncate">
                                {normalized || '—'}
                                {isPayment && (
                                  <span className="ml-1 text-[9px] text-amber-400">
                                    {effectiveAccount?.type === 'credit card' ? 'CC Payment?' : 'Transfer?'}
                                  </span>
                                )}
                              </td>
                              <td className="py-1 px-2 text-right text-slate-300 whitespace-nowrap">
                                {row.amount != null ? `$${Math.abs(row.amount).toFixed(2)}` : '—'}
                              </td>
                              <td className="py-1 px-2">
                                {hint ? (
                                  <span className={`text-[9px] border px-1.5 py-0.5 rounded font-medium ${confBadge}`} title={`Source: ${hint.source}`}>
                                    {hint.categoryName} <span className="opacity-60">{srcLabel}</span>
                                  </span>
                                ) : csvHint ? (
                                  <span className="text-[9px] text-slate-500">{csvHint}</span>
                                ) : null}
                              </td>
                              <td className="py-1 px-2">
                                <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-green-900/60 text-green-300 border border-green-700/40">New</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-5 border-t border-slate-700 flex-wrap">
          <div className="flex gap-2">
            <button onClick={onCancel} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm transition-colors">Cancel</button>
            {(preview || isPdf) && (
              <button onClick={onResetPreview} className="rounded-lg bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm text-slate-400 transition-colors border border-slate-700">
                Different file
              </button>
            )}
          </div>
          {isPdf && pdfRows.filter(r => !r.isDup).length > 0 && !noAccounts && (
            <button onClick={onCommitPdf} className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-medium transition-colors">
              Import {pdfRows.filter(r => !r.isDup).length} transaction{pdfRows.filter(r => !r.isDup).length !== 1 ? 's' : ''} from PDF → {effectiveAccount?.name ?? 'account'}
            </button>
          )}
          {!isPdf && preview && preview.readyCount > 0 && !noAccounts && (
            <button onClick={onCommit} className="rounded-lg bg-blue-600 hover:bg-blue-500 px-5 py-2 text-sm font-medium transition-colors">
              Import {preview.readyCount} transaction{preview.readyCount !== 1 ? 's' : ''} → {effectiveAccount?.name ?? 'account'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}