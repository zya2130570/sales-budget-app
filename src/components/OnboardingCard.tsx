/**
 * OnboardingCard.tsx — V43
 * Progressive setup checklist shown on Dashboard when the app is empty or partially set up.
 * Each step checks real app data. Disappears once all 5 steps are done.
 */
import { useState } from 'react'

export type OnboardingCardProps = {
  hasSalary: boolean
  hasCategories: boolean
  hasAccounts: boolean
  hasTransactions: boolean
  hasGoals: boolean
  onNavigate: (tab: 'Income' | 'Budget' | 'Accounts' | 'Transactions' | 'Targets') => void
  onLoadDemo: () => void
  onDismiss: () => void
}

const STEPS = [
  {
    id: 'income',
    label: 'Set your income',
    description: 'Enter your gross salary and take-home rate',
    tab: 'Income' as const,
    done: (p: OnboardingCardProps) => p.hasSalary,
  },
  {
    id: 'budget',
    label: 'Add budget categories',
    description: 'Define where your money goes (rent, groceries, savings…)',
    tab: 'Budget' as const,
    done: (p: OnboardingCardProps) => p.hasCategories,
  },
  {
    id: 'accounts',
    label: 'Add your accounts',
    description: 'Link your checking, savings, and credit card accounts',
    tab: 'Accounts' as const,
    done: (p: OnboardingCardProps) => p.hasAccounts,
  },
  {
    id: 'transactions',
    label: 'Import transactions',
    description: 'Upload a CSV or PDF from your bank to see actuals vs. planned',
    tab: 'Transactions' as const,
    done: (p: OnboardingCardProps) => p.hasTransactions,
  },
  {
    id: 'goals',
    label: 'Set a savings goal',
    description: 'Track progress toward something you are saving for',
    tab: 'Targets' as const,
    done: (p: OnboardingCardProps) => p.hasGoals,
  },
]

export function OnboardingCard(props: OnboardingCardProps) {
  const [dismissed, setDismissed] = useState(false)

  const doneCount = STEPS.filter(s => s.done(props)).length
  const allDone = doneCount === STEPS.length

  if (dismissed) return null

  return (
    <div className="rounded-2xl border border-blue-500/30 bg-blue-950/20 p-5 shadow-lg">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">
            {allDone ? '🎉 Setup complete' : 'Getting started'}
          </p>
          <h2 className="mt-1 text-base font-bold text-slate-100">
            {allDone
              ? 'You are all set up. Flow is tracking your finances.'
              : `${doneCount} of ${STEPS.length} setup steps done`}
          </h2>
          {!allDone && (
            <div className="mt-2 h-1.5 w-48 rounded-full bg-slate-700 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-500"
                style={{ width: `${(doneCount / STEPS.length) * 100}%` }}
              />
            </div>
          )}
        </div>
        <button
          onClick={() => { setDismissed(true); props.onDismiss() }}
          className="text-slate-600 hover:text-slate-400 text-sm leading-none flex-shrink-0 mt-0.5"
          title="Dismiss"
        >✕</button>
      </div>

      {!allDone && (
        <div className="space-y-2">
          {STEPS.map(step => {
            const done = step.done(props)
            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors ${
                  done
                    ? 'bg-emerald-950/20 border border-emerald-800/30'
                    : 'bg-slate-800/50 border border-slate-700/40 cursor-pointer hover:bg-slate-700/50'
                }`}
                onClick={() => !done && props.onNavigate(step.tab)}
              >
                <span className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                  done ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-500'
                }`}>
                  {done ? '✓' : ''}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${done ? 'text-emerald-300 line-through decoration-emerald-700' : 'text-slate-200'}`}>
                    {step.label}
                  </p>
                  {!done && <p className="text-[11px] text-slate-500 mt-0.5">{step.description}</p>}
                </div>
                {!done && <span className="text-slate-600 text-xs flex-shrink-0">→</span>}
              </div>
            )
          })}
        </div>
      )}

      {!allDone && (
        <div className="mt-3 pt-3 border-t border-slate-700/30 flex items-center justify-between">
          <p className="text-[11px] text-slate-600">Click any step to go there, or load demo data to explore first</p>
          <button
            onClick={props.onLoadDemo}
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors flex-shrink-0 ml-3"
          >
            Load demo
          </button>
        </div>
      )}
    </div>
  )
}
