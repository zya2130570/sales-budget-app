import type { Period, Target } from '../types'

// ─── Income / salary constants ────────────────────────────────────────────────

export const BASE_SALARY = 40000
export const TAKE_HOME_RATE = 0.8243
export const HOURS_PER_WEEK = 45

// ─── Commission brackets ──────────────────────────────────────────────────────

export const commissionBrackets = [
  { upTo: 5000,     rate: 0.04 },
  { upTo: 10000,    rate: 0.06 },
  { upTo: 20000,    rate: 0.08 },
  { upTo: 40000,    rate: 0.10 },
  { upTo: 60000,    rate: 0.11 },
  { upTo: 100000,   rate: 0.12 },
  { upTo: Infinity, rate: 0.14 },
]

// ─── Base-bump thresholds ─────────────────────────────────────────────────────

export const BUMP_THRESHOLDS = [20000, 40000, 60000, 80000, 150000, 300000, 500000]

// ─── Scenario defaults ────────────────────────────────────────────────────────

import type { ScenarioName } from '../types'

export const scenarioDefaults: Record<ScenarioName, number> = {
  Slow: 8000,
  Medium: 15000,
  Fast: 30000,
  Custom: 10000,
}

// ─── Period conversion helpers ────────────────────────────────────────────────

export const convertFromMonthly = (m: number, p: Period): number =>
  p === 'weekly' ? m / 4 : p === 'bi-weekly' ? m / 2 : p === 'yearly' ? m * 12 : m

export const convertToMonthly = (v: number, p: Period): number =>
  p === 'weekly' ? v * 4 : p === 'bi-weekly' ? v * 2 : p === 'yearly' ? v / 12 : v

// ─── Remaining-budget tier ────────────────────────────────────────────────────

export const remainingTierFromPeriodValue = (
  remaining: number,
  period: Period,
): { tone: 'good' | 'warn' | 'risk' | 'danger'; label: 'Healthy' | 'Moderate' | 'Risk' } => {
  const thresholds: Record<Period, { redMax: number; yellowMax: number }> = {
    weekly:      { redMax: 50,     yellowMax: 150  },
    'bi-weekly': { redMax: 100,    yellowMax: 300  },
    monthly:     { redMax: 216.67, yellowMax: 650  },
    yearly:      { redMax: 2600,   yellowMax: 7800 },
  }
  const t = thresholds[period]
  if (remaining < 0)         return { tone: 'danger', label: 'Risk' }
  if (remaining < t.redMax)  return { tone: 'risk',   label: 'Risk' }
  if (remaining < t.yellowMax) return { tone: 'warn', label: 'Moderate' }
  return { tone: 'good', label: 'Healthy' }
}

// ─── Commission calculation ───────────────────────────────────────────────────

export function commission(gp: number): number {
  let r = Math.max(0, gp), prev = 0, t = 0
  for (const b of commissionBrackets) {
    if (r <= 0) break
    const x = Math.min(r, b.upTo - prev)
    t += x * b.rate
    r -= x
    prev = b.upTo
  }
  return t
}

// ─── Income breakdown ─────────────────────────────────────────────────────────

export function income(gp: number, adjustedSalary: number) {
  const baseGrossMonthly = adjustedSalary / 12
  const baseMonthly = baseGrossMonthly * TAKE_HOME_RATE
  const c = commission(gp)
  const totalMonthly = baseMonthly + c
  return {
    baseGrossMonthly,
    baseMonthly,
    baseWeekly:    (adjustedSalary / 52) * TAKE_HOME_RATE,
    baseBiWeekly:  (adjustedSalary / 26) * TAKE_HOME_RATE,
    cMonthly:      c,
    cWeekly:       c / 4,
    cBiWeekly:     c / 2,
    totalMonthly,
    totalWeekly:   ((adjustedSalary / 52) * TAKE_HOME_RATE) + c / 4,
    totalBiWeekly: ((adjustedSalary / 26) * TAKE_HOME_RATE) + c / 2,
    commissionPct: totalMonthly > 0 ? (c / totalMonthly) * 100 : 0,
  }
}

// ─── Target status ────────────────────────────────────────────────────────────

export function computeTargetStatus(t: Target): 'Complete' | 'Ahead' | 'On Track' | 'Behind' {
  // Fully funded
  if (t.goalAmount > 0 && t.currentSaved >= t.goalAmount) return 'Complete'

  const toMs = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    if (isNaN(d.getTime())) return NaN
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }

  const todayMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()

  // Resolve start date: startDate field → createdAt → today
  const startMs = (() => {
    if (t.startDate) { const ms = toMs(t.startDate); if (!isNaN(ms)) return ms }
    if (t.createdAt) { const ms = toMs(t.createdAt); if (!isNaN(ms)) return ms }
    return todayMs
  })()

  // Parse deadline
  const deadlineMs = t.deadline ? toMs(t.deadline) : NaN

  // Funding-percentage fallback: used when deadline is missing/invalid or timeline is degenerate
  const fundingPctFallback = (): 'Complete' | 'Ahead' | 'On Track' | 'Behind' => {
    const pct = t.goalAmount > 0 ? t.currentSaved / t.goalAmount : 0
    if (pct >= 1)    return 'Complete'
    if (pct >= 0.6)  return 'Ahead'
    if (pct >= 0.35) return 'On Track'
    return 'Behind'
  }

  if (isNaN(deadlineMs)) return fundingPctFallback()

  const totalDays = (deadlineMs - startMs) / 86400000
  if (totalDays <= 0) return fundingPctFallback()

  // Clamp elapsedDays between 0 and totalDays
  const rawElapsed = (todayMs - startMs) / 86400000
  const elapsedDays = Math.min(totalDays, Math.max(0, rawElapsed))

  const fundedPercent = t.goalAmount > 0 ? (t.currentSaved / t.goalAmount) * 100 : 0

  // Early-stage protection: first 7 days, use funded-percent tiers only
  // This prevents brand-new targets from showing Ahead just because expectedSaved ≈ 0
  if (elapsedDays < 7) {
    if (fundedPercent >= 100) return 'Complete'
    if (fundedPercent >= 15)  return 'Ahead'
    return 'On Track'
  }

  // Normal time-based rule after 7 days with wider 70%–125% buffer
  const expectedProgress = elapsedDays / totalDays
  const expectedSaved = t.goalAmount * expectedProgress

  // If nothing is expected yet (shouldn't reach here after the elapsedDays < 7 guard, but be safe)
  if (expectedSaved <= 0) return 'On Track'

  // Use rounded cents to avoid floating-point weirdness (e.g. 69.9 appearing as Ahead)
  const savedCents          = Math.round(t.currentSaved * 100)
  const behindThresholdCents = Math.round(expectedSaved * 0.70 * 100)
  const aheadThresholdCents  = Math.round(expectedSaved * 1.07 * 100)
  if (savedCents < behindThresholdCents) return 'Behind'
  if (savedCents >= aheadThresholdCents) return 'Ahead'
  return 'On Track'
}

// ─── Required contributions for a target ─────────────────────────────────────

export function requiredForTarget(t: Target) {
  const remaining = Math.max(0, t.goalAmount - t.currentSaved)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadline = t.deadline ? new Date(t.deadline + 'T00:00:00') : today
  deadline.setHours(0, 0, 0, 0)
  const diffMs = deadline.getTime() - today.getTime()
  const days = Math.max(1, Math.ceil(diffMs / 86400000))
  return {
    remaining,
    days,
    weekly:     remaining / (days / 7),
    biWeekly:   remaining / (days / 14),
    monthly:    remaining / (days / 30.4375),
    yearly:     remaining / Math.max(1, days / 365),
    payPeriods: Math.max(1, Math.ceil(days / 14)),
  }
}
