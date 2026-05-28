import { useState } from 'react'
import { currency } from '../utils/formatting'
import type { ScenarioName } from '../types'

type Props = {
  monthlyBudget: number
  monthlyIncome: number
  scenario: Record<ScenarioName, number>
  onSetScenario: (name: ScenarioName, value: number) => void
  onNavigateToScenarios?: () => void
}

const STEPS = [
  { id: 1, label: 'Your Budget', icon: '📋' },
  { id: 2, label: 'Income Scenarios', icon: '⚡' },
  { id: 3, label: 'Compare', icon: '📊' },
]

export function ScenarioWizard({ monthlyBudget, monthlyIncome, scenario, onSetScenario, onNavigateToScenarios }: Props) {
  const [step, setStep] = useState(1)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('flow-scenario-wizard-dismissed') === '1')

  if (dismissed) return null

  const dismiss = () => {
    localStorage.setItem('flow-scenario-wizard-dismissed', '1')
    setDismissed(true)
  }

  const scenarioNames: ScenarioName[] = ['Slow', 'Medium', 'Fast', 'Custom']
  const colors: Record<ScenarioName, string> = {
    Slow: 'text-yellow-400',
    Medium: 'text-blue-400',
    Fast: 'text-green-400',
    Custom: 'text-slate-300',
  }

  return (
    <div className="rounded-xl border border-blue-700/30 bg-blue-950/10 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-blue-700/20">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-blue-300">Scenario Wizard</span>
          <span className="text-[10px] text-blue-400/60">guided setup</span>
        </div>
        <button onClick={dismiss} className="text-slate-500 hover:text-slate-300 text-xs">✕ dismiss</button>
      </div>

      {/* Step indicators */}
      <div className="flex gap-0 border-b border-slate-700/30">
        {STEPS.map(s => (
          <button
            key={s.id}
            onClick={() => setStep(s.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition-colors
              ${step === s.id ? 'bg-slate-800/60 text-slate-200 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-400'}`}
          >
            <span>{s.icon}</span>
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* Step content */}
      <div className="p-4">
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Before comparing income scenarios, know your fixed costs — this is the floor every scenario has to clear.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-3 py-2.5">
                <div className="text-[10px] text-slate-500 mb-0.5">Monthly budget total</div>
                <div className="text-base font-bold text-slate-200">{currency(monthlyBudget)}</div>
              </div>
              <div className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-3 py-2.5">
                <div className="text-[10px] text-slate-500 mb-0.5">Current monthly income</div>
                <div className="text-base font-bold text-slate-200">{currency(monthlyIncome)}</div>
              </div>
              <div className={`rounded-lg border px-3 py-2.5 col-span-2 ${monthlyIncome >= monthlyBudget ? 'bg-green-950/20 border-green-700/30' : 'bg-red-950/20 border-red-700/30'}`}>
                <div className="text-[10px] text-slate-500 mb-0.5">Monthly surplus / (deficit)</div>
                <div className={`text-base font-bold ${monthlyIncome >= monthlyBudget ? 'text-green-400' : 'text-red-400'}`}>
                  {currency(monthlyIncome - monthlyBudget)}
                </div>
              </div>
            </div>
            {monthlyBudget === 0 && (
              <p className="text-[10px] text-amber-400/80">⚠ No budget categories yet — go to Budget tab first to add your monthly expenses.</p>
            )}
            <button
              onClick={() => setStep(2)}
              className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2 transition-colors"
            >
              Next: Set income scenarios →
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Set four income levels that represent your realistic range — a slow month, a typical month, a great month, and any custom scenario.
              These are monthly gross commission/income values.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {scenarioNames.map(name => (
                <div key={name}>
                  <label className={`block text-[10px] font-medium mb-1 ${colors[name]}`}>{name}</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1.5 text-slate-400 text-xs">$</span>
                    <input
                      type="number"
                      min={0}
                      step={500}
                      value={scenario[name]}
                      onChange={e => onSetScenario(name, Math.max(0, Number(e.target.value) || 0))}
                      className="w-full pl-5 pr-2 py-1.5 text-sm rounded bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(1)} className="flex-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-2 transition-colors">← Back</button>
              <button onClick={() => setStep(3)} className="flex-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium py-2 transition-colors">Next: Compare →</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Here's how each scenario stacks up against your {currency(monthlyBudget)}/mo budget:
            </p>
            <div className="space-y-1.5">
              {scenarioNames.map(name => {
                // rough take-home: 78% of gross (simplified)
                const grossMonthly = scenario[name]
                const approxTakeHome = grossMonthly * 0.78
                const surplus = approxTakeHome - monthlyBudget
                const isCovered = surplus >= 0
                return (
                  <div key={name} className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${isCovered ? 'border-slate-700/40 bg-slate-800/30' : 'border-red-700/20 bg-red-950/10'}`}>
                    <span className={`text-xs font-semibold w-14 ${colors[name]}`}>{name}</span>
                    <span className="text-xs text-slate-400 flex-1">{currency(grossMonthly)}/mo gross → ~{currency(approxTakeHome)} take-home</span>
                    <span className={`text-xs font-medium shrink-0 ${isCovered ? 'text-green-400' : 'text-red-400'}`}>
                      {isCovered ? `+${currency(surplus)}` : currency(surplus)}
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="text-[10px] text-slate-600">Take-home estimate uses ~78% of gross. Exact rates shown in Income tab.</p>
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="flex-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs py-2 transition-colors">← Back</button>
              {onNavigateToScenarios && (
                <button onClick={onNavigateToScenarios} className="flex-1 rounded-lg bg-green-700 hover:bg-green-600 text-white text-xs font-medium py-2 transition-colors">
                  See full breakdown ↓
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
