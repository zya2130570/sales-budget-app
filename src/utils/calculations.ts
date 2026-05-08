import type { Period, Target, Category, ScenarioName } from '../types'

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
  if (remaining < 0)           return { tone: 'danger', label: 'Risk' }
  if (remaining < t.redMax)    return { tone: 'risk',   label: 'Risk' }
  if (remaining < t.yellowMax) return { tone: 'warn',   label: 'Moderate' }
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
  if (t.goalAmount > 0 && t.currentSaved >= t.goalAmount) return 'Complete'

  const toMs = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    if (isNaN(d.getTime())) return NaN
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }

  const todayMs = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() })()

  const startMs = (() => {
    if (t.startDate) { const ms = toMs(t.startDate); if (!isNaN(ms)) return ms }
    if (t.createdAt) { const ms = toMs(t.createdAt); if (!isNaN(ms)) return ms }
    return todayMs
  })()

  const deadlineMs = t.deadline ? toMs(t.deadline) : NaN

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

  const rawElapsed = (todayMs - startMs) / 86400000
  const elapsedDays = Math.min(totalDays, Math.max(0, rawElapsed))

  const fundedPercent = t.goalAmount > 0 ? (t.currentSaved / t.goalAmount) * 100 : 0

  if (elapsedDays < 7) {
    if (fundedPercent >= 100) return 'Complete'
    if (fundedPercent >= 15)  return 'Ahead'
    return 'On Track'
  }

  const expectedProgress = elapsedDays / totalDays
  const expectedSaved = t.goalAmount * expectedProgress

  if (expectedSaved <= 0) return 'On Track'

  const savedCents           = Math.round(t.currentSaved * 100)
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

// ─── V7.1 Dashboard Status Engine ────────────────────────────────────────────
//
// Computes an interpreted overall financial status from:
//   - monthly income breakdown
//   - budget category totals (byType)
//   - commission dependency
//   - active savings targets
//
// Returns a status label, severity tone, a one-sentence explanation,
// and a secondary context note.

export type DashboardStatusTone = 'excellent' | 'good' | 'warn' | 'risk' | 'danger'

export interface DashboardStatus {
  /** Short label shown prominently, e.g. "On Track", "At Risk", "Over Budget" */
  label: string
  /** Colour/severity tier for styling */
  tone: DashboardStatusTone
  /** One-sentence plain-English explanation of why this status was assigned */
  explanation: string
  /** Secondary context note (e.g. top lever to pull, savings rate observation) */
  context: string
}

export interface DashboardStatusInput {
  totalMonthly: number       // total net monthly income
  monthlyBudget: number      // sum of all category amounts (monthly)
  monthlyLeft: number        // totalMonthly - monthlyBudget
  savingsRate: number        // (savings + investing) / totalMonthly * 100
  fixedRatio: number         // fixed bills / totalMonthly * 100
  commissionPct: number      // commission / totalMonthly * 100
  categories: Category[]
  activeTargets: Target[]
  period: Period
}

export function computeDashboardStatus(input: DashboardStatusInput): DashboardStatus {
  const {
    totalMonthly,
    monthlyBudget,
    monthlyLeft,
    savingsRate,
    fixedRatio,
    commissionPct,
    categories,
    activeTargets,
    period,
  } = input

  const hasBudget = monthlyBudget > 0
  const cushionPct = totalMonthly > 0 ? (monthlyLeft / totalMonthly) * 100 : 0

  // ── No budget data ──────────────────────────────────────────────────────────
  if (!hasBudget) {
    return {
      label: 'No Budget Yet',
      tone: 'warn',
      explanation: 'Add your expenses to the Budget tab to see your financial health score.',
      context: 'Start with your largest fixed bills for the most accurate picture.',
    }
  }

  // ── Over budget ─────────────────────────────────────────────────────────────
  if (monthlyLeft < 0) {
    const overBy = Math.abs(monthlyLeft)
    const topVariable = [...categories]
      .filter(c => c.type === 'variable spending')
      .sort((a, b) => b.amount - a.amount)[0]
    const topBill = [...categories]
      .filter(c => c.type !== 'savings' && c.type !== 'investing')
      .sort((a, b) => b.amount - a.amount)[0]
    const lever = topVariable
      ? `Review ${topVariable.name}, your largest flexible expense.`
      : topBill
        ? `Your biggest bill is ${topBill.name} — see if it can be reduced.`
        : 'Review your largest expenses first.'
    return {
      label: 'Over Budget',
      tone: 'danger',
      explanation: `Your expenses exceed income by ${formatMoney(overBy)} per month.`,
      context: lever,
    }
  }

  // ── Determine cushion tier ──────────────────────────────────────────────────
  // cushionPct: <5% danger, 5–15% risk, 15–30% warn, ≥30% good/excellent
  const cushionTier: 'danger' | 'risk' | 'warn' | 'ok' =
    cushionPct < 5  ? 'danger' :
    cushionPct < 15 ? 'risk'   :
    cushionPct < 30 ? 'warn'   : 'ok'

  // ── Savings rate tier ───────────────────────────────────────────────────────
  // ≥20% good, 10–20% warn, <10% danger
  const savingsTier: 'good' | 'warn' | 'low' =
    savingsRate >= 20 ? 'good' :
    savingsRate >= 10 ? 'warn' : 'low'

  // ── Commission dependency tier ──────────────────────────────────────────────
  // ≤35% safe, 35–55% elevated, >55% high
  const commTier: 'safe' | 'elevated' | 'high' =
    commissionPct <= 35 ? 'safe'     :
    commissionPct <= 55 ? 'elevated' : 'high'

  // ── Behind-on-goals count ───────────────────────────────────────────────────
  const behindCount = activeTargets.filter(t => computeTargetStatus(t) === 'Behind').length

  // ── Combine signals into overall status ────────────────────────────────────
  // Priority order: cushion → savings rate → commission → goals

  // EXCELLENT: cushion ≥30%, savings ≥20%, commission safe, no behind goals
  if (
    cushionTier === 'ok' &&
    savingsTier === 'good' &&
    commTier === 'safe' &&
    behindCount === 0
  ) {
    return {
      label: 'Excellent',
      tone: 'excellent',
      explanation: `You have a ${cushionPct.toFixed(0)}% income cushion, a ${savingsRate.toFixed(0)}% savings rate, and all goals on track.`,
      context: commissionPct > 20
        ? `Commission is ${commissionPct.toFixed(0)}% of income — keep growing that base.`
        : 'Your finances are in strong shape. Consider increasing your investing allocation.',
    }
  }

  // GOOD: cushion ≥30%, savings ≥10%
  if (cushionTier === 'ok' && savingsTier !== 'low') {
    const goalNote = behindCount > 0
      ? `${behindCount} savings goal${behindCount > 1 ? 's are' : ' is'} behind — log a contribution to catch up.`
      : 'Your goals are on track.'
    return {
      label: 'Good',
      tone: 'good',
      explanation: `You have a healthy ${cushionPct.toFixed(0)}% cushion and a ${savingsRate.toFixed(0)}% savings rate.`,
      context: goalNote,
    }
  }

  // TIGHT CUSHION with decent savings
  if (cushionTier === 'warn' && savingsTier !== 'low') {
    const topVariable = [...categories]
      .filter(c => c.type === 'variable spending')
      .sort((a, b) => b.amount - a.amount)[0]
    return {
      label: 'Manageable',
      tone: 'warn',
      explanation: `Your cushion is ${cushionPct.toFixed(0)}% — comfortable but worth monitoring ${periodLabel(period)}.`,
      context: topVariable
        ? `Trimming ${topVariable.name} would give you the most breathing room.`
        : `Fixed bills are ${fixedRatio.toFixed(0)}% of income, leaving limited flexibility.`,
    }
  }

  // LOW SAVINGS RATE regardless of cushion
  if (savingsTier === 'low') {
    return {
      label: 'Low Savings',
      tone: cushionTier === 'ok' ? 'warn' : 'risk',
      explanation: `Your savings rate is ${savingsRate.toFixed(0)}% — below the 10% minimum recommended.`,
      context: cushionPct > 15
        ? `You have ${cushionPct.toFixed(0)}% cushion available — redirect some toward savings.`
        : 'Reducing variable spending would free up room to save.',
    }
  }

  // RISK: tight cushion
  if (cushionTier === 'risk') {
    const commNote = commTier !== 'safe'
      ? ` Commission makes up ${commissionPct.toFixed(0)}% of income, adding variability.`
      : ''
    return {
      label: 'At Risk',
      tone: 'risk',
      explanation: `Only ${cushionPct.toFixed(0)}% of income remains after expenses.${commNote}`,
      context: behindCount > 0
        ? `${behindCount} goal${behindCount > 1 ? 's are' : ' is'} behind — address budget cushion first.`
        : 'Consider reducing a fixed bill or variable expense to build a buffer.',
    }
  }

  // DANGER: very tight cushion
  return {
    label: 'Danger',
    tone: 'danger',
    explanation: `Only ${cushionPct.toFixed(0)}% of income remains — a single unexpected expense could push you over.`,
    context: fixedRatio > 60
      ? `Fixed bills consume ${fixedRatio.toFixed(0)}% of income, leaving very little flexibility.`
      : 'Cutting variable spending is your fastest lever right now.',
  }
}

// ─── Internal helpers (not exported) ─────────────────────────────────────────

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function periodLabel(p: Period): string {
  return p === 'weekly' ? 'this week' : p === 'bi-weekly' ? 'this pay period' : p === 'monthly' ? 'this month' : 'this year'
}
