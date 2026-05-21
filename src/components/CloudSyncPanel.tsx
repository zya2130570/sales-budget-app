import { useState } from 'react'
import { useCloudSync } from '../hooks/useCloudSync'
import { VersionBadge } from './VersionBadge'
import type { DatasetSummary, ReconciliationAnalysis } from '../utils/reconciliationEngine'

function formatDate(value: string | null): string {
  if (!value) return 'None found'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleString()
}

function totalRecords(summary: DatasetSummary): number {
  return summary.entities.reduce((sum, entity) => sum + entity.count, 0)
}

function DatasetCard({ summary }: { summary: DatasetSummary }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            {summary.source === 'local' ? 'Local device data' : 'Cloud account data'}
          </h3>
          <p className="text-xs text-slate-500">
            Last modified: {formatDate(summary.lastModifiedAt)}
          </p>
        </div>
        <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">
          {totalRecords(summary)} records
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
        {summary.entities
          .filter(entity => entity.count > 0 || ['accounts', 'categories', 'transactions', 'importBatches', 'savingsGoals', 'monthlyReviews'].includes(entity.key))
          .map(entity => (
            <div key={entity.key} className="rounded-xl bg-slate-950/60 px-3 py-2">
              <div className="text-slate-500">{entity.label}</div>
              <div className="text-sm font-semibold text-slate-100">{entity.count}</div>
            </div>
          ))}
      </div>

      {summary.warnings.length > 0 && (
        <div className="mt-3 space-y-1">
          {summary.warnings.slice(0, 3).map((warning, index) => (
            <p key={index} className="text-xs text-amber-300">{warning}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function AnalysisPanel({ analysis }: { analysis: ReconciliationAnalysis }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-100">Reconciliation result</h3>

      <div className="mb-3 rounded-xl bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
        Recommended path:{' '}
        <span className="font-semibold text-slate-100">
          {analysis.recommendedAction === 'continue-guest' && 'Continue in guest mode'}
          {analysis.recommendedAction === 'upload-local' && 'Local data can become the cloud starting point'}
          {analysis.recommendedAction === 'choose-source' && 'Choose a source before merging'}
          {analysis.recommendedAction === 'safe-merge-review' && 'Review safe merge areas'}
        </span>
      </div>

      {analysis.conflicts.length > 0 ? (
        <div className="space-y-2">
          {analysis.conflicts.map(conflict => (
            <div
              key={conflict.key}
              className={`rounded-xl border px-3 py-2 text-xs ${
                conflict.severity === 'danger'
                  ? 'border-red-700/60 bg-red-950/30 text-red-200'
                  : conflict.severity === 'warning'
                  ? 'border-amber-700/60 bg-amber-950/30 text-amber-200'
                  : 'border-slate-700 bg-slate-950/40 text-slate-300'
              }`}
            >
              <div className="font-semibold">{conflict.label}</div>
              <div>{conflict.message}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400">No major conflicts detected from the available summaries.</p>
      )}

      <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
        <div>
          <div className="mb-1 font-semibold text-emerald-300">Safe to merge later</div>
          <ul className="space-y-1 text-slate-400">
            {analysis.safeMergeAreas.map(area => <li key={area}>• {area}</li>)}
          </ul>
        </div>
        <div>
          <div className="mb-1 font-semibold text-amber-300">Needs review first</div>
          <ul className="space-y-1 text-slate-400">
            {analysis.unsafeMergeAreas.map(area => <li key={area}>• {area}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function CloudSyncPanel() {
  const {
    auth,
    localSummary,
    cloudSummary,
    analysis,
    loading,
    restoring,
    restoreSummary,
    status,
    error,
    selectedChoice,
    summary,
    refresh,
    chooseLocal,
    chooseCloud,
    chooseMergeSafe,
  } = useCloudSync()
  const [open, setOpen] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)

  const busy = loading || restoring

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-100">Cloud sync readiness</h2>
            <VersionBadge version="V15" />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Compare this device with cloud data. Use Cloud Data will download a local backup first, then restore.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {summary.isSignedIn ? `Signed in as ${summary.userEmail}` : auth.isConfigured ? 'Sign in to compare cloud data.' : 'Supabase is not configured; local guest mode remains active.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setOpen(value => !value)}
            className="rounded-xl border border-slate-600 px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700"
          >
            {open ? 'Hide panel' : 'Open panel'}
          </button>
          <button
            onClick={refresh}
            disabled={busy}
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Checking…' : 'Compare'}
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
        {status}
      </div>

      {error && (
        <div className="mt-3 rounded-xl border border-red-700/60 bg-red-950/30 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      {restoreSummary && !restoring && (
        <div className="mt-3 rounded-xl border border-emerald-700/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-300 space-y-0.5">
          <p className="font-semibold">Restore complete</p>
          <p>{restoreSummary.accounts} accounts · {restoreSummary.categories} categories · {restoreSummary.transactions} transactions · {restoreSummary.savingsGoals} goals</p>
          {restoreSummary.errors.length > 0 && (
            <p className="text-amber-300">Partial errors: {restoreSummary.errors.join(', ')}</p>
          )}
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <DatasetCard summary={localSummary} />
            <DatasetCard summary={cloudSummary ?? {
              source: 'cloud',
              available: false,
              generatedAt: new Date().toISOString(),
              lastModifiedAt: null,
              entities: [],
              totals: {
                accounts: 0,
                categories: 0,
                transactions: 0,
                importBatches: 0,
                savingsGoals: 0,
                savingsGoalContributions: 0,
                monthlyReviews: 0,
              },
              warnings: ['Cloud has not been checked yet.'],
            }} />
          </div>

          <AnalysisPanel analysis={analysis} />

          <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-100">Choose source direction</h3>

            {!confirmRestore ? (
              <>
                <p className="mb-3 text-xs text-slate-400">
                  "Use Cloud Data" replaces everything with cloud data (local backup downloaded automatically). "Merge Safe Data" only adds cloud-only records to local — never overwrites existing data, never touches transactions.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={chooseLocal}
                    disabled={busy}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
                      selectedChoice === 'local'
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Use Local Data
                  </button>
                  <button
                    onClick={() => setConfirmRestore(true)}
                    disabled={!summary.isSignedIn || busy}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedChoice === 'cloud'
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    Use Cloud Data
                  </button>
                  <button
                    onClick={() => { void chooseMergeSafe() }}
                    disabled={!summary.isSignedIn || busy}
                    className={`rounded-xl border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedChoice === 'merge-safe'
                        ? 'border-blue-500 bg-blue-600 text-white'
                        : 'border-slate-600 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {restoring && selectedChoice === 'merge-safe' ? 'Merging…' : 'Merge Safe Data'}
                  </button>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-amber-700/60 bg-amber-950/20 p-3 space-y-3">
                <p className="text-xs font-semibold text-amber-200">Confirm restore from cloud</p>
                <p className="text-xs text-amber-300/80">
                  This will download your current local data as a backup, then replace everything with cloud data and reload the app. This cannot be undone without re-importing the backup.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setConfirmRestore(false); void chooseCloud() }}
                    disabled={busy}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
                  >
                    {restoring ? 'Restoring…' : 'Yes, restore from cloud'}
                  </button>
                  <button
                    onClick={() => setConfirmRestore(false)}
                    disabled={busy}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
