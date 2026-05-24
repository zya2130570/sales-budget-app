/**
 * OnboardingGuide.tsx — V27
 *
 * Fullscreen walkthrough. App is visible + highlighted behind it.
 * Top bar: progress + step pills. Bottom panel: content (scrolls) + nav (pinned).
 * Next button is ALWAYS visible — never requires scrolling.
 */
import { useState, useRef, useEffect, useCallback } from 'react'

type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Accounts' | 'Transactions' | 'Scenarios' | 'Targets'

const STATIC_FAQ: Record<string, string> = {
  'How do I export Apple Card transactions?':
    'Wallet app on iPhone → tap Apple Card → ⋯ (top right) → Export Transactions → CSV. Then import in Flow → Transactions → Import CSV.',
  'What take-home rate should I use?':
    'Start at 82%. Check a pay stub: net ÷ gross = your real rate. Enter it in the Income tab.',
  'Savings vs Investment — what\'s the difference?':
    'Savings (Type 3): liquid and accessible — emergency fund, vacation fund. Investment (Type 4): long-term and locked — Roth IRA, brokerage, 401k.',
  'How do I fix the "Attention Needed" banner?':
    'Your planned budget exceeds your income. Reduce category amounts in the Budget tab, or correct your salary in the Income tab.',
  'How do auto-categorization rules work?':
    'Transactions → Rules. Add "contains: DoorDash → Takeout". All future imports auto-assign. Or just categorize one transaction — Flow remembers the merchant.',
  'How do I add a savings goal?':
    'Savings Goals tab → Add Goal → name, target amount, deadline. Flow calculates monthly savings needed. Log contributions with "Add Contribution."',
}

type Step = {
  id: string
  title: string
  emoji: string
  tab?: Tab
  subtitle: string
  description: string
  tips: { icon: string; label: string; text: string }[]
}

const STEPS: Step[] = [
  {
    id: 'welcome', emoji: '👋', title: 'Welcome to Flow', tab: 'Dashboard',
    subtitle: 'Your personal finance command center',
    description: 'Flow connects your income, budget, savings goals, and real bank transactions in one place so you always know where you stand. This guide walks through setup, section by section.',
    tips: [
      { icon: '📦', label: 'Load an example', text: 'Click your email → "Load starter data" to see a fully configured real-world example (Zyan\'s setup) at any time.' },
      { icon: '⌨️', label: 'Keyboard shortcut', text: 'Press Ctrl+K (or ⌘K on Mac) anywhere in the app to open a quick-action menu for navigation and shortcuts.' },
      { icon: '☁️', label: 'Save your work', text: 'Click Cloud in the header → Sync now after each setup step. Your data is always stored locally first.' },
    ],
  },
  {
    id: 'income', emoji: '💵', title: 'Income', tab: 'Income',
    subtitle: 'The foundation — everything else derives from this',
    description: 'Enter your gross annual salary and take-home rate. Flow handles all period conversions (weekly/monthly/yearly) automatically.',
    tips: [
      { icon: '📊', label: 'Gross vs net', text: 'Enter GROSS salary (before taxes). Set take-home rate to what % hits your bank. 82% is a safe start — check a pay stub (net ÷ gross = your rate).' },
      { icon: '🔀', label: 'Side income', text: 'Add commissions, freelance, or bonuses separately. Since they vary, keep them separate so your baseline budget is always conservative.' },
      { icon: '📅', label: 'Period selector', text: 'Switch between Weekly / Bi-weekly / Monthly / Yearly at the top of the Budget tab. Flow converts everything automatically.' },
    ],
  },
  {
    id: 'budget', emoji: '📊', title: 'Budget Categories', tab: 'Budget',
    subtitle: 'Define where your money goes each period',
    description: 'Create a category for every area of spending or saving. Four types help you understand your money structure at a glance.',
    tips: [
      { icon: '📌', label: '4 types', text: 'Fixed Bill: rent/insurance. Variable: groceries/gas/takeout. Savings: emergency fund/goals. Investment: Roth IRA/brokerage.' },
      { icon: '💡', label: 'Start broad', text: 'Start with 8–12 categories. Easier to split one later than merge many small ones. Always enter MONTHLY amounts even for annual expenses.' },
      { icon: '🔁', label: 'Rollover', text: 'Enable Rollover on lumpy categories (car maintenance, clothing). Underspend this month = bigger budget next month. Hover the Rollover button for an example.' },
    ],
  },
  {
    id: 'accounts', emoji: '🏦', title: 'Accounts', tab: 'Accounts',
    subtitle: 'Set these up before importing transactions',
    description: 'Accounts represent your real financial accounts. You need at least one before importing — Flow needs to know which account each transaction belongs to.',
    tips: [
      { icon: '💳', label: 'Credit cards', text: 'Add credit cards as "Credit Card" type accounts. When you import a CSV, select the matching account during import.' },
      { icon: '📈', label: 'Investments', text: 'Add brokerage and retirement accounts even if you don\'t import transactions. They feed the Net Worth tracker in the Accounts tab.' },
      { icon: '💰', label: 'Net worth', text: 'Once accounts have balances, scroll down in the Accounts tab to see Cash, Investments, Debt, and Net Worth totals.' },
    ],
  },
  {
    id: 'transactions', emoji: '📥', title: 'Transactions', tab: 'Transactions',
    subtitle: 'Import real spending to see actuals vs planned',
    description: 'Import a CSV from your bank or credit card to see real actual spending alongside your planned budget. Actuals auto-populate the Budget tab.',
    tips: [
      { icon: '🍎', label: 'Apple Card export', text: 'Wallet app → Apple Card → ⋯ → Export Transactions → choose date range → CSV. Works perfectly with Flow\'s importer.' },
      { icon: '🏦', label: 'Other banks', text: 'Chase, Bank of America, Wells Fargo: log in online → Accounts → Download transactions → choose date range → CSV.' },
      { icon: '🤖', label: 'Auto-rules', text: 'After importing, assign categories to merchants. Go to Transactions → Rules to create permanent rules. "DoorDash → Takeout" auto-assigns forever after.' },
    ],
  },
  {
    id: 'goals', emoji: '🎯', title: 'Savings Goals', tab: 'Targets',
    subtitle: 'Track what you\'re building toward',
    description: 'Define goals with a target amount and deadline. Flow tells you exactly how much to save per month and tracks your progress.',
    tips: [
      { icon: '🔗', label: 'Link to budget', text: 'Create a matching budget category (e.g., "Emergency Fund" → Type: Savings → $200/month) to tie your plan to your goal progress.' },
      { icon: '📝', label: 'Log contributions', text: 'Every time you transfer money toward a goal, click "Add Contribution" in that goal\'s card. Progress bar updates instantly.' },
      { icon: '📸', label: 'Goal sets', text: 'Save a "Goal Set" snapshot at the start of each year to track how goals evolve over time.' },
    ],
  },
  {
    id: 'dashboard', emoji: '📈', title: 'Dashboard', tab: 'Dashboard',
    subtitle: 'Your daily financial command center',
    description: 'Once income, budget, and transactions are set up, the Dashboard gives you a complete picture — what needs attention, what\'s on track, what to do next.',
    tips: [
      { icon: '🚨', label: 'Attention Needed', text: 'Red banner = planned budget > income. Fix by reducing category amounts in Budget, or correcting salary in Income.' },
      { icon: '📊', label: 'Budget Health', text: 'Shows Planned vs Actual for all categories. Click "Over Budget" filter to focus on problem areas. Green = on track, red = over.' },
      { icon: '📋', label: 'Monthly Review', text: 'At month end, review what went well, mark reviewed, see category breakdown. Builds a historical record of your patterns.' },
    ],
  },
  {
    id: 'sync', emoji: '☁️', title: 'Cloud Sync', tab: 'Dashboard',
    subtitle: 'Keep your data safe across devices',
    description: 'Flow stores everything locally by default. Cloud sync backs up all data to Supabase so you never lose it and can access it from any device.',
    tips: [
      { icon: '🔌', label: 'First sync', text: 'Click "Cloud" in the header → Test connection → once green, click "Sync now". All your data pushes to the cloud.' },
      { icon: '⚡', label: 'Auto-sync', text: 'Enable auto-sync in the Cloud panel. Flow syncs 5 seconds after any change and pauses if it detects connection issues.' },
      { icon: '💾', label: 'Local backup', text: 'Settings → Download Backup exports a JSON file. Store it in Google Drive or iCloud as an extra safety net.' },
    ],
  },
]

type ChatMsg = { role: 'user' | 'assistant'; content: string }

function GuideChat({ stepId }: { stepId: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMsgs([]) }, [stepId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const q = text.trim()
    if (apiAvailable === false) {
      const faq = Object.entries(STATIC_FAQ).find(([k]) =>
        q.toLowerCase().split(' ').some(w => w.length > 4 && k.toLowerCase().includes(w))
      )
      setMsgs(p => [...p,
        { role: 'user', content: q },
        { role: 'assistant', content: faq ? faq[1] : 'No pre-written answer — check the relevant app tab or enable AI in Vercel settings.' },
      ])
      setInput('')
      return
    }
    const history: ChatMsg[] = [...msgs, { role: 'user', content: q }]
    setMsgs(history)
    setInput('')
    setLoading(true)
    const system = `You are the setup guide for Flow, a personal finance app. Answer in 2-3 sentences, direct and practical. Topics: Income (salary, take-home), Budget (categories by type), Accounts (before importing), Transactions (CSV import, rules), Savings Goals (target + deadline), Dashboard (health, insights), Cloud (Supabase sync). Zyan's example: 17 categories, 7 accounts, 235 transactions, 10 rules, 8 goals, 82% take-home.`
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: history, systemOverride: system }) })
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) { setApiAvailable(false); setMsgs([...msgs, { role: 'user', content: q }, { role: 'assistant', content: 'AI not configured — see the amber card in the Financial Assistant panel to set up a free Gemini key.' }]); setLoading(false); return }
      setApiAvailable(true)
      setMsgs([...history, { role: 'assistant', content: String(data.content ?? data.reply ?? '') }])
    } catch { setMsgs([...msgs, { role: 'user', content: q }, { role: 'assistant', content: 'Connection error. Try again.' }]) }
    setLoading(false)
  }, [msgs, loading, apiAvailable])

  const quickQ = ['How do I export Apple Card transactions?', 'What take-home rate should I use?', 'Savings vs Investment — what\'s the difference?', 'How do I fix the "Attention Needed" banner?']

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
        {apiAvailable === false ? 'Quick answers (built-in)' : 'Ask anything'}
      </p>
      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quickQ.map(q => (
            <button key={q} onClick={() => send(q)}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-slate-200 transition-all text-left leading-snug">
              {q}
            </button>
          ))}
        </div>
      )}
      {msgs.length > 0 && (
        <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
          {msgs.map((m, i) => (
            <div key={i} className={`text-xs rounded-xl px-3 py-2 leading-relaxed whitespace-pre-line ${m.role === 'user' ? 'bg-blue-600/20 border border-blue-600/30 text-blue-100 ml-6' : 'bg-slate-800 border border-slate-700/40 text-slate-300 mr-6'}`}>{m.content}</div>
          ))}
          {loading && <div className="text-xs text-slate-600 italic px-3 animate-pulse">Thinking…</div>}
          <div ref={bottomRef} />
        </div>
      )}
      <div className="flex gap-2">
        <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(input)}
          placeholder="Ask anything about setting up Flow…"
          className="flex-1 text-xs px-3 py-2 rounded-xl bg-slate-800 border border-slate-700/40 focus:border-blue-500/60 focus:outline-none text-slate-200 placeholder-slate-600 transition-colors" />
        <button onClick={() => send(input)} disabled={!input.trim() || loading}
          className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-xs text-white transition-all font-medium flex-shrink-0">
          Ask
        </button>
      </div>
    </div>
  )
}

type Props = { onClose: () => void; onNavigate: (tab: Tab) => void }

export function OnboardingGuide({ onClose, onNavigate }: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const [panelExpanded, setPanelExpanded] = useState(true)
  const step = STEPS[stepIdx]
  const progress = ((stepIdx + 1) / STEPS.length) * 100
  const isLast = stepIdx === STEPS.length - 1

  useEffect(() => { if (step.tab) onNavigate(step.tab) }, [stepIdx])

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const goNext = () => { if (isLast) { onClose(); return }; setStepIdx(i => i + 1) }
  const goPrev = () => setStepIdx(i => Math.max(0, i - 1))

  return (
    <>
      {/* Spotlight overlay */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 85% 55% at 50% 38%, transparent 30%, rgba(2,6,23,0.7) 100%)' }} />
        {step.tab && (
          <div className="absolute left-3 right-3" style={{ top: '54px', bottom: panelExpanded ? '292px' : '56px', transition: 'bottom 0.3s ease' }}>
            <div className="w-full h-full rounded-2xl" style={{ boxShadow: '0 0 0 1.5px rgba(99,179,237,0.4), 0 0 60px rgba(59,130,246,0.1), inset 0 0 30px rgba(59,130,246,0.03)' }} />
          </div>
        )}
      </div>

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50" style={{ background: 'rgba(9,11,20,0.96)', backdropFilter: 'blur(16px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center gap-3 px-4 pt-2.5 pb-1.5">
          {/* Progress bar */}
          <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }} />
          </div>
          <span className="text-[10px] font-medium flex-shrink-0" style={{ color: 'rgba(148,163,184,0.6)' }}>{stepIdx + 1}/{STEPS.length}</span>
          <button onClick={onClose} className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md transition-colors hover:bg-white/10" style={{ color: 'rgba(148,163,184,0.5)' }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        {/* Step pills */}
        <div className="flex gap-1.5 px-4 pb-2 overflow-x-auto">
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStepIdx(i)}
              className="flex-shrink-0 text-[10px] px-2.5 py-[5px] rounded-full transition-all whitespace-nowrap font-medium"
              style={{
                background: i === stepIdx ? 'rgba(59,130,246,0.2)' : i < stepIdx ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${i === stepIdx ? 'rgba(59,130,246,0.5)' : i < stepIdx ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.08)'}`,
                color: i === stepIdx ? '#93c5fd' : i < stepIdx ? '#6ee7b7' : 'rgba(148,163,184,0.5)',
              }}>
              {i < stepIdx ? '✓' : s.emoji} {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Bottom panel — flex column so nav is always pinned */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col transition-all duration-300"
        style={{
          height: panelExpanded ? '292px' : '56px',
          background: 'rgba(9,11,20,0.97)',
          backdropFilter: 'blur(20px)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '20px 20px 0 0',
        }}>

        {/* Panel header — always visible, click to collapse */}
        <div className="flex items-center justify-between px-5 py-3.5 flex-shrink-0 cursor-pointer select-none" onClick={() => setPanelExpanded(v => !v)}>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-base flex-shrink-0">{step.emoji}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-none" style={{ color: '#f1f5f9' }}>{step.title}</p>
              <p className="text-[11px] mt-0.5 truncate" style={{ color: 'rgba(148,163,184,0.5)' }}>{step.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {step.tab && !panelExpanded && (
              <button onClick={e => { e.stopPropagation(); step.tab && onNavigate(step.tab) }}
                className="text-[10px] px-2 py-1 rounded-lg transition-colors font-medium"
                style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', color: '#93c5fd' }}>
                Open {step.tab}
              </button>
            )}
            <div className="w-5 h-5 flex items-center justify-center rounded-md" style={{ color: 'rgba(148,163,184,0.4)' }}>
              <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d={panelExpanded ? 'M1 5l4-4 4 4' : 'M1 1l4 4 4-4'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
          </div>
        </div>

        {/* Scrollable content — flex-1 so it fills space between header and nav */}
        {panelExpanded && (
          <div className="flex-1 overflow-y-auto px-5 min-h-0">
            <div className="space-y-3 pb-2">
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(203,213,225,0.8)' }}>{step.description}</p>

              {/* Tips */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {step.tips.map(tip => (
                  <div key={tip.label} className="rounded-xl p-2.5 flex gap-2.5"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-base flex-shrink-0 mt-0.5">{tip.icon}</span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold mb-0.5" style={{ color: '#93c5fd' }}>{tip.label}</p>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(148,163,184,0.7)' }}>{tip.text}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat */}
              <div className="pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <GuideChat stepId={step.id} />
              </div>
            </div>
          </div>
        )}

        {/* Navigation — PINNED TO BOTTOM, always visible */}
        {panelExpanded && (
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={goPrev} disabled={stepIdx === 0}
              className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-xl transition-all font-medium disabled:opacity-20"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(148,163,184,0.8)' }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 10L4 6l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Back
            </button>

            <div className="flex items-center gap-2">
              {step.tab && (
                <button onClick={() => step.tab && onNavigate(step.tab)}
                  className="text-xs px-3.5 py-2 rounded-xl transition-all font-medium"
                  style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' }}>
                  Open {step.tab}
                </button>
              )}
              <button onClick={goNext}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl font-semibold transition-all"
                style={{ background: isLast ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #3b82f6, #6366f1)', color: 'white', boxShadow: isLast ? '0 0 20px rgba(16,185,129,0.3)' : '0 0 20px rgba(59,130,246,0.3)' }}>
                {isLast ? '✓ Done' : 'Next'}
                {!isLast && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
