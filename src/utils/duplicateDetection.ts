import type { Transaction } from '../types'
import { normalizeMerchant } from './merchantNormalization'

export type DuplicateMatchOptions = {
  includeAccount?: boolean
  dismissedDupIds?: Set<string>
  confirmedDupIds?: Set<string>
}

export const duplicateTransactionKey = (
  tx: Pick<Transaction, 'date' | 'merchant' | 'amount' | 'accountId'>,
  options: { includeAccount?: boolean } = {},
): string => {
  const base = `${tx.date}|${normalizeMerchant(tx.merchant).toLowerCase()}|${tx.amount.toFixed(2)}`
  return options.includeAccount ? `${base}|${tx.accountId}` : base
}

export const areDuplicateTransactions = (
  a: Pick<Transaction, 'id' | 'date' | 'merchant' | 'amount' | 'accountId'>,
  b: Pick<Transaction, 'id' | 'date' | 'merchant' | 'amount' | 'accountId'>,
  options: { includeAccount?: boolean } = {},
): boolean =>
  a.id !== b.id && duplicateTransactionKey(a, options) === duplicateTransactionKey(b, options)

export const hasDuplicateTransaction = (
  tx: Pick<Transaction, 'id' | 'date' | 'merchant' | 'amount' | 'accountId'>,
  transactions: Array<Pick<Transaction, 'id' | 'date' | 'merchant' | 'amount' | 'accountId'>>,
  options: DuplicateMatchOptions = {},
): boolean => {
  if (options.dismissedDupIds?.has(tx.id) || options.confirmedDupIds?.has(tx.id)) return false
  return transactions.some(other => {
    if (options.dismissedDupIds?.has(other.id) || options.confirmedDupIds?.has(other.id)) return false
    return areDuplicateTransactions(tx, other, { includeAccount: options.includeAccount })
  })
}

export const unresolvedDuplicateTransactions = (
  transactions: Transaction[],
  options: DuplicateMatchOptions = {},
): Transaction[] =>
  transactions.filter(tx => hasDuplicateTransaction(tx, transactions, options))
