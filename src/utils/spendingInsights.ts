/**
 * spendingInsights.ts — V13
 *
 * Generates actionable spending insights from real app data.
 * Pure functions — no side effects, no UI concerns.
 *
 * Insights are:
 * - Specific: always include real numbers
 * - Prioritized: high → medium → positive
 * - Non-repetitive: each id is unique, deduped by caller
 */
import type { Category, Target, Transaction } from '../types'
import type { CashFlowForecast } from './forecastEngine'
import { currency } from './formatting'

export type InsightPriority = 'high' | 'medium' | 'positive'

export type SpendingInsight = {
  id: string
  priority: InsightPriority
  icon: string
  title: string
  body: string
  actionLabel?: string
  actionTab?: string
}

export type InsightInput = {
  categories: Category[]
  transactions: Transaction[]
  targets: Target[]
  // from budgetHealth
  overBudget: Category[]
  totalPlanned: number
  totalActual: number
  // from cashFlowForecast
  forecast: CashFlowForecast
  // from monthlyReview (for the selected review month)
  reviewMonth: string
  uncatExpenses: number
  catBreakdown: Array<{ catId: string; name: string; planned: number; actual: number; diff: number }>
  bigTxns: Transaction[]
  monthlyIncome: number
  monthlyExpenses: number
  monthlyNetCash: number
}

function monthsBetween(dateStr: string): number {
  const then = new Date(dateStr)
  const d = new Date()
  return (then.getFullYear() - d.getFullYear()) * 12 + (then.getMonth() - d.getMonth())
}

function avgMonthlyContribution(target: Target): number {
  const contribs = target.contributions ?? []
  if (contribs.length === 0) return 0
  const sorted = [...contribs].sort((a, b) => a.date.localeCompare(b.date))
  const first = new Date(sorted[0].date)
  const last  = new Date(sorted[sorted.length - 1].date)
  const months = Math.max(1, (last.getTime() - first.getTime()) / (30 * 86_400_000))
  const total = contribs.reduce((s, c) => s + c.amount, 0)
  return total / months
}

export function generateSpendingInsights(input: InsightInput): SpendingInsight[] {
  const insights: SpendingInsight[] = []

  // ── HIGH: Forecast risk ──────────────────────────────────────────────────────
  if (input.forecast.status === 'risk' && input.forecast.projectedEnd < 0) {
    insights.push({
      id: 'forecast_risk',
      priority: 'high',
      icon: '⚠',
      title: 'Cash flow risk',
      body: `Projected balance by ${input.forecast.endStr} is ${currency(input.forecast.projectedEnd)}. Total projected expenses (${currency(input.forecast.totalExpenses)}) exceed income (${currency(input.forecast.totalIncome)}) over this window.`,
      actionLabel: 'Review subscriptions',
      actionTab: 'Dashboard',
    })
  } else if (input.forecast.status === 'tight') {
    insights.push({
      id: 'forecast_tight',
      priority: 'high',
      icon: '⚡',
      title: 'Cash flow tight',
      body: `Projected balance by ${input.forecast.endStr} is ${currency(input.forecast.projectedEnd)} — below your $250 buffer. Consider reducing discretionary spending this period.`,
      actionLabel: 'Review subscriptions',
      actionTab: 'Dashboard',
    })
  }

  // ── HIGH: Heavily over-budget categories (>50% over) ────────────────────────
  const heavyOverBudget = input.catBreakdown
    .filter(c => c.planned > 0 && c.actual > c.planned * 1.5)
    .sort((a, b) => (b.actual - b.planned) - (a.actual - a.planned))

  for (const cat of heavyOverBudget.slice(0, 2)) {
    const pct = Math.round(((cat.actual - cat.planned) / cat.planned) * 100)
    insights.push({
      id: `over_budget_heavy_${cat.catId}`,
      priority: 'high',
      icon: '↑',
      title: `${cat.name} is ${pct}% over budget`,
      body: `You've spent ${currency(cat.actual)} vs your ${currency(cat.planned)} plan — ${currency(cat.diff)} over.`,
      actionLabel: 'Review budget',
      actionTab: 'Budget',
    })
  }

  // ── MEDIUM: Moderately over-budget categories (10–50% over) ─────────────────
  const mildOverBudget = input.catBreakdown
    .filter(c => c.planned > 0 && c.actual > c.planned * 1.1 && c.actual <= c.planned * 1.5)
    .sort((a, b) => (b.actual - b.planned) - (a.actual - a.planned))

  if (mildOverBudget.length >= 3) {
    const total = mildOverBudget.reduce((s, c) => s + (c.actual - c.planned), 0)
    insights.push({
      id: 'multi_over_budget',
      priority: 'medium',
      icon: '📊',
      title: `${mildOverBudget.length} categories slightly over plan`,
      body: `${mildOverBudget.slice(0, 3).map(c => c.name).join(', ')} are each 10–50% over budget, totalling ${currency(total)} extra.`,
      actionLabel: 'Review budget',
      actionTab: 'Budget',
    })
  } else {
    for (const cat of mildOverBudget.slice(0, 1)) {
      const pct = Math.round(((cat.actual - cat.planned) / cat.planned) * 100)
      insights.push({
        id: `over_budget_mild_${cat.catId}`,
        priority: 'medium',
        icon: '↑',
        title: `${cat.name} is ${pct}% over plan`,
        body: `Spent ${currency(cat.actual)} vs ${currency(cat.planned)} plan — ${currency(cat.diff)} over.`,
        actionLabel: 'Review budget',
        actionTab: 'Budget',
      })
    }
  }

  // ── MEDIUM: Uncategorized spending ───────────────────────────────────────────
  if (input.uncatExpenses >= 3) {
    const uncatTxns = input.bigTxns.filter(tx => !tx.categoryId)
    const uncatTotal = uncatTxns.reduce((s, t) => s + t.amount, 0)
    insights.push({
      id: 'uncategorized',
      priority: 'medium',
      icon: '?',
      title: `${input.uncatExpenses} transactions need categories`,
      body: uncatTotal > 0
        ? `${currency(uncatTotal)} in spending for ${input.reviewMonth} hasn't been assigned a category. Categorize to get accurate budget tracking.`
        : `${input.uncatExpenses} expenses for ${input.reviewMonth} still need categories for accurate budget tracking.`,
      actionLabel: 'Review transactions',
      actionTab: 'Transactions',
    })
  }

  // ── MEDIUM: Largest single transaction ──────────────────────────────────────
  const bigTx = input.bigTxns[0]
  if (bigTx && input.totalPlanned > 0 && bigTx.amount > input.totalPlanned * 0.15) {
    const pct = Math.round((bigTx.amount / input.totalPlanned) * 100)
    insights.push({
      id: 'large_transaction',
      priority: 'medium',
      icon: '💰',
      title: `Large expense: ${bigTx.merchant}`,
      body: `${currency(bigTx.amount)} on ${bigTx.date} — ${pct}% of your monthly budget plan. Make sure it's accounted for.`,
    })
  }

  // ── MEDIUM: Savings goals behind pace ───────────────────────────────────────
  for (const target of input.targets) {
    if (target.completed || target.paused) continue
    const remaining = target.goalAmount - target.currentSaved
    if (remaining <= 0) continue
    const months = monthsBetween(target.deadline)
    if (months <= 0 || months > 24) continue  // skip past/distant deadlines

    const neededPerMonth = remaining / months
    const currentPace = avgMonthlyContribution(target)

    // Only flag if significantly behind (needed is >40% more than current pace)
    if (currentPace > 0 && neededPerMonth > currentPace * 1.4) {
      const gap = neededPerMonth - currentPace
      insights.push({
        id: `goal_behind_${target.id}`,
        priority: 'medium',
        icon: '🎯',
        title: `${target.name} goal behind pace`,
        body: `You need ${currency(neededPerMonth)}/month to hit ${currency(target.goalAmount)} by ${target.deadline}, but you're averaging ${currency(currentPace)}/month — ${currency(gap)}/month short.`,
        actionLabel: 'View goals',
        actionTab: 'Targets',
      })
    } else if (currentPace === 0 && months < 6) {
      insights.push({
        id: `goal_no_contributions_${target.id}`,
        priority: 'medium',
        icon: '🎯',
        title: `${target.name} needs attention`,
        body: `${currency(remaining)} remaining to reach ${currency(target.goalAmount)} — deadline in ${months} month${months === 1 ? '' : 's'} with no recent contributions.`,
        actionLabel: 'Log contribution',
        actionTab: 'Targets',
      })
    }
  }

  // ── MEDIUM: Large net outflow this month ─────────────────────────────────────
  if (input.monthlyExpenses > 0 && input.monthlyNetCash < 0 && input.monthlyIncome > 0) {
    const deficit = Math.abs(input.monthlyNetCash)
    const pct = Math.round((deficit / input.monthlyIncome) * 100)
    if (pct > 15) {
      insights.push({
        id: 'net_outflow',
        priority: 'medium',
        icon: '📉',
        title: 'Spending exceeded income this month',
        body: `${input.reviewMonth}: ${currency(input.monthlyExpenses)} spent vs ${currency(input.monthlyIncome)} income — net outflow of ${currency(deficit)} (${pct}% of income).`,
      })
    }
  }

  // ── MEDIUM: Approaching budget limit (75–99%) ────────────────────────────────
  const approachingBudget = input.catBreakdown
    .filter(c => c.planned > 0 && c.actual >= c.planned * 0.75 && c.actual < c.planned)
    .sort((a, b) => (b.actual / b.planned) - (a.actual / a.planned))

  for (const cat of approachingBudget.slice(0, 2)) {
    const pct = Math.round((cat.actual / cat.planned) * 100)
    const remaining = cat.planned - cat.actual
    insights.push({
      id: `approaching_budget_${cat.catId}`,
      priority: 'medium',
      icon: '⚡',
      title: `${cat.name} is ${pct}% through its budget`,
      body: `${currency(cat.actual)} spent of ${currency(cat.planned)} plan — ${currency(remaining)} remaining before you're over.`,
      actionLabel: 'Review budget',
      actionTab: 'Budget',
    })
  }

  // ── POSITIVE: All categories within budget ───────────────────────────────────
  if (
    input.overBudget.length === 0 &&
    input.catBreakdown.length > 0 &&
    input.totalActual > 0 &&
    heavyOverBudget.length === 0 &&
    mildOverBudget.length === 0
  ) {
    insights.push({
      id: 'all_on_track',
      priority: 'positive',
      icon: '✓',
      title: 'All categories within budget',
      body: `You've spent ${currency(input.totalActual)} of ${currency(input.totalPlanned)} planned — ${currency(input.totalPlanned - input.totalActual)} remaining across ${input.catBreakdown.filter(c => c.planned > 0).length} categories.`,
    })
  }

  // ── POSITIVE: Savings goal milestone ─────────────────────────────────────────
  for (const target of input.targets) {
    if (target.completed || target.paused) continue
    const pct = target.goalAmount > 0 ? target.currentSaved / target.goalAmount : 0
    if (pct >= 0.5 && pct < 1 && target.contributions && target.contributions.length > 0) {
      insights.push({
        id: `goal_halfway_${target.id}`,
        priority: 'positive',
        icon: '🎉',
        title: `${target.name} is halfway there`,
        body: `${currency(target.currentSaved)} saved of ${currency(target.goalAmount)} (${Math.round(pct * 100)}%). ${currency(target.goalAmount - target.currentSaved)} to go.`,
        actionLabel: 'View goals',
        actionTab: 'Targets',
      })
      break  // Only show one positive goal highlight
    }
  }

  // Deduplicate and cap at 6
  const seen = new Set<string>()
  const deduped = insights.filter(i => {
    if (seen.has(i.id)) return false
    seen.add(i.id)
    return true
  })

  // Sort: high → medium → positive
  const order: InsightPriority[] = ['high', 'medium', 'positive']
  return deduped
    .sort((a, b) => order.indexOf(a.priority) - order.indexOf(b.priority))
    .slice(0, 6)
}

/**
 * Generates a single prose summary paragraph for the monthly review header.
 * Specific, data-driven, no filler.
 */
export function generateMonthlyReviewSummary(params: {
  reviewMonth: string
  txnCount: number
  income: number
  expenses: number
  netCash: number
  catBreakdown: Array<{ catId: string; name: string; planned: number; actual: number; diff: number }>
  uncatExpenses: number
  bigTxns: Transaction[]
}): string {
  if (params.txnCount === 0) return ''

  const parts: string[] = []

  // Opening: month, transaction count, spending total
  const monthLabel = (() => {
    const d = new Date(params.reviewMonth + '-01')
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  })()

  parts.push(`In ${monthLabel}, you recorded ${params.txnCount} transaction${params.txnCount === 1 ? '' : 's'}`)

  if (params.expenses > 0 && params.income > 0) {
    parts[0] += ` — ${currency(params.expenses)} spent, ${currency(params.income)} in income`
  } else if (params.expenses > 0) {
    parts[0] += ` totalling ${currency(params.expenses)} in spending`
  }
  parts[0] += '.'

  // Net cash flow
  if (params.income > 0) {
    const netLabel = params.netCash >= 0
      ? `Net cash flow was positive at +${currency(params.netCash)}.`
      : `Net cash flow was −${currency(Math.abs(params.netCash))}.`
    parts.push(netLabel)
  }

  // Biggest category
  const topCat = params.catBreakdown.find(c => c.catId !== '__none__' && c.actual > 0)
  if (topCat) {
    const overUnder = topCat.planned > 0
      ? topCat.diff > 0
        ? `, ${currency(topCat.diff)} over plan`
        : topCat.diff < 0
          ? `, ${currency(Math.abs(topCat.diff))} under plan`
          : ', on plan'
      : ''
    parts.push(`Biggest category: ${topCat.name} at ${currency(topCat.actual)}${overUnder}.`)
  }

  // Over-budget categories
  const overBudgetCats = params.catBreakdown
    .filter(c => c.planned > 0 && c.diff > 0)
    .sort((a, b) => b.diff - a.diff)

  if (overBudgetCats.length > 0) {
    const names = overBudgetCats.slice(0, 2).map(c => `${c.name} (+${currency(c.diff)})`).join(' and ')
    const extra = overBudgetCats.length > 2 ? ` and ${overBudgetCats.length - 2} more` : ''
    parts.push(`Over budget on ${names}${extra}.`)
  }

  // Uncategorized
  if (params.uncatExpenses > 0) {
    parts.push(`${params.uncatExpenses} expense${params.uncatExpenses === 1 ? '' : 's'} still need${params.uncatExpenses === 1 ? 's' : ''} a category.`)
  }

  return parts.join(' ')
}
