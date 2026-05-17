import React from 'react'
import { currency } from '../utils/formatting'
import { cadenceMult } from '../utils/forecastMath'
import type { RecurringCadence, ManualRecurringItem } from '../utils/forecastMath'
import type { RecurringCandidate } from '../utils/recurring'

export interface RecurringSectionProps {
  recurringCandidates: RecurringCandidate[]
  manualRecurringItems: ManualRecurringItem[]
  setManualRecurringItems: React.Dispatch<React.SetStateAction<ManualRecurringItem[]>>
  estimatedMonthlyRecurring: number
  recurringOpen: boolean
  setRecurringOpen: React.Dispatch<React.SetStateAction<boolean>>
  confirmedRecurring: Set<string>
  setConfirmedRecurring: React.Dispatch<React.SetStateAction<Set<string>>>
  dismissedRecurring: Set<string>
  setDismissedRecurring: React.Dispatch<React.SetStateAction<Set<string>>>
  showAddRecurring: boolean
  setShowAddRecurring: React.Dispatch<React.SetStateAction<boolean>>
  recurringForm: { name: string; amount: string; cadence: RecurringCadence; nextDueDate: string; type: 'expense' | 'income' }
  setRecurringForm: React.Dispatch<React.SetStateAction<{ name: string; amount: string; cadence: RecurringCadence; nextDueDate: string; type: 'expense' | 'income' }>>
}

export function RecurringSection({
  recurringCandidates, manualRecurringItems, setManualRecurringItems,
  estimatedMonthlyRecurring,
  recurringOpen, setRecurringOpen,
  confirmedRecurring, setConfirmedRecurring,
  dismissedRecurring: _dismissedRecurring, setDismissedRecurring,
  showAddRecurring, setShowAddRecurring,
  recurringForm, setRecurringForm,
}: RecurringSectionProps) {
  return (
    <div className="rounded-2xl border border-teal-700/30 bg-teal-950/10 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left"
        onClick={() => setRecurringOpen(v => !v)}
      >
        <div className="flex items-center gap-2.5">
          {recurringCandidates.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-teal-500/25 text-teal-300 text-xs font-bold">
              {recurringCandidates.length}
            </span>
          )}
          <span className="text-teal-300 font-semibold text-sm">Subscriptions &amp; Recurring</span>
          {estimatedMonthlyRecurring > 0 && (
            <span className="text-slate-500 text-xs">≈ {currency(estimatedMonthlyRecurring)}/mo</span>
          )}
        </div>
        <span className="text-slate-500 text-xs">{recurringOpen ? '▲' : '▼'}</span>
      </button>

      {recurringOpen && (
        <div className="border-t border-teal-700/20 px-4 pb-4 pt-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs text-slate-500">
              Recurring suggestions appear after the same merchant appears 2+ times with similar amounts and timing.
              {recurringCandidates.length === 0 && manualRecurringItems.length === 0 && ' Add or import repeated merchants to see suggestions.'}
            </p>
            <button
              className="shrink-0 text-xs text-teal-400 hover:text-teal-300 bg-teal-900/30 hover:bg-teal-900/50 border border-teal-700/30 px-2 py-1 rounded transition-colors"
              onClick={() => setShowAddRecurring(v => !v)}
            >{showAddRecurring ? 'Cancel' : '+ Add Item'}</button>
          </div>

          {/* Manual add form */}
          {showAddRecurring && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-3 rounded-lg bg-slate-800/60 border border-slate-700/60">
              <input
                className="col-span-2 px-2 py-1.5 text-xs rounded bg-slate-800 border border-slate-600 focus:border-teal-500 focus:outline-none"
                placeholder="Name (e.g. Netflix, Rent)"
                value={recurringForm.name}
                onChange={e => setRecurringForm(v => ({ ...v, name: e.target.value }))}
              />
              <input
                type="number" min={0} step={0.01}
                className="px-2 py-1.5 text-xs rounded bg-slate-800 border border-slate-600 focus:border-teal-500 focus:outline-none"
                placeholder="Amount"
                value={recurringForm.amount}
                onChange={e => setRecurringForm(v => ({ ...v, amount: e.target.value }))}
              />
              <select
                className="px-2 py-1.5 text-xs rounded bg-slate-800 border border-slate-600 focus:outline-none"
                value={recurringForm.cadence}
                onChange={e => setRecurringForm(v => ({ ...v, cadence: e.target.value as RecurringCadence }))}
              >
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
              <select
                className="px-2 py-1.5 text-xs rounded bg-slate-800 border border-slate-600 focus:outline-none"
                value={recurringForm.type}
                onChange={e => setRecurringForm(v => ({ ...v, type: e.target.value as 'expense' | 'income' }))}
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <div>
                <label className="text-[10px] text-slate-500 block mb-0.5">Next due</label>
                <input
                  type="date"
                  className="w-full px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 focus:border-teal-500 focus:outline-none"
                  value={recurringForm.nextDueDate}
                  onChange={e => setRecurringForm(v => ({ ...v, nextDueDate: e.target.value }))}
                />
              </div>
              <button
                className="col-span-2 text-xs bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 px-3 py-1.5 rounded transition-colors"
                disabled={!recurringForm.name.trim() || parseFloat(recurringForm.amount) <= 0}
                onClick={() => {
                  const item: ManualRecurringItem = {
                    id: crypto.randomUUID(), name: recurringForm.name.trim(),
                    amount: parseFloat(recurringForm.amount), cadence: recurringForm.cadence,
                    nextDueDate: recurringForm.nextDueDate, type: recurringForm.type,
                  }
                  setManualRecurringItems(prev => [...prev, item])
                  setRecurringForm({ name: '', amount: '', cadence: 'monthly', nextDueDate: new Date().toISOString().slice(0, 10), type: 'expense' })
                  setShowAddRecurring(false)
                }}
              >Add recurring item</button>
            </div>
          )}

          {/* Combined items table */}
          {(recurringCandidates.length > 0 || manualRecurringItems.length > 0) ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700/60">
                    <th className="pb-1.5 pr-3 font-medium">Merchant / Item</th>
                    <th className="pb-1.5 pr-3 font-medium">Cadence</th>
                    <th className="pb-1.5 pr-3 font-medium text-right">Est. /mo</th>
                    <th className="pb-1.5 pr-3 font-medium">Last / Next</th>
                    <th className="pb-1.5 pr-3 font-medium text-center">Seen</th>
                    <th className="pb-1.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {manualRecurringItems.map(item => (
                    <tr key={item.id} className="border-b border-slate-800/60 hover:bg-teal-900/5">
                      <td className="py-1.5 pr-3">
                        <span className="font-medium text-slate-200">{item.name}</span>
                        <span className="ml-1.5 text-[9px] bg-blue-900/40 text-blue-300 border border-blue-700/30 px-1 py-0.5 rounded">Manual</span>
                        {item.type === 'income' && <span className="ml-1 text-[9px] text-green-400">Income</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-slate-400 capitalize">{item.cadence}</td>
                      <td className="py-1.5 pr-3 text-right text-slate-300 font-medium">{currency(item.amount * cadenceMult(item.cadence))}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{item.nextDueDate}</td>
                      <td className="py-1.5 pr-3 text-center text-slate-600">—</td>
                      <td className="py-1.5">
                        <button
                          className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded"
                          onClick={() => setManualRecurringItems(prev => prev.filter(x => x.id !== item.id))}
                        >Remove</button>
                      </td>
                    </tr>
                  ))}
                  {recurringCandidates.map(c => {
                    const isConfirmed = confirmedRecurring.has(c.merchantKey)
                    return (
                      <tr key={c.merchantKey} className="border-b border-slate-800/60 hover:bg-teal-900/5">
                        <td className="py-1.5 pr-3">
                          <span className="font-medium text-slate-200">{c.displayName}</span>
                          {isConfirmed
                            ? <span className="ml-1.5 text-[9px] bg-teal-900/50 text-teal-300 border border-teal-700/40 px-1 py-0.5 rounded">Confirmed</span>
                            : <span className="ml-1.5 text-[9px] bg-slate-700 text-slate-400 border border-slate-600/40 px-1 py-0.5 rounded">Suggested</span>
                          }
                        </td>
                        <td className="py-1.5 pr-3 text-slate-400 capitalize">{c.cadence}</td>
                        <td className="py-1.5 pr-3 text-right text-slate-300 font-medium">{currency(c.estimatedMonthlyAmount)}</td>
                        <td className="py-1.5 pr-3 text-slate-500">{c.lastDate}</td>
                        <td className="py-1.5 pr-3 text-center text-slate-400">{c.count}×</td>
                        <td className="py-1.5">
                          <div className="flex gap-1.5">
                            {!isConfirmed
                              ? <button className="text-[10px] text-teal-400 hover:text-teal-300 bg-teal-900/30 hover:bg-teal-900/50 border border-teal-700/30 px-1.5 py-0.5 rounded" onClick={() => setConfirmedRecurring(prev => new Set([...prev, c.merchantKey]))}>Confirm</button>
                              : <button className="text-[10px] text-slate-400 hover:text-slate-200 bg-slate-700/50 px-1.5 py-0.5 rounded" onClick={() => setConfirmedRecurring(prev => { const n = new Set(prev); n.delete(c.merchantKey); return n })}>Unconfirm</button>
                            }
                            <button className="text-[10px] text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded" onClick={() => setDismissedRecurring(prev => new Set([...prev, c.merchantKey]))}>Dismiss</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {estimatedMonthlyRecurring > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-700/60">
                      <td colSpan={2} className="pt-2 text-xs text-slate-400 font-medium">Est. monthly total</td>
                      <td className="pt-2 text-right text-sm font-bold text-teal-300">{currency(estimatedMonthlyRecurring)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          ) : (
            <div className="rounded-lg border border-teal-700/20 bg-teal-900/10 px-4 py-4 text-center">
              <p className="text-sm text-teal-400/60 font-medium">No recurring transactions detected yet.</p>
              <p className="text-xs text-slate-500 mt-1">Log or import repeated merchants like Netflix, Spotify, gym, rent, or payroll — or use + Add Item above.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
