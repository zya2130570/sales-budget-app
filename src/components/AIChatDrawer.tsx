/**
 * AIChatDrawer.tsx — V33
 * Persistent AI chat accessible from the sidebar on any page.
 * Slides in from the right as a fixed drawer. Escape or click backdrop to close.
 */
import { useState, useRef, useEffect } from 'react'
import { useAIAssistant } from '../hooks/useAIAssistant'

type Props = {
  open: boolean
  onClose: () => void
}

export function AIChatDrawer({ open, onClose }: Props) {
  const { messages, status, error, sendMessage, clearHistory } = useAIAssistant()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [messages])

  if (!open) return null

  const send = () => {
    if (!input.trim() || status === 'loading') return
    sendMessage(input.trim(), {})
    setInput('')
  }

  const quickQ = [
    'Can I afford a $500 expense right now?',
    'Why is my budget over my income?',
    'How much should I save per month for my goals?',
    'What should I cut to get back on track?',
  ]

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed top-0 right-0 bottom-0 z-[80] w-full max-w-md flex flex-col shadow-2xl"
        style={{ background: '#0D0D11', borderLeft: '1px solid rgba(255,255,255,0.07)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2">
            <span className="text-base">✦</span>
            <span className="text-sm font-semibold text-slate-100">Financial Assistant</span>
            <span className="text-[10px] bg-slate-700 text-slate-400 px-1.5 py-0.5 rounded">AI</span>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button onClick={clearHistory} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors">
                Clear
              </button>
            )}
            <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors text-lg leading-none">
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-0">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Ask anything about your finances — answers use your real numbers.</p>
              <div className="grid grid-cols-1 gap-2">
                {quickQ.map(q => (
                  <button key={q} onClick={() => { sendMessage(q, {}); }}
                    className="text-left text-[12px] px-3 py-2.5 rounded-xl border border-slate-700/60 bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition-all leading-snug">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`text-sm rounded-2xl px-4 py-3 leading-relaxed whitespace-pre-line ${
              m.role === 'user'
                ? 'bg-blue-600/20 border border-blue-600/25 text-blue-100 ml-6'
                : 'bg-slate-800/80 border border-slate-700/40 text-slate-200 mr-6'
            }`}>
              {m.content}
            </div>
          ))}
          {status === 'loading' && (
            <div className="text-xs text-slate-600 italic px-4 animate-pulse">Thinking…</div>
          )}
          {error && (
            <div className="text-xs px-4 py-3 rounded-xl border border-red-700/40 bg-red-950/20 text-red-300">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="Ask about your finances…"
              className="flex-1 text-sm px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700/60 focus:border-blue-500/60 focus:outline-none text-slate-200 placeholder-slate-600 transition-colors"
            />
            <button onClick={send} disabled={!input.trim() || status === 'loading'}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-sm text-white transition-all font-medium flex-shrink-0">
              Send
            </button>
          </div>
          <p className="text-[10px] text-slate-700 mt-2">
            Free with GEMINI_API_KEY (aistudio.google.com). Set in Vercel env vars.
          </p>
        </div>
      </div>
    </>
  )
}
