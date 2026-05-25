/**
 * BankSelector.tsx — V35
 * Step 1 of the import flow: choose your bank and see export instructions.
 * Shown at the top of CsvImportModal before file upload.
 */
import { BANK_TEMPLATES } from '../utils/csv'
import type { ImportPreset } from '../types'

type Props = {
  selected: ImportPreset
  onSelect: (preset: ImportPreset) => void
}

export function BankSelector({ selected, onSelect }: Props) {
  const selectedTemplate = BANK_TEMPLATES.find(t => t.id === selected)

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Step 1 — Choose your bank or card</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {BANK_TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id as ImportPreset)}
              className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border transition-all text-sm ${
                selected === t.id
                  ? 'border-blue-500/60 bg-blue-600/15 text-blue-200'
                  : 'border-slate-700/60 bg-slate-800/60 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              <span className="text-xl">{t.emoji}</span>
              <span className="text-[11px] font-medium text-center leading-tight">{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      {selectedTemplate && selectedTemplate.instructions.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 p-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
            How to export from {selectedTemplate.name}
          </p>
          <ol className="space-y-1.5">
            {selectedTemplate.instructions.map((step, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-300">
                <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600/30 text-blue-300 text-[10px] flex items-center justify-center font-bold">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          {selectedTemplate.sampleHeaders && (
            <p className="text-[10px] text-slate-600 mt-2 font-mono truncate">
              CSV headers: {selectedTemplate.sampleHeaders}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
