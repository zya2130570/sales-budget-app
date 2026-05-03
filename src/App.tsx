import { useEffect, useMemo, useState } from 'react'

type CategoryType = 'fixed bill' | 'savings' | 'investing' | 'variable spending'
type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Scenarios'

type BudgetCategory = { id: string; name: string; amount: number; type: CategoryType }

type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'
type ScenarioMap = Record<ScenarioName, number>

const BASE_SALARY = 40000
const TAKE_HOME_RATE = 0.8243
const HOURS_PER_WEEK = 45

const commissionBrackets = [
  { upTo: 5000, rate: 0.04 },
  { upTo: 10000, rate: 0.06 },
  { upTo: 20000, rate: 0.08 },
  { upTo: 40000, rate: 0.1 },
  { upTo: 60000, rate: 0.11 },
  { upTo: 100000, rate: 0.12 },
  { upTo: Infinity, rate: 0.14 },
]

const storageKeys = {
  categories: 'sales-budget-categories-v2',
  scenarios: 'sales-budget-scenarios-v2',
}

const defaultScenarios: ScenarioMap = { Slow: 8000, Medium: 15000, Fast: 30000, Custom: 10000 }

const currency = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
const pct = (v: number) => `${v.toFixed(1)}%`

// Progressive commission: each rate applies only to dollars inside its own bracket.
function calculateMonthlyCommission(grossProfit: number): number {
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

function getIncomeValues(grossProfit: number) {
  const baseMonthlyNet = (BASE_SALARY / 12) * TAKE_HOME_RATE
  const baseBiWeeklyNet = (BASE_SALARY / 26) * TAKE_HOME_RATE
  const baseWeeklyNet = (BASE_SALARY / 52) * TAKE_HOME_RATE

  const monthlyCommission = calculateMonthlyCommission(grossProfit)
  const biWeeklyCommission = monthlyCommission / 2
  const weeklyCommission = monthlyCommission / 4

  const monthlyTotalNet = baseMonthlyNet + monthlyCommission
  const biWeeklyTotalNet = baseBiWeeklyNet + biWeeklyCommission
  const weeklyTotalNet = baseWeeklyNet + weeklyCommission

  const effectiveHourlyNet = weeklyTotalNet / HOURS_PER_WEEK
  const commissionPctTotal = monthlyTotalNet > 0 ? (monthlyCommission / monthlyTotalNet) * 100 : 0
  const commissionPerHour = weeklyCommission / HOURS_PER_WEEK

  return {
    baseMonthlyNet,
    baseBiWeeklyNet,
    baseWeeklyNet,
    monthlyCommission,
    biWeeklyCommission,
    weeklyCommission,
    monthlyTotalNet,
    biWeeklyTotalNet,
    weeklyTotalNet,
    effectiveHourlyNet,
    commissionPctTotal,
    commissionPerHour,
  }
}

function App() {
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [grossProfit, setGrossProfit] = useState(15000)
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [form, setForm] = useState({ name: '', amount: '', type: 'fixed bill' as CategoryType })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioMap>(defaultScenarios)

  useEffect(() => {
    const savedCategories = localStorage.getItem(storageKeys.categories)
    const savedScenarios = localStorage.getItem(storageKeys.scenarios)
    if (savedCategories) setCategories(JSON.parse(savedCategories))
    if (savedScenarios) setScenarios(JSON.parse(savedScenarios))
  }, [])

  useEffect(() => localStorage.setItem(storageKeys.categories, JSON.stringify(categories)), [categories])
  useEffect(() => localStorage.setItem(storageKeys.scenarios, JSON.stringify(scenarios)), [scenarios])

  const income = useMemo(() => getIncomeValues(grossProfit), [grossProfit])

  const monthlyExpense = categories.filter(c => c.type === 'fixed bill' || c.type === 'variable spending').reduce((s, c) => s + c.amount, 0)
  const monthlySavings = categories.filter(c => c.type === 'savings').reduce((s, c) => s + c.amount, 0)
  const monthlyInvesting = categories.filter(c => c.type === 'investing').reduce((s, c) => s + c.amount, 0)
  const monthlySaveInvest = monthlySavings + monthlyInvesting
  const monthlyTotalOutflow = monthlyExpense + monthlySaveInvest

  const monthlyLeftover = income.monthlyTotalNet - monthlyTotalOutflow
  const biWeekly = (v: number) => v / 2
  const weekly = (v: number) => v / 4

  const leftoverPct = income.monthlyTotalNet > 0 ? (monthlyLeftover / income.monthlyTotalNet) * 100 : 0
  const status = leftoverPct >= 20 ? 'Green' : leftoverPct >= 5 ? 'Yellow' : 'Red'
  const statusClass = status === 'Green' ? 'text-green-700 bg-green-100' : status === 'Yellow' ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'

  const savingsRate = income.monthlyTotalNet > 0 ? (monthlySaveInvest / income.monthlyTotalNet) * 100 : 0
  const fixedCostRatio = income.monthlyTotalNet > 0 ? (categories.filter(c => c.type === 'fixed bill').reduce((s,c)=>s+c.amount,0) / income.monthlyTotalNet) * 100 : 0

  const saveCategory = () => {
    if (!form.name || !form.amount) return
    if (editingId) {
      setCategories(prev => prev.map(c => c.id === editingId ? { ...c, name: form.name, amount: Number(form.amount), type: form.type } : c))
      setEditingId(null)
    } else {
      setCategories(prev => [...prev, { id: crypto.randomUUID(), name: form.name, amount: Number(form.amount), type: form.type }])
    }
    setForm({ name: '', amount: '', type: 'fixed bill' })
  }

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-6">
      <div className="rounded-2xl bg-white shadow p-4 md:p-5">
        <h1 className="text-2xl md:text-3xl font-bold">Sales Paycheck + Budget Planner (V2)</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {(['Dashboard','Income','Budget','Scenarios'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab===t ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{t}</button>
          ))}
        </div>
      </div>

      {tab === 'Dashboard' && <div className="grid gap-4 md:grid-cols-3">
        <Card title="Current Monthly Gross Profit"><p className="text-2xl font-semibold">{currency(grossProfit)}</p></Card>
        <Card title="Total Monthly Net Income"><p className="text-2xl font-semibold">{currency(income.monthlyTotalNet)}</p></Card>
        <Card title="Monthly Leftover"><p className="text-2xl font-semibold">{currency(monthlyLeftover)}</p></Card>
      </div>}

      {tab === 'Income' && <div className="space-y-4">
        <Card title="Income Inputs"><label className="text-sm">Monthly Gross Profit</label><input step={100} type="number" className="mt-1 w-full rounded border p-2" value={grossProfit} onChange={e => setGrossProfit(Number(e.target.value))} /></Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="A) Base Income (salary only, no commission)"><KV label="Monthly Net" value={currency(income.baseMonthlyNet)} /><KV label="Bi-weekly Net" value={currency(income.baseBiWeeklyNet)} /><KV label="Weekly Net" value={currency(income.baseWeeklyNet)} /></Card>
          <Card title="B) Commission Income"><KV label="Monthly Commission" value={currency(income.monthlyCommission)} /><KV label="Bi-weekly Commission" value={currency(income.biWeeklyCommission)} /><KV label="Weekly Commission" value={currency(income.weeklyCommission)} /></Card>
          <Card title="C) Total Income (base salary + commission)"><KV label="Monthly Net" value={currency(income.monthlyTotalNet)} /><KV label="Bi-weekly Net" value={currency(income.biWeeklyTotalNet)} /><KV label="Weekly Net" value={currency(income.weeklyTotalNet)} /></Card>
          <Card title="D) Efficiency Metrics"><KV label="Effective hourly net rate" value={currency(income.effectiveHourlyNet)} /><KV label="Commission as % of total income" value={pct(income.commissionPctTotal)} /><KV label="Commission per hour" value={currency(income.commissionPerHour)} /></Card>
        </div>
      </div>}

      {tab === 'Budget' && <div className="space-y-4">
        <Card title="Budget Planner">
          <div className="grid gap-2 md:grid-cols-4">
            <input className="rounded border p-2" placeholder="Category name" value={form.name} onChange={e => setForm(v => ({...v, name: e.target.value}))} />
            <input className="rounded border p-2" type="number" step={25} placeholder="Amount" value={form.amount} onChange={e => setForm(v => ({...v, amount: e.target.value}))} />
            <select className="rounded border p-2" value={form.type} onChange={e => setForm(v => ({...v, type: e.target.value as CategoryType}))}><option>fixed bill</option><option>savings</option><option>investing</option><option>variable spending</option></select>
            <button className="rounded bg-blue-600 text-white" onClick={saveCategory}>{editingId ? 'Save' : 'Add'}</button>
          </div>
          <table className="w-full mt-3 text-sm"><thead><tr className="text-left border-b"><th>Name</th><th>Type</th><th>Amount</th><th /></tr></thead><tbody>{categories.map(c => <tr key={c.id} className="border-b"><td>{c.name}</td><td>{c.type}</td><td>{currency(c.amount)}</td><td className="space-x-2"><button className="text-blue-700" onClick={()=>{setEditingId(c.id);setForm({name:c.name, amount:String(c.amount), type:c.type})}}>Edit</button><button className="text-red-700" onClick={()=>setCategories(p=>p.filter(x=>x.id!==c.id))}>Delete</button></td></tr>)}</tbody></table>
        </Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Budget Outputs"><KV label="A) Expenses (M / BW / W)" value={`${currency(monthlyExpense)} / ${currency(biWeekly(monthlyExpense))} / ${currency(weekly(monthlyExpense))}`} /><KV label="B) Savings (M / BW / W)" value={`${currency(monthlySavings)} / ${currency(biWeekly(monthlySavings))} / ${currency(weekly(monthlySavings))}`} /><KV label="C) Investing (M / BW / W)" value={`${currency(monthlyInvesting)} / ${currency(biWeekly(monthlyInvesting))} / ${currency(weekly(monthlyInvesting))}`} /><KV label="D) Combined Savings + Investing" value={`${currency(monthlySaveInvest)} / ${currency(biWeekly(monthlySaveInvest))} / ${currency(weekly(monthlySaveInvest))}`} /><KV label="E) Leftover" value={`${currency(monthlyLeftover)} / ${currency(biWeekly(monthlyLeftover))} / ${currency(weekly(monthlyLeftover))}`} /></Card>
          <Card title="F) Budget Status + G) Smart Flags"><div className={`inline-block px-3 py-1 rounded-full font-semibold ${statusClass}`}>{status} status</div><p className="text-sm mt-2">Leftover ratio: {pct(leftoverPct)}</p><ul className="text-sm mt-3 list-disc pl-6 space-y-1"><li>{income.baseMonthlyNet >= monthlyTotalOutflow ? '✅ Works on base salary only' : '⚠️ Requires commission'}</li><li>{income.baseMonthlyNet < monthlyTotalOutflow ? '⚠️ Requires commission' : '✅ Does not require commission'}</li><li>{savingsRate < 10 ? '⚠️ Savings rate below 10%' : '✅ Savings rate 10% or higher'}</li><li>{fixedCostRatio > 50 ? '⚠️ High fixed cost ratio above 50%' : '✅ Fixed cost ratio at or below 50%'}</li></ul></Card>
        </div>
      </div>}

      {tab === 'Scenarios' && <div className="space-y-4">
        <Card title="Monthly Scenario Comparison">
          <div className="grid md:grid-cols-4 gap-3 mb-4">{(Object.keys(scenarios) as ScenarioName[]).map(name => <div key={name}><label className="text-xs text-slate-600">{name} GP</label><input type="number" step={100} className="w-full rounded border p-2" value={scenarios[name]} onChange={e => setScenarios(p => ({...p, [name]: Number(e.target.value)}))} /></div>)}</div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th>Scenario</th><th>Monthly GP</th><th>Monthly Commission</th><th>Monthly Net</th><th>Bi-weekly Net</th><th>Weekly Net</th><th>Hourly Net</th><th>Yearly Income</th><th>Yearly Commission</th><th>Yearly Leftover</th></tr></thead><tbody>{(Object.keys(scenarios) as ScenarioName[]).map(name => {const v = getIncomeValues(scenarios[name]); const yIncome=v.monthlyTotalNet*12; const yCom=v.monthlyCommission*12; const yLeft=(v.monthlyTotalNet-monthlyTotalOutflow)*12; return <tr key={name} className="border-b"><td>{name}</td><td>{currency(scenarios[name])}</td><td>{currency(v.monthlyCommission)}</td><td>{currency(v.monthlyTotalNet)}</td><td>{currency(v.biWeeklyTotalNet)}</td><td>{currency(v.weeklyTotalNet)}</td><td>{currency(v.effectiveHourlyNet)}</td><td>{currency(yIncome)}</td><td>{currency(yCom)}</td><td>{currency(yLeft)}</td></tr>})}</tbody></table></div>
        </Card>
      </div>}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-2xl bg-white shadow p-4 md:p-5"><h2 className="text-lg font-semibold mb-3">{title}</h2>{children}</section> }
function KV({ label, value }: { label: string; value: string }) { return <div className="flex justify-between border-b py-1.5 text-sm"><span className="text-slate-600">{label}</span><span className="font-medium">{value}</span></div> }

export default App
