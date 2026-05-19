/**
 * useCloudPersistence.ts — V12.4C
 *
 * Safe, non-aggressive cloud persistence coordinator.
 *
 * Key guarantees:
 * - Auto-sync is OFF by default. User must explicitly enable it.
 * - Cloud writes never run automatically on page load or after login.
 * - A connection test MUST pass before any full sync is allowed.
 * - Failed syncs do NOT requeue or retry automatically.
 * - pendingCount reflects the last failure count only — it never accumulates
 *   across retries, so 25 failed records stays 25, not 50 or 75.
 * - localStorage is always the source of truth; cloud is secondary.
 * - Console is not spammed: sync is only attempted when explicitly triggered.
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import type { Account, Category, SavedScenarioSet, SavedTargetSet, Target, Transaction, TransactionRule } from '../types'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import {
  persistCoreDataToCloud,
  testCloudConnection,
  type CloudConnectionTestResult,
  type CloudPersistSummary,
} from '../utils/cloudPersistence'

export type CloudPersistenceStatus =
  | 'guest'      // Supabase not configured or no user
  | 'idle'       // Logged in, no test run yet
  | 'testing'    // Connection test in progress
  | 'ready'      // Test passed, sync available
  | 'syncing'    // Full sync in progress
  | 'synced'     // Last sync completed successfully
  | 'pending'    // Last sync completed with failures
  | 'error'      // Connection test failed or sync threw

export type UseCloudPersistenceArgs = {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  rules: TransactionRule[]
  targets: Target[]
  savedTargetSets: SavedTargetSet[]
  savedScenarios: SavedScenarioSet[]
}

const LAST_SYNC_KEY = 'flow_cloud_last_sync_at'
// NOTE: We intentionally removed QUEUE_KEY (flow_cloud_sync_pending).
// Pending count is now held only in React state for the current session.
// This prevents a stale "25 pending" counter from appearing on every page load.

const readLastSyncedAt = (): string | null => {
  try { return localStorage.getItem(LAST_SYNC_KEY) } catch { return null }
}

const writeLastSyncedAt = (value: string) => {
  try { localStorage.setItem(LAST_SYNC_KEY, value) } catch { /* ignore */ }
}

export function useCloudPersistence(data: UseCloudPersistenceArgs) {
  const auth = useAuth()

  const [status, setStatus] = useState<CloudPersistenceStatus>('guest')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => readLastSyncedAt())
  // pendingCount is session-only — NOT persisted to localStorage.
  // It resets to 0 on each page load so stale failures don't accumulate.
  const [pendingCount, setPendingCount] = useState(0)
  const [lastResult, setLastResult] = useState<CloudPersistSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  // connectionTested: true once the test passes in this session.
  // Resets on page reload — intentional; we want a fresh test each session.
  const [connectionTested, setConnectionTested] = useState(false)
  const [connectionTestError, setConnectionTestError] = useState<string | null>(null)

  // autoSyncEnabled is OFF by default.
  // Auto-sync will only run if the user explicitly enables it AND connectionTested is true.
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false)

  const syncInFlightRef = useRef(false)
  const testInFlightRef = useRef(false)

  const canSync = Boolean(auth.isConfigured && auth.user && supabase)

  /**
   * Stable fingerprint of the current data snapshot.
   * Only used by consumers who want to track whether data changed since
   * the last sync. Not used to auto-trigger sync anymore.
   */
  const fingerprint = useMemo(() => JSON.stringify({
    accounts: data.accounts.map(item => [item.id, item.updatedAt, item.balance, item.name]),
    categories: data.categories.map(item => [item.id, item.name, item.amount, item.type]),
    transactions: data.transactions.map(item => [item.id, item.updatedAt, item.date, item.amount, item.categoryId]),
    rules: data.rules.map(item => [item.id, item.updatedAt, item.matchText, item.categoryId]),
    targets: data.targets.map(item => [item.id, item.updatedAt, item.currentSaved, item.goalAmount, item.contributions?.length ?? 0]),
    savedTargetSets: data.savedTargetSets.map(item => [item.name, item.savedAt]),
    savedScenarios: data.savedScenarios.map(item => [item.name, item.savedAt]),
  }), [data.accounts, data.categories, data.transactions, data.rules, data.targets, data.savedTargetSets, data.savedScenarios])

  /**
   * Runs a tiny, read-only test against Supabase to verify connectivity
   * and RLS permissions BEFORE any bulk sync is attempted.
   *
   * - Must succeed before runSyncNow is allowed.
   * - Does NOT write data.
   * - On failure, shows the exact error (e.g. 403 / RLS details).
   */
  const runConnectionTest = useCallback(async (): Promise<CloudConnectionTestResult> => {
    if (!canSync || !auth.user || !supabase) {
      return { ok: false, error: 'Not logged in or Supabase not configured.' }
    }
    if (testInFlightRef.current) {
      return { ok: false, error: 'Test already in progress.' }
    }

    testInFlightRef.current = true
    setStatus('testing')
    setError(null)
    setConnectionTestError(null)

    try {
      const result = await testCloudConnection(supabase, auth.user.id)

      if (result.ok) {
        setConnectionTested(true)
        setConnectionTestError(null)
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

  /**
   * Runs a full sync of all local data to Supabase.
   *
   * Guards:
   * 1. canSync must be true (logged in + Supabase configured).
   * 2. connectionTested must be true (test must have passed first).
   * 3. Not already in-flight.
   *
   * On failure:
   * - Sets pendingCount to the number of failed rows from this run.
   * - Does NOT retry automatically.
   * - Does NOT increment pendingCount on repeated manual retries
   *   (it's replaced, not accumulated).
   */
  const runSyncNow = useCallback(async () => {
    if (!canSync || !auth.user || !supabase) {
      setStatus('guest')
      return
    }
    if (!connectionTested) {
      setError('Run the connection test before syncing.')
      return
    }
    if (syncInFlightRef.current) return

    syncInFlightRef.current = true
    setStatus('syncing')
    setError(null)

    try {
      const result = await persistCoreDataToCloud({
        supabase,
        userId: auth.user.id,
        ...data,
      })

      setLastResult(result)

      if (result.failed > 0) {
        // Replace pending count — do NOT add to existing count.
        // This prevents "25 pending" becoming "50 pending" on retry.
        setPendingCount(result.failed)
        setStatus('pending')
        setError(`${result.failed} cloud write${result.failed === 1 ? '' : 's'} failed. Local data is safe.`)
      } else {
        const syncedAt = result.lastSyncedAt ?? new Date().toISOString()
        setPendingCount(0)
        setLastSyncedAt(syncedAt)
        writeLastSyncedAt(syncedAt)
        setStatus('synced')
        setError(null)
      }
    } catch (err) {
      // On a thrown error, set pending to 1 (something failed) but do NOT
      // multiply it. If 25 rows were pending before, they're still 25 — we
      // don't know the new count, so we leave it at the previous value or 1.
      setPendingCount(prev => Math.max(prev, 1))
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Cloud sync failed. Local data is still safe.')
    } finally {
      syncInFlightRef.current = false
    }
  }, [auth.user, canSync, connectionTested, data])

  /**
   * Toggles auto-sync. Setting it to true is only meaningful after
   * connectionTested is true. If not yet tested, enabling auto-sync
   * has no immediate effect — the user still needs to run the test.
   *
   * Auto-sync is intentionally not wired to a useEffect that fires on
   * fingerprint changes. In V12.4C, "auto-sync" means the user
   * has opted in, but sync is still only triggered by explicit user
   * action (e.g. clicking "Sync now"). This prevents the 403 spam.
   *
   * If you want true auto-sync in a future version, add a useEffect
   * here gated on `autoSyncEnabled && connectionTested`.
   */
  const handleSetAutoSyncEnabled = useCallback((enabled: boolean) => {
    setAutoSyncEnabled(enabled)
    if (!enabled) {
      // Transitioning off: reflect the pending count in status if needed
      if (!connectionTested) {
        setStatus(canSync ? 'idle' : 'guest')
      }
    }
  }, [canSync, connectionTested])

  // Compute derived idle/guest status on auth changes without a side-effect loop
  const derivedStatus: CloudPersistenceStatus = (() => {
    if (!canSync) return 'guest'
    // Only override to idle if no meaningful status is already set
    if (status === 'guest') return 'idle'
    return status
  })()

  // Sync the status when canSync changes (e.g. user logs out)
  // We use a ref to avoid adding setStatus to dependency arrays
  if (!canSync && status !== 'guest') {
    setStatus('guest')
  } else if (canSync && status === 'guest') {
    setStatus('idle')
  }

  return {
    status: derivedStatus,
    error,
    connectionTested,
    connectionTestError,
    lastResult,
    lastSyncedAt,
    pendingCount,
    canSync,
    autoSyncEnabled,
    fingerprint,
    setAutoSyncEnabled: handleSetAutoSyncEnabled,
    runConnectionTest,
    /** @deprecated Use runConnectionTest first, then syncNow */
    retryNow: runSyncNow,
    syncNow: runSyncNow,
  }
}
