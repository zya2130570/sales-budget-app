// ── Category Memory ────────────────────────────────────────────────────────────
// Persists a normalized-merchant → categoryId map to localStorage so that
// previously assigned categories are suggested automatically on future imports.

export type CategoryMemory = Record<string, string>

export const CATEGORY_MEMORY_KEY = 'flow_category_memory'

export function loadCategoryMemory(): CategoryMemory {
  try {
    const s = localStorage.getItem(CATEGORY_MEMORY_KEY)
    return s ? (JSON.parse(s) as CategoryMemory) : {}
  } catch {
    return {}
  }
}

export function saveCategoryMemory(mem: CategoryMemory): void {
  try {
    localStorage.setItem(CATEGORY_MEMORY_KEY, JSON.stringify(mem))
  } catch { /* quota exceeded or private-browsing — silently ignore */ }
}
