import type { PersonalPreloadData } from './personalPreloadData'

export const ZYAN_CUSTOM_PRELOAD_KEY = 'flow_zyan_custom_preload_v1'

export function loadZyanCustomPreload(): PersonalPreloadData | null {
  try {
    const raw = localStorage.getItem(ZYAN_CUSTOM_PRELOAD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersonalPreloadData
    if (!parsed || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.categories)) return null
    return parsed
  } catch {
    return null
  }
}

export function saveZyanCustomPreload(data: PersonalPreloadData) {
  localStorage.setItem(ZYAN_CUSTOM_PRELOAD_KEY, JSON.stringify(data))
}

export function clearZyanCustomPreload() {
  localStorage.removeItem(ZYAN_CUSTOM_PRELOAD_KEY)
}

export function hasZyanCustomPreload() {
  return !!loadZyanCustomPreload()
}
