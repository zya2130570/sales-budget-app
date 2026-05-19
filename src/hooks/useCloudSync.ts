import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import {
  analyzeLocalCloudReconciliation,
  getCloudDatasetSummary,
  getLocalDatasetSummary,
} from '../utils/reconciliationEngine'
import type { DatasetSummary, ReconciliationAnalysis } from '../utils/reconciliationEngine'

export type CloudSyncChoice = 'local' | 'cloud' | 'merge-safe' | null

export function useCloudSync() {
  const auth = useAuth()
  const [localSummary, setLocalSummary] = useState<DatasetSummary>(() => getLocalDatasetSummary())
  const [cloudSummary, setCloudSummary] = useState<DatasetSummary | null>(null)
  const [analysis, setAnalysis] = useState<ReconciliationAnalysis>(() =>
    analyzeLocalCloudReconciliation(getLocalDatasetSummary(), {
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
    }),
  )
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string>('Cloud reconciliation has not been checked yet.')
  const [error, setError] = useState<string | null>(null)
  const [selectedChoice, setSelectedChoice] = useState<CloudSyncChoice>(null)

  const canCheckCloud = Boolean(auth.isConfigured && auth.user && supabase)

  const refresh = useCallback(async () => {
    const nextLocal = getLocalDatasetSummary()
    setLocalSummary(nextLocal)
    setError(null)
    setSelectedChoice(null)

    if (!auth.isConfigured) {
      const nextCloud = await getCloudDatasetSummary(null, null)
      setCloudSummary(nextCloud)
      setAnalysis(analyzeLocalCloudReconciliation(nextLocal, nextCloud))
      setStatus('Guest mode: cloud comparison is unavailable until Supabase is configured.')
      return
    }

    if (!auth.user) {
      const nextCloud = await getCloudDatasetSummary(null, null)
      setCloudSummary(nextCloud)
      setAnalysis(analyzeLocalCloudReconciliation(nextLocal, nextCloud))
      setStatus('Sign in to compare this device with your cloud data.')
      return
    }

    setLoading(true)
    try {
      const nextCloud = await getCloudDatasetSummary(supabase, auth.user.id)
      setCloudSummary(nextCloud)
      setAnalysis(analyzeLocalCloudReconciliation(nextLocal, nextCloud))
      setStatus('Comparison refreshed. No data was changed.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Cloud comparison failed.'
      setError(message)
      setStatus('Cloud comparison failed. Local app data was not changed.')
    } finally {
      setLoading(false)
    }
  }, [auth.isConfigured, auth.user])

  const chooseLocal = useCallback(() => {
    setSelectedChoice('local')
    setStatus('Local data selected as the preferred source. V12.3 does not upload or overwrite yet.')
  }, [])

  const chooseCloud = useCallback(() => {
    setSelectedChoice('cloud')
    setStatus('Cloud data selected as the preferred source. V12.3 does not replace localStorage yet.')
  }, [])

  const chooseMergeSafe = useCallback(() => {
    setSelectedChoice('merge-safe')
    setStatus('Safe merge selected for review. V12.3 only identifies safe/unsafe areas; it does not merge destructive financial data.')
  }, [])

  const summary = useMemo(() => ({
    canCheckCloud,
    isSignedIn: Boolean(auth.user),
    userEmail: auth.user?.email ?? null,
  }), [auth.user, canCheckCloud])

  return {
    auth,
    localSummary,
    cloudSummary,
    analysis,
    loading,
    status,
    error,
    selectedChoice,
    summary,
    refresh,
    chooseLocal,
    chooseCloud,
    chooseMergeSafe,
  }
}
