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

const scenarioDefaults: Record<ScenarioName, number> = {
  Slow: 8000,
  Medium: 15000,
  Fast: 30000,
  Custom: 10000,
}

const currency = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
const pct = (v: number) => `${v.toFixed(1)}%`

// Progressive commission: each bracket rate applies only to dollars inside that bracket.
function calculateMonthlyCommission(grossProfit: number) {
  let remaining = Math.max(0, grossProfit)
  let previousCap = 0
  let total = 0

  for (const bracket of commissionBrackets) {
    if (remaining <= 0) break
    const width = bracket.upTo - previousCap
    const taxable = Math.min(remaining, width)
    total += taxable * bracket.rate
    remaining -= taxable
    previousCap = bracket.upTo
  }

  return total
}

function getIncome(gp: number) {
  const baseMonthly = (BASE_SALARY / 12) * TAKE_HOME_RATE
  const baseBiWeekly = (BASE_SALARY / 26) * TAKE_HOME_RATE
  const baseWeekly = (BASE_SALARY / 52) * TAKE_HOME_RATE

  const commissionMonthly = calculateMonthlyCommission(gp)
  const commissionBiWeekly = commissionMonthly / 2
  const commissionWeekly = commissionMonthly / 4

  const totalMonthly = baseMonthly + commissionMonthly
  const totalBiWeekly = baseBiWeekly + commissionBiWeekly
  const totalWeekly = baseWeekly + commissionWeekly

  return {
    baseMonthly,
    baseBiWeekly,
    baseWeekly,
    commissionMonthly,
    commissionBiWeekly,
    commissionWeekly,
    totalMonthly,
    totalBiWeekly,
    totalWeekly,
    hourlyNet: totalWeekly / HOURS_PER_WEEK,
    commissionPctOfTotal: totalMonthly > 0 ? (commissionMonthly / totalMonthly) * 100 : 0,
    commissionPerHour: commissionWeekly / HOURS_PER_WEEK,
  }
}

function statusColorClass(ratio: number) {
  if (ratio >= 20) return 'text-green-700 bg-green-50 border-green-200'
  if (ratio >= 5) return 'text-amber-700 bg-amber-50 border-amber-200'
  return 'text-red-700 bg-red-50 border-red-200'
}

function statusLabel(ratio: number) {
  if (ratio >= 20) return 'Green: leftover is 20% or more of income'
  if (ratio >= 5) return 'Yellow: leftover is between 5% and 20% of income'
  return 'Red: leftover is below 5% of income'
}

export default function App() {
  const [tab, setTab] = useState<Tab>('Dashboard')
  const [grossProfit, setGrossProfit] = useState(15000)
  const [categories, setCategories] = useState<Category[]>([])
  const [scenarioGrossProfit, setScenarioGrossProfit] = useState(scenarioDefaults)
  const [form, setForm] = useState({
    name: '',
    amount: '',
    type: 'fixed bill' as CategoryType,
  })

  const income = useMemo(() => getIncome(grossProfit), [grossProfit])

  const monthlyFixed = categories.filter((c) => c.type === 'fixed bill').reduce((sum, c) => sum + c.amount, 0)
  const monthlyVariable = categories.filter((c) => c.type === 'variable spending').reduce((sum, c) => sum + c.amount, 0)
  const monthlySavings = categories.filter((c) => c.type === 'savings').reduce((sum, c) => sum + c.amount, 0)
  const monthlyInvesting = categories.filter((c) => c.type === 'investing').reduce((sum, c) => sum + c.amount, 0)
  const monthlyExpenses = monthlyFixed + monthlyVariable
  const monthlyTotalBudget = monthlyExpenses + monthlySavings + monthlyInvesting
  const monthlyLeftover = income.totalMonthly - monthlyTotalBudget

  const leftoverRatio = income.totalMonthly > 0 ? (monthlyLeftover / income.totalMonthly) * 100 : 0
  const savingsRate = income.totalMonthly > 0 ? ((monthlySavings + monthlyInvesting) / income.totalMonthly) * 100 : 0
  const fixedCostRatio = income.totalMonthly > 0 ? (monthlyFixed / income.totalMonthly) * 100 : 0

  const addCategory = () => {
    if (!form.name.trim() || !form.amount) return
    const parsedAmount = Number(form.amount)
    if (Number.isNaN(parsedAmount) || parsedAmount < 0) return

    setCategories((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: form.name.trim(), amount: parsedAmount, type: form.type },
    ])

    setForm({ name: '', amount: '', type: 'fixed bill' })
  }

  const tabs: Tab[] = ['Dashboard', 'Income', 'Budget', 'Scenarios']

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
        <header className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-6">
          <h1 className="text-2xl md:text-3xl font-bold">Sales Paycheck + Budget Planner</h1>
          <p className="text-sm text-slate-600 mt-1">Version 2: clearer income groups, budget signals, and scenario snapshots.</p>
          <nav className="mt-4 flex flex-wrap gap-2">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tab === t ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {t}
              </button>
            ))}
          </nav>
        </header>

        {tab === 'Dashboard' && (
          <section className="grid gap-4 md:grid-cols-3">
            <Card title="Monthly Gross Profit">
              <Value value={currency(grossProfit)} />
            </Card>
            <Card title="Monthly Total Net Income (base + commission)">
              <Value value={currency(income.totalMonthly)} />
            </Card>
            <Card title="Monthly Leftover After Budget">
              <Value value={currency(monthlyLeftover)} />
            </Card>
          </section>
        )}

        {tab === 'Income' && (
          <section className="space-y-4">
            <Card title="Income Input">
              <label className="text-sm font-medium">Monthly Gross Profit</label>
              <input
                type="number"
                step={100}
                className="w-full mt-2 rounded-lg border border-slate-300 p-2"
                value={grossProfit}
                onChange={(e) => setGrossProfit(Number(e.target.value))}
              />
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card title="A) Base Income (salary only, no commission)">
                <Row label="Monthly Net" value={currency(income.baseMonthly)} />
                <Row label="Bi-weekly Net" value={currency(income.baseBiWeekly)} />
                <Row label="Weekly Net" value={currency(income.baseWeekly)} />
              </Card>

              <Card title="B) Commission Income">
                <Row label="Monthly Commission" value={currency(income.commissionMonthly)} />
                <Row label="Bi-weekly Commission" value={currency(income.commissionBiWeekly)} />
                <Row label="Weekly Commission" value={currency(income.commissionWeekly)} />
              </Card>

              <Card title="C) Total Income (base salary + commission)">
                <Row label="Monthly Net" value={currency(income.totalMonthly)} />
                <Row label="Bi-weekly Net" value={currency(income.totalBiWeekly)} />
                <Row label="Weekly Net" value={currency(income.totalWeekly)} />
              </Card>

              <Card title="D) Efficiency Metrics">
                <Row label="Effective hourly net rate" value={currency(income.hourlyNet)} />
                <Row label="Commission as % of total income" value={pct(income.commissionPctOfTotal)} />
                <Row label="Commission per hour" value={currency(income.commissionPerHour)} />
              </Card>
            </div>
          </section>
        )}

        {tab === 'Budget' && (
          <section className="space-y-4">
            <Card title="Budget Planner">
              <div className="grid gap-2 md:grid-cols-4">
                <input
                  className="rounded-lg border border-slate-300 p-2"
                  placeholder="Category name"
                  value={form.name}
                  onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
                />
                <input
                  className="rounded-lg border border-slate-300 p-2"
                  type="number"
                  step={25}
                  placeholder="Amount"
                  value={form.amount}
                  onChange={(e) => setForm((v) => ({ ...v, amount: e.target.value }))}
                />
                <select
                  className="rounded-lg border border-slate-300 p-2"
                  value={form.type}
                  onChange={(e) => setForm((v) => ({ ...v, type: e.target.value as CategoryType }))}
                >
                  <option>fixed bill</option>
                  <option>savings</option>
                  <option>investing</option>
                  <option>variable spending</option>
                </select>
                <button className="rounded-lg bg-blue-600 text-white font-medium" onClick={addCategory}>
                  Add Category
                </button>
              </div>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-600">
                      <th className="py-2">Category</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Amount</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id} className="border-b">
                        <td className="py-2">{c.name}</td>
                        <td className="py-2">{c.type}</td>
                        <td className="py-2">{currency(c.amount)}</td>
                        <td className="py-2 text-right">
                          <button className="text-red-700" onClick={() => setCategories((p) => p.filter((x) => x.id !== c.id))}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card title="Budget Outputs">
              <Row label="A) Expenses (Monthly / Bi-weekly / Weekly)" value={`${currency(monthlyExpenses)} / ${currency(monthlyExpenses / 2)} / ${currency(monthlyExpenses / 4)}`} />
              <Row label="B) Savings (Monthly / Bi-weekly / Weekly)" value={`${currency(monthlySavings)} / ${currency(monthlySavings / 2)} / ${currency(monthlySavings / 4)}`} />
              <Row label="C) Investing (Monthly / Bi-weekly / Weekly)" value={`${currency(monthlyInvesting)} / ${currency(monthlyInvesting / 2)} / ${currency(monthlyInvesting / 4)}`} />
              <Row label="D) Combined Savings + Investing (Monthly / Bi-weekly / Weekly)" value={`${currency(monthlySavings + monthlyInvesting)} / ${currency((monthlySavings + monthlyInvesting) / 2)} / ${currency((monthlySavings + monthlyInvesting) / 4)}`} />
              <Row label="E) Leftover (Monthly / Bi-weekly / Weekly)" value={`${currency(monthlyLeftover)} / ${currency(monthlyLeftover / 2)} / ${currency(monthlyLeftover / 4)}`} />
            </Card>

            <Card title="F) Budget Status Indicator">
              <div className={`rounded-lg border p-3 text-sm font-medium ${statusColorClass(leftoverRatio)}`}>
                {statusLabel(leftoverRatio)} ({pct(leftoverRatio)})
              </div>
            </Card>

            <Card title="G) Smart Flags">
              <ul className="list-disc pl-6 space-y-1 text-sm">
                <li>{income.baseMonthly >= monthlyTotalBudget ? '✅ Works on base salary only' : '⚠️ Requires commission'}</li>
                <li>{savingsRate < 10 ? '⚠️ Savings rate below 10%' : '✅ Savings rate at or above 10%'}</li>
                <li>{fixedCostRatio > 50 ? '⚠️ High fixed cost ratio above 50%' : '✅ Fixed cost ratio at or below 50%'}</li>
              </ul>
            </Card>
          </section>
        )}

        {tab === 'Scenarios' && (
          <section>
            <Card title="Monthly Scenario Comparison">
              <div className="grid gap-3 mb-4 md:grid-cols-4">
                {(Object.keys(scenarioGrossProfit) as ScenarioName[]).map((name) => (
                  <div key={name}>
                    <label className="text-xs text-slate-600">{name} Gross Profit</label>
                    <input
                      type="number"
                      step={100}
                      className="w-full rounded-lg border border-slate-300 p-2 mt-1"
                      value={scenarioGrossProfit[name]}
                      onChange={(e) =>
                        setScenarioGrossProfit((p) => ({
                          ...p,
                          [name]: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-slate-600">
                      <th className="py-2 pr-4">Scenario</th>
                      <th className="py-2 pr-4">Monthly gross profit</th>
                      <th className="py-2 pr-4">Monthly commission</th>
                      <th className="py-2 pr-4">Monthly net income</th>
                      <th className="py-2 pr-4">Bi-weekly net income</th>
                      <th className="py-2 pr-4">Weekly net income</th>
                      <th className="py-2 pr-4">Effective hourly net rate</th>
                      <th className="py-2 pr-4">Yearly projected income</th>
                      <th className="py-2 pr-4">Yearly projected commission</th>
                      <th className="py-2">Yearly projected leftover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(scenarioGrossProfit) as ScenarioName[]).map((name) => {
                      const values = getIncome(scenarioGrossProfit[name])
                      const yearlyIncome = values.totalMonthly * 12
                      const yearlyCommission = values.commissionMonthly * 12
                      const yearlyLeftover = (values.totalMonthly - monthlyTotalBudget) * 12

                      return (
                        <tr key={name} className="border-b">
                          <td className="py-2 pr-4 font-medium">{name}</td>
                          <td className="py-2 pr-4">{currency(scenarioGrossProfit[name])}</td>
                          <td className="py-2 pr-4">{currency(values.commissionMonthly)}</td>
                          <td className="py-2 pr-4">{currency(values.totalMonthly)}</td>
                          <td className="py-2 pr-4">{currency(values.totalBiWeekly)}</td>
                          <td className="py-2 pr-4">{currency(values.totalWeekly)}</td>
                          <td className="py-2 pr-4">{currency(values.hourlyNet)}</td>
                          <td className="py-2 pr-4">{currency(yearlyIncome)}</td>
                          <td className="py-2 pr-4">{currency(yearlyCommission)}</td>
                          <td className="py-2">{currency(yearlyLeftover)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>
        )}
      </div>
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-5">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-2 border-b last:border-b-0 flex justify-between gap-4 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  )
}

function Value({ value }: { value: string }) {
  return <div className="text-2xl font-bold tracking-tight">{value}</div>
}
