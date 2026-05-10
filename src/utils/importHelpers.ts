// ── V9.0 Import Pipeline Helpers ─────────────────────────────────────────────
// Stateless helpers that transform parsed CSV rows into staged transactions.
// No React, no side effects — pure functions for easy testing.

import type { Transaction, TransactionType, TransactionRule } from '../types'
import type { CsvRow, ColumnMapping } from './csv'

// ── Per-row import result ─────────────────────────────────────────────────────

export type ImportedRowStatus =
  | 'ready'       // valid, no duplicate detected
  | 'duplicate'   // matches an existing or sibling row
  | 'invalid'     // missing required fields or bad values

export type ImportRow = {
  /** Stable index from the original CSV for React keys. */
  index: number
  /** The raw CSV values before transformation. */
  raw: CsvRow
  status: ImportedRowStatus
  invalidReason?: string
  /** Parsed + normalised values (populated for valid rows). */
  date?: string
  merchant?: string
  amount?: number
  type?: TransactionType
  notes?: string
  /** If a rule matched, the category ID that will be auto-applied. */
  autoCategoryId?: string
  /** The rule that matched (for badge display). */
  appliedByRuleId?: string
}

// ── Date normalisation ────────────────────────────────────────────────────────
// Accepts: YYYY-MM-DD (ISO), MM/DD/YYYY, MM-DD-YYYY, M/D/YY
// Returns YYYY-MM-DD or null on failure.

export function normaliseDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null

  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + 'T00:00:00')
    return isNaN(d.getTime()) ? null : s
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const slash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (slash) {
    const [, m, d, y] = slash
    const year = y.length === 2 ? (Number(y) >= 50 ? `19${y}` : `20${y}`) : y
    const iso = `${year.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    const dt = new Date(iso + 'T00:00:00')
    return isNaN(dt.getTime()) ? null : iso
  }

  return null
}

// ── Amount parsing ────────────────────────────────────────────────────────────
// Strips currency symbols, commas, parentheses (negatives), and whitespace.
// Always returns a positive number for expenses (sign is conveyed by type).
// Returns null on failure.

export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/[$,\s]/g, '')
  if (!s) return null
  // Parentheses = negative convention — flip sign for our purposes
  const isParens = s.startsWith('(') && s.endsWith(')')
  const stripped = isParens ? s.slice(1, -1) : s.replace(/^-/, '')
  const n = parseFloat(stripped)
  if (isNaN(n) || n < 0) return null
  return n
}

// ── Type detection ────────────────────────────────────────────────────────────

const INCOME_HINTS    = ['income', 'deposit', 'credit', 'payroll', 'paycheck', 'refund']
const TRANSFER_HINTS  = ['transfer']
const CC_PAY_HINTS    = ['credit card payment', 'cc payment', 'card payment']

export function inferType(raw: string, merchant: string): TransactionType {
  const s = (raw ?? '').toLowerCase().trim()
  if (CC_PAY_HINTS.some(h => s.includes(h) || merchant.toLowerCase().includes(h))) return 'credit card payment'
  if (TRANSFER_HINTS.some(h => s.includes(h) || merchant.toLowerCase().includes(h))) return 'transfer'
  if (INCOME_HINTS.some(h => s.includes(h))) return 'income'
  return 'expense'
}

// ── Duplicate detection ───────────────────────────────────────────────────────
// Checks against existing transactions AND against sibling rows in the same import batch.

export function isDuplicate(
  date: string,
  merchant: string,
  amount: number,
  existing: Transaction[],
  siblings: Array<{ date: string; merchant: string; amount: number }>,
): boolean {
  const mLower = merchant.toLowerCase()
  const inExisting = existing.some(
    x => x.date === date && x.amount === amount && x.merchant.toLowerCase() === mLower
  )
  if (inExisting) return true
  const inSiblings = siblings.some(
    s => s.date === date && s.amount === amount && s.merchant.toLowerCase() === mLower
  )
  return inSiblings
}

// ── Rule matching (mirrors App.tsx normalizeAlias / matchesAnyAlias) ──────────

function normalizeAlias(s: string): string {
  return s.replace(/[\u2018\u2019\u02BC]/g, "'").toLowerCase()
}

function matchesAnyAlias(haystack: string, matchText: string): boolean {
  const normHaystack = normalizeAlias(haystack)
  const normNoApos   = normHaystack.replace(/'/g, '')
  const aliases = matchText
    .split(',')
    .map(a => a.replace(/^['"\u2018\u2019\s]+|['"\u2018\u2019\s]+$/g, ''))
    .filter(Boolean)
  return aliases.some(alias => {
    const normAlias   = normalizeAlias(alias)
    const aliasNoApos = normAlias.replace(/'/g, '')
    return normHaystack.includes(normAlias) || normNoApos.includes(aliasNoApos)
  })
}

function applyRules(
  merchant: string,
  notes: string,
  type: TransactionType,
  rules: TransactionRule[],
): { categoryId: string; ruleId: string } | null {
  const mLower = normalizeAlias(merchant)
  const nLower = normalizeAlias(notes)
  for (const rule of rules) {
    if (rule.type && rule.type !== type) continue
    const haystack = rule.matchField === 'merchant' ? mLower : nLower
    if (matchesAnyAlias(haystack, rule.matchText)) {
      return { categoryId: rule.categoryId, ruleId: rule.id }
    }
  }
  return null
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export type ImportPipelineInput = {
  rows: CsvRow[]
  mapping: ColumnMapping
  existing: Transaction[]
  rules: TransactionRule[]
  /** Default accountId to assign (user can override per-row in the future). */
  defaultAccountId: string
}

export type ImportPipelineResult = {
  importRows: ImportRow[]
  readyCount: number
  duplicateCount: number
  invalidCount: number
}

export function runImportPipeline(input: ImportPipelineInput): ImportPipelineResult {
  const { rows, mapping, existing, rules } = input
  const importRows: ImportRow[] = []
  // Track valid rows for sibling dup detection
  const validSiblings: Array<{ date: string; merchant: string; amount: number }> = []

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i]

    // ── Required field extraction ──
    const rawDate     = mapping.date     ? (raw[mapping.date]     ?? '') : ''
    const rawMerchant = mapping.merchant ? (raw[mapping.merchant] ?? '') : ''
    const rawAmount   = mapping.amount   ? (raw[mapping.amount]   ?? '') : ''
    // Find type column separately (allow blank)
    const typeCol  = Object.keys(raw).find(k => ['type', 'transaction type', 'txn type', 'kind'].includes(k))
    const notesCol = mapping.notes ? mapping.notes : ''

    const date     = normaliseDate(rawDate)
    const merchant = rawMerchant.trim()
    const amount   = parseAmount(rawAmount)
    const notes    = notesCol ? (raw[notesCol] ?? '').trim() : ''

    // ── Validation ──
    if (!date) {
      importRows.push({ index: i, raw, status: 'invalid', invalidReason: `Invalid date: "${rawDate}"` })
      continue
    }
    if (!merchant) {
      importRows.push({ index: i, raw, status: 'invalid', invalidReason: 'Missing merchant / description' })
      continue
    }
    if (amount === null || amount <= 0) {
      importRows.push({ index: i, raw, status: 'invalid', invalidReason: `Invalid amount: "${rawAmount}"` })
      continue
    }

    // ── Type detection ──
    const rawTypeVal = typeCol ? (raw[typeCol] ?? '') : ''
    const type = inferType(rawTypeVal, merchant)

    // ── Duplicate detection ──
    const dup = isDuplicate(date, merchant, amount, existing, validSiblings)
    if (dup) {
      importRows.push({ index: i, raw, status: 'duplicate', date, merchant, amount, type, notes })
      // Don't push to siblings — dup can't be a reference for further dup checks
      continue
    }

    // ── Rule matching ──
    const ruleMatch = applyRules(merchant, notes, type, rules)

    importRows.push({
      index: i, raw, status: 'ready',
      date, merchant, amount, type, notes,
      autoCategoryId: ruleMatch?.categoryId,
      appliedByRuleId: ruleMatch?.ruleId,
    })
    validSiblings.push({ date, merchant, amount })
  }

  const readyCount     = importRows.filter(r => r.status === 'ready').length
  const duplicateCount = importRows.filter(r => r.status === 'duplicate').length
  const invalidCount   = importRows.filter(r => r.status === 'invalid').length

  return { importRows, readyCount, duplicateCount, invalidCount }
}

// ── Commit import ─────────────────────────────────────────────────────────────
// Converts staged ImportRows into Transaction objects, ready for state update.

export function buildImportedTransactions(
  importRows: ImportRow[],
  defaultAccountId: string,
  importBatchId: string,
  includeDuplicates: boolean,
): Transaction[] {
  const now = new Date().toISOString()
  return importRows
    .filter(r => r.status === 'ready' || (includeDuplicates && r.status === 'duplicate'))
    .filter((r): r is ImportRow & { date: string; merchant: string; amount: number; type: TransactionType } =>
      r.date !== undefined && r.merchant !== undefined && r.amount !== undefined && r.type !== undefined
    )
    .map(r => ({
      id: crypto.randomUUID(),
      date: r.date,
      accountId: defaultAccountId,
      merchant: r.merchant,
      amount: r.amount,
      type: r.type,
      categoryId: r.autoCategoryId || undefined,
      appliedByRule: r.appliedByRuleId,
      notes: r.notes || undefined,
      createdAt: now,
      // V9 import metadata stored as optional string fields via type augmentation
      importedAt:    now,
      importBatchId,
      importSource:  'csv' as const,
    } as Transaction & { importedAt: string; importBatchId: string; importSource: 'csv' }))
}
