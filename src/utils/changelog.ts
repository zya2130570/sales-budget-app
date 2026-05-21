/**
 * changelog.ts — version history for the in-app changelog popup.
 * Newest entry first. Each entry includes what changed and what to click to test it.
 */
export type VersionEntry = {
  version: string
  date: string
  what: string[]
  test: string[]
}

export const CHANGELOG: VersionEntry[] = [
  {
    version: 'V14',
    date: 'May 2026',
    what: [
      'AI Financial Assistant — ask natural-language questions about your finances',
      'Version changelog popup — click any version badge to see this',
      'Insights: budget-over-income warning now surfaces even with no transactions',
    ],
    test: [
      'Scroll to "Financial Assistant" on Dashboard — ask "Can I afford a $500 expense?"',
      'Ask "Why is my budget over my income?" or "How much should I save per month?"',
      'Click the V14 badge in Cloud sync readiness to open this changelog',
      'Check Dashboard for an Insights panel — should now show a warning if planned budget > income',
    ],
  },
  {
    version: 'V13',
    date: 'May 2026',
    what: [
      'Spending Insights panel on Dashboard — prioritized, data-driven callouts',
      'Monthly Review prose summary — generated paragraph above the metrics grid',
    ],
    test: [
      'Import transactions, then check Dashboard for the Insights panel below action cards',
      'Open Monthly Review — a summary paragraph should appear above Total Income/Spending',
    ],
  },
  {
    version: 'V12.7',
    date: 'May 2026',
    what: [
      'Local backup download — one-click JSON export of all local data',
      'Restore from cloud — "Use Cloud Data" button now actually restores and reloads',
      'Per-entity sync results — expand "Show sync details" after syncing',
      'Cloud sync readiness upgraded from V12.3 preview to V12.7 full',
    ],
    test: [
      'Cloud persistence panel → Download backup → should download flow-backup-YYYY-MM-DD.json',
      'Cloud sync readiness → Open panel → Compare → Use Cloud Data → confirm restore',
      'Sync now → click "Show sync details" to see per-entity breakdown',
    ],
  },
  {
    version: 'V12.6',
    date: 'May 2026',
    what: [
      'Transaction cloud sync — all transactions now sync to Supabase',
      'Import batch persistence — batches saved to localStorage and synced',
      'PDF import now sets importBatchId correctly',
    ],
    test: [
      'Sync now → check Supabase Table Editor → transactions table should have your rows',
      'Import a CSV → sync → check import_batches table in Supabase',
    ],
  },
  {
    version: 'V12.5',
    date: 'May 2026',
    what: [
      'Batch upsert replaces N+1 pattern — sync is now one request per entity type',
      'Conflict detection — shows a side-by-side modal when cloud has newer data',
      'Safe entity sync: accounts, categories, goals, rules, saved budgets, actuals',
      'Category updatedAt field added, schema migrated to v3',
    ],
    test: [
      'Test cloud connection → Sync now → should show "Cloud synced" with no errors',
      'Edit a category on one device, sync from another → conflict modal should appear',
    ],
  },
]

export const CURRENT_VERSION = CHANGELOG[0].version
