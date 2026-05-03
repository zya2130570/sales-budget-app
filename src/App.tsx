import { useEffect, useMemo, useRef, useState } from 'react'

type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Scenarios'
type Period = 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'
type DashboardPeriod = Exclude<Period, 'yearly'>
type CategoryType = 'fixed bill' | 'variable spending' | 'savings' | 'investing'
type Category = { id: string; name: string; amount: number; type: CategoryType }
type ScenarioName = 'Slow' | 'Medium' | 'Fast' | 'Custom'
type SavedBudget = { name: string; categories: Category[]; savedAt: string }
type SavedScenarioSet = { name: string; scenarios: Record<ScenarioName, number>; period: Period; savedAt: string }

const BASE_SALARY = 40000
const TAKE_HOME_RATE = 0.8243
const HOURS_PER_WEEK = 45
const categorySuggestions = ['BTM', 'Bills to Mom', 'Story', 'Passive', 'Long-term Savings', 'Emergency Fund', 'Gas', 'Haircut', 'Braiding', 'Tuition', 'Takeout', 'Subscriptions', 'Cash', 'Groceries', 'School', 'Self-care']
const scenarioDefaults: Record<ScenarioName, number> = { Slow: 8000, Medium: 15000, Fast: 30000, Custom: 10000 }
const commissionBrackets = [{ upTo: 5000, rate: 0.04 }, { upTo: 10000, rate: 0.06 }, { upTo: 20000, rate: 0.08 }, { upTo: 40000, rate: 0.1 }, { upTo: 60000, rate: 0.11 }, { upTo: 100000, rate: 0.12 }, { upTo: Infinity, rate: 0.14 }]

const currency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
const labelPeriod = (p: Period) => p === 'bi-weekly' ? 'Bi-weekly' : p[0].toUpperCase() + p.slice(1)
const periods: Period[] = ['weekly', 'bi-weekly', 'monthly', 'yearly']

const convertFromMonthly = (m: number, p: Period) => p === 'weekly' ? m / 4 : p === 'bi-weekly' ? m / 2 : p === 'yearly' ? m * 12 : m
const convertToMonthly = (v: number, p: Period) => p === 'weekly' ? v * 4 : p === 'bi-weekly' ? v * 2 : p === 'yearly' ? v / 12 : v

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
  const [dp, setDp] = useState<DashboardPeriod>('monthly')
  const [bp, setBp] = useState<Period>('monthly')
  const [sp, setSp] = useState<Period>('monthly')
  const [gpInput, setGpInput] = useState('15000')
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
  const baseNetByPeriod = dp === 'weekly' ? inc.baseWeekly : dp === 'bi-weekly' ? inc.baseBiWeekly : inc.baseMonthly

  const top = [...categories].sort((a, b) => b.amount - a.amount)
  const suggestionList = form.name.trim() ? categorySuggestions.filter(s => s.toLowerCase().includes(form.name.toLowerCase())).slice(0, 6) : categorySuggestions.slice(0, 8)

  const hasBudgetData = monthlyBudget > 0
  const health = !hasBudgetData ? 'No Data' : monthlyLeft < 0 || monthlyLeft / inc.totalMonthly < 0.05 || inc.baseMonthly < monthlyBudget ? 'Risk' : monthlyLeft / inc.totalMonthly >= 0.2 && savingsRate >= 15 && fixedRatio <= 50 && dep <= 55 ? 'Strong' : monthlyLeft / inc.totalMonthly >= 0.1 && savingsRate >= 10 ? 'Stable' : 'Tight'
  const welcome = !hasBudgetData ? 'No budget data yet. Add expenses to see your financial health.' : health === 'Strong' ? `You’re in a strong position. Savings and investing are healthy, and fixed bills are under control.` : health === 'Stable' ? `Your current plan is stable. You have ${currency(monthlyLeft)} remaining this month after planned spending, and commission makes up ${dep.toFixed(0)}% of your total income.` : `Your budget is tight. Remaining cushion is low and this plan depends heavily on commission.`
  const remainingTone: 'good' | 'warn' | 'danger' = !hasBudgetData ? 'warn' : monthlyLeft < 0 || health === 'Risk' ? 'danger' : health === 'Tight' ? 'warn' : 'good'
  const statusTone: 'good' | 'warn' | 'danger' = health === 'Risk' ? 'danger' : health === 'Tight' || health === 'No Data' ? 'warn' : 'good'

  const upsert = () => {
    const amt = Math.max(0, Number(form.amount) || 0)
    const monthlyAmt = convertToMonthly(amt, bp)
    const n = form.name.trim()
    if (!n || monthlyAmt <= 0) return
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

    {tab === 'Dashboard' && <section className="space-y-4 transition-all duration-300"><Card title="Welcome back"><p className="text-slate-200">{welcome}</p></Card><Card title="Dashboard Summary"><div className="flex gap-2 mb-4">{(['weekly','bi-weekly','monthly'] as DashboardPeriod[]).map(p => <Pill key={p} active={dp===p} onClick={() => setDp(p)}>{labelPeriod(p)}</Pill>)}</div><p className="mb-4">Monthly Gross Profit Reference: <span className={gp>10000?'text-green-400 font-semibold':'font-semibold'}>{currency(gp)}</span></p><div className="grid md:grid-cols-3 gap-3"><Metric title="Base Gross Income (salary only)" value={currency(convertFromMonthly(inc.baseGrossMonthly, dp))} /><Metric title="Base Net Income (salary take-home)" value={currency(baseNetByPeriod)} /><Metric title="Commission Income (net)" value={currency(convertFromMonthly(inc.cMonthly, dp))} /><Metric title="Total Net Income (salary + commission take-home)" value={currency(convertFromMonthly(inc.totalMonthly, dp))} /><Metric title="Total Budget" value={currency(convertFromMonthly(monthlyBudget, dp))} /><Metric title="Remaining After Budget" value={currency(convertFromMonthly(monthlyLeft, dp))} tone={monthlyLeft<0?'danger':monthlyLeft/inc.totalMonthly<0.1?'warn':'good'} /></div></Card><Card title="Financial Intelligence"><div className="grid md:grid-cols-3 gap-3"><Info title="Biggest Expense" value={top[0]?`${top[0].name} (${currency(convertFromMonthly(top[0].amount, dp))} ${labelPeriod(dp)})`:'None'} /><Info title="Fixed Bills Ratio" value={`${fixedRatio.toFixed(1)}%`} /><Info title="Savings Rate" value={`${savingsRate.toFixed(1)}%`} /><Info title="Commission Dependency" value={`${dep.toFixed(1)}%`} className={depColor} /><Info title="Remaining Cushion" value={`${((monthlyLeft/inc.totalMonthly)*100||0).toFixed(1)}%`} /><Info title="Budget Status / Health Tier" value={health} /></div></Card></section>}

    {tab === 'Income' && <section className="space-y-4 transition-all duration-300"><Card title="Income Input"><label className="text-sm">Monthly Gross Profit</label><div className="relative mt-2"><span className="absolute left-3 top-2.5 text-slate-400">$</span><input ref={incomeRef} type="number" min={0} step={100} value={gpInput} onChange={e => setGpInput(String(Math.max(0, Number(e.target.value)||0)))} className="w-full pl-7 p-2 rounded-lg bg-slate-800 border border-slate-600" /></div><p className="text-xs text-slate-400 mt-1">{currency(gp)}</p></Card><div className="grid md:grid-cols-2 gap-4"><Card title="Base Income"><Row l="Weekly Net" v={currency(inc.baseWeekly)} /><Row l="Bi-weekly Net" v={currency(inc.baseBiWeekly)} /><Row l="Monthly Net" v={currency(inc.baseMonthly)} /></Card><Card title="Commission Income"><Row l="Weekly Commission" v={currency(inc.cWeekly)} /><Row l="Bi-weekly Commission" v={currency(inc.cBiWeekly)} /><Row l="Monthly Commission" v={currency(inc.cMonthly)} /></Card><Card title="Total Income"><Row l="Weekly Net" v={currency(inc.totalWeekly)} /><Row l="Bi-weekly Net" v={currency(inc.totalBiWeekly)} /><Row l="Monthly Net" v={currency(inc.totalMonthly)} /></Card><Card title="Efficiency Metrics"><Row l="Effective hourly net rate" v={currency(inc.totalWeekly / HOURS_PER_WEEK)} /><Row l="Commission as % of total" v={`${dep.toFixed(1)}%`} /><Row l="Commission per hour" v={currency(inc.cWeekly / HOURS_PER_WEEK)} /></Card></div></section>}

    {tab === 'Budget' && <section className="space-y-4 transition-all duration-300"><Card title="Budget Summary"><div className="flex gap-2 flex-wrap mb-4">{periods.map(p => <Pill key={p} active={bp===p} onClick={() => setBp(p)}>{labelPeriod(p)}</Pill>)}</div><div className="grid md:grid-cols-4 gap-3"><Metric title="Total available income" value={currency(convertFromMonthly(inc.totalMonthly,bp))} /><Metric title="Total planned expenses" value={currency(convertFromMonthly(monthlyBudget,bp))} /><Metric title="Remaining amount" value={currency(convertFromMonthly(monthlyLeft,bp))} tone={remainingTone} /><Metric title="Budget status" value={health} tone={statusTone} /></div></Card>
    <Card title="Budget Categories"><div className="grid md:grid-cols-4 gap-2"><div ref={autocompleteWrapRef} className="relative"><input ref={budgetNameRef} className="w-full p-2 rounded-lg bg-slate-800 border border-slate-600" placeholder="Category name" value={form.name} onFocus={() => setShowSuggestions(true)} onChange={e => { setForm(v=>({...v,name:e.target.value})); setSIndex(-1); setShowSuggestions(true) }} onKeyDown={e => { if (!suggestionList.length) { if (e.key==='Enter') budgetAmountRef.current?.focus(); return } if (e.key==='ArrowDown') { e.preventDefault(); setSIndex(v => Math.min(v+1, suggestionList.length-1)) } if (e.key==='ArrowUp') { e.preventDefault(); setSIndex(v => Math.max(v-1,0)) } if (e.key==='Enter') { e.preventDefault(); if (sIndex>=0) { setForm(v=>({...v,name:suggestionList[sIndex]})); setShowSuggestions(false); budgetAmountRef.current?.focus() } else budgetAmountRef.current?.focus() } }} />{showSuggestions && suggestionList.length>0 && <div className="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-600 rounded-lg">{suggestionList.map((x,i)=><button key={x} className={`w-full text-left px-2 py-1 ${i===sIndex?'bg-slate-700':'hover:bg-slate-700'}`} onClick={()=>{setForm(v=>({...v,name:x})); setShowSuggestions(false); budgetAmountRef.current?.focus()}}>{x}</button>)}</div>}</div><input ref={budgetAmountRef} type="number" min={0} step={25} placeholder={`${labelPeriod(bp)} Amount`} className="p-2 rounded-lg bg-slate-800 border border-slate-600" value={form.amount} onChange={e=>setForm(v=>({...v,amount:e.target.value}))} onKeyDown={e=>{if(e.key==='Enter') budgetTypeRef.current?.focus()}} /><select ref={budgetTypeRef} className="p-2 rounded-lg bg-slate-800 border border-slate-600" value={form.type} onKeyDown={e=>{ if(['1','2','3','4'].includes(e.key)){ const m={'1':'fixed bill','2':'variable spending','3':'savings','4':'investing'} as const; setForm(v=>({...v,type:m[e.key as keyof typeof m]})) } if(e.key==='Enter'){e.preventDefault(); upsert()}}} onChange={e=>setForm(v=>({...v,type:e.target.value as CategoryType}))}><option value="fixed bill">1 - Fixed Bill</option><option value="variable spending">2 - Variable Spending</option><option value="savings">3 - Savings</option><option value="investing">4 - Investing</option></select><button onClick={upsert} className="rounded-lg bg-blue-600 hover:bg-blue-500">{editId?'Save Changes':'Add'}</button></div>
    <div className="mt-3 grid md:grid-cols-3 gap-2"><input className="p-2 rounded-lg bg-slate-800 border border-slate-600" placeholder="Budget name" value={budgetTitle} onChange={e=>setBudgetTitle(e.target.value)} /><button className="rounded-lg bg-blue-600" onClick={()=>{const n=budgetTitle.trim(); if(!n) return; const ex=savedBudgets.find(x=>x.name.toLowerCase()===n.toLowerCase()); if(ex && !window.confirm('Overwrite existing budget?')) return; setSavedBudgets([{name:n,categories,savedAt:new Date().toISOString()},...savedBudgets.filter(x=>x.name.toLowerCase()!==n.toLowerCase())]); if(ex) setChangeSummary([`Monthly expenses change: ${currency(monthlyBudget-(ex.categories.reduce((s,c)=>s+c.amount,0)))}`])}}>Save Budget</button><div className="text-xs text-slate-400 self-center">Saved locally</div></div>
    {changeSummary.length>0 && <div className="mt-2 text-sm rounded border border-slate-700 p-2">What Changed: {changeSummary.join(' • ')}</div>}
    <div className="mt-2 space-y-2">{savedBudgets.map(b=><div key={b.name} className="rounded border border-slate-700 p-2 flex justify-between"><div><div>{b.name}</div><div className="text-xs text-slate-400">{new Date(b.savedAt).toLocaleString()}</div></div><div className="flex gap-2"><button className="text-blue-300" onClick={()=>setCategories(b.categories)}>Load</button><button className="text-amber-300" onClick={()=>{const nn=window.prompt('Rename budget', b.name); if(!nn) return; setSavedBudgets(prev=>prev.map(x=>x.name===b.name?{...x,name:nn}:x))}}>Rename</button><button className="text-red-300" onClick={()=>setSavedBudgets(prev=>prev.filter(x=>x.name!==b.name))}>Delete</button></div></div>)}</div>
    <table className="w-full text-sm mt-3"><thead><tr className="text-left text-slate-400 border-b border-slate-700"><th>Name</th><th>Type</th><th>Monthly</th><th>{labelPeriod(bp)}</th><th/></tr></thead><tbody>{top.map(c=><tr key={c.id} className="border-b border-slate-800"><td>{c.name}</td><td>{c.type === 'fixed bill' ? 'Fixed Bill' : c.type === 'variable spending' ? 'Variable Spending' : c.type === 'savings' ? 'Savings' : 'Investing'}</td><td>{currency(c.amount)}</td><td>{currency(convertFromMonthly(c.amount,bp))}</td><td className="space-x-2"><button className="text-blue-300" onClick={()=>{setForm({name:c.name,amount:String(convertFromMonthly(c.amount,bp)),type:c.type}); setEditId(c.id); budgetNameRef.current?.focus()}}>Edit</button><button className="text-red-300" onClick={()=>setCategories(prev=>prev.filter(x=>x.id!==c.id))}>Delete</button></td></tr>)}</tbody></table></Card></section>}

    {tab==='Scenarios' && <section className="space-y-4 transition-all duration-300"><Card title="Scenario Set Manager"><div className="flex gap-2 mb-3">{periods.map(p=><Pill key={p} active={sp===p} onClick={()=>setSp(p)}>{labelPeriod(p)}</Pill>)}</div><div className="grid md:grid-cols-4 gap-2">{(['Slow','Medium','Fast','Custom'] as ScenarioName[]).map(n=><div key={n}><label className="text-xs text-slate-400">{n}</label><input ref={n==='Slow'?scenarioSlowRef:undefined} type="number" min={0} step={100} value={scenario[n]} onChange={e=>setScenario(v=>({...v,[n]:Math.max(0,Number(e.target.value)||0)}))} className="w-full p-2 rounded bg-slate-800 border border-slate-600" /></div>)}</div><div className="grid md:grid-cols-3 gap-2 mt-3"><input className="p-2 rounded bg-slate-800 border border-slate-600" placeholder="Scenario set name" value={scenarioTitle} onChange={e=>setScenarioTitle(e.target.value)} /><button className="rounded bg-blue-600" onClick={()=>{const n=scenarioTitle.trim(); if(!n) return; const ex=savedScenarios.find(x=>x.name.toLowerCase()===n.toLowerCase()); if(ex && !window.confirm('Overwrite existing set?')) return; setSavedScenarios([{name:n,scenarios:scenario,period:sp,savedAt:new Date().toISOString()},...savedScenarios.filter(x=>x.name.toLowerCase()!==n.toLowerCase())])}}>Save Scenario Set</button><div className="text-xs text-slate-400 self-center">Saved locally</div></div><div className="space-y-2 mt-2">{savedScenarios.map(s=><div key={s.name} className="rounded border border-slate-700 p-2 flex justify-between"><div><div>{s.name}</div><div className="text-xs text-slate-400">{new Date(s.savedAt).toLocaleString()}</div></div><div className="flex gap-2"><button className="text-blue-300" onClick={()=>{setScenario(s.scenarios); setSp(s.period)}}>Load</button><button className="text-red-300" onClick={()=>setSavedScenarios(prev=>prev.filter(x=>x.name!==s.name))}>Delete</button></div></div>)}</div></Card><div className="grid md:grid-cols-2 gap-3">{(['Slow','Medium','Fast','Custom'] as ScenarioName[]).map(n=>{const ii=income(scenario[n]); const rem=convertFromMonthly(ii.totalMonthly-monthlyBudget,sp); const tone=n==='Slow'?'border-yellow-500/60 text-yellow-200':n==='Medium'?'border-blue-500/60 text-blue-200':n==='Fast'?'border-green-500/60 text-green-200':'border-slate-300/60 text-slate-100'; return <Card key={n} title={`${n} Scenario`} className={tone}><Row l="Monthly Gross Profit Input" v={currency(scenario[n])} /><Row l={`Converted Gross Profit (${labelPeriod(sp)})`} v={currency(convertFromMonthly(scenario[n],sp))} /><Row l="Commission" v={currency(convertFromMonthly(ii.cMonthly,sp))} /><Row l="Base net income" v={currency(convertFromMonthly(ii.baseMonthly,sp))} /><Row l="Total net income" v={currency(convertFromMonthly(ii.totalMonthly,sp))} /><Row l="Effective hourly rate" v={currency(ii.totalWeekly/HOURS_PER_WEEK)} /><Row l="Remaining after budget" v={currency(rem)} valueClass={rem<0?'text-red-400':'text-green-400'} /></Card>})}</div></section>}

  </div></div>
}

function Card({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) { return <div className={`rounded-2xl border border-slate-700 bg-slate-800/80 shadow-lg p-4 md:p-5 transition-all duration-200 hover:-translate-y-0.5 ${className}`}><h2 className="text-lg font-semibold mb-3">{title}</h2>{children}</div> }
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button onClick={onClick} className={`px-3 py-1.5 rounded text-sm ${active?'bg-blue-600':'bg-slate-700 hover:bg-slate-600'} transition`}>{children}</button> }
function Metric({ title, value, tone = 'neutral' }: { title: string; value: string; tone?: 'neutral'|'good'|'warn'|'danger' }) { const c=tone==='good'?'text-green-400':tone==='warn'?'text-yellow-300':tone==='danger'?'text-red-400':'text-slate-100'; return <div className="rounded-xl border border-slate-700 bg-slate-800 p-3"><div className="text-xs text-slate-400 mb-1">{title}</div><div className={`text-xl font-bold ${c}`}>{value}</div></div> }
function Info({ title, value, className = '' }: { title: string; value: string; className?: string }) { return <div className="rounded-xl border border-slate-700 bg-slate-800 p-3"><div className="text-xs text-slate-400 mb-1">{title}</div><div className={`font-semibold ${className}`}>{value}</div></div> }
function Row({ l, v, valueClass = 'text-slate-100' }: { l: string; v: string; valueClass?: string }) { return <div className="py-1.5 border-b border-slate-700 last:border-b-0 flex justify-between text-sm"><span className="text-slate-400">{l}</span><span className={`font-medium ${valueClass}`}>{v}</span></div> }
