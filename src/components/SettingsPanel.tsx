import { useEffect, useRef, useState } from 'react'
import { runSchemaRepair } from '../utils/schemaRepair'
import { ExportHistoryPanel } from './ExportHistoryPanel'

type SettingsPanelProps = {
  onClose: () => void
  onLoadDemo: () => void
  onClearAllData: () => void
  onDownloadBackup: () => void
  onImportFromFile: (json: string) => void
  lastSyncedAt?: string | null
  version?: string
  theme?: 'dark' | 'light'
  onToggleTheme?: () => void
}

export function SettingsPanel({
  onClose,
  onLoadDemo,
  onClearAllData,
  onDownloadBackup,
  onImportFromFile,
  lastSyncedAt,
  version = 'V22',
  theme = 'dark',
  onToggleTheme,
}: SettingsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [repairStatus, setRepairStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [repairMessage, setRepairMessage] = useState<string | null>(null)


  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handleImportFile = async (file: File | null) => {
    if (!file) return
    setImportError(null)
    try {
      const text = await file.text()
      onImportFromFile(text)
      onClose()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleClearAll = () => {
    const confirmed = window.confirm('Clear all local Flow data shown in the app? This does not delete cloud data.')
    if (!confirmed) return
    onClearAllData()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-700 p-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Settings</h2>
            <p className="text-sm text-slate-400">Flow {version}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
            type="button"
          >
            Close
          </button>
        </div>

        <div className="space-y-4 p-4">
          <section className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
            <h3 className="font-semibold text-slate-100">Backup and restore</h3>
            <p className="mt-1 text-sm text-slate-400">
              Download a backup anytime. Each download is logged here with the date and file size.
            </p>
            <div className="mt-3">
              <ExportHistoryPanel />
            </div>
            <div className="mt-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600"
                type="button"
              >
                Import Backup
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => void handleImportFile(event.target.files?.[0] ?? null)}
              />
            </div>
            {importError && <p className="mt-2 text-sm text-red-300">{importError}</p>}
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
            <h3 className="font-semibold text-slate-100">Demo mode</h3>
            <p className="mt-1 text-sm text-slate-400">
              Load sample accounts, transactions, rules, and savings goals for testing.
            </p>
            <button
              onClick={onLoadDemo}
              className="mt-3 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600"
              type="button"
            >
              Load Demo Data
            </button>
          </section>

          <section className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
            <h3 className="font-semibold text-slate-100">Cloud status</h3>
            <p className="mt-1 text-sm text-slate-400">
              Last synced: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'Not synced yet'}
            </p>
          </section>

          {/* V22 — Theme toggle */}
          {onToggleTheme && (
            <section className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
              <h3 className="font-semibold text-slate-100">Appearance</h3>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-300">{theme === 'dark' ? '🌙 Dark mode' : '☀️ Light mode'}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Switch between dark and light theme</p>
                </div>
                <button
                  onClick={onToggleTheme}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${theme === 'light' ? 'bg-blue-600' : 'bg-slate-600'}`}
                  role="switch"
                  aria-checked={theme === 'light'}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${theme === 'light' ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
            </section>
          )}

          {/* V19 — Schema repair */}
          <section className="rounded-xl border border-slate-700 bg-slate-800/70 p-4">
            <h3 className="font-semibold text-slate-100">Database schema</h3>
            <p className="mt-1 text-sm text-slate-400">
              Creates any missing Supabase tables automatically. Run this if you see sync errors about missing tables or columns.
            </p>
            <button
              onClick={async () => {
                setRepairStatus('loading')
                setRepairMessage(null)
                const result = await runSchemaRepair()
                setRepairStatus(result.ok ? 'success' : 'error')
                setRepairMessage(result.applied ?? result.error ?? null)
              }}
              disabled={repairStatus === 'loading'}
              className="mt-3 rounded-lg bg-slate-600 hover:bg-slate-500 disabled:opacity-50 px-3 py-2 text-sm font-medium text-white transition-colors"
              type="button"
            >
              {repairStatus === 'loading' ? 'Running…' : 'Repair database schema'}
            </button>
            {repairMessage && (
              <p className={`mt-2 text-xs rounded-lg px-3 py-2 ${repairStatus === 'success' ? 'bg-emerald-950/40 text-emerald-300' : 'bg-red-950/40 text-red-300'}`}>
                {repairMessage}
              </p>
            )}
          </section>

          <section className="rounded-xl border border-red-900/60 bg-red-950/30 p-4">
            <h3 className="font-semibold text-red-100">Danger zone</h3>
            <p className="mt-1 text-sm text-red-200/80">
              Clears the local app state currently loaded in this browser.
            </p>
            <button
              onClick={handleClearAll}
              className="mt-3 rounded-lg bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
              type="button"
            >
              Clear Local Data
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
