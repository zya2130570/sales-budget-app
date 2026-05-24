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
  _computedBalances?: Record<string, number>,
): NetWorthSummary {
  let totalCash = 0, totalDebt = 0, totalInvestments = 0
  for (const acct of accounts) {
    // Net worth should reflect the current balances the user entered or restored.
    // Imported transaction history is useful for review/reconciliation, but it can
    // be incomplete when only one account source has been imported. Using tracked
    // activity here made cash look artificially negative when Apple Card history
    // existed but Chase/Ally income history did not.
    const currentBalance = Number(acct.balance) || 0

    if (acct.type === 'credit card') {
      totalDebt += Math.abs(Math.min(0, currentBalance))
    } else if (acct.type === 'investment' || acct.type === 'roth ira' || acct.type === 'retirement') {
      totalInvestments += Math.max(0, currentBalance)
    } else {
      totalCash += currentBalance
    }
  }
  return { totalCash, totalDebt, totalInvestments, netWorth: totalCash + totalInvestments - totalDebt }
}

// ── Balance check (tracked activity) ─────────────────────────────────────────

export type BalanceCheckEntry = {
  trackedActivity: number
  unexplained: number
  isMatched: boolean
  /** True only after the user explicitly reconciles this account.
   * Until then, transaction history may be partial, so unexplained gaps should
   * not be treated as errors. */
  hasReconciliationBaseline: boolean
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
    const hasReconciliationBaseline = Boolean(acct.lastReconciledAt)

    // Only compare against a baseline after the user explicitly reconciles the
    // account. Before that, the app may only have partial history, for example
    // Apple Card spending without Chase/Ally paycheck deposits.
    let unexplained = 0
    if (hasReconciliationBaseline) {
      if (acct.type === 'credit card') {
        const currentDebt = Math.abs(Math.min(0, acct.balance))
        const startingDebt = Math.abs(Math.min(0, acct.startingBalance ?? acct.balance))
        const expectedDebt = startingDebt + trackedActivity
        unexplained = currentDebt - expectedDebt
      } else {
        const startingBalance = acct.startingBalance ?? acct.balance
        const expectedBalance = startingBalance + trackedActivity
        unexplained = acct.balance - expectedBalance
      }
    }

    result[acct.id] = {
      trackedActivity,
      unexplained,
      hasReconciliationBaseline,
      isMatched: !hasReconciliationBaseline || Math.abs(unexplained) <= RECON_THRESHOLD,
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
