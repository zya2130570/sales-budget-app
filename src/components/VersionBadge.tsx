/**
 * VersionBadge.tsx — V14
 * Clickable version badge that opens the in-app changelog modal.
 */
import { useState } from 'react'
import { CHANGELOG, type VersionEntry } from '../utils/changelog'

function ChangelogModal({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<VersionEntry>(CHANGELOG[0])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-700 bg-slate-800 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Version changelog</h2>
            <p className="text-xs text-slate-500 mt-0.5">What changed — what to test</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg transition-colors">✕</button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Version list */}
          <div className="w-28 flex-shrink-0 border-r border-slate-700 py-2 overflow-y-auto">
            {CHANGELOG.map((entry, i) => (
              <button
                key={entry.version}
                onClick={() => setSelected(entry)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${
                  selected.version === entry.version
                    ? 'bg-blue-600/20 text-blue-300 border-r-2 border-blue-500'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                <p className="text-xs font-semibold">{entry.version}</p>
                <p className="text-[10px] text-slate-500">{entry.date}</p>
                {i === 0 && <span className="text-[9px] bg-blue-600 text-white px-1 py-0.5 rounded mt-0.5 inline-block">Latest</span>}
              </button>
            ))}
          </div>

          {/* Entry detail */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-100">{selected.version}</h3>
              <p className="text-xs text-slate-500">{selected.date}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">What changed</p>
              <ul className="space-y-1.5">
                {selected.what.map((item, i) => (
                  <li key={i} className="flex gap-2 text-xs text-slate-300">
                    <span className="text-blue-400 flex-shrink-0 mt-0.5">+</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-emerald-700/40 bg-emerald-950/20 p-3">
              <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wide mb-2">What to test</p>
              <ul className="space-y-2">
                {selected.test.map((item, i) => (
                  <li key={i} className="flex gap-2 text-xs text-emerald-200/80">
                    <span className="text-emerald-500 flex-shrink-0 font-bold mt-0.5">{i + 1}.</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type Props = {
  version: string
  className?: string
}

export function VersionBadge({ version, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-full border border-slate-600 px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200 hover:border-slate-400 transition-colors cursor-pointer ${className}`}
        title="View changelog & what to test"
      >
        {version}
      </button>
      {open && <ChangelogModal onClose={() => setOpen(false)} />}
    </>
  )
}
