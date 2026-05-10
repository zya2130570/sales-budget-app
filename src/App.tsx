import { useEffect, useMemo, useRef, useState } from 'react'
import type { Tab, Period, CategoryType, Category, ScenarioName, SavedBudget, SavedScenarioSet, BudgetSnapshot, Contribution, Target, SavedTargetSet, AccountType, Account, TransactionType, Transaction, TransactionRule } from './types'
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
const TXN_TYPES: TransactionType[] = ['expense', 'income', 'transfer', 'credit card payment']
const TXN_TYPE_LABELS: Record<TransactionType, string> = {
  'expense':              'Expense',
  'income':               'Income',
  'transfer':             'Transfer',
  'credit card payment':  'Credit Card Payment',
}

const periods: Period[] = ['weekly', 'bi-weekly', 'monthly', 'yearly']
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
function getPeriodDateRange(period: Period): { start: string; end: string } {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (period === 'monthly') {
    return {
      start: fmt(new Date(today.getFullYear(), today.getMonth(), 1)),
      end:   fmt(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    }
  }
  if (period === 'yearly') {
    return {
      start: fmt(new Date(today.getFullYear(), 0, 1)),
      end:   fmt(new Date(today.getFullYear(), 11, 31)),
    }
  }
  if (period === 'weekly') {
    const sun = new Date(today)
    sun.setDate(today.getDate() - today.getDay())
    const sat = new Date(sun)
    sat.setDate(sun.getDate() + 6)
    return { start: fmt(sun), end: fmt(sat) }
  }
  // bi-weekly: trailing 14-day window ending today
  const start = new Date(today)
  start.setDate(today.getDate() - 13)
  return { start: fmt(start), end: fmt(today) }
}

// ── V8.4.2 Sample generator data pools ───────────────────────────────────────
const SAMPLE_MERCHANTS = ['Target', 'Walmart', "Fry's", 'Shell', 'Chevron', 'Costco', 'Amazon', 'Starbucks', 'Chipotle', 'Uber', 'Lyft', 'Apple', 'Best Buy', 'CVS', "McDonald's", 'Walgreens']
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
const SAMPLE_GOAL_NAMES = ['Emergency Fund', 'Vacation', 'New Bike', 'Car Repair', 'Roth IRA Contribution', 'Laptop Upgrade', 'Moving Fund', 'Travel Fund']
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

const TXN_FILTER_OPTIONS = [
  { value: 'all'                 as const, label: 'All'                  },
  { value: 'uncategorized'       as const, label: 'Uncategorized'        },
  { value: 'expense'             as const, label: 'Expense'              },
  { value: 'income'              as const, label: 'Income'               },
  { value: 'transfer'            as const, label: 'Transfer'             },
  { value: 'credit card payment' as const, label: 'Credit Card Payment'  },
]

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
  const txnDateRef     = useRef<HTMLInputElement>(null)
  const txnAccountRef  = useRef<HTMLSelectElement>(null)
  const txnMerchantRef = useRef<HTMLInputElement>(null)
  const txnAmountRef   = useRef<HTMLInputElement>(null)
  const txnTypeRef     = useRef<HTMLSelectElement>(null)
  const txnCategoryRef = useRef<HTMLSelectElement>(null)
  const txnNotesRef    = useRef<HTMLInputElement>(null)

// V8.3 — Rule form refs
  const ruleNameRef           = useRef<HTMLInputElement>(null)
  const ruleMatchTextRef      = useRef<HTMLInputElement>(null)

  // V8.6.1 — Inline txn edit field refs (programmatic focus on Edit click + ArrowLeft/Right nav)
  const inlineTxnAmountRef    = useRef<HTMLInputElement>(null)
  const inlineTxnMerchantRef  = useRef<HTMLInputElement>(null)
  const inlineTxnTypeRef      = useRef<HTMLSelectElement>(null)
  const inlineTxnCategoryRef  = useRef<HTMLSelectElement>(null)
  // V8.6.1 — Inline rule edit ref (focus Match Text on Edit click)
  const inlineRuleMatchRef    = useRef<HTMLInputElement>(null)
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
  })
  const [txnHistory, setTxnHistory]           = useState<Transaction[][]>([])
  const [txnRedo, setTxnRedo]                 = useState<Transaction[][]>([])

// V8.5 — review / filter
  const [txnFilter, setTxnFilter]             = useState<typeof TXN_FILTER_OPTIONS[number]['value']>('all')
  const [txnDupWarning, setTxnDupWarning]     = useState(false)
  // V8.7 — tracks how many uncategorized txns were visible when pill was last clicked
  const [accountHint, setAccountHint]         = useState('')
  const [txnHint, setTxnHint]                 = useState('')

  // V8.6.3 — Uncategorized glow: suppressed once the user clicks the pill; re-arms on new items
  const uncategorizedGlowSeenRef  = useRef(false)
  const prevUncategorizedCountRef = useRef(0)

  // V8.3.1 — Inline transaction editing (rows edit in place; top form is create-only)
  const [inlineTxnEditId, setInlineTxnEditId] = useState<string | null>(null)
  const [inlineTxnEditForm, setInlineTxnEditForm] = useState({
    date: '', accountId: '', merchant: '', amount: '',
    type: 'expense' as TransactionType, categoryId: '', notes: '',
  })

  // V8.3 — Transaction Rules
  const [rules, setRules]                     = useState<TransactionRule[]>([])
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
  useEffect(() => saveTargets(targets), [targets])
  useEffect(() => saveSavedTargetSets(savedTargetSets), [savedTargetSets])
  useEffect(() => saveAccounts(accounts), [accounts])
  useEffect(() => saveTransactions(transactions), [transactions])
 useEffect(() => saveTransactionRules(rules), [rules])

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
  const varianceTone = (overspendAmt: number, p: Period): 'good' | 'neutral' | 'warn' | 'danger' => {
    const threshold = p === 'weekly' ? 50 : p === 'bi-weekly' ? 100 : p === 'monthly' ? 216 : 2600
    if (overspendAmt <= 0) return 'good'
    if (overspendAmt <= threshold) return 'neutral'
    if (overspendAmt <= threshold * 2) return 'warn'
    return 'danger'
  }

  // Planned total for the selected period (sum of all categories)
  const plannedPeriodTotal = convertFromMonthly(monthlyBudget, period)

  // ── V8.4 Transaction-driven actuals ──────────────────────────────────────────
  // Sum categorized transaction amounts within the current period window.
  // Only expense/transfer/credit-card-payment transactions count toward spending.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const txnActuals = useMemo(() => {
    const range = getPeriodDateRange(period)
    const result: Record<string, number> = {}
    for (const tx of transactions) {
      if (!tx.categoryId) continue
      if (tx.date < range.start || tx.date > range.end) continue
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
  const activeTargets = targets.filter(t => !t.completed && (t.goalAmount <= 0 || t.currentSaved < t.goalAmount))

  // ── V8.6.3 Uncategorized expense count ──────────────────────────────────────
  // Single source of truth: expense transactions with no budget category assigned.
  // Income, Transfer, and Credit Card Payment are intentionally excluded.
  const uncategorizedExpenseCount = transactions.filter(
    tx => tx.type === 'expense' && !tx.categoryId
  ).length
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
    // If actuals show meaningful overspend, surface it in the dashboard explanation
    if (actualOverspendPct > 5 && base.tone !== 'danger') {
      const severity: DashboardStatus['tone'] = actualOverspendPct > 20 ? 'risk' : 'warn'
      const toneOrder: DashboardStatus['tone'][] = ['excellent', 'good', 'warn', 'risk', 'danger']
      const baseIdx = toneOrder.indexOf(base.tone)
      const sevIdx  = toneOrder.indexOf(severity)
      return {
        ...base,
        tone: sevIdx > baseIdx ? severity : base.tone,
        context: `Actuals are running ${actualOverspendPct.toFixed(0)}% over plan this period. ${base.context}`,
      }
    }
    return base
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
  const createOrSaveAccount = () => {
    const name = accountForm.name.trim()
    if (!name) { setTimedAccountHint('Enter an account name before adding.'); accountNameRef.current?.focus(); return }
    const rawBalance = parseFloat(accountForm.balance) || 0
    // Credit cards carry debt-style balances — always ≤ 0
    const balance = accountForm.type === 'credit card' && rawBalance > 0 ? -rawBalance : rawBalance
    const institution = accountForm.institution.trim()
    if (editAccountId) {
      setAccountsWithHistory(prev => prev.map(a => a.id === editAccountId
        ? { ...a, name, type: accountForm.type, balance, institution }
        : a
      ))
    } else {
      setAccountsWithHistory(prev => [
        { id: crypto.randomUUID(), name, type: accountForm.type, balance, institution, createdAt: new Date().toISOString().slice(0, 10) },
        ...prev,
      ])
    }
    clearAccountForm()
    accountNameRef.current?.focus()
  }

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
    setTxnForm({ date: new Date().toISOString().slice(0, 10), accountId: '', merchant: '', amount: '', type: 'expense', categoryId: '', notes: '' })
    setTxnHint('')
    setTxnDupWarning(false)
  }
  // Soft reset after a successful add — keeps account, type, date so rapid entry is frictionless
  const resetTxnFormAfterAdd = () => {
    setTxnForm(prev => ({ ...prev, merchant: '', amount: '', categoryId: '', notes: '' }))
    setTxnHint('')
    setTxnDupWarning(false)
  }
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

   setTxnWithHistory(prev => [
      { id: crypto.randomUUID(), date: txnForm.date, accountId: txnForm.accountId, merchant, amount, type: txnForm.type, categoryId: autoCategoryId || undefined, appliedByRule: matchedRuleId, notes: txnForm.notes.trim() || undefined, createdAt: new Date().toISOString() },
      ...prev,
    ])
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

  // ── V8.3 Rule helpers ─────────────────────────────────────────────────────────

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
    const merchant = SAMPLE_MERCHANTS[Math.floor(Math.random() * SAMPLE_MERCHANTS.length)]
    const amount = (Math.floor(Math.random() * 19) + 1) * 5
    const roll = Math.random()
    const type: TransactionType = roll < 0.75 ? 'expense' : roll < 0.85 ? 'income' : roll < 0.93 ? 'transfer' : 'credit card payment'
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
    const batch: Transaction[] = []
    for (let i = 0; i < 10; i++) {
      const merchant = SAMPLE_MERCHANTS[Math.floor(Math.random() * SAMPLE_MERCHANTS.length)]
      const amount   = (Math.floor(Math.random() * 19) + 1) * 5
      const roll     = Math.random()
      const type: TransactionType = roll < 0.72 ? 'expense' : roll < 0.84 ? 'income' : roll < 0.93 ? 'transfer' : 'credit card payment'
      // ~30% intentionally uncategorized
      const catPool  = type === 'expense' ? categories.filter(c => c.type !== 'savings' && c.type !== 'investing') : categories
      const categoryId = Math.random() < 0.7 && catPool.length ? catPool[Math.floor(Math.random() * catPool.length)].id : undefined
      const accountId  = accounts[0]?.id ?? ''
      const date       = new Date(startMs + Math.random() * (endMs - startMs)).toISOString().slice(0, 10)
      // ~15% duplicate a previous entry in this batch
      const dupSrc = batch.length >= 2 && Math.random() < 0.15 ? batch[Math.floor(Math.random() * batch.length)] : null
      batch.push(dupSrc
        ? { ...dupSrc, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
        : { id: crypto.randomUUID(), date, accountId, merchant, amount, type, categoryId, createdAt: new Date().toISOString() }
      )
    }
    setTxnWithHistory(prev => [...batch, ...prev])
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

  const [editTargetHint, setEditTargetHint] = useState('')

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
        title={isEditingTarget ? `Editing: ${t.name}` : t.name}
        className={highlightedTargetId === t.id ? 'ring-2 ring-blue-500/40 ring-inset transition-shadow duration-300' : undefined}
        headerAction={
          <div className="flex gap-2">
            {isEditingTarget ? (
              <button
                className="text-xs text-slate-300 hover:text-slate-100 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                onClick={() => cancelEditTarget(t.id)}
              >
                Cancel
              </button>
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
              >
                Edit
              </button>
            )}
            <button
              className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
              onClick={() => setTargetsWithHistory(prev => prev.filter(x => x.id !== t.id))}
            >
              Delete
            </button>
          </div>
        }
      >
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
                {savedBudgets.map(b => (
                  <div key={b.name} className="rounded border border-slate-700 p-2 flex justify-between">
                    <div><div>{b.name}</div><div className="text-xs text-slate-400">{new Date(b.savedAt).toLocaleString()}</div></div>
                    <div className="flex gap-2">
                      <button className="text-blue-300" onClick={() => setCategories(b.categories)}>Load</button>
                      <button className="text-amber-300" onClick={() => { const nn = window.prompt('Rename budget', b.name); if (!nn) return; setSavedBudgets(prev => prev.map(x => x.name === b.name ? { ...x, name: nn } : x)) }}>Rename</button>
                      <button className="text-red-300" onClick={() => setSavedBudgets(prev => prev.filter(x => x.name !== b.name))}>Delete</button>
                    </div>
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
                    <th className="pb-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {top.map(c => {
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
                        <td className="py-1.5 space-x-2 whitespace-nowrap">
                          <button className="text-blue-300 hover:text-blue-200" onClick={() => { setForm({ name: c.name, amount: String(convertFromMonthly(c.amount, period)), type: c.type }); setEditId(c.id); budgetNameRef.current?.focus() }}>Edit</button>
                          <button className="text-red-300 hover:text-red-200" onClick={() => { pushBudgetHistory(); setCategories(prev => prev.filter(x => x.id !== c.id)) }}>Delete</button>
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
            <Card title={editAccountId ? 'Edit Account' : 'Add Account'} noHover>
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
                  {editAccountId ? 'Save Changes' : 'Add Account'}
                </button>
                {editAccountId
                  ? <button onClick={clearAccountForm} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-1.5 text-sm transition-colors">Cancel</button>
                  : <button onClick={clearAccountForm} className="rounded-lg bg-slate-700 hover:bg-slate-600 px-4 py-1.5 text-sm transition-colors">Clear</button>
                }
                <button onClick={undoAccount} disabled={!accountHistory.length} className={`rounded-lg px-3 py-1.5 text-sm ${accountHistory.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Undo</button>
                <button onClick={redoAccount} disabled={!accountRedo.length} className={`rounded-lg px-3 py-1.5 text-sm ${accountRedo.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Redo</button>
                {!editAccountId && accounts.length > 0 && (
                  <button onClick={() => { if (window.confirm(`Clear all ${accounts.length} account${accounts.length !== 1 ? 's' : ''}? This cannot be undone.`)) { setAccountsWithHistory(() => []); showUndoableToast('Accounts cleared.', undoAccount) } }} className="rounded-lg px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors">Clear All</button>
                )}
                {!editAccountId && (
                  <button onClick={generateSampleAccount} className="rounded-lg px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors" title="Instantly add a sample account">Generate Sample</button>
                )}
              </div>
              {accountHint && <p className="mt-2 text-sm text-amber-300">{accountHint}</p>}
            </Card>

            {accounts.length > 0 ? (
              <Card title="Your Accounts">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-1.5 pr-4 font-medium">Name</th>
                        <th className="pb-1.5 pr-4 font-medium">Type</th>
                        <th className="pb-1.5 pr-4 font-medium text-right">Balance</th>
                        <th className="pb-1.5 pr-4 font-medium">Institution</th>
                        <th className="pb-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map(a => (
                        <tr key={a.id} className={`border-b border-slate-800 transition-colors duration-300 ${highlightedAccountId === a.id ? 'bg-blue-600/20' : 'hover:bg-slate-800/40'}`}>
                          <td className="py-2 pr-4 font-medium">{a.name}</td>
                          <td className="py-2 pr-4 text-slate-400">{ACCOUNT_TYPE_LABELS[a.type]}</td>
                          <td className={`py-2 pr-4 text-right font-semibold ${a.balance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {a.balance < 0 ? `−${currency(Math.abs(a.balance))}` : currency(a.balance)}
                          </td>
                          <td className="py-2 pr-4 text-slate-400 text-xs">{a.institution || '—'}</td>
                          <td className="py-2 whitespace-nowrap space-x-2">
                          <button className="text-blue-400 hover:text-blue-300 text-xs" onClick={() => {
                              setEditAccountId(a.id)
                              setAccountForm({ name: a.name, type: a.type, balance: a.balance === 0 ? '' : String(a.balance), institution: a.institution })
                              setTimeout(() => { accountBalanceRef.current?.focus(); accountBalanceRef.current?.select() }, 0)
                            }}>Edit</button>
                            <button className="text-red-400 hover:text-red-300 text-xs" onClick={() => setAccountsWithHistory(prev => prev.filter(x => x.id !== a.id))}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-700">
                        <td colSpan={2} className="pt-2 text-xs text-slate-500 font-medium">Net Balance</td>
                        <td className={`pt-2 text-right text-sm font-bold ${accounts.reduce((s, a) => s + a.balance, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {currency(accounts.reduce((s, a) => s + a.balance, 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            ) : (
              <p className="text-center text-slate-500 text-sm py-8">No accounts yet. Add one above to get started.</p>
            )}
          </section>
        )}

        {/* ── TRANSACTIONS ── */}
        {tab === 'Transactions' && (
          <section className="space-y-4 transition-all duration-300">
            {/* ── V8.5 Review queue summary ── */}
            {transactions.length > 0 && (() => {
              const range = getPeriodDateRange(period)
              const periodSpend  = transactions
                .filter(tx => tx.date >= range.start && tx.date <= range.end && (tx.type === 'expense' || tx.type === 'credit card payment'))
                .reduce((s, tx) => s + tx.amount, 0)
              const rulesApplied = transactions.filter(tx => tx.appliedByRule).length
              return (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: 'Uncategorized',     value: uncategorizedExpenseCount,          alert: uncategorizedExpenseCount > 0 },
                    { label: 'Period Spend',       value: currency(periodSpend),              alert: false                          },
                    { label: 'Rules Applied',      value: rulesApplied,                       alert: false                          },
                    { label: 'Total Transactions', value: transactions.length,                alert: false                          },
                  ].map(({ label, value, alert }) => (
                    <div key={label} className="rounded-lg bg-slate-800 border border-slate-700/60 px-3 py-2.5">
                      <div className="text-xs text-slate-400 mb-1">{label}</div>
                      <div className={`text-xl font-bold ${alert ? 'text-amber-300' : 'text-slate-200'}`}>{value}</div>
                    </div>
                  ))}
                </div>
              )
            })()}
            <Card title="Log Transaction" noHover>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
                {/* Date */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Date</label>
                  <input
                    ref={txnDateRef}
                    type="date"
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={txnForm.date}
                    onChange={e => setTxnForm(v => ({ ...v, date: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); txnAccountRef.current?.focus() } }}
                  />
                </div>
                {/* Account */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Account</label>
                  <select
                    ref={txnAccountRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={txnForm.accountId || (accounts.length === 1 ? accounts[0].id : '')}
                    onChange={e => setTxnForm(v => ({ ...v, accountId: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) txnDateRef.current?.focus(); else txnMerchantRef.current?.focus() } }}
                  >
                    {accounts.length !== 1 && <option value="">Select account…</option>}
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                {/* Merchant */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Merchant / Description</label>
                  <input
                    ref={txnMerchantRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    placeholder="e.g. Whole Foods"
                    value={txnForm.merchant}
                    onChange={e => setTxnForm(v => ({ ...v, merchant: e.target.value }))}
              onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (e.shiftKey) {
                          txnAccountRef.current?.focus()
                        } else if (txnForm.accountId && txnForm.merchant.trim() && parseFloat(txnForm.amount) > 0) {
                          createOrSaveTxn()
                        } else {
                          txnAmountRef.current?.focus()
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
                      const num = parseFloat(e.target.value)
                      if (!isNaN(num) && num > 0) setTxnForm(v => ({ ...v, amount: num.toFixed(2) }))
                      else if (e.target.value !== '') setTxnForm(v => ({ ...v, amount: '' }))
                    }}
                    onKeyDown={e => {
                      if (['e', 'E', '+', '-'].includes(e.key)) { e.preventDefault(); return }
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault()
                        const cur = parseFloat(txnForm.amount) || 0
                        const next = e.key === 'ArrowUp' ? cur + 25 : Math.max(0, cur - 25)
                        setTxnForm(v => ({ ...v, amount: next === 0 ? '' : String(next) }))
                      }
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (e.shiftKey) {
                          txnMerchantRef.current?.focus()
                       } else if ((txnForm.accountId || accounts.length === 1) && txnForm.merchant.trim() && parseFloat(txnForm.amount) > 0) {
                          // All required fields filled — log the transaction directly
                          createOrSaveTxn()
                        } else {
                          txnTypeRef.current?.focus()
                        }
                      }
                    }}
                  />
                </div>
                {/* Type */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Type</label>
                  <select
                    ref={txnTypeRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={txnForm.type}
                    onChange={e => setTxnForm(v => ({ ...v, type: e.target.value as TransactionType }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) txnAmountRef.current?.focus(); else txnCategoryRef.current?.focus() } }}
                  >
                    {TXN_TYPES.map(t => <option key={t} value={t}>{TXN_TYPE_LABELS[t]}</option>)}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-0.5">Use Credit Card Payment when checking pays down a credit card.</p>
                </div>
                {/* Category */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Category <span className="text-slate-600">(optional)</span></label>
                  <select
                    ref={txnCategoryRef}
                    className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    value={txnForm.categoryId}
                    onChange={e => setTxnForm(v => ({ ...v, categoryId: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) txnTypeRef.current?.focus(); else txnNotesRef.current?.focus() } }}
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
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        if (e.shiftKey) {
                          txnCategoryRef.current?.focus()
                        } else if (txnForm.accountId && txnForm.merchant.trim() && parseFloat(txnForm.amount) > 0) {
                          createOrSaveTxn()
                        } else if (!txnForm.accountId) {
                          txnAccountRef.current?.focus()
                        } else if (!txnForm.merchant.trim()) {
                          txnMerchantRef.current?.focus()
                        } else {
                          txnAmountRef.current?.focus()
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
                  <button onClick={() => { if (window.confirm(`Clear all ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''}?`)) { setTxnWithHistory(() => []); showUndoableToast('Transactions cleared.', undoTxn) } }} className="rounded-lg px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors">Clear All</button>
                )}
                <button onClick={generateSampleTransaction} className="rounded-lg px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors" title="Instantly add a random sample transaction">Generate Sample</button>
                <button onClick={generateTenSamples} className="rounded-lg px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 transition-colors" title="Add 10 varied samples — mixed categories, some uncategorized, some duplicate-like">Generate 10 Samples</button>
              </div>
              {txnHint && <p className="mt-2 text-sm text-amber-300">{txnHint}</p>}
            </Card>

            {transactions.length > 0 ? (
              <Card title={`Transactions (${transactions.length})`}>
                {/* Filter pills */}
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {TXN_FILTER_OPTIONS.map(opt => {
                    const isUncategorized = opt.value === 'uncategorized'
                    const isActive = txnFilter === opt.value
                    const glowRing = isUncategorized && showUncategorizedGlow && !isActive
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setTxnFilter(opt.value)
                          if (isUncategorized) uncategorizedGlowSeenRef.current = true
                        }}
                        className={[
                          'rounded-full px-3 py-0.5 text-xs transition-colors',
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300',
                          glowRing ? 'ring-1 ring-amber-400/70 shadow-[0_0_6px_rgba(251,191,36,0.22)]' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        {opt.label}
                        {isUncategorized && uncategorizedExpenseCount > 0
                          ? ` (${uncategorizedExpenseCount})`
                          : ''}
                      </button>
                    )
                  })}
                </div>
               <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-1.5 pr-3 font-medium whitespace-nowrap">Date</th>
                        <th className="pb-1.5 pr-3 font-medium">Account</th>
                        <th className="pb-1.5 pr-3 font-medium">Merchant</th>
                        <th className="pb-1.5 pr-3 font-medium">Type</th>
                        <th className="pb-1.5 pr-3 font-medium">Category</th>
                        <th className="pb-1.5 pr-3 font-medium text-right whitespace-nowrap">Amount</th>
                        <th className="pb-1.5 pr-3 font-medium hidden sm:table-cell">Notes</th>
                        <th className="pb-1.5 sticky right-0 bg-slate-800" />
                      </tr>
                    </thead>
                    <tbody>
                      {[...transactions]
                        .filter(tx => {
                          if (txnFilter === 'uncategorized') return tx.type === 'expense' && !tx.categoryId
                          if (txnFilter === 'all') return true
                          return tx.type === txnFilter
                        })
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(tx => {
                        const acct = accounts.find(a => a.id === tx.accountId)
                        const cat  = categories.find(c => c.id === tx.categoryId)
                        const isInlineEdit = inlineTxnEditId === tx.id

                      if (isInlineEdit) {
                          // Blur-save helpers: schedule save on blur, cancel if focus moves within the row
                          const scheduleBlurSave = () => {
                            if (inlineEditBlurTimerRef.current) clearTimeout(inlineEditBlurTimerRef.current)
                            inlineEditBlurTimerRef.current = setTimeout(saveInlineTxnEdit, 150)
                          }
                          const cancelBlurSave = () => {
                            if (inlineEditBlurTimerRef.current) clearTimeout(inlineEditBlurTimerRef.current)
                          }
                          return (
                            <tr key={tx.id} className="border-b border-slate-700 bg-blue-950/20">
                              {/* Date */}
                              <td className="py-1.5 pr-2">
                                <input
                                  type="date"
                                  className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                  value={inlineTxnEditForm.date}
                                  onChange={e => { setInlineTxnEditForm(v => ({ ...v, date: e.target.value })); setTxnDupWarning(false) }}
                                  onFocus={cancelBlurSave}
                                  onBlur={scheduleBlurSave}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() } if (e.key === 'Escape') cancelInlineTxnEdit() }}
                                />
                              </td>
                              {/* Account */}
                              <td className="py-1.5 pr-2">
                                <select
                                  className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                  value={inlineTxnEditForm.accountId}
                                  onChange={e => setInlineTxnEditForm(v => ({ ...v, accountId: e.target.value }))}
                                  onFocus={cancelBlurSave}
                                  onBlur={scheduleBlurSave}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() } if (e.key === 'Escape') cancelInlineTxnEdit() }}
                                >
                                  <option value="">Account…</option>
                                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                                </select>
                              </td>
                              {/* Merchant — ArrowRight moves to Type */}
                              <td className="py-1.5 pr-2">
                                <input
                                  ref={inlineTxnMerchantRef}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                  value={inlineTxnEditForm.merchant}
                                  onFocus={e => { e.target.select(); cancelBlurSave() }}
                                  onBlur={scheduleBlurSave}
                                  onChange={e => { setInlineTxnEditForm(v => ({ ...v, merchant: e.target.value })); setTxnDupWarning(false) }}
                                 onKeyDown={e => {
  if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() }
  if (e.key === 'Escape') cancelInlineTxnEdit()
}}
                                />
                              </td>
                              {/* Type — ArrowLeft → Merchant, ArrowRight → Category */}
                              <td className="py-1.5 pr-2">
                                <select
                                  ref={inlineTxnTypeRef}
                                  className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                  value={inlineTxnEditForm.type}
                                  onChange={e => setInlineTxnEditForm(v => ({ ...v, type: e.target.value as TransactionType }))}
                                  onFocus={cancelBlurSave}
                                  onBlur={scheduleBlurSave}
                                  onKeyDown={e => {
                                    if (e.key === 'ArrowLeft')  { e.preventDefault(); inlineTxnMerchantRef.current?.focus(); inlineTxnMerchantRef.current?.select(); return }
                                    if (e.key === 'ArrowRight') { e.preventDefault(); inlineTxnCategoryRef.current?.focus(); return }
                                    if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() }
                                    if (e.key === 'Escape') cancelInlineTxnEdit()
                                  }}
                                >
                                  {TXN_TYPES.map(t => <option key={t} value={t}>{TXN_TYPE_LABELS[t]}</option>)}
                                </select>
                              </td>
                              {/* Category — ArrowLeft → Type, ArrowRight → Amount */}
                              <td className="py-1.5 pr-2">
                                <select
                                  ref={inlineTxnCategoryRef}
                                  className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                  value={inlineTxnEditForm.categoryId}
                                  onChange={e => setInlineTxnEditForm(v => ({ ...v, categoryId: e.target.value }))}
                                  onFocus={cancelBlurSave}
                                  onBlur={scheduleBlurSave}
                                  onKeyDown={e => {
                                    if (e.key === 'ArrowLeft')  { e.preventDefault(); inlineTxnTypeRef.current?.focus(); return }
                                    if (e.key === 'ArrowRight') { e.preventDefault(); inlineTxnAmountRef.current?.focus(); inlineTxnAmountRef.current?.select(); return }
                                    if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() }
                                    if (e.key === 'Escape') cancelInlineTxnEdit()
                                  }}
                                >
                                  <option value="">— none —</option>
                                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </td>
                              {/* Amount — default focus target; ArrowLeft → Category */}
                              <td className="py-1.5 pr-2">
                                <input
                                  ref={inlineTxnAmountRef}
                                  type="text"
                                  inputMode="decimal"
                                  className="w-24 px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none text-right"
                                  value={inlineTxnEditForm.amount}
                                  onFocus={e => { e.target.select(); cancelBlurSave() }}
                                  onBlur={scheduleBlurSave}
                                  onChange={e => {
                                    const raw = e.target.value.replace(/[^0-9.]/g, '')
                                    const parts = raw.split('.')
                                    const cleaned = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : raw
                                    setInlineTxnEditForm(v => ({ ...v, amount: cleaned }))
                                    setTxnDupWarning(false)
                                  }}
                                  onKeyDown={e => {
                                    if (['e', 'E', '+', '-'].includes(e.key)) { e.preventDefault(); return }
                                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                      e.preventDefault()
                                      const cur = parseFloat(inlineTxnEditForm.amount) || 0
                                      const next = e.key === 'ArrowUp' ? cur + 25 : Math.max(0, cur - 25)
                                      setInlineTxnEditForm(v => ({ ...v, amount: next === 0 ? '' : String(next) }))
                                      setTxnDupWarning(false)
                                      return
                                    }
                                    if (e.key === 'ArrowLeft') { e.preventDefault(); inlineTxnCategoryRef.current?.focus(); return }
                                    if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() }
                                    if (e.key === 'Escape') cancelInlineTxnEdit()
                                  }}
                                />
                              </td>
                              {/* Notes */}
                              <td className="py-1.5 pr-2">
                                <input
                                  className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                  value={inlineTxnEditForm.notes}
                                  onFocus={cancelBlurSave}
                                  onBlur={scheduleBlurSave}
                                  onChange={e => setInlineTxnEditForm(v => ({ ...v, notes: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() } if (e.key === 'Escape') cancelInlineTxnEdit() }}
                                />
                              </td>
                              <td className="py-1.5 whitespace-nowrap space-x-2">
                                <button
                                  className="text-blue-400 hover:text-blue-300 text-xs"
                                  onMouseDown={cancelBlurSave}
                                  onClick={saveInlineTxnEdit}
                                >Save</button>
                                <button
                                  className="text-slate-400 hover:text-slate-300 text-xs"
                                  onMouseDown={cancelBlurSave}
                                  onClick={cancelInlineTxnEdit}
                                >Cancel</button>
                              </td>
                            </tr>
                          )
                        }
                        const txTypeColor = tx.type === 'income' ? 'bg-green-900/50 text-green-300' : tx.type === 'transfer' ? 'bg-blue-900/50 text-blue-300' : tx.type === 'credit card payment' ? 'bg-purple-900/50 text-purple-300' : 'bg-slate-700 text-slate-300'
                        return (
                          <tr key={tx.id} className={`border-b border-slate-800 transition-colors duration-300 ${highlightedTxnId === tx.id ? 'bg-blue-600/20' : 'hover:bg-slate-800/40'}`}>
                            <td className="py-2 pr-3 text-slate-300 text-xs whitespace-nowrap">{tx.date}</td>
                            <td className="py-2 pr-3 text-slate-400 text-xs">{acct?.name ?? '—'}</td>
                            <td className="py-2 pr-3 font-medium">{tx.merchant}</td>
                            <td className="py-2 pr-3">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${txTypeColor}`}>{TXN_TYPE_LABELS[tx.type]}</span>
                            </td>
                            <td className="py-2 pr-3 text-slate-400 text-xs">
                              {cat?.name ?? '—'}
                              {tx.appliedByRule && (
                                <span className="ml-1.5 text-[9px] text-indigo-400 bg-indigo-900/40 border border-indigo-700/40 px-1 py-0.5 rounded">Rule Applied</span>
                              )}
                            </td>
                            <td className={`py-2 pr-3 text-right font-semibold ${tx.type === 'income' ? 'text-green-400' : 'text-slate-100'}`}>
                              {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{currency(tx.amount)}
                            </td>
                            <td className="py-2 pr-3 text-slate-500 text-xs max-w-[100px] truncate hidden sm:table-cell">{tx.notes ?? '—'}</td>
                            <td className="py-2 whitespace-nowrap space-x-2">
                              <button className="text-blue-400 hover:text-blue-300 text-xs" onClick={() => {
                                setInlineTxnEditId(tx.id)
                                setInlineTxnEditForm({ date: tx.date, accountId: tx.accountId, merchant: tx.merchant, amount: String(tx.amount), type: tx.type, categoryId: tx.categoryId ?? '', notes: tx.notes ?? '' })
                                setTxnDupWarning(false)
                                setTimeout(() => { inlineTxnAmountRef.current?.focus(); inlineTxnAmountRef.current?.select() }, 0)
                              }}>Edit</button>
                              <button className="text-red-400 hover:text-red-300 text-xs" onClick={() => setTxnWithHistory(prev => prev.filter(x => x.id !== tx.id))}>Delete</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ) : (
              <p className="text-center text-slate-500 text-sm py-8">
                No transactions yet.
                {accounts.length === 0 && <span className="block mt-1 text-slate-600 text-xs">Add an account first to start logging transactions.</span>}
              </p>
            )}

            {/* ── V8.5.1 Uncategorized Expenses ── only expense transactions need budget categories */}
            {uncategorizedExpenseCount > 0 && (
              <Card title={`Uncategorized Expenses (${uncategorizedExpenseCount})`}>
                <p className="text-xs text-slate-400 mb-3">
                  Only expenses need budget categories. Transfers, income, and credit card payments do not count toward Budget Actuals.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-400 border-b border-slate-700">
                        <th className="pb-1.5 pr-3 font-medium">Date</th>
                        <th className="pb-1.5 pr-3 font-medium">Account</th>
                        <th className="pb-1.5 pr-3 font-medium">Merchant</th>
                        <th className="pb-1.5 pr-3 font-medium">Type</th>
                        <th className="pb-1.5 pr-3 font-medium text-right">Amount</th>
                        <th className="pb-1.5 pr-3 font-medium">Quick Assign</th>
                        <th className="pb-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {[...transactions]
                        .filter(tx => !tx.categoryId && tx.type === 'expense')
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .map(tx => {
                          const acct = accounts.find(a => a.id === tx.accountId)
                          const txTypeColor = tx.type === 'income' ? 'bg-green-900/50 text-green-300' : tx.type === 'transfer' ? 'bg-blue-900/50 text-blue-300' : tx.type === 'credit card payment' ? 'bg-purple-900/50 text-purple-300' : 'bg-slate-700 text-slate-300'
                          return (
                            <tr key={tx.id} className="border-b border-slate-800 hover:bg-amber-900/10 transition-colors">
                              <td className="py-2 pr-3 text-slate-300 text-xs whitespace-nowrap">{tx.date}</td>
                              <td className="py-2 pr-3 text-slate-400 text-xs">{acct?.name ?? '—'}</td>
                              <td className="py-2 pr-3 font-medium">{tx.merchant}</td>
                              <td className="py-2 pr-3">
                                <span className={`text-xs px-1.5 py-0.5 rounded ${txTypeColor}`}>{TXN_TYPE_LABELS[tx.type]}</span>
                              </td>
                              <td className={`py-2 pr-3 text-right font-semibold ${tx.type === 'income' ? 'text-green-400' : 'text-slate-100'}`}>
                                {tx.type === 'income' ? '+' : '−'}{currency(tx.amount)}
                              </td>
                              <td className="py-2 pr-3">
                                <select
                                  className="px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                                  value=""
                                  onChange={e => {
                                    if (!e.target.value) return
                                    setTxnWithHistory(prev => prev.map(x =>
                                      x.id === tx.id ? { ...x, categoryId: e.target.value } : x
                                    ))
                                  }}
                                >
                                  <option value="">Assign category…</option>
                                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </td>
                              <td className="py-2 whitespace-nowrap space-x-2">
                                <button className="text-blue-400 hover:text-blue-300 text-xs" onClick={() => {
                                  setInlineTxnEditId(tx.id)
                                  setInlineTxnEditForm({ date: tx.date, accountId: tx.accountId, merchant: tx.merchant, amount: String(tx.amount), type: tx.type, categoryId: tx.categoryId ?? '', notes: tx.notes ?? '' })
                                  setTxnFilter('all')
                                  setTxnDupWarning(false)
                                  setTimeout(() => { inlineTxnAmountRef.current?.focus(); inlineTxnAmountRef.current?.select() }, 0)
                                }}>Edit</button>
                                <button className="text-red-400 hover:text-red-300 text-xs" onClick={() => setTxnWithHistory(prev => prev.filter(x => x.id !== tx.id))}>Delete</button>
                              </td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {/* ── V8.3 Transaction Rules ── */}
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
                  <button onClick={() => { if (window.confirm(`Clear all ${rules.length} rule${rules.length !== 1 ? 's' : ''}?`)) { setRulesWithHistory(() => []); showUndoableToast('Transaction rules cleared.', undoRule) } }} className="rounded-lg px-3 py-1.5 text-xs bg-red-900/60 hover:bg-red-800 text-red-300 transition-colors">Clear All</button>
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
                        <th className="pb-1.5" />
                      </tr>
                    </thead>
                    <tbody>
                      {rules.map(r => {
                        const cat = categories.find(c => c.id === r.categoryId)
                        const isInlineEdit = inlineRuleEditId === r.id
                        if (isInlineEdit) {
                          return (
                            <tr key={r.id} className="border-b border-slate-700 bg-blue-950/20">
                           <td className="py-1.5 pr-2">
                                <input
                                  ref={inlineRuleMatchRef}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none font-mono"
                                  value={inlineRuleEditForm.matchText}
                                  onFocus={e => e.target.select()}
                                  onChange={e => setInlineRuleEditForm(v => ({ ...v, matchText: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveInlineRuleEdit(); if (e.key === 'Escape') cancelInlineRuleEdit() }}
                                />
                              </td>
                             <td className="py-1.5 pr-2">
                                <input
                                  ref={inlineRuleMatchRef}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none font-mono"
                                  value={inlineRuleEditForm.matchText}
                                  onFocus={e => e.target.select()}
                                  onChange={e => setInlineRuleEditForm(v => ({ ...v, matchText: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter') saveInlineRuleEdit(); if (e.key === 'Escape') cancelInlineRuleEdit() }}
                                />
                              </td>
                              <td className="py-1.5 pr-2">
                                <select className="px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none" value={inlineRuleEditForm.matchField} onChange={e => setInlineRuleEditForm(v => ({ ...v, matchField: e.target.value as 'merchant' | 'notes' }))}>
                                  <option value="merchant">Merchant</option>
                                  <option value="notes">Notes</option>
                                </select>
                              </td>
                              <td className="py-1.5 pr-2">
                                <select className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none" value={inlineRuleEditForm.categoryId} onChange={e => setInlineRuleEditForm(v => ({ ...v, categoryId: e.target.value }))}>
                                  <option value="">— none —</option>
                                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </td>
                              <td className="py-1.5 pr-2">
                                <select className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none" value={inlineRuleEditForm.type} onChange={e => setInlineRuleEditForm(v => ({ ...v, type: e.target.value as TransactionType | '' }))}>
                                  <option value="">— any —</option>
                                  {TXN_TYPES.map(t => <option key={t} value={t}>{TXN_TYPE_LABELS[t]}</option>)}
                                </select>
                              </td>
                              <td className="py-1.5 whitespace-nowrap space-x-2">
                                <button className="text-blue-400 hover:text-blue-300 text-xs" onClick={saveInlineRuleEdit}>Save</button>
                                <button className="text-slate-400 hover:text-slate-300 text-xs" onClick={cancelInlineRuleEdit}>Cancel</button>
                              </td>
                            </tr>
                          )
                        }
                        return (
                          <tr key={r.id} className={`border-b border-slate-800 transition-colors duration-300 ${highlightedRuleId === r.id ? 'bg-blue-600/20' : 'hover:bg-slate-800/40'}`}>
                            <td className="py-2 pr-3 font-medium">{r.name}</td>
                            <td className="py-2 pr-3 font-mono text-xs text-slate-300">{r.matchText}</td>
                            <td className="py-2 pr-3 text-slate-400 text-xs capitalize">{r.matchField}</td>
                            <td className="py-2 pr-3 text-xs">{cat ? <span className="text-slate-400">{cat.name}</span> : <span className="text-red-400">missing</span>}</td>
                            <td className="py-2 pr-3 text-slate-400 text-xs">{r.type ? TXN_TYPE_LABELS[r.type] : '—'}</td>
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
                <p className="mt-3 text-sm text-slate-500">No rules yet. Add a rule above to auto-categorize new transactions.</p>
              )}
            </Card>
          </section>
        )}

        {/* ── SCENARIOS ── */}
        {tab === 'Scenarios' && (
          <section className="space-y-4 transition-all duration-300">
            <Card title="Scenario Set Manager">
              <div className="flex gap-2 mb-3">{periods.map(p => <Pill key={p} active={period === p} onClick={() => setPeriod(p)}>{labelPeriod(p)}</Pill>)}</div>
              <div className="grid md:grid-cols-4 gap-2">
                {(['Slow', 'Medium', 'Fast', 'Custom'] as ScenarioName[]).map(n => (
                  <div key={n}>
                    <label className="text-xs text-slate-400">{n}</label>
                    <input ref={n === 'Slow' ? scenarioSlowRef : undefined} type="number" min={0} step={100} value={scenario[n]} onChange={e => setScenario(v => ({ ...v, [n]: Math.max(0, Number(e.target.value) || 0) }))} className="w-full p-2 rounded bg-slate-800 border border-slate-600" />
                  </div>
                ))}
              </div>
              <div className="grid md:grid-cols-3 gap-2 mt-3">
                <input className="p-2 rounded bg-slate-800 border border-slate-600" placeholder="Scenario set name" value={scenarioTitle} onChange={e => setScenarioTitle(e.target.value)} />
                <button className="rounded bg-blue-600" onClick={() => { const n = scenarioTitle.trim(); if (!n) return; const ex = savedScenarios.find(x => x.name.toLowerCase() === n.toLowerCase()); if (ex && !window.confirm('Overwrite existing set?')) return; setSavedScenarios([{ name: n, scenarios: scenario, period: period, savedAt: new Date().toISOString() }, ...savedScenarios.filter(x => x.name.toLowerCase() !== n.toLowerCase())]) }}>Save Scenario Set</button>
                <div className="text-xs text-slate-400 self-center">Saved locally</div>
              </div>
              <div className="space-y-2 mt-2">
                {savedScenarios.map(s => (
                  <div key={s.name} className="rounded border border-slate-700 p-2 flex justify-between">
                    <div><div>{s.name}</div><div className="text-xs text-slate-400">{new Date(s.savedAt).toLocaleString()}</div></div>
                    <div className="flex gap-2">
                      <button className="text-blue-300" onClick={() => { setScenario(s.scenarios); setPeriod(s.period) }}>Load</button>
                      <button className="text-red-300" onClick={() => setSavedScenarios(prev => prev.filter(x => x.name !== s.name))}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <div className="grid md:grid-cols-2 gap-3">
              {(['Slow', 'Medium', 'Fast', 'Custom'] as ScenarioName[]).map(n => {
                const ii = income(scenario[n], adjustedSalary)
                const rem = convertFromMonthly(ii.totalMonthly - monthlyBudget, period)
                const tone = n === 'Slow' ? 'border-yellow-500/60 text-yellow-200' : n === 'Medium' ? 'border-blue-500/60 text-blue-200' : n === 'Fast' ? 'border-green-500/60 text-green-200' : 'border-slate-300/60 text-slate-100'
                const b = n === 'Slow' ? '#facc15' : n === 'Medium' ? '#60a5fa' : n === 'Fast' ? '#4ade80' : '#cbd5e1'
                return (
                  <Card key={n} title={`${n} Scenario`} className={tone} style={{ borderColor: b, borderWidth: 2 }}>
                    <Row l="Monthly Gross Profit Input" v={currency(scenario[n])} />
                    <Row l={`Converted Gross Profit (${labelPeriod(period)})`} v={currency(convertFromMonthly(scenario[n], period))} />
                    <Row l="Commission" v={currency(convertFromMonthly(ii.cMonthly, period))} />
                    <Row l="Base net income" v={currency(convertFromMonthly(ii.baseMonthly, period))} />
                    <Row l="Total net income" v={currency(convertFromMonthly(ii.totalMonthly, period))} />
                    <Row l="Effective hourly rate" v={currency(ii.totalWeekly / HOURS_PER_WEEK) + ' /hr'} />
                    <Row l="Remaining after budget" v={currency(rem)} valueClass={
                      rem >= 0 ? 'text-green-400'
                        : varianceTone(-rem, period) === 'neutral' ? 'text-slate-300'
                        : varianceTone(-rem, period) === 'warn' ? 'text-yellow-300'
                        : 'text-red-400'
                    } />
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
                onClick={() => { if (!targets.length) return; setTargetsWithHistory(() => []) }}
                className="rounded-lg px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 text-red-200"
              >
                Clear Savings Goals
              </button>
            </div>

            <Card title="Savings Goal Sets" noHover>
              <div className="grid md:grid-cols-3 gap-2">
                <input className="p-2 rounded bg-slate-800 border border-slate-600" value={targetSetName} onChange={(e) => setTargetSetName(e.target.value)} placeholder="Savings goal set name" />
                <button className="rounded bg-blue-600" onClick={() => { const n = targetSetName.trim(); if (!n) return; setSavedTargetSets([{ name: n, targets, savedAt: new Date().toISOString() }, ...savedTargetSets.filter(s => s.name.toLowerCase() !== n.toLowerCase())]) }}>Save</button>
                <div className="text-xs text-slate-400 self-center">Saved locally</div>
              </div>
              <div className="space-y-2 mt-2">
                {savedTargetSets.map(s => (
                  <div key={s.name} className="rounded border border-slate-700 p-2 flex justify-between">
                    <div><div>{s.name}</div><div className="text-xs text-slate-400">{new Date(s.savedAt).toLocaleString()}</div></div>
                    <div className="flex gap-2">
                      <button className="text-blue-300" onClick={() => setTargets(s.targets)}>Load</button>
                      <button className="text-red-300" onClick={() => setSavedTargetSets(prev => prev.filter(x => x.name !== s.name))}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Active Targets */}
            <section className="space-y-3">
              <h3 className="text-base font-semibold text-slate-200">Active Savings Goals ({activeTargets.length})</h3>
              {activeTargets.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-3">
                  {activeTargets.map(t => renderTargetCard(t))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No active savings goals.</p>
              )}
            </section>

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

      {/* Toast notification — top-left, warning style, Undo when applicable */}
      {toast && (
        <div
          className="fixed top-5 left-5 z-50 flex items-center gap-3 rounded-xl border border-amber-600/60 bg-amber-950/90 px-4 py-3 shadow-2xl text-sm text-amber-100 transition-all duration-300 cursor-pointer max-w-sm"
          style={{ opacity: toast.visible ? 1 : 0 }}
          onClick={() => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(null) }}
        >
          <span className="flex-1">{toast.message}</span>
          {toast.onUndo ? (
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
          ) : (
            <button
              className="ml-1 rounded bg-amber-800 hover:bg-amber-700 px-2 py-0.5 text-xs transition-colors shrink-0"
              onClick={e => { e.stopPropagation(); if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(null) }}
            >
              OK
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

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Card({ title, children, className = '', style, headerAction, noHover = false }: { title: string; children: React.ReactNode; className?: string; style?: React.CSSProperties; headerAction?: React.ReactNode; noHover?: boolean }) {
  return (
    <div style={style} className={`rounded-2xl border border-slate-700 bg-slate-800/80 shadow-lg p-4 md:p-5 transition-all duration-200 ${noHover ? '' : 'hover:-translate-y-0.5'} ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {headerAction}
      </div>
      {children}
    </div>
  )
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-3 py-1.5 rounded text-sm ${active ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'} transition`}>{children}</button>
}

function Metric({ title, value, tone = 'neutral', featured = false, glow = false }: { title: string; value: string; tone?: 'neutral' | 'good' | 'warn' | 'risk' | 'danger'; featured?: boolean; glow?: boolean }) {
  const c = tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-yellow-300' : tone === 'risk' ? 'text-orange-300' : tone === 'danger' ? 'text-red-300' : 'text-slate-100'
  return (
    <div
      className={`rounded-xl border p-3 ${featured ? 'border-sky-200/70 bg-gradient-to-br from-slate-700 via-slate-700/95 to-slate-600/95 shadow-[0_0_24px_rgba(125,211,252,0.28)]' : 'border-slate-700 bg-slate-800'} ${glow ? 'shadow-[0_0_22px_rgba(248,113,113,0.36)] border-red-400/85 bg-gradient-to-br from-red-800/45 via-red-900/38 to-red-950/34 ring-1 ring-red-300/40' : ''}`}
      style={glow ? { boxShadow: 'inset 0 0 20px rgba(248,113,113,0.18), 0 0 22px rgba(248,113,113,0.36)' } : undefined}
    >
      <div className="text-xs text-slate-400 mb-1">{title}</div>
      <div className="flex items-center justify-between gap-2">
        <div className={`${featured ? 'text-xl text-sky-100' : `text-xl ${c}`} font-bold`}>{value}</div>
        {featured && <div className="inline-flex rounded-full border border-sky-200/40 bg-slate-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100">Primary Take-Home</div>}
      </div>
    </div>
  )
}

function Info({ title, value, className = '', tone = 'neutral', glow = false }: { title: string; value: string; className?: string; tone?: 'neutral' | 'good' | 'warn' | 'risk' | 'danger'; glow?: boolean }) {
  const tc = tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-yellow-300' : tone === 'risk' ? 'text-orange-300' : tone === 'danger' ? 'text-red-300' : 'text-slate-100'
  return (
    <div
      className={`rounded-xl border border-slate-700 bg-slate-800 p-3 ${glow ? 'shadow-[0_0_22px_rgba(248,113,113,0.34)] border-red-400/85 bg-gradient-to-br from-red-800/45 via-red-900/38 to-red-950/34 ring-1 ring-red-300/35' : ''}`}
      style={glow ? { boxShadow: 'inset 0 0 18px rgba(248,113,113,0.17), 0 0 22px rgba(248,113,113,0.34)' } : undefined}
    >
      <div className="text-xs text-slate-400 mb-1">{title}</div>
      <div className={`font-semibold ${tc} ${className}`}>{value}</div>
    </div>
  )
}

function ActionCard({ title, description, onClick, tone = 'neutral' }: { title: string; description: string; onClick: () => void; tone?: 'neutral' | 'warn' | 'good' }) {
  const accent = tone === 'warn' ? 'border-yellow-500/40 hover:border-yellow-400/60' : tone === 'good' ? 'border-green-500/40 hover:border-green-400/60' : 'border-slate-600/60 hover:border-slate-500/80'
  const dot = tone === 'warn' ? 'bg-yellow-400' : tone === 'good' ? 'bg-green-400' : 'bg-slate-500'
  return (
    <button
      onClick={onClick}
      className={`group text-left rounded-xl border ${accent} bg-slate-800/70 hover:bg-slate-700/80 p-3 transition-all duration-200 hover:-translate-y-0.5 shadow-sm w-full`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {tone !== 'neutral' && <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${dot}`} />}
        <span className="text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">{title}</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
    </button>
  )
}

function Row({ l, v, valueClass = 'text-slate-100' }: { l: string; v: string; valueClass?: string }) {
  return (
    <div className="py-1.5 border-b border-slate-700 last:border-b-0 flex justify-between gap-2 text-sm">
      <span className="text-slate-400 shrink-0">{l}</span>
      <span className={`font-medium text-right ${valueClass}`}>{v}</span>
    </div>
  )
}
