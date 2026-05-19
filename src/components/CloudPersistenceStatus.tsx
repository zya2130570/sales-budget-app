type CloudPersistenceStatusProps = {
  status: 'guest' | 'idle' | 'syncing' | 'synced' | 'pending' | 'error'
  canSync: boolean
  autoSyncEnabled: boolean
  pendingCount: number
  lastSyncedAt: string | null
  error: string | null
  onRetry: () => void
  onToggleAutoSync: (enabled: boolean) => void
}

export function CloudPersistenceStatus({
  status,
  canSync,
  autoSyncEnabled,
  pendingCount,
  lastSyncedAt,
  error,
  onRetry,
  onToggleAutoSync,
}: CloudPersistenceStatusProps) {
  const label = !canSync
    ? 'Guest mode — local only'
    : status === 'syncing'
      ? 'Syncing to cloud…'
      : status === 'synced'
        ? 'Cloud synced'
        : status === 'pending'
          ? 'Cloud retry pending'
          : status === 'error'
            ? 'Cloud sync issue'
            : 'Cloud ready'

  return (
    <section className="rounded-2xl border border-slate-700 bg-slate-800/70 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-100">Cloud persistence</p>
        <p className="text-xs text-slate-400">
          {label}
          {lastSyncedAt ? ` · Last synced ${new Date(lastSyncedAt).toLocaleString()}` : ''}
          {pendingCount > 0 ? ` · ${pendingCount} pending` : ''}
        </p>
        {error && <p className="text-xs text-amber-300 mt-1">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {canSync && (
          <button
            type="button"
            onClick={() => onToggleAutoSync(!autoSyncEnabled)}
            className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
          >
            Auto-sync {autoSyncEnabled ? 'On' : 'Off'}
          </button>
        )}
        {canSync && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm text-white"
          >
            Sync now
          </button>
        )}
      </div>
    </section>
  )
}
