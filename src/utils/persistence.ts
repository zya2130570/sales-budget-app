import { STORAGE_KEYS } from './storageKeys'
import { loadFromStorage, loadRawFromStorage, saveRawToStorage, saveToStorage } from './storage'
import type { CategoryMemory } from './categoryMemory'

export function currentReviewMonth(): string {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`
}

export function loadBudgetActuals(): Record<string, string> {
  return loadFromStorage<Record<string, string>>(STORAGE_KEYS.budgetActuals, {})
}

export function saveBudgetActuals(actuals: Record<string, string>): void {
  saveToStorage(STORAGE_KEYS.budgetActuals, actuals)
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
