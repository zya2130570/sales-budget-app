/**
 * CloudStatusButton.tsx — V17
 *
 * Replaces the two always-visible cloud panels with a single compact header
 * button. Shows a colored status dot + short label. Clicking opens a modal
 * with two tabs: Sync (persistence) and Compare (reconciliation + merge).
 *
 * Merge Safe Data is a top-level button, not buried inside Compare.
 */
import { useEffect, useState } from 'react'
import { runSchemaRepair } from '../utils/schemaRepair'
import { useCloudSync } from '../hooks/useCloudSync'
import type { CloudPersistenceStatus } from '../hooks/useCloudPersistence'
import type { CloudPersistSummary } from '../utils/cloudPersistence'
import type { DatasetSummary, ReconciliationAnalysis } from '../utils/reconciliationEngine'

// ── Compact header button ─────────────────────────────────────────────────────

function dotColor(status: CloudPersistenceStatus): string {
  switch (status) {
    case 'synced':    return 'bg-emerald-400'
    case 'syncing':
    case 'testing':   return 'bg-blue-400 animate-pulse'
    case 'pending':   return 'bg-amber-400'
    case 'conflicts': return 'bg-purple-400 animate-pulse'
    case 'error':     return 'bg-red-400'
    case 'ready':     return 'bg-emerald-400/60'
    default:          return 'bg-slate-500'
  }
}

function shortLabel(status: CloudPersistenceStatus, pendingCount: number, canSync: boolean): string {
  if (!canSync) return 'Local'
  if (status === 'synced')    return 'Synced'
  if (status === 'syncing')   return 'Syncing…'
  if (status === 'testing')   return 'Testing…'
  if (status === 'pending')   return `${pendingCount} pending`
  if (status === 'conflicts') return 'Conflicts'
  if (status === 'error')     return 'Error'
  if (status === 'ready')     return 'Ready'
  return 'Cloud'
}

// ── Analysis panel (copy of existing logic) ───────────────────────────────────

function AnalysisPanel({ analysis }: { analysis: ReconciliationAnalysis }) {
  if (!analysis) return null
  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-slate-900/50 px-3 py-2 text-xs text-slate-400">
        Recommended: <span className="text-slate-200 font-medium capitalize">{analysis.recommendedAction?.replace(/-/g, ' ')}</span>
      </div>
      {analysis.unsafeMergeAreas?.length > 0 && (
        <div className="rounded-lg border border-red-700/40 bg-red-950/20 px-3 py-2">
          <p className="text-xs font-semibold text-red-300 mb-1">Do not auto-merge</p>
          <p className="text-xs text-red-400/80">{analysis.unsafeMergeAreas.join(', ')}</p>
        </div>
      )}
      {analysis.safeMergeAreas?.length > 0 && (
        <p className="text-xs text-emerald-400 px-1">
          Safe to merge: {analysis.safeMergeAreas.join(', ')}
        </p>
      )}
    </div>
  )
}

function DatasetRow({ summary }: { summary: DatasetSummary | null }) {
  if (!summary) return <p className="text-xs text-slate-500">Not checked yet.</p>
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/50 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-300 capitalize">{summary.source} data</p>
        <span className="text-[11px] text-slate-500">{summary.totals ? Object.values(summary.totals).reduce((s: number, v: unknown) => s + (Number(v) || 0), 0) : 0} records</span>
      </div>
      {summary.totals && (
        <div className="grid grid-cols-3 gap-1.5">
          {Object.entries(summary.totals).filter(([, v]) => Number(v) > 0).map(([k, v]) => (
            <div key={k} className="text-[10px]">
              <span className="text-slate-500 capitalize">{k.replace(/([A-Z])/g, ' $1').trim()}: </span>
              <span className="text-slate-300 font-medium">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

type SyncProps = {
  status: CloudPersistenceStatus
  canSync: boolean
  connectionTested: boolean
  connectionTestError: string | null
  autoSyncEnabled: boolean
  pendingCount: number
  lastSyncedAt: string | null
  error: string | null
  lastResult: CloudPersistSummary | null
  autoSyncPaused: boolean
  onTestConnection: () => void
  onSyncNow: () => void
  onToggleAutoSync: (v: boolean) => void
  onDownloadBackup: () => void
  onOpenSettings: () => void
}

export function CloudStatusButton(props: SyncProps) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'sync' | 'compare'>('sync')
  const [showResults, setShowResults] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [repairingSchema, setRepairingSchema] = useState(false)
  const [schemaRepairMessage, setSchemaRepairMessage] = useState<string | null>(null)

  const cs = useCloudSync()
  const busy = props.status === 'syncing' || props.status === 'testing' || cs.loading || cs.restoring


  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const handleSchemaRepair = async () => {
    setRepairingSchema(true)
    setSchemaRepairMessage(null)
    const result = await runSchemaRepair()
    if (result.ok) {
      setSchemaRepairMessage(`Schema repaired${result.applied ? `: ${result.applied}` : ''}. Re-test connection, then sync again.`)
    } else {
      setSchemaRepairMessage(result.error ?? 'Schema repair failed.')
    }
    setRepairingSchema(false)
  }

  return (
    <>
      {/* ── Compact header button ── */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 border border-slate-600/50 transition-colors"
        title="Cloud status"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor(props.status)}`} />
        <span className="text-xs text-slate-300 hidden sm:block">
          {shortLabel(props.status, props.pendingCount, props.canSync)}
        </span>
      </button>

      {/* ── Full modal ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70" onClick={() => setOpen(false)}>
          <div
            className="w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
              <div className="flex items-center gap-3">
                <span className={`w-2.5 h-2.5 rounded-full ${dotColor(props.status)}`} />
                <h2 className="text-sm font-semibold text-slate-100">Cloud Status</h2>
                {props.lastSyncedAt && (
                  <span className="text-[11px] text-slate-500">Last synced {new Date(props.lastSyncedAt).toLocaleTimeString()}</span>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-slate-500 hover:text-slate-300 text-lg transition-colors">✕</button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-700 flex-shrink-0">
              {(['sync', 'compare'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 text-xs font-medium transition-colors capitalize ${tab === t ? 'text-blue-300 border-b-2 border-blue-500' : 'text-slate-400 hover:text-slate-200'}`}>
                  {t === 'sync' ? 'Sync' : 'Compare & Merge'}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">

              {tab === 'sync' && (
                <>
                  {/* Status line */}
                  <div>
                    <p className="text-xs text-slate-400">
                      {!props.canSync ? 'Guest mode — local only' :
                       props.status === 'synced'  ? 'All data synced to cloud.' :
                       props.status === 'pending' ? `${props.pendingCount} write${props.pendingCount === 1 ? '' : 's'} failed last sync.` :
                       props.status === 'conflicts' ? 'Conflicts found — resolve before syncing.' :
                       props.status === 'error'   ? 'Connection error.' :
                       props.status === 'ready'   ? 'Connected, ready to sync.' :
                       'Not yet tested.'}
                    </p>
                    {props.error && <p className="text-xs text-red-300 font-mono mt-1">{props.error}</p>}
                    {props.autoSyncPaused && (
                      <p className="text-xs text-amber-300 mt-1">⚠ Auto-sync paused after repeated failures. Re-test connection to resume.</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  {props.canSync && (
                    <div className="flex flex-wrap gap-2">
                      <button onClick={props.onTestConnection} disabled={busy}
                        className={`px-3 py-2 rounded-lg text-xs transition-colors ${busy ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : props.connectionTested ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}>
                        {props.status === 'testing' ? 'Testing…' : props.connectionTested ? 'Re-test' : 'Test connection'}
                      </button>
                      <button onClick={props.onSyncNow} disabled={busy || !props.connectionTested}
                        className={`px-3 py-2 rounded-lg text-xs transition-colors ${busy || !props.connectionTested ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}>
                        {props.status === 'syncing' ? 'Syncing…' : 'Sync now'}
                      </button>
                      {(props.status === 'pending' || props.status === 'error' || (props.lastResult?.failed ?? 0) > 0) && (
                        <button onClick={handleSchemaRepair} disabled={busy || repairingSchema}
                          className={`px-3 py-2 rounded-lg text-xs transition-colors ${busy || repairingSchema ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-amber-600 hover:bg-amber-500 text-white'}`}>
                          {repairingSchema ? 'Repairing…' : 'Repair schema'}
                        </button>
                      )}
                    </div>
                  )}
                  {schemaRepairMessage && (
                    <p className={`text-xs mt-1 ${schemaRepairMessage.toLowerCase().includes('failed') || schemaRepairMessage.toLowerCase().includes('not configured') ? 'text-red-300' : 'text-emerald-300'}`}>
                      {schemaRepairMessage}
                    </p>
                  )}

                  {/* Per-entity results */}
                  {props.lastResult && props.lastResult.results.length > 0 && (
                    <div className="border-t border-slate-700/60 pt-2">
                      <button onClick={() => setShowResults(v => !v)}
                        className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                        {showResults ? '▲ Hide' : `▼ Details (${props.lastResult.synced} synced${props.lastResult.failed > 0 ? `, ${props.lastResult.failed} failed` : ''})`}
                      </button>
                      {showResults && (
                        <div className="space-y-1.5 mt-2">
                          {props.lastResult.results.filter(r => r.attempted > 0).map(r => (
                            <div key={r.entity} className="rounded-lg bg-slate-900/60 px-2.5 py-1.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <p className="text-slate-500 truncate">{r.entity.replace(/_/g, ' ')}</p>
                                <p className="font-medium flex-shrink-0 ml-2">
                                  {r.synced > 0 && <span className="text-emerald-400">{r.synced} ✓ </span>}
                                  {r.failed > 0 && <span className="text-red-400">{r.failed} ✗</span>}
                                  {r.skipped > 0 && <span className="text-amber-400 ml-1">{r.skipped} –</span>}
                                </p>
                              </div>
                              {(r as any).errorDetail && (
                                <p className="text-[10px] text-red-300/80 font-mono mt-0.5 break-all">{(r as any).errorDetail}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Auto-sync + backup */}
                  {props.canSync && props.connectionTested && (
                    <div className="border-t border-slate-700/60 pt-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-slate-300">Auto-sync</p>
                          <p className="text-xs text-slate-500">
                            {props.autoSyncEnabled ? 'Syncs 5s after any data change.' : 'Off — manual sync only.'}
                          </p>
                        </div>
                        <button
                          onClick={() => props.onToggleAutoSync(!props.autoSyncEnabled)}
                          disabled={busy || props.autoSyncPaused}
                          className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${props.autoSyncEnabled ? 'bg-blue-600' : 'bg-slate-600'} ${busy || props.autoSyncPaused ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                          role="switch" aria-checked={props.autoSyncEnabled}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${props.autoSyncEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-slate-300">Local backup</p>
                          <p className="text-xs text-slate-500">Download all data as JSON.</p>
                        </div>
                        <button onClick={props.onDownloadBackup} className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
                          Download
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {tab === 'compare' && (
                <>
                  {/* V25 — Plain-English reconciliation explanation */}
                  <div className="rounded-xl bg-slate-700/30 border border-slate-600/40 px-3 py-2.5 mb-3 text-xs text-slate-400 leading-relaxed">
                    <p className="font-semibold text-slate-300 mb-1">What is reconciliation?</p>
                    <p>This tab compares your <span className="text-slate-200">local data</span> (on this device) against your <span className="text-slate-200">cloud data</span> (Supabase backup) and lets you choose which version wins.</p>
                    <p className="mt-1.5"><span className="text-emerald-400 font-medium">Merge Safe</span> is the safest option — it only fills in records that exist in the cloud but are missing locally. It never overwrites anything you have locally.</p>
                    <p className="mt-1.5"><span className="text-blue-300 font-medium">Use Cloud</span> replaces local with cloud. <span className="text-amber-300 font-medium">Use Local</span> keeps what you have and overwrites cloud on next sync.</p>
                  </div>
                  {/* Top-level merge actions — NOT buried */}
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={cs.chooseLocal} disabled={!cs.summary.isSignedIn || busy}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors disabled:opacity-50 text-center ${cs.selectedChoice === 'local' ? 'border-blue-500 bg-blue-600/20 text-blue-300' : 'border-slate-600 text-slate-300 hover:bg-slate-700'}`}>
                      Use Local
                    </button>
                    <button onClick={() => { void cs.chooseMergeSafe() }} disabled={!cs.summary.isSignedIn || busy}
                      className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors disabled:opacity-50 text-center ${cs.selectedChoice === 'merge-safe' ? 'border-emerald-500 bg-emerald-600/20 text-emerald-300' : 'border-emerald-700/50 text-emerald-400 hover:bg-emerald-950/20'}`}>
                      {cs.restoring && cs.selectedChoice === 'merge-safe' ? 'Merging…' : 'Merge Safe'}
                    </button>
                    {!confirmRestore ? (
                      <button onClick={() => setConfirmRestore(true)} disabled={!cs.summary.isSignedIn || busy}
                        className="rounded-xl border border-slate-600 px-3 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-50">
                        Use Cloud
                      </button>
                    ) : (
                      <div className="col-span-3 rounded-xl border border-amber-700/50 bg-amber-950/20 p-3 space-y-2">
                        <p className="text-xs font-semibold text-amber-200">Replace local data with cloud?</p>
                        <p className="text-xs text-amber-300/70">
                          Your local data will be overwritten and the app will reload.
                          We recommend downloading a backup first, but it&apos;s optional.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => { void cs.chooseCloud(); setConfirmRestore(false) }}
                            disabled={busy}
                            className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50">
                            {cs.restoring ? 'Restoring…' : 'Restore now'}
                          </button>
                          <button
                            onClick={() => { props.onDownloadBackup(); }}
                            className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors">
                            Download backup first
                          </button>
                          <button onClick={() => setConfirmRestore(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-500">
                    <strong className="text-slate-400">Merge Safe</strong> adds cloud-only records locally without overwriting. Never touches transactions.
                    <strong className="text-slate-400"> Use Cloud</strong> replaces everything with your cloud data. A backup download is available but optional.
                  </p>

                  {/* Compare button + results */}
                  <div className="border-t border-slate-700/60 pt-3">
                    <div className="flex items-center gap-2 mb-3">
                      <button onClick={cs.refresh} disabled={!cs.summary.isSignedIn || cs.loading}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50">
                        {cs.loading ? 'Comparing…' : 'Compare'}
                      </button>
                      <span className="text-xs text-slate-400">{cs.status}</span>
                    </div>
                    {cs.error && <p className="text-xs text-red-300 mb-2">{cs.error}</p>}
                    {cs.restoreSummary && (
                      <p className="text-xs text-emerald-300 mb-2">
                        ✓ {cs.restoreSummary.accounts} accounts · {cs.restoreSummary.categories} categories · {cs.restoreSummary.transactions} transactions restored.
                      </p>
                    )}
                    {cs.cloudSummary && (
                      <div className="space-y-2">
                        <DatasetRow summary={cs.localSummary} />
                        <DatasetRow summary={cs.cloudSummary} />
                        <AnalysisPanel analysis={cs.analysis} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-700/60 flex-shrink-0 flex items-center justify-between">
              <p className="text-[11px] text-slate-600">
                {props.canSync && cs.summary.isSignedIn ? `Signed in as ${cs.summary.userEmail}` : 'Guest mode'}
              </p>
              <button onClick={props.onOpenSettings} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                ⚙ Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
