/**
 * useCloudPersistence.ts — V12.5
 *
 * Coordinator for local→cloud sync with:
 * - Batch upsert (no more N+1)
 * - Conflict detection and resolution
 * - New entities: savedBudgets, actuals
 * - Soft delete awareness (schema supports deleted_at; local delete propagation in V12.6)
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import type { Account, Category, SavedBudget, SavedScenarioSet, SavedTargetSet, Target, Transaction, TransactionRule } from '../types'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import {
  persistCoreDataToCloud,
  testCloudConnection,
  type CloudConnectionTestResult,
  type CloudPersistSummary,
  type ConflictRecord,
  type ConflictResolutions,
} from '../utils/cloudPersistence'

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
    if (!connectionTested) { setError('Run the connection test before syncing.'); return }
    if (syncInFlightRef.current) return

    syncInFlightRef.current = true
    setStatus('syncing')
    setError(null)

    try {
      const result = await persistCoreDataToCloud({
        supabase,
        userId: auth.user.id,
        ...data,
        resolutions: conflictResolutions,
      })

      setLastResult(result)

      // New conflicts found — pause sync and show modal
      if (result.conflicts.length > 0) {
        setPendingConflicts(result.conflicts)
        setStatus('conflicts')
        return
      }

      if (result.failed > 0) {
        setPendingCount(result.failed)
        setStatus('pending')
        setError(`${result.failed} write${result.failed === 1 ? '' : 's'} failed. Local data is safe.`)
      } else {
        const syncedAt = result.lastSyncedAt ?? new Date().toISOString()
        setPendingCount(0)
        setLastSyncedAt(syncedAt)
        writeLastSyncedAt(syncedAt)
        setStatus('synced')
        setError(null)
      }
    } catch (err) {
      setPendingCount(prev => Math.max(prev, 1))
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Cloud sync failed. Local data is still safe.')
    } finally {
      syncInFlightRef.current = false
    }
  }, [auth.user, canSync, connectionTested, conflictResolutions, data])

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
    fingerprint,
    setAutoSyncEnabled: handleSetAutoSyncEnabled,
    runConnectionTest,
    resolveConflicts,
    dismissConflicts,
    retryNow: runSyncNow,
    syncNow:  runSyncNow,
  }
}
