import React from 'react'
import type { Transaction, Account, ImportBatch } from '../types'
import { currency } from '../utils/formatting'
import { Card } from './ui'

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
  return (
    <>
      {/* ── Import History ── */}
      {importBatches.length > 0 && (
        <Card title="Import History" noHover>
          <button
            className="w-full flex items-center justify-between text-left"
            onClick={() => setCsvShowHistory(v => !v)}
          >
            <span className="text-sm font-medium text-slate-300">Import History ({importBatches.length})</span>
            <span className="text-slate-500 text-xs">{csvShowHistory ? '▲' : '▼'}</span>
          </button>
          {csvShowHistory && (
            <div className="mt-3 overflow-x-auto">
              {batchToDelete && (() => {
                const b = importBatches.find(x => x.id === batchToDelete)
                const count = transactions.filter(tx => tx.batchId === batchToDelete).length
                return (
                  <div className="mb-3 rounded-lg bg-red-900/20 border border-red-700/40 px-3 py-2.5 text-xs text-red-300 flex items-center justify-between gap-3">
                    <span>Delete {count} transaction{count !== 1 ? 's' : ''} from &quot;{b?.accountName}&quot; ({b?.importMonth})? This action can be undone.</span>
                    <div className="flex gap-2 shrink-0">
                      <button className="text-red-400 hover:text-red-200 bg-red-900/40 border border-red-700/50 px-2 py-0.5 rounded" onClick={() => deleteImportBatch(batchToDelete)}>Delete</button>
                      <button className="text-slate-400 hover:text-slate-200" onClick={() => setBatchToDelete(null)}>Cancel</button>
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
                  {importBatches.map(b => (
                    <tr key={b.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="py-1.5 pr-3 text-slate-300">{b.accountName}</td>
                      <td className="py-1.5 pr-3 text-slate-400">{b.importMonth}</td>
                      <td className="py-1.5 pr-3 text-slate-500 uppercase text-[10px]">{b.importSource ?? 'csv'}</td>
                      <td className="py-1.5 pr-3 text-right text-green-400 font-medium">{b.importedCount}</td>
                      <td className="py-1.5 pr-3 text-right text-amber-400">{b.skippedCount > 0 ? b.skippedCount : '—'}</td>
                      <td className="py-1.5 pr-3 text-slate-500">{new Date(b.createdAt).toLocaleString()}</td>
                      <td className="py-1.5">
                        <button
                          className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors"
                          onClick={() => setBatchToDelete(b.id)}
                          title="Delete this import and its transactions"
                        >Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                className="mt-2 text-xs text-slate-500 hover:text-red-400 transition-colors"
                onClick={() => setImportBatches([])}
              >Clear history (keeps transactions)</button>
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
                className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
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
                        <button className="text-blue-400 hover:text-blue-300 shrink-0" onClick={() => restoreDeletedTxn(tx.id)}>Restore</button>
                        <button className="text-red-500 hover:text-red-400 shrink-0" onClick={() => permanentlyDeleteTxn(tx.id)}>Remove</button>
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
