import { useEffect, useMemo, useRef, useState } from 'react'
import type { Tab, Period, CategoryType, Category, ScenarioName, SavedBudget, SavedScenarioSet, BudgetSnapshot, Contribution, Target, SavedTargetSet } from './types'
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
  loadCategories,
  loadSavedBudgets,
  loadSavedScenarios,
  loadTargets,
  loadSavedTargetSets,
  saveTab,
  saveCategories,
  saveSavedBudgets,
  saveSavedScenarios,
  saveTargets,
  saveSavedTargetSets,
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

const periods: Period[] = ['weekly', 'bi-weekly', 'monthly', 'yearly']
const targetPresets = ['Bike', 'Emergency Fund', 'Long-term Savings', 'Tuition', 'Custom']
const tabTips: Record<Tab, string> = {
  Dashboard: 'See your take-home pay, leftover money, warnings, and log savings from each paycheck.',
  Income: 'Change gross profit to see how your paycheck and commission change.',
  Budget: 'Plan your spending, savings, and investing.',
  Scenarios: 'Compare different income levels like slow, medium, fast, or custom.',
  Targets: 'Set savings goals, deadlines, and track what you actually save. Use goal cards to log contributions and monitor progress.',
}

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
  const [period, setPeriod] = useState<Period>('monthly')
  const [gpInput, setGpInput] = useState('5000')
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

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; visible: boolean } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Highlighted budget category (after Add to Current Budget)
  const [highlightedCategoryId, setHighlightedCategoryId] = useState<string | null>(null)
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (message: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ message, visible: true })
    toastTimerRef.current = setTimeout(() => setToast(null), 15000)
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

  // Refs for Log Contribution fields per target card (keyed by target id)
  const logDateRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const logAmountRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const logNoteRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const logDateArrowCounts = useRef<Record<string, number>>({})

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
    const c = loadCategories(); if (c) setCategories(c)
    const b = loadSavedBudgets(); if (b) setSavedBudgets(b)
    const s = loadSavedScenarios(); if (s) setSavedScenarios(s)
    const t = loadTargets(); if (t) setTargets(t)
    const ts = loadSavedTargetSets(); if (ts) setSavedTargetSets(ts)
  }, [])
  useEffect(() => saveTab(tab), [tab])
  useEffect(() => saveCategories(categories), [categories])
  useEffect(() => saveSavedBudgets(savedBudgets), [savedBudgets])
  useEffect(() => saveSavedScenarios(savedScenarios), [savedScenarios])
  useEffect(() => saveTargets(targets), [targets])
  useEffect(() => saveSavedTargetSets(savedTargetSets), [savedTargetSets])

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

  // Tab focus
  useEffect(() => {
    if (tab === 'Income') incomeRef.current?.focus()
    if (tab === 'Budget') { budgetNameRef.current?.focus(); setShowSuggestions(true) }
    if (tab === 'Scenarios') scenarioSlowRef.current?.focus()
    if (tab === 'Targets') { targetNameRef.current?.focus(); setShowTargetSuggestions(true) }
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
  const periodPhrase = period === 'weekly' ? 'this week' : period === 'bi-weekly' ? 'this pay period' : period === 'monthly' ? 'this month' : 'this year'
  const statusLabel = !hasBudgetData ? 'No Data' : selectedPeriodRemaining < 0 ? 'Over Budget' : remainingTier.label
  const statusTone: 'good' | 'warn' | 'risk' | 'danger' = !hasBudgetData ? 'warn' : selectedPeriodRemaining < 0 ? 'danger' : statusLabel === 'Moderate' ? 'warn' : statusLabel === 'Risk' ? 'risk' : 'good'
  const topVariable = [...categories].filter((c) => c.type === 'variable spending').sort((a, b) => b.amount - a.amount)[0]
  const topBill = [...categories].filter((c) => c.type !== 'savings' && c.type !== 'investing').sort((a, b) => b.amount - a.amount)[0]
  const welcome = !hasBudgetData
    ? 'No budget data yet. Add expenses to see your financial health.'
    : selectedPeriodRemaining < 0
      ? topVariable
        ? `You are over budget by ${currency(Math.abs(selectedPeriodRemaining))} ${periodPhrase}. Start by reviewing ${topVariable.name}, your largest flexible expense.`
        : `You are over budget by ${currency(Math.abs(selectedPeriodRemaining))} ${periodPhrase}. ${fixedRatio.toFixed(1)}% of your spending is fixed, so review your largest bill first: ${topBill?.name ?? 'your top bill'}.`
      : statusLabel === 'Moderate' || statusLabel === 'Risk'
        ? topVariable
          ? `Your cushion is tight ${periodPhrase}. Reviewing ${topVariable.name} could give you more breathing room.`
          : `Your cushion is tight ${periodPhrase}. Review your biggest bill to improve breathing room.`
        : `You have a healthy cushion ${periodPhrase} and your savings rate is strong.`
  const remainingCushionPct = selectedPeriodTotalNet > 0 ? (selectedPeriodRemaining / selectedPeriodTotalNet) * 100 : 0
  const savingsTone: 'good' | 'warn' | 'danger' = savingsRate >= 35 ? 'good' : savingsRate >= 20 ? 'warn' : 'danger'
  const cushionTone: 'good' | 'warn' | 'risk' | 'danger' = remainingTone
  const biggestExpenseTone: 'neutral' | 'good' | 'warn' | 'danger' = top[0] && selectedPeriodTotalNet > 0 && convertFromMonthly(top[0].amount, period) > selectedPeriodTotalNet * 0.5 ? 'danger' : 'neutral'
  const totalBudgetRatio = selectedPeriodTotalNet > 0 ? convertFromMonthly(monthlyBudget, period) / selectedPeriodTotalNet : 0
  const totalBudgetTone: 'neutral' | 'warn' | 'danger' = totalBudgetRatio > 0.9 ? 'danger' : totalBudgetRatio > 0.7 ? 'warn' : 'neutral'

  // ── V7.3 Dashboard Status Engine ───────────────────────────────────────────
  const activeTargets = targets.filter(t => !t.completed && (t.goalAmount <= 0 || t.currentSaved < t.goalAmount))
  const dashboardStatus: DashboardStatus = useMemo(() => computeDashboardStatus({
    totalMonthly: inc.totalMonthly,
    monthlyBudget,
    monthlyLeft,
    savingsRate,
    fixedRatio,
    commissionPct: inc.commissionPct,
    categories,
    activeTargets,
    period,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [inc.totalMonthly, monthlyBudget, monthlyLeft, savingsRate, fixedRatio, inc.commissionPct, categories, activeTargets, period])

  const createSnapshot = (): BudgetSnapshot => ({ categories: categories.map((c) => ({ ...c })), form: { ...form }, editId })
  const pushBudgetHistory = () => { setBudgetHistory((prev) => [...prev.slice(-19), createSnapshot()]); setBudgetRedo([]) }
  const commitFormCheckpoint = () => {
    const snap = createSnapshot()
    setBudgetHistory((prev) => {
      const last = prev[prev.length - 1]
      if (last && JSON.stringify(last.form) === JSON.stringify(snap.form) && last.editId === snap.editId) return prev
      return [...prev.slice(-19), snap]
    })
  }

  const undoBudget = () => {
    setBudgetHistory((prev) => {
      if (!prev.length) return prev
      const next = [...prev]
      const prior = next.pop()!
      setBudgetRedo((redo) => [...redo.slice(-19), createSnapshot()])
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

  const upsert = () => {
    const amt = Math.max(0, Number(form.amount) || 0)
    const monthlyAmt = convertToMonthly(amt, period)
    const n = form.name.trim()
    if (!n || monthlyAmt <= 0) {
      setBudgetFormHint('Enter a category and amount.')
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
      setTargetFormHint('A savings goal with this name, deadline, and goal amount already exists.')
      targetNameRef.current?.focus()
      return
    }
    const softConflict = targets.find(t => (sameName(t) && sameDeadline(t)) || (sameName(t) && sameGoal(t)))
    if (softConflict && !targetFormHint.startsWith('Possible duplicate')) {
      setTargetFormHint('Possible duplicate: please confirm this is not the same savings goal.')
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
      setEditTargetHint('A savings goal with this name, deadline, and goal amount already exists.')
      return
    }
    const softConflict = targets.find(t => other(t) && ((sameName(t) && sameDeadline(t)) || (sameName(t) && sameGoal(t))))
    if (softConflict && !editTargetHint.startsWith('Possible duplicate')) {
      setEditTargetHint('Possible duplicate: please confirm this is not the same savings goal.')
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
            {(['Dashboard', 'Income', 'Budget', 'Scenarios', 'Targets'] as Tab[]).map(t => (
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
                description="See how your income is allocated across bills, spending, and savings."
                onClick={() => setTab('Budget')}
                tone="neutral"
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
                <Metric title="Total available income" value={currency(selectedPeriodTotalNet)} />
                <Metric title="Total planned expenses" value={currency(convertFromMonthly(monthlyBudget, period))} />
                <Metric title="Remaining amount" value={currency(selectedPeriodRemaining)} tone={remainingTone} glow={selectedPeriodRemaining < 0} />
                <Metric title="Budget status" value={statusLabel} tone={statusTone} glow={selectedPeriodRemaining < 0} />
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
                  onChange={e => { setForm(v => ({ ...v, amount: e.target.value })); setBudgetFormHint('') }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); commitFormCheckpoint(); budgetTypeRef.current?.focus() }
                    if (e.key === 'ArrowLeft') { e.preventDefault(); commitFormCheckpoint(); budgetNameRef.current?.focus() }
                  }}
                />
                <select
                  ref={budgetTypeRef}
                  className="p-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={form.type}
                  onKeyDown={e => {
                    if (['1', '2', '3', '4'].includes(e.key)) { const m = { '1': 'fixed bill', '2': 'variable spending', '3': 'savings', '4': 'investing' } as const; setForm(v => ({ ...v, type: m[e.key as keyof typeof m] })) }
                    if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); commitFormCheckpoint(); upsert() }
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
                <button onClick={() => { if (!categories.length) return; pushBudgetHistory(); setCategories([]) }} className="rounded-lg px-3 py-1.5 bg-slate-700 hover:bg-slate-600">Reset Budget</button>
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
                    <th>Name</th>
                    <th>Type</th>
                    {period === 'weekly' && <><th>Weekly</th><th>Monthly</th></>}
                    {period === 'bi-weekly' && <><th>Bi-weekly</th><th>Monthly</th></>}
                    {period === 'monthly' && <th>Monthly</th>}
                    {period === 'yearly' && <><th>Monthly</th><th>Yearly</th></>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {top.map(c => (
                    <tr key={c.id} className={`border-b border-slate-800 transition-colors duration-300 ${highlightedCategoryId === c.id ? 'bg-blue-600/20' : ''}`}>
                      <td>{c.name}</td>
                      <td>{c.type === 'fixed bill' ? 'Fixed Bill' : c.type === 'variable spending' ? 'Variable Spending' : c.type === 'savings' ? 'Savings' : 'Investing'}</td>
                      {period === 'weekly' && <><td>{currency(convertFromMonthly(c.amount, 'weekly'))}</td><td>{currency(c.amount)}</td></>}
                      {period === 'bi-weekly' && <><td>{currency(convertFromMonthly(c.amount, 'bi-weekly'))}</td><td>{currency(c.amount)}</td></>}
                      {period === 'monthly' && <td>{currency(c.amount)}</td>}
                      {period === 'yearly' && <><td>{currency(c.amount)}</td><td>{currency(convertFromMonthly(c.amount, 'yearly'))}</td></>}
                      <td className="space-x-2">
                        <button className="text-blue-300" onClick={() => { setForm({ name: c.name, amount: String(convertFromMonthly(c.amount, period)), type: c.type }); setEditId(c.id); budgetNameRef.current?.focus() }}>Edit</button>
                        <button className="text-red-300" onClick={() => { pushBudgetHistory(); setCategories(prev => prev.filter(x => x.id !== c.id)) }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
                    <Row l="Remaining after budget" v={currency(rem)} valueClass={rem < 0 ? 'text-red-400' : 'text-green-400'} />
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
                <div>
                  <button className="w-full px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 transition-colors" onClick={createTarget}>Create Savings Goal</button>
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

      {/* Toast notification */}
      {toast && (
        <div
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 shadow-2xl text-sm text-slate-100 transition-all duration-300 cursor-pointer"
          style={{ opacity: toast.visible ? 1 : 0 }}
          onClick={() => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(null) }}
        >
          <span>{toast.message}</span>
          <button
            className="ml-1 rounded bg-slate-700 hover:bg-slate-600 px-2 py-0.5 text-xs transition-colors"
            onClick={e => { e.stopPropagation(); if (toastTimerRef.current) clearTimeout(toastTimerRef.current); setToast(null) }}
          >
            OK
          </button>
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
