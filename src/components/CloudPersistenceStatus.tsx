/**
 * CloudPersistenceStatus.tsx — V12.4C
 *
 * Displays cloud sync state with a mandatory connection test gate.
 *
 * Flow:
 *   1. User is logged in → shows "Test cloud connection" button.
 *   2. Test passes       → "Sync now" becomes enabled; shows optional auto-sync toggle.
 *   3. Test fails        → shows the exact error; "Sync now" stays disabled.
 *   4. Sync completes    → shows last-synced time or pending count.
 *
 * "Sync now" is always disabled until the connection test passes.
 * This prevents 403-spamming Supabase with bulk writes before access is verified.
 */

export type CloudPersistenceStatusProps = {
  status: 'guest' | 'idle' | 'testing' | 'ready' | 'syncing' | 'synced' | 'pending' | 'error'
  canSync: boolean
  connectionTested: boolean
  connectionTestError: string | null
  autoSyncEnabled: boolean
  pendingCount: number
  lastSyncedAt: string | null
  error: string | null
  onTestConnection: () => void
  onSyncNow: () => void
  onToggleAutoSync: (enabled: boolean) => void
}

function StatusDot({ status }: { status: CloudPersistenceStatusProps['status'] }) {
  const color =
    status === 'synced' ? 'bg-emerald-400' :
    status === 'syncing' || status === 'testing' ? 'bg-blue-400 animate-pulse' :
    status === 'pending' ? 'bg-amber-400' :
    status === 'error' ? 'bg-red-400' :
    status === 'ready' ? 'bg-emerald-400/60' :
    'bg-slate-500'

  return <span className={`inline-block w-2 h-2 rounded-full ${color} mr-1.5 flex-shrink-0`} />
}

export function CloudPersistenceStatus({
  status,
  canSync,
  connectionTested,
  connectionTestError,
  autoSyncEnabled,
  pendingCount,
  lastSyncedAt,
  error,
  onTestConnection,
  onSyncNow,
  onToggleAutoSync,
}: CloudPersistenceStatusProps) {
  const isTesting = status === 'testing'
  const isSyncing = status === 'syncing'
  const busy = isTesting || isSyncing

  const statusLabel =
    !canSync              ? 'Guest mode — local only' :
    status === 'testing'  ? 'Testing connection…' :
    status === 'syncing'  ? 'Syncing to cloud…' :
    status === 'synced'   ? 'Cloud synced' :
    status === 'pending'  ? 'Sync incomplete — some writes failed' :
    status === 'error'    ? 'Cloud error' :
    status === 'ready'    ? 'Connection verified — ready to sync' :
    'Cloud ready'

  const subLabel = [
    lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : null,
    pendingCount > 0 ? `${pendingCount} item${pendingCount === 1 ? '' : 's'} pending` : null,
  ].filter(Boolean).join(' · ')

  // The active error to show: prefer the connection test error when not yet tested.
  const displayError = !connectionTested && connectionTestError
    ? connectionTestError
    : error

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4 flex flex-col gap-3">

      {/* Status row */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 flex items-center">
            <StatusDot status={status} />
            Cloud persistence
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {statusLabel}
            {subLabel ? ` · ${subLabel}` : ''}
          </p>

          {/* Error block — shown in amber for partial failures, red for hard errors */}
          {displayError && (
            <p className={`text-xs mt-1.5 font-mono leading-relaxed ${
              status === 'pending' ? 'text-amber-300' : 'text-red-300'
            }`}>
              {displayError}
            </p>
          )}

          {/* Hint when test has not been run yet */}
          {canSync && !connectionTested && !connectionTestError && status !== 'testing' && (
            <p className="text-xs text-slate-500 mt-1">
              Run the connection test before syncing to avoid repeated 403 errors.
            </p>
          )}
        </div>

        {/* Action buttons */}
        {canSync && (
          <div className="flex flex-wrap gap-2 flex-shrink-0">

            {/* Connection test — always available when logged in and not syncing */}
            <button
              type="button"
              onClick={onTestConnection}
              disabled={busy}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                isTesting
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : connectionTested
                    ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
              title={connectionTested ? 'Re-run the connection test' : 'Verify Supabase access before syncing'}
            >
              {isTesting ? 'Testing…' : connectionTested ? 'Re-test connection' : 'Test cloud connection'}
            </button>

            {/* Sync now — DISABLED until connection test passes */}
            <button
              type="button"
              onClick={onSyncNow}
              disabled={busy || !connectionTested}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                busy || !connectionTested
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
              title={
                !connectionTested
                  ? 'Run the connection test first'
                  : isSyncing
                    ? 'Sync in progress…'
                    : 'Push local data to Supabase'
              }
            >
              {isSyncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        )}
      </div>

      {/* Auto-sync toggle — only shown after test passes */}
      {canSync && connectionTested && (
        <div className="flex items-center justify-between border-t border-slate-700 pt-3">
          <div>
            <p className="text-xs font-medium text-slate-300">Auto-sync</p>
            <p className="text-xs text-slate-500">
              {autoSyncEnabled
                ? 'Sync is manually triggered — auto-sync will run on next page interaction.'
                : 'Off — click "Sync now" to push changes manually.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggleAutoSync(!autoSyncEnabled)}
            disabled={busy}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors ${
              autoSyncEnabled ? 'bg-blue-600' : 'bg-slate-600'
            } ${busy ? 'opacity-50 cursor-not-allowed' : ''}`}
            role="switch"
            aria-checked={autoSyncEnabled}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                autoSyncEnabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      )}
    </section>
  )
}
