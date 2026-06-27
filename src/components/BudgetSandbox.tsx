import { useState, useMemo, useRef } from 'react'
import type { SandboxDraft, SandboxCategory, SandboxIncomeScenario, SandboxSortMode, SandboxCategoryBehavior, SandboxChangeRule, Category, SavedBudget, Period, CategoryType } from '../types'
import { convertFromMonthly } from '../utils/calculations'

// ─── helpers ─────────────────────────────────────────────────────────────────

function uid(): string { return crypto.randomUUID() }
function now(): string { return new Date().toISOString() }

function fmt(n: number): string {
  if (!isFinite(n)) return '$0'
  const abs = Math.abs(n)
  const [int, dec = '00'] = abs.toFixed(2).split('.')
  const intF = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const cents = dec === '00' ? '' : '.' + dec
  return (n < 0 ? '-$' : '$') + intF + cents
}

function fmtPct(n: number): string { return (n * 100).toFixed(1) + '%' }

const TYPE_LABEL: Record<CategoryType, string> = {
  'fixed bill': 'Fixed',
  'variable spending': 'Flexible',
  savings: 'Savings',
  investing: 'Investing',
}

const BEHAVIOR_LABEL: Record<SandboxCategoryBehavior, string> = {
  fixed: 'Fixed amount',
  flexible: 'Flexible',
  percentage: 'Percentage',
  overflow: 'Overflow / extra income',
}

const TYPE_COLOR: Record<CategoryType, string> = {
  'fixed bill': '#5E6AD2',
  'variable spending': '#F59E0B',
  savings: '#10B981',
  investing: '#A78BFA',
}

const SORT_LABELS: Record<SandboxSortMode, string> = {
  custom: 'Custom',
  grouped: 'Grouped',
  'fixed-first': 'Fixed first',
  'flexible-first': 'Flexible first',
  'savings-first': 'Savings first',
  'investing-first': 'Investing first',
  'amount-desc': 'Largest first',
  'amount-asc': 'Smallest first',
}

function labelPeriod(p: Period): string {
  return p === 'weekly' ? 'Weekly' : p === 'bi-weekly' ? 'Bi-weekly' : p === 'monthly' ? 'Monthly' : 'Yearly'
}

function makeSandboxCategory(c: Category): SandboxCategory {
  return {
    id: c.id,
    name: c.name,
    amount: c.amount,
    type: c.type,
    behavior: c.type === 'fixed bill' ? 'fixed' : c.type === 'savings' || c.type === 'investing' ? 'percentage' : 'flexible',
    targetAmount: c.amount,
    percentageOfIncome: undefined,
    notes: undefined,
  }
}

function applySort(cats: SandboxCategory[], mode: SandboxSortMode, order: string[]): SandboxCategory[] {
  if (mode === 'custom') {
    const idx: Record<string, number> = {}
    order.forEach((id, i) => { idx[id] = i })
    return [...cats].sort((a, b) => (idx[a.id] ?? 999) - (idx[b.id] ?? 999))
  }
  const copy = [...cats]
  if (mode === 'amount-desc') return copy.sort((a, b) => b.amount - a.amount)
  if (mode === 'amount-asc') return copy.sort((a, b) => a.amount - b.amount)
  if (mode === 'grouped') {
    const groupOrder: CategoryType[] = ['fixed bill', 'variable spending', 'savings', 'investing']
    return copy.sort((a, b) => groupOrder.indexOf(a.type) - groupOrder.indexOf(b.type))
  }
  const typeOrder: Record<SandboxSortMode, CategoryType[]> = {
    'fixed-first':    ['fixed bill', 'variable spending', 'savings', 'investing'],
    'flexible-first': ['variable spending', 'fixed bill', 'savings', 'investing'],
    'savings-first':  ['savings', 'fixed bill', 'variable spending', 'investing'],
    'investing-first':['investing', 'savings', 'fixed bill', 'variable spending'],
    custom: [], grouped: [], 'amount-desc': [], 'amount-asc': [],
  }
  const order2 = typeOrder[mode] ?? []
  return copy.sort((a, b) => (order2.indexOf(a.type) ?? 99) - (order2.indexOf(b.type) ?? 99))
}

const DEFAULT_INCREASE_RULES: SandboxChangeRule[] = [
  { id: uid(), label: 'Fully fund fixed bills' },
  { id: uid(), label: 'Bring flexible categories to target' },
  { id: uid(), label: 'Add 50% of remaining to savings' },
  { id: uid(), label: 'Add 30% to investing' },
  { id: uid(), label: 'Leave 20% unallocated' },
]
const DEFAULT_DECREASE_RULES: SandboxChangeRule[] = [
  { id: uid(), label: 'Preserve fixed bills' },
  { id: uid(), label: 'Reduce flexible spending first' },
  { id: uid(), label: 'Reduce investing' },
  { id: uid(), label: 'Reduce savings last' },
]

// ─── Sub-components ───────────────────────────────────────────────────────────

function IncomeSummaryBar({
  income, allocated, period,
}: { income: number; allocated: number; period: Period }) {
  const remaining = income - allocated
  const allocPct = income > 0 ? Math.min(allocated / income, 1) : 0
  const remainPct = income > 0 ? remaining / income : 0
  const isOver = remaining < 0

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/80 p-4 space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Income</div>
          <div className="text-sm font-bold text-slate-100">{fmt(convertFromMonthly(income, period))}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Allocated</div>
          <div className="text-sm font-bold text-amber-400">{fmt(convertFromMonthly(allocated, period))}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Remaining</div>
          <div className={`text-sm font-bold ${isOver ? 'text-red-400' : 'text-emerald-400'}`}>{fmt(convertFromMonthly(remaining, period))}</div>
        </div>
        <div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Allocated%</div>
          <div className={`text-sm font-bold ${isOver ? 'text-red-400' : 'text-slate-300'}`}>{(allocPct * 100).toFixed(1)}%</div>
        </div>
      </div>
      {/* allocation bar */}
      <div className="h-2 rounded-full bg-slate-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : allocPct > 0.9 ? 'bg-amber-400' : 'bg-blue-500'}`}
          style={{ width: `${Math.min(allocPct * 100, 100)}%` }}
        />
      </div>
      {isOver && (
        <p className="text-[11px] text-red-400 text-center">
          Over by {fmt(convertFromMonthly(Math.abs(remaining), period))} — you can still save; warning appears on apply
        </p>
      )}
      {!isOver && remaining > 0 && (
        <p className="text-[11px] text-slate-500 text-center">
          {fmtPct(remainPct)} unallocated ({fmt(convertFromMonthly(remaining, period))})
        </p>
      )}
    </div>
  )
}

// Stacked allocation bar
function AllocationView({ cats, income, period }: { cats: SandboxCategory[]; income: number; period: Period }) {
  const groups: { type: CategoryType; label: string; color: string; total: number }[] = [
    { type: 'fixed bill',       label: 'Fixed',     color: TYPE_COLOR['fixed bill'],       total: 0 },
    { type: 'variable spending',label: 'Flexible',  color: TYPE_COLOR['variable spending'], total: 0 },
    { type: 'savings',          label: 'Savings',   color: TYPE_COLOR.savings,             total: 0 },
    { type: 'investing',        label: 'Investing', color: TYPE_COLOR.investing,           total: 0 },
  ]
  for (const c of cats) {
    const g = groups.find(g => g.type === c.type)
    if (g) g.total += c.amount
  }
  const allocated = groups.reduce((s, g) => s + g.total, 0)
  const unalloc = Math.max(0, income - allocated)
  if (unalloc > 0) groups.push({ type: 'variable spending' as CategoryType, label: 'Unallocated', color: '#374151', total: unalloc })

  return (
    <div className="space-y-3">
      {/* stacked bar */}
      <div className="h-8 rounded-xl overflow-hidden flex">
        {groups.filter(g => g.total > 0 && income > 0).map(g => (
          <div
            key={g.label}
            style={{ width: `${Math.min((g.total / income) * 100, 100)}%`, backgroundColor: g.color }}
            className="flex items-center justify-center overflow-hidden"
            title={`${g.label}: ${fmt(convertFromMonthly(g.total, period))}`}
          >
            {g.total / income > 0.08 && (
              <span className="text-[10px] font-bold text-white/90 drop-shadow">
                {Math.round((g.total / income) * 100)}%
              </span>
            )}
          </div>
        ))}
      </div>
      {/* legend */}
      <div className="flex flex-wrap gap-3">
        {groups.filter(g => g.total > 0).map(g => (
          <div key={g.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: g.color }} />
            <span className="text-[11px] text-slate-400">{g.label}</span>
            <span className="text-[11px] font-semibold text-slate-200">{fmt(convertFromMonthly(g.total, period))}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Donut chart
function DonutView({ cats, income, period }: { cats: SandboxCategory[]; income: number; period: Period }) {
  const groups = [
    { type: 'fixed bill' as CategoryType,       label: 'Fixed',     color: TYPE_COLOR['fixed bill'],       total: 0 },
    { type: 'variable spending' as CategoryType, label: 'Flexible',  color: TYPE_COLOR['variable spending'], total: 0 },
    { type: 'savings' as CategoryType,           label: 'Savings',   color: TYPE_COLOR.savings,             total: 0 },
    { type: 'investing' as CategoryType,         label: 'Investing', color: TYPE_COLOR.investing,           total: 0 },
  ]
  for (const c of cats) {
    const g = groups.find(g => g.type === c.type)
    if (g) g.total += c.amount
  }
  const allocated = groups.reduce((s, g) => s + g.total, 0)
  const unalloc = Math.max(0, income - allocated)
  const all = [...groups, ...(unalloc > 0 ? [{ type: 'variable spending' as CategoryType, label: 'Unallocated', color: '#374151', total: unalloc }] : [])]
    .filter(g => g.total > 0)

  const total = all.reduce((s, g) => s + g.total, 0)
  const R = 80, r = 52, cx = 100, cy = 100
  let cumAngle = -Math.PI / 2

  const slices = all.map(g => {
    const pct = total > 0 ? g.total / total : 0
    const angle = pct * 2 * Math.PI
    const x1 = cx + R * Math.cos(cumAngle)
    const y1 = cy + R * Math.sin(cumAngle)
    cumAngle += angle
    const x2 = cx + R * Math.cos(cumAngle)
    const y2 = cy + R * Math.sin(cumAngle)
    const xi1 = cx + r * Math.cos(cumAngle - angle)
    const yi1 = cy + r * Math.sin(cumAngle - angle)
    const xi2 = cx + r * Math.cos(cumAngle)
    const yi2 = cy + r * Math.sin(cumAngle)
    const large = angle > Math.PI ? 1 : 0
    const d = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z`
    return { ...g, d, pct }
  })

  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 200 200" className="w-44 h-44">
        {slices.map(s => <path key={s.label} d={s.d} fill={s.color} className="opacity-90" />)}
        <text x={cx} y={cy - 8} textAnchor="middle" fill="#ECECEF" fontSize="14" fontWeight="bold">
          {fmt(convertFromMonthly(allocated, period))}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="#A8A8B3" fontSize="9">
          allocated
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center">
        {slices.map(s => (
          <div key={s.label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-[11px] text-slate-400">{s.label}</span>
            <span className="text-[11px] font-semibold text-slate-200">{Math.round(s.pct * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Running balance view
function RunningBalanceView({ cats, income, period }: { cats: SandboxCategory[]; income: number; period: Period }) {
  let running = income
  const rows: { cat: SandboxCategory; deducted: number; remaining: number }[] = []
  for (const c of cats) {
    running -= c.amount
    rows.push({ cat: c, deducted: c.amount, remaining: running })
  }

  function remainColor(r: number): string {
    if (r < 0) return 'text-red-400'
    const pct = income > 0 ? r / income : 1
    if (pct < 0.08) return 'text-red-400'
    if (pct < 0.2) return 'text-amber-400'
    return 'text-emerald-400'
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between py-2 px-1">
        <span className="text-xs font-semibold text-slate-400">Starting Income</span>
        <span className="text-sm font-bold text-emerald-400">{fmt(convertFromMonthly(income, period))}</span>
      </div>
      {rows.map((row, i) => (
        <div key={row.cat.id} className="flex items-center gap-2 py-2 px-1 border-t border-slate-700/40">
          <span className="text-[11px] text-slate-500 w-4 shrink-0">{i + 1}</span>
          <div className="w-5 h-5 rounded-md shrink-0 flex items-center justify-center text-[9px] font-bold text-white"
            style={{ backgroundColor: TYPE_COLOR[row.cat.type] + 'CC' }}>
            {row.cat.name[0]}
          </div>
          <span className="text-xs text-slate-300 flex-1 min-w-0 truncate">{row.cat.name}</span>
          <span className="text-xs text-slate-500 shrink-0">− {fmt(convertFromMonthly(row.deducted, period))}</span>
          <span className={`text-xs font-bold shrink-0 w-20 text-right ${remainColor(row.remaining)}`}>
            {fmt(convertFromMonthly(row.remaining, period))}
          </span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2 px-1 border-t border-slate-600/60">
        <div className="flex gap-3">
          <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Healthy</span>
          <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Getting tight</span>
          <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Very low / over</span>
        </div>
      </div>
    </div>
  )
}

// Category card (collapsed + expanded)
function CategoryCard({
  cat, income, runningBefore, period,
  onChange, onRemove,
  dragHandleProps,
  onLongPress,
}: {
  cat: SandboxCategory
  income: number
  runningBefore: number
  period: Period
  onChange: (updated: SandboxCategory) => void
  onRemove: () => void
  dragHandleProps: React.HTMLAttributes<HTMLDivElement> & { style?: React.CSSProperties }
  onLongPress?: (pid: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [sliderVal, setSliderVal] = useState(cat.amount)
  const [amtFocused, setAmtFocused] = useState(false)
  const [amtStr, setAmtStr] = useState('')
  const [nameEditing, setNameEditing] = useState(false)
  const [nameStr, setNameStr] = useState('')
  const slidingRef = useRef(false)
  // keep slider in sync when amount changes from outside (stepper buttons, etc.)
  if (!slidingRef.current && sliderVal !== cat.amount) setSliderVal(cat.amount)
  const displayAmt = convertFromMonthly(cat.amount, period)
  const pct = income > 0 ? cat.amount / income : 0
  const remaining = runningBefore - cat.amount

  function remainColor(): string {
    if (remaining < 0) return 'text-red-400'
    const r = income > 0 ? remaining / income : 1
    if (r < 0.08) return 'text-red-400'
    if (r < 0.2) return 'text-amber-400'
    return 'text-emerald-400'
  }

  const barPct = income > 0 ? Math.min(cat.amount / income, 1) : 0

  function setAmt(monthly: number) {
    onChange({ ...cat, amount: Math.max(0, Math.round(monthly)) })
  }

  const step = convertToMonthly(1, period) // $1/period steps → whole numbers in display
  const sliderMin = 0
  const sliderMax = income > 0 ? income * 1.5 : 5000

  return (
    <div className={`rounded-2xl border transition-all ${expanded ? 'border-blue-600/60 bg-slate-800' : 'border-slate-700/60 bg-slate-800/60'}`}>
      {/* collapsed header — touch-none so iOS doesn't claim the touch for scroll,
          allowing long-press drag to work without pointercancel */}
      <div
        className="flex items-center gap-3 px-3.5 py-3 cursor-pointer select-none touch-none"
        onClick={() => setExpanded(v => !v)}
        onPointerDown={onLongPress ? (e: React.PointerEvent) => {
          const pid = e.pointerId, startX = e.clientX, startY = e.clientY
          let cancelled = false
          const timer = setTimeout(() => {
            if (cancelled) return
            cleanup(); onLongPress(pid)
          }, 300)
          function onMove(ev: PointerEvent) {
            if (ev.pointerId !== pid) return
            if (Math.abs(ev.clientY - startY) > 15 || Math.abs(ev.clientX - startX) > 15) {
              cancelled = true; clearTimeout(timer); cleanup()
            }
          }
          function onUp() { cancelled = true; clearTimeout(timer); cleanup() }
          function cleanup() {
            document.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerup', onUp)
            document.removeEventListener('pointercancel', onUp)
          }
          document.addEventListener('pointermove', onMove)
          document.addEventListener('pointerup', onUp)
          document.addEventListener('pointercancel', onUp)
        } : undefined}
      >
        {/* drag handle */}
        <div
          {...dragHandleProps}
          data-drag-handle="true"
          onClick={e => e.stopPropagation()}
          className="text-slate-600 hover:text-slate-400 cursor-grab active:cursor-grabbing touch-none flex-shrink-0 px-0.5"
        >
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="3" cy="4" r="1.5"/><circle cx="9" cy="4" r="1.5"/>
            <circle cx="3" cy="8" r="1.5"/><circle cx="9" cy="8" r="1.5"/>
            <circle cx="3" cy="12" r="1.5"/><circle cx="9" cy="12" r="1.5"/>
          </svg>
        </div>
        {/* color dot */}
        <div className="w-7 h-7 rounded-lg flex-shrink-0" style={{ backgroundColor: TYPE_COLOR[cat.type] + '33', border: `1.5px solid ${TYPE_COLOR[cat.type]}66` }}>
          <span className="w-full h-full flex items-center justify-center text-[11px] font-bold" style={{ color: TYPE_COLOR[cat.type] }}>
            {cat.name[0].toUpperCase()}
          </span>
        </div>
        {/* name + type */}
        <div className="flex-1 min-w-0" onClick={e => { if (expanded || nameEditing) e.stopPropagation() }}>
          {nameEditing ? (
            <input
              type="text"
              value={nameStr}
              autoFocus
              className="w-full text-xs font-semibold text-slate-200 bg-transparent border-b border-blue-500 outline-none truncate"
              onChange={e => setNameStr(e.target.value)}
              onFocus={e => e.target.select()}
              onBlur={() => {
                setNameEditing(false)
                const trimmed = nameStr.trim()
                if (trimmed) onChange({ ...cat, name: trimmed })
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') { setNameEditing(false) }
              }}
            />
          ) : (
            <div
              className="text-xs font-semibold text-slate-200 truncate"
              onClick={() => { if (!expanded) return; setNameStr(cat.name); setNameEditing(true) }}
            >{cat.name}</div>
          )}
          <div className="text-[10px] text-slate-500">{TYPE_LABEL[cat.type]} · {BEHAVIOR_LABEL[cat.behavior]}</div>
        </div>
        {/* amount + pct */}
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-slate-100">{fmt(displayAmt)}</div>
          <div className="text-[10px] text-slate-500">{(pct * 100).toFixed(1)}%</div>
        </div>
        <span className="text-slate-500 text-xs ml-1">{expanded ? '▲' : '▼'}</span>
      </div>

      {/* allocation bar */}
      <div className="mx-3.5 mb-2 h-1 rounded-full bg-slate-700/60 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${barPct * 100}%`, backgroundColor: TYPE_COLOR[cat.type] + 'BB' }} />
      </div>

      {/* remaining after */}
      <div className="flex justify-between px-3.5 pb-2.5 text-[10px]">
        <span className="text-slate-500">{(pct * 100).toFixed(1)}% of income</span>
        <span className={remainColor()}>{fmt(convertFromMonthly(remaining, period))} remaining after</span>
      </div>

      {/* expanded section */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-3.5 py-4 space-y-4">
          {/* amount stepper */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase tracking-wide mb-2 block">Planned Amount ({labelPeriod(period)})</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setAmt(cat.amount - convertToMonthly(1, period))}
                className="w-9 h-9 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-lg font-bold transition-colors flex items-center justify-center flex-shrink-0"
              >−</button>
              <div className="flex-1 text-center">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amtFocused ? amtStr : fmt(displayAmt)}
                  onFocus={e => { setAmtFocused(true); setAmtStr(String(Math.round(displayAmt))); setTimeout(() => e.target.select(), 0) }}
                  onChange={e => setAmtStr(e.target.value.replace(/[^0-9.]/g, ''))}
                  onBlur={() => {
                    setAmtFocused(false)
                    const n = parseFloat(amtStr)
                    if (!isNaN(n) && n >= 0) setAmt(convertToMonthly(n, period))
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                  className="w-full text-center text-lg font-bold text-slate-100 bg-transparent border-none outline-none"
                />
              </div>
              <button
                onClick={() => setAmt(cat.amount + convertToMonthly(1, period))}
                className="w-9 h-9 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-lg font-bold transition-colors flex items-center justify-center flex-shrink-0"
              >+</button>
            </div>
            <div className="mt-1 text-[10px] text-slate-500 text-center">
              Monthly equivalent: {fmt(cat.amount)}
            </div>
          </div>

          {/* slider — snaps to whole dollar monthly */}
          <div>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              step={step}
              value={sliderVal}
              onChange={e => { slidingRef.current = true; setSliderVal(Number(e.target.value)) }}
              onPointerUp={e => { slidingRef.current = false; setAmt(Number((e.target as HTMLInputElement).value)) }}
              onMouseUp={e => { slidingRef.current = false; setAmt(Number((e.target as HTMLInputElement).value)) }}
              className="w-full h-2 rounded-full appearance-none bg-slate-700 accent-blue-500 cursor-pointer"
            />
            {(cat.minAmount !== undefined || cat.targetAmount !== undefined || cat.maxAmount !== undefined) && (
              <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                {cat.minAmount !== undefined ? <span>{fmt(convertFromMonthly(cat.minAmount, period))}<br/>Min</span> : <span />}
                {cat.targetAmount !== undefined ? <span className="text-center">{fmt(convertFromMonthly(cat.targetAmount, period))}<br/>Target</span> : <span />}
                {cat.maxAmount !== undefined ? <span className="text-right">{fmt(convertFromMonthly(cat.maxAmount, period))}<br/>Max</span> : <span />}
              </div>
            )}
          </div>

          {/* remaining */}
          <div className="rounded-xl bg-slate-700/40 px-3 py-2.5 text-center">
            <span className={`text-sm font-bold ${remainColor()}`}>{fmt(convertFromMonthly(remaining, period))}</span>
            <span className="text-[11px] text-slate-400"> remaining after this category</span>
          </div>

          {/* type */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase tracking-wide mb-2 block">Category Type</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['fixed bill', 'variable spending', 'savings', 'investing'] as CategoryType[]).map(t => {
                const active = cat.type === t
                const color = TYPE_COLOR[t]
                return (
                  <button
                    key={t}
                    onClick={() => onChange({ ...cat, type: t })}
                    className={`text-[11px] px-2.5 py-2 rounded-xl border transition-colors text-left ${active ? 'text-white' : 'border-slate-600/60 bg-slate-700/40 text-slate-400 hover:bg-slate-700'}`}
                    style={active ? { borderColor: color, backgroundColor: color + '33', color } : {}}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* behavior */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase tracking-wide mb-2 block">Income Response</label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['fixed', 'flexible', 'percentage', 'overflow'] as SandboxCategoryBehavior[]).map(b => (
                <button
                  key={b}
                  onClick={() => onChange({ ...cat, behavior: b })}
                  className={`text-[11px] px-2.5 py-2 rounded-xl border transition-colors text-left ${cat.behavior === b ? 'border-blue-500 bg-blue-600/20 text-blue-300' : 'border-slate-600/60 bg-slate-700/40 text-slate-400 hover:bg-slate-700'}`}
                >
                  {BEHAVIOR_LABEL[b]}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              {cat.behavior === 'fixed' && 'Amount stays the same regardless of income.'}
              {cat.behavior === 'flexible' && 'Adjusts between min and max as income changes.'}
              {cat.behavior === 'percentage' && `${cat.percentageOfIncome ? (cat.percentageOfIncome * 100).toFixed(1) : '0'}% of income, up to max.`}
              {cat.behavior === 'overflow' && 'Receives extra income after other categories are funded.'}
            </p>
          </div>

          {/* min/target/max for flexible */}
          {cat.behavior === 'flexible' && (
            <div className="grid grid-cols-3 gap-2">
              {(['minAmount', 'targetAmount', 'maxAmount'] as const).map((k, i) => (
                <div key={k}>
                  <label className="text-[10px] text-slate-500 block mb-1">{['Min', 'Target', 'Max'][i]}</label>
                  <input
                    type="number"
                    min={0}
                    value={cat[k] !== undefined ? convertFromMonthly(cat[k]!, period) : ''}
                    placeholder="—"
                    onChange={e => onChange({ ...cat, [k]: e.target.value ? convertToMonthly(Math.max(0, Number(e.target.value)), period) : undefined })}
                    className="w-full rounded-lg bg-slate-700 border border-slate-600 px-2 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}

          {/* notes */}
          <div>
            <label className="text-[11px] text-slate-400 uppercase tracking-wide mb-1.5 block">Notes</label>
            <textarea
              value={cat.notes ?? ''}
              onChange={e => onChange({ ...cat, notes: e.target.value })}
              placeholder="Optional note for this category…"
              rows={2}
              className="w-full rounded-xl bg-slate-700 border border-slate-600 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          {/* remove */}
          <button
            onClick={onRemove}
            className="w-full text-[11px] text-red-400 hover:text-red-300 py-1.5 transition-colors"
          >
            Remove from sandbox
          </button>
        </div>
      )}
    </div>
  )
}

function convertToMonthly(v: number, p: Period): number {
  return p === 'weekly' ? v * 4 : p === 'bi-weekly' ? v * 2 : p === 'yearly' ? v / 12 : v
}

// Income Change Rules panel
function ChangeRulesPanel({
  increaseRules, decreaseRules,
  onUpdateIncrease, onUpdateDecrease,
  onClose,
}: {
  increaseRules: SandboxChangeRule[]
  decreaseRules: SandboxChangeRule[]
  onUpdateIncrease: (r: SandboxChangeRule[]) => void
  onUpdateDecrease: (r: SandboxChangeRule[]) => void
  onClose: () => void
}) {
  function RuleList({ rules, onChange, label }: { rules: SandboxChangeRule[]; onChange: (r: SandboxChangeRule[]) => void; label: string }) {
    function move(i: number, dir: -1 | 1) {
      const next = [...rules]
      const j = i + dir
      if (j < 0 || j >= next.length) return
      ;[next[i], next[j]] = [next[j], next[i]]
      onChange(next)
    }
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-slate-300">{label}</span>
        </div>
        {rules.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 rounded-xl bg-slate-700/60 border border-slate-600/40 px-3 py-2">
            <span className="text-[10px] text-slate-500 w-4 shrink-0">{i + 1}</span>
            <span className="text-xs text-slate-300 flex-1">{r.label}</span>
            <div className="flex flex-col gap-0.5">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-500 hover:text-slate-300 disabled:opacity-30 text-[10px] leading-none">▲</button>
              <button onClick={() => move(i, 1)} disabled={i === rules.length - 1} className="text-slate-500 hover:text-slate-300 disabled:opacity-30 text-[10px] leading-none">▼</button>
            </div>
          </div>
        ))}
        <button
          onClick={() => onChange([...rules, { id: uid(), label: 'New rule' }])}
          className="w-full text-[11px] text-blue-400 hover:text-blue-300 py-1.5 border border-dashed border-slate-600 rounded-xl transition-colors"
        >+ Add rule</button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700 sticky top-0 bg-slate-900/95">
        <h2 className="text-sm font-semibold text-slate-100">Income Change Rules</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-sm">Done</button>
      </div>
      <div className="flex-1 px-4 py-4 space-y-6 max-w-lg mx-auto w-full">
        <p className="text-xs text-slate-500">Set priority rules for how your budget adjusts when income increases or decreases.</p>
        <RuleList rules={increaseRules} onChange={onUpdateIncrease} label="When income increases" />
        <RuleList rules={decreaseRules} onChange={onUpdateDecrease} label="When income decreases" />
      </div>
    </div>
  )
}

// Over-budget warning modal
function OverBudgetWarning({ overBy, period, onCancel, onConfirm }: { overBy: number; period: Period; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-5 space-y-4">
        <div className="text-center">
          <div className="text-2xl mb-2">⚠️</div>
          <h3 className="text-sm font-bold text-slate-100">Draft is over income</h3>
          <p className="text-xs text-slate-400 mt-1">
            This draft exceeds income by <span className="text-red-400 font-bold">{fmt(convertFromMonthly(overBy, period))}</span>.
            You can still save or apply it.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 transition-colors">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-xs text-white font-semibold transition-colors">Save Anyway</button>
        </div>
      </div>
    </div>
  )
}

// Overwrite saved budget picker
function OverwritePicker({ savedBudgets, onPick, onCancel }: { savedBudgets: SavedBudget[]; onPick: (name: string) => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-100">Overwrite Saved Budget</h3>
          <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
        </div>
        {savedBudgets.length === 0 ? (
          <p className="text-xs text-slate-400">No saved budgets yet.</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {savedBudgets.map(b => (
              <button
                key={b.name}
                onClick={() => onPick(b.name)}
                className="w-full text-left rounded-xl border border-slate-600/60 bg-slate-700/40 hover:bg-slate-700 px-3 py-2.5 transition-colors"
              >
                <div className="text-xs font-semibold text-slate-200">{b.name}</div>
                <div className="text-[10px] text-slate-500">{b.categories.length} categories · saved {new Date(b.savedAt).toLocaleDateString()}</div>
              </button>
            ))}
          </div>
        )}
        <button onClick={onCancel} className="w-full py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 transition-colors">Cancel</button>
      </div>
    </div>
  )
}

// Action sheet
function ActionSheet({ onClose, onApply, onSaveNew, onOverwrite, onSaveDraftOnly }: {
  onClose: () => void
  onApply: () => void
  onSaveNew: () => void
  onOverwrite: () => void
  onSaveDraftOnly: () => void
}) {
  const actions = [
    { icon: '✓', color: 'text-emerald-400', label: 'Apply to Current Budget', sub: 'Replace your current active budget.', fn: onApply },
    { icon: '⊕', color: 'text-blue-400',    label: 'Save as New Budget',       sub: 'Create a new saved budget.',         fn: onSaveNew },
    { icon: '↺', color: 'text-amber-400',   label: 'Overwrite Saved Budget',   sub: 'Replace an existing saved budget.',  fn: onOverwrite },
    { icon: '⬡', color: 'text-slate-400',   label: 'Save as Draft Only',       sub: 'Keep working on this later.',        fn: onSaveDraftOnly },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-5 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-100">Choose an action</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
        </div>
        {actions.map(a => (
          <button key={a.label} onClick={a.fn}
            className="w-full flex items-center gap-3 rounded-xl border border-slate-600/60 bg-slate-700/40 hover:bg-slate-700 px-3 py-3 text-left transition-colors">
            <span className={`text-xl ${a.color} w-6 text-center shrink-0`}>{a.icon}</span>
            <div>
              <div className="text-xs font-semibold text-slate-200">{a.label}</div>
              <div className="text-[10px] text-slate-500">{a.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Draft list (home screen) ─────────────────────────────────────────────────

function DraftList({
  drafts,
  onOpen,
  onNew,
  onDuplicate,
  onDelete,
  onClose,
}: {
  drafts: SandboxDraft[]
  onOpen: (id: string) => void
  onNew: () => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-xs">← Back</button>
          <span className="text-slate-600 text-xs">|</span>
          <h1 className="text-sm font-bold text-slate-100">Budget Sandbox</h1>
          <span className="text-[10px] bg-blue-600/30 text-blue-300 border border-blue-600/40 rounded px-1.5 py-0.5">Beta</span>
        </div>
        <button
          onClick={onNew}
          className="text-[11px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
        >+ New Draft</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {drafts.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <div className="text-3xl">🧪</div>
            <p className="text-sm font-semibold text-slate-300">Build budgets without limits</p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">Create a sandbox draft to experiment with income scenarios and category allocations. Nothing changes in your live budget until you apply it.</p>
            <button
              onClick={onNew}
              className="mt-4 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs text-white font-semibold transition-colors"
            >Create first draft</button>
          </div>
        ) : (
          drafts.map(d => (
            <div key={d.id} className="rounded-2xl border border-slate-700/60 bg-slate-800/60 overflow-hidden">
              <button
                className="w-full text-left px-4 py-3.5 hover:bg-slate-700/30 transition-colors"
                onClick={() => onOpen(d.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-semibold text-slate-200">{d.name}</span>
                    <span className="ml-2 text-[10px] bg-slate-700 text-slate-400 rounded px-1.5 py-0.5">Draft</span>
                  </div>
                  <span className="text-slate-500 text-xs shrink-0">▶</span>
                </div>
                <div className="flex gap-3 mt-2 text-[10px] text-slate-500">
                  <span>From: {d.startingFrom}</span>
                  <span>·</span>
                  <span>{labelPeriod(d.period)}</span>
                  <span>·</span>
                  <span>{d.categories.length} categories</span>
                </div>
                <div className="text-[10px] text-slate-600 mt-1">
                  Saved {new Date(d.updatedAt).toLocaleDateString()}
                </div>
              </button>
              <div className="flex border-t border-slate-700/40">
                <button
                  onClick={() => onDuplicate(d.id)}
                  className="flex-1 py-2 text-[11px] text-slate-500 hover:text-slate-300 hover:bg-slate-700/30 transition-colors"
                >Duplicate</button>
                <button
                  onClick={() => onDelete(d.id)}
                  className="flex-1 py-2 text-[11px] text-red-500/70 hover:text-red-400 hover:bg-red-900/10 transition-colors border-l border-slate-700/40"
                >Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ─── Draft editor ─────────────────────────────────────────────────────────────

function DraftEditor({
  draft,
  savedBudgets,
  incomeMonthly,
  onUpdate,
  onBack,
  onApplyToCurrentBudget,
  onSaveAsNewBudget,
  onOverwriteSavedBudget,
}: {
  draft: SandboxDraft
  savedBudgets: SavedBudget[]
  incomeMonthly: number
  onUpdate: (d: SandboxDraft) => void
  onBack: () => void
  onApplyToCurrentBudget: (cats: Category[]) => void
  onSaveAsNewBudget: (name: string, cats: Category[]) => void
  onOverwriteSavedBudget: (budgetName: string, cats: Category[]) => void
}) {
  const [view, setView] = useState<'allocation' | 'donut' | 'running'>('allocation')
  const [showRules, setShowRules] = useState(false)
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [showOverwritePicker, setShowOverwritePicker] = useState(false)
  const [overBudgetAction, setOverBudgetAction] = useState<null | 'apply' | 'save-new' | 'overwrite' | 'save-draft'>(null)
  const [newBudgetName, setNewBudgetName] = useState('')
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(draft.name)

  // pointer drag — native document listeners, works on touch + mouse
  const dragFromRef = useRef<number | null>(null)
  const dragOverRef = useRef<number | null>(null)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)
  const cardEls = useRef<(HTMLDivElement | null)[]>([])
  const sortedCatsRef = useRef<SandboxCategory[]>([])

  function findTargetIdx(clientY: number): number {
    const els = cardEls.current
    let target = Math.max(0, els.length - 1)
    for (let i = 0; i < els.length; i++) {
      const el = els[i]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) { target = i; break }
    }
    return target
  }

  function startDrag(fromIdx: number, pid: number) {
    dragFromRef.current = fromIdx
    dragOverRef.current = fromIdx
    setDragFrom(fromIdx)
    setDragOver(fromIdx)
    navigator.vibrate?.(50)

    // Suppress the click that fires after pointerup so expand/collapse doesn't toggle
    const suppressClick = (ev: Event) => {
      ev.stopPropagation()
      ev.preventDefault()
      document.removeEventListener('click', suppressClick, true)
    }
    document.addEventListener('click', suppressClick, true)
    setTimeout(() => document.removeEventListener('click', suppressClick, true), 400)

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pid) return
      ev.preventDefault()
      const t = findTargetIdx(ev.clientY)
      dragOverRef.current = t
      setDragOver(t)
    }
    function onUp() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      document.removeEventListener('pointercancel', onUp)
      const from = dragFromRef.current
      const over = dragOverRef.current
      dragFromRef.current = null
      dragOverRef.current = null
      setDragFrom(null)
      setDragOver(null)
      if (from !== null && over !== null && from !== over) {
        const cats = sortedCatsRef.current
        const newOrder = cats.map(c => c.id)
        const [moved] = newOrder.splice(from, 1)
        newOrder.splice(over, 0, moved)
        patch({ sortMode: 'custom', categoryOrder: newOrder })
      }
    }
    document.addEventListener('pointermove', onMove, { passive: false })
    document.addEventListener('pointerup', onUp)
    document.addEventListener('pointercancel', onUp)
  }

  // Drag handle dots: instant drag on pointerdown (no delay)
  function makeDragHandleProps(idx: number): React.HTMLAttributes<HTMLDivElement> & { style: React.CSSProperties } {
    return {
      style: { touchAction: 'none' },
      onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
        e.preventDefault()
        e.stopPropagation()
        startDrag(idx, e.pointerId)
      },
    }
  }


  const activeScenario = draft.scenarios.find(s => s.id === draft.activeScenarioId) ?? draft.scenarios[0]
  const scenarioIncome = activeScenario?.monthlyIncome ?? incomeMonthly

  const sortedCats = useMemo(
    () => applySort(draft.categories, draft.sortMode, draft.categoryOrder),
    [draft.categories, draft.sortMode, draft.categoryOrder]
  )
  sortedCatsRef.current = sortedCats

  const allocated = draft.categories.reduce((s, c) => s + c.amount, 0)
  const remaining = scenarioIncome - allocated
  const isOver = remaining < 0

  function patch(partial: Partial<SandboxDraft>) {
    onUpdate({ ...draft, ...partial, updatedAt: now() })
  }

  function updateCat(id: string, updated: SandboxCategory) {
    patch({ categories: draft.categories.map(c => c.id === id ? updated : c) })
  }

  function removeCat(id: string) {
    patch({ categories: draft.categories.filter(c => c.id !== id) })
  }

  function addCategory() {
    const newCat: SandboxCategory = {
      id: uid(), name: 'New Category', amount: 0,
      type: 'variable spending', behavior: 'flexible',
    }
    const newOrder = [...draft.categoryOrder, newCat.id]
    patch({ categories: [...draft.categories, newCat], categoryOrder: newOrder })
  }

  function setSort(mode: SandboxSortMode) {
    patch({ sortMode: mode })
  }

  function toCategory(s: SandboxCategory): Category {
    return { id: s.id, name: s.name, amount: s.amount, type: s.type, updatedAt: now() }
  }

  function checkOverBudget(action: 'apply' | 'save-new' | 'overwrite' | 'save-draft', then: () => void) {
    if (isOver) { setOverBudgetAction(action); return }
    then()
  }

  function doApply() {
    onApplyToCurrentBudget(sortedCats.map(toCategory))
    setShowActionSheet(false)
  }

  function doSaveNew(name: string) {
    onSaveAsNewBudget(name, sortedCats.map(toCategory))
    setShowActionSheet(false)
  }

  function doOverwrite(budgetName: string) {
    onOverwriteSavedBudget(budgetName, sortedCats.map(toCategory))
    setShowActionSheet(false)
  }


  // running balance — track cumulative before each cat
  const runningBefore = useMemo(() => {
    let r = scenarioIncome
    return sortedCats.map(c => { const b = r; r -= c.amount; return b })
  }, [sortedCats, scenarioIncome])

  const periods: Period[] = ['weekly', 'bi-weekly', 'monthly', 'yearly']

  return (
    <div className="flex flex-col min-h-full">
      {/* header */}
      <div className="sticky top-0 z-20 bg-slate-900/95 border-b border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={onBack} className="text-slate-400 hover:text-slate-200 text-xs shrink-0">← Drafts</button>
            <span className="text-slate-600 text-xs">|</span>
            {editingName ? (
              <input
                autoFocus
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={() => { patch({ name: nameValue }); setEditingName(false) }}
                onKeyDown={e => { if (e.key === 'Enter') { patch({ name: nameValue }); setEditingName(false) } }}
                className="text-sm font-bold text-slate-100 bg-transparent border-b border-blue-500 outline-none min-w-0 flex-1"
              />
            ) : (
              <button onClick={() => setEditingName(true)} className="text-sm font-bold text-slate-100 text-left truncate flex items-center gap-1.5">
                {draft.name}
                <span className="text-slate-600 text-[10px]">✎</span>
              </button>
            )}
          </div>
          <button
            onClick={() => patch({})} // triggers updatedAt via patch, draft is auto-saved
            className="text-[11px] px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors shrink-0 flex items-center gap-1"
          >
            <span className="text-[10px]">↑</span> Saved
          </button>
        </div>

        {/* meta row */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <select
            value={draft.period}
            onChange={e => patch({ period: e.target.value as Period })}
            className="text-[11px] rounded-lg bg-slate-800 border border-slate-700 text-slate-300 px-2 py-1 focus:outline-none"
          >
            {periods.map(p => <option key={p} value={p}>{labelPeriod(p)}</option>)}
          </select>
          <select
            value={draft.startingFrom}
            onChange={e => patch({ startingFrom: e.target.value })}
            className="text-[11px] rounded-lg bg-slate-800 border border-slate-700 text-slate-300 px-2 py-1 focus:outline-none"
          >
            <option value="current">From: Current Budget</option>
            <option value="blank">From: Blank</option>
            {savedBudgets.map(b => <option key={b.name} value={`saved:${b.name}`}>From: {b.name}</option>)}
          </select>
        </div>

        {/* income scenarios */}
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {draft.scenarios.map(s => (
            <button
              key={s.id}
              onClick={() => patch({ activeScenarioId: s.id })}
              className={`shrink-0 rounded-xl px-3 py-2 border text-left transition-all ${
                s.id === draft.activeScenarioId
                  ? 'border-blue-500 bg-blue-600/20 text-blue-200'
                  : 'border-slate-700 bg-slate-800/60 text-slate-300 hover:border-slate-600'
              }`}
            >
              <div className="text-[10px] font-medium">{s.name}</div>
              <div className="text-xs font-bold mt-0.5">{fmt(convertFromMonthly(s.monthlyIncome, draft.period))}</div>
            </button>
          ))}
          <button
            onClick={() => {
              const newS: SandboxIncomeScenario = { id: uid(), name: 'Custom', monthlyIncome: scenarioIncome }
              patch({ scenarios: [...draft.scenarios, newS], activeScenarioId: newS.id })
            }}
            className="shrink-0 rounded-xl px-3 py-2 border border-dashed border-slate-600 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-colors text-[11px]"
          >+ Add</button>
        </div>
      </div>

      {/* body */}
      <div className="flex-1 px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* income summary */}
        <IncomeSummaryBar income={scenarioIncome} allocated={allocated} period={draft.period} />

        {/* view switcher */}
        <div className="flex rounded-xl bg-slate-800 border border-slate-700 p-1 gap-1">
          {(['allocation', 'donut', 'running'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-1.5 rounded-lg text-[11px] font-medium transition-all ${view === v ? 'bg-slate-600 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {v === 'allocation' ? 'Allocation' : v === 'donut' ? 'Donut' : 'Running Balance'}
            </button>
          ))}
        </div>

        {/* current view */}
        <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
          {view === 'allocation' && <AllocationView cats={sortedCats} income={scenarioIncome} period={draft.period} />}
          {view === 'donut' && <DonutView cats={sortedCats} income={scenarioIncome} period={draft.period} />}
          {view === 'running' && <RunningBalanceView cats={sortedCats} income={scenarioIncome} period={draft.period} />}
        </div>

        {/* categories header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Categories <span className="text-slate-600 font-normal">(drag to reorder)</span>
          </span>
          <select
            value={draft.sortMode}
            onChange={e => setSort(e.target.value as SandboxSortMode)}
            className="text-[11px] rounded-lg bg-slate-800 border border-slate-700 text-slate-400 px-2 py-1 focus:outline-none"
          >
            {(Object.keys(SORT_LABELS) as SandboxSortMode[]).map(k => (
              <option key={k} value={k}>{SORT_LABELS[k]}</option>
            ))}
          </select>
        </div>

        {/* category cards */}
        <div className="space-y-2">
          {sortedCats.map((cat, i) => (
            <div
              key={cat.id}
              ref={el => { cardEls.current[i] = el }}
              onContextMenu={e => e.preventDefault()}
              className={`transition-opacity duration-100 select-none ${dragFrom === i ? 'opacity-40' : ''}`}
              style={dragOver === i && dragFrom !== null && dragFrom !== i ? { borderTop: '2px solid #5E6AD2' } : {}}
            >
              <CategoryCard
                cat={cat}
                income={scenarioIncome}
                runningBefore={runningBefore[i]}
                period={draft.period}
                onChange={updated => updateCat(cat.id, updated)}
                onRemove={() => removeCat(cat.id)}
                dragHandleProps={makeDragHandleProps(i)}
                onLongPress={pid => startDrag(i, pid)}
              />
            </div>
          ))}
        </div>

        {/* add category */}
        <button
          onClick={addCategory}
          className="w-full py-3 rounded-2xl border border-dashed border-slate-600 hover:border-slate-500 text-slate-500 hover:text-slate-300 text-xs transition-colors"
        >+ Add Category</button>

        {/* income change rules */}
        <button
          onClick={() => setShowRules(true)}
          className="w-full py-2.5 rounded-xl border border-slate-700 bg-slate-800/40 hover:bg-slate-800 text-xs text-slate-400 hover:text-slate-200 transition-colors flex items-center justify-between px-4"
        >
          <span>Income Change Rules</span>
          <span className="text-slate-500">›</span>
        </button>

        {/* bottom actions */}
        <div className="grid grid-cols-3 gap-2 pt-2">
          <button
            onClick={() => checkOverBudget('apply', () => setShowActionSheet(true))}
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 transition-colors"
          >
            <span className="text-emerald-400 text-lg">✓</span>
            <span className="text-[10px] text-slate-400 text-center leading-tight">Apply to Current<br/>Budget</span>
          </button>
          <button
            onClick={() => checkOverBudget('save-new', () => setShowActionSheet(true))}
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 transition-colors"
          >
            <span className="text-blue-400 text-lg">⊕</span>
            <span className="text-[10px] text-slate-400 text-center leading-tight">Save as New<br/>Budget</span>
          </button>
          <button
            onClick={() => checkOverBudget('overwrite', () => setShowActionSheet(true))}
            className="flex flex-col items-center gap-1.5 py-3 rounded-2xl border border-slate-700 bg-slate-800/60 hover:bg-slate-800 transition-colors"
          >
            <span className="text-amber-400 text-lg">↺</span>
            <span className="text-[10px] text-slate-400 text-center leading-tight">Overwrite Saved<br/>Budget</span>
          </button>
        </div>
        <div className="pb-8" />
      </div>

      {/* modals */}
      {showRules && (
        <ChangeRulesPanel
          increaseRules={draft.increaseRules}
          decreaseRules={draft.decreaseRules}
          onUpdateIncrease={r => patch({ increaseRules: r })}
          onUpdateDecrease={r => patch({ decreaseRules: r })}
          onClose={() => setShowRules(false)}
        />
      )}

      {overBudgetAction && (
        <OverBudgetWarning
          overBy={Math.abs(remaining)}
          period={draft.period}
          onCancel={() => setOverBudgetAction(null)}
          onConfirm={() => {
            const action = overBudgetAction
            setOverBudgetAction(null)
            if (action === 'apply') setShowActionSheet(true)
            else if (action === 'save-new') setShowActionSheet(true)
            else if (action === 'overwrite') setShowActionSheet(true)
            else if (action === 'save-draft') patch({})
          }}
        />
      )}

      {showActionSheet && (
        <ActionSheet
          onClose={() => setShowActionSheet(false)}
          onApply={() => { setShowActionSheet(false); doApply() }}
          onSaveNew={() => { setShowActionSheet(false); setShowNamePrompt(true) }}
          onOverwrite={() => { setShowActionSheet(false); setShowOverwritePicker(true) }}
          onSaveDraftOnly={() => { setShowActionSheet(false); patch({}) }}
        />
      )}

      {showNamePrompt && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-100">Name this budget</h3>
            <input
              autoFocus
              value={newBudgetName}
              onChange={e => setNewBudgetName(e.target.value)}
              placeholder="e.g. Tight Week Plan"
              className="w-full rounded-xl bg-slate-700 border border-slate-600 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowNamePrompt(false)} className="flex-1 py-2.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-xs text-slate-200 transition-colors">Cancel</button>
              <button
                onClick={() => { if (newBudgetName.trim()) { doSaveNew(newBudgetName.trim()); setShowNamePrompt(false); setNewBudgetName('') } }}
                disabled={!newBudgetName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs text-white font-semibold transition-colors disabled:opacity-50"
              >Save</button>
            </div>
          </div>
        </div>
      )}

      {showOverwritePicker && (
        <OverwritePicker
          savedBudgets={savedBudgets}
          onPick={name => { setShowOverwritePicker(false); doOverwrite(name) }}
          onCancel={() => setShowOverwritePicker(false)}
        />
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

export type BudgetSandboxProps = {
  drafts: SandboxDraft[]
  savedBudgets: SavedBudget[]
  currentCategories: Category[]
  incomeMonthly: number
  period: Period
  onSaveDrafts: (d: SandboxDraft[]) => void
  onApplyToCurrentBudget: (cats: Category[]) => void
  onSaveAsNewBudget: (name: string, cats: Category[]) => void
  onOverwriteSavedBudget: (budgetName: string, cats: Category[]) => void
  onClose: () => void
}

export function BudgetSandbox({
  drafts,
  savedBudgets,
  currentCategories,
  incomeMonthly,
  period,
  onSaveDrafts,
  onApplyToCurrentBudget,
  onSaveAsNewBudget,
  onOverwriteSavedBudget,
  onClose,
}: BudgetSandboxProps) {
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null)

  const activeDraft = activeDraftId ? drafts.find(d => d.id === activeDraftId) ?? null : null

  function createDraft(startingFrom: 'current' | 'blank' = 'current') {
    const baseCats: SandboxCategory[] = startingFrom === 'current'
      ? currentCategories.map(makeSandboxCategory)
      : []
    const defaultScenarios: SandboxIncomeScenario[] = [
      { id: uid(), name: 'Current', monthlyIncome: incomeMonthly },
      { id: uid(), name: 'Tight',   monthlyIncome: incomeMonthly * 0.8 },
      { id: uid(), name: 'Strong',  monthlyIncome: incomeMonthly * 1.3 },
    ]
    const firstId = defaultScenarios[0].id
    const newDraft: SandboxDraft = {
      id: uid(),
      name: 'Draft ' + (drafts.length + 1),
      categories: baseCats,
      scenarios: defaultScenarios,
      activeScenarioId: firstId,
      period,
      startingFrom,
      sortMode: 'amount-desc',
      categoryOrder: baseCats.map(c => c.id),
      increaseRules: DEFAULT_INCREASE_RULES,
      decreaseRules: DEFAULT_DECREASE_RULES,
      createdAt: now(),
      updatedAt: now(),
    }
    const next = [newDraft, ...drafts]
    onSaveDrafts(next)
    setActiveDraftId(newDraft.id)
  }

  function updateDraft(updated: SandboxDraft) {
    onSaveDrafts(drafts.map(d => d.id === updated.id ? updated : d))
  }

  function duplicateDraft(id: string) {
    const src = drafts.find(d => d.id === id)
    if (!src) return
    const copy: SandboxDraft = { ...src, id: uid(), name: src.name + ' (copy)', createdAt: now(), updatedAt: now() }
    onSaveDrafts([copy, ...drafts])
  }

  function deleteDraft(id: string) {
    onSaveDrafts(drafts.filter(d => d.id !== id))
    if (activeDraftId === id) setActiveDraftId(null)
  }

  return (
    <div className="fixed inset-0 z-40 bg-slate-900 overflow-y-auto">
      {activeDraft ? (
        <DraftEditor
          draft={activeDraft}
          savedBudgets={savedBudgets}
          incomeMonthly={incomeMonthly}
          onUpdate={updateDraft}
          onBack={() => setActiveDraftId(null)}
          onApplyToCurrentBudget={cats => { onApplyToCurrentBudget(cats); setActiveDraftId(null) }}
          onSaveAsNewBudget={onSaveAsNewBudget}
          onOverwriteSavedBudget={onOverwriteSavedBudget}
        />
      ) : (
        <DraftList
          drafts={drafts}
          onOpen={setActiveDraftId}
          onNew={() => createDraft('current')}
          onDuplicate={duplicateDraft}
          onDelete={deleteDraft}
          onClose={onClose}
        />
      )}
    </div>
  )
}
