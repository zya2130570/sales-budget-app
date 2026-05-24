export type VersionEntry = {
  version: string
  date: string
  what: string[]
  test: string[]
}

export const CHANGELOG: VersionEntry[] = [
  {
    version: 'V24',
    date: '5/23/2026 at 7:00 PM',
    what: [
      'Setup Guide — interactive 8-step onboarding walkthrough with AI-powered Q&A. Open from profile dropdown or Dashboard button',
      'Period bug fix (nuclear) — dollar sign now renders as a JSX element split from the number, so Chrome extensions targeting text nodes cannot strip the $',
      'Profile dropdown now includes Setup Guide option alongside starter data, settings, and sign out',
      'Setup Guide button appears on empty Dashboard alongside the onboarding card',
    ],
    test: [
      'Click your email → profile dropdown → Setup Guide → 8-step modal opens',
      'Empty Dashboard → "Open Setup Guide" blue button appears',
      'Dashboard attention banner → dollar sign should now display correctly as $X,XXX.XX',
      'Setup Guide → ask a question in the chat → AI responds about Flow workflow',
    ],
  },
  {
    version: 'V23',
    date: '5/23/2026 at 5:00 PM',
    what: [
      'Period bug ACTUALLY fixed — dashboardMetrics.ts now uses its own inline formatter instead of currency() from formatting.ts. The $ sign cannot be lost regardless of which files get deployed',
      'Light mode improved — comprehensive CSS that changes backgrounds, text, borders, inputs. No more xray effect',
      'Starter data card is now dynamic — only shows on Dashboard when app is empty. Otherwise accessible from your profile',
      'Profile panel — click your email in the header to open a dropdown with: your account, Load starter data, Settings, Sign out',
    ],
    test: [
      'Dashboard → Attention Needed banner → should now show $X,XXX.XX with a real dollar sign',
      'Settings → Appearance → toggle light mode → full app should go light, not xray',
      'Add some data then check Dashboard — the starter data card should be gone',
      'Click your email in the header → profile dropdown with 4 options appears',
    ],
  },
  {
    version: 'V22',
    date: '5/23/2026 at 3:00 PM',
    what: [
      'Period bug FIXED — $ was rendering as . in some Chromium builds. Replaced Intl.NumberFormat with explicit manual formatting. Every $ now always shows as $',
      'Dark/Light mode — toggle in Settings → Appearance. Switches the entire app theme',
      'Budget approach notifications — new amber insight when a category hits 75-99% of its monthly budget',
    ],
    test: [
      'Dashboard → "Attention Needed" banner — the $ sign should now show correctly before every number',
      'Settings → Appearance → toggle the switch — app should switch between dark and light',
      'Enter some actuals that are close to (but not over) a category budget → Dashboard Insights → amber ⚡ warning should appear',
    ],
  },
  {
    version: 'V21',
    date: '5/23/2026 at 1:30 PM',
    what: [
      'Responsive layout fix — page no longer scrolls horizontally at any viewport width',
      'Header redesigned — logo + utility buttons always pinned top row, tab bar always scrolls in its own row below',
      'All tables now scroll within their card rather than expanding the page',
      'Mobile-first: works correctly at 320px phone width all the way to ultra-wide desktop',
    ],
    test: [
      'Drag browser window to any width — no horizontal scrollbar should appear on the page itself',
      'At 400px width: logo and Cloud/⚙ buttons visible top-right; tabs scroll left/right below them',
      'Budget tab → Budget Categories table should scroll within the card, not expand the page',
      'On phone: open the app — it should fit the screen without zooming or scrolling sideways',
    ],
  },
  {
    version: 'V20',
    date: '5/23/2026 at 12:00 PM',
    what: [
      'Schema Repair fixed — now uses Supabase Management API instead of direct pg connection (no more 500 error). Needs two new Vercel env vars: SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN',
      'Budget Templates — saved budgets renamed to "Apply" with a confirmation, so it\'s clear applying a template replaces your current categories',
      'Mobile nav — tab bar now scrolls horizontally on small screens, utility buttons (cloud, settings) stay pinned right',
      'PDF export — "↓ Export PDF" button on Dashboard opens browser print dialog, formatted for paper',
      'Removed pg package — no longer needed after schema repair rewrite',
    ],
    test: [
      'Settings → Add SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN to Vercel → Repair database schema → should show success',
      'Budget tab → Saved budgets section → "Apply" button → confirm dialog → categories should update',
      'On a narrow window, the tab nav should scroll horizontally. Cloud/settings buttons stay visible on the right',
      'Dashboard → "↓ Export PDF" button → browser print dialog opens with the dashboard formatted for paper',
    ],
  },
  {
    version: 'V19',
    date: '5/23/2026 at 11:00 AM',
    what: [
      'Schema Repair button in Settings — creates missing Supabase tables without manually running SQL',
      'Contribution delete propagation — deleting a savings goal contribution now marks it deleted in cloud on next sync',
      'AI assistant API key message — clear setup instructions when ANTHROPIC_API_KEY is not configured',
      'Period-keyed actuals — budget actuals now stored per calendar month (YYYY-MM), enabling real history',
      'Budget History browser — view past months\' actuals vs plan in the Budget tab',
      'Category rollover math — enabled categories carry underspend forward from previous month',
      'Rollover persistence — rollover toggles no longer lost on page refresh',
    ],
    test: [
      'Settings → Repair database schema → should show success or list missing tables',
      'Delete a savings goal contribution → Sync now → Supabase savings_goal_contributions → row should have deleted_at set',
      'Budget tab → scroll to bottom → "Budget History" section should appear (after actuals exist for multiple months)',
      'Enable Rollover on a category → next month it should show "+$X rolled" if you underspent last month',
      'Refresh the page after enabling rollover toggles → toggles should still be on',
    ],
  },
  {
    version: 'V18',
    date: '5/22/2026 at 9:00 AM',
    what: [
      'take_home_settings now syncs to cloud (was wired in Supabase but never passed from the app)',
      'scenario_notes now syncs to cloud — your scenario annotations persist across devices',
      'category_memory now syncs to cloud — merchant auto-categorization learned on one device applies on all devices',
      'flow_cloud_last_sync_at moved into the workspace-aware storage system (per-user timestamp isolation)',
      'All three new entities also restored on "Use Cloud Data" / "Merge Safe Data"',
    ],
    test: [
      'Go to Income tab → adjust take-home rate → Sync now → sign in on another device → Use Cloud Data → rate should match',
      'Add a note to a scenario → Sync now → check Supabase scenario_notes table for a row',
      'Import CSV transactions (this builds category_memory) → Sync now → check Supabase category_memory table',
      'Cloud Status → Sync Details → should now show scenario_notes and category_memory rows in the results',
    ],
  },
  {
    version: 'V17.2',
    date: '5/21/2026 at 8:00 PM',
    what: [
      'Workspace isolation — each user now has a separate localStorage namespace. Logging in as User A never shows User B\'s data',
      'Migration on first login — existing local data is automatically copied to your user namespace on sign-in',
      'Sign-out clears workspace — signing out reloads into guest mode with clean state',
      'Sync error details — Cloud Status now shows the exact Supabase error per entity (e.g. "missing constraint", "invalid value")',
      'Reverted GPT\'s calculations.ts change — formatMoney restored to Intl.NumberFormat (GPT\'s Math.abs() broke negative numbers)',
    ],
    test: [
      'Sign out → sign back in → your data should still be there (migration ran successfully)',
      'After sign-in, open Cloud Status → Sync Details → any failed entity should now show the exact error reason below it',
      'Sign out → the app should show empty/guest state, not your account\'s data',
      'Sign in as a different email → should see that account\'s data, not the previous user\'s',
    ],
  },
  {
    version: 'V17.1',
    date: '5/21/2026 at 6:15 PM',
    what: [
      'Version badge now always shows the current version number dynamically',
      'Changelog dates now show specific dates and times, not just month',
      'Settings panel now closes when clicking outside (matches Cloud Status behavior)',
    ],
    test: [
      'Check the version badge in the header and in Cloud sync readiness — should say V17.1, not V15',
      'Open Settings → click the dark overlay outside the panel → should close',
      'Open Cloud Status → click outside → closes. Settings should now behave the same way',
    ],
  },
  {
    version: 'V17',
    date: '5/21/2026 at 5:45 PM',
    what: [
      'Cloud Status button — replaces two always-visible cloud panels with a compact header button accessible from any tab',
      'Compare & Merge tab — Merge Safe, Use Cloud, and Compare are all one click away, no longer buried',
      'Auto-sync safety — pauses after 3 consecutive failures, re-enabling after a successful connection re-test',
      'Dashboard condensed — Financial Intelligence merged into Dashboard Summary, Cash Flow Forecast and Monthly Review now collapsible',
    ],
    test: [
      'Check the header — a colored dot + "Cloud" / "Synced" / "N pending" button should appear next to ⚙',
      'Click the cloud button → Sync tab shows test/sync buttons. Compare & Merge tab shows all three actions at once',
      'Enable Auto-sync, let 3 syncs fail → toggle should turn off automatically',
      'Dashboard → Dashboard Summary card should now include the health metrics (fixed bills, savings rate, etc.)',
      'Dashboard → click "Cash Flow Forecast" or "Monthly Review" header to expand/collapse',
    ],
  },
  {
    version: 'V16',
    date: '5/21/2026 at 3:00 PM',
    what: [
      'Settings panel — gear icon in header opens a central settings modal',
      'Demo mode — one click loads a full realistic dataset (accounts, budget, 30+ transactions, goals)',
      'Import from backup file — restore a flow-backup-*.json file directly in settings',
      'Onboarding card — shown on Dashboard when the app has no data yet',
      'Clear all data — wipes local data from settings (cloud unaffected)',
    ],
    test: [
      'Click the ⚙ gear icon in the header → settings modal should open',
      'Settings → Load demo → confirm → app reloads with realistic data across all tabs',
      'Settings → Download backup → then Clear all data → then Restore from backup file → data comes back',
      'After clearing data, Dashboard should show the onboarding welcome card',
    ],
  },
  {
    version: 'V15',
    date: '5/21/2026 at 12:35 PM',
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
    date: '5/21/2026 at 10:00 AM',
    what: [
      'AI Financial Assistant — ask natural-language questions using your real data',
      'Version changelog popup — click any version badge to open this',
      'Insights: budget-over-income warning now shows even with no transactions',
    ],
    test: [
      'Dashboard → "Financial Assistant" panel → ask "Why is my budget over my income?"',
      'Click the version badge in the header to open this changelog',
      'Dashboard Insights panel should show a red warning if planned budget > net income',
    ],
  },
  {
    version: 'V13',
    date: '5/20/2026 at 8:30 PM',
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
    date: '5/20/2026 at 5:00 PM',
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
    date: '5/19/2026 at 6:00 PM',
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
    date: '5/19/2026 at 3:53 PM',
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

/** Always reflects the latest deployed version. Used by VersionBadge. */
export const CURRENT_VERSION = CHANGELOG[0].version
