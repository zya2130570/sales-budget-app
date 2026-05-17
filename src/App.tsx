import { useEffect, useMemo, useRef, useState } from 'react'
import type { Tab, Period, CategoryType, Category, ScenarioName, SavedBudget, SavedScenarioSet, BudgetSnapshot, Contribution, Target, SavedTargetSet, AccountType, Account, TransactionType, Transaction, TransactionRule, ImportBatch, ImportPreset } from './types'

import { currency, labelPeriod, formatDate } from './utils/formatting'
import {
  BASE_SALARY,
  HOURS_PER_WEEK,
  BUMP_THRESHOLDS,
  scenarioDefaults,
  convertFromMonthly,
  convertToMonthly,
  remainingTierFromPeriodValue,
  income,
  estimateTaxBreakdown,
  computeTargetStatus,
  requiredForTarget,
  computeDashboardStatus,
} from './utils/calculations'
import type { DashboardStatus } from './utils/calculations'
import {
  loadTab,
  loadPeriod,
  loadCategories,
  loadSavedBudgets,
  loadSavedScenarios,
  loadTargets,
  loadSavedTargetSets,
  loadAccounts,
  loadTransactions,
  loadTransactionRules,
  saveTab,
  savePeriod,
  saveCategories,
  saveSavedBudgets,
  saveSavedScenarios,
  saveTargets,
  saveSavedTargetSets,
  saveAccounts,
  saveTransactions,
  saveTransactionRules,
  runMigrations,
} from './utils/storage'
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
  computeNetWorth, computeBalanceCheckData, computeReconciliationData, RECON_THRESHOLD,
} from './utils/accountMath'
import type { BalanceCheckEntry, ReconciliationEntry } from './utils/accountMath'
import {
  cadenceMult,
  projectManualItems, projectRecurringCandidates,
} from './utils/forecastMath'
import type { RecurringCadence, ManualRecurringItem, ForecastLineItem } from './utils/forecastMath'
// V10.3 — extracted UI components and helpers
import { Card, Pill, Metric, Info, ActionCard, Row } from './components/ui'
import { txNeedsReview, txConfidence } from './utils/transactionHelpers'
import { TXN_TYPE_LABELS, TXN_FILTER_OPTIONS } from './utils/transactionHelpers'
import { TransactionsTab } from './components/TransactionsTab'

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

// ── V9.7 Recurring detection ──────────────────────────────────────────────────
// RecurringCadence, ManualRecurringItem, ForecastLineItem types imported from forecastMath.ts
// ForecastItem alias for backward compatibility within this file
type ForecastItem = ForecastLineItem

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
const tabTips: Record<Tab, string> = {
  Dashboard:    'See your take-home pay, leftover money, warnings, and log savings from each paycheck.',
  Income:       'Change gross profit to see how your paycheck and commission change.',
  Budget:       'Plan your spending, savings, and investing.',
  Accounts:     'Track your bank accounts, credit cards, and investment accounts.',
  Transactions: 'Log and review manual transactions across your accounts.',
  Scenarios:    'Compare different income levels like slow, medium, fast, or custom.',
  Targets:      'Set savings goals, deadlines, and track what you actually save. Use goal cards to log contributions and monitor progress.',
}

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
  const incomeRef = useRef<HTMLInputElement>(null)
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

  const [tab, setTab] = useState<Tab>('Dashboard')
  const [period, setPeriod] = useState<Period>('weekly')
  const [gpInput, setGpInput] = useState('0')
  const [categories, setCategories] = useState<Category[]>([])
  const [scenario, setScenario] = useState<Record<ScenarioName, number>>(scenarioDefaults)
  const [savedBudgets, setSavedBudgets] = useState<SavedBudget[]>([])
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioSet[]>([])

  // ══════════════════════════════════════════════════════════════════════════════
  // V10 ARCHITECTURE — SCENARIO ENGINE
  // Scenarios: what-if salary/expense adjustments on top of base income model
  // savedScenarios[], activeScenario → scenario income/budget overlay
  // V9.13 expansion: additional scenario parameters
  // ══════════════════════════════════════════════════════════════════════════════
  // V9.13 — Scenario engine expansion
  const [scenarioNotes, setScenarioNotes] = useState<Record<string, string>>({}) // keyed by savedScenario name
  const [editingScenarioName, setEditingScenarioName] = useState<string | null>(null)
  const [renameScenarioValue, setRenameScenarioValue] = useState('')
  const [scenarioStressMode, setScenarioStressMode] = useState<'none' | 'commission-25' | 'commission-50' | 'extra-expense' | 'higher-bills'>('none')
  const [showStressTest, setShowStressTest] = useState(false)
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
  const [scenarioTitle, setScenarioTitle] = useState('')
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
  const [actuals, setActuals] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem('flow_actuals')
      return raw ? (JSON.parse(raw) as Record<string, string>) : {}
    } catch {
      return {}
    }
  })

  // Persist actuals — save effect defined after lazy init; no ordering race
  useEffect(() => {
    try { localStorage.setItem('flow_actuals', JSON.stringify(actuals)) } catch { /* ignore */ }
  }, [actuals])

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

  // Collapsible sections for Fully Funded and Completed
  const [fullyFundedOpen, setFullyFundedOpen] = useState(true)
  const [completedOpen, setCompletedOpen] = useState(true)

  // Track which targets have already been shown the deadline-passed popup
  const [deadlinePassedPrompted, setDeadlinePassedPrompted] = useState<Set<string>>(new Set())

  // Track which goal cards have expanded details visible
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  // Toast notification state — optional onUndo for undoable clear/reset actions
  const [toast, setToast] = useState<{ message: string; visible: boolean; onUndo?: () => void } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, visible: true })
    toastTimerRef.current = setTimeout(() => setToast(null), 5000)
  }
  const showUndoableToast = (message: string, onUndo: () => void) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, visible: true, onUndo })
    toastTimerRef.current = setTimeout(() => setToast(null), 5000)
  }

  // Refs for edit-mode fields inside target cards
  const editCurrentSavedRef = useRef<HTMLInputElement>(null)
  const editStartDateRef = useRef<HTMLInputElement>(null)
  const editDeadlineRef = useRef<HTMLInputElement>(null)
  const editStartDateArrowCount = useRef(0)
  const editDeadlineArrowCount = useRef(0)
  const editStartDateLeftArrowCount = useRef(0)
  const editDeadlineLeftArrowCount = useRef(0)
  // Blur-save timer: delays save so focus moving between edit fields doesn't trigger premature save
  const editBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const inlineEditBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // V9.0 — CSV import state
  const [csvImportOpen, setCsvImportOpen]       = useState(false)
  const [csvImportPreview, setCsvImportPreview] = useState<ImportPipelineResult | null>(null)
  const [csvImportLoading, setCsvImportLoading] = useState(false)
  const [csvImportError, setCsvImportError]     = useState('')
  const csvFileInputRef                         = useRef<HTMLInputElement>(null)

  // V9.6 — Account-aware CSV import upgrade
  const [csvImportAccountId, setCsvImportAccountId]   = useState('')
  const [csvImportMonth, setCsvImportMonth]           = useState(() => {
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [csvIsAppleCard, setCsvIsAppleCard]           = useState(false)
  const [csvCategoryHints, setCsvCategoryHints]       = useState<Record<string, string>>({})
  const [importBatches, setImportBatches]             = useState<ImportBatch[]>([])
  const [csvShowHistory, setCsvShowHistory]           = useState(false)
  // V9.10 — Import preset and column mapping preview
  const [csvImportPreset, setCsvImportPreset]         = useState<ImportPreset>('auto')
  const [csvColumnMapping, setCsvColumnMapping]       = useState<Record<string, string> | null>(null)
  // V9.10 — Batch deletion confirmation
  const [batchToDelete, setBatchToDelete]             = useState<string | null>(null)
  // V9.11 — Budget evolution state
  const [categoryRollovers, setCategoryRollovers]     = useState<Record<string, boolean>>({})
  const [budgetFilter, setBudgetFilter]               = useState<'all' | 'over-budget' | 'no-activity'>('all')
  // V9.11 — Uncategorized expenses collapsible (default open)
  const [uncatOpen, setUncatOpen]                     = useState(true)
  // V9.11 — Delete all duplicates confirmation
  const [deleteDupsConfirm, setDeleteDupsConfirm]     = useState(false)
  // V9.12 — Goal priority + pause state
  const [goalPriorities, setGoalPriorities]           = useState<Record<string, 'high' | 'medium' | 'low'>>({})
  const [pausedGoals, setPausedGoals]                 = useState<Set<string>>(new Set())
  // V9.12 — Delete filtered transactions confirmation
  const [deleteFilteredConfirm, setDeleteFilteredConfirm] = useState(false)
  // V9.9 — PDF import state (parallel to CSV flow)
  const [csvImportIsPdf, setCsvImportIsPdf]           = useState(false)
  const [pdfPreviewRows, setPdfPreviewRows]           = useState<PdfImportRow[]>([])
  const [pdfParseWarning, setPdfParseWarning]         = useState('')

  // V9.14 — Soft-delete: recently deleted transactions (recoverable within session)
  const [deletedTxns, setDeletedTxns]               = useState<Transaction[]>([])
  const [showRecentlyDeleted, setShowRecentlyDeleted] = useState(false)
  // V9.5 — Review Center open/collapsed
  const [reviewOpen, setReviewOpen]                 = useState(true)

  // Soft-delete helper: moves transaction to deletedTxns instead of permanent removal
  const softDeleteTxn = (txId: string) => {
    const tx = transactions.find(t => t.id === txId)
    if (!tx) return
    setTxnWithHistory(prev => prev.filter(t => t.id !== txId))
    setDeletedTxns(prev => [{ ...tx }, ...prev.slice(0, 29)]) // keep last 30
  }
  const restoreDeletedTxn = (txId: string) => {
    const tx = deletedTxns.find(t => t.id === txId)
    if (!tx) return
    setTxnWithHistory(prev => [tx, ...prev])
    setDeletedTxns(prev => prev.filter(t => t.id !== txId))
    showToast(`Restored "${tx.merchant}".`)
  }
  const permanentlyDeleteTxn = (txId: string) => {
    setDeletedTxns(prev => prev.filter(t => t.id !== txId))
  }
  const [selectedTxnIds, setSelectedTxnIds]     = useState<Set<string>>(new Set())
  const [bulkCategoryId, setBulkCategoryId]     = useState('')
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
  const [manualRecurringItems, setManualRecurringItems] = useState<ManualRecurringItem[]>([])
  const [showAddRecurring, setShowAddRecurring]         = useState(false)
  const [recurringForm, setRecurringForm]               = useState<{
    name: string; amount: string; cadence: RecurringCadence; nextDueDate: string; type: 'expense' | 'income'
  }>({ name: '', amount: '', cadence: 'monthly', nextDueDate: new Date().toISOString().slice(0, 10), type: 'expense' })
  // V9.8 — Cash Flow Forecast period in days
  const [forecastPeriod, setForecastPeriod]             = useState<7 | 14 | 30 | 60>(30)
  // V9.9 — Monthly Review
  const [reviewMonth, setReviewMonth]     = useState(() => {
    try { const s = localStorage.getItem('flow_review_month'); if (s) return s } catch { /* ignore */ }
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [monthlyNotes, setMonthlyNotes]   = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem('flow_monthly_notes'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  const [reviewedMonths, setReviewedMonths] = useState<Record<string, string>>(() => {
    try { const s = localStorage.getItem('flow_reviewed_months'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  // V9.7 — Rule suggestion after category assign from Review Center
  const [ruleSuggestion, setRuleSuggestion]       = useState<{
    merchants: string[]; categoryId: string; txIds: string[]
  } | null>(null)
  // V9.7 — Shift-click multi-select in Review Center
  const lastReviewSelectIdxRef = useRef<number>(-1)
  // V9.7.1 — Collapsible main transaction list
  const [txnListOpen, setTxnListOpen]             = useState(true)

  // V9.0.1 — Back to top
  const [showScrollTop, setShowScrollTop] = useState(false)

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
  // All persisted to localStorage via useEffect save effects below.
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
    const savedTab = loadTab(); if (savedTab) setTab(savedTab)
    const savedPeriod = loadPeriod(); if (savedPeriod) setPeriod(savedPeriod)
    const c = loadCategories(); if (c) setCategories(c)
    const b = loadSavedBudgets(); if (b) setSavedBudgets(b)
    const s = loadSavedScenarios(); if (s) setSavedScenarios(s)
    try { const sn = localStorage.getItem('flow_scenario_notes'); if (sn) setScenarioNotes(JSON.parse(sn)) } catch { /* ignore */ }
    const t = loadTargets(); if (t) setTargets(t)
    const ts = loadSavedTargetSets(); if (ts) setSavedTargetSets(ts)
    const ac = loadAccounts(); if (ac) setAccounts(ac)
    const tx = loadTransactions(); if (tx) setTransactions(tx)
    const rl = loadTransactionRules(); if (rl) setRules(rl)
  }, [])
  useEffect(() => saveTab(tab), [tab])
  useEffect(() => savePeriod(period), [period])
  useEffect(() => saveCategories(categories), [categories])
  useEffect(() => saveSavedBudgets(savedBudgets), [savedBudgets])
  useEffect(() => saveSavedScenarios(savedScenarios), [savedScenarios])
  // V9.13 — persist scenario notes
  useEffect(() => {
    try { localStorage.setItem('flow_scenario_notes', JSON.stringify(scenarioNotes)) } catch { /* ignore */ }
  }, [scenarioNotes])
  useEffect(() => saveTargets(targets), [targets])
  useEffect(() => saveSavedTargetSets(savedTargetSets), [savedTargetSets])
  useEffect(() => saveAccounts(accounts), [accounts])
  useEffect(() => saveTransactions(transactions), [transactions])
 useEffect(() => saveTransactionRules(rules), [rules])
  // V10.0 — Persist category memory
  useEffect(() => saveCategoryMemory(categoryMemory), [categoryMemory])
  // V9.9.1 — Monthly Review persistence
  useEffect(() => { try { localStorage.setItem('flow_review_month', reviewMonth) } catch { /* ignore */ } }, [reviewMonth])
  useEffect(() => { try { localStorage.setItem('flow_monthly_notes', JSON.stringify(monthlyNotes)) } catch { /* ignore */ } }, [monthlyNotes])
  useEffect(() => { try { localStorage.setItem('flow_reviewed_months', JSON.stringify(reviewedMonths)) } catch { /* ignore */ } }, [reviewedMonths])

  // V9.0.1 — Back-to-top: show button once user scrolls down 400px
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 400)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // V8.7 — auto-select the only account in the transaction form
  useEffect(() => {
    if (accounts.length === 1) {
      setTxnForm(prev => ({ ...prev, accountId: accounts[0].id }))
    }
  }, [accounts.length, accounts[0]?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Tab focus — only Income gets autofocus; other tabs are too disruptive
  useEffect(() => {
    if (tab === 'Income') incomeRef.current?.focus()
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
  // Rollover: categoryRollovers state (flag stored, calc TBD)
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
  const budgetHealth = useMemo(() => {
    const overBudget   = categories.filter(c => { const e = effectiveCatActual(c.id); return e !== null && e.total > convertFromMonthly(c.amount, period) })
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
    () => computeNetWorth(accounts, computedAccountBalances),
    [accounts, computedAccountBalances]
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
    if (a.type !== 'credit card') return false  // non-CC never shows unexplained without baseline
    const bc = balanceCheckData[a.id]
    return bc ? !bc.isMatched : false
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
  // cadenceMult imported from utils/forecastMath
  const manualMonthlyExpenses = manualRecurringItems
    .filter(i => i.type === 'expense')
    .reduce((s, i) => s + i.amount * cadenceMult(i.cadence), 0)
  const estimatedMonthlyRecurring = recurringCandidates
    .filter(c => c.confidence === 'high' || confirmedRecurring.has(c.merchantKey))
    .reduce((s, c) => s + c.estimatedMonthlyAmount, 0) + manualMonthlyExpenses

  // V9.8 — Cash Flow Forecast (projection helpers extracted to utils/forecastMath)
  const cashFlowForecast = useMemo(() => {
    const today    = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const end      = new Date(today.getTime() + forecastPeriod * 86_400_000)
    const endStr   = end.toISOString().slice(0, 10)
    const startingCash = netWorthSummary.totalCash

    // Project recurring items using extracted pure helpers
    const confirmedCandidates = recurringCandidates.filter(
      rc => rc.confidence === 'high' || confirmedRecurring.has(rc.merchantKey)
    )
    const items: ForecastItem[] = [
      ...projectManualItems(manualRecurringItems, todayStr, end),
      ...projectRecurringCandidates(confirmedCandidates, todayStr, end),
    ].sort((a, b) => a.date.localeCompare(b.date))

    // Inject income-tab take-home estimate when no manual income items exist
    const hasManualIncome    = manualRecurringItems.some(i => i.type === 'income')
    const hasDetectedIncome  = confirmedCandidates.length > 0
    if (!hasManualIncome && !hasDetectedIncome && inc.totalMonthly > 0) {
      const estimatedIncome = inc.totalMonthly * (forecastPeriod / 30)
      const daysLabel = forecastPeriod === 7 ? '~1 week' : forecastPeriod === 14 ? '~2 weeks' : forecastPeriod === 30 ? '~1 month' : '~2 months'
      items.unshift({ date: todayStr, name: `Est. take-home (${daysLabel})`, amount: Math.round(estimatedIncome * 100) / 100, type: 'income', source: 'manual' })
    }

    const totalIncome   = items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0)
    const totalExpenses = items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
    const projectedEnd  = startingCash + totalIncome - totalExpenses
    const safeToSpend   = Math.max(0, projectedEnd - 250)
    const status: 'comfortable' | 'tight' | 'risk' =
      projectedEnd < 0 ? 'risk' : projectedEnd < 250 ? 'tight' : 'comfortable'
    return { items, startingCash, totalIncome, totalExpenses, projectedEnd, safeToSpend, status, todayStr, endStr }
  }, [forecastPeriod, netWorthSummary.totalCash, manualRecurringItems, recurringCandidates, confirmedRecurring, inc.totalMonthly])

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
    const unresolvedDups = txns.filter(t => txNeedsReview(t, transactions, dismissedDupIds) &&
      transactions.some(o => o.id !== t.id && o.merchant.toLowerCase() === t.merchant.toLowerCase() && o.amount === t.amount && o.date === t.date)
    ).length
    const recurringReviewed = recurringCandidates.length === 0 ||
      recurringCandidates.every(c => confirmedRecurring.has(c.merchantKey) || dismissedRecurring.has(c.merchantKey))

    return { txns, income, expenses, transfers, ccPayments, netCash, catBreakdown, bigTxns, uncatExpenses, unresolvedDups, recurringReviewed }
  }, [transactions, reviewMonth, categories, dismissedDupIds, recurringCandidates, confirmedRecurring, dismissedRecurring])

  const bulkAssign = () => {
    if (!bulkCategoryId || selectedTxnIds.size === 0) return
    const affectedTxns = transactions.filter(tx => selectedTxnIds.has(tx.id) && tx.type === 'expense')
    setTxnWithHistory(prev => prev.map(tx =>
      selectedTxnIds.has(tx.id) ? { ...tx, categoryId: bulkCategoryId } : tx
    ))
    // Offer rule creation for unique merchants without existing rules
    const uniqueMerchants = [...new Set(affectedTxns.map(tx => normalizeMerchant(tx.merchant)))]
      .filter(m => !rules.some(r => r.matchField === 'merchant' && r.categoryId === bulkCategoryId &&
        r.matchText.split(',').some(t => t.trim().toLowerCase() === m.toLowerCase())
      ))
    if (uniqueMerchants.length > 0) {
      setRuleSuggestion({ merchants: uniqueMerchants, categoryId: bulkCategoryId, txIds: [...selectedTxnIds] })
    }
    setSelectedTxnIds(new Set())
    setBulkCategoryId('')
    showToast(`Assigned category to ${selectedTxnIds.size} transaction${selectedTxnIds.size !== 1 ? 's' : ''}.`)
  }
  // Re-arm the glow whenever the count grows above the previous watermark
  if (uncategorizedExpenseCount > prevUncategorizedCountRef.current) {
    uncategorizedGlowSeenRef.current = false
  }
  prevUncategorizedCountRef.current = uncategorizedExpenseCount
  // Glow is active when there are uncategorized expenses and the pill hasn't been clicked yet
  const showUncategorizedGlow = uncategorizedExpenseCount > 0 && !uncategorizedGlowSeenRef.current

  const dashboardStatus: DashboardStatus = useMemo(() => {
    const base = computeDashboardStatus({
      totalMonthly: inc.totalMonthly,
      monthlyBudget,
      monthlyLeft,
      savingsRate,
      fixedRatio,
      commissionPct: inc.commissionPct,
      categories,
      activeTargets,
      period,
      budgetHealthTier: !hasBudgetData ? 'No Data' : selectedPeriodRemaining < 0 ? 'Over Budget' : remainingTier.label,
    })
    // Fix hardcoded "/month" wording to match selected period
    const periodWord = period === 'weekly' ? 'week' : period === 'bi-weekly' ? 'pay period' : period === 'yearly' ? 'year' : 'month'
    const periodExplanation = monthlyLeft < 0 && base.explanation.includes('/month')
      ? base.explanation
          .replace(/\$[\d,]+(\.\d+)?\/month/, `${currency(Math.abs(convertFromMonthly(monthlyLeft, period)))}/${periodWord}`)
      : base.explanation
    // If actuals show meaningful overspend, surface it in the dashboard explanation
    if (actualOverspendPct > 5 && base.tone !== 'danger') {
      const severity: DashboardStatus['tone'] = actualOverspendPct > 20 ? 'risk' : 'warn'
      const toneOrder: DashboardStatus['tone'][] = ['excellent', 'good', 'warn', 'risk', 'danger']
      const baseIdx = toneOrder.indexOf(base.tone)
      const sevIdx  = toneOrder.indexOf(severity)
      return {
        ...base,
        explanation: periodExplanation,
        tone: sevIdx > baseIdx ? severity : base.tone,
        context: `Actuals are running ${actualOverspendPct.toFixed(0)}% over plan this period. ${base.context}`,
      }
    }
    return { ...base, explanation: periodExplanation }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inc.totalMonthly, monthlyBudget, monthlyLeft, savingsRate, fixedRatio, inc.commissionPct, categories, activeTargets, period, hasBudgetData, selectedPeriodRemaining, remainingTier.label, actualOverspendPct])

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
    const rawBalance = parseFloat(inlineAccountEditForm.balance) || 0
    // Credit cards: positive input saves as negative (debt convention)
    const balance = inlineAccountEditForm.type === 'credit card' && rawBalance > 0 ? -rawBalance : rawBalance
    const institution = inlineAccountEditForm.institution.trim()
    setAccountsWithHistory(prev => prev.map(a => a.id === accountId
      ? { ...a, name, type: inlineAccountEditForm.type, balance, institution }
      : a
    ))
    setInlineAccountEditId(null)
    showToast('Account updated.')
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
    const newStartingBalance = recon.actualBalance - recon.txnImpact
    setAccountsWithHistory(prev => prev.map(a => {
      if (a.id !== accountId) return a
      return {
        ...a,
        startingBalance: newStartingBalance,
        lastReconciledAt: now,
      } as Account & { startingBalance: number; lastReconciledAt: string }
    }))
    showToast('Account reconciled.')
  }
  const createOrSaveAccount = () => {
    const name = accountForm.name.trim()
    if (!name) { setTimedAccountHint('Enter an account name before adding.'); accountNameRef.current?.focus(); return }
    const rawBalance = parseFloat(accountForm.balance) || 0
    // Credit cards carry debt-style balances — always ≤ 0 (positive input inverted)
    const balance = accountForm.type === 'credit card' && rawBalance > 0 ? -rawBalance : rawBalance
    const institution = accountForm.institution.trim()
    if (editAccountId) {
      setAccountsWithHistory(prev => prev.map(a => a.id === editAccountId
        ? { ...a, name, type: accountForm.type, balance, institution }
        : a
      ))
      showToast('Account updated.')
    } else {
      setAccountsWithHistory(prev => [
        { id: crypto.randomUUID(), name, type: accountForm.type, balance, institution, createdAt: new Date().toISOString().slice(0, 10) },
        ...prev,
      ])
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
    const isDup = transactions.some(x =>
      x.merchant.toLowerCase() === merchant.toLowerCase() &&
      x.amount === amount &&
      x.date === txnForm.date
    )
    if (isDup && !txnDupWarning) {
      setTxnDupWarning(true)
      setTimedTxnHint('Possible duplicate — same merchant, amount, and date already exists. Click Add again to save anyway.')
      return
    }
    setTxnDupWarning(false)

    // Auto-fill category from rules; track which rule matched
    let autoCategoryId = txnForm.categoryId
    let matchedRuleId: string | undefined
    if (!txnForm.categoryId) {
      const mLower = normalizeAlias(merchant)
      const nLower = normalizeAlias(txnForm.notes)
      for (const rule of rules) {
        const haystack = rule.matchField === 'merchant' ? mLower : nLower
        if (matchesAnyAlias(haystack, rule.matchText)) {
          autoCategoryId = rule.categoryId
          matchedRuleId = rule.id
          break
        }
      }
    }

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

 setTxnWithHistory(prev => [
  {
    id: crypto.randomUUID(),
    date: txnForm.date,
    accountId: resolvedAccountId,
    merchant,
    amount,
    type: txnForm.type,
    categoryId: autoCategoryId || undefined,
    notes: txnForm.notes.trim() || undefined,
    toAccountId: txnForm.toAccountId || undefined,
    appliedByRule: matchedRuleId,
    createdAt: new Date().toISOString(),
    source: 'manual' as const,
  },
  ...prev,
])

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
    const isDup = transactions.some(x =>
      x.id !== inlineTxnEditId &&
      x.merchant.toLowerCase() === merchant.toLowerCase() &&
      x.amount === amount &&
      x.date === inlineTxnEditForm.date
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
    const categoryChangedManually =
      originalTx?.appliedByRule &&
      inlineTxnEditForm.categoryId !== (originalTx.categoryId ?? '')

    setTxnWithHistory(prev => prev.map(x => {
      if (x.id !== inlineTxnEditId) return x
      return {
        ...x,
        date: inlineTxnEditForm.date,
        accountId: inlineTxnEditForm.accountId,
        merchant,
        amount,
        type: inlineTxnEditForm.type,
        categoryId: inlineTxnEditForm.categoryId || undefined,
        notes: inlineTxnEditForm.notes.trim() || undefined,
        toAccountId: inlineTxnEditForm.toAccountId || undefined,
        // V8.6.1 — If user manually changed the category, strip rule ownership
        // so deleting the rule later won't clear this user-owned category.
        appliedByRule: categoryChangedManually ? undefined : x.appliedByRule,
      }
    }))
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

  // V8.5.2 — Case-insensitive, comma-separated alias matching.
  // Normalizes apostrophes (straight ' curly \u2019) so "McDonald's" matches "McDonald's",
  // "McDonalds", "mcdonalds", etc. Strips surrounding quotes/spaces, ignores empty fragments.
  const normalizeAlias = (s: string): string =>
    s.replace(/[\u2018\u2019\u02BC]/g, "'").toLowerCase()
  const matchesAnyAlias = (haystack: string, matchText: string): boolean => {
    const normHaystack = normalizeAlias(haystack)
    const normHaystackNoApos = normHaystack.replace(/'/g, '')
    const aliases = matchText
      .split(',')
      .map(a => a.replace(/^['"\u2018\u2019\s]+|['"\u2018\u2019\s]+$/g, ''))
      .filter(Boolean)
    return aliases.some(alias => {
      const normAlias = normalizeAlias(alias)
      const normAliasNoApos = normAlias.replace(/'/g, '')
      return normHaystack.includes(normAlias) || normHaystackNoApos.includes(normAliasNoApos)
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
    const newAliases = matchText.split(',').map(a => normalizeAlias(a.replace(/^['"\u2018\u2019\s]+|['"\u2018\u2019\s]+$/g, ''))).filter(Boolean)
    const newTypeIsAny = !ruleForm.type
    for (const existing of rules) {
      if (existing.matchField !== ruleForm.matchField) continue
      const existingAliases = existing.matchText.split(',').map(a => normalizeAlias(a.replace(/^['"\u2018\u2019\s]+|['"\u2018\u2019\s]+$/g, ''))).filter(Boolean)
      const hasOverlapAlias = newAliases.some(a => existingAliases.includes(a))
      if (!hasOverlapAlias) continue
      const existingTypeIsAny = !existing.type
      const typesOverlap = newTypeIsAny || existingTypeIsAny || ruleForm.type === existing.type
      if (!typesOverlap) continue
      if (existing.categoryId !== ruleForm.categoryId) {
        const overlapAlias = newAliases.find(a => existingAliases.includes(a)) ?? matchText
        setRuleHint(`This rule conflicts with an existing rule for "${overlapAlias}". Change the match text or choose the same category.`)
        return
      }
    }

    setRuleHint('')
    setRulesWithHistory(prev => [
      { id: crypto.randomUUID(), name, matchText, matchField: ruleForm.matchField, categoryId: ruleForm.categoryId, type: ruleForm.type || undefined, createdAt: new Date().toISOString() },
      ...prev,
    ])
    clearRuleForm()
    ruleNameRef.current?.focus()
  }
  const saveInlineRuleEdit = () => {
    if (!inlineRuleEditId) return
    const name = inlineRuleEditForm.name.trim()
    const matchText = inlineRuleEditForm.matchText.trim()
    if (!name || !matchText || !inlineRuleEditForm.categoryId) return

    // V8.5.2 — Conflict detection (exclude self)
    const newAliases = matchText.split(',').map(a => normalizeAlias(a.replace(/^['"\u2018\u2019\s]+|['"\u2018\u2019\s]+$/g, ''))).filter(Boolean)
    const newTypeIsAny = !inlineRuleEditForm.type
    for (const existing of rules) {
      if (existing.id === inlineRuleEditId) continue
      if (existing.matchField !== inlineRuleEditForm.matchField) continue
      const existingAliases = existing.matchText.split(',').map(a => normalizeAlias(a.replace(/^['"\u2018\u2019\s]+|['"\u2018\u2019\s]+$/g, ''))).filter(Boolean)
      const hasOverlapAlias = newAliases.some(a => existingAliases.includes(a))
      if (!hasOverlapAlias) continue
      const existingTypeIsAny = !existing.type
      const typesOverlap = newTypeIsAny || existingTypeIsAny || inlineRuleEditForm.type === existing.type
      if (!typesOverlap) continue
      if (existing.categoryId !== inlineRuleEditForm.categoryId) {
        const overlapAlias = newAliases.find(a => existingAliases.includes(a)) ?? matchText
        setRuleHint(`This rule conflicts with an existing rule for "${overlapAlias}". Change the match text or choose the same category.`)
        return
      }
    }

    setRulesWithHistory(prev => prev.map(r => r.id === inlineRuleEditId
      ? { ...r, name, matchText, matchField: inlineRuleEditForm.matchField, categoryId: inlineRuleEditForm.categoryId, type: inlineRuleEditForm.type || undefined }
      : r
    ))
    setInlineRuleEditId(null)
  }
  const cancelInlineRuleEdit = () => setInlineRuleEditId(null)
 const applyAllRules = () => {
    const activeRuleIds = new Set(rules.map(r => r.id))
    let count = 0
    setTxnWithHistory(prev => prev.map(tx => {
      // V8.6.1 — Strip stale badge AND category for deleted-rule transactions.
      // Only clears if the category is still rule-owned (appliedByRule points to
      // a deleted rule). User-manually-changed categories already have appliedByRule
      // cleared (via saveInlineTxnEdit), so they are untouched here.
      const isStaleRule = tx.appliedByRule && !activeRuleIds.has(tx.appliedByRule)
      const baseTx = isStaleRule
        ? { ...tx, categoryId: undefined, appliedByRule: undefined }
        : tx
      if (!overwriteCategories && baseTx.categoryId) return baseTx
      const mLower = normalizeAlias(baseTx.merchant)
      const nLower = normalizeAlias(baseTx.notes ?? '')
      for (const rule of rules) {
        const haystack = rule.matchField === 'merchant' ? mLower : nLower
        if (matchesAnyAlias(haystack, rule.matchText)) {
          if (baseTx.categoryId !== rule.categoryId) count++
          return { ...baseTx, categoryId: rule.categoryId, appliedByRule: rule.id }
        }
      }
      return baseTx
    }))
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
    setCategories(prev => [...prev, { id, name: tpl.name, amount: monthly, type: tpl.type }])
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
        ? { ...dupSrc, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
        : { id: crypto.randomUUID(), date, accountId, merchant, amount, type, categoryId, createdAt: new Date().toISOString() }
      )
    }
    const firstId = batch[0].id
    // Single undo entry for the whole batch
    setTxnWithHistory(prev => [...batch, ...prev])
    // Highlight the first generated row so the user knows where to look
    flashHighlight(firstId, setHighlightedTxnId, highlightTxnTimerRef)
    showToast(`${batch.length} sample transactions added.`)
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // V10 ARCHITECTURE — IMPORT ENGINE
  // CSV/PDF import pipeline: processCsvText → runImportPipeline → commitCsvImport
  // Hint resolution: resolveHint() → rule > memory > CSV category
  // Batch identity: every import creates an ImportBatch record.
  // ══════════════════════════════════════════════════════════════════════════════

  // ── V9.0 CSV Import handlers ──────────────────────────────────────────────────

  const openCsvImport = () => {
    setCsvImportOpen(true); setCsvImportPreview(null); setCsvImportError('')
    setCsvCategoryHints({}); setCsvIsAppleCard(false)
    setCsvImportIsPdf(false); setPdfPreviewRows([]); setPdfParseWarning('')
    setCsvColumnMapping(null)
  }
  const closeCsvImport = () => {
    setCsvImportOpen(false); setCsvImportPreview(null); setCsvImportError('')
    setCsvCategoryHints({}); setCsvIsAppleCard(false)
    setCsvImportIsPdf(false); setPdfPreviewRows([]); setPdfParseWarning('')
    setCsvColumnMapping(null)
  }
  const processCsvText = (text: string) => {
    setCsvImportLoading(true)
    setCsvImportError('')
    try {
      // Detect / normalize format based on preset or auto-detection
      const firstLine = text.split('\n')[0] ?? ''
      const isApple = csvImportPreset === 'apple-card' || (csvImportPreset === 'auto' && detectAppleCard(firstLine))
      const isPdfPreset = csvImportPreset === 'chase-pdf-experimental'
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
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result
      if (typeof text !== 'string') { setCsvImportError('Could not read PDF.'); setCsvImportLoading(false); return }
      const { rows, warning } = parsePdfText(text)
      const effectiveAccountId = csvImportAccountId || (accounts[0]?.id ?? '')
      const existingForAccount = transactions.filter(tx => tx.accountId === effectiveAccountId)
      // Mark duplicate rows
      const marked = rows.map(r => ({
        ...r,
        isDup: existingForAccount.some(tx =>
          tx.date === r.date &&
          tx.merchant.toLowerCase() === r.merchant.toLowerCase() &&
          tx.amount === r.amount
        ),
      }))
      setPdfPreviewRows(marked)
      setPdfParseWarning(warning)
      setCsvImportLoading(false)
    }
    reader.onerror = () => { setCsvImportError('Could not read the PDF file.'); setCsvImportLoading(false) }
    reader.readAsText(file)
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
      importedCategoryHint: 'pdf',
      createdAt: new Date().toISOString(),
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
    showUndoableToast(`Imported ${newTxns.length} transaction${newTxns.length !== 1 ? 's' : ''} to ${acct?.name ?? 'account'}.${dupNote}`, undoTxn)
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
      setCategories(prev => prev.map(c => c.id === editId ? { ...c, name: n, amount: monthlyAmt, type: form.type } : c))
      setEditId(null)
    } else {
      setCategories(prev => {
        const i = prev.findIndex(c => c.name.trim().toLowerCase() === n.toLowerCase() && c.type === form.type)
        if (i >= 0) { const cp = [...prev]; cp[i] = { ...cp[i], amount: cp[i].amount + monthlyAmt }; return cp }
        return [...prev, { id: crypto.randomUUID(), name: n, amount: monthlyAmt, type: form.type }]
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
    setCategories(prev => prev.map(c => c.id === inlineCatEditId ? { ...c, name: n, amount: monthlyAmt, type: inlineCatEditForm.type } : c))
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
    setTargetsWithHistory(prev => prev.map((t) => t.id === targetId
      ? { ...t, currentSaved: t.currentSaved + amount, contributions: [{ id: crypto.randomUUID(), amount, date, note }, ...t.contributions] }
      : t
    ))
  }

  const createTarget = () => {
    const name = targetForm.name.trim()
    const goalAmount = Number(targetForm.goalAmount) || 0
    const currentSaved = Number(targetForm.currentSaved) || 0
    const startDate = targetForm.startDate
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
    setTargetsWithHistory(prev => [
      { id: crypto.randomUUID(), name, goalAmount, currentSaved, startDate: startDate || today, deadline, createdAt: today, type: 'savings', contributions: [], completed: false },
      ...prev,
    ])
    setTargetFormHint('')
    setTargetForm({ name: '', goalAmount: '', currentSaved: '', startDate: new Date().toISOString().slice(0, 10), deadline: '' })
    setTimeout(() => targetNameRef.current?.focus(), 0)
  }

  const saveEditTarget = (targetId: string) => {
    const name = editTargetForm.name.trim()
    const goalAmount = Number(editTargetForm.goalAmount) || 0
    const currentSaved = Number(editTargetForm.currentSaved) || 0
    const startDate = editTargetForm.startDate
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
    setTargetsWithHistory(prev => prev.map(t => t.id === targetId
      ? { ...t, name, goalAmount, currentSaved, startDate, deadline }
      : t
    ))
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
    setTargetsWithHistory(prev => prev.map(x => {
      if (x.id !== editContributionTargetId) return x
      const oldContrib = x.contributions.find(k => k.id === editContributionId)
      const oldAmount = oldContrib ? oldContrib.amount : 0
      return {
        ...x,
        currentSaved: Math.max(0, x.currentSaved - oldAmount + newAmount),
        contributions: x.contributions.map(k => k.id === editContributionId
          ? { ...k, date: editContributionForm.date, amount: newAmount, note: editContributionForm.note }
          : k
        ),
      }
    }))
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
  const renderTargetCard = (t: Target) => {
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

    return (
      <Card
        key={t.id}
        title={
          <span className="flex items-center gap-1.5 flex-wrap">
            {isEditingTarget ? `Editing: ${t.name}` : t.name}
            {isPaused && <span className="text-[9px] bg-slate-600 text-slate-300 border border-slate-500/40 px-1.5 py-0.5 rounded font-semibold">Paused</span>}
            {priority === 'high'   && <span className="text-[9px] bg-red-900/40 text-red-300 border border-red-700/30 px-1.5 py-0.5 rounded font-semibold">High</span>}
            {priority === 'medium' && <span className="text-[9px] bg-amber-900/40 text-amber-300 border border-amber-700/30 px-1.5 py-0.5 rounded font-semibold">Medium</span>}
            {priority === 'low'    && <span className="text-[9px] bg-slate-700 text-slate-400 border border-slate-600/40 px-1.5 py-0.5 rounded font-semibold">Low</span>}
          </span>
        }
        className={highlightedTargetId === t.id ? 'ring-2 ring-blue-500/40 ring-inset transition-shadow duration-300' : isPaused ? 'opacity-60' : undefined}
        headerAction={
          <div className="flex gap-1.5 flex-wrap justify-end">
            {/* Priority selector */}
            <select
              value={priority ?? ''}
              onChange={e => setGoalPriorities(prev => ({ ...prev, [t.id]: e.target.value as 'high' | 'medium' | 'low' }))}
              className="text-xs px-1.5 py-0.5 rounded bg-slate-700 border border-slate-600 text-slate-300 focus:outline-none"
              title="Set goal priority"
            >
              <option value="">Priority</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            {/* Pause / Resume */}
            <button
              className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
              onClick={() => setPausedGoals(prev => { const n = new Set(prev); isPaused ? n.delete(t.id) : n.add(t.id); return n })}
            >{isPaused ? 'Resume' : 'Pause'}</button>
            {isEditingTarget ? (
              <button
                className="text-xs text-slate-300 hover:text-slate-100 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                onClick={() => cancelEditTarget(t.id)}
              >Cancel</button>
            ) : (
              <button
                className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                onClick={() => {
                  setEditTargetId(t.id)
                  setEditTargetOriginal(t)
                  setEditTargetForm({
                    name: t.name,
                    goalAmount: String(t.goalAmount),
                    currentSaved: String(t.currentSaved),
                    startDate: t.startDate ?? t.createdAt ?? '',
                    deadline: t.deadline,
                  })
                  setTimeout(() => { editGoalAmountRef.current?.focus(); editGoalAmountRef.current?.select() }, 0)
                }}
              >Edit</button>
            )}
            <button
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
              onClick={() => setTargetsWithHistory(prev => prev.filter(x => x.id !== t.id))}
            >Delete</button>
          </div>
        }>
        {isEditingTarget ? (
          <div
            className="space-y-3"
            onBlur={e => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return
              if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current)
              editBlurTimerRef.current = setTimeout(() => saveEditTarget(t.id), 0)
            }}
          >
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Goal Name</label>
              <input
                className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
                value={editTargetForm.name}
                onChange={e => setEditTargetForm(v => ({ ...v, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) } }}
                placeholder="Goal name"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Goal Amount</label>
              <input
                ref={editGoalAmountRef}
                type="number"
                min={0}
                step={25}
                className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
                value={editTargetForm.goalAmount}
                onChange={e => setEditTargetForm(v => ({ ...v, goalAmount: e.target.value }))}
                onFocus={e => e.target.select()}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) }
                  if (e.key === 'ArrowRight') { e.preventDefault(); editCurrentSavedRef.current?.focus() }
                }}
                placeholder="Goal amount"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Current Saved</label>
              <input
                ref={editCurrentSavedRef}
                type="number"
                min={0}
                step={25}
                className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
                value={editTargetForm.currentSaved}
                onChange={e => setEditTargetForm(v => ({ ...v, currentSaved: e.target.value }))}
                onFocus={e => e.target.select()}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) }
                  if (e.key === 'ArrowRight') { e.preventDefault(); editStartDateRef.current?.focus() }
                  if (e.key === 'ArrowLeft') { e.preventDefault(); editGoalAmountRef.current?.focus() }
                }}
                placeholder="Current saved"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Start Date</label>
              <input
                ref={editStartDateRef}
                type="date"
                className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
                value={editTargetForm.startDate}
                onChange={e => setEditTargetForm(v => ({ ...v, startDate: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) }
                  if (e.key === 'ArrowRight') {
                    editStartDateLeftArrowCount.current = 0
                    editStartDateArrowCount.current += 1
                    if (editStartDateArrowCount.current > 2) {
                      e.preventDefault()
                      editStartDateArrowCount.current = 0
                      editDeadlineRef.current?.focus()
                    }
                  } else if (e.key === 'ArrowLeft') {
                    editStartDateArrowCount.current = 0
                    editStartDateLeftArrowCount.current += 1
                    if (editStartDateLeftArrowCount.current > 2) {
                      e.preventDefault()
                      editStartDateLeftArrowCount.current = 0
                      editCurrentSavedRef.current?.focus()
                    }
                  } else {
                    editStartDateArrowCount.current = 0
                    editStartDateLeftArrowCount.current = 0
                  }
                }}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Deadline</label>
              <input
                ref={editDeadlineRef}
                type="date"
                className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
                value={editTargetForm.deadline}
                onChange={e => setEditTargetForm(v => ({ ...v, deadline: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) }
                  if (e.key === 'ArrowLeft') {
                    editDeadlineArrowCount.current = 0
                    editDeadlineLeftArrowCount.current += 1
                    if (editDeadlineLeftArrowCount.current > 2) {
                      e.preventDefault()
                      editDeadlineLeftArrowCount.current = 0
                      editStartDateRef.current?.focus()
                    }
                  } else if (e.key === 'ArrowRight') {
                    editDeadlineLeftArrowCount.current = 0
                    editDeadlineArrowCount.current += 1
                    if (editDeadlineArrowCount.current > 2) {
                      e.preventDefault()
                      editDeadlineArrowCount.current = 0
                      if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current)
                      saveEditTarget(t.id)
                    }
                  } else {
                    editDeadlineArrowCount.current = 0
                    editDeadlineLeftArrowCount.current = 0
                  }
                }}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 rounded bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm transition-colors"
                onClick={() => { if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); saveEditTarget(t.id) }}
              >
                Save Changes
              </button>
              <button
                className="flex-1 rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm transition-colors"
                onClick={() => { if (editBlurTimerRef.current) clearTimeout(editBlurTimerRef.current); setEditTargetHint(''); cancelEditTarget(t.id) }}
              >
                Cancel
              </button>
            </div>
            {editTargetHint && (
              <p className="mt-2 text-sm text-amber-300">{editTargetHint}</p>
            )}
          </div>
        ) : (
          <>
            {/* TOP SUMMARY */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge}`}>{status}</span>
                <span className="text-sm font-semibold text-slate-100">{progressPct.toFixed(1)}%</span>
                <span className="text-xs text-slate-300 font-semibold">· {currency(req.remaining)} remaining</span>
              </div>
            </div>

            {/* PROGRESS BAR */}
            <div className="mb-1">
              <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-3 rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${progressPct}%` }} />
              </div>
              <div className="flex justify-between mt-1 text-xs text-slate-400">
                <span>{currency(t.currentSaved)} saved</span>
                <span>Goal: {currency(t.goalAmount)}</span>
              </div>
            </div>

            {/* DEADLINE ROW */}
            <div className="flex items-center gap-3 mt-3 mb-3 text-sm">
              <span className="text-slate-400">Deadline</span>
              <span className="text-slate-100 font-medium">{formatDate(t.deadline)}</span>
              <span className="text-slate-500">·</span>
              <span className="text-slate-400">{req.days} days left</span>
            </div>

            {/* REQUIRED SAVINGS SUMMARY */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-center">
                <div className="text-xs text-slate-400 mb-0.5">Weekly</div>
                <div className="text-sm font-semibold text-slate-100">{currency(req.weekly)}</div>
              </div>
              <div className="rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-center">
                <div className="text-xs text-slate-400 mb-0.5">Bi-weekly</div>
                <div className="text-sm font-semibold text-slate-100">{currency(req.biWeekly)}</div>
              </div>
              <div className="rounded-lg bg-slate-700/50 border border-slate-600/50 px-3 py-2 text-center">
                <div className="text-xs text-slate-400 mb-0.5">Monthly</div>
                <div className="text-sm font-semibold text-slate-100">{currency(req.monthly)}</div>
              </div>
            </div>

            {/* COLLAPSIBLE DETAILS */}
            <div className="mb-3">
              <button
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                onClick={toggleExpanded}
              >
                {isExpanded ? 'Hide Details ▴' : 'Show Details ▾'}
              </button>
              {isExpanded && (
                <div className="mt-2 border-t border-slate-700/60 pt-2 space-y-0">
                  <Row l="Start date" v={formatDate(t.startDate ?? t.createdAt)} />
                  <Row l="Days remaining" v={`${req.days}`} />
                  <Row l="Est. pay periods remaining" v={`${req.payPeriods}`} />
                  <Row l="Yearly required" v={currency(req.yearly)} />
                  {t.contributions.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-700/60">
                      <div className="text-xs text-slate-400 mb-1.5">Contribution history ({t.contributions.length})</div>
                      <div className="space-y-1">
                        {t.contributions.map(c => {
                          const isEditingThis = editContributionId === c.id && editContributionTargetId === t.id
                          if (isEditingThis) {
                            return (
                              <div key={c.id} className="rounded border border-slate-600 bg-slate-800 p-2 space-y-2">
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <label className="text-xs text-slate-400 block mb-0.5">Date</label>
                                    <input
                                      type="date"
                                      className="w-full p-1.5 rounded bg-slate-700 border border-slate-500 text-sm"
                                      value={editContributionForm.date}
                                      onChange={e => setEditContributionForm(v => ({ ...v, date: e.target.value }))}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-slate-400 block mb-0.5">Amount</label>
                                    <input
                                      type="number"
                                      min={0}
                                      step={25}
                                      className="w-full p-1.5 rounded bg-slate-700 border border-slate-500 text-sm"
                                      value={editContributionForm.amount}
                                      onChange={e => setEditContributionForm(v => ({ ...v, amount: e.target.value }))}
                                      onFocus={e => e.target.select()}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-slate-400 block mb-0.5">Note</label>
                                    <input
                                      className="w-full p-1.5 rounded bg-slate-800 border border-slate-600 text-sm"
                                      value={editContributionForm.note}
                                      onChange={e => setEditContributionForm(v => ({ ...v, note: e.target.value }))}
                                      placeholder="Note"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button className="rounded bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs transition-colors" onClick={saveEditContribution}>Save</button>
                                  <button className="rounded bg-slate-600 hover:bg-slate-500 px-3 py-1 text-xs transition-colors" onClick={cancelEditContribution}>Cancel</button>
                                </div>
                              </div>
                            )
                          }
                          return (
                            <div key={c.id} className="flex justify-between text-sm border-b border-slate-700 py-1">
                              <span>{c.date} · {currency(c.amount)}{c.note ? ` · ${c.note}` : ''}</span>
                              <div className="flex gap-2">
                                <button className="text-blue-300 hover:text-blue-200" onClick={() => startEditContribution(t.id, c)}>Edit</button>
                                <button
                                  className="text-red-300 hover:text-red-200"
                                  onClick={() => setTargetsWithHistory(prev => prev.map(x => x.id === t.id
                                    ? { ...x, currentSaved: Math.max(0, x.currentSaved - c.amount), contributions: x.contributions.filter(k => k.id !== c.id) }
                                    : x
                                  ))}
                                >Delete</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* LOG CONTRIBUTION */}
            {!t.completed && (
              <>
                <div className="border-t border-slate-700/60 pt-3 mt-1">
                  <div className="text-xs text-slate-400 mb-2">Log a contribution</div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <input
                      type="date"
                      ref={el => { logDateRefs.current[t.id] = el }}
                      className="p-2 rounded bg-slate-800 border border-slate-600 text-sm"
                      value={log.date}
                      onChange={(e) => setTargetLogForm(v => ({ ...v, [t.id]: { ...log, date: e.target.value } }))}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowRight') {
                          const count = (logDateArrowCounts.current[t.id + '-r'] ?? 0) + 1
                          logDateArrowCounts.current[t.id + '-r'] = count
                          logDateArrowCounts.current[t.id + '-l'] = 0
                          if (count > 2) {
                            e.preventDefault()
                            logDateArrowCounts.current[t.id + '-r'] = 0
                            logAmountRefs.current[t.id]?.focus()
                          }
                        } else if (e.key === 'ArrowLeft') {
                          const count = (logDateArrowCounts.current[t.id + '-l'] ?? 0) + 1
                          logDateArrowCounts.current[t.id + '-l'] = count
                          logDateArrowCounts.current[t.id + '-r'] = 0
                          if (count > 2) {
                            e.preventDefault()
                            logDateArrowCounts.current[t.id + '-l'] = 0
                          }
                        } else {
                          logDateArrowCounts.current[t.id + '-r'] = 0
                          logDateArrowCounts.current[t.id + '-l'] = 0
                        }
                      }}
                    />
                    <input
                      type="number"
                      min={0}
                      step={25}
                      ref={el => { logAmountRefs.current[t.id] = el }}
                      className="p-2 rounded bg-slate-800 border border-slate-600 text-sm"
                      value={log.amount}
                      onChange={(e) => setTargetLogForm(v => ({ ...v, [t.id]: { ...log, amount: e.target.value } }))}
                      onFocus={e => e.target.select()}
                      placeholder="Amount"
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowRight') { e.preventDefault(); logNoteRefs.current[t.id]?.focus() }
                        if (e.key === 'ArrowLeft') { e.preventDefault(); logDateRefs.current[t.id]?.focus() }
                      }}
                    />
                    <input
                      ref={el => { logNoteRefs.current[t.id] = el }}
                      className="p-2 rounded bg-slate-800 border border-slate-600 text-sm"
                      value={log.note}
                      onChange={(e) => setTargetLogForm(v => ({ ...v, [t.id]: { ...log, note: e.target.value } }))}
                      placeholder="Note"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addTargetContribution(t.id, Number(log.amount) || 0, log.date, log.note)
                          setTargetLogForm(v => ({ ...v, [t.id]: { ...log, amount: '', note: '' } }))
                        } else if (e.key === 'ArrowLeft' && (e.target as HTMLInputElement).selectionStart === 0) {
                          e.preventDefault()
                          logAmountRefs.current[t.id]?.focus()
                        }
                      }}
                    />
                  </div>
                  <button
                    className="w-full rounded bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm transition-colors"
                    onClick={() => { addTargetContribution(t.id, Number(log.amount) || 0, log.date, log.note); setTargetLogForm(v => ({ ...v, [t.id]: { ...log, amount: '', note: '' } })) }}
                  >
                    Log Contribution
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-700/60">
                  <button
                    className="rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm transition-colors"
                    onClick={() => {
                      const amount = period === 'weekly' ? req.weekly : period === 'bi-weekly' ? req.biWeekly : period === 'yearly' ? req.yearly : req.monthly
                      const monthlyAmt = convertToMonthly(amount, period)
                      const periodAmtDisplay = currency(amount)
                      const existingIdx = categories.findIndex(c => c.name.trim().toLowerCase() === t.name.trim().toLowerCase() && c.type === 'savings')
                      let toastMsg: string
                      let affectedId: string
                      if (existingIdx >= 0) {
                        const old = categories[existingIdx].amount
                        const diff = monthlyAmt - old
                        affectedId = categories[existingIdx].id
                        if (Math.abs(diff) < 0.005) {
                          toastMsg = `No change: ${t.name} already matches ${periodAmtDisplay}`
                        } else if (diff > 0) {
                          toastMsg = `Updated: ${t.name} increased by ${currency(convertFromMonthly(diff, period))} to ${periodAmtDisplay}`
                        } else {
                          toastMsg = `Updated: ${t.name} decreased by ${currency(convertFromMonthly(Math.abs(diff), period))} to ${periodAmtDisplay}`
                        }
                      } else {
                        affectedId = crypto.randomUUID()
                        toastMsg = `New: ${t.name} added to Budget at ${periodAmtDisplay}`
                      }
                      pushBudgetHistory()
                      if (existingIdx >= 0) {
                        setCategories(prev => {
                          const cp = [...prev]
                          cp[existingIdx] = { ...cp[existingIdx], amount: monthlyAmt }
                          return cp
                        })
                      } else {
                        setCategories(prev => [...prev, { id: affectedId, name: t.name, amount: monthlyAmt, type: 'savings' }])
                      }
                      setTab('Budget')
                      setTimeout(() => {
                        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
                        setHighlightedCategoryId(affectedId)
                        highlightTimerRef.current = setTimeout(() => setHighlightedCategoryId(null), 2500)
                      }, 80)
                      showToast(toastMsg)
                    }}
                  >
                    Add to Current Budget
                  </button>
                  <button
                    className="rounded bg-green-700 hover:bg-green-600 px-3 py-1.5 text-sm transition-colors"
                    onClick={() => setTargetsWithHistory(prev => prev.map(x => x.id === t.id ? { ...x, completed: true } : x))}
                  >
                    Move to Completed
                  </button>
                  <button
                    className="rounded bg-slate-600 hover:bg-slate-500 px-3 py-1.5 text-sm transition-colors min-w-[7rem]"
                    onClick={() => {
                      setTargetFormHistory(fh => [...fh.slice(-19), { ...targetForm }])
                      setTargetFormRedo([])
                      setTargetForm({
                        name: '',
                        goalAmount: String(t.goalAmount),
                        currentSaved: String(t.currentSaved),
                        startDate: t.startDate ?? t.createdAt ?? new Date().toISOString().slice(0, 10),
                        deadline: t.deadline ?? '',
                      })
                      setTargetFormHint('')
                      setTab('Targets')
                      setTimeout(() => targetNameRef.current?.focus(), 50)
                    }}
                  >
                    Duplicate
                  </button>
                </div>
              </>
            )}
            {t.completed && (
              <button
                className="mt-3 rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm transition-colors"
                onClick={() => setTargetsWithHistory(prev => prev.map(x => x.id === t.id ? { ...x, completed: false } : x))}
              >
                Move Back to Active
              </button>
            )}
          </>
        )}
      </Card>
    )
  }

  // V8.8 — Merchant suggestion: check rules then past transactions (no-op when category already chosen)

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">

        <header className="rounded-2xl border border-slate-700 bg-slate-800/80 shadow-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Flow</h1>
            <p className="text-slate-400">Personal Finance Dashboard</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['Dashboard', 'Income', 'Budget', 'Accounts', 'Transactions', 'Scenarios', 'Targets'] as Tab[]).map(t => (
              <button
                title={tabTips[t]}
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg transition-all duration-200 hover:-translate-y-0.5 ${tab === t ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600'}`}
              >
                {t === 'Targets' ? 'Savings Goals' : t}
              </button>
            ))}
          </div>
        </header>

        {/* ── DASHBOARD ── */}
        {tab === 'Dashboard' && (
          <section className="space-y-4 transition-all duration-300">

            {/* ── V7.3 Dashboard Status Banner ── */}
            <DashboardStatusBanner status={dashboardStatus} />

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
                description="Update your gross profit to see how your take-home and commission change."
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

            <Card title="Dashboard Summary">
              <div className="flex gap-2 mb-4">{periods.map(p => <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>{labelPeriod(p)}</Pill>)}</div>
              <p className="mb-4">
                Monthly Gross Profit Reference:{' '}
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
            </Card>
            <Card title="Financial Intelligence">
              <div className="grid md:grid-cols-3 gap-3">
                <Info title="Biggest Expense" value={top[0] ? `${top[0].name} (${currency(convertFromMonthly(top[0].amount, period))} ${labelPeriod(period)})` : 'None'} tone={biggestExpenseTone} />
                <Info title="Fixed Bills Ratio" value={`${fixedRatio.toFixed(1)}%`} />
                <Info title="Savings Rate" value={`${savingsRate.toFixed(1)}%`} tone={savingsTone} />
                <Info title="Commission Dependency" value={`${dep.toFixed(1)}%`} className={depColor} />
                <Info title="Remaining Cushion" value={`${remainingCushionPct.toFixed(1)}%`} tone={cushionTone} />
                <Info title="Budget Status / Health Tier" value={statusLabel} tone={statusTone} glow={selectedPeriodRemaining < 0} />
              </div>
            </Card>

            {/* ── V9.8 Cash Flow Forecast ── */}
            <Card title="Cash Flow Forecast" noHover>
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
              )}
            </Card>

            {/* ── V9.9 Monthly Review ── */}
            <Card title="Monthly Review" noHover>
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
                    <table className="w-full text-xs">
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
              )}
            </Card>
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
              <label className="text-sm">Monthly Gross Profit</label>
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
                    <div className="flex gap-1.5">
                      <button
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${budgetFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                        onClick={() => setBudgetFilter('all')}
                      >All</button>
                      <button
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${budgetFilter === 'over-budget' ? 'bg-red-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                        onClick={() => setBudgetFilter(v => v === 'over-budget' ? 'all' : 'over-budget')}
                      >Over Budget {budgetHealth.overBudget.length > 0 && `(${budgetHealth.overBudget.length})`}</button>
                      <button
                        className={`text-[10px] px-2 py-0.5 rounded transition-colors ${budgetFilter === 'no-activity' ? 'bg-slate-500 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                        onClick={() => setBudgetFilter(v => v === 'no-activity' ? 'all' : 'no-activity')}
                      >No Activity {budgetHealth.noActivity.length > 0 && `(${budgetHealth.noActivity.length})`}</button>
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
            <Card title="Budget Categories">
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
                <button onClick={() => { if (!categories.length) return; pushBudgetHistory(); setCategories([]); showUndoableToast('Budget reset.', undoBudget) }} className="rounded-lg px-3 py-1.5 bg-slate-700 hover:bg-slate-600">Reset Budget</button>
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
                          <button className="text-blue-300 hover:text-blue-200 text-xs" onClick={() => setCategories(b.categories)}>Load</button>
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
              <table className="w-full text-sm mt-3">
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
                    return (
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
                        <td className="py-1.5 pr-2">{c.name}</td>
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
                          <button className="text-red-300 hover:text-red-200" onClick={() => { pushBudgetHistory(); setCategories(prev => prev.filter(x => x.id !== c.id)) }}>Delete</button>
                          {/* V9.11 — Rollover toggle */}
                          <button
                            title={categoryRollovers[c.id] ? 'Rollover enabled — unused budget carries forward' : 'Enable rollover for this category'}
                            className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${categoryRollovers[c.id] ? 'text-teal-300 bg-teal-900/30 border-teal-700/30' : 'text-slate-600 border-slate-700/30 hover:text-slate-400'}`}
                            onClick={() => setCategoryRollovers(prev => ({ ...prev, [c.id]: !prev[c.id] }))}
                          >{categoryRollovers[c.id] ? 'Rollover ✓' : 'Rollover'}</button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </Card>
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
                  <button onClick={() => { if (!accounts.length) return; setAccountsWithHistory(() => []); showUndoableToast(`${accounts.length} account${accounts.length !== 1 ? 's' : ''} cleared.`, undoAccount) }} className="rounded-lg px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors">Clear All</button>
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
                  <span className="text-slate-400 font-medium">Current Balance</span> = what you entered for this account.{' '}
                  <span className="text-slate-400 font-medium">Tracked Activity</span> = net effect of all logged transactions.{' '}
                  <span className="text-slate-400 font-medium">Unexplained</span> = the gap — may reflect unlogged history, transfers not yet entered, or a partial transaction import.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-1.5 pr-4 font-medium">Name</th>
                        <th className="pb-1.5 pr-4 font-medium">Type</th>
                        <th className="pb-1.5 pr-4 font-medium text-right">Current Balance</th>
                        <th className="pb-1.5 pr-4 font-medium text-right">Tracked Activity</th>
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
                                // CC: comparing |balance| vs tracked charges is meaningful without a baseline
                                if (a.type === 'credit card') {
                                  if (bc.isMatched) return <span className="text-green-400 font-medium">Looks matched.</span>
                                  const amt = Math.abs(bc.unexplained)
                                  const cls = `font-medium ${amt > 100 ? 'text-red-400' : 'text-amber-300'}`
                                  return bc.unexplained > 0
                                    ? <span className={cls}>{currency(amt)} of card debt is not explained yet.</span>
                                    : <span className={cls}>Tracked activity is {currency(amt)} higher than current card balance.</span>
                                }
                                // Non-CC: unexplained requires a known starting balance — we don't have one yet.
                                // Showing current balance minus tracked delta produces misleading numbers.
                                return (
                                  <span className="text-slate-600 text-[10px] leading-snug">
                                    Baseline not set yet<br />
                                    <span className="text-slate-700">Set after importing a full month.</span>
                                  </span>
                                )
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
                                    disabled
                                    className="text-xs text-slate-600 cursor-not-allowed"
                                    title="Full reconciliation coming after account-aware CSV import"
                                    onClick={() => reconcileAccount(a.id)}
                                  >
                                    Reconcile
                                  </button>
                                  <button className="text-red-400 hover:text-red-300 text-xs" onClick={() => {
                                    setAccountsWithHistory(prev => prev.filter(x => x.id !== a.id))
                                    showUndoableToast(`Deleted "${a.name}".`, undoAccount)
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
            setTxnFilter={setTxnFilter}
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
              setTxnFilter, showToast,
              uncatOpen, setUncatOpen, uncategorizedExpenseCount,
              setInlineTxnEditId, setInlineTxnEditForm, setTxnDupWarning, inlineTxnAmountRef,
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
                  <button onClick={() => { if (!transactions.length) return; setTxnWithHistory(() => []); showUndoableToast(`${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} cleared.`, undoTxn) }} className="rounded-lg px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors">Clear All</button>
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
              <p className="text-xs text-slate-400 mb-3">Rules help auto-categorize transactions based on merchant names or notes. New transactions get a category applied automatically if a rule matches.</p>
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
                  <button onClick={() => { if (!rules.length) return; setRulesWithHistory(() => []); showUndoableToast(`${rules.length} rule${rules.length !== 1 ? 's' : ''} cleared.`, undoRule) }} className="rounded-lg px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors">Clear All</button>
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
                          const blurSave = () => {
                            if (inlineEditBlurTimerRef.current) clearTimeout(inlineEditBlurTimerRef.current)
                            inlineEditBlurTimerRef.current = setTimeout(saveInlineRuleEdit, 150)
                          }
                          const blurCancel = () => {
                            if (inlineEditBlurTimerRef.current) clearTimeout(inlineEditBlurTimerRef.current)
                          }
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
                  onKeyDown={e => { if (e.key === 'Enter') { const n = scenarioTitle.trim(); if (!n) return; const ex = savedScenarios.find(x => x.name.toLowerCase() === n.toLowerCase()); if (ex && !window.confirm('Overwrite existing set?')) return; setSavedScenarios([{ name: n, scenarios: scenario, period: period, savedAt: new Date().toISOString() }, ...savedScenarios.filter(x => x.name.toLowerCase() !== n.toLowerCase())]); setScenarioTitle('') } }}
                />
                <button className="rounded bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm transition-colors" onClick={() => {
                  const n = scenarioTitle.trim(); if (!n) return
                  const ex = savedScenarios.find(x => x.name.toLowerCase() === n.toLowerCase())
                  if (ex && !window.confirm('Overwrite existing set?')) return
                  setSavedScenarios([{ name: n, scenarios: scenario, period: period, savedAt: new Date().toISOString() }, ...savedScenarios.filter(x => x.name.toLowerCase() !== n.toLowerCase())])
                  setScenarioTitle('')
                }}>Save Scenario Set</button>
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
                                  const nn = renameScenarioValue.trim()
                                  if (nn && nn !== s.name) {
                                    setSavedScenarios(prev => prev.map(x => x.name === s.name ? { ...x, name: nn, savedAt: new Date().toISOString() } : x))
                                    setScenarioNotes(prev => { const n = { ...prev }; if (n[s.name]) { n[nn] = n[s.name]; delete n[s.name] } return n })
                                  }
                                  setEditingScenarioName(null)
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

                    <Row l="Monthly Gross Profit" v={currency(gpForScenario)} />
                    <Row l={`Gross Profit (${labelPeriod(period)})`} v={currency(convertFromMonthly(gpForScenario, period))} />
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
                onClick={() => { if (!targets.length) return; setTargetsWithHistory(() => []); showUndoableToast(`${targets.length} savings goal${targets.length !== 1 ? 's' : ''} cleared.`, undoTarget) }}
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
                  setSavedTargetSets([{ name: n, targets, savedAt: new Date().toISOString() }, ...savedTargetSets.filter(s => s.name.toLowerCase() !== n.toLowerCase())])
                  showToast('Savings goal set saved.')
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
                              setSavedTargetSets(prev => prev.map((x, i) => i === idx ? { ...x, name: newName, savedAt: new Date().toISOString() } : x))
                              showToast('Savings goal set renamed.')
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
                              setSavedTargetSets(prev => prev.map((x, i) => i === idx ? { ...x, name: newName, savedAt: new Date().toISOString() } : x))
                              showToast('Savings goal set renamed.')
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
                            setSavedTargetSets(prev => prev.map((x, i) => i === idx ? { ...x, name: newName, savedAt: new Date().toISOString() } : x))
                            showToast('Savings goal set renamed.')
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
                              setTargets(s.targets)
                              showToast('Savings goal set loaded.')
                            }
                          }}>Load</button>
                          <button className="text-slate-400 hover:text-slate-300 text-sm" onClick={() => { setEditingSetIdx(idx); setRenameSetValue(s.name) }}>Rename</button>
                          <button className="text-red-300 hover:text-red-200 text-sm" onClick={() => { pushSetHistory(savedTargetSets); setSavedTargetSets(prev => prev.filter(x => x.name !== s.name)) }}>Delete</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* V9.12 — Goal Planning Summary */}
            {targets.length > 0 && (
              <div className="rounded-2xl border border-blue-700/20 bg-blue-950/10 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Savings Plan Summary</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                  {[
                    { label: 'Total Goal', val: currency(goalPlanSummary.totalGoal), color: 'text-slate-200' },
                    { label: 'Total Saved', val: currency(goalPlanSummary.totalSaved), color: 'text-green-400' },
                    { label: 'Remaining', val: currency(goalPlanSummary.remaining), color: goalPlanSummary.remaining > 0 ? 'text-amber-300' : 'text-green-400' },
                    { label: 'Required / Week', val: goalPlanSummary.weeklyRequired > 0 ? currency(goalPlanSummary.weeklyRequired) : '—', color: 'text-blue-300' },
                  ].map(({ label, val, color }) => (
                    <div key={label} className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-3 py-2">
                      <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
                      <div className={`text-base font-bold ${color}`}>{val}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 text-xs text-slate-500">
                  <span><span className="text-slate-300 font-medium">{goalPlanSummary.activeCount}</span> active</span>
                  {goalPlanSummary.pausedCount > 0 && <span><span className="text-slate-400 font-medium">{goalPlanSummary.pausedCount}</span> paused</span>}
                  {goalPlanSummary.fundedCount > 0 && <span><span className="text-green-400 font-medium">{goalPlanSummary.fundedCount}</span> fully funded</span>}
                </div>
              </div>
            )}

            {/* Active Targets */}
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-slate-200">Active Savings Goals ({activeTargets.length})</h3>
              {activeTargets.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-3">
                  {activeTargets.map(t => renderTargetCard(t))}
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
                  {pausedTargets.map(t => renderTargetCard(t))}
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
                    {fullyFundedTargets.map(t => renderTargetCard(t))}
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
                    {completedTargets.map(t => renderTargetCard(t))}
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
          onResetPreview={() => { setCsvImportPreview(null); setCsvImportError(''); setCsvImportIsPdf(false); setPdfPreviewRows([]); setPdfParseWarning(''); setCsvColumnMapping(null) }}
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
          onClick={() => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(null) }}
        >
          <span className="flex-1">{toast.message}</span>
          {toast.onUndo && (
            <button
              className="ml-1 rounded bg-amber-700 hover:bg-amber-600 px-2 py-0.5 text-xs font-semibold transition-colors shrink-0"
              onClick={e => {
                e.stopPropagation()
                if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
                toast.onUndo?.()
                setToast(null)
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── V7.3 Dashboard Status Banner ─────────────────────────────────────────────

function DashboardStatusBanner({ status }: { status: DashboardStatus }) {
  const toneStyles: Record<string, { border: string; bg: string; labelColor: string; dot: string; badgeBg: string; badgeText: string; badgeBorder: string; signal: string }> = {
    excellent: {
      border: 'border-emerald-500/60',
      bg: 'bg-gradient-to-r from-emerald-900/40 via-slate-800/80 to-slate-800/80',
      labelColor: 'text-emerald-300',
      dot: 'bg-emerald-400',
      badgeBg: 'bg-emerald-900/60', badgeText: 'text-emerald-300', badgeBorder: 'border-emerald-500/40',
      signal: 'All signals clear',
    },
    good: {
      border: 'border-green-500/50',
      bg: 'bg-gradient-to-r from-green-900/30 via-slate-800/80 to-slate-800/80',
      labelColor: 'text-green-300',
      dot: 'bg-green-400',
      badgeBg: 'bg-green-900/60', badgeText: 'text-green-300', badgeBorder: 'border-green-500/40',
      signal: 'On track',
    },
    warn: {
      border: 'border-yellow-500/50',
      bg: 'bg-gradient-to-r from-yellow-900/30 via-slate-800/80 to-slate-800/80',
      labelColor: 'text-yellow-300',
      dot: 'bg-yellow-400',
      badgeBg: 'bg-yellow-900/60', badgeText: 'text-yellow-300', badgeBorder: 'border-yellow-500/40',
      signal: 'Worth watching',
    },
    risk: {
      border: 'border-orange-500/50',
      bg: 'bg-gradient-to-r from-orange-900/30 via-slate-800/80 to-slate-800/80',
      labelColor: 'text-orange-300',
      dot: 'bg-orange-400',
      badgeBg: 'bg-orange-900/60', badgeText: 'text-orange-300', badgeBorder: 'border-orange-500/40',
      signal: 'Needs attention',
    },
    danger: {
      border: 'border-red-500/60',
      bg: 'bg-gradient-to-r from-red-900/40 via-slate-800/80 to-slate-800/80',
      labelColor: 'text-red-300',
      dot: 'bg-red-400',
      badgeBg: 'bg-red-900/60', badgeText: 'text-red-300', badgeBorder: 'border-red-500/40',
      signal: 'Action required',
    },
  }
  const s = toneStyles[status.tone] ?? toneStyles.warn
  return (
    <div className={`rounded-2xl border ${s.border} ${s.bg} shadow-lg p-4 md:p-5`}>
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 shrink-0 h-2.5 w-2.5 rounded-full ${s.dot}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <div className={`text-xl font-bold tracking-tight ${s.labelColor}`}>{status.label}</div>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.badgeBg} ${s.badgeText} ${s.badgeBorder}`}>
              {s.signal}
            </span>
          </div>
          <p className="text-sm text-slate-200 leading-relaxed">{status.explanation}</p>
          {status.context && (
            <p className="mt-2 text-xs text-slate-400 leading-relaxed border-t border-slate-700/60 pt-2">{status.context}</p>
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

          {/* V9.10 — Import preset selector */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Import Preset</label>
            <select
              value={preset}
              onChange={e => onPresetChange(e.target.value as ImportPreset)}
              className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="auto">Auto Detect</option>
              <option value="apple-card">Apple Card CSV</option>
              <option value="generic-csv">Generic CSV</option>
              <option value="chase-pdf-experimental">Chase Statement PDF (Experimental)</option>
            </select>
          </div>

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
              <p className="text-slate-400 text-sm mb-4">or click to browse</p>
              <p className="text-slate-500 text-xs">
                Apple Card CSV auto-detected. PDF support for text-based bank statements (Chase, BofA, etc.).
              </p>
              <input type="file" accept=".csv,.pdf,text/csv,text/plain,application/pdf" className="hidden" onChange={onFileSelect} ref={fileInputRef} />
            </div>
          )}

          {loading && <div className="text-center py-8 text-slate-400">{isPdf ? 'Parsing PDF…' : 'Parsing CSV…'}</div>}

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
