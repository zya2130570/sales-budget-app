import { useState, useEffect } from 'react'
import { loadExportHistory, recordExportAndDownload } from '../utils/storage'
import type { ExportRecord } from '../types'

export function ExportHistoryPanel() {
  const [history, setHistory] = useState<ExportRecord[]>([])

  useEffect(() => {
    setHistory(loadExportHistory())
  }, [])

  const handleDownload = () => {
    recordExportAndDownload()
    setHistory(loadExportHistory())
  }

  const fmt = (iso: string) => {
    const d = new Date(iso)
    return d.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-200">Backup History</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {history.length === 0 ? 'No backups yet' : `${history.length} backup${history.length !== 1 ? 's' : ''} recorded`}
          </p>
        </div>
        <button
          onClick={handleDownload}
          className="rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-sm font-medium text-white transition-colors"
          type="button"
        >
          Download Backup
        </button>
      </div>

      {history.length > 0 && (
        <div className="rounded-lg border border-slate-700/50 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-800/60 border-b border-slate-700/50">
                <th className="text-left px-3 py-2 text-slate-400 font-medium">Date</th>
                <th className="text-right px-3 py-2 text-slate-400 font-medium">Size</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r, i) => (
                <tr key={r.id} className={`border-b border-slate-700/30 ${i % 2 === 0 ? 'bg-slate-800/20' : ''}`}>
                  <td className="px-3 py-1.5 text-slate-300">{fmt(r.exportedAt)}</td>
                  <td className="px-3 py-1.5 text-slate-400 text-right">{r.fileSizeKb} KB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
