// ── Recurring Transaction Detection ──────────────────────────────────────────
// Groups transactions by normalized merchant, computes day-gaps between
// consecutive occurrences, and classifies cadence as weekly / bi-weekly / monthly.

import type { Transaction } from '../types'
import { normalizeMerchant } from './merchantNormalization'

export type RecurringCandidate = {
  merchantKey: string       // normalized, lowercased merchant name (group key)
  displayName: string       // pretty display name
  cadence: 'weekly' | 'bi-weekly' | 'monthly'
  estimatedMonthlyAmount: number
  lastDate: string
  count: number
  txnIds: string[]
  confidence: 'high' | 'medium'
}

/** Detect transactions that repeat on a regular cadence per normalized merchant. */
export function detectRecurringPatterns(transactions: Transaction[]): RecurringCandidate[] {
  const groups = new Map<string, Transaction[]>()
  for (const tx of transactions) {
    if (tx.type !== 'expense' && tx.type !== 'income') continue
    const display = normalizeMerchant(tx.merchant)
    const key     = display.toLowerCase()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(tx)
  }

  const results: RecurringCandidate[] = []

  for (const [key, txns] of groups.entries()) {
    if (txns.length < 2) continue
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date))

    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) {
      const ms = new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()
      gaps.push(ms / 86_400_000)
    }
    const medianGap = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]

    let cadence: RecurringCandidate['cadence'] | null = null
    if (medianGap >= 5  && medianGap <= 9)  cadence = 'weekly'
    else if (medianGap >= 11 && medianGap <= 18) cadence = 'bi-weekly'
    else if (medianGap >= 25 && medianGap <= 35) cadence = 'monthly'
    if (!cadence) continue

    const avg    = sorted.reduce((s, t) => s + t.amount, 0) / sorted.length
    const maxDev = Math.max(...sorted.map(t => Math.abs(t.amount - avg) / (avg || 1)))
    if (maxDev > 0.4) continue

    const monthlyAmt = cadence === 'weekly' ? avg * 4.33 : cadence === 'bi-weekly' ? avg * 2.17 : avg
    results.push({
      merchantKey: key,
      displayName: normalizeMerchant(sorted[0].merchant),
      cadence,
      estimatedMonthlyAmount: monthlyAmt,
      lastDate: sorted[sorted.length - 1].date,
      count: sorted.length,
      txnIds: sorted.map(t => t.id),
      confidence: sorted.length >= 3 ? 'high' : 'medium',
    })
  }

  return results.sort((a, b) => b.estimatedMonthlyAmount - a.estimatedMonthlyAmount)
}
