import { useMemo } from 'react'
import type { DashboardMetricsInput } from '../utils/dashboardMetrics'
import { computeDashboardMetrics } from '../utils/dashboardMetrics'

/**
 * Memoized dashboard derived metrics.
 * Cross-domain data is passed in from App.tsx so this hook stays dependency-light.
 */
export function useDashboardMetrics(input: DashboardMetricsInput) {
  return useMemo(() => computeDashboardMetrics(input), [
    input.totalMonthly,
    input.monthlyBudget,
    input.monthlyLeft,
    input.savingsRate,
    input.fixedRatio,
    input.commissionPct,
    input.categories,
    input.activeTargets,
    input.period,
    input.hasBudgetData,
    input.selectedPeriodRemaining,
    input.remainingTierLabel,
    input.actualOverspendPct,
  ])
}
