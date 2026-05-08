import type { Period, Target, Category } from '../types'

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
  if (elapsedDays < 7) {
    if (fundedPercent >= 100) return 'Complete'
    if (fundedPercent >= 15)  return 'Ahead'
    return 'On Track'
  }

  // Normal time-based rule after 7 days
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

// ─── Dashboard Status Engine ──────────────────────────────────────────────────
//
// Derives a single interpreted financial state from the user's current numbers.
// All inputs are monthly figures or ratios, so the engine is period-agnostic.
//
// Tone scale (for UI color):
//   'strong'  → calm green  (things are going well)
//   'stable'  → neutral     (on track, no action needed)
//   'watch'   → warm amber  (worth keeping an eye on)
//   'act'     → soft orange (something needs attention)
//   'recover' → muted red   (clear pressure, but not catastrophic)

export type DashboardStatusKey =
  | 'VeryStrongMonth'
  | 'StrongMonth'
  | 'FinanciallyStable'
  | 'TightButStable'
  | 'CushionShrinking'
  | 'GoalPressureAhead'
  | 'OverspendingTrend'
  | 'RecoveryMonth'
  | 'AttentionNeeded'

export type DashboardStatusTone = 'strong' | 'stable' | 'watch' | 'act' | 'recover'

export interface DashboardStatus {
  key: DashboardStatusKey
  label: string
  tone: DashboardStatusTone
  explanation: string
  /** Secondary supporting insight (optional, shown in middle layer) */
  insight?: string
}

export interface DashboardStatusInput {
  // Monthly figures
  totalMonthlyIncome: number
  monthlyBudget: number
  monthlyLeft: number
  // Ratios (0–100)
  fixedRatio: number       // fixed bills as % of income
  savingsRate: number      // (savings + investing) as % of income
  commissionPct: number    // commission as % of total income
  // Budget composition
  categories: Category[]
  // Goal signals
  activeTargets: Target[]
  // Whether enough data exists to give a meaningful status
  hasBudgetData: boolean
}

export function computeDashboardStatus(input: DashboardStatusInput): DashboardStatus {
  const {
    totalMonthlyIncome,
    monthlyLeft,
    fixedRatio,
    savingsRate,
    commissionPct,
    activeTargets,
    hasBudgetData,
  } = input

  // ── No data state ─────────────────────────────────────────────────────────
  if (!hasBudgetData || totalMonthlyIncome <= 0) {
    return {
      key: 'FinanciallyStable',
      label: 'Getting Started',
      tone: 'stable',
      explanation: 'Add your expenses in the Budget tab to see your financial picture here.',
    }
  }

  const cushionPct = totalMonthlyIncome > 0 ? (monthlyLeft / totalMonthlyIncome) * 100 : 0
  const isOverBudget = monthlyLeft < 0

  // ── Goal pressure signals ─────────────────────────────────────────────────
  const behindTargets = activeTargets.filter(t => computeTargetStatus(t) === 'Behind')
  const hasBehindGoals = behindTargets.length > 0
  const behindGoalNames = behindTargets.slice(0, 2).map(t => t.name).join(', ')

  // ── Over budget ───────────────────────────────────────────────────────────
  if (isOverBudget) {
    const overBy = Math.abs(monthlyLeft)
    const overPct = totalMonthlyIncome > 0 ? (overBy / totalMonthlyIncome) * 100 : 0
    if (overPct >= 10) {
      return {
        key: 'OverspendingTrend',
        label: 'Spending Exceeds Income',
        tone: 'recover',
        explanation: `Your planned expenses are running ${overPct.toFixed(0)}% above your current income. Reducing variable costs or increasing income will stabilize the plan.`,
        insight: fixedRatio > 60
          ? `Fixed bills are consuming ${fixedRatio.toFixed(0)}% of income, which limits how much you can adjust quickly.`
          : undefined,
      }
    }
    return {
      key: 'AttentionNeeded',
      label: 'Slightly Over Budget',
      tone: 'act',
      explanation: `Your plan is running a small deficit. A minor adjustment — trimming one variable expense or adding a commission month — should bring it back to balance.`,
    }
  }

  // ── Recovery: budget is technically positive but under significant pressure ─
  if (cushionPct < 3 && cushionPct >= 0) {
    return {
      key: 'RecoveryMonth',
      label: 'Very Tight Cushion',
      tone: 'recover',
      explanation: `Almost all of your income is allocated. Even a modest unexpected expense could push this month over budget. Review your largest flexible line items first.`,
      insight: hasBehindGoals
        ? `Savings goal${behindTargets.length > 1 ? 's' : ''} behind pace: ${behindGoalNames}.`
        : undefined,
    }
  }

  // ── Tight but not broken ──────────────────────────────────────────────────
  if (cushionPct < 12) {
    if (hasBehindGoals) {
      return {
        key: 'GoalPressureAhead',
        label: 'Goal Pressure Ahead',
        tone: 'act',
        explanation: `Your budget is tight and some savings goals are falling behind pace. You may need to increase contributions or extend a deadline to stay on track.`,
        insight: `Behind: ${behindGoalNames}.`,
      }
    }
    return {
      key: 'TightButStable',
      label: 'Tight but Stable',
      tone: 'watch',
      explanation: `Your cushion is slim this period. The plan is holding, but there's limited room for unexpected costs. Look for one area to create a little more breathing room.`,
      insight: fixedRatio > 55
        ? `Fixed bills are at ${fixedRatio.toFixed(0)}% of income — consider reviewing recurring commitments over time.`
        : undefined,
    }
  }

  // ── Cushion shrinking signal: income heavily commission-dependent ──────────
  // If cushion is reasonable but commission dependency is very high, flag the fragility
  if (commissionPct >= 65 && cushionPct < 25) {
    return {
      key: 'CushionShrinking',
      label: 'Income Fragility Risk',
      tone: 'watch',
      explanation: `Your current cushion depends heavily on commission income (${commissionPct.toFixed(0)}% of take-home). A slower month could compress this quickly. Building a buffer in savings will help stabilize the plan.`,
    }
  }

  // ── Healthy range: 12–30% cushion ────────────────────────────────────────
  if (cushionPct < 30) {
    if (savingsRate < 10) {
      return {
        key: 'TightButStable',
        label: 'Stable with Low Savings',
        tone: 'watch',
        explanation: `Your expenses are covered and you have a workable cushion, but your savings allocation is low. Even a small increase now builds meaningful momentum over time.`,
      }
    }
    if (hasBehindGoals) {
      return {
        key: 'GoalPressureAhead',
        label: 'Goals Need Attention',
        tone: 'watch',
        explanation: `Your overall budget looks stable, but some savings goals are behind their expected pace. A focused contribution boost could get them back on track.`,
        insight: `Behind: ${behindGoalNames}.`,
      }
    }
    return {
      key: 'FinanciallyStable',
      label: 'Financially Stable',
      tone: 'stable',
      explanation: `Your income covers all planned expenses with a healthy cushion. Savings goals are progressing on schedule.`,
    }
  }

  // ── Strong range: 30–50% cushion ─────────────────────────────────────────
  if (cushionPct < 50) {
    if (savingsRate >= 25) {
      return {
        key: 'StrongMonth',
        label: 'Strong Month',
        tone: 'strong',
        explanation: `Good income coverage, solid cushion, and a meaningful savings rate. Your plan is running well — this is a good time to review whether any goals can be accelerated.`,
        insight: hasBehindGoals
          ? `One area to watch: ${behindGoalNames} ${behindTargets.length > 1 ? 'are' : 'is'} behind pace.`
          : undefined,
      }
    }
    return {
      key: 'FinanciallyStable',
      label: 'Financially Stable',
      tone: 'stable',
      explanation: `Your income is covering all expenses comfortably. Increasing your savings allocation slightly would further strengthen the plan.`,
    }
  }

  // ── Very strong: 50%+ cushion ─────────────────────────────────────────────
  if (savingsRate >= 20) {
    return {
      key: 'VeryStrongMonth',
      label: 'Very Strong Month',
      tone: 'strong',
      explanation: `Excellent income coverage with a large cushion and healthy savings. This is an ideal month to front-load goal contributions or build your financial buffer further.`,
    }
  }
  return {
    key: 'StrongMonth',
    label: 'Strong Month',
    tone: 'strong',
    explanation: `Your income significantly exceeds planned expenses this period. Consider directing more of the surplus toward savings goals or an emergency buffer.`,
  }
}
