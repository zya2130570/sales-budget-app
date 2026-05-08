import type { Period, Target, Category, ScenarioName } from '../types'

// --- Income / salary constants -----------------------------------------------

export const BASE_SALARY = 40000
export const TAKE_HOME_RATE = 0.8243
export const HOURS_PER_WEEK = 45

// --- Commission brackets ------------------------------------------------------

export const commissionBrackets = [
  { upTo: 5000,     rate: 0.04 },
  { upTo: 10000,    rate: 0.06 },
  { upTo: 20000,    rate: 0.08 },
  { upTo: 40000,    rate: 0.10 },
  { upTo: 60000,    rate: 0.11 },
  { upTo: 100000,   rate: 0.12 },
  { upTo: Infinity, rate: 0.14 },
]

// --- Base-bump thresholds -----------------------------------------------------

export const BUMP_THRESHOLDS = [20000, 40000, 60000, 80000, 150000, 300000, 500000]

// --- Scenario defaults --------------------------------------------------------

export const scenarioDefaults: Record<ScenarioName, number> = {
  Slow: 8000,
  Medium: 15000,
  Fast: 30000,
  Custom: 10000,
}

// --- Period conversion helpers ------------------------------------------------

export const convertFromMonthly = (m: number, p: Period): number =>
  p === 'weekly' ? m / 4 : p === 'bi-weekly' ? m / 2 : p === 'yearly' ? m * 12 : m

export const convertToMonthly = (v: number, p: Period): number =>
  p === 'weekly' ? v * 4 : p === 'bi-weekly' ? v * 2 : p === 'yearly' ? v / 12 : v

// --- Remaining-budget tier ----------------------------------------------------

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

// --- Commission calculation ---------------------------------------------------

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

// --- Income breakdown ---------------------------------------------------------

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

// --- Target status ------------------------------------------------------------

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

// --- Required contributions for a target --------------------------------------

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

// --- V7.3 Dashboard Status Engine ---------------------------------------------
//
// Interprets current financial state across five dimensions:
//   resilience      - how much buffer exists if income dips
//   flexibility     - how much room is left after fixed commitments
//   sustainability  - whether the savings/spending ratio is healthy long-term
//   spending pressure - whether variable/flexible spending is crowding out savings
//   goal sustainability - whether active savings goals are on a realistic pace
//
// Each status returns:
//   label       - short descriptive phrase (not a score, not a grade)
//   tone        - colour tier for the banner
//   explanation - one sentence explaining what the numbers show right now
//   context     - one sentence pointing at the most useful next action

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
  // The Budget tab health tier from remainingTierFromPeriodValue.
  // Used as a floor so Dashboard tone can never look healthier than Budget status.
  budgetHealthTier: 'Healthy' | 'Moderate' | 'Risk' | 'Over Budget' | 'No Data'
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
    budgetHealthTier,
  } = input

  const hasBudget = monthlyBudget > 0

  // Derived ratios - all as % of totalMonthly so they are comparable across income levels
  const cushionPct      = totalMonthly > 0 ? (monthlyLeft / totalMonthly) * 100 : 0
  const variableMonthly = categories.filter(c => c.type === 'variable spending').reduce((s, c) => s + c.amount, 0)
  const variableRatio   = totalMonthly > 0 ? (variableMonthly / totalMonthly) * 100 : 0
  const spendingPressure = fixedRatio + variableRatio
  const pl = pLabel(period)

  // Useful category references
  const topVariable = [...categories]
    .filter(c => c.type === 'variable spending')
    .sort((a, b) => b.amount - a.amount)[0]
  const topFixed = [...categories]
    .filter(c => c.type === 'fixed bill')
    .sort((a, b) => b.amount - a.amount)[0]

  // Goal health
  const behindCount  = activeTargets.filter(t => computeTargetStatus(t) === 'Behind').length
  const aheadCount   = activeTargets.filter(t => computeTargetStatus(t) === 'Ahead').length
  const onTrackCount = activeTargets.filter(t => computeTargetStatus(t) === 'On Track').length
  const totalGoals   = activeTargets.length

  // Tier classification
  // Resilience: strong >= 30% | moderate 15-30% | thin 5-15% | none <5%
  const resilienceTier: 'strong' | 'moderate' | 'thin' | 'none' =
    cushionPct >= 30 ? 'strong'   :
    cushionPct >= 15 ? 'moderate' :
    cushionPct >= 5  ? 'thin'     : 'none'

  // Sustainability: healthy >= 20% | developing 10-20% | low <10%
  const sustainTier: 'healthy' | 'developing' | 'low' =
    savingsRate >= 20 ? 'healthy'    :
    savingsRate >= 10 ? 'developing' : 'low'

  // Flexibility: open <55% | moderate 55-75% | tight 75-90% | pressured >90%
  const flexTier: 'open' | 'moderate' | 'tight' | 'pressured' =
    spendingPressure < 55 ? 'open'      :
    spendingPressure < 75 ? 'moderate'  :
    spendingPressure < 90 ? 'tight'     : 'pressured'

  // Commission exposure: low <= 35% | elevated 35-55% | high >55%
  const commTier: 'low' | 'elevated' | 'high' =
    commissionPct <= 35 ? 'low'      :
    commissionPct <= 55 ? 'elevated' : 'high'

  // No budget data
  if (!hasBudget) {
    return applyBudgetHealthCeiling({
      label: 'Getting Started',
      tone: 'warn',
      explanation: 'There is no budget data yet, so it is hard to read your financial picture right now.',
      context: 'Add your regular fixed bills first - that is the foundation everything else builds on.',
    }, budgetHealthTier)
  }

  // Over budget
  if (monthlyLeft < 0) {
    const overBy = Math.abs(monthlyLeft)
    const isFixedHeavy = fixedRatio > 60
    const lever = topVariable
      ? `Flexible spending is the fastest thing to adjust - ${topVariable.name} is the largest variable item right now.`
      : isFixedHeavy
        ? `Fixed bills are carrying ${fixedRatio.toFixed(0)}% of income${topFixed ? `, with ${topFixed.name} at the top` : ''}. That leaves very little room to work with.`
        : 'Review the Budget tab and look for anything that can come down, starting with the largest line items.'
    return applyBudgetHealthCeiling({
      label: 'Attention Needed',
      tone: 'danger',
      explanation: `Planned expenses are running ${formatMoney(overBy)}/month over income - the current setup is not sustainable.`,
      context: lever,
    }, budgetHealthTier)
  }

  // Very Strong Month - resilience strong, savings healthy, pressure open/moderate, commission low, no goals behind
  if (
    resilienceTier === 'strong' &&
    sustainTier === 'healthy' &&
    flexTier !== 'tight' &&
    flexTier !== 'pressured' &&
    commTier === 'low' &&
    behindCount === 0
  ) {
    const goalNote = totalGoals > 0
      ? `${totalGoals > 1 ? 'All ' + totalGoals + ' goals are' : 'Your goal is'} staying on pace - good position to push savings further.`
      : 'There is still room to put the cushion to work through savings goals.'
    return applyBudgetHealthCeiling({
      label: 'Very Strong Month',
      tone: 'excellent',
      explanation: `Core bills are controlled, savings are healthy at ${savingsRate.toFixed(0)}%, and there is a solid ${cushionPct.toFixed(0)}% cushion after everything.`,
      context: goalNote,
    }, budgetHealthTier)
  }

  // Strong Month - strong resilience with at least developing savings, one imperfection allowed
  if (resilienceTier === 'strong' && sustainTier !== 'low') {
    const imperfection =
      behindCount > 0
        ? `${behindCount} goal${behindCount > 1 ? 's are' : ' is'} a little behind - worth logging a contribution soon.`
        : commTier === 'elevated'
          ? `Commission is ${commissionPct.toFixed(0)}% of income, so it is worth checking the Scenarios tab for a slower month.`
          : flexTier === 'tight'
            ? `Spending pressure is a bit high - there is not a lot of flexibility if something unexpected comes up.`
            : 'The current setup has good room to continue building.'
    return applyBudgetHealthCeiling({
      label: 'Strong Month',
      tone: 'good',
      explanation: `There is a ${cushionPct.toFixed(0)}% cushion remaining and a ${savingsRate.toFixed(0)}% savings rate - the budget is in good shape.`,
      context: imperfection,
    }, budgetHealthTier)
  }

  // Flexible Spending Elevated - good cushion but savings rate is low
  if (resilienceTier === 'strong' && sustainTier === 'low') {
    const fix = topVariable
      ? `Moving part of what is going to ${topVariable.name} into savings would make a noticeable difference.`
      : 'The cushion looks fine right now, but most of it is not being directed toward goals.'
    return applyBudgetHealthCeiling({
      label: 'Flexible Spending Elevated',
      tone: 'warn',
      explanation: `The cushion is ${cushionPct.toFixed(0)}% - comfortable - but the savings rate is only ${savingsRate.toFixed(0)}%, which means flexible spending is using up most of the breathing room.`,
      context: fix,
    }, budgetHealthTier)
  }

  // Tight but Stable - moderate resilience, savings developing or healthy, pressure manageable
  if (resilienceTier === 'moderate' && sustainTier !== 'low' && flexTier !== 'pressured') {
    const fix = topVariable
      ? `Trimming ${topVariable.name} a bit would add the most breathing room without changing the savings plan.`
      : behindCount > 0
        ? `${behindCount} goal${behindCount > 1 ? 's are' : ' is'} behind - with a thin cushion it is worth checking if the contribution pace is realistic.`
        : `Fixed bills are ${fixedRatio.toFixed(0)}% of income - not a problem now, but worth keeping an eye on.`
    return applyBudgetHealthCeiling({
      label: 'Tight but Stable',
      tone: 'warn',
      explanation: `The budget is holding, but the cushion is at ${cushionPct.toFixed(0)}% - there is not a lot of room if something comes up ${pl}.`,
      context: fix,
    }, budgetHealthTier)
  }

  // Cushion Shrinking - moderate resilience but savings rate is low
  if (resilienceTier === 'moderate' && sustainTier === 'low') {
    const fix = topVariable
      ? `${topVariable.name} is the largest flexible item right now - pulling it back would help both the cushion and the savings rate.`
      : spendingPressure > 80
        ? `Spending is eating ${spendingPressure.toFixed(0)}% of income. Something needs to come down before this becomes a problem.`
        : 'The savings rate is too low for the current cushion level - redirecting some variable spending toward savings would help.'
    return applyBudgetHealthCeiling({
      label: 'Cushion Shrinking',
      tone: 'warn',
      explanation: `Only ${cushionPct.toFixed(0)}% cushion left and the savings rate is just ${savingsRate.toFixed(0)}% - flexible spending is taking up most of what is available.`,
      context: fix,
    }, budgetHealthTier)
  }

  // Rebalancing Recommended - high commission dependency but cushion not yet at risk
  if (commTier === 'high' && resilienceTier !== 'thin' && resilienceTier !== 'none') {
    return applyBudgetHealthCeiling({
      label: 'Rebalancing Recommended',
      tone: 'risk',
      explanation: `Commission is ${commissionPct.toFixed(0)}% of monthly income right now - the current budget is built on a strong month, which does not always hold.`,
      context: 'Run the Scenarios tab for a Slow month and see if the budget still works. If not, there is a gap to plan for.',
    }, budgetHealthTier)
  }

  // Goal Pressure Ahead - cushion is ok but goals are falling behind
  if (behindCount > 0 && resilienceTier !== 'thin' && resilienceTier !== 'none') {
    const paceNote = aheadCount > 0
      ? `${aheadCount} goal${aheadCount > 1 ? 's are' : ' is'} ahead of pace, which helps - but the behind one${behindCount > 1 ? 's need' : ' needs'} attention soon.`
      : 'There is still budget room to catch up - it just needs a contribution logged.'
    return applyBudgetHealthCeiling({
      label: 'Goal Pressure Ahead',
      tone: 'warn',
      explanation: `${behindCount} savings goal${behindCount > 1 ? 's are' : ' is'} falling behind the expected pace, even though the budget itself still has some room.`,
      context: paceNote,
    }, budgetHealthTier)
  }

  // Spending Pressure High - pressured flex tier
  if (flexTier === 'pressured') {
    const fix = topVariable
      ? `${topVariable.name} is the largest flexible item - reducing it would open up the most room without touching fixed bills.`
      : `Fixed bills are ${fixedRatio.toFixed(0)}% of income. If any can be renegotiated, that is where the real flexibility lives.`
    return applyBudgetHealthCeiling({
      label: 'Spending Pressure High',
      tone: 'risk',
      explanation: `Spending commitments are using ${spendingPressure.toFixed(0)}% of income - there is not much flexibility left in the current setup.`,
      context: fix,
    }, budgetHealthTier)
  }

  // Slow Income Cycle - thin cushion
  if (resilienceTier === 'thin') {
    const commNote = commTier !== 'low'
      ? ` Commission is ${commissionPct.toFixed(0)}% of income - if this is a slower sales period, that explains the squeeze.`
      : ''
    const fix = behindCount > 0
      ? `${behindCount} goal${behindCount > 1 ? 's are' : ' is'} also behind - focus on the cushion first before pushing savings contributions.`
      : topVariable
        ? `Pulling back on ${topVariable.name} would rebuild the cushion without requiring bigger changes.`
        : 'Review the Budget tab and see if any variable line items can come down temporarily.'
    return applyBudgetHealthCeiling({
      label: 'Slow Income Cycle',
      tone: 'risk',
      explanation: `Only ${cushionPct.toFixed(0)}% of income is left after planned expenses.${commNote}`,
      context: fix,
    }, budgetHealthTier)
  }

  // Financially Stable (safe catch-all)
  // Budget is positive, no extreme signals in any dimension.
  const stableNote = behindCount > 0
    ? `${behindCount} savings goal${behindCount > 1 ? 's are' : ' is'} a bit behind - worth logging a contribution to keep the pace up.`
    : onTrackCount > 0 || aheadCount > 0
      ? 'Savings goals are on pace. The current setup is sustainable at this income level.'
      : 'The budget looks balanced. Adding a savings goal would help put the cushion to work.'
  return applyBudgetHealthCeiling({
    label: 'Financially Stable',
    tone: 'good',
    explanation: `Income covers all planned expenses with ${cushionPct.toFixed(0)}% remaining - the core bills are pretty controlled right now.`,
    context: stableNote,
  }, budgetHealthTier)
}

// --- Internal helpers (not exported) -----------------------------------------

function formatMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function pLabel(p: Period): string {
  return p === 'weekly' ? 'this week' : p === 'bi-weekly' ? 'this pay period' : p === 'monthly' ? 'this month' : 'this year'
}

// Tone severity order - lower index = healthier.
// A Dashboard result may not use a tone that is healthier than what the Budget
// tab's remainingTierFromPeriodValue reports. For example: if the budget tier
// is "Risk", the Dashboard must show at least a risk-level tone.
const TONE_SEVERITY: DashboardStatusTone[] = ['excellent', 'good', 'warn', 'risk', 'danger']

function budgetHealthFloor(tier: DashboardStatusInput['budgetHealthTier']): DashboardStatusTone {
  switch (tier) {
    case 'Healthy':     return 'good'
    case 'Moderate':    return 'warn'
    case 'Risk':        return 'risk'
    case 'Over Budget': return 'danger'
    case 'No Data':     return 'warn'
  }
}

function applyBudgetHealthCeiling(
  result: DashboardStatus,
  budgetHealthTier: DashboardStatusInput['budgetHealthTier'],
): DashboardStatus {
  const floor = budgetHealthFloor(budgetHealthTier)
  const floorIdx   = TONE_SEVERITY.indexOf(floor)
  const currentIdx = TONE_SEVERITY.indexOf(result.tone)
  // If the result tone is already as severe or more severe, nothing to do.
  if (currentIdx >= floorIdx) return result

  // The result is healthier than the budget tier allows. Override tone and label.
  const overrideTone = floor
  let overrideLabel: string
  if (overrideTone === 'warn') {
    overrideLabel = 'Tight but Stable'
  } else {
    // risk or danger
    overrideLabel = 'Attention Needed'
  }

  return {
    ...result,
    tone: overrideTone,
    label: overrideLabel,
  }
}
