import { useRef, useState } from 'react'

type SettingsPanelProps = {
  onClose: () => void
  onLoadDemo: () => void
  onClearAllData: () => void
  onDownloadBackup: () => void
  onImportFromFile: (json: string) => void
  lastSyncedAt?: string | null
  version?: string
}

export function SettingsPanel({
  onClose,
  onLoadDemo,
  onClearAllData,
  onDownloadBackup,
  onImportFromFile,
  lastSyncedAt,
  version = 'V16',
}: SettingsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

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
              Export a local backup or import a backup JSON file.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={onDownloadBackup}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
                type="button"
              >
                Download Backup
              </button>
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
