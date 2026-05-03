import { useEffect, useMemo, useRef, useState } from 'react'

type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Scenarios'
type Period = 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'
type DashboardPeriod = Exclude<Period, 'yearly'>
type CategoryType = 'fixed bill' | 'savings' | 'investing' | 'variable spending'
type Category = { id: string; name: string; amount: number; type: CategoryType }
type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'
type SavedBudget = { name: string; categories: Category[]; savedAt: string }
type SavedScenarioSet = { name: string; scenarios: Record<ScenarioName, number>; period: Period; savedAt: string }

const BASE_SALARY = 40000
const TAKE_HOME_RATE = 0.8243
const HOURS_PER_WEEK = 45
const STORAGE_KEY = 'sales-budget-v4-categories'
const STORAGE_BUDGETS_KEY = 'sales-budget-v4-saved-budgets'
const STORAGE_SCENARIOS_KEY = 'sales-budget-v4-saved-scenarios'
const categorySuggestions = ['BTM', 'Bills to Mom', 'Story', 'Passive', 'Long-term Savings', 'Emergency Fund', 'Gas', 'Haircut', 'Braiding', 'Tuition', 'Takeout', 'Subscriptions', 'Cash', 'Groceries', 'School', 'Self-care']

const commissionBrackets = [
  { upTo: 5000, rate: 0.04 },
  { upTo: 10000, rate: 0.06 },
  { upTo: 20000, rate: 0.08 },
  { upTo: 40000, rate: 0.1 },
  { upTo: 60000, rate: 0.11 },
  { upTo: 100000, rate: 0.12 },
  { upTo: Infinity, rate: 0.14 },
]

const scenarioDefaults: Record<ScenarioName, number> = { Slow: 8000, Medium: 15000, Fast: 30000, Custom: 10000 }
const periodOptions: Period[] = ['weekly', 'bi-weekly', 'monthly', 'yearly']
const dashboardPeriods: DashboardPeriod[] = ['weekly', 'bi-weekly', 'monthly']
const currency = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
const labelPeriod = (p: Period) => p === 'bi-weekly' ? 'Bi-weekly' : p[0].toUpperCase() + p.slice(1)

function periodFromMonthly(monthly: number, period: Period) {
  if (period === 'weekly') return monthly / 4
  if (period === 'bi-weekly') return monthly / 2
  if (period === 'yearly') return monthly * 12
  return monthly
}

function calculateMonthlyCommission(grossProfit: number) {
  let remaining = Math.max(0, grossProfit)
  let prev = 0
  let total = 0
  for (const b of commissionBrackets) {
    if (remaining <= 0) break
    const taxable = Math.min(remaining, b.upTo - prev)
    total += taxable * b.rate
    remaining -= taxable
    prev = b.upTo
  }
  return total
}

function getIncome(gp: number) {
  const baseGrossMonthly = BASE_SALARY / 12
  const baseMonthly = baseGrossMonthly * TAKE_HOME_RATE
  const baseBiWeekly = (BASE_SALARY / 26) * TAKE_HOME_RATE
  const baseWeekly = (BASE_SALARY / 52) * TAKE_HOME_RATE
  const commissionMonthly = calculateMonthlyCommission(gp)
  const totalMonthly = baseMonthly + commissionMonthly
  return {
    baseGrossMonthly,
    baseMonthly,
    baseBiWeekly,
    baseWeekly,
    commissionMonthly,
    commissionBiWeekly: commissionMonthly / 2,
    commissionWeekly: commissionMonthly / 4,
    totalMonthly,
    totalBiWeekly: baseBiWeekly + commissionMonthly / 2,
    totalWeekly: baseWeekly + commissionMonthly / 4,
    hourlyNet: (baseWeekly + commissionMonthly / 4) / HOURS_PER_WEEK,
    commissionPctOfTotal: totalMonthly > 0 ? (commissionMonthly / totalMonthly) * 100 : 0,
    commissionPerHour: (commissionMonthly / 4) / HOURS_PER_WEEK,
  }
}

export default function App() {
  const amountRef = useRef<HTMLInputElement>(null)
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('monthly')
  const [budgetPeriod, setBudgetPeriod] = useState<Period>('monthly')
  const [scenarioPeriod, setScenarioPeriod] = useState<Period>('monthly')
  const [grossProfitInput, setGrossProfitInput] = useState('15000')
  const [categories, setCategories] = useState<Category[]>([])
  const [scenarioGrossProfit, setScenarioGrossProfit] = useState(scenarioDefaults)
  const [form, setForm] = useState({ name: '', amount: '', type: 'fixed bill' as CategoryType })
  const [savedBudgets, setSavedBudgets] = useState<SavedBudget[]>([])
  const [savedScenarioSets, setSavedScenarioSets] = useState<SavedScenarioSet[]>([])
  const [budgetName, setBudgetName] = useState('')
  const [scenarioSetName, setScenarioSetName] = useState('')
  const [changeSummary, setChangeSummary] = useState<string[]>([])

  const grossProfit = Math.max(0, Number(grossProfitInput) || 0)
  const income = useMemo(() => getIncome(grossProfit), [grossProfit])

  useEffect(() => {
    const c = localStorage.getItem(STORAGE_KEY)
    const b = localStorage.getItem(STORAGE_BUDGETS_KEY)
    const s = localStorage.getItem(STORAGE_SCENARIOS_KEY)
    if (c) setCategories(JSON.parse(c))
    if (b) setSavedBudgets(JSON.parse(b))
    if (s) setSavedScenarioSets(JSON.parse(s))
  }, [])

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(categories)), [categories])
  useEffect(() => localStorage.setItem(STORAGE_BUDGETS_KEY, JSON.stringify(savedBudgets)), [savedBudgets])
  useEffect(() => localStorage.setItem(STORAGE_SCENARIOS_KEY, JSON.stringify(savedScenarioSets)), [savedScenarioSets])

  const monthlyByType = useMemo(() => ({
    fixed: categories.filter(c => c.type === 'fixed bill').reduce((s, c) => s + c.amount, 0),
    variable: categories.filter(c => c.type === 'variable spending').reduce((s, c) => s + c.amount, 0),
    savings: categories.filter(c => c.type === 'savings').reduce((s, c) => s + c.amount, 0),
    investing: categories.filter(c => c.type === 'investing').reduce((s, c) => s + c.amount, 0),
  }), [categories])
  const monthlyExpenses = monthlyByType.fixed + monthlyByType.variable
  const monthlySavingsInvesting = monthlyByType.savings + monthlyByType.investing
  const monthlyBudget = monthlyExpenses + monthlySavingsInvesting
  const monthlyLeftover = income.totalMonthly - monthlyBudget
  const fixedRatio = income.totalMonthly > 0 ? (monthlyByType.fixed / income.totalMonthly) * 100 : 0
  const savingsRate = income.totalMonthly > 0 ? (monthlySavingsInvesting / income.totalMonthly) * 100 : 0

  const commissionTier = income.commissionPctOfTotal <= 15 ? 'Low' : income.commissionPctOfTotal <= 30 ? 'Moderate' : income.commissionPctOfTotal <= 50 ? 'High' : 'Risky'
  const budgetNeedsCommission = income.baseMonthly < monthlyBudget
  const leftoverPct = income.totalMonthly > 0 ? (monthlyLeftover / income.totalMonthly) * 100 : 0
  const healthTier = (() => {
    if (monthlyLeftover < 0 || leftoverPct < 5 || budgetNeedsCommission) return 'Risk'
    if (leftoverPct >= 20 && savingsRate >= 15 && fixedRatio <= 50 && commissionTier !== 'High' && commissionTier !== 'Risky') return 'Strong'
    if (leftoverPct >= 10 && savingsRate >= 10 && fixedRatio <= 60) return 'Stable'
    return 'Tight'
  })()

  const addCategory = () => {
    const amount = Math.max(0, Number(form.amount) || 0)
    const normalized = form.name.trim().toLowerCase()
    if (!normalized || amount <= 0) return
    setCategories(prev => {
      const i = prev.findIndex(p => p.name.trim().toLowerCase() === normalized && p.type === form.type)
      if (i >= 0) {
        const copy = [...prev]
        copy[i] = { ...copy[i], amount: copy[i].amount + amount }
        return copy
      }
      return [...prev, { id: crypto.randomUUID(), name: form.name.trim(), amount, type: form.type }]
    })
    setForm({ name: '', amount: '', type: 'fixed bill' })
  }

  const matchingSuggestions = form.name.trim() ? categorySuggestions.filter(s => s.toLowerCase().includes(form.name.trim().toLowerCase())).slice(0, 6) : []
  const sortedCategories = [...categories].sort((a, b) => b.amount - a.amount)
  const top3 = sortedCategories.slice(0, 3)

  const saveBudget = () => {
    const name = budgetName.trim()
    if (!name) return
    const now = new Date().toISOString()
    const existing = savedBudgets.find(b => b.name.toLowerCase() === name.toLowerCase())
    if (existing && !window.confirm(`Budget "${name}" exists. Overwrite? Click Cancel to rename.`)) return

    if (existing) {
      const prev = existing.categories
      const prevByType = {
        expenses: prev.filter(x => x.type === 'fixed bill' || x.type === 'variable spending').reduce((s, x) => s + x.amount, 0),
        saveInvest: prev.filter(x => x.type === 'savings' || x.type === 'investing').reduce((s, x) => s + x.amount, 0),
        fixed: prev.filter(x => x.type === 'fixed bill').reduce((s, x) => s + x.amount, 0),
      }
      const prevBudget = prevByType.expenses + prevByType.saveInvest
      const prevLeft = income.totalMonthly - prevBudget
      const currentItems = Object.fromEntries(categories.map(c => [`${c.name.toLowerCase()}|${c.type}`, c.amount]))
      const previousItems = Object.fromEntries(prev.map(c => [`${c.name.toLowerCase()}|${c.type}`, c.amount]))
      const deltas = Object.keys({ ...currentItems, ...previousItems }).map(k => ({ key: k, delta: (currentItems[k] ?? 0) - (previousItems[k] ?? 0) })).filter(d => d.delta !== 0)
      const biggestUp = deltas.sort((a, b) => b.delta - a.delta)[0]
      const biggestDown = deltas.sort((a, b) => a.delta - b.delta)[0]
      setChangeSummary([
        `Monthly expenses change: ${currency(monthlyExpenses - prevByType.expenses)}`,
        `Savings/investing change: ${currency(monthlySavingsInvesting - prevByType.saveInvest)}`,
        `Remaining amount change: ${currency(monthlyLeftover - prevLeft)}`,
        biggestUp ? `Biggest increase: ${biggestUp.key.split('|')[0]} (${currency(biggestUp.delta)})` : 'Biggest increase: none',
        biggestDown ? `Biggest decrease: ${biggestDown.key.split('|')[0]} (${currency(biggestDown.delta)})` : 'Biggest decrease: none',
        `Fixed bills ratio change: ${(fixedRatio - ((prevByType.fixed / income.totalMonthly) * 100 || 0)).toFixed(1)}%`,
      ])
    }

    const next = savedBudgets.filter(b => b.name.toLowerCase() !== name.toLowerCase())
    setSavedBudgets([{ name, categories, savedAt: now }, ...next])
  }

  const saveScenarioSet = () => {
    const name = scenarioSetName.trim()
    if (!name) return
    const existing = savedScenarioSets.find(s => s.name.toLowerCase() === name.toLowerCase())
    if (existing && !window.confirm(`Scenario set "${name}" exists. Overwrite? Click Cancel to rename.`)) return
    const next = savedScenarioSets.filter(s => s.name.toLowerCase() !== name.toLowerCase())
    setSavedScenarioSets([{ name, scenarios: scenarioGrossProfit, period: scenarioPeriod, savedAt: new Date().toISOString() }, ...next])
  }

  return <div className="min-h-screen bg-slate-900 text-slate-100"><div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
    <header className="rounded-2xl border border-slate-700 bg-slate-800/90 shadow-xl p-5"><h1 className="text-2xl font-bold">Sales Paycheck + Budget Planner V4</h1><div className="mt-4 flex flex-wrap gap-2">{(['Dashboard', 'Income', 'Budget', 'Scenarios'] as Tab[]).map(t => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5 ${tab === t ? 'bg-blue-600 text-white shadow' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}>{t}</button>)}</div></header>

    <div className="transition-all duration-300 ease-out">
    {tab === 'Dashboard' && <section className="space-y-4"><Card title="Dashboard Summary"><div className="flex gap-2 mb-4">{dashboardPeriods.map(p => <Pill key={p} active={dashboardPeriod === p} onClick={() => setDashboardPeriod(p)}>{labelPeriod(p)}</Pill>)}</div><div className="mb-4">Monthly Gross Profit Reference: <span className={grossProfit > 10000 ? 'text-green-400 font-semibold' : 'text-slate-100 font-semibold'}>{currency(grossProfit)}</span></div><div className="grid gap-3 md:grid-cols-3"><Metric title="Base Gross Income" value={currency(periodFromMonthly(income.baseGrossMonthly, dashboardPeriod))} /><Metric title="Base Net Income" value={currency(periodFromMonthly(income.baseMonthly, dashboardPeriod))} /><Metric title="Commission Income" value={currency(periodFromMonthly(income.commissionMonthly, dashboardPeriod))} /><Metric title="Total Net Income" value={currency(periodFromMonthly(income.totalMonthly, dashboardPeriod))} /><Metric title="Total Budget" value={currency(periodFromMonthly(monthlyBudget, dashboardPeriod))} /><Metric title="Remaining After Budget" value={currency(periodFromMonthly(monthlyLeftover, dashboardPeriod))} tone={monthlyLeftover < 0 ? 'danger' : monthlyLeftover < income.totalMonthly * 0.1 ? 'warn' : 'good'} /></div></Card>
    <Card title="Financial Intelligence"><div className="grid gap-3 md:grid-cols-3"><Info title="Biggest Expense" value={top3[0] ? `${top3[0].name} (${currency(top3[0].amount)})` : 'None'} /><Info title="Fixed Bills Ratio" value={`${fixedRatio.toFixed(1)}%`} tone={fixedRatio > 50 ? 'warn' : 'good'} /><Info title="Savings Rate" value={`${savingsRate.toFixed(1)}%`} tone={savingsRate < 10 ? 'warn' : 'good'} /><Info title="Commission Dependency" value={`${commissionTier} (${income.commissionPctOfTotal.toFixed(1)}%)`} tone={commissionTier === 'Risky' || commissionTier === 'High' ? 'danger' : commissionTier === 'Moderate' ? 'warn' : 'good'} /><Info title="Remaining Cushion" value={`${leftoverPct.toFixed(1)}% of income`} tone={leftoverPct < 5 ? 'danger' : leftoverPct < 10 ? 'warn' : 'good'} /><Info title="Budget Health Tier" value={healthTier} tone={healthTier === 'Strong' ? 'good' : healthTier === 'Stable' ? 'neutral' : healthTier === 'Tight' ? 'warn' : 'danger'} sub="Based on leftover, savings, fixed costs, and commission dependency." /></div></Card></section>}

    {tab === 'Income' && <section className="space-y-4"><Card title="Income Input"><label className="text-sm">Monthly Gross Profit</label><div className="relative mt-2"><span className="absolute left-3 top-2.5 text-slate-400">$</span><input type="number" min={0} step={100} value={grossProfitInput} onChange={e => setGrossProfitInput(String(Math.max(0, Number(e.target.value) || 0)))} className="w-full rounded-lg border border-slate-600 bg-slate-800 pl-7 p-2" /></div><div className="text-xs text-slate-400 mt-1">Formatted: {currency(grossProfit)}</div></Card><div className="grid gap-4 md:grid-cols-2"><Card title="Base Income"><Row l="Monthly Net" v={currency(income.baseMonthly)} /><Row l="Bi-weekly Net" v={currency(income.baseBiWeekly)} /><Row l="Weekly Net" v={currency(income.baseWeekly)} /></Card><Card title="Commission Income"><Row l="Monthly Commission" v={currency(income.commissionMonthly)} /><Row l="Bi-weekly Commission" v={currency(income.commissionBiWeekly)} /><Row l="Weekly Commission" v={currency(income.commissionWeekly)} /></Card><Card title="Total Income"><Row l="Monthly Net" v={currency(income.totalMonthly)} /><Row l="Bi-weekly Net" v={currency(income.totalBiWeekly)} /><Row l="Weekly Net" v={currency(income.totalWeekly)} /></Card><Card title="Efficiency Metrics"><Row l="Effective hourly net rate" v={currency(income.hourlyNet)} /><Row l="Commission as % of total income" v={`${income.commissionPctOfTotal.toFixed(1)}%`} /><Row l="Commission per hour" v={currency(income.commissionPerHour)} /></Card></div></section>}

    {tab === 'Budget' && <section className="space-y-4"><Card title="Budget Summary"><div className="flex gap-2 mb-4 flex-wrap">{periodOptions.map(p => <Pill key={p} active={budgetPeriod === p} onClick={() => setBudgetPeriod(p)}>{labelPeriod(p)}</Pill>)}</div><div className="grid gap-3 md:grid-cols-4"><Metric title="Total available income" value={currency(periodFromMonthly(income.totalMonthly, budgetPeriod))} /><Metric title="Total planned expenses" value={currency(periodFromMonthly(monthlyBudget, budgetPeriod))} /><Metric title="Remaining amount" value={currency(periodFromMonthly(monthlyLeftover, budgetPeriod))} tone={monthlyLeftover < 0 ? 'danger' : monthlyLeftover < income.totalMonthly * 0.1 ? 'warn' : 'good'} /><Metric title="Budget status" value={healthTier} tone={healthTier === 'Strong' ? 'good' : healthTier === 'Stable' ? 'neutral' : healthTier === 'Tight' ? 'warn' : 'danger'} /></div></Card>
    <Card title="Budget Categories"><div className="grid gap-2 md:grid-cols-4"><div className="relative"><input className="w-full rounded-lg border border-slate-600 bg-slate-800 p-2" placeholder="Category name" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} />{matchingSuggestions.length > 0 && <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 shadow-lg">{matchingSuggestions.map(s => <button key={s} className="block w-full text-left px-2 py-1 hover:bg-slate-700" onClick={() => { setForm(v => ({ ...v, name: s })); amountRef.current?.focus() }}>{s}</button>)}</div>}</div><input ref={amountRef} className="rounded-lg border border-slate-600 bg-slate-800 p-2" type="number" min={0} step={25} placeholder="Monthly amount" value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} /><select className="rounded-lg border border-slate-600 bg-slate-800 p-2" value={form.type} onChange={e => setForm(v => ({ ...v, type: e.target.value as CategoryType }))}><option>fixed bill</option><option>variable spending</option><option>savings</option><option>investing</option></select><button className="rounded-lg bg-blue-600 font-semibold hover:bg-blue-500 transition" onClick={addCategory}>Add</button></div>
    <div className="mt-3 grid md:grid-cols-3 gap-2"><input className="rounded-lg border border-slate-600 bg-slate-800 p-2" placeholder="Budget name" value={budgetName} onChange={e => setBudgetName(e.target.value)} /><button className="rounded-lg bg-blue-600 p-2" onClick={saveBudget}>Save Budget</button><div className="text-xs text-slate-400 self-center">Auto-saved locally</div></div>
    <div className="mt-2 space-y-2">{savedBudgets.map(b => <div key={b.name} className="rounded border border-slate-700 p-2 text-sm flex items-center justify-between"><div><div className="font-medium">{b.name}</div><div className="text-xs text-slate-400">Saved {new Date(b.savedAt).toLocaleString()}</div></div><div className="flex gap-2"><button className="text-blue-300" onClick={() => setCategories(b.categories)}>Load</button><button className="text-amber-300" onClick={() => { const n = window.prompt('Rename budget', b.name); if (!n?.trim()) return; setSavedBudgets(prev => prev.map(x => x.name === b.name ? { ...x, name: n.trim() } : x)) }}>Rename</button><button className="text-red-300" onClick={() => setSavedBudgets(prev => prev.filter(x => x.name !== b.name))}>Delete</button></div></div>)}</div>
    {changeSummary.length > 0 && <div className="mt-3 rounded-lg border border-slate-700 bg-slate-800 p-3"><div className="font-semibold mb-1">What Changed (after save)</div><ul className="list-disc pl-5 text-sm text-slate-300">{changeSummary.map(i => <li key={i}>{i}</li>)}</ul></div>}
    <div className="overflow-x-auto mt-3"><table className="w-full text-sm"><thead><tr className="border-b border-slate-700 text-left text-slate-400"><th>Name</th><th>Type</th><th>Monthly</th><th>{labelPeriod(budgetPeriod)}</th><th /></tr></thead><tbody>{sortedCategories.map(c => <tr key={c.id} className="border-b border-slate-800"><td className="py-2">{c.name}</td><td>{c.type}</td><td>{currency(c.amount)}</td><td>{currency(periodFromMonthly(c.amount, budgetPeriod))}</td><td><button className="text-red-300" onClick={() => setCategories(prev => prev.filter(x => x.id !== c.id))}>Delete</button></td></tr>)}</tbody></table></div></Card>
    <Card title="Budget Intelligence"><div className="grid gap-3 md:grid-cols-3"><Info title="Top 3 expenses" value={top3.length ? top3.map(t => `${t.name} (${currency(t.amount)})`).join(', ') : 'No expenses yet'} /><Info title="Fixed bills ratio" value={`${fixedRatio.toFixed(1)}%`} tone={fixedRatio > 50 ? 'warn' : 'good'} /><Info title="Savings rate" value={`${savingsRate.toFixed(1)}%`} tone={savingsRate < 10 ? 'warn' : 'good'} /><Info title="Investing rate" value={`${(income.totalMonthly > 0 ? (monthlyByType.investing / income.totalMonthly) * 100 : 0).toFixed(1)}%`} /><Info title="Remaining cushion" value={`${leftoverPct.toFixed(1)}%`} tone={leftoverPct < 5 ? 'danger' : leftoverPct < 10 ? 'warn' : 'good'} /><Info title="Coverage" value={budgetNeedsCommission ? 'Requires commission' : 'Works on base salary only'} tone={budgetNeedsCommission ? 'warn' : 'good'} /></div></Card></section>}

    {tab === 'Scenarios' && <section className="space-y-4"><Card title="Scenario Manager"><div className="flex gap-2 mb-3 flex-wrap">{periodOptions.map(p => <Pill key={p} active={scenarioPeriod === p} onClick={() => setScenarioPeriod(p)}>{labelPeriod(p)}</Pill>)}</div><div className="grid md:grid-cols-4 gap-2">{(Object.keys(scenarioGrossProfit) as ScenarioName[]).map(name => <div key={name}><label className="text-xs text-slate-400">{name}</label><input type="number" min={0} step={100} className="w-full rounded-lg border border-slate-600 bg-slate-800 p-2" value={scenarioGrossProfit[name]} onChange={e => setScenarioGrossProfit(prev => ({ ...prev, [name]: Math.max(0, Number(e.target.value) || 0) }))} /></div>)}</div><div className="mt-3 grid md:grid-cols-3 gap-2"><input className="rounded-lg border border-slate-600 bg-slate-800 p-2" placeholder="Scenario set name" value={scenarioSetName} onChange={e => setScenarioSetName(e.target.value)} /><button className="rounded-lg bg-blue-600 p-2" onClick={saveScenarioSet}>Save Scenario Set</button><div className="text-xs text-slate-400 self-center">Saved locally with period</div></div><div className="space-y-2 mt-2">{savedScenarioSets.map(s => <div key={s.name} className="rounded border border-slate-700 p-2 text-sm flex justify-between"><div><div className="font-medium">{s.name}</div><div className="text-xs text-slate-400">Saved {new Date(s.savedAt).toLocaleString()}</div></div><div className="flex gap-2"><button className="text-blue-300" onClick={() => { setScenarioGrossProfit(s.scenarios); setScenarioPeriod(s.period) }}>Load</button><button className="text-red-300" onClick={() => setSavedScenarioSets(prev => prev.filter(x => x.name !== s.name))}>Delete</button></div></div>)}</div></Card>
    <div className="grid gap-3 md:grid-cols-2">{(Object.keys(scenarioGrossProfit) as ScenarioName[]).map(name => {const values = getIncome(scenarioGrossProfit[name]); const remaining = periodFromMonthly(values.totalMonthly - monthlyBudget, scenarioPeriod); const tone = name === 'Slow' ? 'border-yellow-500/50' : name === 'Fast' ? 'border-green-500/50' : 'border-slate-700'; return <Card key={name} title={`${name} Scenario`} className={tone}><Row l="Monthly Gross Profit Input" v={currency(scenarioGrossProfit[name])} /><Row l={`Converted Gross Profit (${labelPeriod(scenarioPeriod)})`} v={currency(periodFromMonthly(scenarioGrossProfit[name], scenarioPeriod))} /><Row l="Commission" v={currency(periodFromMonthly(values.commissionMonthly, scenarioPeriod))} /><Row l="Base net income" v={currency(periodFromMonthly(values.baseMonthly, scenarioPeriod))} /><Row l="Total net income" v={currency(periodFromMonthly(values.totalMonthly, scenarioPeriod))} /><Row l="Effective hourly rate" v={currency(values.hourlyNet)} /><Row l="Remaining after budget" v={currency(remaining)} valueClass={remaining < 0 ? 'text-red-400' : 'text-green-400'} /></Card>})}</div></section>}
    </div>
  </div></div>
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-slate-700 bg-slate-800/80 shadow-lg p-4 md:p-5 transition-all duration-200 hover:-translate-y-0.5 ${className}`}><h2 className="text-lg font-semibold mb-3">{title}</h2>{children}</div>
}
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={`px-3 py-1.5 rounded-md text-sm transition ${active ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}>{children}</button>
}
function Metric({ title, value, tone = 'neutral' }: { title: string; value: string; tone?: 'neutral' | 'good' | 'warn' | 'danger' }) {
  const c = tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-yellow-300' : tone === 'danger' ? 'text-red-400' : 'text-slate-100'
  return <div className="rounded-xl border border-slate-700 bg-slate-800 p-3"><div className="text-xs text-slate-400 mb-1">{title}</div><div className={`text-xl font-bold ${c}`}>{value}</div></div>
}
function Info({ title, value, sub, tone = 'neutral' }: { title: string; value: string; sub?: string; tone?: 'neutral' | 'good' | 'warn' | 'danger' }) {
  const c = tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-yellow-300' : tone === 'danger' ? 'text-red-400' : 'text-slate-100'
  return <div className="rounded-xl border border-slate-700 bg-slate-800 p-3"><div className="text-xs text-slate-400 mb-1">{title}</div><div className={`font-semibold ${c}`}>{value}</div>{sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}</div>
}
function Row({ l, v, valueClass = 'text-slate-100' }: { l: string; v: string; valueClass?: string }) {
  return <div className="py-1.5 border-b border-slate-700 last:border-b-0 flex justify-between text-sm"><span className="text-slate-400">{l}</span><span className={`font-medium ${valueClass}`}>{v}</span></div>
}
