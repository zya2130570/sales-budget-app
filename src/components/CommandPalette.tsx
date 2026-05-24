/**
 * CommandPalette.tsx — V27
 * Opens with Ctrl+K / ⌘+K. Navigate with arrows. Select with Enter. Close with Escape.
 */
import { useState, useEffect, useRef, useCallback } from 'react'

type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Accounts' | 'Transactions' | 'Scenarios' | 'Targets'

type Action = {
  id: string
  icon: string
  label: string
  description: string
  shortcut?: string
  action: () => void
}

type Props = {
  onNavigate: (tab: Tab) => void
  onOpenGuide: () => void
  onOpenSettings: () => void
  onLoadDemo: () => void
  onSync: () => void
}

export function CommandPalette({ onNavigate, onOpenGuide, onOpenSettings, onLoadDemo, onSync }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const allActions: Action[] = [
    { id: 'dashboard',     icon: '📊', label: 'Go to Dashboard',     description: 'Budget health, insights, AI assistant', shortcut: '1', action: () => onNavigate('Dashboard') },
    { id: 'income',        icon: '💵', label: 'Go to Income',         description: 'Salary, take-home rate, side income',   shortcut: '2', action: () => onNavigate('Income') },
    { id: 'budget',        icon: '📋', label: 'Go to Budget',         description: 'Categories, actuals, rollover',          shortcut: '3', action: () => onNavigate('Budget') },
    { id: 'accounts',      icon: '🏦', label: 'Go to Accounts',       description: 'Net worth, balances, reconcile',         shortcut: '4', action: () => onNavigate('Accounts') },
    { id: 'transactions',  icon: '📥', label: 'Go to Transactions',   description: 'Import CSV, rules, recurring',           shortcut: '5', action: () => onNavigate('Transactions') },
    { id: 'scenarios',     icon: '🔮', label: 'Go to Scenarios',      description: 'Slow/Medium/Fast income planning',       shortcut: '6', action: () => onNavigate('Scenarios') },
    { id: 'goals',         icon: '🎯', label: 'Go to Savings Goals',  description: 'Track progress toward financial goals',  shortcut: '7', action: () => onNavigate('Targets') },
    { id: 'guide',         icon: '📖', label: 'Open Setup Guide',     description: 'Step-by-step onboarding walkthrough',   action: onOpenGuide },
    { id: 'settings',      icon: '⚙️', label: 'Open Settings',        description: 'Backup, sync, appearance, theme',       action: onOpenSettings },
    { id: 'sync',          icon: '☁️', label: 'Sync to Cloud',        description: 'Push all local data to Supabase',       action: onSync },
    { id: 'demo',          icon: '✨', label: 'Load Demo Data',        description: 'Load sample budget, accounts, goals',   action: onLoadDemo },
  ]

  const filtered = query.trim()
    ? allActions.filter(a =>
        a.label.toLowerCase().includes(query.toLowerCase()) ||
        a.description.toLowerCase().includes(query.toLowerCase())
      )
    : allActions

  // Open/close with Ctrl+K / ⌘+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(v => !v)
        setQuery('')
        setSelectedIdx(0)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Arrow key navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && filtered[selectedIdx]) { filtered[selectedIdx].action(); setOpen(false) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, filtered, selectedIdx])

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50) }, [open])
  useEffect(() => { setSelectedIdx(0) }, [query])

  const select = useCallback((action: Action) => {
    action.action()
    setOpen(false)
    setQuery('')
  }, [])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(2,6,23,0.7)', backdropFilter: 'blur(12px)' }}
      onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg mx-4 rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: 'rgba(15,18,32,0.98)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(59,130,246,0.1)' }}
        onClick={e => e.stopPropagation()}>

        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0" style={{ color: 'rgba(148,163,184,0.4)' }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: '#f1f5f9', caretColor: '#3b82f6' }}
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(148,163,184,0.5)' }}>
            ESC
          </kbd>
        </div>

        {/* Actions list */}
        <div className="max-h-72 overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <p className="text-xs text-center py-6" style={{ color: 'rgba(148,163,184,0.4)' }}>No commands found</p>
          )}
          {filtered.map((action, i) => (
            <button key={action.id} onClick={() => select(action)}
              onMouseEnter={() => setSelectedIdx(i)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all"
              style={{ background: i === selectedIdx ? 'rgba(59,130,246,0.1)' : 'transparent' }}>
              <span className="text-base flex-shrink-0">{action.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none" style={{ color: i === selectedIdx ? '#f1f5f9' : 'rgba(203,213,225,0.8)' }}>{action.label}</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'rgba(148,163,184,0.45)' }}>{action.description}</p>
              </div>
              {action.shortcut && (
                <kbd className="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.4)' }}>
                  {action.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          {[['↑↓', 'navigate'], ['↵', 'select'], ['esc', 'close']].map(([key, label]) => (
            <div key={key} className="flex items-center gap-1.5">
              <kbd className="text-[10px] px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(148,163,184,0.5)' }}>{key}</kbd>
              <span className="text-[10px]" style={{ color: 'rgba(148,163,184,0.35)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
