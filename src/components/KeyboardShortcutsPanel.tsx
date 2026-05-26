/**
 * KeyboardShortcutsPanel.tsx — V41
 * Editable keyboard shortcuts reference.
 * - Built-in shortcuts: edit description/key label only (behavior is hardcoded in Sidebar.tsx)
 * - Custom rows: personal notes only — no app behavior is wired, it is a reference cheat sheet
 * - Undo/redo for custom row deletions
 * - Persisted to localStorage (Supabase sync planned for V42)
 */
import { useEffect, useRef, useState } from 'react'

const LS_KEY = 'flow_custom_shortcuts'

type ShortcutRow = {
  id: string
  keys: string
  action: string
  builtIn: boolean
}

const BUILT_IN: ShortcutRow[] = [
  { id: 'nav',      keys: '1 – 7',         action: 'Jump between main sections (Dashboard \u2192 Savings Goals)', builtIn: true },
  { id: 'ai',       keys: '8',             action: 'Open / close AI Assistant chat drawer',                   builtIn: true },
  { id: 'settings', keys: '0',             action: 'Open or close Settings',                                  builtIn: true },
  { id: 'profile',  keys: '.',             action: 'Open or close Profile',                                   builtIn: true },
  { id: 'version',  keys: 'V',             action: 'Open version badge and changelog',                        builtIn: true },
  { id: 'theme',    keys: 'T',             action: 'Switch light / dark mode',                                builtIn: true },
  { id: 'help',     keys: '?',             action: 'Show this shortcuts panel',                               builtIn: true },
  { id: 'sidebar',  keys: '[',             action: 'Collapse or expand sidebar',                              builtIn: true },
  { id: 'palette',  keys: 'Ctrl / \u2318 + K', action: 'Open command palette (search all actions)',          builtIn: true },
  { id: 'cloud',    keys: 'Ctrl / \u2318 + S', action: 'Toggle cloud sync panel',                            builtIn: true },
  { id: 'escape',   keys: 'Esc',           action: 'Close any open modal, panel, or popover',                builtIn: true },
  { id: 'arrows',   keys: '\u2191 / \u2193', action: 'Move through command palette options',                 builtIn: true },
  { id: 'enter',    keys: 'Enter',          action: 'Select focused command / send AI message',               builtIn: true },
]

function loadCustom(): ShortcutRow[] {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : [] }
  catch { return [] }
}
function saveCustom(rows: ShortcutRow[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(rows))
}

type Props = { onClose: () => void }

export function KeyboardShortcutsPanel({ onClose }: Props) {
  const [builtIn, setBuiltIn] = useState<ShortcutRow[]>(BUILT_IN)
  const [custom, setCustom] = useState<ShortcutRow[]>(loadCustom)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editKeys, setEditKeys] = useState('')
  const [editAction, setEditAction] = useState('')
  const [addKeys, setAddKeys] = useState('')
  const [addAction, setAddAction] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  // Undo/redo stack for custom deletions
  const undoStack = useRef<ShortcutRow[][]>([])
  const redoStack = useRef<ShortcutRow[][]>([])

  useEffect(() => { saveCustom(custom) }, [custom])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  function startEdit(row: ShortcutRow) {
    setEditingId(row.id)
    setEditKeys(row.keys)
    setEditAction(row.action)
  }

  function commitEdit() {
    if (!editingId) return
    const isBuiltIn = builtIn.some(r => r.id === editingId)
    if (isBuiltIn) {
      setBuiltIn(prev => prev.map(r => r.id === editingId ? { ...r, keys: editKeys.trim() || r.keys, action: editAction.trim() || r.action } : r))
    } else {
      setCustom(prev => prev.map(r => r.id === editingId ? { ...r, keys: editKeys.trim() || r.keys, action: editAction.trim() || r.action } : r))
    }
    setEditingId(null)
  }

  function deleteCustom(id: string) {
    setCustom(prev => {
      undoStack.current.push(prev)
      redoStack.current = []
      return prev.filter(r => r.id !== id)
    })
  }

  function undo() {
    const prev = undoStack.current.pop()
    if (!prev) return
    setCustom(cur => { redoStack.current.push(cur); return prev })
  }

  function redo() {
    const next = redoStack.current.pop()
    if (!next) return
    setCustom(cur => { undoStack.current.push(cur); return next })
  }

  function addRow() {
    const k = addKeys.trim(); const a = addAction.trim()
    if (!k || !a) return
    setCustom(prev => {
      undoStack.current.push(prev)
      redoStack.current = []
      return [...prev, { id: `custom-${Date.now()}`, keys: k, action: a, builtIn: false }]
    })
    setAddKeys(''); setAddAction(''); setShowAdd(false)
  }

  const allRows = [...builtIn, ...custom]
  const canUndo = undoStack.current.length > 0
  const canRedo = redoStack.current.length > 0

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Keyboard shortcuts</h2>
            <p className="mt-0.5 text-sm text-slate-400">Click any row to edit its label or description.</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100" type="button">\u2715</button>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-1.5">
          {allRows.map(row => (
            editingId === row.id ? (
              <div key={row.id} className="rounded-xl border border-blue-600/60 bg-blue-950/30 px-3 py-2.5 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-28">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wide mb-1 block">Key(s)</label>
                    <input autoFocus className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                      value={editKeys} onChange={e => setEditKeys(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }} />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wide mb-1 block">Description</label>
                    <input className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
                      value={editAction} onChange={e => setEditAction(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null) }} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setEditingId(null)} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-700">Cancel</button>
                  <button onClick={commitEdit} className="text-xs text-blue-400 hover:text-blue-200 px-2 py-1 rounded bg-blue-900/40 hover:bg-blue-900/70">Save</button>
                </div>
              </div>
            ) : (
              <div key={row.id}
                className="group flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 cursor-pointer hover:border-slate-600 hover:bg-slate-800/40 transition-colors"
                onClick={() => startEdit(row)}
              >
                <p className="text-sm text-slate-300 flex-1">{row.action}</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <kbd className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-300 group-hover:border-slate-500">{row.keys}</kbd>
                  {!row.builtIn && (
                    <button onClick={e => { e.stopPropagation(); deleteCustom(row.id) }}
                      className="text-slate-600 hover:text-red-400 transition-colors text-xs px-1" title="Delete">&#x2715;</button>
                  )}
                  <span className="text-slate-600 group-hover:text-slate-400 text-xs transition-colors">\u270f</span>
                </div>
              </div>
            )
          ))}

          {/* Custom section header + undo/redo */}
          {custom.length > 0 || showAdd ? (
            <div className="flex items-center justify-between pt-2 pb-1">
              <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Your notes</span>
              <div className="flex items-center gap-1">
                <button onClick={undo} disabled={!canUndo}
                  className="text-[11px] px-2 py-0.5 rounded text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Undo last delete">&#8630; Undo</button>
                <button onClick={redo} disabled={!canRedo}
                  className="text-[11px] px-2 py-0.5 rounded text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title="Redo">Redo &#8631;</button>
              </div>
            </div>
          ) : null}

          {/* Add custom row */}
          {showAdd ? (
            <div className="rounded-xl border border-green-700/50 bg-green-950/20 px-3 py-2.5 space-y-2">
              <div className="flex gap-2">
                <div className="flex-shrink-0 w-28">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wide mb-1 block">Key(s)</label>
                  <input autoFocus placeholder="e.g. Ctrl+Z"
                    className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-200 focus:outline-none focus:border-green-500 placeholder-slate-600"
                    value={addKeys} onChange={e => setAddKeys(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addRow(); if (e.key === 'Escape') setShowAdd(false) }} />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] text-slate-400 uppercase tracking-wide mb-1 block">Description</label>
                  <input placeholder="What it does"
                    className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-green-500 placeholder-slate-600"
                    value={addAction} onChange={e => setAddAction(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addRow(); if (e.key === 'Escape') setShowAdd(false) }} />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowAdd(false)} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1 rounded hover:bg-slate-700">Cancel</button>
                <button onClick={addRow} disabled={!addKeys.trim() || !addAction.trim()}
                  className="text-xs text-green-400 hover:text-green-200 px-2 py-1 rounded bg-green-900/40 hover:bg-green-900/70 disabled:opacity-40 disabled:cursor-not-allowed">Add</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAdd(true)}
              className="w-full rounded-xl border border-dashed border-slate-700 hover:border-slate-500 text-slate-500 hover:text-slate-300 py-2 text-xs transition-colors">
              + Add personal shortcut note
            </button>
          )}
        </div>

        {/* Footer — clarification */}
        <div className="border-t border-slate-700/60 px-5 py-3 flex-shrink-0 space-y-1">
          <p className="text-xs text-slate-500 leading-relaxed">
            <span className="text-amber-400/80 font-medium">Note:</span> Custom rows are a personal reference only. Adding a row here does not create any app behavior — the app cannot read your description or wire up a new shortcut. Built-in key bindings are hardcoded and cannot be rebound.
          </p>
        </div>
      </div>
    </div>
  )
}
