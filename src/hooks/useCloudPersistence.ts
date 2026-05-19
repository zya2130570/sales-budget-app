import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Account, Category, SavedScenarioSet, SavedTargetSet, Target, Transaction, TransactionRule } from '../types'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import { persistCoreDataToCloud, type CloudPersistSummary } from '../utils/cloudPersistence'

type CloudPersistenceStatus = 'guest' | 'idle' | 'syncing' | 'synced' | 'pending' | 'error'

type UseCloudPersistenceArgs = {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  rules: TransactionRule[]
  targets: Target[]
  savedTargetSets: SavedTargetSet[]
  savedScenarios: SavedScenarioSet[]
}

const QUEUE_KEY = 'flow_cloud_sync_pending'
const LAST_SYNC_KEY = 'flow_cloud_last_sync_at'

const readPendingCount = (): number => {
  try {
    return Number(localStorage.getItem(QUEUE_KEY) ?? '0') || 0
  } catch {
    return 0
  }
}

const writePendingCount = (count: number) => {
  try { localStorage.setItem(QUEUE_KEY, String(Math.max(0, count))) } catch { /* ignore */ }
}

const readLastSyncedAt = (): string | null => {
  try { return localStorage.getItem(LAST_SYNC_KEY) } catch { return null }
}

const writeLastSyncedAt = (value: string) => {
  try { localStorage.setItem(LAST_SYNC_KEY, value) } catch { /* ignore */ }
}

/**
 * Local-first cloud persistence coordinator.
 *
 * Important behavior:
 * - localStorage remains the source of truth.
 * - failed syncs do not enqueue duplicate pending work on every retry.
 * - pendingCount represents the latest failed-write estimate, not a cumulative retry counter.
 */
export function useCloudPersistence(data: UseCloudPersistenceArgs) {
  const auth = useAuth()
  const [status, setStatus] = useState<CloudPersistenceStatus>('guest')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => readLastSyncedAt())
  const [pendingCount, setPendingCount] = useState(() => readPendingCount())
  const [lastResult, setLastResult] = useState<CloudPersistSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncInFlightRef = useRef(false)
  const lastAttemptedFingerprintRef = useRef<string | null>(null)

  const canSync = Boolean(auth.isConfigured && auth.user && supabase)

  const fingerprint = useMemo(() => JSON.stringify({
    accounts: data.accounts.map(item => [item.id, item.updatedAt, item.balance, item.name]),
    categories: data.categories.map(item => [item.id, item.name, item.amount, item.type]),
    transactions: data.transactions.map(item => [item.id, item.updatedAt, item.date, item.amount, item.categoryId]),
    rules: data.rules.map(item => [item.id, item.updatedAt, item.matchText, item.categoryId]),
    targets: data.targets.map(item => [item.id, item.updatedAt, item.currentSaved, item.goalAmount, item.contributions?.length ?? 0]),
    savedTargetSets: data.savedTargetSets.map(item => [item.name, item.savedAt]),
    savedScenarios: data.savedScenarios.map(item => [item.name, item.savedAt]),
  }), [data.accounts, data.categories, data.transactions, data.rules, data.targets, data.savedTargetSets, data.savedScenarios])

  const setPendingSafely = useCallback((count: number) => {
    const next = Math.max(0, count)
    setPendingCount(next)
    writePendingCount(next)
  }, [])

  const runSyncNow = useCallback(async (force = false) => {
    if (!canSync || !auth.user || !supabase) {
      setStatus('guest')
      return
    }
    if (syncInFlightRef.current) return

    if (!force && lastAttemptedFingerprintRef.current === fingerprint && (status === 'pending' || status === 'error')) {
      return
    }

    syncInFlightRef.current = true
    lastAttemptedFingerprintRef.current = fingerprint
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
        const failedCount = Math.max(1, result.failed)
        setPendingSafely(failedCount)
        setStatus('pending')
        setError(`${failedCount} cloud write${failedCount === 1 ? '' : 's'} need retry.`)
      } else {
        const syncedAt = result.lastSyncedAt ?? new Date().toISOString()
        setPendingSafely(0)
        setLastSyncedAt(syncedAt)
        writeLastSyncedAt(syncedAt)
        setStatus('synced')
      }
    } catch (err) {
      setPendingSafely(Math.max(1, pendingCount))
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Cloud sync failed. Local data is still saved.')
    } finally {
      syncInFlightRef.current = false
    }
  }, [auth.user, canSync, data, fingerprint, pendingCount, setPendingSafely, status])

  useEffect(() => {
    if (!canSync) {
      setStatus('guest')
      return
    }
    if (!autoSyncEnabled) {
      setStatus(pendingCount > 0 ? 'pending' : 'idle')
      return
    }

    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => {
      void runSyncNow(false)
    }, 1500)

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [autoSyncEnabled, canSync, fingerprint, runSyncNow])

  const retryNow = useCallback(() => {
    void runSyncNow(true)
  }, [runSyncNow])

  return {
    status,
    error,
    lastResult,
    lastSyncedAt,
    pendingCount,
    canSync,
    autoSyncEnabled,
    setAutoSyncEnabled,
    retryNow,
  }
}
