/**
 * KeyboardShortcutsPanel.tsx — V42
 * Real shortcut rebinding. Every built-in shortcut can be reassigned to a
 * different key. Press the row's "change" button, then press any key — that key
 * is now live. Changes persist to localStorage and are read by Sidebar.tsx on
 * every keydown event.
 *
 * Custom "add a new shortcut" is intentionally NOT offered because there is no
 * generic action hook to wire new keys to. Only existing app actions can be rebound.
 */
import { useEffect, useRef, useState } from 'react'

export const SHORTCUTS_LS_KEY = 'flow_shortcut_bindings'

export type ShortcutId =
  | 'nav1' | 'nav2' | 'nav3' | 'nav4' | 'nav5' | 'nav6' | 'nav7'
  | 'ai' | 'settings' | 'profile' | 'version' | 'theme' | 'help' | 'sidebar'
  | 'cloud'

export type ShortcutBindings = Record<ShortcutId, string>

export const DEFAULT_BINDINGS: ShortcutBindings = {
  nav1: '1', nav2: '2', nav3: '3', nav4: '4', nav5: '5', nav6: '6', nav7: '7',
  ai: '8',
  settings: '0',
  profile: '.',
  version: 'v',
  theme: 't',
  help: '?',
  sidebar: '[',
  cloud: 's', // used as Ctrl/Cmd+S
}

const LABELS: Record<ShortcutId, string> = {
  nav1: 'Go to Dashboard',
  nav2: 'Go to Income',
  nav3: 'Go to Budget',
  nav4: 'Go to Accounts',
  nav5: 'Go to Transactions',
  nav6: 'Go to Scenarios',
  nav7: 'Go to Savings Goals',
  ai: 'Open / close AI Assistant',
  settings: 'Open / close Settings',
  profile: 'Open / close Profile',
  version: 'Open version badge & changelog',
  theme: 'Switch light / dark mode',
  help: 'Show this shortcuts panel',
  sidebar: 'Collapse or expand sidebar',
  cloud: 'Toggle cloud sync panel (Ctrl/⌘ + key)',
}

// These shortcuts require Ctrl/Cmd held down
export const MODIFIER_REQUIRED: Set<ShortcutId> = new Set(['cloud'])

// These are always blocked from rebinding (Esc, Enter, arrows — system keys)
const BLOCKED_KEYS = new Set(['Escape', 'Enter', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete', 'Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'])

export function loadBindings(): ShortcutBindings {
  try {
    const raw = localStorage.getItem(SHORTCUTS_LS_KEY)
    if (!raw) return { ...DEFAULT_BINDINGS }
    return { ...DEFAULT_BINDINGS, ...JSON.parse(raw) }
  } catch { return { ...DEFAULT_BINDINGS } }
}

function saveBindings(b: ShortcutBindings) {
  localStorage.setItem(SHORTCUTS_LS_KEY, JSON.stringify(b))
}

function displayKey(id: ShortcutId, key: string): string {
  if (MODIFIER_REQUIRED.has(id)) return `Ctrl / ⌘ + ${key.toUpperCase()}`
  if (key === ' ') return 'Space'
  return key.length === 1 ? key.toUpperCase() : key
}

type Props = { onClose: () => void }

export function KeyboardShortcutsPanel({ onClose }: Props) {
  const [bindings, setBindings] = useState<ShortcutBindings>(loadBindings)
  const [listening, setListening] = useState<ShortcutId | null>(null)
  const [conflict, setConflict] = useState<string | null>(null)
  const listeningRef = useRef<ShortcutId | null>(null)
  listeningRef.current = listening

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (listeningRef.current) {
        e.preventDefault()
        e.stopPropagation()
        const key = e.key

        if (key === 'Escape') { setListening(null); setConflict(null); return }
        if (BLOCKED_KEYS.has(key)) { setConflict(`"${key}" is reserved and cannot be used`); return }

        // Check for conflicts with other bindings
        const id = listeningRef.current
        const lower = key.toLowerCase()
        const conflictId = (Object.entries(bindings) as [ShortcutId, string][]).find(
          ([otherId, otherKey]) => otherId !== id && otherKey.toLowerCase() === lower
        )
        if (conflictId) {
          setConflict(`"${displayKey(conflictId[0], conflictId[1])}" is already used by "${LABELS[conflictId[0]]}"`)
          return
        }

        const next = { ...bindings, [id]: key.toLowerCase() }
        setBindings(next)
        saveBindings(next)
        setListening(null)
        setConflict(null)
        return
      }
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [bindings, onClose])

  function resetAll() {
    setBindings({ ...DEFAULT_BINDINGS })
    saveBindings({ ...DEFAULT_BINDINGS })
    setListening(null)
    setConflict(null)
  }

  const ids = Object.keys(DEFAULT_BINDINGS) as ShortcutId[]
  const isDefault = JSON.stringify(bindings) === JSON.stringify(DEFAULT_BINDINGS)

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4" onClick={() => { if (!listening) onClose() }}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Keyboard shortcuts</h2>
            <p className="mt-0.5 text-sm text-slate-400">Click "Change" on any row, then press a new key to rebind it.</p>
          </div>
          <button onClick={onClose} className="rounded-lg px-3 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100 text-lg leading-none" type="button">✕</button>
        </div>

        {/* Conflict notice */}
        {conflict && (
          <div className="mx-4 mt-3 rounded-lg bg-red-900/30 border border-red-700/50 px-3 py-2 text-xs text-red-300 flex items-center justify-between">
            <span>{conflict}</span>
            <button onClick={() => setConflict(null)} className="text-red-400 hover:text-red-200 ml-2">✕</button>
          </div>
        )}

        {/* Listening banner */}
        {listening && (
          <div className="mx-4 mt-3 rounded-lg bg-blue-900/40 border border-blue-600/60 px-3 py-2.5 text-xs text-blue-200 text-center animate-pulse">
            Press any key to assign to <strong>{LABELS[listening]}</strong> — or press Esc to cancel
          </div>
        )}

        {/* List */}
        <div className="overflow-y-auto flex-1 p-4 space-y-1.5">
          {ids.map(id => {
            const key = bindings[id]
            const isChanged = key !== DEFAULT_BINDINGS[id]
            const isListening = listening === id
            return (
              <div key={id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 transition-colors ${isListening ? 'border-blue-600/60 bg-blue-950/30' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'}`}>
                <p className="text-sm text-slate-300 flex-1">{LABELS[id]}</p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {isChanged && (
                    <button
                      onClick={() => { const next = { ...bindings, [id]: DEFAULT_BINDINGS[id] }; setBindings(next); saveBindings(next) }}
                      className="text-[10px] text-slate-500 hover:text-amber-400 transition-colors px-1" title="Reset to default"
                    >reset</button>
                  )}
                  <kbd className={`rounded-md border px-2 py-1 font-mono text-xs ${isChanged ? 'border-blue-700/60 bg-blue-900/30 text-blue-300' : 'border-slate-700 bg-slate-800 text-slate-300'}`}>
                    {displayKey(id, key)}
                  </kbd>
                  <button
                    onClick={() => { setListening(isListening ? null : id); setConflict(null) }}
                    className={`text-xs px-2 py-1 rounded transition-colors ${isListening ? 'bg-blue-600 text-white' : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}`}
                  >
                    {isListening ? 'Listening…' : 'Change'}
                  </button>
                </div>
              </div>
            )
          })}

          {/* Fixed shortcuts that can't be rebound */}
          <div className="pt-2 pb-1">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Fixed shortcuts</span>
          </div>
          {[
            { keys: 'Ctrl / ⌘ + K', action: 'Open command palette' },
            { keys: 'Esc', action: 'Close any open modal or panel' },
            { keys: '↑ / ↓', action: 'Navigate command palette' },
            { keys: 'Enter', action: 'Select command / send AI message' },
          ].map(r => (
            <div key={r.keys} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/60 bg-slate-950/20 px-3 py-2.5 opacity-60">
              <p className="text-sm text-slate-400 flex-1">{r.action}</p>
              <kbd className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-400">{r.keys}</kbd>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700/60 px-5 py-3 flex-shrink-0 flex items-center justify-between">
          <p className="text-xs text-slate-500">Changes take effect immediately.</p>
          {!isDefault && (
            <button onClick={resetAll} className="text-xs text-amber-400 hover:text-amber-300 transition-colors px-2 py-1 rounded hover:bg-amber-900/20">
              Reset all to defaults
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
