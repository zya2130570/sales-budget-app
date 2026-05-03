import { useEffect, useMemo, useRef, useState } from 'react'

type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Scenarios'
type Period = 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'
type CategoryType = 'fixed bill' | 'variable spending' | 'savings' | 'investing'
type Category = { id: string; name: string; amount: number; type: CategoryType }
type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'
type SavedBudget = { name: string; categories: Category[]; savedAt: string }
type SavedScenarioSet = { name: string; scenarios: Record<ScenarioName, number>; period: Period; savedAt: string }
type BudgetSnapshot = { categories: Category[]; form: { name: string; amount: string; type: CategoryType }; editId: string | null }

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
function income(gp: number) {
  const baseGrossMonthly = BASE_SALARY / 12
  const baseMonthly = baseGrossMonthly * TAKE_HOME_RATE
  const c = commission(gp)
  const totalMonthly = baseMonthly + c
  return { baseGrossMonthly, baseMonthly, baseWeekly: (BASE_SALARY / 52) * TAKE_HOME_RATE, baseBiWeekly: (BASE_SALARY / 26) * TAKE_HOME_RATE, cMonthly: c, cWeekly: c / 4, cBiWeekly: c / 2, totalMonthly, totalWeekly: ((BASE_SALARY / 52) * TAKE_HOME_RATE) + c / 4, totalBiWeekly: ((BASE_SALARY / 26) * TAKE_HOME_RATE) + c / 2, commissionPct: totalMonthly > 0 ? (c / totalMonthly) * 100 : 0 }
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
  const [budgetTitle, setBudgetTitle] = useState('')
  const [scenarioTitle, setScenarioTitle] = useState('')
  const [changeSummary, setChangeSummary] = useState<string[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [sIndex, setSIndex] = useState(-1)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [budgetFormHint, setBudgetFormHint] = useState('')
  const [budgetHistory, setBudgetHistory] = useState<BudgetSnapshot[]>([])
  const [budgetRedo, setBudgetRedo] = useState<BudgetSnapshot[]>([])
  const [form, setForm] = useState({ name: '', amount: '', type: 'fixed bill' as CategoryType })

  const gp = Math.max(0, Number(gpInput) || 0)
  const inc = useMemo(() => income(gp), [gp])

  useEffect(() => {
    const c = localStorage.getItem('v42-cats'); if (c) setCategories(JSON.parse(c))
    const b = localStorage.getItem('v42-budgets'); if (b) setSavedBudgets(JSON.parse(b))
    const s = localStorage.getItem('v42-scenarios'); if (s) setSavedScenarios(JSON.parse(s))
  }, [])
  useEffect(() => localStorage.setItem('v42-cats', JSON.stringify(categories)), [categories])
  useEffect(() => localStorage.setItem('v42-budgets', JSON.stringify(savedBudgets)), [savedBudgets])
  useEffect(() => localStorage.setItem('v42-scenarios', JSON.stringify(savedScenarios)), [savedScenarios])

  useEffect(() => {
    if (tab === 'Income') incomeRef.current?.focus()
    if (tab === 'Budget') { budgetNameRef.current?.focus(); setShowSuggestions(true) }
    if (tab === 'Scenarios') scenarioSlowRef.current?.focus()
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

  return <div className="min-h-screen bg-slate-900 text-slate-100"><div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
    <header className="rounded-2xl border border-slate-700 bg-slate-800/80 shadow-xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"><div><h1 className="text-3xl font-bold tracking-tight">Flow</h1><p className="text-slate-400">Personal Finance Dashboard</p></div><div className="flex flex-wrap gap-2">{(['Dashboard','Income','Budget','Scenarios'] as Tab[]).map(t => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg transition-all duration-200 hover:-translate-y-0.5 ${tab===t?'bg-blue-600 text-white':'bg-slate-700 hover:bg-slate-600'}`}>{t}</button>)}</div></header>

    {tab === 'Dashboard' && <section className="space-y-4 transition-all duration-300"><Card title="Welcome back"><p className="text-slate-200">{welcome}</p></Card><Card title="Dashboard Summary"><div className="flex gap-2 mb-4">{periods.map(p => <Pill key={p} active={period===p} onClick={() => setPeriod(p)}>{labelPeriod(p)}</Pill>)}</div><p className="mb-4">Monthly Gross Profit Reference: <span className={gp>10000?'text-green-400 font-semibold underline':'font-semibold underline'}>{currency(gp)}</span></p><div className="grid md:grid-cols-3 gap-3"><Metric title="Base Gross Income (salary only)" value={currency(convertFromMonthly(inc.baseGrossMonthly, period))} /><Metric title="Base Net Income (salary take-home)" value={currency(baseNetByPeriod)} /><Metric title="Commission Income (net)" value={currency(convertFromMonthly(inc.cMonthly, period))} /><Metric title="Total Net Income (salary + commission take-home)" value={currency(convertFromMonthly(inc.totalMonthly, period))} featured /><Metric title="Total Budget" value={currency(convertFromMonthly(monthlyBudget, period))} tone={totalBudgetTone} /><Metric title="Remaining After Budget" value={currency(selectedPeriodRemaining)} tone={remainingTone} glow={selectedPeriodRemaining < 0} /></div></Card><Card title="Financial Intelligence"><div className="grid md:grid-cols-3 gap-3"><Info title="Biggest Expense" value={top[0]?`${top[0].name} (${currency(convertFromMonthly(top[0].amount, period))} ${labelPeriod(period)})`:'None'} tone={biggestExpenseTone} /><Info title="Fixed Bills Ratio" value={`${fixedRatio.toFixed(1)}%`} /><Info title="Savings Rate" value={`${savingsRate.toFixed(1)}%`} tone={savingsTone} /><Info title="Commission Dependency" value={`${dep.toFixed(1)}%`} className={depColor} /><Info title="Remaining Cushion" value={`${remainingCushionPct.toFixed(1)}%`} tone={cushionTone} /><Info title="Budget Status / Health Tier" value={statusLabel} tone={statusTone} glow={selectedPeriodRemaining < 0} /></div></Card></section>}

    {tab === 'Income' && <section className="space-y-4 transition-all duration-300"><Card title="Income Input"><label className="text-sm">Monthly Gross Profit</label><div className="relative mt-2"><span className="absolute left-3 top-2.5 text-slate-400">$</span><input ref={incomeRef} type="number" min={0} step={100} value={gpInput} onChange={e => setGpInput(String(Math.max(0, Number(e.target.value)||0)))} className="w-full pl-7 p-2 rounded-lg bg-slate-800 border border-slate-600" /></div><p className="text-xs text-slate-400 mt-1">{currency(gp)}</p></Card><div className="grid md:grid-cols-2 gap-4"><Card title="Base Income"><Row l="Weekly Net" v={currency(inc.baseWeekly)} /><Row l="Bi-weekly Net" v={currency(inc.baseBiWeekly)} /><Row l="Monthly Net" v={currency(inc.baseMonthly)} /></Card><Card title="Commission Income"><Row l="Weekly Commission" v={currency(inc.cWeekly)} /><Row l="Bi-weekly Commission" v={currency(inc.cBiWeekly)} /><Row l="Monthly Commission" v={currency(inc.cMonthly)} /></Card><Card title="Total Income"><Row l="Weekly Net" v={currency(inc.totalWeekly)} /><Row l="Bi-weekly Net" v={currency(inc.totalBiWeekly)} /><Row l="Monthly Net" v={currency(inc.totalMonthly)} /></Card><Card title="Efficiency Metrics"><Row l="Effective hourly net rate" v={currency(inc.totalWeekly / HOURS_PER_WEEK)} /><Row l="Commission as % of total" v={`${dep.toFixed(1)}%`} /><Row l="Commission per hour" v={currency(inc.cWeekly / HOURS_PER_WEEK)} /></Card></div></section>}

    {tab === 'Budget' && <section className="space-y-4 transition-all duration-300"><Card title="Budget Summary"><div className="flex gap-2 flex-wrap mb-4">{periods.map(p => <Pill key={p} active={period===p} onClick={() => setPeriod(p)}>{labelPeriod(p)}</Pill>)}</div><div className="grid md:grid-cols-4 gap-3"><Metric title="Total available income" value={currency(selectedPeriodTotalNet)} /><Metric title="Total planned expenses" value={currency(convertFromMonthly(monthlyBudget,period))} /><Metric title="Remaining amount" value={currency(selectedPeriodRemaining)} tone={remainingTone} glow={selectedPeriodRemaining < 0} /><Metric title="Budget status" value={statusLabel} tone={statusTone} glow={selectedPeriodRemaining < 0} /></div></Card>
    <Card title="Budget Categories"><div className="grid md:grid-cols-4 gap-2"><div ref={autocompleteWrapRef} className="relative"><input ref={budgetNameRef} className="w-full p-2 rounded-lg bg-slate-800 border border-slate-600" placeholder="Category name" value={form.name} onFocus={() => setShowSuggestions(true)} onBlur={commitFormCheckpoint} onChange={e => { setForm(v=>({...v,name:e.target.value})); setSIndex(-1); setShowSuggestions(true); setBudgetFormHint('') }} onKeyDown={e => { if (!suggestionList.length) { if (e.key==='Enter') { commitFormCheckpoint(); budgetAmountRef.current?.focus() }; return } if (e.key==='ArrowDown') { e.preventDefault(); setSIndex(v => Math.min(v+1, suggestionList.length-1)) } if (e.key==='ArrowUp') { e.preventDefault(); setSIndex(v => Math.max(v-1,0)) } if (e.key==='Enter') { e.preventDefault(); if (sIndex>=0) { const selected = suggestionList[sIndex]; setForm(v=>({...v,name:selected, type: presetTypeMap[selected] ?? v.type })); setShowSuggestions(false); commitFormCheckpoint(); budgetAmountRef.current?.focus() } else { commitFormCheckpoint(); budgetAmountRef.current?.focus() } } }} />{showSuggestions && suggestionList.length>0 && <div className="absolute z-10 w-full mt-1 max-h-56 overflow-y-auto bg-slate-800 border border-slate-600 rounded-lg">{suggestionList.map((x,i)=><button key={x} className={`w-full text-left px-2 py-1 ${i===sIndex?'bg-slate-700':'hover:bg-slate-700'}`} onClick={()=>{setForm(v=>({...v,name:x, type: presetTypeMap[x] ?? v.type })); setShowSuggestions(false); setBudgetFormHint(''); commitFormCheckpoint(); budgetAmountRef.current?.focus()}}>{x}</button>)}</div>}</div><input ref={budgetAmountRef} type="number" min={0} step={25} placeholder={`${labelPeriod(period)} Amount`} className="p-2 rounded-lg bg-slate-800 border border-slate-600" value={form.amount} onBlur={commitFormCheckpoint} onChange={e=>{ setForm(v=>({...v,amount:e.target.value})); setBudgetFormHint('') }} onKeyDown={e=>{if(e.key==='Enter'){ commitFormCheckpoint(); budgetTypeRef.current?.focus() }}} /><select ref={budgetTypeRef} className="p-2 rounded-lg bg-slate-800 border border-slate-600" value={form.type} onKeyDown={e=>{ if(['1','2','3','4'].includes(e.key)){ const m={'1':'fixed bill','2':'variable spending','3':'savings','4':'investing'} as const; setForm(v=>({...v,type:m[e.key as keyof typeof m]})) } if(e.key==='Enter'){e.preventDefault(); commitFormCheckpoint(); upsert()}}} onChange={e=>{ setForm(v=>({...v,type:e.target.value as CategoryType})); commitFormCheckpoint() }}><option value="fixed bill">1 - Fixed Bill</option><option value="variable spending">2 - Variable Spending</option><option value="savings">3 - Savings</option><option value="investing">4 - Investing</option></select><button onClick={upsert} className="rounded-lg bg-blue-600 hover:bg-blue-500">{editId?'Save Changes':'Add'}</button></div>
    <div className="mt-2 flex gap-2"><button onClick={undoBudget} disabled={!budgetHistory.length} className={`rounded-lg px-3 py-1.5 ${budgetHistory.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Undo</button><button onClick={redoBudget} disabled={!budgetRedo.length} className={`rounded-lg px-3 py-1.5 ${budgetRedo.length ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>Redo</button><button onClick={() => { if (!categories.length) return; pushBudgetHistory(); setCategories([]) }} className="rounded-lg px-3 py-1.5 bg-slate-700 hover:bg-slate-600">Reset Budget</button></div>
    {budgetFormHint && <p className="mt-2 text-sm text-amber-300">{budgetFormHint}</p>}
    <div className="mt-3 grid md:grid-cols-3 gap-2"><input className="p-2 rounded-lg bg-slate-800 border border-slate-600" placeholder="Budget name" value={budgetTitle} onChange={e=>setBudgetTitle(e.target.value)} /><button className="rounded-lg bg-blue-600" onClick={()=>{const n=budgetTitle.trim(); if(!n) return; const ex=savedBudgets.find(x=>x.name.toLowerCase()===n.toLowerCase()); if(ex && !window.confirm('Overwrite existing budget?')) return; setSavedBudgets([{name:n,categories,savedAt:new Date().toISOString()},...savedBudgets.filter(x=>x.name.toLowerCase()!==n.toLowerCase())]); if(ex) setChangeSummary([`Monthly expenses change: ${currency(monthlyBudget-(ex.categories.reduce((s,c)=>s+c.amount,0)))}`])}}>Save Budget</button><div className="text-xs text-slate-400 self-center">Saved locally</div></div>
    {changeSummary.length>0 && <div className="mt-2 text-sm rounded border border-slate-700 p-2">What Changed: {changeSummary.join(' • ')}</div>}
    <div className="mt-2 space-y-2">{savedBudgets.map(b=><div key={b.name} className="rounded border border-slate-700 p-2 flex justify-between"><div><div>{b.name}</div><div className="text-xs text-slate-400">{new Date(b.savedAt).toLocaleString()}</div></div><div className="flex gap-2"><button className="text-blue-300" onClick={()=>setCategories(b.categories)}>Load</button><button className="text-amber-300" onClick={()=>{const nn=window.prompt('Rename budget', b.name); if(!nn) return; setSavedBudgets(prev=>prev.map(x=>x.name===b.name?{...x,name:nn}:x))}}>Rename</button><button className="text-red-300" onClick={()=>setSavedBudgets(prev=>prev.filter(x=>x.name!==b.name))}>Delete</button></div></div>)}</div>
    <table className="w-full text-sm mt-3"><thead><tr className="text-left text-slate-400 border-b border-slate-700"><th>Name</th><th>Type</th><th>Monthly</th><th>{labelPeriod(period)}</th><th/></tr></thead><tbody>{top.map(c=><tr key={c.id} className="border-b border-slate-800"><td>{c.name}</td><td>{c.type === 'fixed bill' ? 'Fixed Bill' : c.type === 'variable spending' ? 'Variable Spending' : c.type === 'savings' ? 'Savings' : 'Investing'}</td><td>{currency(c.amount)}</td><td>{currency(convertFromMonthly(c.amount,period))}</td><td className="space-x-2"><button className="text-blue-300" onClick={()=>{setForm({name:c.name,amount:String(convertFromMonthly(c.amount,period)),type:c.type}); setEditId(c.id); budgetNameRef.current?.focus()}}>Edit</button><button className="text-red-300" onClick={()=>{pushBudgetHistory(); setCategories(prev=>prev.filter(x=>x.id!==c.id))}}>Delete</button></td></tr>)}</tbody></table></Card></section>}

    {tab==='Scenarios' && <section className="space-y-4 transition-all duration-300"><Card title="Scenario Set Manager"><div className="flex gap-2 mb-3">{periods.map(p=><Pill key={p} active={period===p} onClick={()=>setPeriod(p)}>{labelPeriod(p)}</Pill>)}</div><div className="grid md:grid-cols-4 gap-2">{(['Slow','Medium','Fast','Custom'] as ScenarioName[]).map(n=><div key={n}><label className="text-xs text-slate-400">{n}</label><input ref={n==='Slow'?scenarioSlowRef:undefined} type="number" min={0} step={100} value={scenario[n]} onChange={e=>setScenario(v=>({...v,[n]:Math.max(0,Number(e.target.value)||0)}))} className="w-full p-2 rounded bg-slate-800 border border-slate-600" /></div>)}</div><div className="grid md:grid-cols-3 gap-2 mt-3"><input className="p-2 rounded bg-slate-800 border border-slate-600" placeholder="Scenario set name" value={scenarioTitle} onChange={e=>setScenarioTitle(e.target.value)} /><button className="rounded bg-blue-600" onClick={()=>{const n=scenarioTitle.trim(); if(!n) return; const ex=savedScenarios.find(x=>x.name.toLowerCase()===n.toLowerCase()); if(ex && !window.confirm('Overwrite existing set?')) return; setSavedScenarios([{name:n,scenarios:scenario,period:period,savedAt:new Date().toISOString()},...savedScenarios.filter(x=>x.name.toLowerCase()!==n.toLowerCase())])}}>Save Scenario Set</button><div className="text-xs text-slate-400 self-center">Saved locally</div></div><div className="space-y-2 mt-2">{savedScenarios.map(s=><div key={s.name} className="rounded border border-slate-700 p-2 flex justify-between"><div><div>{s.name}</div><div className="text-xs text-slate-400">{new Date(s.savedAt).toLocaleString()}</div></div><div className="flex gap-2"><button className="text-blue-300" onClick={()=>{setScenario(s.scenarios); setPeriod(s.period)}}>Load</button><button className="text-red-300" onClick={()=>setSavedScenarios(prev=>prev.filter(x=>x.name!==s.name))}>Delete</button></div></div>)}</div></Card><div className="grid md:grid-cols-2 gap-3">{(['Slow','Medium','Fast','Custom'] as ScenarioName[]).map(n=>{const ii=income(scenario[n]); const rem=convertFromMonthly(ii.totalMonthly-monthlyBudget,period); const tone=n==='Slow'?'border-yellow-500/60 text-yellow-200':n==='Medium'?'border-blue-500/60 text-blue-200':n==='Fast'?'border-green-500/60 text-green-200':'border-slate-300/60 text-slate-100'; const b = n === 'Slow' ? '#facc15' : n === 'Medium' ? '#60a5fa' : n === 'Fast' ? '#4ade80' : '#cbd5e1'; return <Card key={n} title={`${n} Scenario`} className={tone} style={{ borderColor: b, borderWidth: 2 }}><Row l="Monthly Gross Profit Input" v={currency(scenario[n])} /><Row l={`Converted Gross Profit (${labelPeriod(period)})`} v={currency(convertFromMonthly(scenario[n],period))} /><Row l="Commission" v={currency(convertFromMonthly(ii.cMonthly,period))} /><Row l="Base net income" v={currency(convertFromMonthly(ii.baseMonthly,period))} /><Row l="Total net income" v={currency(convertFromMonthly(ii.totalMonthly,period))} /><Row l="Effective hourly rate" v={currency(ii.totalWeekly/HOURS_PER_WEEK)} /><Row l="Remaining after budget" v={currency(rem)} valueClass={rem<0?'text-red-400':'text-green-400'} /></Card>})}</div></section>}

  </div></div>
}

function Card({ title, children, className = '', style }: { title: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) { return <div style={style} className={`rounded-2xl border border-slate-700 bg-slate-800/80 shadow-lg p-4 md:p-5 transition-all duration-200 hover:-translate-y-0.5 ${className}`}><h2 className="text-lg font-semibold mb-3">{title}</h2>{children}</div> }
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} className={`px-3 py-1.5 rounded text-sm ${active?'bg-blue-600':'bg-slate-700 hover:bg-slate-600'} transition`}>{children}</button> }
function Metric({ title, value, tone = 'neutral', featured = false, glow = false }: { title: string; value: string; tone?: 'neutral'|'good'|'warn'|'risk'|'danger'; featured?: boolean; glow?: boolean }) { const c=tone==='good'?'text-green-400':tone==='warn'?'text-yellow-300':tone==='risk'?'text-orange-300':tone==='danger'?'text-red-300':'text-slate-100'; return <div className={`rounded-xl border p-3 ${featured ? 'border-sky-200/70 bg-gradient-to-br from-slate-700 via-slate-700/95 to-slate-600/95 shadow-[0_0_24px_rgba(125,211,252,0.28)]' : 'border-slate-700 bg-slate-800'} ${glow ? 'shadow-[0_0_22px_rgba(248,113,113,0.36)] border-red-400/85 bg-gradient-to-br from-red-800/45 via-red-900/38 to-red-950/34 ring-1 ring-red-300/40' : ''}`} style={glow ? { boxShadow: 'inset 0 0 20px rgba(248,113,113,0.18), 0 0 22px rgba(248,113,113,0.36)' } : undefined}><div className="text-xs text-slate-400 mb-1">{title}</div><div className="flex items-center justify-between gap-2"><div className={`${featured ? 'text-xl text-sky-100' : `text-xl ${c}`} font-bold`}>{value}</div>{featured && <div className="inline-flex rounded-full border border-sky-200/40 bg-slate-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100">Primary Take-Home</div>}</div></div> }
function Info({ title, value, className = '', tone = 'neutral', glow = false }: { title: string; value: string; className?: string; tone?: 'neutral'|'good'|'warn'|'risk'|'danger'; glow?: boolean }) { const tc = tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-yellow-300' : tone === 'risk' ? 'text-orange-300' : tone === 'danger' ? 'text-red-300' : 'text-slate-100'; return <div className={`rounded-xl border border-slate-700 bg-slate-800 p-3 ${glow ? 'shadow-[0_0_22px_rgba(248,113,113,0.34)] border-red-400/85 bg-gradient-to-br from-red-800/45 via-red-900/38 to-red-950/34 ring-1 ring-red-300/35' : ''}`} style={glow ? { boxShadow: 'inset 0 0 18px rgba(248,113,113,0.17), 0 0 22px rgba(248,113,113,0.34)' } : undefined}><div className="text-xs text-slate-400 mb-1">{title}</div><div className={`font-semibold ${tc} ${className}`}>{value}</div></div> }
function Row({ l, v, valueClass = 'text-slate-100' }: { l: string; v: string; valueClass?: string }) { return <div className="py-1.5 border-b border-slate-700 last:border-b-0 flex justify-between text-sm"><span className="text-slate-400">{l}</span><span className={`font-medium ${valueClass}`}>{v}</span></div> }
