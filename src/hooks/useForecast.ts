import { useMemo, useState } from 'react'
import type { ManualRecurringItem } from '../utils/forecastMath'
import type { RecurringCandidate } from '../utils/recurring'
import {
  calculateCashFlowForecast,
  calculateEstimatedMonthlyRecurring,
} from '../utils/forecastEngine'
import type { ForecastPeriod } from '../utils/forecastEngine'

export function useForecast(args: {
  totalCash: number
  manualRecurringItems: ManualRecurringItem[]
  recurringCandidates: RecurringCandidate[]
  confirmedRecurring: Set<string>
  estimatedMonthlyIncome: number
}) {
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriod>(30)

  const estimatedMonthlyRecurring = useMemo(
    () => calculateEstimatedMonthlyRecurring(
      args.manualRecurringItems,
      args.recurringCandidates,
      args.confirmedRecurring,
    ),
    [args.manualRecurringItems, args.recurringCandidates, args.confirmedRecurring],
  )

  const cashFlowForecast = useMemo(
    () => calculateCashFlowForecast({
      forecastPeriod,
      startingCash: args.totalCash,
      manualRecurringItems: args.manualRecurringItems,
      recurringCandidates: args.recurringCandidates,
      confirmedRecurring: args.confirmedRecurring,
      estimatedMonthlyIncome: args.estimatedMonthlyIncome,
    }),
    [
      forecastPeriod,
      args.totalCash,
      args.manualRecurringItems,
      args.recurringCandidates,
      args.confirmedRecurring,
      args.estimatedMonthlyIncome,
    ],
  )

  return {
    forecastPeriod,
    setForecastPeriod,
    estimatedMonthlyRecurring,
    cashFlowForecast,
  }
}
