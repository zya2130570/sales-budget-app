/**
 * VersionBadge.tsx — V30
 * Anchored popover (not fullscreen modal). Appears below the badge button.
 * Click anywhere outside to close. Works correctly inside sidebar/sticky headers.
 */
import { useState, useRef, useEffect } from 'react'
import { CHANGELOG, type VersionEntry } from '../utils/changelog'

export function VersionBadge({ version, className = '' }: { version: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<VersionEntry>(CHANGELOG[0])
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      // Position below the button, clamped to viewport
      const panelW = 480
      let left = rect.left
      if (left + panelW > window.innerWidth - 12) left = window.innerWidth - panelW - 12
      if (left < 12) left = 12
      setPos({ top: rect.bottom + 6, left })
    }
    setOpen(v => !v)
  }

  // Click outside closes
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Escape closes
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        className={`rounded-full border border-slate-600 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-400 transition-colors cursor-pointer ${className}`}
        title="View changelog"
      >
        {version}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 480 }}
          className="rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 flex-shrink-0">
            <div>
              <p className="text-xs font-semibold text-slate-200">Version changelog</p>
              <p className="text-[10px] text-slate-500">What changed · What to test</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-slate-500 hover:text-slate-200 transition-colors text-base leading-none px-1"
            >✕</button>
          </div>

          {/* Body: version list + detail */}
          <div className="flex min-h-0" style={{ maxHeight: 340 }}>
            {/* Version list */}
            <div className="w-20 flex-shrink-0 border-r border-slate-700/60 overflow-y-auto">
              {CHANGELOG.map((entry, i) => (
                <button
                  key={entry.version}
                  onClick={() => setSelected(entry)}
                  className={`w-full text-left px-2.5 py-2 transition-colors border-l-2 ${
                    selected.version === entry.version
                      ? 'border-blue-500 bg-blue-600/15 text-blue-300'
                      : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <p className="text-[11px] font-semibold">{entry.version}</p>
                  {i === 0 && (
                    <span className="text-[9px] bg-blue-600 text-white px-1 py-0.5 rounded mt-0.5 inline-block">Latest</span>
                  )}
                </button>
              ))}
            </div>

            {/* Detail panel */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div>
                <h3 className="text-sm font-bold text-slate-100">{selected.version}</h3>
                <p className="text-[10px] text-slate-500">{selected.date}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Changes</p>
                <ul className="space-y-1">
                  {selected.what.map((item, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] text-slate-300">
                      <span className="text-blue-400 flex-shrink-0 mt-0.5">+</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/15 p-2.5">
                <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide mb-1.5">Test checklist</p>
                <ul className="space-y-1">
                  {selected.test.map((item, i) => (
                    <li key={i} className="flex gap-1.5 text-[11px] text-emerald-200/80">
                      <span className="text-emerald-500 flex-shrink-0 font-bold">{i + 1}.</span>{item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
