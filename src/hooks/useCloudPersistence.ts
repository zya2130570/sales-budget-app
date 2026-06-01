/**
 * useCloudPersistence.ts — V12.5
 *
 * Coordinator for local→cloud sync with:
 * - Batch upsert (no more N+1)
 * - Conflict detection and resolution
 * - New entities: savedBudgets, actuals
 * - Soft delete awareness (schema supports deleted_at; local delete propagation in V12.6)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, Category, ImportBatch, SavedBudget, SavedScenarioSet, SavedTargetSet, Target, Transaction, TransactionRule, TakeHomeSettings } from '../types'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import {
  persistCoreDataToCloud,
  testCloudConnection,
  type CloudConnectionTestResult,
  type CloudPendingDelete,
  type CloudPersistSummary,
  type ConflictRecord,
  type ConflictResolutions,
} from '../utils/cloudPersistence'
import { clearSyncedDeletes, loadPendingDeletes } from '../utils/storage'

export type CloudPersistenceStatus =
  | 'guest'       // not logged in / Supabase not configured
  | 'idle'        // logged in, no test run yet
  | 'testing'     // connection test in progress
  | 'ready'       // test passed, sync available
  | 'syncing'     // full sync in progress
  | 'synced'      // last sync completed with no failures
  | 'pending'     // last sync had write failures
  | 'conflicts'   // sync paused — conflicts need user resolution
  | 'error'       // connection test failed or sync threw

export type UseCloudPersistenceArgs = {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  rules: TransactionRule[]
  targets: Target[]
  savedTargetSets: SavedTargetSet[]
  savedScenarios: SavedScenarioSet[]
  savedBudgets: SavedBudget[]
  actuals: Record<string, string>
  importBatches: ImportBatch[]
  monthlyNotes: Record<string, string>
  reviewedMonths: Record<string, string>
  pendingDeletes: CloudPendingDelete[]
  takeHomeSettings?: TakeHomeSettings | null
  scenarioNotes?: Record<string, string>
  categoryMemory?: Record<string, string>
  actualsperiod?: string
  actualsPeriodStart?: string
}

const LAST_SYNC_KEY = 'flow_cloud_last_sync_at'

const readLastSyncedAt = (): string | null => {
  try { return localStorage.getItem(LAST_SYNC_KEY) } catch { return null }
}
const writeLastSyncedAt = (v: string) => {
  try { localStorage.setItem(LAST_SYNC_KEY, v) } catch { /* ignore */ }
}

export function useCloudPersistence(data: UseCloudPersistenceArgs) {
  const auth = useAuth()

  const [status, setStatus] = useState<CloudPersistenceStatus>('guest')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(readLastSyncedAt)
  const [pendingCount, setPendingCount] = useState(0)   // session-only — not persisted
  const [lastResult, setLastResult] = useState<CloudPersistSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [connectionTested, setConnectionTested] = useState(false)
  const [connectionTestError, setConnectionTestError] = useState<string | null>(null)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [consecutiveSyncFailures, setConsecutiveSyncFailures] = useState(0)
  const [autoSyncPaused, setAutoSyncPaused] = useState(false)

  // Conflict state — pauses sync until user resolves each conflict
  const [pendingConflicts, setPendingConflicts] = useState<ConflictRecord[]>([])
  // Resolutions accumulate across sync runs so re-syncing doesn't re-ask for resolved items
  const [conflictResolutions, setConflictResolutions] = useState<ConflictResolutions>({})

  const syncInFlightRef = useRef(false)
  const testInFlightRef = useRef(false)

  const canSync = Boolean(auth.isConfigured && auth.user && supabase)

  const fingerprint = useMemo(() => JSON.stringify({
    accounts:        data.accounts.map(i => [i.id, i.updatedAt, i.balance]),
    categories:      data.categories.map(i => [i.id, i.updatedAt, i.amount]),
    transactions:    data.transactions.map(i => [i.id, i.updatedAt, i.date, i.amount]),
    rules:           data.rules.map(i => [i.id, i.updatedAt, i.matchText]),
    targets:         data.targets.map(i => [i.id, i.updatedAt, i.currentSaved]),
    savedTargetSets: data.savedTargetSets.map(i => [i.name, i.savedAt]),
    savedScenarios:  data.savedScenarios.map(i => [i.name, i.savedAt]),
    savedBudgets:    data.savedBudgets.map(i => [i.name, i.savedAt]),
    importBatches:   data.importBatches.map(i => [i.id, i.importedAt, i.importedCount]),
    actuals:         Object.keys(data.actuals).length,
  }), [data])

  // ─── Connection test ────────────────────────────────────────────────────────

  const runConnectionTest = useCallback(async (): Promise<CloudConnectionTestResult> => {
    if (!canSync || !auth.user || !supabase) {
      return { ok: false, error: 'Not logged in or Supabase not configured.' }
    }
    if (testInFlightRef.current) return { ok: false, error: 'Test already in progress.' }

    testInFlightRef.current = true
    setStatus('testing')
    setError(null)
    setConnectionTestError(null)

    try {
      const result = await testCloudConnection(supabase, auth.user.id)
      if (result.ok) {
        setConnectionTested(true)
        setAutoSyncPaused(false)
        setConsecutiveSyncFailures(0)
        setStatus('ready')
      } else {
        setConnectionTested(false)
        setConnectionTestError(result.error ?? 'Connection test failed.')
        setStatus('error')
        setError(result.error ?? 'Connection test failed.')
      }
      return result
    } finally {
      testInFlightRef.current = false
    }
  }, [auth.user, canSync])

  // ─── Full sync ─────────────────────────────────────────────────────────────

  const runSyncNow = useCallback(async () => {
    if (!canSync || !auth.user || !supabase) { setStatus('guest'); return }
    // Allow sync if connection was previously tested OR if we're already in a synced/ready/pending state
    // (previously-tested connection is still valid; requiring re-test after every "Use Local" is wrong)
    if (!connectionTested && status !== 'synced' && status !== 'ready' && status !== 'pending') {
      setError('Run the connection test before syncing.')
      return
    }
    if (syncInFlightRef.current) return

    syncInFlightRef.current = true
    setStatus('syncing')
    setError(null)

    try {
      // Re-read pending deletes from localStorage at sync time so that any
      // queued during this React tick (e.g. by Use Local) are included.
      const freshPendingDeletes = loadPendingDeletes().map(d => ({
        table: d.table,
        localId: d.localId,
        deletedAt: d.deletedAt,
      }))
      const result = await persistCoreDataToCloud({
        supabase,
        userId: auth.user.id,
        ...data,
        pendingDeletes: freshPendingDeletes,
        resolutions: conflictResolutions,
      })

      // Clear pending deletes that were successfully synced
      if (result.syncedDeletes?.length) {
        clearSyncedDeletes(result.syncedDeletes)
      }

      setLastResult(result)

      // New conflicts found — pause sync and show modal
      if (result.conflicts.length > 0) {
        setPendingConflicts(result.conflicts)
        setStatus('conflicts')
        return
      }

      if (result.failed > 0) {
        const nextFailures = consecutiveSyncFailures + 1
        setConsecutiveSyncFailures(nextFailures)
        if (nextFailures >= 3 && autoSyncEnabled) {
          setAutoSyncPaused(true)
          setAutoSyncEnabled(false)
        }
        setPendingCount(result.failed)
        setStatus('pending')
        setError(`${result.failed} write${result.failed === 1 ? '' : 's'} failed. Local data is safe.`)
      } else {
        setConsecutiveSyncFailures(0)
        setAutoSyncPaused(false)
        const syncedAt = result.lastSyncedAt ?? new Date().toISOString()
        setPendingCount(0)
        setLastSyncedAt(syncedAt)
        writeLastSyncedAt(syncedAt)
        setStatus('synced')
        setConnectionTested(true)  // mark as tested since we just successfully synced
        setError(null)
      }
    } catch (err) {
      const nextFailures = consecutiveSyncFailures + 1
      setConsecutiveSyncFailures(nextFailures)
      if (nextFailures >= 3 && autoSyncEnabled) {
        setAutoSyncPaused(true)
        setAutoSyncEnabled(false)
      }
      setPendingCount(prev => Math.max(prev, 1))
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Cloud sync failed. Local data is still safe.')
    } finally {
      syncInFlightRef.current = false
    }
  }, [auth.user, canSync, connectionTested, status, conflictResolutions, consecutiveSyncFailures, autoSyncEnabled, data])

  // ─── Conflict resolution ───────────────────────────────────────────────────

  /**
   * Called by ConflictResolutionModal when the user has resolved all conflicts.
   * Merges new resolutions, clears the pending list, and re-runs sync.
   */
  const resolveConflicts = useCallback((resolutions: ConflictResolutions) => {
    setConflictResolutions(prev => ({ ...prev, ...resolutions }))
    setPendingConflicts([])
    setStatus('ready')
    // Re-run sync automatically after resolutions are applied
    setTimeout(() => { void runSyncNow() }, 0)
  }, [runSyncNow])

  /**
   * Cancel the conflict resolution — leaves sync in 'pending' state.
   * The user can retry sync later; resolutions accumulated so far are kept.
   */
  const dismissConflicts = useCallback(() => {
    setPendingConflicts([])
    setStatus('pending')
    setError('Sync paused — conflicts were not resolved. Retry sync to continue.')
  }, [])

  // ─── Auto-sync toggle ──────────────────────────────────────────────────────

  const handleSetAutoSyncEnabled = useCallback((enabled: boolean) => {
    setAutoSyncEnabled(enabled)
    if (!enabled && !connectionTested) setStatus(canSync ? 'idle' : 'guest')
  }, [canSync, connectionTested])

  // ── True auto-sync: fires 5s after any data change when enabled + tested ──
  useEffect(() => {
    if (!autoSyncEnabled || !connectionTested || !canSync || autoSyncPaused) return
    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current)
    autoSyncTimerRef.current = setTimeout(() => {
      void runSyncNow()
    }, 5000)
    return () => {
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current)
    }
  // fingerprint changes are the data-mutation signal
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint, autoSyncEnabled, connectionTested, canSync])

  // Derive guest/idle from canSync
  if (!canSync && status !== 'guest') setStatus('guest')
  else if (canSync && status === 'guest') setStatus('idle')

  const derivedStatus: CloudPersistenceStatus =
    !canSync ? 'guest' : status === 'guest' ? 'idle' : status

  return {
    status: derivedStatus,
    error,
    connectionTested,
    connectionTestError,
    lastResult,
    lastSyncedAt,
    pendingCount,
    pendingConflicts,
    canSync,
    autoSyncEnabled,
    autoSyncPaused,
    fingerprint,
    setAutoSyncEnabled: handleSetAutoSyncEnabled,
    runConnectionTest,
    resolveConflicts,
    dismissConflicts,
    retryNow: runSyncNow,
    syncNow:  runSyncNow,
  }
}
