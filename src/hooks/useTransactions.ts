import { useEffect, useState } from 'react'
import type { ImportBatch, ImportPreset, Transaction, TransactionRule, TransactionType } from '../types'
import { TXN_FILTER_OPTIONS } from '../utils/transactionHelpers'
import { loadTransactions, loadTransactionRules, saveTransactions, saveTransactionRules, runMigrations } from '../utils/storage'

type TxnFilter = typeof TXN_FILTER_OPTIONS[number]['value']

type TransactionForm = {
  date: string
  accountId: string
  merchant: string
  amount: string
  type: TransactionType
  categoryId: string
  notes: string
  toAccountId: string
}

type RuleForm = {
  name: string
  matchText: string
  matchField: 'merchant' | 'notes'
  categoryId: string
  type: TransactionType | ''
}

export function useTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [txnForm, setTxnForm] = useState<TransactionForm>({
    date: new Date().toISOString().slice(0, 10),
    accountId: '',
    merchant: '',
    amount: '',
    type: 'expense',
    categoryId: '',
    notes: '',
    toAccountId: '',
  })
  const [txnHistory, setTxnHistory] = useState<Transaction[][]>([])
  const [txnRedo, setTxnRedo] = useState<Transaction[][]>([])
  const [txnFilter, setTxnFilter] = useState<TxnFilter>('all')
  const [txnDupWarning, setTxnDupWarning] = useState(false)
  const [accountHint, setAccountHint] = useState('')
  const [txnHint, setTxnHint] = useState('')

  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [csvImportPreview, setCsvImportPreview] = useState<unknown | null>(null)
  const [csvImportLoading, setCsvImportLoading] = useState(false)
  const [csvImportError, setCsvImportError] = useState('')
  const [csvImportAccountId, setCsvImportAccountId] = useState('')
  const [csvImportMonth, setCsvImportMonth] = useState(() => {
    const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
  })
  const [csvIsAppleCard, setCsvIsAppleCard] = useState(false)
  const [csvCategoryHints, setCsvCategoryHints] = useState<Record<string, string>>({})
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([])
  const [csvShowHistory, setCsvShowHistory] = useState(false)
  const [csvImportPreset, setCsvImportPreset] = useState<ImportPreset>('auto')
  const [csvColumnMapping, setCsvColumnMapping] = useState<Record<string, string> | null>(null)
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null)
  const [deleteDupsConfirm, setDeleteDupsConfirm] = useState(false)
  const [deleteFilteredConfirm, setDeleteFilteredConfirm] = useState(false)
  const [csvImportIsPdf, setCsvImportIsPdf] = useState(false)
  const [pdfPreviewRows, setPdfPreviewRows] = useState<Array<{ date: string; merchant: string; amount: number; confidence: 'high' | 'medium' | 'low'; isDup?: boolean }>>([])
  const [pdfParseWarning, setPdfParseWarning] = useState('')
  const [deletedTxns, setDeletedTxns] = useState<Transaction[]>([])
  const [showRecentlyDeleted, setShowRecentlyDeleted] = useState(false)
  const [reviewOpen, setReviewOpen] = useState(true)

  const [rules, setRules] = useState<TransactionRule[]>([])
  const [ruleForm, setRuleForm] = useState<RuleForm>({ name: '', matchText: '', matchField: 'merchant', categoryId: '', type: '' })
  const [ruleHint, setRuleHint] = useState('')
  const [inlineRuleEditId, setInlineRuleEditId] = useState<string | null>(null)
  const [inlineRuleEditForm, setInlineRuleEditForm] = useState<RuleForm>({ name: '', matchText: '', matchField: 'merchant', categoryId: '', type: '' })
  const [ruleHistory, setRuleHistory] = useState<TransactionRule[][]>([])
  const [ruleRedo, setRuleRedo] = useState<TransactionRule[][]>([])
  const [overwriteCategories, setOverwriteCategories] = useState(false)
  const [applyRulesMsg, setApplyRulesMsg] = useState('')

  useEffect(() => {
    runMigrations()
    const tx = loadTransactions(); if (tx) setTransactions(tx)
    const rl = loadTransactionRules(); if (rl) setRules(rl)
  }, [])

  useEffect(() => saveTransactions(transactions), [transactions])
  useEffect(() => saveTransactionRules(rules), [rules])

  return {
    transactions,
    setTransactions,
    txnForm,
    setTxnForm,
    txnHistory,
    setTxnHistory,
    txnRedo,
    setTxnRedo,
    txnFilter,
    setTxnFilter,
    txnDupWarning,
    setTxnDupWarning,
    accountHint,
    setAccountHint,
    txnHint,
    setTxnHint,
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
    deleteDupsConfirm,
    setDeleteDupsConfirm,
    deleteFilteredConfirm,
    setDeleteFilteredConfirm,
    csvImportIsPdf,
    setCsvImportIsPdf,
    pdfPreviewRows,
    setPdfPreviewRows,
    pdfParseWarning,
    setPdfParseWarning,
    deletedTxns,
    setDeletedTxns,
    showRecentlyDeleted,
    setShowRecentlyDeleted,
    reviewOpen,
    setReviewOpen,
    rules,
    setRules,
    ruleForm,
    setRuleForm,
    ruleHint,
    setRuleHint,
    inlineRuleEditId,
    setInlineRuleEditId,
    inlineRuleEditForm,
    setInlineRuleEditForm,
    ruleHistory,
    setRuleHistory,
    ruleRedo,
    setRuleRedo,
    overwriteCategories,
    setOverwriteCategories,
    applyRulesMsg,
    setApplyRulesMsg,
  }
}
