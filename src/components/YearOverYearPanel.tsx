import { useState, useMemo } from 'react'
import type { Category, Transaction } from '../types'
import { currency } from '../utils/formatting'

type Props = {
  transactions: Transaction[]
  categories: Category[]
}

// V52 — Reads directly from transactions[].date instead of the stale actuals snapshot.
// This fixes the "Pre-period data" bug — historical CSV imports get bucketed by their actual
// transaction dates, so you see "Apr 2025", "May 2025", etc. correctly.
function monthYearLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  const d = new Date(y, m - 1, 1)
  return d.toLocaleString('default', { month: 'short', year: 'numeric' })
}

export function YearOverYearPanel({ transactions, categories }: Props) {
  const [viewMode, setViewMode] = useState<'totals' | 'by-category'>('totals')
  const [showAll, setShowAll] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Only expense-type transactions count toward "spending"
  const expenseTxns = useMemo(
    () => transactions.filter(t => t.type === 'expense' || t.type === 'credit card payment'),
    [transactions]
  )

  // Group by YYYY-MM
  const byMonth = useMemo(() => {
    const map = new Map<string, { total: number; byCat: Record<string, number> }>()
    for (const tx of expenseTxns) {
      const ym = tx.date.slice(0, 7)
      if (ym.length !== 7) continue
      const entry = map.get(ym) ?? { total: 0, byCat: {} }
      entry.total += Math.abs(tx.amount)
      if (tx.categoryId) entry.byCat[tx.categoryId] = (entry.byCat[tx.categoryId] ?? 0) + Math.abs(tx.amount)
      map.set(ym, entry)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [expenseTxns])

  const visibleMonths = showAll ? byMonth : byMonth.slice(0, 12)
  const maxTotal = Math.max(...byMonth.map(([, e]) => e.total), 1)

  // Top categories across all months for the by-category table
  const topCats = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const [, entry] of byMonth) {
      for (const [catId, amt] of Object.entries(entry.byCat)) {
        totals[catId] = (totals[catId] ?? 0) + amt
      }
    }
    return categories
      .map(c => ({ c, total: totals[c.id] ?? 0 }))
      .filter(x => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [byMonth, categories])

  if (byMonth.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setIsCollapsed(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">Spending History</span>
          <span className="text-[10px] bg-slate-700 text-slate-400 rounded px-1.5 py-0.5">
            {byMonth.length} {byMonth.length === 1 ? 'month' : 'months'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!isCollapsed && (
            <div className="flex gap-1" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setViewMode('totals')}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${viewMode === 'totals' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
              >Totals</button>
              <button
                onClick={() => setViewMode('by-category')}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${viewMode === 'by-category' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
              >By Category</button>
            </div>
          )}
          <span className="text-slate-500 text-xs">{isCollapsed ? '▸' : '▾'}</span>
        </div>
      </div>

      {!isCollapsed && (
        <div className="px-4 pb-4">
          {viewMode === 'totals' && (
            <div className="space-y-2">
              {visibleMonths.map(([ym, entry]) => {
                const barPct = (entry.total / maxTotal) * 100
                return (
                  <div key={ym} className="flex items-center gap-3">
                    <div className="w-20 text-right text-xs text-slate-400 shrink-0">{monthYearLabel(ym)}</div>
                    <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className="h-2 rounded-full bg-blue-500/70 transition-all duration-500" style={{ width: `${barPct}%` }}/>
                    </div>
                    <div className="w-24 text-right text-xs font-medium text-slate-300 shrink-0 font-num">{currency(entry.total)}</div>
                  </div>
                )
              })}
              {!showAll && byMonth.length > 12 && (
                <button onClick={() => setShowAll(true)} className="text-xs text-blue-400 hover:text-blue-300 mt-1">
                  + Show {byMonth.length - 12} more months
                </button>
              )}
              {showAll && byMonth.length > 12 && (
                <button onClick={() => setShowAll(false)} className="text-xs text-slate-500 hover:text-slate-400 mt-1">Show less</button>
              )}
            </div>
          )}

          {viewMode === 'by-category' && (
            <div className="overflow-x-auto h-scroll-visible">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/60">
                    <th className="text-left py-1.5 text-slate-400 font-medium pr-3">Category</th>
                    {visibleMonths.slice(0, 6).map(([ym]) => (
                      <th key={ym} className="text-right py-1.5 text-slate-400 font-medium px-2 whitespace-nowrap">{monthYearLabel(ym)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topCats.map(({ c }) => (
                    <tr key={c.id} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                      <td className="py-1.5 text-slate-300 pr-3 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis">{c.name}</td>
                      {visibleMonths.slice(0, 6).map(([ym, entry]) => {
                        const val = entry.byCat[c.id] ?? 0
                        return (
                          <td key={ym} className={`py-1.5 text-right px-2 font-num ${val > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                            {val > 0 ? currency(val) : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr className="border-t border-slate-700/60">
                    <td className="py-1.5 text-slate-400 font-medium pr-3">Total</td>
                    {visibleMonths.slice(0, 6).map(([ym, entry]) => (
                      <td key={ym} className="py-1.5 text-right px-2 font-medium text-slate-200 font-num">{currency(entry.total)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
              {visibleMonths.length > 6 && (
                <p className="text-[10px] text-slate-600 mt-2">Showing 6 most recent months · switch to Totals view for all {byMonth.length}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
