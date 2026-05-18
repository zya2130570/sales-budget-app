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


type ButtonTone = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'warning'
type ButtonSize = 'xs' | 'sm' | 'md'

const buttonToneClass: Record<ButtonTone, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white border border-blue-500/40',
  secondary: 'bg-slate-700 hover:bg-slate-600 text-slate-100 border border-slate-600/60',
  danger: 'bg-red-900/60 hover:bg-red-800 text-red-200 border border-red-700/50',
  ghost: 'bg-transparent hover:bg-slate-700/40 text-slate-400 hover:text-slate-200 border border-transparent',
  success: 'bg-emerald-700/70 hover:bg-emerald-600/70 text-emerald-100 border border-emerald-600/40',
  warning: 'bg-amber-700/60 hover:bg-amber-600/60 text-amber-100 border border-amber-600/40',
}

const buttonSizeClass: Record<ButtonSize, string> = {
  xs: 'px-2 py-0.5 text-xs rounded',
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-lg',
}

export function buttonClass({ tone = 'secondary', size = 'sm', className = '' }: { tone?: ButtonTone; size?: ButtonSize; className?: string } = {}) {
  return `${buttonSizeClass[size]} ${buttonToneClass[tone]} disabled:bg-slate-800 disabled:text-slate-500 disabled:border-slate-700 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1.5 ${className}`
}

export function Button({
  tone = 'secondary', size = 'sm', className = '', children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ButtonTone; size?: ButtonSize }) {
  return (
    <button {...props} className={buttonClass({ tone, size, className })}>
      {children}
    </button>
  )
}

export function SectionToggle({
  title, count, meta, open, onToggle, tone = 'slate', actions,
}: {
  title: React.ReactNode
  count?: number
  meta?: React.ReactNode
  open: boolean
  onToggle: () => void
  tone?: 'slate' | 'amber' | 'teal' | 'blue'
  actions?: React.ReactNode
}) {
  const toneClass = tone === 'amber' ? 'text-amber-300 bg-amber-500/25' : tone === 'teal' ? 'text-teal-300 bg-teal-500/25' : tone === 'blue' ? 'text-blue-300 bg-blue-500/25' : 'text-slate-300 bg-slate-600/40'
  return (
    <div className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-700/20 transition-colors">
      <button className="min-w-0 flex-1 flex items-center gap-2.5 flex-wrap text-left" onClick={onToggle}>
        {typeof count === 'number' && count > 0 && (
          <span className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-bold ${toneClass}`}>{count}</span>
        )}
        <span className="text-sm font-semibold text-slate-200">{title}</span>
        {meta && <span className="text-xs text-slate-500">{meta}</span>}
      </button>
      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        {actions}
        <button className="text-slate-500 text-xs px-1 py-1 rounded hover:text-slate-300" onClick={onToggle}>{open ? '▲' : '▼'}</button>
      </div>
    </div>
  )
}

export function EmptyState({ title, description, className = '' }: { title: string; description?: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-700/50 bg-slate-800/35 px-4 py-5 text-center ${className}`}>
      <p className="text-sm text-slate-400 font-medium">{title}</p>
      {description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}
    </div>
  )
}
