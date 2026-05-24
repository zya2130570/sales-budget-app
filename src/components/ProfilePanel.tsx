/**
 * ProfilePanel.tsx — V23
 *
 * Shown when the user clicks their email in the header.
 * Contains: account info, load starter data, settings shortcut.
 */
import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'

type Props = {
  hasData: boolean
  onLoadStarterData: () => void
  onOpenSettings: () => void
  onOpenGuide: () => void
}

export function ProfilePanel({ hasData, onLoadStarterData, onOpenSettings, onOpenGuide }: Props) {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (!user) return null

  return (
    <div className="relative" ref={ref}>
      {/* Trigger — the email pill */}
      <button
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-green-700/60 bg-green-900/30 px-3 py-1 text-xs text-green-300 hover:bg-green-900/50 transition-colors"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-green-400 flex-shrink-0" />
        <span className="truncate max-w-[140px]">{user.email}</span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border border-slate-700 bg-slate-800 shadow-2xl p-1">
          {/* Account */}
          <div className="px-3 py-2 border-b border-slate-700/60">
            <p className="text-xs text-slate-400">Signed in as</p>
            <p className="text-sm text-slate-200 font-medium truncate mt-0.5">{user.email}</p>
          </div>

          {/* Actions */}
          <div className="py-1">
            {/* Starter data — always accessible, not just when empty */}
            <button
              onClick={() => {
                setOpen(false)
                if (hasData) {
                  if (window.confirm('Load your starter budget? This will overwrite your current data.')) {
                    onLoadStarterData()
                  }
                } else {
                  onLoadStarterData()
                }
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
            >
              <span className="text-base">📦</span>
              <div className="min-w-0">
                <p className="font-medium">Load starter data</p>
                <p className="text-xs text-slate-500 truncate">Zyan's real budget setup</p>
              </div>
            </button>

            <button
              onClick={() => { setOpen(false); onOpenGuide() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
            >
              <span className="text-base">📖</span>
              <div>
                <p className="font-medium">Setup Guide</p>
                <p className="text-xs text-slate-500">Step-by-step walkthrough</p>
              </div>
            </button>

            <button
              onClick={() => { setOpen(false); onOpenSettings() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-100 transition-colors"
            >
              <span className="text-base">⚙</span>
              <div>
                <p className="font-medium">Settings</p>
                <p className="text-xs text-slate-500">Backup, sync, appearance</p>
              </div>
            </button>
          </div>

          {/* Sign out */}
          <div className="pt-1 border-t border-slate-700/60">
            <button
              onClick={() => { setOpen(false); signOut() }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-red-400 hover:bg-red-950/30 hover:text-red-300 transition-colors"
            >
              <span className="text-base">→</span>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
