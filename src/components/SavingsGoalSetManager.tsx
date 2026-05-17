import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type { SavedTargetSet, Target } from '../types'
import { Card } from './ui'

type SavingsGoalSetManagerProps = {
  targetSetName: string
  setTargetSetName: Dispatch<SetStateAction<string>>
  targets: Target[]
  setTargets: Dispatch<SetStateAction<Target[]>>
  savedTargetSets: SavedTargetSet[]
  setSavedTargetSets: Dispatch<SetStateAction<SavedTargetSet[]>>
  savedTargetSetsHistory: SavedTargetSet[][]
  savedTargetSetsRedo: SavedTargetSet[][]
  editingSetIdx: number | null
  setEditingSetIdx: Dispatch<SetStateAction<number | null>>
  renameSetValue: string
  setRenameSetValue: Dispatch<SetStateAction<string>>
  renameSetRowRef: MutableRefObject<HTMLDivElement | null>
  pushSetHistory: (sets: SavedTargetSet[]) => void
  pushTargetHistory: (targets: Target[]) => void
  undoSavedSets: () => void
  redoSavedSets: () => void
  showToast: (message: string) => void
}

export function SavingsGoalSetManager({
  targetSetName,
  setTargetSetName,
  targets,
  setTargets,
  savedTargetSets,
  setSavedTargetSets,
  savedTargetSetsHistory,
  savedTargetSetsRedo,
  editingSetIdx,
  setEditingSetIdx,
  renameSetValue,
  setRenameSetValue,
  renameSetRowRef,
  pushSetHistory,
  pushTargetHistory,
  undoSavedSets,
  redoSavedSets,
  showToast,
}: SavingsGoalSetManagerProps) {
  const saveRename = (idx: number, currentName: string) => {
    const newName = renameSetValue.trim()
    if (!newName) return
    if (newName !== currentName) {
      pushSetHistory(savedTargetSets)
      setSavedTargetSets(prev => prev.map((x, i) => i === idx ? { ...x, name: newName, savedAt: new Date().toISOString() } : x))
      showToast('Savings goal set renamed.')
    }
    setEditingSetIdx(null)
  }

  return (
    <Card title="Savings Goal Sets" noHover>
      <div className="grid md:grid-cols-3 gap-2">
        <input className="p-2 rounded bg-slate-800 border border-slate-600" value={targetSetName} onChange={(e) => setTargetSetName(e.target.value)} placeholder="Savings goal set name" />
        <button className="rounded bg-blue-600" onClick={() => {
          const n = targetSetName.trim()
          if (!n) return
          pushSetHistory(savedTargetSets)
          setSavedTargetSets([{ name: n, targets, savedAt: new Date().toISOString() }, ...savedTargetSets.filter(s => s.name.toLowerCase() !== n.toLowerCase())])
          showToast('Savings goal set saved.')
        }}>Save</button>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-400">Saved locally</div>
          {savedTargetSetsHistory.length > 0 && (
            <button onClick={undoSavedSets} className="text-xs text-slate-400 hover:text-slate-200 underline">Undo</button>
          )}
          {savedTargetSetsRedo.length > 0 && (
            <button onClick={redoSavedSets} className="text-xs text-slate-400 hover:text-slate-200 underline">Redo</button>
          )}
        </div>
      </div>
      <div className="space-y-2 mt-2">
        {savedTargetSets.map((s, idx) => (
          <div key={s.name} className="rounded border border-slate-700 p-2 flex justify-between items-center gap-2">
            {editingSetIdx === idx ? (
              <div
                ref={el => { renameSetRowRef.current = el }}
                className="flex flex-1 items-center gap-2"
                onBlur={e => {
                  if (!renameSetRowRef.current?.contains(e.relatedTarget as Node)) {
                    saveRename(idx, s.name)
                  }
                }}
              >
                <input
                  className="flex-1 p-1 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                  value={renameSetValue}
                  onChange={e => setRenameSetValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveRename(idx, s.name)
                    if (e.key === 'Escape') setEditingSetIdx(null)
                  }}
                  autoFocus
                />
                <div className="flex gap-2 shrink-0">
                  <button className="text-blue-300 hover:text-blue-200 text-sm" onMouseDown={e => { e.preventDefault(); saveRename(idx, s.name) }}>Save</button>
                  <button className="text-slate-400 hover:text-slate-300 text-sm" onMouseDown={e => { e.preventDefault(); setEditingSetIdx(null) }}>Cancel</button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <div className="text-sm font-medium">{s.name}</div>
                  <div className="text-xs text-slate-400">{new Date(s.savedAt).toLocaleString()}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="text-blue-300 hover:text-blue-200 text-sm" onClick={() => {
                    const same = JSON.stringify(targets) === JSON.stringify(s.targets)
                    if (!same) {
                      pushTargetHistory(targets)
                      setTargets(s.targets)
                      showToast('Savings goal set loaded.')
                    }
                  }}>Load</button>
                  <button className="text-slate-400 hover:text-slate-300 text-sm" onClick={() => { setEditingSetIdx(idx); setRenameSetValue(s.name) }}>Rename</button>
                  <button className="text-red-300 hover:text-red-200 text-sm" onClick={() => { pushSetHistory(savedTargetSets); setSavedTargetSets(prev => prev.filter(x => x.name !== s.name)) }}>Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
