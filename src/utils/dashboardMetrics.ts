import type { Period, Category, Target } from '../types'
import { convertFromMonthly, computeDashboardStatus } from './calculations'
import type { DashboardStatus } from './calculations'

/** V23: Inline money formatter — never depends on Intl.NumberFormat locale behavior */
function fmt(n: number): string {
  if (!isFinite(n)) return '$0.00'
  const abs = Math.abs(n)
  const parts = abs.toFixed(2).split('.')
  const int = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-$' : '$') + int + '.' + parts[1]
}

export type DashboardMetricsInput = {
  totalMonthly: number
  monthlyBudget: number
  monthlyLeft: number
  savingsRate: number
  fixedRatio: number
  commissionPct: number
  categories: Category[]
  activeTargets: Target[]
  period: Period
  hasBudgetData: boolean
  selectedPeriodRemaining: number
  remainingTierLabel: string
  actualOverspendPct: number
}

/**
 * Pure dashboard status calculation.
 * Keeps dashboard wording and tone behavior centralized without changing UI output.
 */
export function computeDashboardMetrics(input: DashboardMetricsInput): DashboardStatus {
  const budgetHealthTier: 'Healthy' | 'Moderate' | 'Risk' | 'Over Budget' | 'No Data' = !input.hasBudgetData
    ? 'No Data'
    : input.selectedPeriodRemaining < 0
    ? 'Over Budget'
    : input.remainingTierLabel as 'Healthy' | 'Moderate' | 'Risk' | 'Over Budget' | 'No Data'

  const base = computeDashboardStatus({
    totalMonthly: input.totalMonthly,
    monthlyBudget: input.monthlyBudget,
    monthlyLeft: input.monthlyLeft,
    savingsRate: input.savingsRate,
    fixedRatio: input.fixedRatio,
    commissionPct: input.commissionPct,
    categories: input.categories,
    activeTargets: input.activeTargets,
    period: input.period,
    budgetHealthTier,
  })

  const periodWord =
    input.period === 'weekly'
      ? 'week'
      : input.period === 'bi-weekly'
      ? 'pay period'
      : input.period === 'yearly'
      ? 'year'
      : 'month'

  const periodExplanation =
    input.monthlyLeft < 0 && base.explanation.includes('/month')
      ? base.explanation.replace(
          /\$[\d,]+(\.\d+)?\/month/,
          `${fmt(Math.abs(convertFromMonthly(input.monthlyLeft, input.period)))}/${periodWord}`,
        )
      : base.explanation

  if (input.actualOverspendPct > 5 && base.tone !== 'danger') {
    const severity: DashboardStatus['tone'] = input.actualOverspendPct > 20 ? 'risk' : 'warn'
    const toneOrder: DashboardStatus['tone'][] = ['excellent', 'good', 'warn', 'risk', 'danger']
    const baseIdx = toneOrder.indexOf(base.tone)
    const sevIdx = toneOrder.indexOf(severity)

    return {
      ...base,
      explanation: periodExplanation,
      tone: sevIdx > baseIdx ? severity : base.tone,
      context: `Actuals are running ${input.actualOverspendPct.toFixed(0)}% over plan this period. ${base.context}`,
    }
  }

  return { ...base, explanation: periodExplanation }
}
