/**
 * workspace.ts — V17.3
 *
 * Namespaces localStorage keys per authenticated user so different accounts
 * on the same device/browser never share or see each other's data.
 *
 * Architecture:
 *  - Guest (not logged in): keys stored flat, e.g. "v42-cats"
 *  - Authenticated:         keys prefixed,  e.g. "ws:u:abc123:v42-cats"
 *
 * Initialization:
 *  1. workspace.init() is called at module load (in storage.ts import).
 *     It reads sessionStorage to restore the prefix from the last page load.
 *  2. workspace.set(userId) is called by useAuth when the user signs in.
 *     It persists the prefix to sessionStorage and reloads the page so all
 *     React state is reloaded from the correct namespace.
 *  3. workspace.clear() is called by useAuth on sign-out.
 *     It removes the sessionStorage entry, clears the flat guest keys so
 *     the guest namespace is empty after a logged-in session, then reloads.
 *
 * Migration:
 *  When a user first logs in on a device that has flat (guest) data,
 *  workspace.migrate(userId) copies all app keys to the namespaced prefix.
 *  After migration the flat keys are cleared so they don't leak back into
 *  guest mode on sign-out.
 */

const SESSION_UID_KEY = 'flow_ws_uid'
const WS_PREFIX = 'ws:u:'

/** All app-owned key prefixes that should be namespaced. */
const APP_KEY_PREFIXES = ['v42-', 'flow_']

let _prefix = ''        // '' = guest, 'ws:u:{id}:' = authenticated
let _currentUid: string | null = null

/** Returns the current workspace-prefixed key. */
export function wsKey(rawKey: string): string {
  return _prefix + rawKey
}

/** Returns the current active user ID, or null for guest. */
export function currentWorkspaceUid(): string | null {
  return _currentUid
}

/**
 * Returns true if a localStorage key belongs to the app (not a workspace key).
 */
function isAppFlatKey(key: string): boolean {
  if (key.startsWith(WS_PREFIX)) return false  // already namespaced
  return APP_KEY_PREFIXES.some(p => key.startsWith(p))
}

/**
 * Clears all flat (guest-namespace) app keys from localStorage.
 * Called after migration (so flat keys don't leak back to guest on sign-out)
 * and on sign-out (so the guest view is empty after an auth session ends).
 */
function clearFlatAppKeys(): void {
  try {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && isAppFlatKey(key)) toRemove.push(key)
    }
    for (const key of toRemove) {
      localStorage.removeItem(key)
    }
  } catch { /* private browsing */ }
}

/**
 * Called once at module load (via storage.ts import).
 * Restores the workspace prefix from sessionStorage so keys are correct
 * even before useAuth has resolved.
 */
export function initWorkspace(): void {
  try {
    const uid = sessionStorage.getItem(SESSION_UID_KEY)
    if (uid) {
      _prefix = `${WS_PREFIX}${uid}:`
      _currentUid = uid
    }
  } catch { /* private browsing / Safari restrictions */ }
}

/**
 * Switch to the authenticated workspace for userId.
 * Runs migration (copies flat keys to namespaced ones on first login),
 * clears the flat keys so they don't bleed back to guest mode,
 * then reloads the page so React state is initialized from the correct namespace.
 */
export function activateUserWorkspace(userId: string): void {
  try {
    const alreadyActive = sessionStorage.getItem(SESSION_UID_KEY) === userId
    if (alreadyActive) return   // already in this workspace, no reload needed

    // Run migration before switching prefix so source flat keys still exist
    migrateToWorkspace(userId)

    // After migration, clear flat keys so they don't pollute guest mode on sign-out
    clearFlatAppKeys()

    sessionStorage.setItem(SESSION_UID_KEY, userId)
    window.location.reload()
  } catch { /* ignore */ }
}

/**
 * Switch back to guest workspace.
 * Clears flat app keys first (removing any remnants from before the user
 * signed in or from a previous session), then reloads so React reads the
 * now-empty guest namespace — giving a clean signed-out state.
 */
export function clearUserWorkspace(): void {
  try {
    if (!sessionStorage.getItem(SESSION_UID_KEY)) return  // already guest

    // Wipe flat keys so guest view is blank after sign-out
    clearFlatAppKeys()

    sessionStorage.removeItem(SESSION_UID_KEY)
    window.location.reload()
  } catch { /* ignore */ }
}

/**
 * One-time migration: copies all app keys from flat namespace to user namespace.
 * Idempotent — safe to call multiple times, only runs once per userId.
 */
export function migrateToWorkspace(userId: string): void {
  try {
    const migrationFlag = `${WS_PREFIX}${userId}:_migrated`
    if (localStorage.getItem(migrationFlag)) return   // already done

    let copied = 0
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key) continue
      // Only migrate flat app-owned keys, skip any already-namespaced keys
      if (isAppFlatKey(key)) {
        const value = localStorage.getItem(key)
        if (value !== null) {
          const destKey = `${WS_PREFIX}${userId}:${key}`
          // Don't overwrite if user already has data in the namespace
          if (localStorage.getItem(destKey) === null) {
            localStorage.setItem(destKey, value)
            copied++
          }
        }
      }
    }

    localStorage.setItem(migrationFlag, String(copied))
  } catch { /* ignore */ }
}

// Initialize immediately on module load
initWorkspace()
