import { useState, useRef, useEffect } from 'react'
import type { ChatMessage, AIAssistantStatus } from '../hooks/useAIAssistant'
const SUGGESTED = ['Can I afford a $500 expense right now?','Why is my budget over my income?','How much should I save per month for my goals?','What should I cut to get back on track?','When will I hit my biggest savings goal?']
function Bubble({ msg }: { msg: ChatMessage }) {
  const u = msg.role === 'user'
  return (
    <div className={`flex ${u ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${u ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-700/80 text-slate-200 rounded-bl-sm border border-slate-600/50'}`}>
        {msg.content.split('\n').map((l, i, a) => <span key={i}>{l}{i < a.length - 1 && <br />}</span>)}
      </div>
    </div>
  )
}
export function AIAssistantPanel({ messages, status, error, onSend, onClear }: { messages: ChatMessage[]; status: AIAssistantStatus; error: string | null; onSend: (t: string) => void; onClear: () => void }) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages])
  const send = () => { if (!input.trim() || status === 'loading') return; onSend(input.trim()); setInput('') }
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-base">✦</span>
          <h2 className="text-sm font-semibold text-slate-100">Financial Assistant</h2>
          <span className="text-[10px] text-slate-500 bg-slate-700 px-1.5 py-0.5 rounded">AI</span>
        </div>
        {messages.length > 0 && <button onClick={onClear} className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors">Clear</button>}
      </div>
      <div className="px-4 py-3 space-y-3 min-h-[80px] max-h-72 overflow-y-auto">
        {messages.length === 0 ? (
          <div>
            <p className="text-xs text-slate-500 mb-3">Ask anything about your finances — answers use your real numbers.</p>
            <div className="flex flex-wrap gap-2">{SUGGESTED.map(q => <button key={q} onClick={() => onSend(q)} disabled={status==='loading'} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors text-left border border-slate-600/50">{q}</button>)}</div>
          </div>
        ) : (<>{messages.map((m, i) => <Bubble key={i} msg={m} />)}{status==='loading' && <div className="flex justify-start"><div className="bg-slate-700/80 border border-slate-600/50 rounded-2xl rounded-bl-sm px-3.5 py-2.5"><span className="flex gap-1">{[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{animationDelay:`${d}ms`}} />)}</span></div></div>}</>)}
        {error && (
          error.toLowerCase().includes('not configured') || error.toLowerCase().includes('no ai provider')
            ? (
              <div className="rounded-xl border border-amber-700/50 bg-amber-950/20 p-3">
                <p className="text-xs font-semibold text-amber-200 mb-1">AI assistant needs a free API key</p>
                <p className="text-xs text-amber-300/80 leading-relaxed mb-2">
                  Add <code className="bg-slate-700 px-1 rounded">GEMINI_API_KEY</code> to Vercel env vars (free at aistudio.google.com), set for Production + Preview, then redeploy.
                </p>
              </div>
            )
            : error.toLowerCase().includes('gemini api error') || error.toLowerCase().includes('isgemini') || error.toLowerCase().includes('quota') || error.toLowerCase().includes('api key') || error.toLowerCase().includes('permission') || error.toLowerCase().includes('returned empty')
            ? (
              <div className="rounded-xl border border-orange-700/50 bg-orange-950/20 p-3">
                <p className="text-xs font-semibold text-orange-200 mb-1">Gemini API error — key found but rejected</p>
                <p className="text-xs text-orange-300/80 leading-relaxed font-mono break-all">{error}</p>
                <p className="text-xs text-orange-400/70 mt-2">This usually means the key is valid but the model is unavailable or quota is hit. Try regenerating your key at aistudio.google.com.</p>
              </div>
            )
            : <p className="text-xs text-red-300 bg-red-950/30 border border-red-700/40 rounded-lg px-3 py-2">{error}</p>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="px-4 pb-3 pt-1 border-t border-slate-700/60">
        <div className="flex gap-2 items-end">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()} }} disabled={status==='loading'} rows={1} placeholder="Ask about your finances… (Enter to send)" className="flex-1 resize-none rounded-xl bg-slate-700 border border-slate-600 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 disabled:opacity-50" />
          <button onClick={send} disabled={!input.trim()||status==='loading'} className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">Send</button>
        </div>
        <p className="text-[10px] text-slate-600 mt-1">Your financial data is sent to the AI with each message. Free with GEMINI_API_KEY (aistudio.google.com). Set for Production + Preview in Vercel.</p>
      </div>
    </div>
  )
}
