/**
 * SpendingInsightsPanel.tsx — V13
 *
 * Dashboard panel showing prioritized, data-driven spending insights.
 * Each card is specific (real numbers), actionable, and tappable.
 */
import type { SpendingInsight, InsightPriority } from '../utils/spendingInsights'

type Props = {
  insights: SpendingInsight[]
  onAction?: (tab: string) => void
}

function priorityStyles(priority: InsightPriority) {
  switch (priority) {
    case 'high':     return { border: 'border-red-700/50',    bg: 'bg-red-950/20',    dot: 'bg-red-400',    text: 'text-red-300'    }
    case 'medium':   return { border: 'border-amber-700/40',  bg: 'bg-amber-950/10',  dot: 'bg-amber-400',  text: 'text-amber-200'  }
    case 'positive': return { border: 'border-emerald-700/40', bg: 'bg-emerald-950/10', dot: 'bg-emerald-400', text: 'text-emerald-300' }
  }
}

function InsightCard({ insight, onAction }: { insight: SpendingInsight; onAction?: (tab: string) => void }) {
  const s = priorityStyles(insight.priority)
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-3 flex gap-3`}>
      <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${s.text}`}>{insight.title}</p>
        <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{insight.body}</p>
        {insight.actionLabel && insight.actionTab && onAction && (
          <button
            onClick={() => onAction(insight.actionTab!)}
            className="mt-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors underline-offset-2 hover:underline"
          >
            {insight.actionLabel} →
          </button>
        )}
      </div>
      <span className="text-base flex-shrink-0 opacity-70">{insight.icon}</span>
    </div>
  )
}

export function SpendingInsightsPanel({ insights, onAction }: Props) {
  if (insights.length === 0) return null

  const highCount = insights.filter(i => i.priority === 'high').length

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-100">
          Insights
          {highCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white">
              {highCount}
            </span>
          )}
        </h2>
        <span className="text-[11px] text-slate-500">{insights.length} item{insights.length === 1 ? '' : 's'}</span>
      </div>
      <div className="space-y-2">
        {insights.map(insight => (
          <InsightCard key={insight.id} insight={insight} onAction={onAction} />
        ))}
      </div>
    </div>
  )
}
