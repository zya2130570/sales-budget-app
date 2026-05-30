import { useState, useMemo } from 'react'
import type { Category } from './types'
import { currency } from '../utils/formatting'

type Props = {
  allActualsByPeriod: Record<string, Record<string, string>>
  categories: Category[]
}

// Parse a period key → human readable label
// Formats: "monthly:2025-01-01:2025-01-31", "bi-weekly:2025-01-01:2025-01-14",
//          "unknown-period:unknown-start", "default", "legacy"
function periodKeyToLabel(key: string): string {
  if (key === 'legacy') return 'All imported (legacy)'
  if (key === 'default') return 'All-time totals'
  const parts = key.split(':')
  if (parts.length < 2) return key
  const dateStr = parts[1]
  if (!dateStr || dateStr === 'unknown-start' || dateStr.startsWith('unknown')) return 'Pre-period data'
  const d = new Date(dateStr + 'T12:00:00')
  if (isNaN(d.getTime())) return key
  return d.toLocaleString('default', { month: 'short', year: 'numeric' })
}

function periodKeyToSortKey(key: string): string {
  if (key === 'default' || key === 'legacy') return '0000-00'
  const parts = key.split(':')
  if (parts.length >= 2 && parts[1] && !parts[1].startsWith('unknown')) return parts[1]
  return '0000-00'
}

// Detect if a key is the "all data dumped in one bucket" case (pre-period-aware imports)
function isLegacyBucket(key: string): boolean {
  return key === 'legacy' || key === 'default'
}

export function YearOverYearPanel({ allActualsByPeriod, categories }: Props) {
  const [viewMode, setViewMode] = useState<'totals' | 'by-category'>('totals')
  const [showAll, setShowAll] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  const periodKeys = useMemo(() =>
    Object.keys(allActualsByPeriod)
      .filter(k => {
        const vals = Object.values(allActualsByPeriod[k] ?? {})
        const total = vals.reduce((s, v) => s + (parseFloat(v) || 0), 0)
        return total > 0  // only show periods with actual spending
      })
      .sort((a, b) => periodKeyToSortKey(b).localeCompare(periodKeyToSortKey(a))),
    [allActualsByPeriod]
  )

  const visibleKeys = showAll ? periodKeys : periodKeys.slice(0, 12)

  const totalsPerPeriod = useMemo(() =>
    periodKeys.reduce<Record<string, number>>((acc, key) => {
      acc[key] = Object.values(allActualsByPeriod[key] ?? {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)
      return acc
    }, {}),
    [periodKeys, allActualsByPeriod]
  )

  const topCats = useMemo(() => {
    const totals = categories.map(c => ({
      c,
      total: periodKeys.reduce((s, k) => s + (parseFloat(allActualsByPeriod[k]?.[c.id] ?? '0') || 0), 0),
    }))
    return totals.filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 6)
  }, [categories, periodKeys, allActualsByPeriod])

  const maxTotal = Math.max(...Object.values(totalsPerPeriod), 1)
  const hasLegacy = periodKeys.some(isLegacyBucket)
  const onlyLegacy = periodKeys.length > 0 && periodKeys.every(isLegacyBucket)

  if (periodKeys.length === 0) return null

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setIsCollapsed(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">Spending History</span>
          <span className="text-[10px] bg-slate-700 text-slate-400 rounded px-1.5 py-0.5">{periodKeys.length} periods</span>
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
          {hasLegacy && (
            <div className="mb-3 rounded-lg border border-amber-700/30 bg-amber-950/10 px-3 py-2 text-[11px] text-amber-300/90 leading-relaxed">
              <strong>Note:</strong> {onlyLegacy ? 'All your spending data is currently in one bucket' : 'Some of your data is in a legacy bucket'} because it was imported before per-period tracking was set up. New transactions from now on will be filed by period (week/month) automatically. To split your existing data by date, re-import the CSVs while on a specific period.
            </div>
          )}
          {viewMode === 'totals' && (
            <div className="space-y-2">
              {visibleKeys.map(key => {
                const total = totalsPerPeriod[key] ?? 0
                const barPct = maxTotal > 0 ? (total / maxTotal) * 100 : 0
                const label = periodKeyToLabel(key)
                return (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-20 text-right text-xs text-slate-400 shrink-0">{label}</div>
                    <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                      <div className="h-2 rounded-full bg-blue-500/70 transition-all duration-500" style={{ width: `${barPct}%` }}/>
                    </div>
                    <div className="w-24 text-right text-xs font-medium text-slate-300 shrink-0">{currency(total)}</div>
                  </div>
                )
              })}
              {!showAll && periodKeys.length > 12 && (
                <button onClick={() => setShowAll(true)} className="text-xs text-blue-400 hover:text-blue-300 mt-1">
                  + Show {periodKeys.length - 12} more periods
                </button>
              )}
              {showAll && periodKeys.length > 12 && (
                <button onClick={() => setShowAll(false)} className="text-xs text-slate-500 hover:text-slate-400 mt-1">Show less</button>
              )}
            </div>
          )}

          {viewMode === 'by-category' && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700/60">
                    <th className="text-left py-1.5 text-slate-400 font-medium pr-3">Category</th>
                    {visibleKeys.slice(0, 6).map(k => (
                      <th key={k} className="text-right py-1.5 text-slate-400 font-medium px-2 whitespace-nowrap">{periodKeyToLabel(k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topCats.map(({ c }) => (
                    <tr key={c.id} className="border-b border-slate-800/60 hover:bg-slate-800/20">
                      <td className="py-1.5 text-slate-300 pr-3 whitespace-nowrap max-w-[120px] overflow-hidden text-ellipsis">{c.name}</td>
                      {visibleKeys.slice(0, 6).map(k => {
                        const val = parseFloat(allActualsByPeriod[k]?.[c.id] ?? '0') || 0
                        return (
                          <td key={k} className={`py-1.5 text-right px-2 ${val > 0 ? 'text-slate-300' : 'text-slate-600'}`}>
                            {val > 0 ? currency(val) : '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr className="border-t border-slate-700/60">
                    <td className="py-1.5 text-slate-400 font-medium pr-3">Total</td>
                    {visibleKeys.slice(0, 6).map(k => (
                      <td key={k} className="py-1.5 text-right px-2 font-medium text-slate-200">{currency(totalsPerPeriod[k] ?? 0)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
              {visibleKeys.length > 6 && (
                <p className="text-[10px] text-slate-600 mt-2">Showing 6 most recent · switch to Totals view for all {periodKeys.length}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
