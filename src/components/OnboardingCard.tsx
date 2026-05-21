type OnboardingCardProps = {
  onLoadDemo: () => void
  onOpenSettings: () => void
}

export function OnboardingCard({ onLoadDemo, onOpenSettings }: OnboardingCardProps) {
  return (
    <div className="rounded-2xl border border-blue-500/40 bg-blue-950/30 p-5 shadow-lg">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">First setup</p>
          <h2 className="mt-1 text-xl font-bold text-slate-100">Start with your real data or load demo data.</h2>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Add accounts, budget categories, transactions, and savings goals to turn Flow into your personal finance dashboard.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onLoadDemo}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            type="button"
          >
            Load Demo Data
          </button>
          <button
            onClick={onOpenSettings}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:bg-slate-600"
            type="button"
          >
            Open Settings
          </button>
        </div>
      </div>
    </div>
  )
}
