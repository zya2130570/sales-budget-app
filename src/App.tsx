import { useMemo, useState } from 'react'

type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Scenarios'
type CategoryType = 'fixed bill' | 'savings' | 'investing' | 'variable spending'
type Category = { id: string; name: string; amount: number; type: CategoryType }
type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'

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

const scenarioDefaults: Record<ScenarioName, number> = { Slow: 8000, Medium: 15000, Fast: 30000, Custom: 10000 }
const currency = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
const pct = (v: number) => `${v.toFixed(1)}%`

// Progressive commission: each bracket rate applies only to dollars inside that bracket.
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
  const baseMonthly = (BASE_SALARY / 12) * TAKE_HOME_RATE
  const baseBiWeekly = (BASE_SALARY / 26) * TAKE_HOME_RATE
  const baseWeekly = (BASE_SALARY / 52) * TAKE_HOME_RATE

  const commMonthly = calculateMonthlyCommission(gp)
  const commBiWeekly = commMonthly / 2
  const commWeekly = commMonthly / 4

  const totalMonthly = baseMonthly + commMonthly
  const totalBiWeekly = baseBiWeekly + commBiWeekly
  const totalWeekly = baseWeekly + commWeekly

  return {
    baseMonthly, baseBiWeekly, baseWeekly,
    commMonthly, commBiWeekly, commWeekly,
    totalMonthly, totalBiWeekly, totalWeekly,
    hourlyNet: totalWeekly / HOURS_PER_WEEK,
    commissionPct: totalMonthly > 0 ? (commMonthly / totalMonthly) * 100 : 0,
    commissionPerHour: commWeekly / HOURS_PER_WEEK,
  }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [gp, setGp] = useState(15000)
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState({ name: '', amount: '', type: 'fixed bill' as CategoryType })
  const [scenarios, setScenarios] = useState(scenarioDefaults)

  const income = useMemo(() => getIncome(gp), [gp])

  const monthlyFixed = categories.filter(c => c.type === 'fixed bill').reduce((s, c) => s + c.amount, 0)
  const monthlyVariable = categories.filter(c => c.type === 'variable spending').reduce((s, c) => s + c.amount, 0)
  const monthlyExpenses = monthlyFixed + monthlyVariable
  const monthlySavings = categories.filter(c => c.type === 'savings').reduce((s, c) => s + c.amount, 0)
  const monthlyInvesting = categories.filter(c => c.type === 'investing').reduce((s, c) => s + c.amount, 0)
  const monthlyLeftover = income.totalMonthly - (monthlyExpenses + monthlySavings + monthlyInvesting)

  const savingsRate = income.totalMonthly > 0 ? ((monthlySavings + monthlyInvesting) / income.totalMonthly) * 100 : 0
  const fixedCostRatio = income.totalMonthly > 0 ? (monthlyFixed / income.totalMonthly) * 100 : 0

  const addCategory = () => {
    if (!form.name || !form.amount) return
    setCategories(prev => [...prev, { id: crypto.randomUUID(), name: form.name, amount: Number(form.amount), type: form.type }])
    setForm({ name: '', amount: '', type: 'fixed bill' })
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      <header className="bg-white rounded-2xl shadow p-4 md:p-6">
        <h1 className="text-2xl md:text-3xl font-bold">Sales Paycheck + Budget Planner</h1>
        <div className="mt-4 flex flex-wrap gap-2">
          {(['Dashboard', 'Income', 'Budget', 'Scenarios'] as Tab[]).map(t => <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm ${tab === t ? 'bg-blue-600 text-white' : 'bg-slate-100'}`}>{t}</button>)}
        </div>
      </header>

      {tab === 'Dashboard' && <section className="grid gap-4 md:grid-cols-3">
        <Card title="Monthly Gross Profit"><div className="text-2xl font-bold">{currency(gp)}</div></Card>
        <Card title="Monthly Total Net Income"><div className="text-2xl font-bold">{currency(income.totalMonthly)}</div></Card>
        <Card title="Monthly Leftover"><div className="text-2xl font-bold">{currency(monthlyLeftover)}</div></Card>
      </section>}

      {tab === 'Income' && <section className="space-y-4">
        <Card title="Income Input"><label className="text-sm">Monthly Gross Profit</label><input type="number" step={100} className="w-full mt-1 rounded border p-2" value={gp} onChange={e => setGp(Number(e.target.value))} /></Card>
        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Base Income (salary only, no commission)"><Row l="Monthly Net" v={currency(income.baseMonthly)} /><Row l="Bi-weekly Net" v={currency(income.baseBiWeekly)} /><Row l="Weekly Net" v={currency(income.baseWeekly)} /></Card>
          <Card title="Commission Income"><Row l="Monthly Commission" v={currency(income.commMonthly)} /><Row l="Bi-weekly Commission" v={currency(income.commBiWeekly)} /><Row l="Weekly Commission" v={currency(income.commWeekly)} /></Card>
          <Card title="Total Income (base salary + commission)"><Row l="Monthly Net" v={currency(income.totalMonthly)} /><Row l="Bi-weekly Net" v={currency(income.totalBiWeekly)} /><Row l="Weekly Net" v={currency(income.totalWeekly)} /></Card>
          <Card title="Efficiency Metrics"><Row l="Effective hourly net rate" v={currency(income.hourlyNet)} /><Row l="Commission as % of total income" v={pct(income.commissionPct)} /><Row l="Commission per hour" v={currency(income.commissionPerHour)} /></Card>
        </div>
      </section>}

      {tab === 'Budget' && <section className="space-y-4">
        <Card title="Budget Planner">
          <div className="grid gap-2 md:grid-cols-4">
            <input className="rounded border p-2" placeholder="Category name" value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} />
            <input className="rounded border p-2" type="number" step={25} placeholder="Amount" value={form.amount} onChange={e => setForm(v => ({ ...v, amount: e.target.value }))} />
            <select className="rounded border p-2" value={form.type} onChange={e => setForm(v => ({ ...v, type: e.target.value as CategoryType }))}><option>fixed bill</option><option>savings</option><option>investing</option><option>variable spending</option></select>
            <button className="bg-blue-600 text-white rounded" onClick={addCategory}>Add</button>
          </div>
          <table className="mt-3 w-full text-sm"><thead><tr className="border-b text-left"><th>Name</th><th>Type</th><th>Amount</th><th /></tr></thead><tbody>{categories.map(c => <tr key={c.id} className="border-b"><td>{c.name}</td><td>{c.type}</td><td>{currency(c.amount)}</td><td><button className="text-red-700" onClick={() => setCategories(p => p.filter(x => x.id !== c.id))}>Delete</button></td></tr>)}</tbody></table>
        </Card>
        <Card title="Budget Outputs">
          <Row l="Expenses (M / BW / W)" v={`${currency(monthlyExpenses)} / ${currency(monthlyExpenses / 2)} / ${currency(monthlyExpenses / 4)}`} />
          <Row l="Savings (M / BW / W)" v={`${currency(monthlySavings)} / ${currency(monthlySavings / 2)} / ${currency(monthlySavings / 4)}`} />
          <Row l="Investing (M / BW / W)" v={`${currency(monthlyInvesting)} / ${currency(monthlyInvesting / 2)} / ${currency(monthlyInvesting / 4)}`} />
          <Row l="Combined Savings + Investing (M / BW / W)" v={`${currency(monthlySavings + monthlyInvesting)} / ${currency((monthlySavings + monthlyInvesting) / 2)} / ${currency((monthlySavings + monthlyInvesting) / 4)}`} />
          <Row l="Leftover (M / BW / W)" v={`${currency(monthlyLeftover)} / ${currency(monthlyLeftover / 2)} / ${currency(monthlyLeftover / 4)}`} />
        </Card>
        <Card title="Smart Flags">
          <ul className="list-disc pl-6 space-y-1 text-sm">
            <li>{income.baseMonthly >= (monthlyExpenses + monthlySavings + monthlyInvesting) ? '✅ Works on base salary only' : '⚠️ Requires commission'}</li>
            <li>{savingsRate < 10 ? '⚠️ Savings rate below 10%' : '✅ Savings rate 10% or higher'}</li>
            <li>{fixedCostRatio > 50 ? '⚠️ High fixed cost ratio above 50%' : '✅ Fixed cost ratio at or below 50%'}</li>
          </ul>
        </Card>
      </section>}

      {tab === 'Scenarios' && <section>
        <Card title="Monthly Scenario Comparison">
          <div className="grid md:grid-cols-4 gap-3 mb-4">{(Object.keys(scenarios) as ScenarioName[]).map(name => <div key={name}><label className="text-xs text-slate-600">{name} GP</label><input type="number" step={100} className="w-full rounded border p-2" value={scenarios[name]} onChange={e => setScenarios(p => ({ ...p, [name]: Number(e.target.value) }))} /></div>)}</div>
          <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b text-left"><th>Scenario</th><th>Monthly GP</th><th>Monthly Commission</th><th>Monthly Net</th><th>Bi-weekly Net</th><th>Weekly Net</th></tr></thead><tbody>{(Object.keys(scenarios) as ScenarioName[]).map(name => {const values = getIncome(scenarios[name]); return <tr key={name} className="border-b"><td>{name}</td><td>{currency(scenarios[name])}</td><td>{currency(values.commMonthly)}</td><td>{currency(values.totalMonthly)}</td><td>{currency(values.totalBiWeekly)}</td><td>{currency(values.totalWeekly)}</td></tr>})}</tbody></table></div>
        </Card>
      </section>}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) { return <div className="bg-white rounded-2xl shadow p-4 md:p-5"><h2 className="text-lg font-semibold mb-3">{title}</h2>{children}</div> }
function Row({ l, v }: { l: string; v: string }) { return <div className="py-1.5 border-b flex justify-between text-sm"><span className="text-slate-600">{l}</span><span className="font-medium">{v}</span></div> }
