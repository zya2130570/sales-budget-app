import type { Period } from '../types'

export const currency = (n: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

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
