import { useEffect, useMemo, useState } from 'react'

type CategoryType = 'fixed bill' | 'savings' | 'investing' | 'variable spending'

type BudgetCategory = {
  id: string
  name: string
  amount: number
  type: CategoryType
}

type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'
type Scenario = { name: ScenarioName; grossProfit: number }

const BASE_SALARY = 40000
const TAKE_HOME_RATE = 0.8243
const HOURS_PER_WEEK = 45

const defaultScenarios: Scenario[] = [
  { name: 'Slow', grossProfit: 8000 },
  { name: 'Medium', grossProfit: 15000 },
  { name: 'Fast', grossProfit: 30000 },
  { name: 'Custom', grossProfit: 10000 },
]

const commissionBrackets = [
  { upTo: 5000, rate: 0.04 },
  { upTo: 10000, rate: 0.06 },
  { upTo: 20000, rate: 0.08 },
  { upTo: 40000, rate: 0.1 },
  { upTo: 60000, rate: 0.11 },
  { upTo: 100000, rate: 0.12 },
  { upTo: Infinity, rate: 0.14 },
]

const currency = (value: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)

// Progressive commission (marginal tiers): each rate only applies to dollars within that bracket only.
function calculateMonthlyCommission(grossProfit: number): number {
  let remaining = Math.max(0, grossProfit)
  let previousCap = 0
  let total = 0

  for (const bracket of commissionBrackets) {
    if (remaining <= 0) break
    const width = bracket.upTo - previousCap
    const taxableInBracket = Math.min(remaining, width)
    total += taxableInBracket * bracket.rate
    remaining -= taxableInBracket
    previousCap = bracket.upTo
  }

  return total
}

function getIncomeValues(grossProfit: number) {
  const monthlyCommission = calculateMonthlyCommission(grossProfit)
  const baseMonthlyNet = (BASE_SALARY / 12) * TAKE_HOME_RATE
  const baseBiWeeklyNet = (BASE_SALARY / 26) * TAKE_HOME_RATE
  const baseWeeklyNet = (BASE_SALARY / 52) * TAKE_HOME_RATE

  const monthlyNet = baseMonthlyNet + monthlyCommission
  const biWeeklyNet = baseBiWeeklyNet + monthlyCommission / 2
  const weeklyNet = baseWeeklyNet + monthlyCommission / 4
  const hourlyNet = weeklyNet / HOURS_PER_WEEK

  return { monthlyCommission, baseMonthlyNet, monthlyNet, biWeeklyNet, weeklyNet, hourlyNet }
}

const storageKeys = {
  categories: 'sales-budget-categories-v1',
  customScenario: 'sales-budget-custom-scenario-v1',
}

function App() {
  const [grossProfit, setGrossProfit] = useState(15000)
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [form, setForm] = useState({ name: '', amount: '', type: 'fixed bill' as CategoryType })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [customScenarioGrossProfit, setCustomScenarioGrossProfit] = useState(10000)

  useEffect(() => {
    const savedCategories = localStorage.getItem(storageKeys.categories)
    const savedCustom = localStorage.getItem(storageKeys.customScenario)
    if (savedCategories) setCategories(JSON.parse(savedCategories))
    if (savedCustom) setCustomScenarioGrossProfit(Number(savedCustom))
  }, [])

  useEffect(() => {
    localStorage.setItem(storageKeys.categories, JSON.stringify(categories))
  }, [categories])

  useEffect(() => {
    localStorage.setItem(storageKeys.customScenario, String(customScenarioGrossProfit))
  }, [customScenarioGrossProfit])

  const income = useMemo(() => getIncomeValues(grossProfit), [grossProfit])
  const totalExpenses = categories.reduce((sum, c) => sum + c.amount, 0)
  const totalSavingsInvesting = categories
    .filter((c) => c.type === 'savings' || c.type === 'investing')
    .reduce((sum, c) => sum + c.amount, 0)
  const leftover = income.monthlyNet - totalExpenses
  const baseOnlyLeftover = income.baseMonthlyNet - totalExpenses

  const allocationByType = (['fixed bill', 'savings', 'investing', 'variable spending'] as CategoryType[]).map((type) => {
    const amount = categories.filter((c) => c.type === type).reduce((sum, c) => sum + c.amount, 0)
    return { type, amount, pct: totalExpenses ? (amount / totalExpenses) * 100 : 0 }
  })

  const scenarios: Scenario[] = defaultScenarios.map((s) =>
    s.name === 'Custom' ? { ...s, grossProfit: customScenarioGrossProfit } : s,
  )

  const saveCategory = () => {
    if (!form.name || !form.amount) return

    if (editingId) {
      setCategories((prev) =>
        prev.map((c) =>
          c.id === editingId ? { ...c, name: form.name, amount: Number(form.amount), type: form.type } : c,
        ),
      )
      setEditingId(null)
    } else {
      setCategories((prev) => [
        ...prev,
        { id: crypto.randomUUID(), name: form.name, amount: Number(form.amount), type: form.type },
      ])
    }

    setForm({ name: '', amount: '', type: 'fixed bill' })
  }

  const editCategory = (category: BudgetCategory) => {
    setEditingId(category.id)
    setForm({ name: category.name, amount: String(category.amount), type: category.type })
  }

  const removeCategory = (id: string) => setCategories((prev) => prev.filter((c) => c.id !== id))

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-6">
      <h1 className="text-3xl font-bold">Sales Income + Budget Scenario Dashboard</h1>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-xl font-semibold mb-3">1) Income Scenario</h2>
          <label className="block text-sm">Monthly Gross Profit</label>
          <input className="mt-1 w-full rounded border p-2" type="number" value={grossProfit} onChange={(e) => setGrossProfit(Number(e.target.value))} />
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Info label="Monthly Commission" value={currency(income.monthlyCommission)} />
            <Info label="Monthly Net Income" value={currency(income.monthlyNet)} />
            <Info label="Bi-Weekly Net" value={currency(income.biWeeklyNet)} />
            <Info label="Weekly Net" value={currency(income.weeklyNet)} />
            <Info label="Effective Hourly Net" value={currency(income.hourlyNet)} />
            <Info label="Base Monthly Net" value={currency(income.baseMonthlyNet)} />
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow">
          <h2 className="text-xl font-semibold mb-3">2) Budget Planner</h2>
          <div className="grid gap-2 md:grid-cols-4">
            <input className="rounded border p-2" placeholder="Category" value={form.name} onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))} />
            <input className="rounded border p-2" type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))} />
            <select className="rounded border p-2" value={form.type} onChange={(e) => setForm((v) => ({ ...v, type: e.target.value as CategoryType }))}>
              <option>fixed bill</option><option>savings</option><option>investing</option><option>variable spending</option>
            </select>
            <button className="rounded bg-blue-600 text-white px-3" onClick={saveCategory}>{editingId ? 'Save' : 'Add'}</button>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead><tr className="text-left"><th>Name</th><th>Type</th><th>Amount</th><th /></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id} className="border-t"><td>{c.name}</td><td>{c.type}</td><td>{currency(c.amount)}</td><td className="space-x-2"><button className="text-blue-700" onClick={() => editCategory(c)}>Edit</button><button className="text-red-600" onClick={() => removeCategory(c.id)}>Delete</button></td></tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 space-y-1 text-sm">
            <p>Total expenses: <strong>{currency(totalExpenses)}</strong></p>
            <p>Total savings/investing: <strong>{currency(totalSavingsInvesting)}</strong></p>
            <p>Leftover (current scenario): <strong>{currency(leftover)}</strong></p>
            <p>Budget status: {baseOnlyLeftover >= 0 ? <span className="text-green-700 font-semibold">Works on base salary only</span> : <span className="text-amber-700 font-semibold">Depends on commission</span>}</p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {allocationByType.map((x) => (
              <div key={x.type} className="rounded bg-slate-50 p-2">{x.type}: {currency(x.amount)} ({x.pct.toFixed(1)}%)</div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl bg-white p-5 shadow overflow-x-auto">
        <h2 className="text-xl font-semibold mb-3">3) Scenario Comparison</h2>
        <label className="text-sm">Custom scenario gross profit</label>
        <input className="ml-2 rounded border p-1" type="number" value={customScenarioGrossProfit} onChange={(e) => setCustomScenarioGrossProfit(Number(e.target.value))} />
        <table className="mt-3 min-w-full text-sm">
          <thead><tr className="text-left border-b"><th>Scenario</th><th>Gross Profit</th><th>Commission</th><th>Monthly Net</th><th>Bi-Weekly</th><th>Weekly</th><th>Leftover</th></tr></thead>
          <tbody>
            {scenarios.map((s) => {
              const values = getIncomeValues(s.grossProfit)
              return <tr key={s.name} className="border-b"><td>{s.name}</td><td>{currency(s.grossProfit)}</td><td>{currency(values.monthlyCommission)}</td><td>{currency(values.monthlyNet)}</td><td>{currency(values.biWeeklyNet)}</td><td>{currency(values.weeklyNet)}</td><td>{currency(values.monthlyNet - totalExpenses)}</td></tr>
            })}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl bg-white p-5 shadow">
        <h2 className="text-xl font-semibold mb-2">Commission Calculation Test Examples</h2>
        <ul className="list-disc pl-6 text-sm">
          <li>$8,000 GP = {currency(calculateMonthlyCommission(8000))} commission</li>
          <li>$15,000 GP = {currency(calculateMonthlyCommission(15000))} commission</li>
          <li>$30,000 GP = {currency(calculateMonthlyCommission(30000))} commission</li>
        </ul>
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded bg-slate-50 p-2"><div className="text-slate-600">{label}</div><div className="font-semibold">{value}</div></div>
}

export default App
