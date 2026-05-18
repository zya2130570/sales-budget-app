import { useEffect, useState } from 'react'
import type { SavedTargetSet, Target } from '../types'
import { loadSavedTargetSets, loadTargets, runMigrations, saveSavedTargetSets, saveTargets } from '../utils/storage'

type TargetForm = { name: string; goalAmount: string; currentSaved: string; startDate: string; deadline: string }
type ContributionForm = { date: string; amount: string; note: string }

export function useSavingsGoals() {
  const [targets, setTargets] = useState<Target[]>([])
  const [savedTargetSets, setSavedTargetSets] = useState<SavedTargetSet[]>([])
  const [targetSetName, setTargetSetName] = useState('')
  const [targetForm, setTargetForm] = useState<TargetForm>(() => ({ name: '', goalAmount: '', currentSaved: '', startDate: new Date().toISOString().slice(0, 10), deadline: '' }))
  const [targetLogForm, setTargetLogForm] = useState<Record<string, ContributionForm>>({})
  const [dashboardQuickDate, setDashboardQuickDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dashboardQuickTargetId, setDashboardQuickTargetId] = useState('')
  const [dashboardQuickAmount, setDashboardQuickAmount] = useState('')
  const [showTargetSuggestions, setShowTargetSuggestions] = useState(false)
  const [targetSuggestionIndex, setTargetSuggestionIndex] = useState(-1)
  const [editTargetHint, setEditTargetHint] = useState('')
  const [targetFormHint, setTargetFormHint] = useState('')
  const [editTargetId, setEditTargetId] = useState<string | null>(null)
  const [editTargetForm, setEditTargetForm] = useState<TargetForm>({ name: '', goalAmount: '', currentSaved: '', startDate: '', deadline: '' })
  const [editTargetOriginal, setEditTargetOriginal] = useState<Target | null>(null)
  const [editContributionId, setEditContributionId] = useState<string | null>(null)
  const [editContributionTargetId, setEditContributionTargetId] = useState<string | null>(null)
  const [editContributionForm, setEditContributionForm] = useState<ContributionForm>({ date: '', amount: '', note: '' })
  const [targetHistory, setTargetHistory] = useState<Target[][]>([])
  const [targetRedo, setTargetRedo] = useState<Target[][]>([])
  const [targetFormHistory, setTargetFormHistory] = useState<TargetForm[]>([])
  const [targetFormRedo, setTargetFormRedo] = useState<TargetForm[]>([])
  const [fullyFundedOpen, setFullyFundedOpen] = useState(true)
  const [completedOpen, setCompletedOpen] = useState(true)
  const [deadlinePassedPrompted, setDeadlinePassedPrompted] = useState<Set<string>>(new Set())
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())
  const [goalPriorities, setGoalPriorities] = useState<Record<string, 'high' | 'medium' | 'low'>>({})
  const [pausedGoals, setPausedGoals] = useState<Set<string>>(new Set())
  const [editingSetIdx, setEditingSetIdx] = useState<number | null>(null)
  const [renameSetValue, setRenameSetValue] = useState('')
  const [savedTargetSetsHistory, setSavedTargetSetsHistory] = useState<SavedTargetSet[][]>([])
  const [savedTargetSetsRedo, setSavedTargetSetsRedo] = useState<SavedTargetSet[][]>([])

  useEffect(() => {
    runMigrations()
    const t = loadTargets(); if (t) setTargets(t)
    const ts = loadSavedTargetSets(); if (ts) setSavedTargetSets(ts)
  }, [])

  useEffect(() => saveTargets(targets), [targets])
  useEffect(() => saveSavedTargetSets(savedTargetSets), [savedTargetSets])

  return {
    targets,
    setTargets,
    savedTargetSets,
    setSavedTargetSets,
    targetSetName,
    setTargetSetName,
    targetForm,
    setTargetForm,
    targetLogForm,
    setTargetLogForm,
    dashboardQuickDate,
    setDashboardQuickDate,
    dashboardQuickTargetId,
    setDashboardQuickTargetId,
    dashboardQuickAmount,
    setDashboardQuickAmount,
    showTargetSuggestions,
    setShowTargetSuggestions,
    targetSuggestionIndex,
    setTargetSuggestionIndex,
    editTargetHint,
    setEditTargetHint,
    targetFormHint,
    setTargetFormHint,
    editTargetId,
    setEditTargetId,
    editTargetForm,
    setEditTargetForm,
    editTargetOriginal,
    setEditTargetOriginal,
    editContributionId,
    setEditContributionId,
    editContributionTargetId,
    setEditContributionTargetId,
    editContributionForm,
    setEditContributionForm,
    targetHistory,
    setTargetHistory,
    targetRedo,
    setTargetRedo,
    targetFormHistory,
    setTargetFormHistory,
    targetFormRedo,
    setTargetFormRedo,
    fullyFundedOpen,
    setFullyFundedOpen,
    completedOpen,
    setCompletedOpen,
    deadlinePassedPrompted,
    setDeadlinePassedPrompted,
    expandedCards,
    setExpandedCards,
    goalPriorities,
    setGoalPriorities,
    pausedGoals,
    setPausedGoals,
    editingSetIdx,
    setEditingSetIdx,
    renameSetValue,
    setRenameSetValue,
    savedTargetSetsHistory,
    setSavedTargetSetsHistory,
    savedTargetSetsRedo,
    setSavedTargetSetsRedo,
  }
}
