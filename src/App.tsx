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
type Target = { id: string; name: string; goalAmount: number; currentSaved: number; deadline: string; createdAt?: string; type: 'savings'; contributions: Contribution[]; showHistory?: boolean }
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
  return { baseGrossMonthly, baseMonthly, baseWeekly: (adjustedSalary / 52) * TAKE_HOME_RATE, baseBiWeekly: (adjustedSalary / 26) * TAKE_HOME_RATE, cMonthly: c, cWeekly: c / 4, cBiWeekly: c / 2, totalMonthly, totalWeekly: ((adjustedSalary / 52) * TAKE_HOME_RATE) + c / 4, totalBiWeekly: ((adjustedSalary / 26) * TAKE_HOME_RATE) + c / 2, commissionPct: totalMonthly > 0 ? (c / totalMonthly) * 100 : 0 }
}

export default function App() {
  const incomeRef = useRef<HTMLInputElement>(null)
  const budgetNameRef = useRef<HTMLInputElement>(null)
  const autocompleteWrapRef = useRef<HTMLDivElement>(null)
  const budgetAmountRef = useRef<HTMLInputElement>(null)
  const budgetTypeRef = useRef<HTMLSelectElement>(null)
  const scenarioSlowRef = useRef<HTMLInputElement>(null)
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
  const [targetForm, setTargetForm] = useState({ name: '', goalAmount: '', currentSaved: '0', deadline: '' })
  const [targetLogForm, setTargetLogForm] = useState<Record<string, { date: string; amount: string; note: string }>>({})
  const [dashboardQuickDate, setDashboardQuickDate] = useState('2026-05-29')
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

  const gp = Math.max(0, Number(gpInput) || 0)
  const adjustedSalary = BASE_SALARY + (baseBumpsAchieved * 5000)
  const bumpThresholds = [20000, 40000, 60000, 80000, 150000, 300000, 500000]
  const nextThreshold = bumpThresholds[baseBumpsAchieved]
  const inc = useMemo(() => income(gp, adjustedSalary), [gp, adjustedSalary])

  useEffect(() => {
    const c = localStorage.getItem('v42-cats'); if (c) setCategories(JSON.parse(c))
    const b = localStorage.getItem('v42-budgets'); if (b) setSavedBudgets(JSON.parse(b))
    const s = localStorage.getItem('v42-scenarios'); if (s) setSavedScenarios(JSON.parse(s))
    const t = localStorage.getItem('v42-targets'); if (t) setTargets(JSON.parse(t))
    const ts = localStorage.getItem('v42-target-sets'); if (ts) setSavedTargetSets(JSON.parse(ts))
    const bb = localStorage.getItem('v42-base-bumps'); if (bb) setBaseBumpsAchieved(JSON.parse(bb))
  }, [])
  useEffect(() => localStorage.setItem('v42-cats', JSON.stringify(categories)), [categories])
  useEffect(() => localStorage.setItem('v42-budgets', JSON.stringify(savedBudgets)), [savedBudgets])
  useEffect(() => localStorage.setItem('v42-scenarios', JSON.stringify(savedScenarios)), [savedScenarios])
  useEffect(() => localStorage.setItem('v42-targets', JSON.stringify(targets)), [targets])
  useEffect(() => localStorage.setItem('v42-target-sets', JSON.stringify(savedTargetSets)), [savedTargetSets])
  useEffect(() => localStorage.setItem('v42-base-bumps', JSON.stringify(baseBumpsAchieved)), [baseBumpsAchieved])

  useEffect(() => {
    if (tab === 'Income') incomeRef.current?.focus()
    if (tab === 'Budget') { budgetNameRef.current?.focus(); setShowSuggestions(true) }
    if (tab === 'Scenarios') scenarioSlowRef.current?.focus()
    if (tab === 'Targets') { setShowTargetSuggestions(true) }
  }, [tab])
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!autocompleteWrapRef.current?.contains(e.target as Node)) setShowSuggestions(false)
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
  const requiredForTarget = (t: Target) => {
    const remaining = Math.max(0, t.goalAmount - t.currentSaved)
    const today = new Date()
    const deadline = t.deadline ? new Date(t.deadline) : today
    const ms = Math.max(0, deadline.getTime() - today.getTime())
    const days = Math.max(1, Math.ceil(ms / 86400000))
    return { remaining, days, weekly: remaining / (days / 7), biWeekly: remaining / (days / 14), monthly: remaining / (days / 30.4375), yearly: remaining / Math.max(1, days / 365), payPeriods: Math.max(1, Math.ceil(days / 14)) }
  }
  const addTargetContribution = (targetId: string, amount: number, date: string, note: string) => {
    if (amount <= 0) return
    setTargets((prev) => prev.map((t) => t.id === targetId ? { ...t, currentSaved: t.currentSaved + amount, contributions: [{ id: crypto.randomUUID(), amount, date, note }, ...t.contributions] } : t))
  }

  return <div className="min-h-screen bg-slate-900 text-slate-100"><div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
    <header className="rounded-2xl border border-slate-700 bg-slate-800/80 shadow-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">Flow</h1><p className="text-slate-400">Personal Finance Dashboard</p></div><div className="flex flex-wrap gap-2">{(['Dashboard','Income','Budget','Scenarios','Targets'] as Tab[]).map(t => <button title={tabTips[t]} key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg transition-all duration-200 hover:-translate-y-0.5 ${tab===t?'bg-blue-600 text-white':'bg-slate-700 hover:bg-slate-600'}`}>{t}</button>)}</div></header>

    {tab === 'Dashboard' && <section className="space-y-4 transition-all duration-300"><Card title="Welcome back"><p className="text-slate-200">{welcome}</p></Card><Card title="Dashboard Summary"><div className="flex gap-2 mb-4">{periods.map(p => <Pill key={p} active={period===p} onClick={() => setPeriod(p)}>{labelPeriod(p)}</Pill>)}</div><p className="mb-4">Monthly Gross Profit Reference: <span className={gp>10000?'text-green-400 font-semibold underline':'font-semibold underline'}>{currency(gp)}</span></p><div className="grid md:grid-cols-3 gap-3"><Metric title="Base Gross Income (salary only)" value={currency(convertFromMonthly(inc.baseGrossMonthly, period))} /><Metric title="Base Net Income (salary take-home)" value={currency(baseNetByPeriod)} /><Metric title="Commission Income (net)" value={currency(convertFromMonthly(inc.cMonthly, period))} /><Metric title="Total Net Income (salary + commission take-home)" value={currency(convertFromMonthly(inc.totalMonthly, period))} featured /><Metric title="Total Budget" value={currency(convertFromMonthly(monthlyBudget, period))} tone={totalBudgetTone} /><Metric title="Remaining After Budget" value={currency(selectedPeriodRemaining)} tone={remainingTone} glow={selectedPeriodRemaining < 0} /></div></Card><Card title="Financial Intelligence"><div className="grid md:grid-cols-3 gap-3"><Info title="Biggest Expense" value={top[0]?`${top[0].name} (${currency(convertFromMonthly(top[0].amount, period))} ${labelPeriod(period)})`:'None'} tone={biggestExpenseTone} /><Info title="Fixed Bills Ratio" value={`${fixedRatio.toFixed(1)}%`} /><Info title="Savings Rate" value={`${savingsRate.toFixed(1)}%`} tone={savingsTone} /><Info title="Commission Dependency" value={`${dep.toFixed(1)}%`} className={depColor} /><Info title="Remaining Cushion" value={`${remainingCushionPct.toFixed(1)}%`} tone={cushionTone} /><Info title="Budget Status / Health Tier" value={statusLabel} tone={statusTone} glow={selectedPeriodRemaining < 0} /></div></Card></section>}
    {tab === 'Dashboard' && targets.length > 0 && period === 'bi-weekly' && <Card title="Log Savings From This Paycheck"><div className="grid md:grid-cols-4 gap-2"><input type="date" className="p-2 rounded bg-slate-800 border border-slate-600" value={dashboardQuickDate} onChange={(e)=>setDashboardQuickDate(e.target.value)} /><select className="p-2 rounded bg-slate-800 border border-slate-600" value={dashboardQuickTargetId} onChange={(e)=>setDashboardQuickTargetId(e.target.value)}><option value="">Select target</option>{targets.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select><input type="number" min={0} step={25} className="p-2 rounded bg-slate-800 border border-slate-600" value={dashboardQuickAmount} onChange={(e)=>setDashboardQuickAmount(e.target.value)} placeholder="Amount" /><button className="rounded bg-blue-600" onClick={()=>{ if(!dashboardQuickTargetId) return; addTargetContribution(dashboardQuickTargetId, Number(dashboardQuickAmount)||0, dashboardQuickDate, 'Paycheck quick add'); setDashboardQuickAmount('') }}>Add Contribution</button></div></Card>}

	    {tab === 'Income' && <section className="space-y-4 transition-all duration-300"><Card title="Income Input"><label className="text-sm">Monthly Gross Profit</label><div className="relative mt-2"><span className="absolute left-3 top-2.5 text-slate-400">$</span><input ref={incomeRef} type="number" min={0} step={100} value={gpInput} onChange={e => setGpInput(String(Math.max(0, Number(e.target.value)||0)))} className="w-full pl-7 p-2 rounded-lg bg-slate-800 border border-slate-600" /></div><p className="text-xs text-slate-400 mt-1">{currency(gp)}</p><div className="mt-2 text-xs text-slate-400">Current base salary: <span className="font-semibold text-slate-200">{currency(adjustedSalary)}</span></div>{typeof nextThreshold !== 'undefined' && gp < nextThreshold && <p className="text-xs text-slate-400 mt-1">Next base bump unlocks at {currency(nextThreshold)} GP</p>}{typeof nextThreshold !== 'undefined' && gp >= nextThreshold && <button className="mt-2 rounded bg-blue-600 px-2 py-1 text-xs" onClick={()=>setBaseBumpsAchieved((prev)=>prev+1)}>Base bump achieved</button>}{typeof nextThreshold === 'undefined' && <p className="text-xs text-slate-400 mt-1">All configured base bumps achieved.</p>}{typeof nextThreshold !== 'undefined' && baseBumpsAchieved > 0 && gp < nextThreshold && <p className="text-xs text-slate-500 mt-1">Base salary updated to {currency(adjustedSalary)}.</p>}</Card><div className="grid md:grid-cols-2 gap-4"><Card title="Base Income"><Row l="Weekly Net" v={currency(inc.baseWeekly)} /><Row l="Bi-weekly Net" v={currency(inc.baseBiWeekly)} /><Row l="Monthly Net" v={currency(inc.baseMonthly)} /></Card><Card title="Commission Income"><Row l="Weekly Commission" v={currency(inc.cWeekly)} /><Row l="Bi-weekly Commission" v={currency(inc.cBiWeekly)} /><Row l="Monthly Commission" v={currency(inc.cMonthly)} /></Card><Card title="Total Income"><Row l="Weekly Net" v={currency(inc.totalWeekly)} /><Row l="Bi-weekly Net" v={currency(inc.totalBiWeekly)} /><Row l="Monthly Net" v={currency(inc.totalMonthly)} /></Card><Card title="Efficiency Metrics"><Row l="Effective hourly net rate /hr" v={currency(inc.totalWeekly / HOURS_PER_WEEK)} /><Row l="Commission as % of total" v={`${dep.toFixed(1)}%`} /><Row l="Commission per hour" v={currency(inc.cWeekly / HOURS_PER_WEEK)} /></Card></div></section>}

  </div></div>
}

function Card({ title, children, className = '', style }: { title: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) { return <div style={style} className={`rounded-2xl border border-slate-700 bg-slate-800/80 shadow-lg p-4 md:p-5 transition-all duration-200 hover:-translate-y-0.5 ${className}`}><h2 className="text-lg font-semibold mb-3">{title}</h2>{children}</div> }
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} className={`px-3 py-1.5 rounded text-sm ${active?'bg-blue-600':'bg-slate-700 hover:bg-slate-600'} transition`}>{children}</button> }
function Metric({ title, value, tone = 'neutral', featured = false, glow = false }: { title: string; value: string; tone?: 'neutral'|'good'|'warn'|'risk'|'danger'; featured?: boolean; glow?: boolean }) { const c=tone==='good'?'text-green-400':tone==='warn'?'text-yellow-300':tone==='risk'?'text-orange-300':tone==='danger'?'text-red-300':'text-slate-100'; return <div className={`rounded-xl border p-3 ${featured ? 'border-sky-200/70 bg-gradient-to-br from-slate-700 via-slate-700/95 to-slate-600/95 shadow-[0_0_24px_rgba(125,211,252,0.28)]' : 'border-slate-700 bg-slate-800'} ${glow ? 'shadow-[0_0_22px_rgba(248,113,113,0.36)] border-red-400/85 bg-gradient-to-br from-red-800/45 via-red-900/38 to-red-950/34 ring-1 ring-red-300/40' : ''}`} style={glow ? { boxShadow: 'inset 0 0 20px rgba(248,113,113,0.18), 0 0 22px rgba(248,113,113,0.36)' } : undefined}><div className="text-xs text-slate-400 mb-1">{title}</div><div className="flex items-center justify-between gap-2"><div className={`${featured ? 'text-xl text-sky-100' : `text-xl ${c}`} font-bold`}>{value}</div>{featured && <div className="inline-flex rounded-full border border-sky-200/40 bg-slate-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100">Primary Take-Home</div>}</div></div> }
function Info({ title, value, className = '', tone = 'neutral', glow = false }: { title: string; value: string; className?: string; tone?: 'neutral'|'good'|'warn'|'risk'|'danger'; glow?: boolean }) { const tc = tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-yellow-300' : tone === 'risk' ? 'text-orange-300' : tone === 'danger' ? 'text-red-300' : 'text-slate-100'; return <div className={`rounded-xl border border-slate-700 bg-slate-800 p-3 ${glow ? 'shadow-[0_0_22px_rgba(248,113,113,0.34)] border-red-400/85 bg-gradient-to-br from-red-800/45 via-red-900/38 to-red-950/34 ring-1 ring-red-300/35' : ''}`} style={glow ? { boxShadow: 'inset 0 0 18px rgba(248,113,113,0.17), 0 0 22px rgba(248,113,113,0.34)' } : undefined}><div className="text-xs text-slate-400 mb-1">{title}</div><div className={`font-semibold ${tc} ${className}`}>{value}</div></div> }
function Row({ l, v, valueClass = 'text-slate-100' }: { l: string; v: string; valueClass?: string }) { return <div className="py-1.5 border-b border-slate-700 last:border-b-0 flex justify-between text-sm"><span className="text-slate-400">{l}</span><span className={`font-medium ${valueClass}`}>{v}</span></div> }
