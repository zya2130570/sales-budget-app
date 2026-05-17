// ── Shared UI Primitives ───────────────────────────────────────────────────────
// Extracted from App.tsx in V10.3 so transaction/review components can import them.
import React from 'react'

export function Card({
  title, children, className = '', style, headerAction, noHover = false,
}: {
  title: React.ReactNode; children: React.ReactNode; className?: string
  style?: React.CSSProperties; headerAction?: React.ReactNode; noHover?: boolean
}) {
  return (
    <div style={style} className={`rounded-2xl border border-slate-700 bg-slate-800/80 shadow-lg p-4 md:p-5 transition-all duration-200 ${noHover ? '' : 'hover:-translate-y-0.5'} ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {headerAction}
      </div>
      {children}
    </div>
  )
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`px-3 py-1.5 rounded text-sm ${active ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'} transition`}>
      {children}
    </button>
  )
}

export function Metric({
  title, value, tone = 'neutral', featured = false, glow = false,
}: {
  title: string; value: string
  tone?: 'neutral' | 'good' | 'warn' | 'risk' | 'danger'; featured?: boolean; glow?: boolean
}) {
  const c = tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-yellow-300' : tone === 'risk' ? 'text-orange-300' : tone === 'danger' ? 'text-red-300' : 'text-slate-100'
  return (
    <div
      className={`rounded-xl border p-3 ${featured ? 'border-sky-200/70 bg-gradient-to-br from-slate-700 via-slate-700/95 to-slate-600/95 shadow-[0_0_24px_rgba(125,211,252,0.28)]' : 'border-slate-700 bg-slate-800'} ${glow ? 'shadow-[0_0_22px_rgba(248,113,113,0.36)] border-red-400/85 bg-gradient-to-br from-red-800/45 via-red-900/38 to-red-950/34 ring-1 ring-red-300/40' : ''}`}
      style={glow ? { boxShadow: 'inset 0 0 20px rgba(248,113,113,0.18), 0 0 22px rgba(248,113,113,0.36)' } : undefined}
    >
      <div className="text-xs text-slate-400 mb-1">{title}</div>
      <div className="flex items-center justify-between gap-2">
        <div className={`${featured ? 'text-xl text-sky-100' : `text-xl ${c}`} font-bold`}>{value}</div>
        {featured && <div className="inline-flex rounded-full border border-sky-200/40 bg-slate-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-100">Primary Take-Home</div>}
      </div>
    </div>
  )
}

export function Info({
  title, value, className = '', tone = 'neutral', glow = false,
}: {
  title: string; value: string; className?: string
  tone?: 'neutral' | 'good' | 'warn' | 'risk' | 'danger'; glow?: boolean
}) {
  const tc = tone === 'good' ? 'text-green-400' : tone === 'warn' ? 'text-yellow-300' : tone === 'risk' ? 'text-orange-300' : tone === 'danger' ? 'text-red-300' : 'text-slate-100'
  return (
    <div
      className={`rounded-xl border border-slate-700 bg-slate-800 p-3 ${glow ? 'shadow-[0_0_22px_rgba(248,113,113,0.34)] border-red-400/85 bg-gradient-to-br from-red-800/45 via-red-900/38 to-red-950/34 ring-1 ring-red-300/35' : ''}`}
      style={glow ? { boxShadow: 'inset 0 0 18px rgba(248,113,113,0.17), 0 0 22px rgba(248,113,113,0.34)' } : undefined}
    >
      <div className="text-xs text-slate-400 mb-1">{title}</div>
      <div className={`font-semibold ${tc} ${className}`}>{value}</div>
    </div>
  )
}

export function ActionCard({
  title, description, onClick, tone = 'neutral',
}: {
  title: string; description: string; onClick: () => void; tone?: 'neutral' | 'warn' | 'good'
}) {
  const accent = tone === 'warn' ? 'border-yellow-500/40 hover:border-yellow-400/60' : tone === 'good' ? 'border-green-500/40 hover:border-green-400/60' : 'border-slate-600/60 hover:border-slate-500/80'
  const dot    = tone === 'warn' ? 'bg-yellow-400' : tone === 'good' ? 'bg-green-400' : 'bg-slate-500'
  return (
    <button
      onClick={onClick}
      className={`group text-left rounded-xl border ${accent} bg-slate-800/70 hover:bg-slate-700/80 p-3 transition-all duration-200 hover:-translate-y-0.5 shadow-sm w-full`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {tone !== 'neutral' && <span className={`shrink-0 h-1.5 w-1.5 rounded-full ${dot}`} />}
        <span className="text-sm font-semibold text-slate-100 group-hover:text-white transition-colors">{title}</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
    </button>
  )
}

export function Row({ l, v, valueClass = 'text-slate-100' }: { l: string; v: string; valueClass?: string }) {
  return (
    <div className="py-1.5 border-b border-slate-700 last:border-b-0 flex justify-between gap-2 text-sm">
      <span className="text-slate-400 shrink-0">{l}</span>
      <span className={`font-medium text-right ${valueClass}`}>{v}</span>
    </div>
  )
}
