// ── Shared UI Primitives ──────────────────────────────────────────────────────
// V47: refined for premium feel — Linear/Arc/Raycast direction
// All cards/metrics/rows now use design tokens + tabular numbers for currency
import React from 'react'

export function Card({
  title, children, className = '', style, headerAction, noHover = false,
}: {
  title: React.ReactNode; children: React.ReactNode; className?: string
  style?: React.CSSProperties; headerAction?: React.ReactNode; noHover?: boolean
}) {
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border)',
        ...style,
      }}
      className={`rounded-2xl border p-5 md:p-6 transition-premium elevation-1 ${noHover ? '' : 'hover:border-[var(--border-strong)]'} ${className}`}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[15px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</h2>
        {headerAction}
      </div>
      {children}
    </div>
  )
}

export function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--accent)' : 'var(--bg-card)',
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        color: active ? 'white' : 'var(--text-secondary)',
      }}
      className="px-3 py-1.5 rounded-lg text-sm border transition-premium hover:[border-color:var(--border-strong)]"
    >
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
  const toneColor =
    tone === 'good'   ? 'var(--green)' :
    tone === 'warn'   ? 'var(--amber)' :
    tone === 'risk'   ? '#FB923C' :
    tone === 'danger' ? 'var(--red)' :
                        'var(--text-primary)'

  return (
    <div
      style={{
        background: featured ? 'var(--accent-bg)' : 'var(--bg-card)',
        borderColor: featured ? 'var(--accent-border)' : 'var(--border)',
        boxShadow: glow ? '0 0 22px rgba(248,113,113,0.30), inset 0 0 18px rgba(248,113,113,0.10)' : undefined,
      }}
      className={`rounded-xl border p-4 transition-premium elevation-1 ${glow ? '!border-[rgba(248,113,113,0.6)]' : ''}`}
    >
      <div className="text-eyebrow mb-2">{title}</div>
      <div className="flex items-baseline justify-between gap-2">
        <div
          className="text-display-md font-num"
          style={{ color: featured ? 'var(--accent-text)' : toneColor }}
        >
          {value}
        </div>
        {featured && (
          <div
            className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: 'var(--accent-bg-strong)', color: 'var(--accent-text)' }}
          >
            Primary
          </div>
        )}
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
  const toneColor =
    tone === 'good'   ? 'var(--green)' :
    tone === 'warn'   ? 'var(--amber)' :
    tone === 'risk'   ? '#FB923C' :
    tone === 'danger' ? 'var(--red)' :
                        'var(--text-primary)'

  return (
    <div
      style={{
        background: 'var(--bg-card)',
        borderColor: glow ? 'rgba(248,113,113,0.6)' : 'var(--border)',
        boxShadow: glow ? '0 0 22px rgba(248,113,113,0.30), inset 0 0 18px rgba(248,113,113,0.10)' : undefined,
      }}
      className={`rounded-xl border p-4 elevation-1`}
    >
      <div className="text-eyebrow mb-2">{title}</div>
      <div className={`font-num text-display-sm ${className}`} style={{ color: toneColor }}>{value}</div>
    </div>
  )
}

export function ActionCard({
  title, description, onClick, tone = 'neutral',
}: {
  title: string; description: string; onClick: () => void; tone?: 'neutral' | 'warn' | 'good'
}) {
  const dotColor = tone === 'warn' ? 'var(--amber)' : tone === 'good' ? 'var(--green)' : 'var(--text-faint)'
  return (
    <button
      onClick={onClick}
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      className="group text-left rounded-xl border p-4 transition-premium hover:[background:var(--bg-card-hover)] hover:[border-color:var(--border-strong)] w-full elevation-1"
    >
      <div className="flex items-center gap-2 mb-1.5">
        {tone !== 'neutral' && <span className="shrink-0 h-1.5 w-1.5 rounded-full" style={{ background: dotColor }} />}
        <span className="text-[13px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</span>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{description}</p>
    </button>
  )
}

export function Row({ l, v, valueClass = '' }: { l: string; v: string; valueClass?: string }) {
  return (
    <div
      className="py-2 border-b last:border-b-0 flex justify-between items-center gap-2 text-sm"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <span style={{ color: 'var(--text-secondary)' }}>{l}</span>
      <span className={`font-num font-medium text-right ${valueClass}`} style={{ color: valueClass ? undefined : 'var(--text-primary)' }}>{v}</span>
    </div>
  )
}


type ButtonTone = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'warning'
type ButtonSize = 'xs' | 'sm' | 'md'

const buttonToneClass: Record<ButtonTone, string> = {
  primary:   'bg-[var(--accent)] hover:bg-[var(--accent-hover)] active:bg-[var(--accent-active)] text-white border border-transparent',
  secondary: 'bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] text-[var(--text-primary)] border border-[var(--border)] hover:border-[var(--border-strong)]',
  danger:    'bg-red-950/40 hover:bg-red-900/50 text-red-300 border border-red-800/40',
  ghost:     'bg-transparent hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-transparent',
  success:   'bg-emerald-900/40 hover:bg-emerald-800/50 text-emerald-300 border border-emerald-700/40',
  warning:   'bg-amber-900/40 hover:bg-amber-800/50 text-amber-300 border border-amber-700/40',
}

const buttonSizeClass: Record<ButtonSize, string> = {
  xs: 'px-2 py-0.5 text-xs rounded',
  sm: 'px-3 py-1.5 text-[13px] font-medium rounded-lg',
  md: 'px-4 py-2 text-[13px] font-medium rounded-lg',
}

export function buttonClass({ tone = 'secondary', size = 'sm', className = '' }: { tone?: ButtonTone; size?: ButtonSize; className?: string } = {}) {
  return `${buttonSizeClass[size]} ${buttonToneClass[tone]} disabled:opacity-40 disabled:cursor-not-allowed transition-premium inline-flex items-center justify-center gap-1.5 ${className}`
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
  const toneStyle =
    tone === 'amber' ? { color: 'var(--amber)', background: 'var(--amber-bg)' } :
    tone === 'teal'  ? { color: '#5EEAD4', background: 'rgba(94,234,212,0.10)' } :
    tone === 'blue'  ? { color: 'var(--accent-text)', background: 'var(--accent-bg)' } :
                       { color: 'var(--text-secondary)', background: 'var(--bg-hover)' }
  return (
    <div className="w-full flex items-center justify-between gap-3 px-4 py-3 transition-premium hover:[background:var(--bg-hover)]">
      <button className="min-w-0 flex-1 flex items-center gap-2.5 flex-wrap text-left" onClick={onToggle}>
        {typeof count === 'number' && count > 0 && (
          <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-bold tnum" style={toneStyle}>{count}</span>
        )}
        <span className="text-[13px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>{title}</span>
        {meta && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{meta}</span>}
      </button>
      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
        {actions}
        <button className="text-xs px-1 py-1 rounded transition-premium" style={{ color: 'var(--text-muted)' }} onClick={onToggle}>{open ? '▲' : '▼'}</button>
      </div>
    </div>
  )
}

export function EmptyState({ title, description, className = '' }: { title: string; description?: string; className?: string }) {
  return (
    <div
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      className={`rounded-xl border px-5 py-6 text-center elevation-1 ${className}`}
    >
      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</p>
      {description && <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{description}</p>}
    </div>
  )
}
