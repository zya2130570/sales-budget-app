import type { DuplicateResolution, DuplicateResolutionStatus, Transaction } from '../types'
import { normalizeMerchant } from './merchantNormalization'

export type DuplicateMatchOptions = {
  includeAccount?: boolean
  dismissedDupIds?: Set<string>
  confirmedDupIds?: Set<string>
  resolutions?: DuplicateResolution[]
}

export const duplicateTransactionKey = (
  tx: Pick<Transaction, 'date' | 'merchant' | 'amount' | 'accountId'>,
  options: { includeAccount?: boolean } = {},
): string => {
  const amount = Number.isFinite(tx.amount) ? tx.amount : 0
  const base = `${tx.date}|${normalizeMerchant(tx.merchant).toLowerCase()}|${amount.toFixed(2)}`
  return options.includeAccount ? `${base}|${tx.accountId}` : base
}

export const duplicateGroupIdForTransactions = (
  transactions: Array<Pick<Transaction, 'date' | 'merchant' | 'amount' | 'accountId'>>,
  options: { includeAccount?: boolean } = {},
): string => {
  const keys = [...new Set(transactions.map(tx => duplicateTransactionKey(tx, options)))].sort()
  return keys.join('::')
}

export const createDuplicateResolution = (
  transactions: Transaction[],
  status: DuplicateResolutionStatus,
  resolvedAt = new Date().toISOString(),
  options: { includeAccount?: boolean } = {},
): DuplicateResolution => {
  const transactionIds = transactions.map(tx => tx.id).sort()
  const groupId = duplicateGroupIdForTransactions(transactions, options)
  return {
    id: `${groupId}|${transactionIds.join(',')}`,
    groupId,
    transactionIds,
    status,
    resolvedAt: status === 'unresolved' ? undefined : resolvedAt,
  }
}

export const resolutionCoversTransaction = (resolution: DuplicateResolution, transactionId: string): boolean =>
  resolution.transactionIds.includes(transactionId)

export const isTransactionResolvedDuplicate = (
  transactionId: string,
  resolutions: DuplicateResolution[] = [],
): boolean =>
  resolutions.some(resolution =>
    resolutionCoversTransaction(resolution, transactionId) &&
    (resolution.status === 'kept-both' || resolution.status === 'deleted' || resolution.status === 'not-duplicate')
  )

export const areDuplicateTransactions = (
  a: Pick<Transaction, 'id' | 'date' | 'merchant' | 'amount' | 'accountId'>,
  b: Pick<Transaction, 'id' | 'date' | 'merchant' | 'amount' | 'accountId'>,
  options: { includeAccount?: boolean } = {},): boolean =>
  a.id !== b.id && duplicateTransactionKey(a, options) === duplicateTransactionKey(b, options)

export const hasDuplicateTransaction = (
  tx: Pick<Transaction, 'id' | 'date' | 'merchant' | 'amount' | 'accountId'>,
  transactions: Array<Pick<Transaction, 'id' | 'date' | 'merchant' | 'amount' | 'accountId'>>,
  options: DuplicateMatchOptions = {},
): boolean => {
  if (options.dismissedDupIds?.has(tx.id) || options.confirmedDupIds?.has(tx.id)) return false
  if (isTransactionResolvedDuplicate(tx.id, options.resolutions)) return false
  return transactions.some(other => {
    if (options.dismissedDupIds?.has(other.id) || options.confirmedDupIds?.has(other.id)) return false
    if (isTransactionResolvedDuplicate(other.id, options.resolutions)) return false
    return areDuplicateTransactions(tx, other, { includeAccount: options.includeAccount })
  })
}

export const unresolvedDuplicateTransactions = (
  transactions: Transaction[],
  options: DuplicateMatchOptions = {},
): Transaction[] =>
  transactions.filter(tx => hasDuplicateTransaction(tx, transactions, options))
