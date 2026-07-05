import React, { useMemo } from 'react'
import type { Transaction, Category, Account, TransactionRule } from '../types'
import { currency } from '../utils/formatting'
import { normalizeMerchant } from '../utils/merchantNormalization'
import { txConfidence } from '../utils/transactionHelpers'
import { TXN_TYPE_LABELS } from '../utils/transactionHelpers'
import { assignTransactionCategory, createMerchantRuleSuggestionForTransaction, createRulesFromSuggestionAction } from '../utils/actions'
import { buildDuplicateIndex, hasDuplicateInIndex, hasDuplicateTransaction } from '../utils/duplicateDetection'
import { Button, SectionToggle } from './ui'

type RuleSuggestion = { merchants: string[]; categoryId: string; txIds: string[] }

export interface NeedsReviewSectionProps {
  // Data
  reviewableTxns: Transaction[]
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
  rules: TransactionRule[]
  // Open state
  reviewOpen: boolean
  setReviewOpen: React.Dispatch<React.SetStateAction<boolean>>
  // Selection
  selectedTxnIds: Set<string>
  setSelectedTxnIds: React.Dispatch<React.SetStateAction<Set<string>>>
  lastReviewSelectIdxRef: React.MutableRefObject<number>
  // Duplicate resolution
  confirmedDupIds: Set<string>
  setDismissedDupIds: React.Dispatch<React.SetStateAction<Set<string>>>
  setConfirmedDupIds: React.Dispatch<React.SetStateAction<Set<string>>>
  deleteDupsConfirm: boolean
  setDeleteDupsConfirm: React.Dispatch<React.SetStateAction<boolean>>
  // Bulk assignment
  bulkCategoryId: string
  setBulkCategoryId: React.Dispatch<React.SetStateAction<string>>
  bulkAssign: () => void
  // Rule suggestion
  ruleSuggestion: RuleSuggestion | null
  setRuleSuggestion: React.Dispatch<React.SetStateAction<RuleSuggestion | null>>
  // Actions
  setTxnWithHistory: (fn: (prev: Transaction[]) => Transaction[]) => void
  setRulesWithHistory: (fn: (prev: TransactionRule[]) => TransactionRule[]) => void
  updateCategoryMemory: (merchant: string, catId: string) => void
  softDeleteTxn: (id: string) => void
  setTxnFilter: (v: string) => void
  showToast: (msg: string) => void
  // Uncategorized section
  uncatOpen: boolean
  setUncatOpen: React.Dispatch<React.SetStateAction<boolean>>
  uncategorizedExpenseCount: number
  setInlineTxnEditId: React.Dispatch<React.SetStateAction<string | null>>
  setInlineTxnEditForm: (v: { date: string; accountId: string; merchant: string; amount: string; type: string; categoryId: string; notes: string; toAccountId: string }) => void
  setTxnDupWarning: React.Dispatch<React.SetStateAction<boolean>>
  inlineTxnAmountRef: React.RefObject<HTMLInputElement | null>
}

export function NeedsReviewSection({
  reviewableTxns, transactions, accounts, categories, rules,
  reviewOpen, setReviewOpen,
  selectedTxnIds, setSelectedTxnIds, lastReviewSelectIdxRef,
  confirmedDupIds, setDismissedDupIds, setConfirmedDupIds,
  deleteDupsConfirm, setDeleteDupsConfirm,
  bulkCategoryId, setBulkCategoryId, bulkAssign,
  ruleSuggestion, setRuleSuggestion,
  setTxnWithHistory, setRulesWithHistory, updateCategoryMemory, softDeleteTxn,
  setTxnFilter, showToast,
  uncatOpen, setUncatOpen, uncategorizedExpenseCount,
  setInlineTxnEditId, setInlineTxnEditForm, setTxnDupWarning, inlineTxnAmountRef,
}: NeedsReviewSectionProps) {
  // O(n) once per change instead of an O(n) scan per reviewable transaction.
  // Two indexes because the count ignores resolution state while the
  // delete-duplicates flow excludes confirmed ("kept both") transactions.
  const dupIndexPlain = useMemo(
    () => buildDuplicateIndex(transactions, { includeAccount: false }),
    [transactions]
  )
  const dupIndexConfirmed = useMemo(
    () => buildDuplicateIndex(transactions, { confirmedDupIds, includeAccount: false }),
    [transactions, confirmedDupIds]
  )

  if (reviewableTxns.length === 0 && uncategorizedExpenseCount === 0) return null

  const dupCount = reviewableTxns.filter(tx =>
    hasDuplicateInIndex(tx, dupIndexPlain, { includeAccount: false })
  ).length

  return (
    <>
      {/* ── Needs Review panel ── */}
      {reviewableTxns.length > 0 && (
        <div className="rounded-2xl border border-amber-600/30 bg-amber-950/10 overflow-hidden">
          <SectionToggle
            title="Needs Review"
            count={reviewableTxns.length}
            meta={`${reviewableTxns.filter(tx => !tx.categoryId && tx.type === 'expense').length} uncategorized${dupCount > 0 ? `, ${dupCount} possible duplicate${dupCount !== 1 ? 's' : ''}` : ''}`}
            open={reviewOpen}
            onToggle={() => setReviewOpen(v => !v)}
            tone="amber"
            actions={
              <>
                {selectedTxnIds.size > 0 && (
                  <Button
                    tone="secondary"
                    size="xs"
                    onClick={e => { e.stopPropagation(); setSelectedTxnIds(new Set()) }}
                  >Clear selection ({selectedTxnIds.size})</Button>
                )}
                {reviewableTxns.some(tx =>
                  hasDuplicateInIndex(tx, dupIndexConfirmed, { confirmedDupIds, includeAccount: false })
                ) && (
                  <Button
                    tone="danger"
                    size="xs"
                    onClick={e => { e.stopPropagation(); setDeleteDupsConfirm(true) }}
                  >Delete unresolved duplicates</Button>
                )}
              </>
            }
          />

          {reviewOpen && (
            <div className="border-t border-amber-700/20 px-4 pb-4 pt-3 space-y-2">
              {/* Delete duplicates confirmation */}
              {deleteDupsConfirm && (() => {
                const dupTxns = reviewableTxns.filter(tx =>
                  hasDuplicateInIndex(tx, dupIndexConfirmed, { confirmedDupIds, includeAccount: false })
                )
                return (
                  <div className="mb-2 rounded-lg bg-red-900/20 border border-red-700/40 px-3 py-2.5 text-xs text-red-300 flex items-center justify-between gap-3">
                    <span>Delete {dupTxns.length} unresolved duplicate transaction{dupTxns.length !== 1 ? 's' : ''}? This is undoable.</span>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        tone="danger"
                        size="xs"
                        onClick={() => {
                          const ids = new Set(dupTxns.map(t => t.id))
                          setTxnWithHistory(prev => prev.filter(tx => !ids.has(tx.id)))
                          setDeleteDupsConfirm(false)
                          showToast(`Deleted ${dupTxns.length} duplicate transaction${dupTxns.length !== 1 ? 's' : ''}`)
                        }}
                      >Delete</Button>
                      <Button tone="ghost" size="xs" onClick={() => setDeleteDupsConfirm(false)}>Cancel</Button>
                    </div>
                  </div>
                )
              })()}

              {/* Bulk action bar */}
              {selectedTxnIds.size > 0 && (
                <div className="flex items-center gap-2 mb-3 p-2 rounded-lg bg-blue-900/20 border border-blue-700/30">
                  <span className="text-xs text-blue-300 font-medium">{selectedTxnIds.size} selected</span>
                  <select
                    value={bulkCategoryId}
                    onChange={e => setBulkCategoryId(e.target.value)}
                    className="flex-1 text-xs px-2 py-1 rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">Assign category…</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <Button
                    onClick={bulkAssign}
                    disabled={!bulkCategoryId}
                    tone="primary"
                    size="xs"
                  >Apply</Button>
                  <Button tone="ghost" size="xs" onClick={() => setSelectedTxnIds(new Set())}>Clear</Button>
                </div>
              )}

              {/* Rule suggestion prompt */}
              {ruleSuggestion && (
                <div className="flex items-center gap-3 mb-2 p-2.5 rounded-lg bg-indigo-900/20 border border-indigo-700/30 text-xs">
                  <span className="text-indigo-200 flex-1">
                    {ruleSuggestion.merchants.length === 1
                      ? `Auto-categorize "${ruleSuggestion.merchants[0]}" → ${categories.find(c => c.id === ruleSuggestion.categoryId)?.name} in future?`
                      : `Create rules for ${ruleSuggestion.merchants.slice(0, 3).join(', ')}${ruleSuggestion.merchants.length > 3 ? ` +${ruleSuggestion.merchants.length - 3} more` : ''} → ${categories.find(c => c.id === ruleSuggestion.categoryId)?.name}?`
                    }
                  </span>
                  <Button
                    tone="primary"
                    size="xs"
                    className="whitespace-nowrap"
                    onClick={() => {
                      setRulesWithHistory(prev => createRulesFromSuggestionAction(prev, ruleSuggestion, new Date().toISOString()))
                      showToast(`Created ${ruleSuggestion.merchants.length} rule${ruleSuggestion.merchants.length !== 1 ? 's' : ''}`)
                      setRuleSuggestion(null)
                    }}
                  >Yes, create</Button>
                  <Button tone="ghost" size="xs" onClick={() => setRuleSuggestion(null)}>Not now</Button>
                </div>
              )}

              {/* Review items */}
              {reviewableTxns.slice(0, 15).map((tx, rowIdx) => {
                const acct       = accounts.find(a => a.id === tx.accountId)
                const cat        = categories.find(c => c.id === tx.categoryId)
                const isSelected = selectedTxnIds.has(tx.id)
                const confidence = txConfidence(tx, transactions)
                const isDup      = hasDuplicateInIndex(tx, dupIndexPlain, { includeAccount: false })
                const isConfirmedDup = confirmedDupIds.has(tx.id)
                return (
                  <div
                    key={tx.id}
                    className={`rounded-lg border px-3 py-2.5 flex items-center gap-3 transition-colors cursor-pointer ${isSelected ? 'border-blue-500/60 bg-blue-900/15' : 'border-slate-700/50 bg-slate-800/40 hover:bg-slate-800/60'}`}
                    onClick={e => {
                      if ((e.target as HTMLElement).closest('button,select,input')) return
                      if (e.shiftKey && lastReviewSelectIdxRef.current >= 0) {
                        const lo = Math.min(lastReviewSelectIdxRef.current, rowIdx)
                        const hi = Math.max(lastReviewSelectIdxRef.current, rowIdx)
                        setSelectedTxnIds(prev => {
                          const next = new Set(prev)
                          reviewableTxns.slice(lo, hi + 1).forEach(t => next.add(t.id))
                          return next
                        })
                      } else {
                        setSelectedTxnIds(prev => {
                          const next = new Set(prev)
                          next.has(tx.id) ? next.delete(tx.id) : next.add(tx.id)
                          return next
                        })
                        lastReviewSelectIdxRef.current = rowIdx
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={e => {
                        e.stopPropagation()
                        setSelectedTxnIds(prev => {
                          const next = new Set(prev)
                          e.target.checked ? next.add(tx.id) : next.delete(tx.id)
                          return next
                        })
                        lastReviewSelectIdxRef.current = rowIdx
                      }}
                      className="accent-blue-500 shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-sm truncate">{normalizeMerchant(tx.merchant)}</span>
                        {isConfirmedDup ? (
                          <span className="text-[10px] bg-slate-700 text-slate-400 border border-slate-600/40 px-1.5 py-0.5 rounded shrink-0">Kept Both</span>
                        ) : isDup ? (
                          <span className="text-[10px] bg-amber-900/50 text-amber-300 border border-amber-700/40 px-1.5 py-0.5 rounded shrink-0">Duplicate?</span>
                        ) : null}
                        {!tx.categoryId && tx.type === 'expense' && (
                          <span className="text-[10px] bg-slate-700/70 text-slate-400 border border-slate-600/40 px-1.5 py-0.5 rounded shrink-0">No Category</span>
                        )}
                        {confidence === 'low' && !isDup && (
                          <span className="text-[10px] bg-red-900/30 text-red-400 border border-red-700/30 px-1.5 py-0.5 rounded shrink-0">New Merchant</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{tx.date} · {acct?.name ?? '—'} · {TXN_TYPE_LABELS[tx.type]}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                      <span className={`text-sm font-semibold ${tx.type === 'income' ? 'text-green-400' : 'text-slate-200'}`}>
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{currency(tx.amount)}
                      </span>
                      {isDup && !isConfirmedDup && (
                        <div className="flex flex-col gap-1">
                          <button
                            className="text-[10px] text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded transition-colors whitespace-nowrap"
                            onClick={() => {
                              const partnerIds = transactions.filter(o =>
                                hasDuplicateTransaction(tx, [o], { includeAccount: false })
                              ).map(o => o.id)
                              const allIds = [tx.id, ...partnerIds]
                              setDismissedDupIds(prev => new Set([...prev, ...allIds]))
                              setConfirmedDupIds(prev => new Set([...prev, ...allIds]))
                            }}
                          >Keep Both</button>
                          <button
                            className="text-[10px] text-red-400 hover:text-red-300 bg-red-900/20 hover:bg-red-900/40 border border-red-700/30 px-2 py-0.5 rounded transition-colors whitespace-nowrap"
                            onClick={() => softDeleteTxn(tx.id)}
                          >Delete</button>
                        </div>
                      )}
                      {tx.type === 'expense' && (
                        <select
                          value={cat?.id ?? ''}
                          onChange={e => {
                            const newCatId = e.target.value
                            if (!newCatId) return
                            setTxnWithHistory(prev => assignTransactionCategory(prev, tx.id, newCatId))
                            updateCategoryMemory(tx.merchant, newCatId)
                            const suggestion = createMerchantRuleSuggestionForTransaction(tx.merchant, newCatId, tx.id, rules)
                            if (suggestion) setRuleSuggestion(suggestion)
                          }}
                          className="text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none max-w-[110px]"
                        >
                          <option value="">Assign…</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      )}
                    </div>
                  </div>
                )
              })}
              {reviewableTxns.length > 15 && (
                <p className="text-xs text-slate-500 text-center pt-1">
                  Showing 15 of {reviewableTxns.length} — use{' '}
                  <button className="underline text-slate-400 hover:text-slate-200" onClick={() => setTxnFilter('needs-review')}>
                    Needs Review filter
                  </button>{' '}
                  to see all.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Uncategorized Expenses ── */}
      {uncategorizedExpenseCount > 0 && (
        <div className="rounded-2xl border border-amber-600/20 bg-slate-800/20 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-slate-700/20 transition-colors"
            onClick={() => setUncatOpen(v => !v)}
          >
            <span className="text-lg font-semibold">Uncategorized Expenses ({uncategorizedExpenseCount})</span>
            <span className="text-slate-500 text-xs">{uncatOpen ? '▲' : '▼'}</span>
          </button>
          {uncatOpen && (
            <div className="px-4 pb-4">
              <p className="text-xs text-slate-400 mb-3">
                Only expenses need budget categories. Transfers, income, and credit card payments do not count toward Budget Actuals.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-400 border-b border-slate-700">
                      <th className="pb-1.5 pr-3 font-medium">Date</th>
                      <th className="pb-1.5 pr-3 font-medium">Account</th>
                      <th className="pb-1.5 pr-3 font-medium">Merchant</th>
                      <th className="pb-1.5 pr-3 font-medium">Type</th>
                      <th className="pb-1.5 pr-3 font-medium text-right">Amount</th>
                      <th className="pb-1.5 pr-3 font-medium">Quick Assign</th>
                      <th className="pb-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {[...transactions]
                      .filter(tx => !tx.categoryId && tx.type === 'expense')
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map(tx => {
                        const acct = accounts.find(a => a.id === tx.accountId)
                        const txTypeColor = 'bg-slate-700 text-slate-300'
                        return (
                          <tr key={tx.id} className="border-b border-slate-800 hover:bg-amber-900/10 transition-colors">
                            <td className="py-2 pr-3 text-slate-300 text-xs whitespace-nowrap">{tx.date}</td>
                            <td className="py-2 pr-3 text-slate-400 text-xs">{acct?.name ?? '—'}</td>
                            <td className="py-2 pr-3 font-medium">{normalizeMerchant(tx.merchant)}</td>
                            <td className="py-2 pr-3">
                              <span className={`text-xs px-1.5 py-0.5 rounded ${txTypeColor}`}>{TXN_TYPE_LABELS[tx.type]}</span>
                            </td>
                            <td className="py-2 pr-3 text-right font-semibold text-slate-100">
                              −{currency(tx.amount)}
                            </td>
                            <td className="py-2 pr-3">
                              <select
                                className="px-2 py-1 text-xs rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                                value=""
                                onChange={e => {
                                  if (!e.target.value) return
                                  setTxnWithHistory(prev => prev.map(x =>
                                    x.id === tx.id ? { ...x, categoryId: e.target.value } : x
                                  ))
                                }}
                              >
                                <option value="">Assign category…</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </td>
                            <td className="py-2 whitespace-nowrap space-x-2">
                              <button
                                className="text-blue-400 hover:text-blue-300 text-xs"
                                onClick={() => {
                                  setInlineTxnEditId(tx.id)
                                  setInlineTxnEditForm({
                                    date: tx.date, accountId: tx.accountId, merchant: tx.merchant,
                                    amount: String(tx.amount), type: tx.type,
                                    categoryId: tx.categoryId ?? '', notes: tx.notes ?? '', toAccountId: tx.toAccountId ?? '',
                                  })
                                  setTxnFilter('all')
                                  setTxnDupWarning(false)
                                  setTimeout(() => { inlineTxnAmountRef.current?.focus(); inlineTxnAmountRef.current?.select() }, 0)
                                }}
                              >Edit</button>
                              <button className="text-red-400 hover:text-red-300 text-xs" onClick={() => softDeleteTxn(tx.id)}>Delete</button>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
