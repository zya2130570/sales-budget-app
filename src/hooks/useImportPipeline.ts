import { useState } from 'react'
import type { ImportBatch, ImportPreset } from '../types'
import type { ImportPipelineResult } from '../utils/importHelpers'

export type PdfImportPreviewRow = {
  date: string
  merchant: string
  amount: number
  rawSign: number
  confidence: 'high' | 'medium' | 'low'
  isDup?: boolean
}

/**
 * Owns import modal/preview/history state.
 * App.tsx still orchestrates CSV/PDF parsing and transaction commits so existing
 * import behavior, duplicate detection, and account-aware import behavior stay unchanged.
 */
export function useImportPipeline() {
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [csvImportPreview, setCsvImportPreview] = useState<ImportPipelineResult | null>(null)
  const [csvImportLoading, setCsvImportLoading] = useState(false)
  const [csvImportError, setCsvImportError] = useState('')
  const [csvImportAccountId, setCsvImportAccountId] = useState('')
  const [csvImportMonth, setCsvImportMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [csvIsAppleCard, setCsvIsAppleCard] = useState(false)
  const [csvCategoryHints, setCsvCategoryHints] = useState<Record<string, string>>({})
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([])
  const [csvShowHistory, setCsvShowHistory] = useState(false)
  const [csvImportPreset, setCsvImportPreset] = useState<ImportPreset>('auto')
  const [csvColumnMapping, setCsvColumnMapping] = useState<Record<string, string> | null>(null)
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null)
  const [csvImportIsPdf, setCsvImportIsPdf] = useState(false)
  const [pdfPreviewRows, setPdfPreviewRows] = useState<PdfImportPreviewRow[]>([])
  const [pdfParseWarning, setPdfParseWarning] = useState('')

  const resetImportPreview = () => {
    setCsvImportPreview(null)
    setCsvImportError('')
    setCsvImportIsPdf(false)
    setPdfPreviewRows([])
    setPdfParseWarning('')
    setCsvColumnMapping(null)
  }

  const resetImportSession = () => {
    setCsvImportPreview(null)
    setCsvImportError('')
    setCsvCategoryHints({})
    setCsvIsAppleCard(false)
    setCsvImportIsPdf(false)
    setPdfPreviewRows([])
    setPdfParseWarning('')
    setCsvColumnMapping(null)
  }

  return {
    csvImportOpen,
    setCsvImportOpen,
    csvImportPreview,
    setCsvImportPreview,
    csvImportLoading,
    setCsvImportLoading,
    csvImportError,
    setCsvImportError,
    csvImportAccountId,
    setCsvImportAccountId,
    csvImportMonth,
    setCsvImportMonth,
    csvIsAppleCard,
    setCsvIsAppleCard,
    csvCategoryHints,
    setCsvCategoryHints,
    importBatches,
    setImportBatches,
    csvShowHistory,
    setCsvShowHistory,
    csvImportPreset,
    setCsvImportPreset,
    csvColumnMapping,
    setCsvColumnMapping,
    batchToDelete,
    setBatchToDelete,
    csvImportIsPdf,
    setCsvImportIsPdf,
    pdfPreviewRows,
    setPdfPreviewRows,
    pdfParseWarning,
    setPdfParseWarning,
    resetImportPreview,
    resetImportSession,
  }
}
