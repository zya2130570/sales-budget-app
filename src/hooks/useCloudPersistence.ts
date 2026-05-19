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

  const runSyncNow = useCallback(async () => {
    if (!canSync || !auth.user || !supabase) {
      setStatus('guest')
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
        const nextPending = pendingCount + result.failed
        setPendingCount(nextPending)
        writePendingCount(nextPending)
        setStatus('pending')
        setError(`${result.failed} cloud write${result.failed === 1 ? '' : 's'} need retry.`)
      } else {
        const syncedAt = result.lastSyncedAt ?? new Date().toISOString()
        setPendingCount(0)
        writePendingCount(0)
        setLastSyncedAt(syncedAt)
        writeLastSyncedAt(syncedAt)
        setStatus('synced')
      }
    } catch (err) {
      const nextPending = pendingCount + 1
      setPendingCount(nextPending)
      writePendingCount(nextPending)
      setStatus('error')
      setError(err instanceof Error ? err.message : 'Cloud sync failed. Local data is still saved.')
    } finally {
      syncInFlightRef.current = false
    }
  }, [auth.user, canSync, data, pendingCount])

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
      void runSyncNow()
    }, 1500)

    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [autoSyncEnabled, canSync, fingerprint, pendingCount, runSyncNow])

  return {
    status,
    error,
    lastResult,
    lastSyncedAt,
    pendingCount,
    canSync,
    autoSyncEnabled,
    setAutoSyncEnabled,
    retryNow: runSyncNow,
  }
}
