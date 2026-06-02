import React from 'react'
import type { Transaction, Account, Category, TransactionRule, TransactionType, Period } from '../types'
import type { RecurringCandidate } from '../utils/recurring'
import type { ForecastLineItem as _FI } from '../utils/forecastMath'
import { currency } from '../utils/formatting'
import { normalizeMerchant } from '../utils/merchantNormalization'
import { txNeedsReview } from '../utils/transactionHelpers'
import { TXN_TYPE_LABELS, TXN_FILTER_OPTIONS } from '../utils/transactionHelpers'
import { getPeriodDateRange } from '../utils/calculations'
import { NeedsReviewSection } from './NeedsReviewSection'
import type { NeedsReviewSectionProps } from './NeedsReviewSection'
import { RecurringSection } from './RecurringSection'
import type { RecurringSectionProps } from './RecurringSection'
import { ImportHistorySection } from './ImportHistorySection'
import type { ImportHistorySectionProps } from './ImportHistorySection'
import { Button, EmptyState, SectionToggle } from './ui'

// ── Inline edit form shape ────────────────────────────────────────────────────
export type InlineTxnEditForm = {
  date: string; accountId: string; merchant: string; amount: string
  type: TransactionType; categoryId: string; notes: string; toAccountId: string
}

export interface TransactionsTabProps {
  // Core data
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  rules: TransactionRule[]
  period: Period
  // Computed
  filteredTxns: Transaction[]
  hasActiveFilters: boolean
  needsReviewTxnCount: number
  reviewableTxns: Transaction[]
  uncategorizedExpenseCount: number
  recurringCandidates: RecurringCandidate[]
  dismissedDupIds: Set<string>
  confirmedDupIds: Set<string>
  highlightedTxnId: string | null
  // Filter state
  txnFilter: string
  setTxnFilter: (value: string) => void
  txnSearch: string
  setTxnSearch: React.Dispatch<React.SetStateAction<string>>
  txnAccountFilter: string
  setTxnAccountFilter: React.Dispatch<React.SetStateAction<string>>
  txnCategoryFilter: string
  setTxnCategoryFilter: React.Dispatch<React.SetStateAction<string>>
  txnMonthFilter: string
  setTxnMonthFilter: React.Dispatch<React.SetStateAction<string>>
  availableTxnMonths: string[]
  // V51 — faceted counts shown in every dropdown / filter pill
  txnCountsByAccount: Record<string, number>
  txnCountsByCategory: Record<string, number>
  txnMonthsWithCounts: Array<{ ym: string; count: number }>
  txnPillCounts: Record<string, number>
  filteredTxnNet: number
  totalTxnCount: number
  // Collapsible sections
  txnListOpen: boolean
  setTxnListOpen: React.Dispatch<React.SetStateAction<boolean>>
  deleteFilteredConfirm: boolean
  setDeleteFilteredConfirm: React.Dispatch<React.SetStateAction<boolean>>
  // Inline edit state
  inlineTxnEditId: string | null
  inlineTxnEditForm: InlineTxnEditForm
  setInlineTxnEditId: React.Dispatch<React.SetStateAction<string | null>>
  setInlineTxnEditForm: React.Dispatch<React.SetStateAction<InlineTxnEditForm>>
  // Inline edit refs
  inlineTxnMerchantRef: React.RefObject<HTMLInputElement | null>
  inlineTxnAmountRef: React.RefObject<HTMLInputElement | null>
  inlineTxnTypeRef: React.RefObject<HTMLSelectElement | null>
  inlineTxnCategoryRef: React.RefObject<HTMLSelectElement | null>
  inlineTxnRowRef: React.MutableRefObject<HTMLTableRowElement | null>
  inlineEditBlurTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  txnDupWarning: boolean
  setTxnDupWarning: React.Dispatch<React.SetStateAction<boolean>>
  showUncategorizedGlow: boolean
  uncategorizedGlowSeenRef: React.MutableRefObject<boolean>
  // Actions
  setTxnWithHistory: (fn: (prev: Transaction[]) => Transaction[]) => void
  saveInlineTxnEdit: () => void
  cancelInlineTxnEdit: () => void
  softDeleteTxn: (id: string) => void
  showUndoableToast: (msg: string, undo: () => void) => void
  undoTxn: () => void
  // Sub-section props (pass-through)
  needsReviewProps: NeedsReviewSectionProps
  recurringSectionProps: RecurringSectionProps
  importHistoryProps: ImportHistorySectionProps
  // Slot: complex forms stay in App.tsx
  logTransactionSlot: React.ReactNode
  transactionRulesSlot: React.ReactNode
  // TXN_TYPES constant needed for inline edit options
  txnTypes: TransactionType[]
}

const TXN_TYPES: TransactionType[] = ['expense', 'income', 'transfer', 'credit card payment']

export function TransactionsTab({
  transactions, accounts, categories,
  period,
  filteredTxns, hasActiveFilters, needsReviewTxnCount,
  uncategorizedExpenseCount, recurringCandidates,
  dismissedDupIds, confirmedDupIds, highlightedTxnId,
  txnFilter, setTxnFilter, txnSearch, setTxnSearch,
  txnAccountFilter, setTxnAccountFilter, txnCategoryFilter, setTxnCategoryFilter,
  txnMonthFilter, setTxnMonthFilter, availableTxnMonths,
  txnCountsByAccount, txnCountsByCategory, txnMonthsWithCounts, txnPillCounts,
  filteredTxnNet, totalTxnCount,
  txnListOpen, setTxnListOpen,
  deleteFilteredConfirm, setDeleteFilteredConfirm,
  inlineTxnEditId, inlineTxnEditForm, setInlineTxnEditId, setInlineTxnEditForm,
  inlineTxnMerchantRef, inlineTxnAmountRef, inlineTxnTypeRef, inlineTxnCategoryRef,
  inlineTxnRowRef, inlineEditBlurTimerRef,
  txnDupWarning: _txnDupWarning, setTxnDupWarning,
  showUncategorizedGlow, uncategorizedGlowSeenRef,
  setTxnWithHistory, saveInlineTxnEdit, cancelInlineTxnEdit, softDeleteTxn,
  showUndoableToast, undoTxn,
  needsReviewProps, recurringSectionProps, importHistoryProps,
  logTransactionSlot, transactionRulesSlot,
}: TransactionsTabProps) {

  const scheduleBlurSave = () => {
    if (inlineEditBlurTimerRef.current) clearTimeout(inlineEditBlurTimerRef.current)
    inlineEditBlurTimerRef.current = setTimeout(saveInlineTxnEdit, 150)
  }
  const cancelBlurSave = () => {
    if (inlineEditBlurTimerRef.current) clearTimeout(inlineEditBlurTimerRef.current)
  }

  return (
    <section className="space-y-4 transition-all duration-300">
      {/* ── Stats bar ── */}
      {transactions.length > 0 && (() => {
        const range      = getPeriodDateRange(period)
        const periodSpend  = transactions
          .filter(tx => tx.date >= range.start && tx.date <= range.end && tx.type === 'expense')
          .reduce((s, tx) => s + tx.amount, 0)
        const rulesApplied = transactions.filter(tx => tx.appliedByRule).length
        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Needs Review',       value: needsReviewTxnCount,          alert: needsReviewTxnCount > 0 },
              { label: 'Period Spend',        value: currency(periodSpend),         alert: false },
              { label: 'Rules Applied',       value: rulesApplied,                  alert: false },
              { label: 'Total Transactions',  value: transactions.length,           alert: false },
            ].map(({ label, value, alert }) => (
              <div key={label} className="rounded-lg bg-slate-800 border border-slate-700/60 px-3 py-2.5">
                <div className="text-xs text-slate-400 mb-1">{label}</div>
                <div className={`text-xl font-bold ${alert ? 'text-amber-300' : 'text-slate-200'}`}>{value}</div>
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Needs Review + Uncategorized ── */}
      <NeedsReviewSection {...needsReviewProps} />

      {/* ── Subscriptions & Recurring ── */}
      <RecurringSection {...recurringSectionProps} />

      {/* ── Log Transaction slot (complex form stays in App.tsx) ── */}
      {logTransactionSlot}

      {/* ── Transaction list ── */}
      {transactions.length > 0 ? (
        <div className="rounded-2xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
          <SectionToggle
            title="Transactions"
            count={transactions.length}
            open={txnListOpen}
            onToggle={() => setTxnListOpen(v => !v)}
          />
          {txnListOpen && (
            <div className="px-4 pb-4">
              {/* Search + account/category filters */}
              <div className="flex flex-wrap gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Search merchant or notes…"
                  value={txnSearch}
                  onChange={e => setTxnSearch(e.target.value)}
                  className="flex-1 min-w-[160px] px-2.5 py-1 text-xs rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none placeholder:text-slate-600"
                />
                <select value={txnAccountFilter} onChange={e => setTxnAccountFilter(e.target.value)} className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-600 focus:outline-none">
                  <option value="">All accounts ({txnCountsByAccount.__all__ ?? 0})</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({txnCountsByAccount[a.id] ?? 0})</option>)}
                </select>
                <select value={txnCategoryFilter} onChange={e => setTxnCategoryFilter(e.target.value)} className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-600 focus:outline-none">
                  <option value="">All categories ({txnCountsByCategory.__all__ ?? 0})</option>
                  <option value="__none__">Uncategorized ({txnCountsByCategory.__none__ ?? 0})</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name} ({txnCountsByCategory[c.id] ?? 0})</option>)}
                </select>
                {/* V50/V51 — Month/year filter: gap-filled from oldest to newest, counts per month */}
                <select value={txnMonthFilter} onChange={e => setTxnMonthFilter(e.target.value)} className="text-xs px-2 py-1 rounded bg-slate-800 border border-slate-600 focus:outline-none" disabled={txnMonthsWithCounts.length === 0}>
                  <option value="">All dates ({txnMonthsWithCounts.reduce((s, m) => s + m.count, 0)})</option>
                  {(() => {
                    const byYear: Record<string, Array<{ ym: string; count: number }>> = {}
                    for (const item of txnMonthsWithCounts) {
                      const [y] = item.ym.split('-')
                      ;(byYear[y] ||= []).push(item)
                    }
                    const monthName = (ym: string) => {
                      const [, m] = ym.split('-')
                      const monthIdx = Math.max(0, Math.min(11, parseInt(m, 10) - 1))
                      return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][monthIdx]
                    }
                    return Object.keys(byYear)
                      .sort((a, b) => b.localeCompare(a))
                      .map(year => (
                        <optgroup key={year} label={year}>
                          {byYear[year].map(item => (
                            <option key={item.ym} value={item.ym}>{monthName(item.ym)} ({item.count})</option>
                          ))}
                        </optgroup>
                      ))
                  })()}
                </select>
                {(txnSearch || txnAccountFilter || txnCategoryFilter || txnMonthFilter) && (
                  <Button
                    tone="secondary"
                    size="xs"
                    onClick={() => { setTxnSearch(''); setTxnAccountFilter(''); setTxnCategoryFilter(''); setTxnMonthFilter('') }}
                  >Clear</Button>
                )}
              </div>

              {/* Filter pills */}
              <div className="flex gap-1.5 flex-wrap mb-3">
                {TXN_FILTER_OPTIONS.map(opt => {
                  const isNeedsReview   = opt.value === 'needs-review'
                  const isUncategorized = opt.value === 'uncategorized'
                  const count           = txnPillCounts[opt.value] ?? 0
                  const isActive        = txnFilter === opt.value
                  const glowRing        = isUncategorized && showUncategorizedGlow && !isActive
                  const badge           = ` (${count})`
                  return (
                    <button
                      key={opt.value}
                      onClick={() => {
                        setTxnFilter(opt.value)
                        if (isUncategorized) uncategorizedGlowSeenRef.current = true
                      }}
                      className={[
                        'rounded-full px-3 py-0.5 text-xs transition-colors',
                        isActive ? (isNeedsReview ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white') : 'bg-slate-700 hover:bg-slate-600 text-slate-300',
                        glowRing ? 'ring-1 ring-amber-400/70 shadow-[0_0_6px_rgba(251,191,36,0.22)]' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {opt.label}{badge}
                    </button>
                  )
                })}
              </div>

              {/* Results summary + delete filtered action */}
              {(hasActiveFilters || transactions.length > 0) && (
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <span className="text-xs text-slate-500">
                    {hasActiveFilters
                      ? <>Showing <span className="text-slate-300 font-medium">{filteredTxns.length}</span> of {totalTxnCount} transaction{totalTxnCount !== 1 ? 's' : ''}
                          {filteredTxns.length > 0 && (
                            <> · Net: <span className={`font-medium font-num ${filteredTxnNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {filteredTxnNet >= 0 ? '+' : ''}{currency(filteredTxnNet)}
                            </span></>
                          )}
                        </>
                      : `Showing all ${totalTxnCount} transaction${totalTxnCount !== 1 ? 's' : ''}`
                    }
                  </span>
                  {hasActiveFilters && filteredTxns.length > 0 && (
                    deleteFilteredConfirm ? (
                      <div className="flex items-center gap-2 text-xs text-red-300">
                        <span>Delete {filteredTxns.length} filtered transaction{filteredTxns.length !== 1 ? 's' : ''}?</span>
                        <Button
                          tone="danger"
                          size="xs"
                          onClick={() => {
                            const ids = new Set(filteredTxns.map(t => t.id))
                            setTxnWithHistory(prev => prev.filter(t => !ids.has(t.id)))
                            setDeleteFilteredConfirm(false)
                            showUndoableToast(`Deleted ${ids.size} transaction${ids.size !== 1 ? 's' : ''}`, undoTxn)
                          }}
                        >Delete</Button>
                        <Button tone="ghost" size="xs" onClick={() => setDeleteFilteredConfirm(false)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button
                        tone="ghost"
                        size="xs"
                        className="text-red-400/70 hover:text-red-300"
                        onClick={() => setDeleteFilteredConfirm(true)}
                      >Delete {filteredTxns.length} filtered result{filteredTxns.length !== 1 ? 's' : ''}…</Button>
                    )
                  )}
                </div>
              )}

              {/* Transaction table */}
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-1.5 pr-3 font-medium whitespace-nowrap">Date</th>
                      <th className="pb-1.5 pr-3 font-medium">Account</th>
                      <th className="pb-1.5 pr-3 font-medium">Merchant</th>
                      <th className="pb-1.5 pr-3 font-medium">Type</th>
                      <th className="pb-1.5 pr-3 font-medium">Category</th>
                      <th className="pb-1.5 pr-3 font-medium text-right whitespace-nowrap">Amount</th>
                      <th className="pb-1.5 pr-3 font-medium hidden sm:table-cell">Notes</th>
                      <th className="pb-1.5 sticky right-0 bg-slate-800" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxns.map(tx => {
                      const acct        = accounts.find(a => a.id === tx.accountId)
                      const cat         = categories.find(c => c.id === tx.categoryId)
                      const isInlineEdit = inlineTxnEditId === tx.id

                      if (isInlineEdit) {
                        return (
                          <tr
                            key={tx.id}
                            ref={el => { inlineTxnRowRef.current = el }}
                            className="border-b border-slate-700 bg-blue-950/20"
                          >
                            <td className="py-1.5 pr-2">
                              <input
                                type="date"
                                className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                value={inlineTxnEditForm.date}
                                onChange={e => { setInlineTxnEditForm(v => ({ ...v, date: e.target.value })); setTxnDupWarning(false) }}
                                onFocus={cancelBlurSave}
                                onBlur={scheduleBlurSave}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() } if (e.key === 'Escape') cancelInlineTxnEdit() }}
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <select
                                className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                value={inlineTxnEditForm.accountId}
                                onChange={e => setInlineTxnEditForm(v => ({ ...v, accountId: e.target.value }))}
                                onFocus={cancelBlurSave}
                                onBlur={scheduleBlurSave}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() } if (e.key === 'Escape') cancelInlineTxnEdit() }}
                              >
                                <option value="">Account…</option>
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                ref={inlineTxnMerchantRef}
                                className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                value={inlineTxnEditForm.merchant}
                                onFocus={e => { e.target.select(); cancelBlurSave() }}
                                onBlur={scheduleBlurSave}
                                onChange={e => { setInlineTxnEditForm(v => ({ ...v, merchant: e.target.value })); setTxnDupWarning(false) }}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() } if (e.key === 'Escape') cancelInlineTxnEdit() }}
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <select
                                ref={inlineTxnTypeRef}
                                className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                value={inlineTxnEditForm.type}
                                onChange={e => setInlineTxnEditForm(v => ({ ...v, type: e.target.value as TransactionType }))}
                                onFocus={cancelBlurSave}
                                onBlur={scheduleBlurSave}
                                onKeyDown={e => {
                                  if (e.key === 'ArrowLeft')  { e.preventDefault(); inlineTxnMerchantRef.current?.focus(); inlineTxnMerchantRef.current?.select(); return }
                                  if (e.key === 'ArrowRight') { e.preventDefault(); inlineTxnCategoryRef.current?.focus(); return }
                                  if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() }
                                  if (e.key === 'Escape') cancelInlineTxnEdit()
                                }}
                              >
                                {TXN_TYPES.map(t => <option key={t} value={t}>{TXN_TYPE_LABELS[t]}</option>)}
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <select
                                ref={inlineTxnCategoryRef}
                                className="w-full px-1 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                value={inlineTxnEditForm.categoryId}
                                onChange={e => setInlineTxnEditForm(v => ({ ...v, categoryId: e.target.value }))}
                                onFocus={cancelBlurSave}
                                onBlur={scheduleBlurSave}
                                onKeyDown={e => {
                                  if (e.key === 'ArrowLeft')  { e.preventDefault(); inlineTxnTypeRef.current?.focus(); return }
                                  if (e.key === 'ArrowRight') { e.preventDefault(); inlineTxnAmountRef.current?.focus(); inlineTxnAmountRef.current?.select(); return }
                                  if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() }
                                  if (e.key === 'Escape') cancelInlineTxnEdit()
                                }}
                              >
                                <option value="">— none —</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                ref={inlineTxnAmountRef}
                                type="text"
                                inputMode="decimal"
                                className="w-24 px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none text-right"
                                value={inlineTxnEditForm.amount}
                                onFocus={e => { e.target.select(); cancelBlurSave() }}
                                onBlur={scheduleBlurSave}
                                onChange={e => {
                                  const raw = e.target.value.replace(/[^0-9.]/g, '')
                                  const parts = raw.split('.')
                                  const cleaned = parts.length > 2 ? parts[0] + '.' + parts.slice(1).join('') : raw
                                  setInlineTxnEditForm(v => ({ ...v, amount: cleaned }))
                                  setTxnDupWarning(false)
                                }}
                                onKeyDown={e => {
                                  if (['e', 'E', '+', '-'].includes(e.key)) { e.preventDefault(); return }
                                  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                    e.preventDefault()
                                    const cur = parseFloat(inlineTxnEditForm.amount) || 0
                                    const next = e.key === 'ArrowUp' ? cur + 25 : Math.max(0, cur - 25)
                                    setInlineTxnEditForm(v => ({ ...v, amount: next === 0 ? '' : String(next) }))
                                    setTxnDupWarning(false)
                                    return
                                  }
                                  if (e.key === 'ArrowLeft') { e.preventDefault(); inlineTxnCategoryRef.current?.focus(); return }
                                  if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() }
                                  if (e.key === 'Escape') cancelInlineTxnEdit()
                                }}
                              />
                            </td>
                            <td className="py-1.5 pr-2">
                              <input
                                className="w-full px-1.5 py-1 text-xs rounded bg-slate-700 border border-blue-500 focus:outline-none"
                                value={inlineTxnEditForm.notes}
                                onFocus={cancelBlurSave}
                                onBlur={scheduleBlurSave}
                                onChange={e => setInlineTxnEditForm(v => ({ ...v, notes: e.target.value }))}
                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveInlineTxnEdit() } if (e.key === 'Escape') cancelInlineTxnEdit() }}
                              />
                            </td>
                            <td className="py-1.5 whitespace-nowrap space-x-2">
                              <Button tone="primary" size="xs" onMouseDown={cancelBlurSave} onClick={saveInlineTxnEdit}>Save</Button>
                              <Button tone="ghost" size="xs" onMouseDown={cancelBlurSave} onClick={cancelInlineTxnEdit}>Cancel</Button>
                            </td>
                          </tr>
                        )
                      }

                      // Normal display row
                      const txTypeColor  = tx.type === 'income' ? 'bg-green-900/50 text-green-300' : tx.type === 'transfer' ? 'bg-blue-900/50 text-blue-300' : tx.type === 'credit card payment' ? 'bg-purple-900/50 text-purple-300' : 'bg-slate-700 text-slate-300'
                      const txIsDup      = transactions.some(o => o.id !== tx.id && o.merchant.toLowerCase() === tx.merchant.toLowerCase() && o.amount === tx.amount && o.date === tx.date)
                      const txIsKeptDup  = confirmedDupIds.has(tx.id)
                      const txIsImported = !!tx.batchId
                      const txReview     = txNeedsReview(tx, transactions, dismissedDupIds)
                      const txRecurring  = recurringCandidates.find(c => c.txnIds.includes(tx.id))
                      return (
                        <tr key={tx.id} className={`border-b border-slate-800 transition-colors duration-300 ${highlightedTxnId === tx.id ? 'bg-blue-600/20' : txReview ? 'bg-amber-950/10' : 'hover:bg-slate-800/40'}`}>
                          <td className="py-2 pr-3 text-slate-300 text-xs whitespace-nowrap">{tx.date}</td>
                          <td className="py-2 pr-3 text-slate-400 text-xs">{acct?.name ?? '—'}</td>
                          <td className="py-2 pr-3 font-medium">
                            {normalizeMerchant(tx.merchant)}
                            {txIsImported && <span className="ml-1.5 text-[9px] text-blue-400 bg-blue-900/30 border border-blue-700/30 px-1 py-0.5 rounded">Imported</span>}
                            {txIsKeptDup ? (
                              <span className="ml-1.5 text-[9px] text-slate-400 bg-slate-700/60 border border-slate-600/40 px-1 py-0.5 rounded">Kept Both</span>
                            ) : txIsDup ? (
                              <span className="ml-1.5 text-[9px] text-amber-400 bg-amber-900/30 border border-amber-700/30 px-1 py-0.5 rounded">Duplicate?</span>
                            ) : null}
                            {txRecurring && <span className="ml-1.5 text-[9px] text-teal-400 bg-teal-900/30 border border-teal-700/30 px-1 py-0.5 rounded capitalize">{txRecurring.cadence}</span>}
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`text-xs px-1.5 py-0.5 rounded ${txTypeColor}`}>{TXN_TYPE_LABELS[tx.type]}</span>
                          </td>
                          <td className="py-2 pr-3 text-slate-400 text-xs">
                            {cat?.name ?? <span className={tx.type === 'expense' ? 'text-amber-400/70' : 'text-slate-600'}>—</span>}
                            {tx.appliedByRule && <span className="ml-1.5 text-[9px] text-indigo-400 bg-indigo-900/40 border border-indigo-700/40 px-1 py-0.5 rounded">Rule Applied</span>}
                            {txReview && !txIsDup && !tx.appliedByRule && <span className="ml-1.5 text-[9px] text-amber-400 bg-amber-900/30 border border-amber-700/30 px-1 py-0.5 rounded">Review</span>}
                          </td>
                          <td className={`py-2 pr-3 text-right font-semibold ${tx.type === 'income' ? 'text-green-400' : 'text-slate-100'}`}>
                            {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{currency(tx.amount)}
                          </td>
                          <td className="py-2 pr-3 text-slate-500 text-xs max-w-[100px] truncate hidden sm:table-cell">{tx.notes ?? '—'}</td>
                          <td className="py-2 whitespace-nowrap space-x-2">
                            <Button tone="ghost" size="xs" className="text-blue-400 hover:text-blue-300" onClick={() => {
                              setInlineTxnEditId(tx.id)
                              setInlineTxnEditForm({ date: tx.date, accountId: tx.accountId, merchant: tx.merchant, amount: String(tx.amount), type: tx.type, categoryId: tx.categoryId ?? '', notes: tx.notes ?? '', toAccountId: tx.toAccountId ?? '' })
                              setTxnDupWarning(false)
                              setTimeout(() => { inlineTxnAmountRef.current?.focus(); inlineTxnAmountRef.current?.select() }, 0)
                            }}>Edit</Button>
                            <Button tone="ghost" size="xs" className="text-red-400 hover:text-red-300" onClick={() => softDeleteTxn(tx.id)}>Delete</Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {/* V51 — Empty state when filters yield zero results (but data exists) */}
                {filteredTxns.length === 0 && hasActiveFilters && (
                  <div className="px-4 py-8 text-center">
                    <p className="text-sm text-slate-300 font-medium">No transactions match these filters</p>
                    <p className="text-xs text-slate-500 mt-1 mb-3">Try removing one or more to see results.</p>
                    <Button tone="secondary" size="sm" onClick={() => {
                      setTxnSearch('')
                      setTxnAccountFilter('')
                      setTxnCategoryFilter('')
                      setTxnMonthFilter('')
                      setTxnFilter('all')
                    }}>Clear all filters</Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          title="No transactions yet"
          description={accounts.length === 0
            ? 'Add an account first, then log your first transaction above.'
            : 'Log your first transaction above. Use Generate Sample to try it out.'}
        />
      )}

      {/* ── Import History + Data Integrity ── */}
      <ImportHistorySection {...importHistoryProps} />

      {/* ── Transaction Rules slot (complex form stays in App.tsx) ── */}
      {transactionRulesSlot}
    </section>
  )
}
