import { STORAGE_KEYS } from './storageKeys'
import { loadFromStorage, loadRawFromStorage, saveRawToStorage, saveToStorage } from './storage'
import type { CategoryMemory } from './categoryMemory'
import type { BudgetActualsEnvelope, MonthlyReview } from '../types'
import type { ManualRecurringItem } from './forecastMath'

export function currentReviewMonth(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

const isRecord = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === 'object' && !Array.isArray(v))

export function actualsPeriodKey(period: string, periodStart?: string, periodEnd?: string): string {
  return [period, periodStart ?? 'unknown-start', periodEnd ?? 'unknown-end'].join(':')
}

function loadActualsEnvelope(): BudgetActualsEnvelope {
  const raw = loadFromStorage<unknown>(STORAGE_KEYS.budgetActuals, {})

  if (isRecord(raw) && raw.version === 2 && isRecord(raw.actualsByPeriod)) {
    return raw as BudgetActualsEnvelope
  }

  // Legacy shape was flat: Record<categoryId, string>. Keep it under a legacy key
  // so old data is not lost, but new writes are period-aware.
  const legacyFlat: Record<string, string> = {}
  if (isRecord(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') legacyFlat[k] = v
    }
  }

  return {
    version: 2,
    lastPeriodKey: 'legacy',
    actualsByPeriod: Object.keys(legacyFlat).length ? { legacy: legacyFlat } : {},
  }
}

export function loadBudgetActuals(): Record<string, string> {
  const envelope = loadActualsEnvelope()
  const key = envelope.lastPeriodKey ?? 'legacy'
  return envelope.actualsByPeriod[key] ?? envelope.actualsByPeriod.legacy ?? {}
}

export function loadBudgetActualsForPeriod(periodKey: string): Record<string, string> {
  const envelope = loadActualsEnvelope()
  return envelope.actualsByPeriod[periodKey] ?? {}
}

export function loadAllBudgetActualsByPeriod(): Record<string, Record<string, string>> {
  return loadActualsEnvelope().actualsByPeriod
}

export function saveBudgetActuals(actuals: Record<string, string>): void {
  const envelope = loadActualsEnvelope()
  const key = envelope.lastPeriodKey ?? 'legacy'
  envelope.actualsByPeriod[key] = actuals
  envelope.lastPeriodKey = key
  saveToStorage(STORAGE_KEYS.budgetActuals, envelope)
}

export function saveBudgetActualsForPeriod(periodKey: string, actuals: Record<string, string>): void {
  const envelope = loadActualsEnvelope()
  envelope.actualsByPeriod[periodKey] = actuals
  envelope.lastPeriodKey = periodKey
  saveToStorage(STORAGE_KEYS.budgetActuals, envelope)
}

export function loadScenarioNotes(): Record<string, string> {
  return loadFromStorage<Record<string, string>>(STORAGE_KEYS.scenarioNotes, {})
}

export function saveScenarioNotes(notes: Record<string, string>): void {
  saveToStorage(STORAGE_KEYS.scenarioNotes, notes)
}

export function loadReviewMonth(): string {
  return loadRawFromStorage(STORAGE_KEYS.reviewMonth, currentReviewMonth())
}

export function saveReviewMonth(month: string): void {
  saveRawToStorage(STORAGE_KEYS.reviewMonth, month)
}

export function loadMonthlyNotes(): Record<string, string> {
  return loadFromStorage<Record<string, string>>(STORAGE_KEYS.monthlyNotes, {})
}

export function saveMonthlyNotes(notes: Record<string, string>): void {
  saveToStorage(STORAGE_KEYS.monthlyNotes, notes)
}

export function loadReviewedMonths(): Record<string, string> {
  return loadFromStorage<Record<string, string>>(STORAGE_KEYS.reviewedMonths, {})
}

export function saveReviewedMonths(months: Record<string, string>): void {
  saveToStorage(STORAGE_KEYS.reviewedMonths, months)
}

export function loadCategoryMemoryFromStorage(): CategoryMemory {
  return loadFromStorage<CategoryMemory>(STORAGE_KEYS.categoryMemory, {})
}

export function saveCategoryMemoryToStorage(mem: CategoryMemory): void {
  saveToStorage(STORAGE_KEYS.categoryMemory, mem)
}

export function loadMonthlyReviews(): MonthlyReview[] {
  const notes = loadMonthlyNotes()
  const reviewed = loadReviewedMonths()
  return [...new Set([...Object.keys(notes), ...Object.keys(reviewed)])]
    .sort()
    .map(month => ({
      month,
      notes: notes[month] ?? '',
      reviewedAt: reviewed[month],
      status: reviewed[month] ? 'reviewed' : 'draft',
    }))
}

export function saveMonthlyReview(review: MonthlyReview): void {
  const notes = loadMonthlyNotes()
  const reviewed = loadReviewedMonths()
  saveMonthlyNotes({ ...notes, [review.month]: review.notes })
  if (review.reviewedAt) saveReviewedMonths({ ...reviewed, [review.month]: review.reviewedAt })
}

export function loadManualRecurringItems(): ManualRecurringItem[] {
  return loadFromStorage<ManualRecurringItem[]>(STORAGE_KEYS.recurringState, [])
}

export function saveManualRecurringItems(items: ManualRecurringItem[]): void {
  saveToStorage(STORAGE_KEYS.recurringState, items)
}
