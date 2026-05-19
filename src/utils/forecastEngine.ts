import { cadenceMult, projectManualItems, projectRecurringCandidates } from './forecastMath'
import type { ForecastLineItem, ManualRecurringItem } from './forecastMath'
import type { RecurringCandidate } from './recurring'

export type ForecastPeriod = 7 | 14 | 30 | 60

export type CashFlowForecast = {
  items: ForecastLineItem[]
  startingCash: number
  totalIncome: number
  totalExpenses: number
  projectedEnd: number
  safeToSpend: number
  status: 'comfortable' | 'tight' | 'risk'
  todayStr: string
  endStr: string
}

export function calculateEstimatedMonthlyRecurring(
  manualRecurringItems: ManualRecurringItem[],
  recurringCandidates: RecurringCandidate[],
  confirmedRecurring: Set<string>,
): number {
  const manualMonthlyExpenses = manualRecurringItems
    .filter(i => i.type === 'expense')
    .reduce((sum, item) => sum + item.amount * cadenceMult(item.cadence), 0)

  const detectedMonthlyExpenses = recurringCandidates
    .filter(candidate => candidate.confidence === 'high' || confirmedRecurring.has(candidate.merchantKey))
    .reduce((sum, candidate) => sum + candidate.estimatedMonthlyAmount, 0)

  return detectedMonthlyExpenses + manualMonthlyExpenses
}

export function calculateCashFlowForecast(args: {
  forecastPeriod: ForecastPeriod
  startingCash: number
  manualRecurringItems: ManualRecurringItem[]
  recurringCandidates: RecurringCandidate[]
  confirmedRecurring: Set<string>
  estimatedMonthlyIncome: number
}): CashFlowForecast {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  const end = new Date(today.getTime() + args.forecastPeriod * 86_400_000)
  const endStr = end.toISOString().slice(0, 10)

  const confirmedCandidates = args.recurringCandidates.filter(
    candidate => candidate.confidence === 'high' || args.confirmedRecurring.has(candidate.merchantKey),
  )

  const items: ForecastLineItem[] = [
    ...projectManualItems(args.manualRecurringItems, todayStr, end),
    ...projectRecurringCandidates(confirmedCandidates, todayStr, end),
  ].sort((a, b) => a.date.localeCompare(b.date))

  const hasManualIncome = args.manualRecurringItems.some(item => item.type === 'income')
  const hasDetectedIncome = confirmedCandidates.length > 0
  if (!hasManualIncome && !hasDetectedIncome && args.estimatedMonthlyIncome > 0) {
    const estimatedIncome = args.estimatedMonthlyIncome * (args.forecastPeriod / 30)
    const daysLabel = args.forecastPeriod === 7
      ? '~1 week'
      : args.forecastPeriod === 14
        ? '~2 weeks'
        : args.forecastPeriod === 30
          ? '~1 month'
          : '~2 months'
    items.unshift({
      date: todayStr,
      name: `Est. take-home (${daysLabel})`,
      amount: Math.round(estimatedIncome * 100) / 100,
      type: 'income',
      source: 'manual',
    })
  }

  const totalIncome = items.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0)
  const totalExpenses = items.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0)
  const projectedEnd = args.startingCash + totalIncome - totalExpenses
  const safeToSpend = Math.max(0, projectedEnd - 250)
  const status: CashFlowForecast['status'] = projectedEnd < 0 ? 'risk' : projectedEnd < 250 ? 'tight' : 'comfortable'

  return {
    items,
    startingCash: args.startingCash,
    totalIncome,
    totalExpenses,
    projectedEnd,
    safeToSpend,
    status,
    todayStr,
    endStr,
  }
}
