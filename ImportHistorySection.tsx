import { currency } from '../utils/formatting'

type GoalPlanSummary = {
  activeCount: number
  pausedCount: number
  fundedCount: number
  totalGoal: number
  totalSaved: number
  remaining: number
  weeklyRequired: number
}

type GoalPlanningSummaryProps = {
  summary: GoalPlanSummary
}

export function GoalPlanningSummary({ summary }: GoalPlanningSummaryProps) {
  return (
    <div className="rounded-2xl border border-blue-700/20 bg-blue-950/10 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">Savings Plan Summary</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        {[
          { label: 'Total Goal', val: currency(summary.totalGoal), color: 'text-slate-200' },
          { label: 'Total Saved', val: currency(summary.totalSaved), color: 'text-green-400' },
          { label: 'Remaining', val: currency(summary.remaining), color: summary.remaining > 0 ? 'text-amber-300' : 'text-green-400' },
          { label: 'Required / Week', val: summary.weeklyRequired > 0 ? currency(summary.weeklyRequired) : '—', color: 'text-blue-300' },
        ].map(({ label, val, color }) => (
          <div key={label} className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-3 py-2">
            <div className="text-[10px] text-slate-500 mb-0.5">{label}</div>
            <div className={`text-base font-bold ${color}`}>{val}</div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 text-xs text-slate-500">
        <span><span className="text-slate-300 font-medium">{summary.activeCount}</span> active</span>
        {summary.pausedCount > 0 && <span><span className="text-slate-400 font-medium">{summary.pausedCount}</span> paused</span>}
        {summary.fundedCount > 0 && <span><span className="text-green-400 font-medium">{summary.fundedCount}</span> fully funded</span>}
      </div>
    </div>
  )
}
