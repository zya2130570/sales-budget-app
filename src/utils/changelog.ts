export type VersionEntry = {
  version: string
  date: string
  what: string[]
  test: string[]
}

export const CHANGELOG: VersionEntry[] = [
  {
    version: 'V15',
    date: 'May 2026',
    what: [
      'Delete propagation — deleted records now marked soft-deleted in Supabase on next sync',
      'Monthly reviews cloud sync — review notes and "mark reviewed" status backed up',
      'Budget actuals tagged with current period — prevents cross-device period confusion',
      'True auto-sync — toggle now actually fires 5s after any data change',
      'Merge Safe Data wired — fills local gaps from cloud without touching transactions',
    ],
    test: [
      'Delete a transaction → Sync now → check Supabase transactions table → that row should have deleted_at set',
      'Write a monthly review note → Sync now → check Supabase monthly_reviews table',
      'Toggle Auto-sync ON → edit a category name → wait 5 seconds → status should change to "Syncing…" automatically',
      'Cloud sync readiness → Compare → Merge Safe Data → should report what was added or say "already in sync"',
    ],
  },
  {
    version: 'V14',
    date: 'May 2026',
    what: [
      'AI Financial Assistant — ask natural-language questions using your real data',
      'Version changelog popup — click any version badge to open this',
      'Insights: budget-over-income warning now shows even with no transactions',
    ],
    test: [
      'Dashboard → "Financial Assistant" panel → ask "Why is my budget over my income?"',
      'Click the V15 badge in Cloud sync readiness to open this changelog',
      'Dashboard Insights panel should show a red warning if planned budget > net income',
    ],
  },
  {
    version: 'V13',
    date: 'May 2026',
    what: [
      'Spending Insights panel on Dashboard — prioritized, numbered callouts',
      'Monthly Review prose summary — auto-generated paragraph above the metrics',
    ],
    test: [
      'Import transactions → Dashboard → Insights panel should appear below action cards',
      'Dashboard → Monthly Review → summary paragraph above Total Income/Spending grid',
    ],
  },
  {
    version: 'V12.7',
    date: 'May 2026',
    what: [
      'Local backup download — one-click JSON export',
      'Restore from cloud — "Use Cloud Data" downloads backup first then restores',
      'Per-entity sync results — expand "Show sync details" after syncing',
    ],
    test: [
      'Cloud persistence → Download backup → flow-backup-YYYY-MM-DD.json should download',
      'Cloud sync readiness → Compare → Use Cloud Data → confirm, app should reload',
      'Sync now → click "Show sync details" to see per-entity breakdown',
    ],
  },
  {
    version: 'V12.6',
    date: 'May 2026',
    what: [
      'Transaction cloud sync — all transactions pushed to Supabase',
      'Import batch persistence to localStorage and cloud',
    ],
    test: [
      'Sync now → Supabase Table Editor → transactions table should have your rows',
      'Import a CSV → sync → check import_batches table in Supabase',
    ],
  },
  {
    version: 'V12.5',
    date: 'May 2026',
    what: [
      'Batch upsert — sync is one request per entity, not N+1',
      'Conflict detection modal — shows side-by-side when cloud has newer data',
      'Safe entity sync: accounts, categories, goals, rules, saved budgets, actuals',
    ],
    test: [
      'Test connection → Sync now → should say "Cloud synced" with no errors',
      'Edit a record on two devices without syncing → sync one → conflict modal should appear',
    ],
  },
]
