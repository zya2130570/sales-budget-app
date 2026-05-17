// ── Budget Math Helpers ────────────────────────────────────────────────────────
// Pure functions for budget variance tones and category status labels.
// These are extracted from App.tsx and have no React dependencies.

import type { Period } from '../types'

/** Map an overspend amount to a visual tone for the given period. */
export function varianceTone(
  overspendAmt: number,
  p: Period,
): 'good' | 'neutral' | 'warn' | 'danger' {
  const threshold = p === 'weekly' ? 50 : p === 'bi-weekly' ? 100 : p === 'monthly' ? 216 : 2600
  if (overspendAmt <= 0) return 'good'
  if (overspendAmt <= threshold)     return 'neutral'
  if (overspendAmt <= threshold * 2) return 'warn'
  return 'danger'
}

/**
 * Per-category status label based on actual vs planned spend.
 *
 * @param actual  The effective actual total for this category (null = no data).
 * @param planned The planned budget amount for the current period.
 */
export function catStatus(
  actual: number | null,
  planned: number,
): 'Over Budget' | 'Near Limit' | 'On Track' | 'Under Budget' | 'No Activity' {
  if (actual === null) return 'No Activity'
  if (actual > planned)                         return 'Over Budget'
  if (planned > 0 && actual / planned >= 0.8)   return 'Near Limit'
  if (planned > 0 && actual / planned < 0.3)    return 'Under Budget'
  return 'On Track'
}
