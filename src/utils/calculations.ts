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

// ─── V7.2 Dashboard Status Engine ────────────────────────────────────────────
//
// Produces financially-interpreted status labels with plain-English explanations
// and targeted next-step guidance. Priority order:
//   1. over-budget (immediate)
//   2. cushion tier
//   3. savings rate
//   4. commission dependency
//   5. goal pressure
//
// Returns label, tone, explanation (why), context (what to do next).

export type DashboardStatusTone = 'excellent' | 'good' | 'warn' | 'risk' | 'danger'

export interface DashboardStatus {
  label: string
  tone: DashboardStatusTone
  explanation: string
  context: string
}

export interface DashboardStatusInput {
  totalMonthly: number
  monthlyBudget: number
  monthlyLeft: number
  savingsRate: number
  fixedRatio: number
  commissionPct: number
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
  const pl = periodLabel(period)

  // ── No budget data ──────────────────────────────────────────────────────────
  if (!hasBudget) {
    return {
      label: 'Getting Started',
      tone: 'warn',
      explanation: 'Your budget is empty — add your regular expenses to see how your income is allocated.',
      context: 'Start with your largest fixed bills, then add variable spending and savings goals.',
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
      ? `Review flexible spending — ${topVariable.name} is your largest variable expense.`
      : topBill
        ? `Your biggest bill is ${topBill.name} — check if it can be reduced or renegotiated.`
        : 'Review your largest expenses in the Budget tab and trim where you can.'
    return {
      label: 'Attention Needed',
      tone: 'danger',
      explanation: `Planned expenses exceed income by ${formatMoney(overBy)} per month — this needs immediate adjustment.`,
      context: lever,
    }
  }

  // ── Tier classification ─────────────────────────────────────────────────────
  // Cushion: % of income remaining after all planned expenses
  const cushionTier: 'danger' | 'risk' | 'warn' | 'ok' =
    cushionPct < 5  ? 'danger' :
    cushionPct < 15 ? 'risk'   :
    cushionPct < 30 ? 'warn'   : 'ok'

  // Savings rate: (savings + investing) / totalMonthly
  const savingsTier: 'strong' | 'moderate' | 'low' =
    savingsRate >= 20 ? 'strong'   :
    savingsRate >= 10 ? 'moderate' : 'low'

  // Commission dependency
  const commTier: 'safe' | 'elevated' | 'high' =
    commissionPct <= 35 ? 'safe'     :
    commissionPct <= 55 ? 'elevated' : 'high'

  // Goals behind
  const behindCount = activeTargets.filter(t => computeTargetStatus(t) === 'Behind').length
  const behindNote = behindCount > 0
    ? `${behindCount} savings goal${behindCount > 1 ? 's are' : ' is'} falling behind — check Savings Goals to catch up.`
    : ''

  const topVariable = [...categories]
    .filter(c => c.type === 'variable spending')
    .sort((a, b) => b.amount - a.amount)[0]

  // ── Very Strong Month: large cushion + strong savings + safe commission + no behind goals ──
  if (
    cushionTier === 'ok' &&
    savingsTier === 'strong' &&
    commTier === 'safe' &&
    behindCount === 0
  ) {
    return {
      label: 'Very Strong Month',
      tone: 'excellent',
      explanation: `You have a ${cushionPct.toFixed(0)}% income cushion, a ${savingsRate.toFixed(0)}% savings rate, and every goal on track.`,
      context: commissionPct > 20
        ? `Commission is ${commissionPct.toFixed(0)}% of income — consider moving part of the cushion into investing.`
        : 'Your allocation is working well. Consider increasing your investing or emergency fund contributions.',
    }
  }

  // ── Strong Month: large cushion + at least moderate savings ──────────────────
  if (cushionTier === 'ok' && savingsTier !== 'low') {
    const goalContext = behindCount > 0
      ? behindNote
      : 'Consider moving part of your remaining cushion into a savings goal.' 
    return {
      label: 'Strong Month',
      tone: 'good',
      explanation: `You have a healthy ${cushionPct.toFixed(0)}% cushion and a ${savingsRate.toFixed(0)}% savings rate after all planned expenses.`,
      context: goalContext,
    }
  }

  // ── Flexible Spending Elevated: large cushion but savings rate low ────────────
  if (cushionTier === 'ok' && savingsTier === 'low') {
    return {
      label: 'Flexible Spending Elevated',
      tone: 'warn',
      explanation: `Your cushion is ${cushionPct.toFixed(0)}% but your savings rate is only ${savingsRate.toFixed(0)}% — your income isn't working as hard as it could.`,
      context: topVariable
        ? `Redirecting part of ${topVariable.name} into savings or investing would improve your long-term position.`
        : 'Review Income scenarios to see how a savings increase affects your remaining cushion.',
    }
  }

  // ── Tight but Stable: moderate cushion with decent savings ───────────────────
  if (cushionTier === 'warn' && savingsTier !== 'low') {
    return {
      label: 'Tight but Stable',
      tone: 'warn',
      explanation: `Your cushion is ${cushionPct.toFixed(0)}% ${pl} — manageable, but there isn't much buffer for surprises.`,
      context: topVariable
        ? `Trimming ${topVariable.name} would give you the most breathing room without touching savings.`
        : behindNote || `Fixed bills are ${fixedRatio.toFixed(0)}% of income — review Budget for any that can be reduced.`,
    }
  }

  // ── Cushion Shrinking: moderate cushion + low savings ────────────────────────
  if (cushionTier === 'warn' && savingsTier === 'low') {
    return {
      label: 'Cushion Shrinking',
      tone: 'warn',
      explanation: `Your cushion is ${cushionPct.toFixed(0)}% and savings rate is only ${savingsRate.toFixed(0)}% — both are trending toward risk territory.`,
      context: topVariable
        ? `Start with ${topVariable.name} — reducing it frees up room for both cushion and savings.`
        : 'Review your variable spending in Budget, then check if Savings Goals need adjustment.',
    }
  }

  // ── Rebalancing Recommended: commission dependency high ─────────────────────
  if (commTier === 'high' && cushionTier !== 'danger') {
    return {
      label: 'Rebalancing Recommended',
      tone: 'risk',
      explanation: `Commission is ${commissionPct.toFixed(0)}% of your income — a slow sales cycle could squeeze your budget significantly.`,
      context: 'Review Income scenarios for a Slow month to make sure your budget still holds.',
    }
  }

  // ── Goal Pressure Ahead: decent cushion but goals are behind ─────────────────
  if (behindCount > 0 && cushionTier !== 'risk' && cushionTier !== 'danger') {
    return {
      label: 'Goal Pressure Ahead',
      tone: 'warn',
      explanation: `${behindCount} savings goal${behindCount > 1 ? 's are' : ' is'} falling behind pace — your budget plan has room to catch up.`,
      context: 'Check Savings Goals to see how much you need to log this period to get back on track.',
    }
  }

  // ── Income Momentum Building: commission is elevated, not yet safe ────────────
  if (commTier === 'elevated' && cushionTier === 'warn') {
    return {
      label: 'Income Momentum Building',
      tone: 'warn',
      explanation: `Commission is ${commissionPct.toFixed(0)}% of income and your cushion is ${cushionPct.toFixed(0)}% — you're growing, but the budget is still a little thin.`,
      context: 'Review Income scenarios to stress-test a slow month against your current budget.',
    }
  }

  // ── Slow Income Cycle: risk tier cushion ─────────────────────────────────────
  if (cushionTier === 'risk') {
    const commNote = commTier !== 'safe'
      ? ` Commission is ${commissionPct.toFixed(0)}% of income, which adds variability this ${pl}.`
      : ''
    return {
      label: 'Slow Income Cycle',
      tone: 'risk',
      explanation: `Only ${cushionPct.toFixed(0)}% of income remains after planned expenses.${commNote}`,
      context: behindNote || 'Consider reducing a variable expense or pausing a savings category temporarily to rebuild buffer.',
    }
  }

  // ── Financially Stable (safe fallback above danger) ──────────────────────────
  if (cushionTier !== 'danger') {
    return {
      label: 'Financially Stable',
      tone: 'good',
      explanation: `Your income covers all planned expenses with a ${cushionPct.toFixed(0)}% cushion remaining.`,
      context: behindNote || 'Your budget is balanced. Review Savings Goals to make sure your pace is on track.',
    }
  }

  // ── Attention Needed: danger-tier cushion ────────────────────────────────────
  return {
    label: 'Attention Needed',
    tone: 'danger',
    explanation: `Only ${cushionPct.toFixed(0)}% of income remains after expenses — one unexpected cost could push you over budget.`,
    context: fixedRatio > 60
      ? `Fixed bills consume ${fixedRatio.toFixed(0)}% of income. Review Budget to see if any can be reduced or deferred.`
      : 'Cutting variable spending is the fastest lever. Review Budget and check Income scenarios.',
  }
}

// ─── Internal helpers (not exported) ─────────────────────────────────────────

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function periodLabel(p: Period): string {
  return p === 'weekly' ? 'this week' : p === 'bi-weekly' ? 'this pay period' : p === 'monthly' ? 'this month' : 'this year'
}
