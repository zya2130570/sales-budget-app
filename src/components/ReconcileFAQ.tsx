/**
 * ReconcileFAQ.tsx — V42
 * Explains the reconcile workflow in plain terms.
 * Triggered by the ? button in the Accounts tab header row.
 */
import { useEffect } from 'react'

type Props = { onClose: () => void }

export function ReconcileFAQ({ onClose }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div>
            <h2 className="text-sm font-bold text-slate-100">What does Reconcile do?</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">A plain-English walkthrough</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">

          <div className="rounded-xl bg-slate-800/60 border border-slate-700/40 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">The short version</p>
            <p className="text-sm text-slate-300 leading-relaxed">
              Reconcile lets you confirm that the transactions you have logged in Flow actually match
              what your bank shows. It is how you catch errors, missed imports, and anything the app
              is not accounting for.
            </p>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Step by step</p>

            {[
              {
                step: '1',
                title: 'Set your current balance',
                body: 'In the Accounts tab, enter the balance your bank shows right now for each account. This is the "Current Balance" column — what the bank says you have.',
              },
              {
                step: '2',
                title: 'Import or log transactions',
                body: 'Use Import CSV / PDF to pull in your bank transactions, or log them manually. Every transaction you record moves money between categories.',
              },
              {
                step: '3',
                title: 'Click Reconcile on an account',
                body: 'Flow adds up all the transactions you have logged for that account (Imported Activity). If that total matches your current balance, the account is reconciled. If there is a gap, that gap is called "Unexplained Activity."',
              },
              {
                step: '4',
                title: 'Understand Unexplained Activity',
                body: 'Unexplained = the difference between what your bank says and what you have logged. Common causes: a transaction you forgot to import, a fee or interest charge, or a transfer you did not record.',
              },
              {
                step: '5',
                title: 'Get to zero',
                body: 'Import the missing transactions or log them manually until Unexplained Activity reaches $0. When it does, your account is fully reconciled.',
              },
            ].map(item => (
              <div key={item.step} className="flex gap-3 rounded-xl bg-slate-800/40 border border-slate-700/30 p-3.5">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600/30 text-blue-300 text-[11px] font-bold flex items-center justify-center mt-0.5">
                  {item.step}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-200">{item.title}</p>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-amber-700/30 bg-amber-950/15 p-3.5">
            <p className="text-[11px] font-semibold text-amber-300 mb-1">Tip</p>
            <p className="text-xs text-amber-200/80 leading-relaxed">
              You do not need to reconcile every account every week. Start with your main checking
              account once a month. Credit cards reconcile naturally once you import the statement.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-slate-700/50">
          <button onClick={onClose}
            className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm text-slate-300 transition-colors">
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
