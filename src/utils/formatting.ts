import type { Period } from '../types'

export const currency = (n: number): string => {
  // V22 FIX: Intl.NumberFormat was rendering $ as a period in some Chromium builds.
  // Manual formatting always produces $X,XXX.XX reliably.
  if (!isFinite(n)) return '$0.00'
  const abs = Math.abs(n)
  const parts = abs.toFixed(2).split('.')
  const intFormatted = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return (n < 0 ? '-$' : '$') + intFormatted + '.' + parts[1]
}

export const labelPeriod = (p: Period): string =>
  p === 'bi-weekly' ? 'Bi-weekly' : p[0].toUpperCase() + p.slice(1)

export const formatDate = (dateStr: string | undefined | null): string => {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return dateStr
  // Format as "Sep 22, 2026"
  const mon = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getDate()
  const yr = d.getFullYear()
  return `${mon} ${day}, ${yr}`
}
