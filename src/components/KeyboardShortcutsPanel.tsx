import { useEffect } from 'react'

type Props = {
  onClose: () => void
}

const SHORTCUTS = [
  { keys: '1–7', action: 'Jump between main sections (Dashboard → Savings Goals)' },
  { keys: '8', action: 'Open / close AI Assistant chat drawer' },
  { keys: '0', action: 'Open or close Settings' },
  { keys: '.', action: 'Open or close Profile' },
  { keys: 'V', action: 'Open version badge & changelog' },
  { keys: 'T', action: 'Switch light / dark mode' },
  { keys: '?', action: 'Show this shortcuts panel' },
  { keys: '[', action: 'Collapse or expand sidebar' },
  { keys: 'Ctrl/⌘ + K', action: 'Open command palette (search all actions)' },
  { keys: 'Ctrl/⌘ + S', action: 'Open cloud sync panel' },
  { keys: 'Esc', action: 'Close any open modal, panel, or popover' },
  { keys: '↑ / ↓', action: 'Move through command palette options' },
  { keys: 'Enter', action: 'Select focused command / send AI message' },
]

export function KeyboardShortcutsPanel({ onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Keyboard shortcuts</h2>
            <p className="mt-0.5 text-sm text-slate-400">Quick controls that work when you are not typing in a field.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            type="button"
          >
            ✕
          </button>
        </div>

        <div className="p-5">
          <div className="space-y-2">
            {SHORTCUTS.map(item => (
              <div key={item.keys} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5">
                <p className="text-sm text-slate-300">{item.action}</p>
                <kbd className="shrink-0 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 font-mono text-xs text-slate-300">{item.keys}</kbd>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Shortcuts pause automatically inside text fields, dropdowns, and text areas so they do not interrupt typing.
          </p>
        </div>
      </div>
    </div>
  )
}
