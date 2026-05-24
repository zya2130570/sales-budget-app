import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { currency } from '../utils/formatting'
import { ZYAN_PERSONAL_PRELOAD } from '../utils/personalPreloadData'

type Props = {
  onLoadPersonalData: () => void
  onDownloadBackup: () => void
  onSavePersonalDefault: () => void
  hasCustomDefault: boolean
}

export function PersonalPreloadCard({ onLoadPersonalData, onDownloadBackup, onSavePersonalDefault, hasCustomDefault }: Props) {
  const { user, loading } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [billsOpen, setBillsOpen] = useState(true)

  const totalBills = ZYAN_PERSONAL_PRELOAD.billsToMomBreakdown.reduce((sum, item) => sum + item.amount, 0)

  // V30 — guests see a minimal teaser, not sensitive data
  if (!user && !loading) {
    return (
      <div className="rounded-2xl border border-blue-700/30 bg-blue-950/10 p-4 space-y-2">
        <p className="text-xs uppercase tracking-wide text-blue-400 font-semibold">Personal starter data</p>
        <p className="text-sm text-slate-300">Sign in to load your real budget setup — accounts, categories, goals, and transaction history.</p>
        <div className="flex items-center gap-2 pt-1">
          <button
            disabled
            className="rounded-lg bg-slate-700 text-slate-500 px-4 py-2 text-sm cursor-not-allowed opacity-60"
            title="Sign in first to load your personal data"
          >
            Load my starter data
          </button>
          <span className="text-xs text-slate-600">Requires sign-in</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-blue-700/50 bg-blue-950/20 p-4 shadow-lg space-y-3">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-blue-300 font-semibold">Personal starter data</p>
          <h3 className="text-lg font-bold text-slate-100">Load Zyan&apos;s real budget setup</h3>
          <p className="text-sm text-slate-400">
            Includes accounts, budget categories, goals, Apple Card history, rules, recurring savings, and saved views.
          </p>
          {hasCustomDefault && (
            <p className="mt-1 text-xs text-emerald-300">Using your saved custom default instead of the original starter baseline.</p>
          )}
        </div>
        <div className="text-xs text-slate-400 md:text-right">
          <div>{ZYAN_PERSONAL_PRELOAD.metadata.transactionCount} Apple Card transactions</div>
          <div>{ZYAN_PERSONAL_PRELOAD.categories.length} categories · {ZYAN_PERSONAL_PRELOAD.rules.length} rules</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setBillsOpen(v => !v)}
        className="w-full rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-left hover:bg-slate-800/80 transition-colors"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-100">Bills to Mom umbrella</p>
            <p className="text-xs text-slate-400">Target: {currency(300)} / month. Current itemized total: {currency(totalBills)}.</p>
          </div>
          <span className="text-xs text-blue-300">{billsOpen ? 'Hide' : 'Show'}</span>
        </div>
        {billsOpen && (
          <div className="mt-3 grid md:grid-cols-5 gap-2">
            {ZYAN_PERSONAL_PRELOAD.billsToMomBreakdown.map(item => (
              <div key={item.name} className="rounded-lg bg-slate-800/70 border border-slate-700 p-2">
                <p className="text-[11px] text-slate-400">{item.name}</p>
                <p className="text-sm font-semibold text-slate-100">{currency(item.amount)}</p>
              </div>
            ))}
          </div>
        )}
      </button>

      {!user ? (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-200">
          {loading ? 'Checking login…' : 'Please log in to load your personal data.'}
        </div>
      ) : !confirming ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-xl bg-blue-600 hover:bg-blue-500 px-4 py-2 text-sm font-semibold text-white transition-colors"
          >
            {hasCustomDefault ? 'Load my saved default' : 'Load my starter data'}
          </button>
          <button
            type="button"
            onClick={onSavePersonalDefault}
            className="rounded-xl bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors"
            title="Save the current accounts, budget, goals, transactions, and rules as your new personal default."
          >
            Save current as default
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-3 space-y-3">
          <p className="text-sm font-semibold text-amber-100">This will overwrite the current local workspace.</p>
          <p className="text-xs text-amber-200/80">
            Download a backup first if you want a copy of the current data. Backup is optional. Nothing downloads automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onDownloadBackup}
              className="rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors"
            >
              Download backup first
            </button>
            <button
              type="button"
              onClick={() => { onLoadPersonalData(); setConfirming(false) }}
              className="rounded-lg bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
            >
              Overwrite and load data
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
