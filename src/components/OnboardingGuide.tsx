/**
 * OnboardingGuide.tsx — V24
 *
 * Fullscreen walkthrough overlay. The actual app is visible behind it.
 * A spotlight ring highlights the relevant section. A bottom panel shows
 * step content, AI chat (or static FAQ fallback), and Next/Back navigation.
 */
import { useState, useRef, useEffect, useCallback } from 'react'

type Tab = 'Dashboard' | 'Income' | 'Budget' | 'Accounts' | 'Transactions' | 'Scenarios' | 'Targets'

// ── Static FAQ fallback (shown when AI key is not configured) ─────────────────
const STATIC_FAQ: Record<string, string> = {
  'How do I export Apple Card transactions?':
    'In the Wallet app on iPhone: tap your Apple Card → tap ⋯ (top right) → Export Transactions. This downloads a CSV you can import in Flow → Transactions → Import CSV.',
  'What take-home rate should I use?':
    'Start with 82% as an estimate. Divide any net pay stub by its gross pay to get your real rate. Enter it in the Income tab under "Take-home rate".',
  'Savings vs Investment category — what\'s the difference?':
    'Savings (Type 3) is liquid money you can access anytime — emergency fund, a vacation fund. Investment (Type 4) is long-term and usually locked — Roth IRA, brokerage, 401k contributions.',
  'How do I fix the "Attention Needed" banner?':
    'Your total planned budget exceeds your income. Go to Budget tab → reduce amounts in your variable categories, or check that your Income tab has the correct salary entered.',
  'How do auto-categorization rules work?':
    'Go to Transactions → Rules. Add a rule like "contains: DoorDash → category: Takeout". Every future import will auto-assign matching transactions. You can also just categorize one transaction and Flow learns the merchant.',
  'How do I add a savings goal?':
    'Go to Savings Goals tab → click "Add Goal". Enter the name, target amount, and a deadline. Flow tells you how much to save per month. Log contributions with "Add Contribution" each time you move money.',
}

type Step = {
  id: string
  title: string
  emoji: string
  tab?: Tab
  zyanSetup: string
  description: string
  tips: { label: string; text: string }[]
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    emoji: '👋',
    title: 'Welcome to Flow',
    zyanSetup: '17 categories · 7 accounts · 235 transactions · 8 goals',
    description:
      'Flow connects your income, budget, savings goals, and real bank transactions in one place — so you always know where you stand financially. This guide walks you through setting it up, section by section.',
    tips: [
      { label: 'Load example data', text: 'Click your email in the header → "Load starter data" to see a fully configured example (Zyan\'s real setup) at any time.' },
      { label: 'Come back anytime', text: 'Re-open this guide from your profile dropdown whenever you need a refresher on any section.' },
    ],
  },
  {
    id: 'income',
    emoji: '💵',
    title: 'Income',
    tab: 'Income',
    zyanSetup: 'Base salary + commission side income · ~82% take-home rate',
    description:
      'The Income tab is the foundation of everything. Your take-home income determines whether your budget is healthy or over-stretched. Enter your gross annual salary first — Flow handles all the period conversions automatically.',
    tips: [
      { label: 'Gross vs net', text: 'Enter your GROSS salary (before taxes). Then set your take-home rate — what % actually hits your bank. 82% is a reasonable estimate; refine it using a real pay stub (net ÷ gross).' },
      { label: 'Side income', text: 'Add variable income (freelance, bonuses, commission) separately. Since it fluctuates, keep it separate from your base so your baseline budget is always conservative.' },
      { label: 'Period selector', text: 'At the top of the Budget tab you can switch between Weekly, Bi-weekly, Monthly, and Yearly views. Flow converts everything automatically.' },
    ],
  },
  {
    id: 'budget',
    emoji: '📊',
    title: 'Budget Categories',
    tab: 'Budget',
    zyanSetup: '17 categories: bills, groceries, gas, takeout, subscriptions, savings funds, investments',
    description:
      'Categories define where your money goes each period. Create one for every area of spending or saving. Flow has 4 types — Fixed Bills, Variable spending, Savings, and Investment — to help you see your spending structure at a glance.',
    tips: [
      { label: '4 category types', text: 'Fixed Bill (rent, insurance, subscriptions), Variable (groceries, gas, takeout), Savings (emergency fund, specific goals), Investment (Roth IRA, brokerage, 401k). Use these types — they drive your Budget Health score.' },
      { label: 'Start broad', text: 'Start with 8–12 categories before getting granular. It\'s easier to split a category later than to merge many small ones.' },
      { label: 'Monthly amounts', text: 'Always enter amounts as MONTHLY, even if you pay quarterly or annually. Flow converts to your selected period view. Divide annual costs by 12.' },
      { label: 'Rollover', text: 'Enable the Rollover toggle on a variable category to carry underspend forward to next month — great for irregular expenses like car maintenance.' },
    ],
  },
  {
    id: 'accounts',
    emoji: '🏦',
    title: 'Accounts',
    tab: 'Accounts',
    zyanSetup: 'Apple Card, Chase Checking, Ally Checking, Ally Savings, Chase Roth IRA, Fidelity Roth IRA, Retirement',
    description:
      'Accounts represent your real financial accounts. You need at least one account before importing transactions — Flow needs to know which account each transaction belongs to.',
    tips: [
      { label: '4 account types', text: 'Checking (day-to-day), Savings (reserves), Credit Card (import statement CSVs here), Investment (brokerage/retirement). Each transaction import is linked to a specific account.' },
      { label: 'Credit cards', text: 'Add your credit cards as Credit Card accounts. When you import an Apple Card or Chase CSV, select the matching account during import.' },
      { label: 'Investment accounts', text: 'Add these too even if you don\'t import transactions — they\'re useful for your savings goals progress and overall net worth picture.' },
    ],
  },
  {
    id: 'transactions',
    emoji: '📥',
    title: 'Transactions',
    tab: 'Transactions',
    zyanSetup: '235 Apple Card transactions across 4 import batches · 10 auto-categorization rules',
    description:
      'Transactions bring your budget to life. Import a CSV from your bank or credit card to see real actual spending vs your planned budget. Then set up rules so future imports auto-categorize themselves.',
    tips: [
      { label: 'Export from Apple Card', text: 'Wallet app → Apple Card → ⋯ → Export Transactions. For Chase/Bank of America: log in online → Accounts → Download transactions → choose date range → CSV.' },
      { label: 'Import flow', text: 'Transactions tab → Import CSV → select your account → Flow previews and maps columns → confirm import. Duplicates are detected automatically.' },
      { label: 'Categorize & learn', text: 'After importing, yellow-dot transactions need a category. Assign them — Flow remembers the merchant pattern. Build rules (Transactions → Rules) for ones you\'ll see repeatedly.' },
      { label: 'Actuals', text: 'Once transactions are categorized, the Budget tab shows real Actual vs Planned numbers for each category.' },
    ],
  },
  {
    id: 'goals',
    emoji: '🎯',
    title: 'Savings Goals',
    tab: 'Targets',
    zyanSetup: '8 active goals: emergency fund, vacation, laptop, car buffer, investment targets',
    description:
      'Savings Goals let you define what you\'re working toward — with a target amount, an optional deadline, and contribution tracking. Flow tells you how much you need to save each month to hit your goal on time.',
    tips: [
      { label: 'Link to a budget category', text: 'Create a budget category (e.g., "Emergency Fund" → Type: Savings → $200/month) that matches your goal\'s monthly requirement. This ties your planned budget to your goal progress.' },
      { label: 'Log contributions', text: 'Every time you transfer money toward a goal, click "Add Contribution" in that goal\'s card and enter the amount. Your progress bar updates in real time.' },
      { label: 'Goal sets', text: 'Save a "Goal Set" snapshot to track how your goals have changed over time — useful at the start of each quarter or year.' },
    ],
  },
  {
    id: 'dashboard',
    emoji: '📈',
    title: 'Dashboard',
    tab: 'Dashboard',
    zyanSetup: 'Budget health, attention banner, insights panel, monthly review, AI assistant',
    description:
      'The Dashboard is your daily command center. Once income, budget, and transactions are set up, it gives you a complete financial picture at a glance — what needs attention, what\'s on track, and what to do next.',
    tips: [
      { label: 'Attention Needed banner', text: 'Shows when planned budget > income. This is the most important signal. Fix it by reducing category amounts in Budget, or correcting your salary in Income.' },
      { label: 'Budget Health', text: 'Tracks Planned vs Actual for all categories. Click "Over Budget" filter to see only problem categories. Green = on track, red = over.' },
      { label: 'Insights panel', text: 'Auto-generated: uncategorized transactions, categories near their limit, spending trends. These update as you add data.' },
      { label: 'Monthly Review', text: 'At month end: review what went well/poorly, mark as reviewed. Builds a historical record of your spending patterns.' },
    ],
  },
  {
    id: 'sync',
    emoji: '☁️',
    title: 'Cloud Sync & Backup',
    zyanSetup: 'Synced to Supabase · Auto-sync enabled · Local backup downloaded',
    description:
      'Flow stores everything locally by default. Cloud sync backs up all your data to Supabase so you never lose it and can access it from any device. Set it up once and forget about it.',
    tips: [
      { label: 'First sync', text: 'Click "Cloud" in the header → Test connection → once connected, click "Sync now". All your data pushes to the cloud.' },
      { label: 'Auto-sync', text: 'Enable auto-sync in the Cloud panel. Flow syncs 5 seconds after any change, and pauses automatically if it detects connection issues.' },
      { label: 'Backup file', text: 'Settings → Download Backup exports a local JSON file of all your data. Keep this as a manual safety net — store it in Google Drive or iCloud.' },
      { label: 'Schema Repair', text: 'If you see sync errors about missing tables, go to Settings → Repair database schema. This creates any missing Supabase tables automatically.' },
    ],
  },
]

// ── Chat component ──────────────────────────────────────────────────────────────
type ChatMsg = { role: 'user' | 'assistant'; content: string }

function GuideChat({ stepId }: { stepId: string }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [apiAvailable, setApiAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Reset chat when step changes
  useEffect(() => { setMsgs([]); setError(null) }, [stepId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, loading])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const question = text.trim()

    // Try static FAQ first if API availability unknown or unavailable
    if (apiAvailable === false) {
      const faqAnswer = Object.entries(STATIC_FAQ).find(([q]) =>
        question.toLowerCase().split(' ').some(w => w.length > 4 && q.toLowerCase().includes(w))
      )
      setMsgs(prev => [
        ...prev,
        { role: 'user', content: question },
        { role: 'assistant', content: faqAnswer ? faqAnswer[1] : 'I don\'t have a pre-written answer for that. Set up the ANTHROPIC_API_KEY in Vercel to enable AI-powered answers, or check the relevant tab in the app.' },
      ])
      setInput('')
      return
    }

    const history: ChatMsg[] = [...msgs, { role: 'user', content: question }]
    setMsgs(history)
    setInput('')
    setLoading(true)
    setError(null)

    const systemPrompt = `You are the built-in guide for Flow, a personal finance app. Answer concisely and practically in 2-4 sentences.

Flow sections: Income (salary, take-home rate, side income), Budget (categories by type: Fixed Bill/Variable/Savings/Investment, monthly amounts), Accounts (checking/savings/credit/investment), Transactions (CSV import, auto-categorization rules), Savings Goals (target + deadline + contributions), Dashboard (health banner, actuals vs planned, insights), Cloud (Supabase sync, auto-sync, backup).

Zyan's example: 17 categories, 7 accounts, 235 Apple Card transactions, 10 rules, 8 savings goals, ~82% take-home rate.

Be direct. If unsure about specific user data, say so and point to the relevant tab.`

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, systemOverride: systemPrompt }),
      })
      const data = await res.json() as Record<string, unknown>
      if (!res.ok) {
        const errMsg = String(data.error ?? 'Chat failed')
        if (errMsg.toLowerCase().includes('api_key') || errMsg.includes('not set') || res.status === 500) {
          setApiAvailable(false)
          // Retry with static FAQ
          const faqAnswer = Object.entries(STATIC_FAQ).find(([q]) =>
            question.toLowerCase().split(' ').some(w => w.length > 4 && q.toLowerCase().includes(w))
          )
          setMsgs([...msgs,
            { role: 'user', content: question },
            { role: 'assistant', content: '(AI not configured — using built-in answers)\n\n' + (faqAnswer ? faqAnswer[1] : 'No pre-written answer for that. Check the relevant app tab.') },
          ])
          setLoading(false)
          return
        }
        throw new Error(errMsg)
      }
      setApiAvailable(true)
      const reply = String((data as {content?: string; message?: string}).content ?? (data as {message?: string}).message ?? '')
      setMsgs([...history, { role: 'assistant', content: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setLoading(false)
    }
  }, [msgs, loading, apiAvailable])

  const quickQ = [
    'How do I export Apple Card transactions?',
    'What take-home rate should I use?',
    'Savings vs Investment category — what\'s the difference?',
    'How do I fix the "Attention Needed" banner?',
    'How do auto-categorization rules work?',
    'How do I add a savings goal?',
  ]

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
        Questions {apiAvailable === false ? '(built-in answers)' : '(AI-powered)'}
      </p>

      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quickQ.map(q => (
            <button key={q} onClick={() => send(q)}
              className="text-[11px] px-2 py-1 rounded-lg bg-slate-700/60 hover:bg-slate-700 border border-slate-600/40 text-slate-300 transition-colors text-left">
              {q}
            </button>
          ))}
        </div>
      )}

      {msgs.length > 0 && (
        <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
          {msgs.map((m, i) => (
            <div key={i} className={`text-xs rounded-lg px-2.5 py-1.5 leading-relaxed whitespace-pre-line ${
              m.role === 'user' ? 'bg-blue-900/40 text-blue-100 ml-8' : 'bg-slate-700/40 text-slate-300 mr-8'
            }`}>{m.content}</div>
          ))}
          {loading && <div className="text-xs text-slate-500 italic px-2.5">Thinking…</div>}
          {error && <div className="text-xs text-red-400 px-2.5">{error}</div>}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="flex gap-2">
        <input type="text" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send(input)}
          placeholder="Ask anything about setup…"
          className="flex-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-600 focus:border-blue-500 focus:outline-none text-slate-200 placeholder-slate-600" />
        <button onClick={() => send(input)} disabled={!input.trim() || loading}
          className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs text-white transition-colors flex-shrink-0">
          Ask
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
type Props = {
  onClose: () => void
  onNavigate: (tab: Tab) => void
}

export function OnboardingGuide({ onClose, onNavigate }: Props) {
  const [stepIdx, setStepIdx] = useState(0)
  const [panelExpanded, setPanelExpanded] = useState(true)
  const step = STEPS[stepIdx]
  const progress = ((stepIdx + 1) / STEPS.length) * 100
  const isLast = stepIdx === STEPS.length - 1

  // Navigate app tab when step changes
  useEffect(() => {
    if (step.tab) onNavigate(step.tab)
  }, [stepIdx])

  const goNext = () => {
    if (isLast) { onClose(); return }
    setStepIdx(i => i + 1)
  }
  const goPrev = () => setStepIdx(i => Math.max(0, i - 1))

  return (
    <>
      {/* ── Spotlight overlay — dims everything outside main content ── */}
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 40%, transparent 40%, rgba(15,23,42,0.65) 100%)' }}
        />
        {step.tab && (
          /* Glowing ring around the app content area */
          <div className="absolute left-3 right-3 top-[56px]"
            style={{ bottom: panelExpanded ? '280px' : '52px' }}
          >
            <div className="w-full h-full rounded-2xl"
              style={{ boxShadow: '0 0 0 2px rgba(99,179,237,0.5), 0 0 40px rgba(59,130,246,0.15)' }}
            />
          </div>
        )}
      </div>

      {/* ── Top bar: progress + step pills ── */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/60 px-4 pt-2 pb-0">
        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }} />
          </div>
          <span className="text-[10px] text-slate-500 flex-shrink-0">
            {stepIdx + 1} / {STEPS.length}
          </span>
          <button onClick={onClose}
            className="text-slate-500 hover:text-slate-200 text-lg leading-none flex-shrink-0 ml-1">
            ×
          </button>
        </div>
        {/* Step pills — scrollable */}
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-2">
          {STEPS.map((s, i) => (
            <button key={s.id} onClick={() => setStepIdx(i)}
              className={`flex-shrink-0 text-[10px] px-2.5 py-1 rounded-full border transition-colors whitespace-nowrap ${
                i === stepIdx
                  ? 'bg-blue-600 text-white border-blue-500'
                  : i < stepIdx
                  ? 'bg-emerald-900/40 text-emerald-400 border-emerald-700/40'
                  : 'bg-slate-800 text-slate-500 border-slate-700/40'
              }`}>
              {i < stepIdx ? '✓ ' : ''}{s.emoji} {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bottom guide panel ── */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 bg-slate-900/98 backdrop-blur-sm border-t-2 border-blue-500/40 rounded-t-2xl shadow-2xl transition-all duration-300 ${
        panelExpanded ? 'h-72' : 'h-14'
      }`}>
        {/* Drag handle + title + expand toggle */}
        <div className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
          onClick={() => setPanelExpanded(v => !v)}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{step.emoji}</span>
            <div>
              <p className="text-sm font-bold text-slate-100 leading-none">{step.title}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{step.zyanSetup}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {step.tab && !panelExpanded && (
              <button onClick={e => { e.stopPropagation(); step.tab && onNavigate(step.tab) }}
                className="text-[10px] px-2 py-1 rounded-md bg-slate-700 text-blue-300 hover:bg-slate-600 transition-colors">
                → {step.tab}
              </button>
            )}
            <span className="text-slate-500 text-xs">{panelExpanded ? '▼' : '▲'}</span>
          </div>
        </div>

        {/* Expanded content */}
        {panelExpanded && (
          <div className="px-4 overflow-y-auto" style={{ height: 'calc(100% - 56px)' }}>
            <div className="space-y-3 pb-3">
              <p className="text-xs text-slate-300 leading-relaxed">{step.description}</p>

              {/* Tips */}
              {step.tips.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  {step.tips.map(tip => (
                    <div key={tip.label} className="rounded-lg bg-slate-800/60 border border-slate-700/40 px-2.5 py-2">
                      <p className="text-[10px] font-semibold text-blue-300 mb-0.5">{tip.label}</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{tip.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* AI Chat */}
              <div className="border-t border-slate-700/60 pt-3">
                <GuideChat stepId={step.id} />
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between border-t border-slate-700/60 pt-3 pb-1">
                <button onClick={goPrev} disabled={stepIdx === 0}
                  className="px-4 py-2 rounded-lg text-xs border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-30 disabled:cursor-default transition-colors">
                  ← Back
                </button>
                <div className="flex gap-2">
                  {step.tab && (
                    <button onClick={() => step.tab && onNavigate(step.tab)}
                      className="px-3 py-2 rounded-lg text-xs border border-slate-700 text-blue-400 hover:bg-slate-800 transition-colors">
                      Open {step.tab} →
                    </button>
                  )}
                  <button onClick={goNext}
                    className="px-4 py-2 rounded-lg text-xs bg-blue-600 hover:bg-blue-500 text-white transition-colors font-medium">
                    {isLast ? '✓ Done' : 'Next →'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
