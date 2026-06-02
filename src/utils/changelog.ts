export type VersionEntry = {
  version: string
  date: string
  what: string[]
  test: string[]
  roadmap?: string[]
}

export const CHANGELOG: VersionEntry[] = [
  {
    version: 'V49.1',
    date: '5/31/2026 at 12:00 AM',
    what: [
      'Fixed: Compare panel was counting soft-deleted cloud rows. After running Use Local, the cloud-side counts wouldn\'t drop because getTableSummary did not filter deleted_at IS NULL. The deletes were actually happening — the UI just kept showing the old total. Added the filter to both the count query and the lastModifiedAt query. Verified with 3 unit tests including end-to-end simulation of 559 rows → 404 deleted → 155 visible.',
    ],
    test: [
      'Open Cloud panel → Compare & Merge.',
      'Run Use Local → confirm.',
      'After sync completes (the Details line at top should show "X cloud records removed" alongside the upserts), click Compare again.',
      'Cloud record count should now match local. If you ran Use Local + Sync previously without this fix, the cloud rows are already deleted — this fix just makes the count accurate.',
    ],
  },
  {
    version: 'V49',
    date: '5/30/2026 at 12:00 AM',
    what: [
      'Use Local actually works now — previously this button just changed a status text and did nothing else. It now fetches all cloud IDs, finds records that exist in cloud but not locally, and queues them for soft-deletion on the next sync. Added a confirmation step since this is destructive (cloud will lose those records).',
      'Use Local auto-triggers sync after confirming — no need to click Sync separately.',
      'Fixed cloud orphan factories — multiple delete and clear actions were updating local state without queuing cloud deletes. Fixed every place this could happen: Saved Budget delete, Saved Scenario delete, Savings Goal Set delete, Delete Import Batch (also queues each transaction in the batch), Clear All Accounts, Clear All Transactions, Clear All Rules, Clear All Savings Goals, Reset Budget, and the global Clear All My Data in settings.',
      'CSV import duplicate detection is smarter — merchant strings now normalize before comparison: trailing transaction IDs ("AMAZON.COM #1234567"), asterisk suffixes ("AMZN MKTPLC*XYZ123"), and 4+ digit trailing numbers all get stripped so the same merchant matches across formats.',
      'Added "Update <budget>" quick-save — when you Apply a saved budget, a green Update button appears that overwrites that specific budget with whatever your categories currently look like.',
    ],
    test: [
      'Open Cloud panel → Compare & Merge → Use Local. Confirm the destructive action. Sync auto-fires. After it completes, cloud and local record counts should match.',
      'Apply any saved budget, modify categories. The green "Update <budget>" button should appear.',
      'Delete a saved budget. Refresh. It should stay deleted (previously it would come back from cloud).',
      'Delete an import batch — its transactions should be removed from cloud too on next sync (previously orphaned).',
      'Import the same CSV twice — duplicates should now be detected even when merchant strings differ slightly (trailing IDs).',
    ],
  },
  {
    version: 'V48',
    date: '5/30/2026 at 12:00 AM',
    what: [
      'Reverted number font to Inter — Geist Mono looked too "code-editor" for finance UI. Numbers still get tabular figures so columns line up, just in Inter now.',
      'Fixed horizontal overflow on tables — Accounts table action column (Edit / Reconcile / Delete) is now sticky to the right edge so it stays visible when columns scroll. Scrollbar now actually shows on table containers (previously hidden globally).',
      'Fixed responsive grids — Dashboard action cards, budget summary, take-home metrics, etc. all moved their 4-column layout from md (768px) to lg (1024px). On half-screen sidebar-open widths, they now drop to 2 columns instead of cramming 4 narrow cards together.',
      'Fixed Save Budget row clipping at narrow widths — now stacks vertically when there is not enough room.',
      'Spending History — improved legacy bucket labeling. Now shows "All imported (legacy)" with an amber explanation banner: data imported before per-period tracking is in one bucket; new imports go to the correct period automatically.',
    ],
    test: [
      'Hard refresh to reload fonts.',
      'Open the sidebar (expanded mode). On a typical half-screen window, Dashboard action cards should be 2x2, not 4x1.',
      'Accounts tab: the Edit / Reconcile / Delete buttons should stay visible on the right edge even when the table is wider than the viewport.',
      'Spending History: the legacy data note explains why everything is in one bucket.',
    ],
  },
  {
    version: 'V47',
    date: '5/30/2026 at 12:00 AM',
    what: [
      'Design system overhaul — Linear/Arc/Raycast direction.',
      'Real fonts loaded: Inter for UI, Geist Mono for all currency values. Numbers now use tabular figures so columns of dollars align properly.',
      'Refined accent color to Linear\'s exact indigo (#5E6AD2) — replaces the old #5B6AF0. Applied consistently to active sidebar tab, primary buttons, focus rings.',
      'Card / Metric / Row / Button / Pill primitives rewritten to use design tokens. Card titles now use tracking-tight 15px semibold. Metric hero numbers are 24px Geist Mono. No more nested-card-in-card visual noise.',
      'Multi-level dark surfaces: page bg #08080B, cards #131318, hovered cards #16161D. Borders reduced from 4+ weights to 3 (subtle / default / strong). Less visual chrome, more depth.',
      'Top header: 52px tall (was 48), upgraded backdrop blur to 20px + 180% saturate for the Arc-style glass effect.',
      'Refined transitions: 180ms cubic-bezier(0.2, 0, 0, 1) — Apple\'s standard ease. Less abrupt, more refined.',
      'Status/tone colors desaturated slightly: green #4ADE80, amber #FACC15, red #F87171. Less candy-colored.',
    ],
    test: [
      'Hard refresh the page once so the fonts load. Numbers should appear in Geist Mono (slightly mechanical, evenly spaced digits).',
      'Open the Income tab — the four take-home metric cards should look noticeably more refined, with smaller eyebrow labels and bigger mono numbers.',
      'Hover any card — border should subtly brighten without the old jumpy translate effect.',
      'Click a sidebar tab — the active icon and indicator should be Linear-indigo, not the old slightly-brighter blue.',
    ],
  },
  {
    version: 'V46',
    date: '5/30/2026 at 12:00 AM',
    what: [
      'Sidebar icon overhaul — all 7 nav icons redrawn at 18px for clarity in collapsed mode. Budget is now a bar chart (not a house). Transactions shows two-way arrows. Settings is now a proper gear cog (was accidentally showing a sun/light icon). Active tab gets brand-blue icon color instead of just brighter white.',
      'Spending History panel — fixed "unknown-period:unknown-start" showing raw key text. All legacy/default period keys now show "Earlier data". Empty periods ($0.00) are filtered out.',
      'Version badge updated to V46.',
    ],
    test: [
      'Collapse the sidebar — each icon should be immediately recognizable without hovering.',
      'Settings button at the bottom should show a gear, not a sun.',
      'Active tab icon should appear blue/indigo, not just bright white.',
      'Dashboard Spending History should show readable month labels, no raw key strings.',
    ],
  },
  {
    version: 'V43',
    date: '5/27/2026 at 12:00 AM',
    what: [
      'Sidebar now defaults to collapsed on all devices. First visit always starts collapsed. Subsequent visits remember your last choice (expanded or collapsed) via localStorage.',
      'Progressive onboarding checklist — replaces the static OnboardingCard. Shows 5 real steps: Income, Budget, Accounts, Transactions, Savings Goals. Each step checks your actual data and marks itself done. Progress bar shows completion. Click any incomplete step to go there.',
      'Local to cloud migration — when you are signed in with unsynced local data, a prompt appears on Dashboard with a "Save to cloud" button and a summary of what will be pushed.',
      'Scenarios explanation — a plain-language card at the top of the Scenarios tab explains what scenarios are and when to use them.',
      'Realistic sample data — transaction generator now produces realistic amounts by type: income is $1400-$2600, transfers $100-$600, small expenses $5-$50, medium $50-$200, large $200-$800. No more all amounts being multiples of $5.',
    ],
    test: [
      'Refresh the page — sidebar should start collapsed (icon-only mode)',
      'Expand sidebar, refresh — sidebar stays expanded (choice is remembered)',
      'Dashboard with no data — checklist shows 5 unchecked steps. Add income — Income step checks off.',
      'Dashboard, signed in, with unsynced data — blue "Save to cloud" prompt appears at top',
      'Scenarios tab — explanation card appears at top with plain description',
      'Transactions tab → Generate Sample or Generate 10 Samples — income amounts should be $1400-$2600, not $5-$95',
    ],
  },
  {
    version: 'V42',
    date: '5/25/2026 at 10:00 PM',
    what: [
      'Cloud panel click-outside fixed everywhere — added a capture-phase mousedown listener on document. Clicking on sidebar items, budget rows, any content area, or any button now closes the panel. No longer limited to the header area.',
      'Reconcile FAQ — "? reconcile help" button in the Your Accounts card header opens a step-by-step explainer: what reconcile means, how to set a baseline, what Unexplained Activity is, and how to get to zero. Escape or Got it closes it.',
      'Savings Goal transaction type — new "Savings Goal Contribution" option in the Log Transaction type dropdown. When selected, shows a goal selector. Saving a linked transaction auto-logs the amount as a contribution to that goal — progress bar updates immediately.',
    ],
    test: [
      'Press Ctrl+S to open cloud panel, then click on Budget in sidebar — panel should close',
      'Press Ctrl+S, then click on a category row — panel should close',
      'Press Ctrl+S, then click anywhere on the page — panel should close',
      'Accounts tab → Your Accounts card → click "? reconcile help" → 5-step explainer opens',
      'Transactions → Log Transaction → Type dropdown → choose "Savings Goal Contribution" → goal selector appears',
      'Select a goal, enter amount, Add Transaction → toast confirms contribution was logged → check Savings Goals tab for updated progress',
    ],
  },
  {
    version: 'V41',
    date: '5/26/2026 at 3:00 PM',
    what: [
      'Sidebar is now user-resizable: drag the right edge to set a custom width between 180px and 400px. Width persists to localStorage across sessions. The [ shortcut still collapses/expands as before.',
      'Main content area always fills the exact remaining width (calc(100vw - sidebarWidth)). Shrinking the window now reduces sidebar space first, then content.',
      'Keyboard shortcuts panel: custom rows now show an Undo/Redo control. Delete a row by accident and click Undo to get it back.',
      'Added a clear callout in the shortcuts panel footer: custom rows are a personal reference cheat sheet only. Adding a row does not wire up any app behavior.',
    ],
    test: [
      'Hover over the right edge of the sidebar — cursor changes to col-resize.',
      'Drag the sidebar edge to ~320px — sidebar widens, content shrinks to fill remaining space.',
      'Reload the page — sidebar remembers the custom width.',
      'Press [ — sidebar collapses to icon-only. Press [ again — restores to custom width.',
      'Resize browser window to half-screen — content fills its space correctly, no overflow or gap.',
      'Press ? to open shortcuts panel. Delete a custom row. Click Undo — row returns.',
      'Click Redo — row is deleted again.',
      'Read the footer note: it explains custom rows are reference-only with no app behavior.',
    ],
  },
  {
    version: 'V40',
    date: '5/26/2026 at 2:00 PM',
    what: [
      'Layout fix: main content area now dynamically fills the remaining width. Fixed a mismatch where App.tsx used 56/220px for sidebar width but Sidebar.tsx actually rendered at 64/260px, causing content to be cut off on the left side at any window size.',
      'Keyboard shortcuts panel is now fully editable. Click any shortcut row to edit its key label or description. Built-in shortcuts show an edit pencil icon; custom rows show a delete button too.',
      'Add custom shortcut reference rows (key + description) that persist to localStorage across sessions.',
    ],
    test: [
      'Resize the window to a narrow width — content fills all available space, no gap on left edge next to sidebar.',
      'Collapse the sidebar with [ — content expands smoothly to fill the extra space.',
      'Press ? — shortcuts panel opens. Click any row — it enters edit mode with key and description fields.',
      'Edit a description, press Enter or click Save — row updates immediately.',
      'Click + Add custom shortcut reference — fill in key and description, press Enter or Add — row appears in list.',
      'Delete a custom row with the x button — row disappears and stays gone after closing/reopening.',
    ],
  },
  {
    version: 'V39.1',
    date: '5/25/2026 at 1:15 PM',
    what: [
      'Cloud panel positioning restored: bottom-sheet on mobile, centered modal on desktop — same look as before V39.',
      'Portal rendering kept: click anywhere outside the panel to close it. The backdropFilter header clipping bug remains fixed.',
    ],
    test: [
      'Click Cloud button — panel appears centered on desktop, slides up from bottom on mobile.',
      'Click anywhere outside the panel — panel closes.',
      'Press Ctrl+S — panel toggles open/closed.',
    ],
  },
  {
    version: 'V37',
    date: '5/25/2026 at 6:00 AM',
    what: [
      'Suggest from history — now shows the actual merchants instead of a vague toast. A panel appears with pill buttons for each uncategorized merchant. Click any pill to pre-fill the rule form (name + match text). Dismiss when done.',
      'Merchants already covered by existing rules are filtered out of the suggestions.',
    ],
    test: [
      'Transactions tab → Transaction Rules → click ⚡ Suggest from history',
      'A purple panel appears with merchant name pills (e.g. "Starbucks", "Shell", "Amazon")',
      'Click any pill → rule form fills with that merchant name',
      'Choose a budget category → Add Rule → merchant disappears from the suggestion panel',
    ],
  },
  {
    version: 'V36',
    date: '5/25/2026 at 4:00 AM',
    what: [
      'AI PDF import — upload any bank statement PDF and Gemini reads it visually, extracting all transactions as structured data. Works with Chase, BofA, Wells Fargo, Citi, Capital One, and any other bank statement.',
      'New endpoint: api/parse-pdf.ts — sends PDF as base64 to Gemini 1.5 Flash (multimodal), returns validated JSON array of transactions. Replaces the old brittle text-extraction approach.',
      'Drop zone updated — shows AI badge: "PDFs parsed by AI — works with any bank statement". Loading message shows "✦ AI is reading your PDF…"',
      'Old experimental Chase PDF text parser disabled — all PDFs now go through the AI path.',
    ],
    test: [
      'Transactions → Import → drop zone shows purple AI badge: "PDFs parsed by AI"',
      'Upload a PDF bank statement → loading shows "✦ AI is reading your PDF…" → then shows extracted transactions in the preview table',
      'Review transactions before importing — amounts should be positive for charges, negative for credits',
      'Import → transactions appear in your list with source "pdf"',
      'If GEMINI_API_KEY is missing → clear error message with setup instructions',
    ],
  },
  {
    version: 'V35',
    date: '5/25/2026 at 2:00 AM',
    what: [
      'Bank selector in import — the plain preset dropdown is replaced with a visual bank picker (Apple Card, Chase, BofA, Wells Fargo, Capital One, Citi, Generic). Selecting a bank shows step-by-step export instructions and sample header format.',
      'Bank templates — 7 bank templates with export guides added to csv.ts. ImportPreset type expanded to include chase-csv, bofa, wellsfargo, capitalone, citi.',
      'Quick-add common merchant rules — when you have no rules yet, the rules section shows one-click buttons to add rules for Amazon, DoorDash, Uber Eats, Netflix, Spotify, Walmart, Target, etc. Only shows rules that match your existing categories.',
      'Suggest rules from history button — in the Transaction Rules section, a new button scans your uncategorized transactions and tells you how many unique merchants need rules.',
    ],
    test: [
      'Transactions tab → Import → bank selector grid should appear at top with 7 bank options',
      'Click Chase → export instructions appear (chase.com → Download → CSV)',
      'Transaction Rules section → if no rules: quick-add buttons appear for common merchants',
      'Add a Groceries or Shopping category → the Walmart/Amazon buttons appear → click one → rule is added instantly',
      'Click the ⚡ button → toast shows count of uncategorized merchant names',
    ],
  },
  {
    version: 'V34',
    date: '5/25/2026 at 12:00 AM',
    what: [
      'iPad/responsive layout fix — max-width increased from 1024px to 1280px. No more dead space on iPad or large monitors. Content fills available width correctly.',
      'Ctrl+S (or Cmd+S) now opens the cloud sync panel instead of silently syncing. You see the full panel, can test connection, toggle auto-sync, download backup.',
      'V key opens/closes the version badge & changelog popover from anywhere.',
      'Cloud panel now closes with Escape key.',
      'VersionBadge is now externally controlled — can be opened via keyboard or any trigger.',
      'Keyboard shortcuts panel updated — shows all shortcuts including 8 (AI), V (version), Ctrl+S (cloud), full descriptions.',
    ],
    test: [
      'On iPad or wide monitor — Budget/Scenarios/Dashboard should fill the full width without blank space on the right',
      'Press Ctrl+S (or Cmd+S on Mac) from anywhere → cloud panel opens',
      'Press V anywhere (not in a text field) → version badge popover opens/closes',
      'Cloud panel open → press Escape → closes',
      'Press ? → keyboard shortcuts panel → all shortcuts listed including V, 8, Ctrl+S',
    ],
  },
  {
    version: 'V33.1',
    date: '5/24/2026 at 11:00 PM',
    what: [
      'Bills to Mom breakdown restored — seeding effect was missing from the deployed zip. Now correctly maps preload items (item.name, not item.label) and auto-populates on load.',
      'Breakdown editor — now shows all existing budget categories as quick-add buttons. Click any category to add it with its monthly amount pre-filled. Useful for grouping related categories under an umbrella.',
      'Sync conflict — both LOCAL and CLOUD versions now show "(weekly)" on the Amount field.',
      'AI Assistant keyboard shortcut — press 8 anywhere (not in a text field) to open/close the chat drawer. Shortcut badge visible in sidebar.',
    ],
    test: [
      'Load personal starter data → Budget tab → Bills to Mom should show the ▾ toggle with Car insurance/Parking/Phone items',
      'Any category row → click "+ Group" → modal shows your existing categories as quick-add buttons at the top',
      'Trigger a sync conflict → both Local and Cloud versions should show "Amount (weekly): $X.XX"',
      'Press 8 from any tab → AI chat drawer opens. Press 8 again or Escape → closes.',
    ],
  },
  {
    version: 'V33',
    date: '5/24/2026 at 9:00 PM',
    what: [
      'AI Assistant is now in the sidebar — click ✦ AI Assistant (bottom of sidebar) from any page. Opens a full-height chat drawer. Escape or click backdrop to close.',
      'Budget breakdowns — every category now has a "+ Group" button. Click it to add/edit sub-items (e.g. "Bills to Mom" → Car insurance $121, Parking $53). Items show in a purple breakdown row under the category.',
      'Bills to Mom breakdown auto-migrates — when personal starter data is loaded, the Bills to Mom breakdown seeds into the new editable breakdown system automatically.',
      'Conflict modal — Escape now closes it. Amount fields show "(weekly)" so you know what period is being compared.',
      'Command palette — reduced top gap from 15vh to 8vh so the top is always visible on smaller screens.',
      'Cloud button light mode — button is now white with slate border/text in light mode instead of dark slate.',
    ],
    test: [
      'Click ✦ AI Assistant in sidebar → chat drawer opens from the right. Escape closes it. Same from any tab.',
      'Budget tab → any category row → click "+ Group" → add items with labels and monthly amounts → Save → purple breakdown row appears',
      'Load personal starter data → find Bills to Mom → should already show Car insurance/Parking/Phone breakdown',
      'Sync and trigger a conflict → press Escape → conflict modal closes. Amount fields say "(weekly)"',
      'Press Ctrl+K → command palette appears lower on screen (8vh from top)',
      'Light mode → cloud status button should be white/readable',
    ],
  },
  {
    version: 'V32',
    date: '5/24/2026 at 6:00 PM',
    what: [
      '"Monthly Gross Profit" renamed to "Monthly Gross Income" throughout — Income tab, Dashboard, Scenarios. Profit is a business term; this is personal finance.',
      'Financial Assistant panel is now collapsible — click "▲ Hide" to minimize the chat, "▼ Show" to expand. State is per-session.',
      'Budget category search — type to filter categories instantly. Appears next to the All / Over Budget / No Activity filter pills.',
      'Budget search filter applied to the category table — only matching rows render.',
      'Tab change clears input focus — switching tabs now blurs any active input so text stays unselected and keyboard shortcuts (1-7) work immediately.',
      'Guest mode tooltip — hovering "Guest mode" now shows a description: local = browser only, sign in = cross-device sync.',
      'Cmd+S (⌘S / Ctrl+S) syncs to cloud from anywhere, including while typing.',
      'Sidebar onSync prop wired — sidebar keyboard handler owns the Cmd+S shortcut cleanly.',
    ],
    test: [
      'Income tab → label should say "Monthly Gross Income", not "Gross Profit"',
      'Dashboard → Financial Assistant → click "▲ Hide" → panel collapses. Click "▼ Show" → expands.',
      'Budget tab → type in search box → category list filters instantly. Clear with ✕.',
      'Navigate from Accounts to Budget → no input should remain highlighted/focused',
      'Sign out → hover "Guest mode" text → tooltip explains local vs cloud',
      'Press Cmd+S anywhere → cloud sync triggers (check cloud status button for activity)',
    ],
  },
  {
    version: 'V31.3',
    date: '5/24/2026',
    what: [
      'Dark-mode dashboard status banner gradient restored; only light mode keeps the softer V31.2 treatment.',
      'Keyboard shortcuts panel added to the sidebar with ? shortcut.',
      'Sidebar now exposes quick controls for theme, keyboard shortcuts, settings, and collapse in one place.',
    ],
    test: [
      'Dark mode → dashboard status banner should have a colored gradient again.',
      'Light mode → dashboard status banner should keep the softer readable gradient.',
      'Sidebar → click Keyboard shortcuts → panel opens. Press Escape → it closes.',
      'Press ? when not typing → keyboard shortcuts panel opens.',
    ],
  },
  {
    version: 'V31.2',
    date: '5/24/2026',
    what: [
      'Escape key now closes click-out overlays like Settings, Profile, and Cloud Status.',
      'Profile shortcut is now a true toggle: press . to open and press . again to close.',
      'Settings shortcut now toggles from the sidebar shortcut flow.',
      'Light/Dark mode is now accessible directly from the sidebar, with T as a shortcut.',
      'Dashboard status banner has a softer light-mode gradient instead of a flat card or harsh gradient.',
    ],
    test: [
      'Open Settings, Profile, and Cloud Status → press Escape → each should close.',
      'Press . twice → Profile opens, then closes.',
      'Press 0 twice → Settings opens, then closes.',
      'Press T → theme toggles between dark and light.',
      'In light mode, Dashboard status banner should still have color but look softer.',
    ],
  },
  {
    version: 'V31.1',
    date: '5/24/2026',
    what: [
      'Reconcile no longer compounds imported activity every time the button is clicked.',
      'Dashboard status banner no longer uses the heavy gradient in light mode.',
      'Keyboard shortcuts added: 0 opens Settings and . opens Profile.',
      'Financial Assistant chat history now survives refresh on the same device.',
    ],
    test: [
      'Accounts → click Reconcile repeatedly on the same account → unexplained amount should not keep growing.',
      'Press 0 → Settings opens. Press . → Profile opens.',
      'Ask the Financial Assistant something → refresh → recent chat should still be visible.',
    ],
  },
  {
    version: 'V31',
    date: '5/24/2026 at 10:00 AM',
    what: [
      'Gemini model fallback added — tries GEMINI_MODEL first, then current Flash model options if one model is unavailable.',
      'AI error message updated — now shows Gemini setup steps with all 3 environment checkboxes (Production + Preview + Development). The old ANTHROPIC_API_KEY message is gone.',
    ],
    test: [
      'Financial Assistant → send a message → should get a real response (no more error)',
      'If still seeing error: Vercel → GEMINI_API_KEY → Edit → check Preview box → Save → Redeploy',
    ],
  },
  {
    version: 'V30',
    date: '5/24/2026 at 8:00 AM',
    what: [
      'Version badge fixed — now opens an anchored popover below the badge, not a fullscreen modal. Click anywhere outside to close. Works at all screen sizes.',
      'Dashboard tab now scrolls to top on every tab change — no more landing in the middle of the page.',
      'Financial Assistant send button no longer scrolls the page — uses block:nearest scroll so only the chat scrolls, not the viewport.',
      'PersonalPreloadCard is now guest-safe — unauthenticated visitors see only a brief teaser and a disabled button. No sensitive data visible until signed in.',
      'Income tab auto-focus removed — keyboard tab navigation now works across all sections without being hijacked.',
      'Gemini Flash is the financial assistant AI — add GEMINI_API_KEY from aistudio.google.com to Vercel env vars for free AI (1M tokens/day).',
    ],
    test: [
      'Click the V30 badge → small popover appears below it. Click anywhere outside → closes. Press Escape → closes.',
      'Click Dashboard in sidebar → page should snap to top',
      'Financial Assistant → type and send → page should NOT scroll',
      'Sign out → Dashboard → Personal Starter Data section shows disabled button only, no transaction counts or categories',
      'Go to Income tab → no input should auto-focus → keyboard Tab key should work normally',
    ],
  },
  {
    version: 'V29',
    date: '5/24/2026 at 2:00 AM',
    what: [
      'Linear-style sidebar — fixed left nav with icons + labels. Shows Dashboard, Income, Budget, Accounts, Transactions, Scenarios, Savings Goals. Active page highlighted with left border accent.',
      'Sidebar collapses to icon-only (56px) or expands to full labels (220px). Toggle with [ key or the collapse button at the bottom.',
      'Keyboard navigation: press 1-7 to jump to any section instantly. Works from anywhere in the app.',
      'Compact sticky header — logo/version badge on left, utility buttons (profile, cloud, settings) on right. No more tab pills in the header.',
      'Command palette (Ctrl+K) updated to include sidebar navigation shortcuts.',
    ],
    test: [
      'Sidebar visible on left — click Dashboard, Income, Budget etc to navigate',
      'Press [ to collapse sidebar to icons only. Press [ again to expand.',
      'Press 1 → Dashboard, 2 → Income, 3 → Budget (from anywhere, not in a text field)',
      'Press Ctrl+K → command palette with all navigation shortcuts',
      'Header should show only Flow badge + profile/cloud/settings — no tab pills',
    ],
    roadmap: [
      'COMPLETE V1-V29: Full Linear-style sidebar nav, keyboard shortcuts, command palette, cloud sync, AI assistant (Gemini free), onboarding guide, all finance features.',
      'NEXT (after 1 month real use): Visual polish pass (card redesign, typography, spacing), net worth chart, year-over-year comparison.',
    ],
  },
  {
    version: 'V28',
    date: '5/24/2026 at 12:00 AM',
    what: [
      'Period bug ACTUALLY fixed this time — .flow-dollar::before { content: "$" } CSS rule was missing from the deployed file in V26/V27 even though the class was being used. Now added.',
      'Gemini model handling updated to avoid hardcoding one unavailable model.',
      'Scrollbar fix strengthened — now explicitly targets html and body elements in addition to the universal * selector.',
      'AIAssistantPanel error messages updated — detects quota errors specifically, shows correct Gemini setup steps, clarifies key is set once in Vercel and never expires.',
    ],
    test: [
      'Dashboard → Attention Needed banner → should show $63,912.91 with a real dollar sign',
      'Financial Assistant → send a message → should get a response (no quota error)',
      'Check entire app — no scrollbar visible anywhere including the main page',
    ],
    roadmap: [
      'COMPLETE V1-V28. Next: UI/UX redesign (Linear/Raycast-inspired, pending design questions).',
      'Post-redesign: Net worth chart in Dashboard, year-over-year comparison.',
    ],
  },
  {
    version: 'V27',
    date: '5/23/2026 at 11:30 PM',
    what: [
      'Setup Guide redesigned — pinned navigation (Next button always visible, never requires scrolling). Glassmorphism dark panel with gradient progress bar, cleaner tip cards, better typography.',
      'Command palette — press Ctrl+K (⌘+K on Mac) anywhere to open a searchable action menu. Navigate tabs, open guide, sync, load demo. Arrow keys to select, Enter to confirm, Escape to close.',
      'Global scrollbar removal — all scrollbars hidden site-wide for a clean interface. Scrolling still works, the bar just disappears.',
      'Escape key closes the Setup Guide.',
    ],
    test: [
      'Press Ctrl+K → command palette opens. Type "budget" → filtered results. Arrow keys navigate. Enter selects.',
      'Open Setup Guide → expand panel → Next button is always visible at the bottom without scrolling',
      'Check the entire app — no scrollbar visible anywhere',
      'Open Setup Guide → press Escape → closes',
    ],
    roadmap: [
      'COMPLETE V1-V27: Cloud sync, mobile, recurring, net worth, reconcile, rollover, dark mode, PDF export, AI (Gemini free), onboarding guide, profile panel, command palette.',
      'NEXT (after 1 month of real use): Net worth chart in Dashboard, year-over-year comparison, CSV export for tax season.',
    ],
  },
  {
    version: 'V26',
    date: '5/23/2026 at 10:00 PM',
    what: [
      'Dollar sign fix (final) — switched from JSX <span>$ approach to CSS ::before content property. CSS-generated content cannot be removed by browser extensions that manipulate DOM text nodes. This is the definitive fix.',
      'AI setup instructions updated — error message now mentions Gemini Flash as the free option with step-by-step setup instructions (aistudio.google.com → Get API key → add GEMINI_API_KEY to Vercel).',
      'AI assistant bottom note updated — now says "Free with GEMINI_API_KEY" instead of mentioning the paid Anthropic key.',
    ],
    test: [
      'Dashboard → Attention Needed banner → dollar sign before the amount should now appear even with browser extensions enabled',
      'Financial Assistant → send a message without any API key set → amber card should show Gemini setup steps',
      'Add GEMINI_API_KEY to Vercel → AI assistant should work for free',
    ],
    roadmap: [
      'COMPLETE: V1-V26. Cloud sync, mobile, budget history, rollover, dark mode, onboarding guide, profile panel, AI (Gemini free), reconcile, recurring detection, net worth in Accounts tab.',
      'POST-LAUNCH (after 1 month of real use): Net worth in Dashboard, year-over-year comparison, CSV export for tax season.',
      'DEFERRED: Recurring section is fully built and wired in Transactions tab — no code needed, just use it.',
    ],
  },
  {
    version: 'V25',
    date: '5/23/2026 at 9:00 PM',
    what: [
      'Gemini Flash AI — free alternative to Anthropic (1M tokens/day free tier). Add GEMINI_API_KEY from aistudio.google.com to Vercel. If both keys are set, Gemini is used.',
      'AI guide chat fixed — OnboardingGuide was sending systemOverride but chat.ts ignored it. Now handled correctly so the guide has its own focused context.',
      'Response field normalized — API was returning { reply } but OnboardingGuide expected { content }. Now returns { content } everywhere. Financial assistant also updated.',
      'Reconcile explanation added — Compare & Merge tab now has a plain-English explanation of what reconciliation is, what each button does, and when to use Merge Safe vs Use Cloud/Local.',
      'Rollover explanation improved — hover tooltip on the Rollover button in Budget now explains exactly what it does with a concrete example.',
    ],
    test: [
      'Add GEMINI_API_KEY to Vercel (aistudio.google.com → Get API key) → redeploy → AI assistant should work for free',
      'Open Setup Guide (profile dropdown) → ask a question in the chat → response should be guide-focused, not financial-data-focused',
      'Cloud button → Compare & Merge tab → should see plain-English explanation at the top',
      'Budget tab → hover over any "Rollover" button → tooltip should explain with a $400/$300/$500 example',
    ],
    roadmap: [
      'DEPLOYED: V19-V25 complete. Cloud sync, mobile layout, budget history, rollover, dark mode, onboarding guide, profile panel, AI chat (Gemini/Anthropic), reconcile explanation.',
      'POST-LAUNCH (after real use): Net worth tracker, year-over-year comparison, recurring transaction detection, CSV export for tax season.',
      'ON HOLD: Recurring transactions (RecurringSection.tsx exists but not wired to main flow), deeper scenario planning.',
    ],
  },
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
