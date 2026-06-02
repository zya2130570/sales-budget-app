import { useState, useMemo } from 'react'
import type { Transaction, Account } from '../types'
import { currency } from '../utils/formatting'

type Props = {
  transactions: Transaction[]
  accounts: Account[]
}

// V53 — Shows "which months I have data for, in which account."
// Derives from transactions[] (not ImportBatch) so it works even for old imports
// that pre-date batch tracking. Grouped by account → month, sorted newest first.

type Row = {
  accountId: string
  accountName: string
  month: string         // YYYY-MM
  count: number
  firstDate: string
  lastDate: string
  totalSpent: number    // sum of expense amounts (absolute)
  totalReceived: number // sum of income amounts (absolute)
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  if (!y || !m) return ym
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' })
}

export function ImportsByMonthAccount({ transactions, accounts }: Props) {
  const [expanded, setExpanded] = useState(true)
  const [accountFilter, setAccountFilter] = useState<string>('')

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>()
    for (const tx of transactions) {
      const ym = tx.date.slice(0, 7)
      if (ym.length !== 7) continue
      const accountName = accounts.find(a => a.id === tx.accountId)?.name ?? '(unknown account)'
      const key = `${tx.accountId}::${ym}`
      const existing = map.get(key)
      const absAmt = Math.abs(tx.amount)
      if (!existing) {
        map.set(key, {
          accountId: tx.accountId, accountName, month: ym,
          count: 1,
          firstDate: tx.date, lastDate: tx.date,
          totalSpent: tx.type === 'expense' ? absAmt : 0,
          totalReceived: tx.type === 'income' ? absAmt : 0,
        })
      } else {
        existing.count++
        if (tx.date < existing.firstDate) existing.firstDate = tx.date
        if (tx.date > existing.lastDate)  existing.lastDate = tx.date
        if (tx.type === 'expense') existing.totalSpent += absAmt
        if (tx.type === 'income')  existing.totalReceived += absAmt
      }
    }
    return [...map.values()].sort((a, b) => {
      if (b.month !== a.month) return b.month.localeCompare(a.month)
      return a.accountName.localeCompare(b.accountName)
    })
  }, [transactions, accounts])

  const visibleRows = accountFilter ? rows.filter(r => r.accountId === accountFilter) : rows

  // Distinct accounts that have any data
  const accountsWithData = useMemo(() => {
    const ids = new Set(rows.map(r => r.accountId))
    return accounts.filter(a => ids.has(a.id))
  }, [rows, accounts])

  if (rows.length === 0) return null

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-800/50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">Imported Data by Month</span>
          <span className="text-[10px] bg-slate-700 text-slate-400 rounded px-1.5 py-0.5">{rows.length} entries</span>
        </div>
        <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
          {expanded && accountsWithData.length > 1 && (
            <select
              value={accountFilter}
              onChange={e => setAccountFilter(e.target.value)}
              className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-600 focus:outline-none"
            >
              <option value="">All accounts ({accountsWithData.length})</option>
              {accountsWithData.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          <span className="text-slate-500 text-xs cursor-pointer" onClick={() => setExpanded(v => !v)}>{expanded ? '▾' : '▸'}</span>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 overflow-x-auto h-scroll-visible">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-700/60">
                <th className="py-1.5 pr-3 font-medium">Account</th>
                <th className="py-1.5 pr-3 font-medium">Month</th>
                <th className="py-1.5 pr-3 font-medium text-right">Transactions</th>
                <th className="py-1.5 pr-3 font-medium">Date Range</th>
                <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">Spent</th>
                <th className="py-1.5 pr-3 font-medium text-right whitespace-nowrap">Received</th>
                <th className="py-1.5 font-medium text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(r => {
                const net = r.totalReceived - r.totalSpent
                return (
                  <tr key={`${r.accountId}-${r.month}`} className="border-b border-slate-800/60 hover:bg-slate-800/30">
                    <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{r.accountName}</td>
                    <td className="py-1.5 pr-3 text-slate-300 whitespace-nowrap">{monthLabel(r.month)}</td>
                    <td className="py-1.5 pr-3 text-right text-slate-200 font-num font-medium">{r.count}</td>
                    <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap text-[11px]">
                      {r.firstDate.slice(5)} → {r.lastDate.slice(5)}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-red-400 font-num">{r.totalSpent > 0 ? currency(r.totalSpent) : '—'}</td>
                    <td className="py-1.5 pr-3 text-right text-emerald-400 font-num">{r.totalReceived > 0 ? currency(r.totalReceived) : '—'}</td>
                    <td className={`py-1.5 text-right font-num font-medium ${net >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {net >= 0 ? '+' : ''}{currency(net)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-slate-600 mt-3 leading-relaxed">
            Derived from your transaction data. Each row represents one (account, month) pair — useful for spotting months where a CSV upload is missing or partial.
          </p>
        </div>
      )}
    </div>
  )
}
