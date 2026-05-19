import { useEffect, useState } from 'react'
import type { Period, SavedScenarioSet, ScenarioName } from '../types'
import { scenarioDefaults } from '../utils/calculations'
import { loadSavedScenarios, runMigrations, saveSavedScenarios } from '../utils/storage'
import { loadScenarioNotes, saveScenarioNotes } from '../utils/persistence'

export type ScenarioStressMode = 'none' | 'commission-25' | 'commission-50' | 'extra-expense' | 'higher-bills'

export function useScenarios() {
  const [scenario, setScenario] = useState<Record<ScenarioName, number>>(scenarioDefaults)
  const [savedScenarios, setSavedScenarios] = useState<SavedScenarioSet[]>([])
  const [scenarioNotes, setScenarioNotes] = useState<Record<string, string>>({})
  const [editingScenarioName, setEditingScenarioName] = useState<string | null>(null)
  const [renameScenarioValue, setRenameScenarioValue] = useState('')
  const [scenarioStressMode, setScenarioStressMode] = useState<ScenarioStressMode>('none')
  const [showStressTest, setShowStressTest] = useState(false)
  const [scenarioTitle, setScenarioTitle] = useState('')

  useEffect(() => {
    runMigrations()
    const saved = loadSavedScenarios()
    if (saved) setSavedScenarios(saved)
    setScenarioNotes(loadScenarioNotes())
  }, [])

  useEffect(() => saveSavedScenarios(savedScenarios), [savedScenarios])
  useEffect(() => saveScenarioNotes(scenarioNotes), [scenarioNotes])

  const saveScenarioSet = (name: string, period: Period) => {
    const n = name.trim()
    if (!n) return false
    const existing = savedScenarios.find(s => s.name.toLowerCase() === n.toLowerCase())
    if (existing && !window.confirm('Overwrite existing set?')) return false
    setSavedScenarios([
      { name: n, scenarios: scenario, period, savedAt: new Date().toISOString() },
      ...savedScenarios.filter(s => s.name.toLowerCase() !== n.toLowerCase()),
    ])
    setScenarioTitle('')
    return true
  }

  const renameScenarioSet = (oldName: string, nextName: string) => {
    const nn = nextName.trim()
    if (!nn) return false
    setSavedScenarios(prev => prev.map(item => item.name === oldName ? { ...item, name: nn, savedAt: new Date().toISOString() } : item))
    setScenarioNotes(prev => {
      const next = { ...prev }
      if (next[oldName]) {
        next[nn] = next[oldName]
        delete next[oldName]
      }
      return next
    })
    setEditingScenarioName(null)
    return true
  }

  return {
    scenario,
    setScenario,
    savedScenarios,
    setSavedScenarios,
    scenarioNotes,
    setScenarioNotes,
    editingScenarioName,
    setEditingScenarioName,
    renameScenarioValue,
    setRenameScenarioValue,
    scenarioStressMode,
    setScenarioStressMode,
    showStressTest,
    setShowStressTest,
    scenarioTitle,
    setScenarioTitle,
    saveScenarioSet,
    renameScenarioSet,
  }
}
