import React, { useState } from 'react'
import type { Transaction, Account, ImportBatch, ImportBatchRow } from '../types'
import { currency } from '../utils/formatting'
import { Button, Card, SectionToggle } from './ui'

export interface ImportHistorySectionProps {
  importBatches: ImportBatch[]
  transactions: Transaction[]
  accounts: Account[]
  reviewableTxns: Transaction[]
  deletedTxns: Transaction[]
  csvShowHistory: boolean
  setCsvShowHistory: React.Dispatch<React.SetStateAction<boolean>>
  batchToDelete: string | null
  setBatchToDelete: React.Dispatch<React.SetStateAction<string | null>>
  deleteImportBatch: (id: string) => void
  setImportBatches: React.Dispatch<React.SetStateAction<ImportBatch[]>>
  showRecentlyDeleted: boolean
  setShowRecentlyDeleted: React.Dispatch<React.SetStateAction<boolean>>
  restoreDeletedTxn: (id: string) => void
  permanentlyDeleteTxn: (id: string) => void
}

export function ImportHistorySection({
  importBatches, transactions, accounts,
  reviewableTxns, deletedTxns,
  csvShowHistory, setCsvShowHistory,
  batchToDelete, setBatchToDelete, deleteImportBatch, setImportBatches,
  showRecentlyDeleted, setShowRecentlyDeleted,
  restoreDeletedTxn, permanentlyDeleteTxn,
}: ImportHistorySectionProps) {
  const [viewingBatchId, setViewingBatchId] = useState<string | null>(null)
  return (
    <>
      {/* ── Import History ── */}
      {importBatches.length > 0 && (
        <Card title="Import History" noHover>
          <SectionToggle
            title="Import History"
            count={importBatches.length}
            open={csvShowHistory}
            onToggle={() => setCsvShowHistory(v => !v)}
          />
          {csvShowHistory && (
            <div className="mt-3 overflow-x-auto">
              {batchToDelete && (() => {
                const b = importBatches.find(x => x.id === batchToDelete)
                const count = transactions.filter(tx => tx.batchId === batchToDelete).length
                return (
                  <div className="mb-3 rounded-lg bg-red-900/20 border border-red-700/40 px-3 py-2.5 text-xs text-red-300 flex items-center justify-between gap-3">
                    <span>Delete {count} transaction{count !== 1 ? 's' : ''} from &quot;{b?.accountName}&quot; ({b?.importMonth})? This action can be undone.</span>
                    <div className="flex gap-2 shrink-0">
                      <Button tone="danger" size="xs" onClick={() => deleteImportBatch(batchToDelete)}>Delete</Button>
                      <Button tone="ghost" size="xs" onClick={() => setBatchToDelete(null)}>Cancel</Button>
                    </div>
                  </div>
                )
              })()}
              <table className="w-full text-xs min-w-[540px]">
                <thead>
                  <tr className="text-left text-slate-400 border-b border-slate-700">
                    <th className="pb-1.5 pr-3 font-medium">Account</th>
                    <th className="pb-1.5 pr-3 font-medium">Month</th>
                    <th className="pb-1.5 pr-3 font-medium">Source</th>
                    <th className="pb-1.5 pr-3 font-medium text-right">Imported</th>
                    <th className="pb-1.5 pr-3 font-medium text-right">Skipped</th>
                    <th className="pb-1.5 pr-3 font-medium">Date</th>
                    <th className="pb-1.5 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {importBatches.map(b => {
                    const isViewing = viewingBatchId === b.id
                    // Fallback: derive rows from live transactions when no snapshot saved
                    const snapshotRows: ImportBatchRow[] = b.rowsSnapshot ??
                      transactions
                        .filter(t => (t.batchId ?? t.importBatchId) === b.id)
                        .map(t => ({ date: t.date, merchant: t.merchant, amount: t.amount, type: t.type, notes: t.notes }))
                    return (
                      <React.Fragment key={b.id}>
                        <tr className="border-b border-slate-800 hover:bg-slate-800/30">
                          <td className="py-1.5 pr-3 text-slate-300">{b.accountName}</td>
                          <td className="py-1.5 pr-3 text-slate-400">{b.importMonth}</td>
                          <td className="py-1.5 pr-3 text-slate-500 uppercase text-[10px]">{b.importSource ?? 'csv'}</td>
                          <td className="py-1.5 pr-3 text-right text-green-400 font-medium">{b.importedCount}</td>
                          <td className="py-1.5 pr-3 text-right text-amber-400">{b.skippedCount > 0 ? b.skippedCount : '—'}</td>
                          <td className="py-1.5 pr-3 text-slate-500 text-xs">{new Date(b.createdAt).toLocaleString()}</td>
                          <td className="py-1.5 flex items-center gap-2">
                            {snapshotRows.length > 0 && (
                              <Button
                                tone="ghost"
                                size="xs"
                                className={isViewing ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'}
                                onClick={() => setViewingBatchId(isViewing ? null : b.id)}
                              >{isViewing ? 'Hide' : 'View'}</Button>
                            )}
                            <Button
                              tone="ghost"
                              size="xs"
                              className="text-red-400/70 hover:text-red-300"
                              onClick={() => setBatchToDelete(b.id)}
                              title="Delete this import and its transactions"
                            >Delete</Button>
                          </td>
                        </tr>
                        {/* V55 — Expanded snapshot / transaction view */}
                        {isViewing && (
                          <tr className="bg-slate-900/60 border-b border-slate-700">
                            <td colSpan={7} className="px-4 py-3">
                              <p className="text-[10px] text-slate-500 mb-2 uppercase tracking-wide font-medium">
                                {b.rowsSnapshot ? 'Original import — exactly as imported' : 'Current transactions from this batch'}
                              </p>
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs min-w-[480px]">
                                  <thead>
                                    <tr className="text-slate-400 border-b border-slate-700/60">
                                      <th className="pb-1 pr-3 text-left font-medium">Date</th>
                                      <th className="pb-1 pr-3 text-left font-medium">Merchant</th>
                                      <th className="pb-1 pr-3 text-right font-medium">Amount</th>
                                      <th className="pb-1 pr-3 text-left font-medium">Type</th>
                                      <th className="pb-1 text-left font-medium">Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {snapshotRows.map((r, i) => (
                                      <tr key={i} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                                        <td className="py-1 pr-3 text-slate-400 font-num whitespace-nowrap">{r.date}</td>
                                        <td className="py-1 pr-3 text-slate-200 max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap">{r.merchant}</td>
                                        <td className={`py-1 pr-3 text-right font-num font-medium ${r.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                                          {r.type === 'income' ? '+' : '-'}{currency(Math.abs(r.amount))}
                                        </td>
                                        <td className="py-1 pr-3 text-slate-500 capitalize">{r.type}</td>
                                        <td className="py-1 text-slate-500 text-[11px]">{r.notes ?? '—'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {!b.rowsSnapshot && (
                                <p className="text-[10px] text-slate-600 mt-2">
                                  Full snapshot available for imports done after V55. This shows current live transactions from this batch.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
              <Button
                tone="ghost"
                size="xs"
                className="mt-2 hover:text-red-400"
                onClick={() => setImportBatches([])}
              >Clear history (keeps transactions)</Button>
            </div>
          )}
        </Card>
      )}

      {/* ── Data Integrity ── */}
      {transactions.length > 0 && (
        <Card title="Data Integrity" noHover>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(() => {
              const importedCount = transactions.filter(t => !!t.batchId).length
              const manualCount   = transactions.filter(t => !t.batchId).length
              const dupCandidates = transactions.filter(tx =>
                transactions.some(o => o.id !== tx.id &&
                  o.merchant.toLowerCase() === tx.merchant.toLowerCase() &&
                  o.amount === tx.amount && o.date === tx.date)
              ).length
              const lastBatch = importBatches.length > 0
                ? importBatches.reduce((a, b) => a.createdAt > b.createdAt ? a : b)
                : null
              return [
                { label: 'Total Transactions', val: transactions.length, sub: null, color: 'text-slate-200' },
                { label: 'Imported', val: importedCount, sub: lastBatch ? `Last: ${lastBatch.createdAt.slice(0, 10)}` : null, color: 'text-blue-300' },
                { label: 'Manual', val: manualCount, sub: null, color: 'text-slate-300' },
                { label: 'Needs Review', val: reviewableTxns.length, sub: null, color: reviewableTxns.length > 0 ? 'text-amber-300' : 'text-green-400' },
                { label: 'Dup. Candidates', val: dupCandidates, sub: null, color: dupCandidates > 0 ? 'text-amber-400' : 'text-slate-400' },
                { label: 'Import Batches', val: importBatches.length, sub: null, color: 'text-slate-400' },
                { label: 'Recently Deleted', val: deletedTxns.length, sub: deletedTxns.length > 0 ? 'Session only' : null, color: deletedTxns.length > 0 ? 'text-red-300' : 'text-slate-600' },
                { label: 'Uncategorized Expenses', val: transactions.filter(t => t.type === 'expense' && !t.categoryId).length, sub: null, color: 'text-slate-400' },
              ].map(({ label, val, sub, color }) => (
                <div key={label} className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-3 py-2">
                  <div className="text-xs text-slate-500 mb-0.5">{label}</div>
                  <div className={`text-lg font-bold ${color}`}>{val}</div>
                  {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
                </div>
              ))
            })()}
          </div>
          {deletedTxns.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-700/60">
              <button
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors px-1 py-1 rounded"
                onClick={() => setShowRecentlyDeleted(v => !v)}
              >
                <span>Recently Deleted ({deletedTxns.length})</span>
                <span>{showRecentlyDeleted ? '▲' : '▼'}</span>
              </button>
              {showRecentlyDeleted && (
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-slate-600">Deleted this session only — not persisted after refresh.</p>
                  {deletedTxns.map(tx => {
                    const acct = accounts.find(a => a.id === tx.accountId)
                    return (
                      <div key={tx.id} className="flex items-center gap-2 text-xs py-1 border-b border-slate-800/60">
                        <span className="text-slate-500 w-20 shrink-0">{tx.date}</span>
                        <span className="flex-1 truncate text-slate-400">{tx.merchant}</span>
                        <span className="text-slate-500">{acct?.name ?? '—'}</span>
                        <span className="font-medium text-slate-300 w-16 text-right shrink-0">{currency(tx.amount)}</span>
                        <Button tone="ghost" size="xs" className="text-blue-400 hover:text-blue-300 shrink-0" onClick={() => restoreDeletedTxn(tx.id)}>Restore</Button>
                        <Button tone="ghost" size="xs" className="text-red-500 hover:text-red-400 shrink-0" onClick={() => permanentlyDeleteTxn(tx.id)}>Remove</Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </>
  )
}
