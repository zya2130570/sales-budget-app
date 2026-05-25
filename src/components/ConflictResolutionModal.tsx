/**
 * ConflictResolutionModal.tsx — V12.5
 *
 * Shown when a sync detects cloud records newer than local.
 * The user picks "Keep Local" or "Use Cloud" for each conflict,
 * or uses the bulk "Keep all local / Use all cloud" buttons.
 *
 * After choosing, the parent calls onResolve() with the decisions,
 * which triggers a re-sync with the resolutions applied.
 */
import { useState, useMemo, useEffect } from 'react'
import type { ConflictRecord, ConflictResolution, ConflictResolutions } from '../utils/cloudPersistence'

function formatTs(ts: string | null): string {
  if (!ts) return 'No timestamp available'
  const d = new Date(ts)
  return isNaN(d.getTime()) ? 'Unknown date' : d.toLocaleString()
}

function entityLabel(entity: ConflictRecord['entity']): string {
  const labels: Record<string, string> = {
    accounts: 'Account',
    categories: 'Budget category',
    transaction_rules: 'Transaction rule',
    savings_goals: 'Savings goal',
    savings_goal_contributions: 'Goal contribution',
    savings_goal_sets: 'Goal set',
    scenarios: 'Scenario',
    saved_budgets: 'Saved budget',
    budget_actuals: 'Budget actuals',
    transactions: 'Transaction',
  }
  return labels[entity] ?? entity
}

type ConflictCardProps = {
  conflict: ConflictRecord
  resolution: ConflictResolution | null
  onPick: (choice: ConflictResolution) => void
}

function ConflictCard({ conflict, resolution, onPick }: ConflictCardProps) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{entityLabel(conflict.entity)}</span>
          <p className="text-sm font-semibold text-slate-100">{conflict.displayName}</p>
        </div>
        {resolution && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${resolution === 'local' ? 'bg-blue-900/60 text-blue-300' : 'bg-amber-900/60 text-amber-300'}`}>
            {resolution === 'local' ? 'Keep local' : 'Use cloud'}
          </span>
        )}
      </div>

      {/* Side-by-side comparison */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-blue-700/40 bg-blue-950/20 p-2.5 space-y-1.5">
          <p className="font-semibold text-blue-300 text-[10px] uppercase tracking-wide">Local version</p>
          <p className="text-slate-500 text-[10px]">{formatTs(conflict.localUpdatedAt)}</p>
          {conflict.fields.map(f => (
            <div key={f.label}>
              <span className="text-slate-500">{f.label}{f.label === "Amount" ? " (weekly)" : ""}: </span>
              <span className="text-slate-200">{f.localValue}</span>
            </div>
          ))}
        </div>
        <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-2.5 space-y-1.5">
          <p className="font-semibold text-amber-300 text-[10px] uppercase tracking-wide">Cloud version</p>
          <p className="text-slate-500 text-[10px]">{formatTs(conflict.cloudUpdatedAt)}</p>
          {conflict.fields.map(f => (
            <div key={f.label}>
              <span className="text-slate-500">{f.label}: </span>
              <span className="text-slate-200">{f.cloudValue}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Choice buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onPick('local')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${resolution === 'local' ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
        >
          Keep local
        </button>
        <button
          onClick={() => onPick('cloud')}
          className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${resolution === 'cloud' ? 'bg-amber-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
        >
          Use cloud
        </button>
      </div>
    </div>
  )
}

type Props = {
  conflicts: ConflictRecord[]
  onResolve: (resolutions: ConflictResolutions) => void
  onDismiss: () => void
}

export function ConflictResolutionModal({ conflicts, onResolve, onDismiss }: Props) {
  // Partition on mount: identical data → auto-resolve as 'local', real diffs → show to user
  const { realConflicts, autoResolutions } = useMemo(() => {
    const real: ConflictRecord[] = []
    const auto: ConflictResolutions = {}
    for (const c of conflicts) {
      const identical = c.fields.every(f => f.localValue === f.cloudValue)
      if (identical) {
        auto[c.localId] = 'local'   // same data — keep local (safe upsert)
      } else {
        real.push(c)
      }
    }
    return { realConflicts: real, autoResolutions: auto }
  }, [conflicts])

  const [choices, setChoices] = useState<ConflictResolutions>({})

  // If everything was auto-resolved (no real diffs), close immediately
  useEffect(() => {
    if (realConflicts.length === 0) {
      onResolve(autoResolutions)
    }
  }, [realConflicts.length, autoResolutions, onResolve])

  // V33 — Escape closes the modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onDismiss])

  const allResolved = realConflicts.every(c => choices[c.localId] !== undefined)
  const resolvedCount = Object.keys(choices).length

  const pick = (localId: string, choice: ConflictResolution) =>
    setChoices(prev => ({ ...prev, [localId]: choice }))

  const pickAll = (choice: ConflictResolution) => {
    const all = realConflicts.reduce<ConflictResolutions>((map, c) => {
      map[c.localId] = choice
      return map
    }, {})
    setChoices(all)
  }

  // Don't render anything if auto-resolving
  if (realConflicts.length === 0) return null

  const autoCount = Object.keys(autoResolutions).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl">

        {/* Header */}
        <div className="p-5 border-b border-slate-700 flex-shrink-0">
          <h2 className="text-base font-semibold text-slate-100">
            Sync conflict — {realConflicts.length} record{realConflicts.length === 1 ? '' : 's'} need review
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            The cloud has newer versions of these records. Choose which version to keep for each one.
            {autoCount > 0 && (
              <span className="text-emerald-400"> {autoCount} identical record{autoCount === 1 ? '' : 's'} auto-resolved.</span>
            )}
            {resolvedCount > 0 && resolvedCount < realConflicts.length && (
              <span className="text-blue-400"> {resolvedCount} of {realConflicts.length} resolved.</span>
            )}
          </p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => pickAll('local')} className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-900/40 hover:bg-blue-900/70 text-blue-300 transition-colors">
              Keep all local
            </button>
            <button onClick={() => pickAll('cloud')} className="text-[11px] px-2.5 py-1 rounded-lg bg-amber-900/40 hover:bg-amber-900/70 text-amber-300 transition-colors">
              Use all cloud
            </button>
          </div>
        </div>

        {/* Conflict list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {realConflicts.map(c => (
            <ConflictCard
              key={c.localId}
              conflict={c}
              resolution={choices[c.localId] ?? null}
              onPick={choice => pick(c.localId, choice)}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-700 flex justify-between items-center flex-shrink-0">
          <button
            onClick={onDismiss}
            className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel sync
          </button>
          <button
            onClick={() => onResolve({ ...autoResolutions, ...choices })}
            disabled={!allResolved}
            className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${allResolved ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
          >
            {allResolved ? 'Apply and finish sync' : `Resolve all ${realConflicts.length - resolvedCount} remaining`}
          </button>
        </div>
      </div>
    </div>
  )
}
