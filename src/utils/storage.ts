import type { Tab, Category, SavedBudget, SavedScenarioSet, Target, SavedTargetSet } from '../types'

// ─── Storage key constants ────────────────────────────────────────────────────

export const KEYS = {
  tab:        'v42-tab',
  cats:       'v42-cats',
  budgets:    'v42-budgets',
  scenarios:  'v42-scenarios',
  targets:    'v42-targets',
  targetSets: 'v42-target-sets',
} as const

// ─── Valid tab names (used for Tab validation on load) ────────────────────────

const VALID_TABS: Tab[] = ['Dashboard', 'Income', 'Budget', 'Scenarios', 'Targets']

// ─── Low-level safe helpers ───────────────────────────────────────────────────

export function storageGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function storageSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Silently ignore (e.g. private browsing quota exceeded)
  }
}

export function storageSetRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Silently ignore
  }
}

// ─── Typed load helpers ───────────────────────────────────────────────────────

export function loadTab(): Tab | null {
  try {
    const raw = localStorage.getItem(KEYS.tab)
    if (raw === null) return null
    if ((VALID_TABS as string[]).includes(raw)) return raw as Tab
    return null
  } catch {
    return null
  }
}

export function loadCategories(): Category[] | null {
  return storageGet<Category[]>(KEYS.cats)
}

export function loadSavedBudgets(): SavedBudget[] | null {
  return storageGet<SavedBudget[]>(KEYS.budgets)
}

export function loadSavedScenarios(): SavedScenarioSet[] | null {
  return storageGet<SavedScenarioSet[]>(KEYS.scenarios)
}

export function loadTargets(): Target[] | null {
  return storageGet<Target[]>(KEYS.targets)
}

export function loadSavedTargetSets(): SavedTargetSet[] | null {
  return storageGet<SavedTargetSet[]>(KEYS.targetSets)
}

// ─── Typed save helpers ───────────────────────────────────────────────────────

export function saveTab(tab: Tab): void {
  storageSetRaw(KEYS.tab, tab)
}

export function saveCategories(categories: Category[]): void {
  storageSet(KEYS.cats, categories)
}

export function saveSavedBudgets(budgets: SavedBudget[]): void {
  storageSet(KEYS.budgets, budgets)
}

export function saveSavedScenarios(scenarios: SavedScenarioSet[]): void {
  storageSet(KEYS.scenarios, scenarios)
}

export function saveTargets(targets: Target[]): void {
  storageSet(KEYS.targets, targets)
}

export function saveSavedTargetSets(sets: SavedTargetSet[]): void {
  storageSet(KEYS.targetSets, sets)
}
