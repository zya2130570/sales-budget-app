// ── Transaction Review Helpers ─────────────────────────────────────────────────
import type { Transaction, TransactionType } from '../types'
import { hasDuplicateTransaction } from './duplicateDetection'

export type TxConfidence = 'high' | 'medium' | 'low'

/** Returns true if transaction needs user attention (uncategorized or duplicate). */
export function txNeedsReview(
  tx: Transaction,
  allTxns: Transaction[],
  dismissedDupIds?: Set<string>,
): boolean {
  if (tx.type === 'expense' && !tx.categoryId) return true
  return hasDuplicateTransaction(tx, allTxns, { dismissedDupIds, includeAccount: false })
}

/** Estimates how confident we are that a transaction is properly categorized. */
export function txConfidence(tx: Transaction, allTxns: Transaction[]): TxConfidence {
  if (tx.type !== 'expense') return 'high'
  if (tx.categoryId) return 'high'
  const seenCategorized = allTxns.some(o =>
    o.id !== tx.id &&
    o.merchant.toLowerCase() === tx.merchant.toLowerCase() &&
    o.categoryId
  )
  return seenCategorized ? 'medium' : 'low'
}

// ── Transaction UI Constants ───────────────────────────────────────────────────

export const TXN_TYPE_LABELS: Record<TransactionType, string> = {
  expense:               'Expense',
  income:                'Income',
  transfer:              'Transfer',
  'credit card payment': 'Credit Card Payment',
}

export const TXN_FILTER_OPTIONS = [
  { value: 'all'                 as const, label: 'All'                 },
  { value: 'needs-review'        as const, label: 'Needs Review'        },
  { value: 'uncategorized'       as const, label: 'Uncategorized'       },
  { value: 'expense'             as const, label: 'Expense'             },
  { value: 'income'              as const, label: 'Income'              },
  { value: 'transfer'            as const, label: 'Transfer'            },
  { value: 'credit card payment' as const, label: 'Credit Card Payment' },
]
