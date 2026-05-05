import { useEffect, useMemo, useRef, useState } from 'react'
 
type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Scenarios' | 'Targets'
type Period = 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'
type CategoryType = 'fixed bill' | 'variable spending' | 'savings' | 'investing'
type Category = { id: string; name: string; amount: number; type: CategoryType }
type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'
type SavedBudget = { name: string; categories: Category[]; savedAt: string }
type SavedScenarioSet = { name: string; scenarios: Record<ScenarioName, number>; period: Period; savedAt: string }
type BudgetSnapshot = { categories: Category[]; form: { name: string; amount: string; type: CategoryType }; editId: string | null }
type Contribution = { id: string; date: string; amount: number; note: string }
type Target = { id: string; name: string; goalAmount: number; currentSaved: number; startDate?: string; deadline: string; createdAt?: string; type: 'savings'; contributions: Contribution[]; completed?: boolean }
type SavedTargetSet = { name: string; targets: Target[]; savedAt: string }
 
const BASE_SALARY = 40000
const TAKE_HOME_RATE = 0.8243
const HOURS_PER_WEEK = 45
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
const scenarioDefaults: Record<ScenarioName, number> = { Slow: 8000, Medium: 15000, Fast: 30000, Custom: 10000 }
const commissionBrackets = [{ upTo: 5000, rate: 0.04 }, { upTo: 10000, rate: 0.06 }, { upTo: 20000, rate: 0.08 }, { upTo: 40000, rate: 0.1 }, { upTo: 60000, rate: 0.11 }, { upTo: 100000, rate: 0.12 }, { upTo: Infinity, rate: 0.14 }]
const BUMP_THRESHOLDS = [20000, 40000, 60000, 80000, 150000, 300000, 500000]
 
const currency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const labelPeriod = (p: Period) => p === 'bi-weekly' ? 'Bi-weekly' : p[0].toUpperCase() + p.slice(1)
const periods: Period[] = ['weekly', 'bi-weekly', 'monthly', 'yearly']
const targetPresets = ['Bike', 'Emergency Fund', 'Long-term Savings', 'Tuition', 'Custom']
const tabTips: Record<Tab, string> = {
  Dashboard: 'See your take-home pay, leftover money, warnings, and log savings from each paycheck.',
  Income: 'Change gross profit to see how your paycheck and commission change.',
  Budget: 'Plan your spending, savings, and investing.',
  Scenarios: 'Compare different income levels like slow, medium, fast, or custom.',
  Targets: 'Set savings goals, deadlines, and track what you actually save.',
}
 
const convertFromMonthly = (m: number, p: Period) => p === 'weekly' ? m / 4 : p === 'bi-weekly' ? m / 2 : p === 'yearly' ? m * 12 : m
const convertToMonthly = (v: number, p: Period) => p === 'weekly' ? v * 4 : p === 'bi-weekly' ? v * 2 : p === 'yearly' ? v / 12 : v
const remainingTierFromPeriodValue = (remaining: number, period: Period): { tone: 'good' | 'warn' | 'risk' | 'danger'; label: 'Healthy' | 'Moderate' | 'Risk' } => {
  const thresholds: Record<Period, { redMax: number; yellowMax: number }> = {
    weekly: { redMax: 50, yellowMax: 150 },
    'bi-weekly': { redMax: 100, yellowMax: 300 },
    monthly: { redMax: 216.67, yellowMax: 650 },
    yearly: { redMax: 2600, yellowMax: 7800 },
  }
  const t = thresholds[period]
  if (remaining < 0) return { tone: 'danger', label: 'Risk' }
  if (remaining < t.redMax) return { tone: 'risk', label: 'Risk' }
  if (remaining < t.yellowMax) return { tone: 'warn', label: 'Moderate' }
  return { tone: 'good', label: 'Healthy' }
}
 
function commission(gp: number) {
  let r = Math.max(0, gp), prev = 0, t = 0
  for (const b of commissionBrackets) {
    if (r <= 0) break
    const x = Math.min(r, b.upTo - prev)
    t += x * b.rate
    r -= x
    prev = b.upTo
  }
  return t
}
 
function income(gp: number, adjustedSalary: number) {
  const baseGrossMonthly = adjustedSalary / 12
  const baseMonthly = baseGrossMonthly * TAKE_HOME_RATE
  const c = commission(gp)
  const totalMonthly = baseMonthly + c
  return {
    baseGrossMonthly,
    baseMonthly,
    baseWeekly: (adjustedSalary / 52) * TAKE_HOME_RATE,
    baseBiWeekly: (adjustedSalary / 26) * TAKE_HOME_RATE,
    cMonthly: c,
    cWeekly: c / 4,
    cBiWeekly: c / 2,
    totalMonthly,
    totalWeekly: ((adjustedSalary / 52) * TAKE_HOME_RATE) + c / 4,
    totalBiWeekly: ((adjustedSalary / 26) * TAKE_HOME_RATE) + c / 2,
    commissionPct: totalMonthly > 0 ? (c / totalMonthly) * 100 : 0,
  }
}
 
const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  // Format as "Sep 22, 2026"
  const mon = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  const yr = d.getFullYear()
  return `${mon} ${day}, ${yr}`
}
 
function computeTargetStatus(t: Target): 'Complete' | 'Ahead' | 'On Track' | 'Behind' {
  // Fully funded
  if (t.goalAmount > 0 && t.currentSaved >= t.goalAmount) return 'Complete'
 
  const toMs = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    if (isNaN(d.getTime())) return NaN
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
 
  const todayMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()
 
  // Resolve start date: startDate field → createdAt → today
  const startMs = (() => {
    if (t.startDate) { const ms = toMs(t.startDate); if (!isNaN(ms)) return ms }
    if (t.createdAt) { const ms = toMs(t.createdAt); if (!isNaN(ms)) return ms }
    return todayMs
  })()
 
  // Parse deadline
  const deadlineMs = t.deadline ? toMs(t.deadline) : NaN
 
  // Funding-percentage fallback: used when deadline is missing/invalid or timeline is degenerate
  const fundingPctFallback = (): 'Complete' | 'Ahead' | 'On Track' | 'Behind' => {
    const pct = t.goalAmount > 0 ? t.currentSaved / t.goalAmount : 0
    if (pct >= 1) return 'Complete'
    if (pct >= 0.6) return 'Ahead'
    if (pct >= 0.35) return 'On Track'
    return 'Behind'
  }
 
  if (isNaN(deadlineMs)) return fundingPctFallback()
 
  const totalDays = (deadlineMs - startMs) / 86400000
  if (totalDays <= 0) return fundingPctFallback()
 
  // Clamp elapsedDays between 0 and totalDays
  const rawElapsed = (todayMs - startMs) / 86400000
  const elapsedDays = Math.min(totalDays, Math.max(0, rawElapsed))
 
  const fundedPercent = t.goalAmount > 0 ? (t.currentSaved / t.goalAmount) * 100 : 0
 
  // Early-stage protection: first 7 days, use funded-percent tiers only
  // This prevents brand-new targets from showing Ahead just because expectedSaved ≈ 0
  if (elapsedDays < 7) {
    if (fundedPercent >= 100) return 'Complete'
    if (fundedPercent >= 15) return 'Ahead'
    return 'On Track'
  }
 
  // Normal time-based rule after 7 days with wider 70%–125% buffer
  const expectedProgress = elapsedDays / totalDays
  const expectedSaved = t.goalAmount * expectedProgress
 
  // If nothing is expected yet (shouldn't reach here after the elapsedDays < 7 guard, but be safe)
  if (expectedSaved <= 0) return 'On Track'
 
  // Use rounded cents to avoid floating-point weirdness (e.g. 69.9 appearing as Ahead)
  const savedCents = Math.round(t.currentSaved * 100)
  const behindThresholdCents = Math.round(expectedSaved * 0.70 * 100)
  const aheadThresholdCents = Math.round(expectedSaved * 1.07 * 100)
  if (savedCents < behindThresholdCents) return 'Behind'
  if (savedCents >= aheadThresholdCents) return 'Ahead'
  return 'On Track'
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
  const [budgetHistory, setBudgetHistory] = useState<BudgetSnapshot[]>([])
  const [budgetRedo, setBudgetRedo] = useState<BudgetSnapshot[]>([])
  const [form, setForm] = useState({ name: '', amount: '', type: 'fixed bill' as CategoryType })
 
  // Target edit state
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [editTargetForm, setEditTargetForm] = useState({ name: '', goalAmount: '', currentSaved: '', startDate: '', deadline: '' })
 
  // Contribution edit state
  const [editContributionId, setEditContributionId] = useState<string | null>(null)
  const [editContributionTargetId, setEditContributionTargetId] = useState<string | null>(null)
  const [editContributionForm, setEditContributionForm] = useState({ date: '', amount: '', note: '' })
 
  // Target undo/redo
  const [targetHistory, setTargetHistory] = useState<Target[][]>([])
  const [targetRedo, setTargetRedo] = useState<Target[][]>([])
 
  // Collapsible sections for Fully Funded and Completed
  const [fullyFundedOpen, setFullyFundedOpen] = useState(true)
  const [completedOpen, setCompletedOpen] = useState(true)
 
  // Track which targets have already been shown the deadline-passed popup
  const [deadlinePassedPrompted, setDeadlinePassedPrompted] = useState<Set<string>>(new Set())
 
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
    const c = localStorage.getItem('v42-cats'); if (c) setCategories(JSON.parse(c))
    const b = localStorage.getItem('v42-budgets'); if (b) setSavedBudgets(JSON.parse(b))
    const s = localStorage.getItem('v42-scenarios'); if (s) setSavedScenarios(JSON.parse(s))
    const t = localStorage.getItem('v42-targets'); if (t) setTargets(JSON.parse(t))
    const ts = localStorage.getItem('v42-target-sets'); if (ts) setSavedTargetSets(JSON.parse(ts))
  }, [])
  useEffect(() => localStorage.setItem('v42-cats', JSON.stringify(categories)), [categories])
  useEffect(() => localStorage.setItem('v42-budgets', JSON.stringify(savedBudgets)), [savedBudgets])
  useEffect(() => localStorage.setItem('v42-scenarios', JSON.stringify(savedScenarios)), [savedScenarios])
  useEffect(() => localStorage.setItem('v42-targets', JSON.stringify(targets)), [targets])
  useEffect(() => localStorage.setItem('v42-target-sets', JSON.stringify(savedTargetSets)), [savedTargetSets])
 
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
    // Process one at a time so multiple prompts don't stack confusingly
    const t = overdue[0]
    setDeadlinePassedPrompted(prev => new Set([...prev, t.id]))
    const choice = window.confirm(
      `The deadline for "${t.name}" has passed.\n\nChoose OK to move it to Completed, or Cancel to keep it Active.`
    )
    if (choice) {
      setTargetsWithHistory(prev => prev.map(x => x.id === t.id ? { ...x, completed: true } : x))
    }
    // If user cancels, target stays active; prompt won't show again this session
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
  }
  const undoTarget = () => {
    setTargetHistory(h => {
      if (!h.length) return h
      const next = [...h]
      const prior = next.pop()!
      setTargetRedo(r => [...r.slice(-19), targets])
      setTargets(prior)
      return next
    })
  }
  const redoTarget = () => {
    setTargetRedo(r => {
      if (!r.length) return r
      const next = [...r]
      const snapshot = next.pop()!
      setTargetHistory(h => [...h.slice(-19), targets])
      setTargets(snapshot)
      return next
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
 
  const requiredForTarget = (t: Target) => {
    const remaining = Math.max(0, t.goalAmount - t.currentSaved)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const deadline = t.deadline ? new Date(t.deadline + 'T00:00:00') : today
    deadline.setHours(0, 0, 0, 0)
    const diffMs = deadline.getTime() - today.getTime()
    const days = Math.max(1, Math.ceil(diffMs / 86400000))
    return {
      remaining,
      days,
      weekly: remaining / (days / 7),
      biWeekly: remaining / (days / 14),
      monthly: remaining / (days / 30.4375),
      yearly: remaining / Math.max(1, days / 365),
      payPeriods: Math.max(1, Math.ceil(days / 14)),
    }
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
 
    const existing = targets.find(
      (t) => t.name.trim().toLowerCase() === name.toLowerCase() && t.deadline === deadline
    )
 
    if (existing) {
      // Combine silently without browser prompt
      setTargetsWithHistory(prev =>
        prev.map((t) =>
          t.id === existing.id
            ? { ...t, goalAmount: t.goalAmount + goalAmount, currentSaved: t.currentSaved + currentSaved }
            : t
        )
      )
      setTargetForm({ name: '', goalAmount: '', currentSaved: '', startDate: new Date().toISOString().slice(0, 10), deadline: '' })
      setTimeout(() => targetNameRef.current?.focus(), 0)
      return
    }
 
    const today = new Date().toISOString().slice(0, 10)
    setTargetsWithHistory(prev => [
      { id: crypto.randomUUID(), name, goalAmount, currentSaved, startDate: startDate || today, deadline, createdAt: today, type: 'savings', contributions: [], completed: false },
      ...prev,
    ])
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
    setTargetsWithHistory(prev => prev.map(t => t.id === targetId
      ? { ...t, name, goalAmount, currentSaved, startDate, deadline }
      : t
    ))
    setEditTargetId(null)
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
  const activeTargets = targets.filter(t => !t.completed && (t.goalAmount <= 0 || t.currentSaved < t.goalAmount))
  const fullyFundedTargets = targets.filter(t => !t.completed && t.goalAmount > 0 && t.currentSaved >= t.goalAmount)
  const completedTargets = targets.filter(t => t.completed)
 
  const renderTargetCard = (t: Target) => {
    const req = requiredForTarget(t)
    const progressPct = t.goalAmount > 0 ? Math.min(100, (t.currentSaved / t.goalAmount) * 100) : 0
    const status = computeTargetStatus(t)
    const log = targetLogForm[t.id] ?? { date: new Date().toISOString().slice(0, 10), amount: '', note: '' }
    const isEditingTarget = editTargetId === t.id
 
    const statusColor = status === 'Complete' || status === 'Ahead'
      ? 'text-green-400'
      : status === 'Behind'
        ? 'text-red-400'
        : 'text-slate-100'
 
    return (
      <Card
        key={t.id}
        title={isEditingTarget ? `Editing: ${t.name}` : t.name}
        headerAction={
          <div className="flex gap-2">
            {isEditingTarget ? (
              <button
                className="text-xs text-slate-300 hover:text-slate-100 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                onClick={() => setEditTargetId(null)}
              >
                Cancel
              </button>
            ) : (
              <button
                className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                onClick={() => {
                  setEditTargetId(t.id)
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
            {!isEditingTarget && (
              <button
                className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 transition-colors"
                onClick={() => setTargetsWithHistory(prev => prev.filter(x => x.id !== t.id))}
              >
                Delete
              </button>
            )}
          </div>
        }
      >
        {isEditingTarget ? (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Target Name</label>
              <input
                className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
                value={editTargetForm.name}
                onChange={e => setEditTargetForm(v => ({ ...v, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditTarget(t.id) } }}
                placeholder="Target name"
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
                onBlur={() => saveEditTarget(t.id)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditTarget(t.id) } }}
                placeholder="Goal amount"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Current Saved</label>
              <input
                type="number"
                min={0}
                step={25}
                className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
                value={editTargetForm.currentSaved}
                onChange={e => setEditTargetForm(v => ({ ...v, currentSaved: e.target.value }))}
                onFocus={e => e.target.select()}
                onBlur={() => saveEditTarget(t.id)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditTarget(t.id) } }}
                placeholder="Current saved"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Deadline</label>
              <input
                type="date"
                className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
                value={editTargetForm.deadline}
                onChange={e => setEditTargetForm(v => ({ ...v, deadline: e.target.value }))}
                onBlur={() => saveEditTarget(t.id)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditTarget(t.id) } }}
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Start Date</label>
              <input
                type="date"
                className="w-full p-2 rounded bg-slate-700 border border-slate-500 text-slate-100"
                value={editTargetForm.startDate}
                onChange={e => setEditTargetForm(v => ({ ...v, startDate: e.target.value }))}
                onBlur={() => saveEditTarget(t.id)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveEditTarget(t.id) } }}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                className="flex-1 rounded bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm transition-colors"
                onClick={() => saveEditTarget(t.id)}
              >
                Save Changes
              </button>
              <button
                className="flex-1 rounded bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm transition-colors"
                onClick={() => setEditTargetId(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <Row l="Goal amount" v={currency(t.goalAmount)} />
            <Row l="Current saved" v={currency(t.currentSaved)} />
            <Row l="Start date" v={formatDate(t.startDate ?? t.createdAt)} />
            <Row l="Deadline" v={formatDate(t.deadline)} />
            <Row l="Remaining amount" v={currency(req.remaining)} />
            <Row l="Progress" v={`${progressPct.toFixed(1)}%`} />
            <Row
              l="Status"
              v={status}
              valueClass={statusColor}
            />
            <Row l="Days remaining" v={`${req.days}`} />
            <Row l="Est. pay periods remaining" v={`${req.payPeriods}`} />
            <Row l="Weekly required" v={currency(req.weekly)} />
            <Row l="Bi-weekly required" v={currency(req.biWeekly)} />
            <Row l="Monthly required" v={currency(req.monthly)} />
            <Row l="Yearly required" v={currency(req.yearly)} />
            <div className="h-2 bg-slate-700 rounded mt-2">
              <div className="h-2 bg-blue-500 rounded" style={{ width: `${progressPct}%` }} />
            </div>
            {!t.completed && (
              <>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  <input type="date" className="p-2 rounded bg-slate-800 border border-slate-600" value={log.date} onChange={(e) => setTargetLogForm(v => ({ ...v, [t.id]: { ...log, date: e.target.value } }))} />
                  <input type="number" min={0} step={25} className="p-2 rounded bg-slate-800 border border-slate-600" value={log.amount} onChange={(e) => setTargetLogForm(v => ({ ...v, [t.id]: { ...log, amount: e.target.value } }))} placeholder="Amount" />
                  <input className="p-2 rounded bg-slate-800 border border-slate-600" value={log.note} onChange={(e) => setTargetLogForm(v => ({ ...v, [t.id]: { ...log, note: e.target.value } }))} placeholder="Note" />
                  <button className="rounded bg-blue-600" onClick={() => { addTargetContribution(t.id, Number(log.amount) || 0, log.date, log.note); setTargetLogForm(v => ({ ...v, [t.id]: { ...log, amount: '', note: '' } })) }}>Log Contribution</button>
                </div>
                <button
                  className="mt-3 rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm transition-colors"
                  onClick={() => {
                    const amount = period === 'weekly' ? req.weekly : period === 'bi-weekly' ? req.biWeekly : period === 'yearly' ? req.yearly : req.monthly
                    const monthlyAmt = convertToMonthly(amount, period)
                    setCategories(prev => {
                      const i = prev.findIndex(c => c.name.trim().toLowerCase() === t.name.trim().toLowerCase() && c.type === 'savings')
                      if (i >= 0) { const cp = [...prev]; cp[i] = { ...cp[i], amount: monthlyAmt }; return cp }
                      return [...prev, { id: crypto.randomUUID(), name: t.name, amount: monthlyAmt, type: 'savings' }]
                    })
                  }}
                >
                  Add to Current Budget
                </button>
                <button
                  className="mt-2 rounded bg-green-700 hover:bg-green-600 px-3 py-1.5 text-sm transition-colors ml-2"
                  onClick={() => {
                    setTargetsWithHistory(prev => prev.map(x => x.id === t.id ? { ...x, completed: true } : x))
                  }}
                >
                  Move to Completed
                </button>
                <button
                  className="mt-2 rounded bg-slate-600 hover:bg-slate-500 px-3 py-1.5 text-sm transition-colors ml-2 min-w-[7rem]"
                  onClick={() => {
                    setTargetForm({
                      name: '',
                      goalAmount: String(t.goalAmount),
                      currentSaved: String(t.currentSaved),
                      startDate: t.startDate ?? t.createdAt ?? new Date().toISOString().slice(0, 10),
                      deadline: t.deadline ?? '',
                    })
                    setTab('Targets')
                    setTimeout(() => targetNameRef.current?.focus(), 50)
                  }}
                >
                  Duplicate
                </button>
              </>
            )}
            {t.completed && (
              <button
                className="mt-3 rounded bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-sm transition-colors"
                onClick={() => {
                  setTargetsWithHistory(prev => prev.map(x => x.id === t.id ? { ...x, completed: false } : x))
                }}
              >
                Move Back to Active
              </button>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-slate-300">Contribution history ({t.contributions.length})</summary>
              <div className="mt-2 space-y-1">
                {t.contributions.map(c => {
                  const isEditingThis = editContributionId === c.id && editContributionTargetId === t.id
                  if (isEditingThis) {
                    return (
                      <div key={c.id} className="border border-slate-600 rounded p-2 space-y-2 bg-slate-700/50">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="text-xs text-slate-400 block mb-0.5">Date</label>
                            <input
                              type="date"
                              className="w-full p-1.5 rounded bg-slate-800 border border-slate-600 text-sm"
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
                              className="w-full p-1.5 rounded bg-slate-800 border border-slate-600 text-sm"
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
                          <button
                            className="rounded bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs transition-colors"
                            onClick={saveEditContribution}
                          >
                            Save
                          </button>
                          <button
                            className="rounded bg-slate-600 hover:bg-slate-500 px-3 py-1 text-xs transition-colors"
                            onClick={cancelEditContribution}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )
                  }
                  return (
                    <div key={c.id} className="flex justify-between text-sm border-b border-slate-700 py-1">
                      <span>{c.date} • {currency(c.amount)}{c.note ? ` • ${c.note}` : ''}</span>
                      <div className="flex gap-2">
                        <button
                          className="text-blue-300 hover:text-blue-200"
                          onClick={() => startEditContribution(t.id, c)}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-300 hover:text-red-200"
                          onClick={() => setTargetsWithHistory(prev => prev.map(x => x.id === t.id
                            ? { ...x, currentSaved: Math.max(0, x.currentSaved - c.amount), contributions: x.contributions.filter(k => k.id !== c.id) }
                            : x
                          ))}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </details>
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
                {t}
              </button>
            ))}
          </div>
        </header>
 
        {/* ── DASHBOARD ── */}
        {tab === 'Dashboard' && (
          <section className="space-y-4 transition-all duration-300">
            <Card title="Welcome back"><p className="text-slate-200">{welcome}</p></Card>
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
                    // ArrowUp/ArrowDown: let browser handle native select navigation (no preventDefault)
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
              {/* Budget table with correct column order per period */}
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
                    <tr key={c.id} className="border-b border-slate-800">
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
 
        {/* ── TARGETS ── */}
        {tab === 'Targets' && (
          <section className="space-y-4">
            <Card title="Create Target">
              <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Target Name</label>
                  <div ref={targetAutocompleteWrapRef} className="relative">
                    <input
                      ref={targetNameRef}
                      className="w-full px-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600"
                      value={targetForm.name}
                      placeholder="e.g. Emergency Fund"
                      onFocus={() => setShowTargetSuggestions(true)}
                      onChange={(e) => { setTargetForm((v) => ({ ...v, name: e.target.value })); setTargetSuggestionIndex(-1); setShowTargetSuggestions(true) }}
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
                        // Let browser move through M→D→Y segments; after 2 presses jump to Deadline
                        startDateArrowCount.current += 1
                        if (startDateArrowCount.current > 2) {
                          e.preventDefault()
                          startDateArrowCount.current = 0
                          targetDeadlineRef.current?.focus()
                        }
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        startDateArrowCount.current = 0
                        targetDeadlineRef.current?.focus()
                      } else if (e.key === 'ArrowLeft') {
                        startDateArrowCount.current = 0
                        e.preventDefault()
                        targetSavedRef.current?.focus()
                      } else {
                        startDateArrowCount.current = 0
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
                        // Let browser move through M→D→Y segments; after 2 presses trigger Create
                        deadlineArrowCount.current += 1
                        if (deadlineArrowCount.current > 2) {
                          e.preventDefault()
                          deadlineArrowCount.current = 0
                          createTarget()
                        }
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        deadlineArrowCount.current = 0
                        createTarget()
                      } else if (e.key === 'ArrowLeft') {
                        deadlineArrowCount.current = 0
                        e.preventDefault()
                        targetStartDateRef.current?.focus()
                      } else {
                        deadlineArrowCount.current = 0
                      }
                    }}
                  />
       
                </div>
                <div>
                  <button className="w-full px-3 py-1.5 text-sm rounded bg-blue-600 hover:bg-blue-500 transition-colors" onClick={createTarget}>Create</button>
                </div>
              </div>
            </Card>
 
            {/* Target Undo / Redo / Clear row */}
            <div className="flex gap-2 items-center">
              <button
                onClick={undoTarget}
                disabled={!targetHistory.length}
                className={`rounded-lg px-3 py-1.5 text-sm ${targetHistory.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
              >
                Undo
              </button>
              <button
                onClick={redoTarget}
                disabled={!targetRedo.length}
                className={`rounded-lg px-3 py-1.5 text-sm ${targetRedo.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
              >
                Redo
              </button>
              <button
                onClick={() => { if (!targets.length) return; setTargetsWithHistory(() => []) }}
                className="rounded-lg px-3 py-1.5 text-sm bg-red-900 hover:bg-red-800 text-red-200"
              >
                Clear Targets
              </button>
            </div>
 
            <Card title="Target Sets" noHover>
              <div className="grid md:grid-cols-3 gap-2">
                <input className="p-2 rounded bg-slate-800 border border-slate-600" value={targetSetName} onChange={(e) => setTargetSetName(e.target.value)} placeholder="Target set name" />
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
              <h3 className="text-base font-semibold text-slate-200">Active ({activeTargets.length})</h3>
              {activeTargets.length > 0 ? (
                <div className="grid md:grid-cols-2 gap-3">
                  {activeTargets.map(t => renderTargetCard(t))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No active targets.</p>
              )}
            </section>
 
            {/* Fully Funded Targets */}
            <section className="space-y-3">
              <button
                className="flex items-center gap-2 text-base font-semibold text-green-300 hover:text-green-200 transition-colors"
                onClick={() => setFullyFundedOpen(v => !v)}
              >
                <span>{fullyFundedOpen ? '▾' : '▸'}</span>
                <span>Fully Funded ({fullyFundedTargets.length})</span>
              </button>
              {fullyFundedOpen && (
                fullyFundedTargets.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-3">
                    {fullyFundedTargets.map(t => renderTargetCard(t))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No fully funded targets.</p>
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
                <span>Completed ({completedTargets.length})</span>
              </button>
              {completedOpen && (
                completedTargets.length > 0 ? (
                  <div className="grid md:grid-cols-2 gap-3">
                    {completedTargets.map(t => renderTargetCard(t))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm">No completed targets.</p>
                )
              )}
            </section>
          </section>
        )}
 
      </div>
    </div>
  )
}
 
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
 
function Row({ l, v, valueClass = 'text-slate-100' }: { l: string; v: string; valueClass?: string }) {
  return (
    <div className="py-1.5 border-b border-slate-700 last:border-b-0 flex justify-between gap-2 text-sm">
      <span className="text-slate-400 shrink-0">{l}</span>
      <span className={`font-medium text-right ${valueClass}`}>{v}</span>
    </div>
  )
}
 
 
 
 
