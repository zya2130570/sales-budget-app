import { useCallback, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './useAuth'
import {
  analyzeLocalCloudReconciliation,
  getCloudDatasetSummary,
  getLocalDatasetSummary,
} from '../utils/reconciliationEngine'
import type { DatasetSummary, ReconciliationAnalysis } from '../utils/reconciliationEngine'
import { fetchCloudDataForRestore, type CloudRestoreSummary } from '../utils/cloudRestore'
import {
  downloadBackupFile,
  applyCloudRestoreToLocalStorage,
  loadAccounts, loadCategories, loadTargets, loadTransactionRules,
  loadSavedBudgets, loadSavedScenarios, loadSavedTargetSets,
  saveAccounts, saveCategories, saveTargets, saveTransactionRules,
  saveSavedBudgets, saveSavedScenarios, saveSavedTargetSets,
} from '../utils/storage'

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

  // Restore state
  const [restoring, setRestoring] = useState(false)
  const [restoreSummary, setRestoreSummary] = useState<CloudRestoreSummary | null>(null)

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
    setStatus('Local data is already active — no changes needed.')
  }, [])

  const chooseCloud = useCallback(async () => {
    if (!auth.user || !supabase) return
    setRestoring(true)
    setError(null)
    setSelectedChoice('cloud')
    setStatus('Downloading local backup…')

    try {
      // Always download a local backup before overwriting
      downloadBackupFile()

      setStatus('Fetching cloud data…')
      const restored = await fetchCloudDataForRestore(supabase, auth.user.id)

      if (restored.summary.errors.length > 0) {
        setError(`Some entities failed to fetch: ${restored.summary.errors.join(', ')}`)
      }

      setStatus('Writing cloud data to local storage…')
      applyCloudRestoreToLocalStorage(restored)
      setRestoreSummary(restored.summary)
      setStatus(
        `Restore complete — ${restored.summary.accounts} accounts, ${restored.summary.categories} categories, ${restored.summary.transactions} transactions restored. Reloading…`
      )

      // Short delay so the user can read the status, then reload
      setTimeout(() => window.location.reload(), 1800)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Restore failed.'
      setError(msg)
      setStatus('Restore failed. Local data was not changed.')
      setSelectedChoice(null)
    } finally {
      setRestoring(false)
    }
  }, [auth.user])

  const chooseMergeSafe = useCallback(async () => {
    if (!auth.user || !supabase) return
    setRestoring(true)
    setError(null)
    setSelectedChoice('merge-safe')
    setStatus('Fetching cloud data to find gaps…')

    try {
      const cloud = await fetchCloudDataForRestore(supabase, auth.user.id)

      // Build local ID sets for safe entity types (never merge transactions)
      const localAccountIds  = new Set((loadAccounts() ?? []).map(r => r.id))
      const localCategoryIds = new Set((loadCategories() ?? []).map(r => r.id))
      const localGoalIds     = new Set((loadTargets() ?? []).map(r => r.id))
      const localRuleIds     = new Set((loadTransactionRules() ?? []).map(r => r.id))
      const localBudgetNames = new Set((loadSavedBudgets() ?? []).map(r => r.name + r.savedAt))
      const localScenarioNames = new Set((loadSavedScenarios() ?? []).map(r => r.name + r.savedAt))
      const localSetNames    = new Set((loadSavedTargetSets() ?? []).map(r => r.name + r.savedAt))

      // Only cloud-only records (exist in cloud but NOT locally)
      const newAccounts   = cloud.accounts.filter(r => !localAccountIds.has(r.id))
      const newCategories = cloud.categories.filter(r => !localCategoryIds.has(r.id))
      const newGoals      = cloud.targets.filter(r => !localGoalIds.has(r.id))
      const newRules      = cloud.rules.filter(r => !localRuleIds.has(r.id))
      const newBudgets    = cloud.savedBudgets.filter(r => !localBudgetNames.has(r.name + r.savedAt))
      const newScenarios  = cloud.savedScenarios.filter(r => !localScenarioNames.has(r.name + r.savedAt))
      const newGoalSets   = cloud.savedTargetSets.filter(r => !localSetNames.has(r.name + r.savedAt))

      const totalAdded = newAccounts.length + newCategories.length + newGoals.length +
        newRules.length + newBudgets.length + newScenarios.length + newGoalSets.length

      if (totalAdded === 0) {
        setStatus('Safe merge complete — local already has everything from cloud. No changes made.')
        setRestoring(false)
        return
      }

      // Merge: append cloud-only records to local state
      if (newAccounts.length)   saveAccounts([...(loadAccounts() ?? []), ...newAccounts])
      if (newCategories.length) saveCategories([...(loadCategories() ?? []), ...newCategories])
      if (newGoals.length)      saveTargets([...(loadTargets() ?? []), ...newGoals])
      if (newRules.length)      saveTransactionRules([...(loadTransactionRules() ?? []), ...newRules])
      if (newBudgets.length)    saveSavedBudgets([...(loadSavedBudgets() ?? []), ...newBudgets])
      if (newScenarios.length)  saveSavedScenarios([...(loadSavedScenarios() ?? []), ...newScenarios])
      if (newGoalSets.length)   saveSavedTargetSets([...(loadSavedTargetSets() ?? []), ...newGoalSets])

      setRestoreSummary(cloud.summary)
      setStatus(
        `Safe merge complete — added ${totalAdded} cloud-only record${totalAdded === 1 ? '' : 's'} locally. ` +
        `(${newAccounts.length} accounts, ${newCategories.length} categories, ${newGoals.length} goals, ${newRules.length} rules.) ` +
        `Transactions were not touched. Reloading…`
      )
      setTimeout(() => window.location.reload(), 1800)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Safe merge failed.'
      setError(msg)
      setStatus('Safe merge failed. Local data was not changed.')
      setSelectedChoice(null)
    } finally {
      setRestoring(false)
    }
  }, [auth.user])

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
  }
}
