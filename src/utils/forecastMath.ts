// ── Forecast Math Helpers ─────────────────────────────────────────────────────
// Pure helpers for cash-flow forecasting and recurring-item projections.

import type { RecurringCandidate } from './recurring'

/** Cadence options for manual recurring items. */
export type RecurringCadence = 'weekly' | 'bi-weekly' | 'monthly' | 'yearly'

/** Monthly-frequency multiplier for each cadence. */
export function cadenceMult(c: RecurringCadence | 'weekly' | 'bi-weekly' | 'monthly'): number {
  if (c === 'weekly')    return 4.33
  if (c === 'bi-weekly') return 2.17
  if (c === 'yearly')    return 1 / 12
  return 1 // monthly
}

/** Step size in days for each cadence (for projecting next occurrences). */
export function cadenceStepDays(c: RecurringCadence | 'weekly' | 'bi-weekly' | 'monthly'): number {
  if (c === 'weekly')    return 7
  if (c === 'bi-weekly') return 14
  if (c === 'yearly')    return 365
  return 30 // monthly
}

export type ForecastLineItem = {
  date: string
  name: string
  amount: number
  type: 'expense' | 'income'
  source: 'detected' | 'manual'
}

export type ManualRecurringItem = {
  id: string
  name: string
  amount: number
  cadence: RecurringCadence
  nextDueDate: string
  type: 'expense' | 'income'
}

/**
 * Project manual recurring items into a date window, returning one
 * ForecastLineItem per occurrence within [todayStr, endDate].
 */
export function projectManualItems(
  items: ManualRecurringItem[],
  todayStr: string,
  endDate: Date,
): ForecastLineItem[] {
  const result: ForecastLineItem[] = []
  for (const item of items) {
    const step = cadenceStepDays(item.cadence)
    let next = new Date(item.nextDueDate + 'T00:00:00')
    for (let guard = 0; next <= endDate && guard < 60; guard++, next = new Date(next.getTime() + step * 86_400_000)) {
      const ds = next.toISOString().slice(0, 10)
      if (ds >= todayStr) {
        result.push({ date: ds, name: item.name, amount: item.amount, type: item.type, source: 'manual' })
      }
    }
  }
  return result
}

/**
 * Project confirmed/high-confidence recurring candidates into a date window.
 * Uses the last known occurrence date + cadence step to estimate future dates.
 */
export function projectRecurringCandidates(
  candidates: RecurringCandidate[],
  todayStr: string,
  endDate: Date,
): ForecastLineItem[] {
  const result: ForecastLineItem[] = []
  for (const c of candidates) {
    const step = c.cadence === 'weekly' ? 7 : c.cadence === 'bi-weekly' ? 14 : 30
    const perOccurrence = c.estimatedMonthlyAmount / cadenceMult(c.cadence)
    let next = new Date(new Date(c.lastDate + 'T00:00:00').getTime() + step * 86_400_000)
    for (let guard = 0; next <= endDate && guard < 60; guard++, next = new Date(next.getTime() + step * 86_400_000)) {
      const ds = next.toISOString().slice(0, 10)
      if (ds >= todayStr) {
        result.push({ date: ds, name: c.displayName, amount: perOccurrence, type: 'expense', source: 'detected' })
      }
    }
  }
  return result
}
