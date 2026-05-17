// ── Account Math Helpers ───────────────────────────────────────────────────────
// Pure functions for account balance summaries and reconciliation.
// All are extracted from App.tsx and have no React dependencies.

import type { Account, AccountType, Transaction } from '../types'

/** Floating-point tolerance used for "reconciled" checks (≈ 2 cents). */
export const RECON_THRESHOLD = 0.02

// ── Net worth summary ─────────────────────────────────────────────────────────

export type NetWorthSummary = {
  totalCash: number
  totalDebt: number
  totalInvestments: number
  netWorth: number
}

/**
 * Summarise accounts into cash / debt / investments / net worth.
 * Debt uses the raw account.balance (user-entered baseline) because credit-card
 * debt is what the user actually owes — not the computed activity delta.
 */
export function computeNetWorth(
  accounts: Account[],
  computedBalances: Record<string, number>,
): NetWorthSummary {
  let totalCash = 0, totalDebt = 0, totalInvestments = 0
  for (const acct of accounts) {
    const computedBal = computedBalances[acct.id] ?? acct.balance
    if (acct.type === 'credit card') {
      totalDebt += Math.abs(Math.min(0, acct.balance))
    } else if (acct.type === 'investment' || acct.type === 'roth ira' || acct.type === 'retirement') {
      totalInvestments += Math.max(0, computedBal)
    } else {
      totalCash += computedBal
    }
  }
  return { totalCash, totalDebt, totalInvestments, netWorth: totalCash + totalInvestments - totalDebt }
}

// ── Balance check (tracked activity) ─────────────────────────────────────────

export type BalanceCheckEntry = {
  trackedActivity: number
  unexplained: number
  isMatched: boolean
}

/**
 * Compute per-account tracked transaction activity and compare to the user's
 * manually-entered current balance.
 *
 * Rules:
 * - expense on CC    → increases tracked debt
 * - expense on other → decreases balance
 * - income           → increases balance (non-CC only)
 * - transfer         → flows between non-CC accounts
 * - cc payment       → reduces CC tracked debt; reduces source balance
 */
export function computeBalanceCheckData(
  accounts: Account[],
  transactions: Transaction[],
): Record<string, BalanceCheckEntry> {
  const typeOf: Record<string, AccountType> = {}
  for (const acct of accounts) typeOf[acct.id] = acct.type

  const deltas: Record<string, number> = {}
  const add = (id: string | undefined, amt: number) => {
    if (!id) return
    deltas[id] = (deltas[id] ?? 0) + amt
  }

  for (const tx of transactions) {
    const srcType = typeOf[tx.accountId]
    const dstType = tx.toAccountId ? typeOf[tx.toAccountId] : undefined

    if (tx.type === 'expense') {
      if (srcType === 'credit card') {
        add(tx.accountId, tx.amount)   // CC charge: increases tracked debt
      } else {
        add(tx.accountId, -tx.amount)  // Other: decreases balance
      }
    } else if (tx.type === 'income') {
      if (srcType !== 'credit card') add(tx.accountId, tx.amount)
    } else if (tx.type === 'transfer') {
      if (srcType !== 'credit card') add(tx.accountId, -tx.amount)
      if (tx.toAccountId && dstType !== 'credit card') add(tx.toAccountId, tx.amount)
    } else if (tx.type === 'credit card payment') {
      if (srcType !== 'credit card') add(tx.accountId, -tx.amount)
      if (tx.toAccountId && dstType === 'credit card') add(tx.toAccountId, -tx.amount)
    }
  }

  const result: Record<string, BalanceCheckEntry> = {}
  for (const acct of accounts) {
    const trackedActivity = deltas[acct.id] ?? 0
    const currentAmt = acct.type === 'credit card' ? Math.abs(acct.balance) : acct.balance
    const unexplained = currentAmt - trackedActivity
    result[acct.id] = {
      trackedActivity,
      unexplained,
      isMatched: Math.abs(unexplained) <= RECON_THRESHOLD,
    }
  }
  return result
}

// ── Reconciliation ────────────────────────────────────────────────────────────

export type ReconciliationEntry = {
  startingBalance: number
  txnImpact: number
  expectedBalance: number
  actualBalance: number
  difference: number
  isReconciled: boolean
}

/**
 * Full reconciliation: compare starting balance + transaction impact vs
 * user-entered current balance for each account.
 */
export function computeReconciliationData(
  accounts: Account[],
  computedBalances: Record<string, number>,
): Record<string, ReconciliationEntry> {
  const result: Record<string, ReconciliationEntry> = {}
  for (const acct of accounts) {
    const startingBalance = (acct as Account & { startingBalance?: number }).startingBalance ?? acct.balance
    const expectedBalance = computedBalances[acct.id] ?? acct.balance
    const txnImpact       = expectedBalance - startingBalance
    const actualBalance   = acct.balance
    const difference      = actualBalance - expectedBalance
    result[acct.id] = {
      startingBalance, txnImpact, expectedBalance, actualBalance, difference,
      isReconciled: Math.abs(difference) <= RECON_THRESHOLD,
    }
  }
  return result
}
