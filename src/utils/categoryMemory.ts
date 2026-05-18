// Persists a normalized-merchant → categoryId map to localStorage so that
// previously assigned categories are suggested automatically on future imports.

import { loadCategoryMemoryFromStorage, saveCategoryMemoryToStorage } from './persistence'

export type CategoryMemory = Record<string, string>

export function loadCategoryMemory(): CategoryMemory {
  return loadCategoryMemoryFromStorage()
}

export function saveCategoryMemory(mem: CategoryMemory): void {
  saveCategoryMemoryToStorage(mem)
}
