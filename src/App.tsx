import { useEffect, useMemo, useState } from 'react'

type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Scenarios'
type Period = 'weekly' | 'biweekly' | 'monthly' | 'yearly'
type DashboardPeriod = Exclude<Period, 'yearly'>
type CategoryType = 'fixed bill' | 'savings' | 'investing' | 'variable spending'
type Category = { id: string; name: string; amount: number; type: CategoryType }
type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'

const BASE_SALARY = 40000
const TAKE_HOME_RATE = 0.8243
const HOURS_PER_WEEK = 45
const STORAGE_KEY = 'sales-budget-v2-categories'

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
const currency = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
const periodOptions: Period[] = ['weekly', 'biweekly', 'monthly', 'yearly']
const dashboardPeriods: DashboardPeriod[] = ['weekly', 'biweekly', 'monthly']

function periodFromMonthly(monthly: number, period: Period) {
  if (period === 'weekly') return monthly / 4
  if (period === 'biweekly') return monthly / 2
  if (period === 'yearly') return monthly * 12
  return monthly
}

function calculateMonthlyCommission(grossProfit: number) {
  let remaining = Math.max(0, grossProfit)
  let previousCap = 0
  let total = 0
  for (const b of commissionBrackets) {
    if (remaining <= 0) break
    const width = b.upTo - previousCap
    const taxable = Math.min(remaining, width)
    total += taxable * b.rate
    remaining -= taxable
    previousCap = b.upTo
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
  const totalBiWeekly = baseBiWeekly + commissionMonthly / 2
  const totalWeekly = baseWeekly + commissionMonthly / 4
  return {
    baseGrossMonthly,
    baseMonthly,
    baseBiWeekly,
    baseWeekly,
    commissionMonthly,
    commissionBiWeekly: commissionMonthly / 2,
    commissionWeekly: commissionMonthly / 4,
    totalMonthly,
    totalBiWeekly,
    totalWeekly,
    hourlyNet: totalWeekly / HOURS_PER_WEEK,
    commissionPctOfTotal: totalMonthly > 0 ? (commissionMonthly / totalMonthly) * 100 : 0,
    commissionPerHour: (commissionMonthly / 4) / HOURS_PER_WEEK,
  }
}

function themeValueClass(value: number, lowThreshold = 0) {
  if (value < lowThreshold) return 'text-red-400'
  if (value === lowThreshold) return 'text-yellow-300'
  return 'text-green-400'
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('monthly')
  const [budgetPeriod, setBudgetPeriod] = useState<Period>('monthly')
  const [scenarioPeriod, setScenarioPeriod] = useState<Period>('monthly')
  const [grossProfitInput, setGrossProfitInput] = useState('15000')
  const [categories, setCategories] = useState<Category[]>([])
  const [savedFlash, setSavedFlash] = useState(false)
  const [scenarioGrossProfit, setScenarioGrossProfit] = useState(scenarioDefaults)
  const [form, setForm] = useState({ name: '', amount: '', type: 'fixed bill' as CategoryType })

  const grossProfit = Math.max(0, Number(grossProfitInput) || 0)
  const income = useMemo(() => getIncome(grossProfit), [grossProfit])

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        setCategories(JSON.parse(raw))
      } catch {
        setCategories([])
      }
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(categories))
    if (categories.length || localStorage.getItem(STORAGE_KEY)) {
      setSavedFlash(true)
      const t = setTimeout(() => setSavedFlash(false), 900)
      return () => clearTimeout(t)
    }
  }, [categories])

  const monthlyByType = useMemo(() => ({
    fixed: categories.filter(c => c.type === 'fixed bill').reduce((s, c) => s + c.amount, 0),
    variable: categories.filter(c => c.type === 'variable spending').reduce((s, c) => s + c.amount, 0),
    savings: categories.filter(c => c.type === 'savings').reduce((s, c) => s + c.amount, 0),
    investing: categories.filter(c => c.type === 'investing').reduce((s, c) => s + c.amount, 0),
  }), [categories])

  const monthlyBudget = monthlyByType.fixed + monthlyByType.variable + monthlyByType.savings + monthlyByType.investing

  const addCategory = () => {
    const amt = Number(form.amount)
    if (!form.name.trim() || Number.isNaN(amt) || amt < 0) return
    setCategories(prev => [...prev, { id: crypto.randomUUID(), name: form.name.trim(), amount: amt, type: form.type }])
    setForm({ name: '', amount: '', type: 'fixed bill' })
  }

  const sortedCategories = [...categories].sort((a, b) => b.amount - a.amount)

  const dashboardTotalNet = periodFromMonthly(income.totalMonthly, dashboardPeriod)
  const dashboardBudget = periodFromMonthly(monthlyBudget, dashboardPeriod)
  const dashboardRemaining = dashboardTotalNet - dashboardBudget

  const budgetIncome = periodFromMonthly(income.totalMonthly, budgetPeriod)
  const budgetExpenses = periodFromMonthly(monthlyByType.fixed + monthlyByType.variable, budgetPeriod)
  const budgetSavings = periodFromMonthly(monthlyByType.savings, budgetPeriod)
  const budgetInvesting = periodFromMonthly(monthlyByType.investing, budgetPeriod)
  const budgetTotal = periodFromMonthly(monthlyBudget, budgetPeriod)
  const budgetRemaining = budgetIncome - budgetTotal

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <header className="rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl p-5">
          <h1 className="text-2xl md:text-3xl font-bold">Sales Paycheck + Budget Planner</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {(['Dashboard', 'Income', 'Budget', 'Scenarios'] as Tab[]).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === t ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>{t}</button>
            ))}
          </div>
        </header>

        {tab === 'Dashboard' && <section className="space-y-4">
          <Card title="Dashboard Summary">
            <div className="flex flex-wrap gap-2 mb-4">
              {dashboardPeriods.map(p => <button key={p} onClick={() => setDashboardPeriod(p)} className={`px-3 py-1.5 rounded-md text-sm ${dashboardPeriod === p ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{p}</button>)}
            </div>
            <div className="mb-4 text-slate-300">Monthly Gross Profit Reference: <span className={grossProfit > 10000 ? 'text-green-400 font-semibold' : 'text-slate-100 font-semibold'}>{currency(grossProfit)}</span></div>
            <div className="grid gap-3 md:grid-cols-3">
              <Metric title="Base Gross Income" value={currency(periodFromMonthly(income.baseGrossMonthly, dashboardPeriod))} />
              <Metric title="Base Net Income" value={currency(periodFromMonthly(income.baseMonthly, dashboardPeriod))} />
              <Metric title="Commission Income" value={currency(periodFromMonthly(income.commissionMonthly, dashboardPeriod))} />
              <Metric title="Total Net Income" value={currency(dashboardTotalNet)} />
              <Metric title="Total Budget" value={currency(dashboardBudget)} />
              <Metric title="Remaining After Budget" value={currency(dashboardRemaining)} className={dashboardRemaining < 0 ? 'text-red-400' : dashboardRemaining < dashboardTotalNet * 0.05 ? 'text-yellow-300' : 'text-green-400'} />
            </div>
          </Card>
        </section>}

        {tab === 'Income' && <section className="space-y-4">
          <Card title="Income Input">
            <label className="text-sm text-slate-300">Monthly Gross Profit</label>
            <div className="mt-2 relative">
              <span className="absolute left-3 top-2.5 text-slate-400">$</span>
              <input type="number" min={0} step={100} className="w-full rounded-lg border border-slate-700 bg-slate-900 pl-7 p-2" value={grossProfitInput} onChange={e => setGrossProfitInput(String(Math.max(0, Number(e.target.value) || 0)))} />
            </div>
            <p className="text-xs text-slate-400 mt-2">Formatted: {currency(grossProfit)}</p>
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="A) Base Income (salary only, no commission)"><Row l="Monthly Net" v={currency(income.baseMonthly)} /><Row l="Bi-weekly Net" v={currency(income.baseBiWeekly)} /><Row l="Weekly Net" v={currency(income.baseWeekly)} /></Card>
            <Card title="B) Commission Income"><Row l="Monthly Commission" v={currency(income.commissionMonthly)} /><Row l="Bi-weekly Commission" v={currency(income.commissionBiWeekly)} /><Row l="Weekly Commission" v={currency(income.commissionWeekly)} /></Card>
            <Card title="C) Total Income (base salary + commission)"><Row l="Monthly Net" v={currency(income.totalMonthly)} /><Row l="Bi-weekly Net" v={currency(income.totalBiWeekly)} /><Row l="Weekly Net" v={currency(income.totalWeekly)} /></Card>
            <Card title="D) Efficiency Metrics"><Row l="Effective hourly net rate" v={currency(income.hourlyNet)} /><Row l="Commission as % of total income" v={`${income.commissionPctOfTotal.toFixed(1)}%`} /><Row l="Commission per hour" v={currency(income.commissionPerHour)} /></Card>
          </div>
        </section>}

        {tab === 'Budget' && <section className="space-y-4">
          <Card title="Budget Summary">
            <div className="flex flex-wrap gap-2 mb-4">{periodOptions.map(p => <button key={p} onClick={() => setBudgetPeriod(p)} className={`px-3 py-1.5 rounded-md text-sm ${budgetPeriod === p ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{p}</button>)}</div>
            <div className="grid gap-3 md:grid-cols-4">
              <Metric title="Total available income" value={currency(budgetIncome)} />
              <Metric title="Total planned expenses" value={currency(budgetTotal)} />
              <Metric title="Remaining amount" value={currency(budgetRemaining)} className={themeValueClass(budgetRemaining, 0)} />
              <Metric title="Budget status" value={budgetRemaining < 0 ? 'Over budget' : budgetRemaining < budgetIncome * 0.05 ? 'Tight budget' : 'Healthy'} className={budgetRemaining < 0 ? 'text-red-400' : budgetRemaining < budgetIncome * 0.05 ? 'text-yellow-300' : 'text-green-400'} />
            </div>
          </Card>

          <Card title="Budget Categories">
            <div className="grid gap-2 md:grid-cols-4">
              <input className="rounded-lg border border-slate-700 bg-slate-900 p-2" placeholder="Category name" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} />
              <input className="rounded-lg border border-slate-700 bg-slate-900 p-2" type="number" step={25} min={0} placeholder="Monthly amount" value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} />
              <select className="rounded-lg border border-slate-700 bg-slate-900 p-2" value={form.type} onChange={e => setForm(v => ({ ...v, type: e.target.value as CategoryType }))}><option>fixed bill</option><option>variable spending</option><option>savings</option><option>investing</option></select>
              <button className="rounded-lg bg-blue-600 font-semibold" onClick={addCategory}>Add</button>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400"><span>{savedFlash ? 'Saved' : 'Auto-saved to localStorage'}</span><button className="text-red-400" onClick={() => setCategories([])}>Reset Budget</button></div>
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-800 text-left text-slate-400"><th>Name</th><th>Type</th><th>Monthly</th><th>{budgetPeriod}</th><th /></tr></thead>
                <tbody>{sortedCategories.map(c => <tr key={c.id} className="border-b border-slate-900"><td className="py-2">{c.name}</td><td>{c.type}</td><td>{currency(c.amount)}</td><td>{currency(periodFromMonthly(c.amount, budgetPeriod))}</td><td><button className="text-red-400" onClick={() => setCategories(p => p.filter(x => x.id !== c.id))}>Delete</button></td></tr>)}</tbody>
              </table>
            </div>
          </Card>

          <Card title="Budget Breakdown">
            <Row l="Expenses (fixed + variable)" v={currency(budgetExpenses)} />
            <Row l="Savings" v={currency(budgetSavings)} />
            <Row l="Investing" v={currency(budgetInvesting)} />
            <Row l="Combined Savings + Investing" v={currency(budgetSavings + budgetInvesting)} />
          </Card>
        </section>}

        {tab === 'Scenarios' && <section className="space-y-4">
          <Card title="Monthly Scenario Comparison">
            <div className="flex flex-wrap gap-2 mb-4">{periodOptions.map(p => <button key={p} onClick={() => setScenarioPeriod(p)} className={`px-3 py-1.5 rounded-md text-sm ${scenarioPeriod === p ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300'}`}>{p}</button>)}</div>
            <div className="grid md:grid-cols-4 gap-3 mb-4">{(Object.keys(scenarioGrossProfit) as ScenarioName[]).map(name => <div key={name}><label className="text-xs text-slate-400">{name}</label><input type="number" min={0} step={100} className="w-full rounded-lg border border-slate-700 bg-slate-900 p-2" value={scenarioGrossProfit[name]} onChange={e => setScenarioGrossProfit(p => ({ ...p, [name]: Math.max(0, Number(e.target.value) || 0) }))} /></div>)}</div>
            <div className="grid gap-3 md:grid-cols-2">
              {(Object.keys(scenarioGrossProfit) as ScenarioName[]).map(name => {
                const values = getIncome(scenarioGrossProfit[name])
                const totalNet = periodFromMonthly(values.totalMonthly, scenarioPeriod)
                const commission = periodFromMonthly(values.commissionMonthly, scenarioPeriod)
                const baseNet = periodFromMonthly(values.baseMonthly, scenarioPeriod)
                const gpConv = periodFromMonthly(scenarioGrossProfit[name], scenarioPeriod)
                const remaining = totalNet - periodFromMonthly(monthlyBudget, scenarioPeriod)
                const tone = name === 'Fast' ? 'border-green-500/40' : name === 'Slow' ? 'border-yellow-500/40' : 'border-slate-700'
                return <div key={name} className={`rounded-xl border ${tone} bg-slate-900 p-4 space-y-1`}><div className="font-semibold">{name}</div><Row l="Gross profit" v={currency(gpConv)} /><Row l="Commission" v={currency(commission)} /><Row l="Base net income" v={currency(baseNet)} /><Row l="Total net income" v={currency(totalNet)} /><Row l="Effective hourly rate" v={currency(values.hourlyNet)} /><Row l="Remaining after budget" v={currency(remaining)} valueClass={themeValueClass(remaining, 0)} /></div>
              })}
            </div>
          </Card>
        </section>}
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-lg p-4 md:p-5"><h2 className="text-lg font-semibold mb-3">{title}</h2>{children}</div>
}

function Metric({ title, value, className = 'text-slate-100' }: { title: string; value: string; className?: string }) {
  return <div className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="text-xs text-slate-400 mb-1">{title}</div><div className={`text-xl font-bold ${className}`}>{value}</div></div>
}

function Row({ l, v, valueClass = 'text-slate-100' }: { l: string; v: string; valueClass?: string }) {
  return <div className="py-1.5 border-b border-slate-800 last:border-b-0 flex justify-between text-sm"><span className="text-slate-400">{l}</span><span className={`font-medium ${valueClass}`}>{v}</span></div>
}
