# Manual Test Checklist — Spending Tracker 2.0

Run before any production deploy. Don't ship until everything below is ✅.

## Install + offline

- [ ] **iPhone Safari:** open URL → Share → Add to Home Screen → icon appears → tap icon launches in standalone mode (no browser chrome)
- [ ] **Android Chrome:** open URL → menu → Install app (or "Add to Home Screen") → icon appears → tap launches standalone
- [ ] **Airplane mode:** enable airplane mode → open app icon → app renders → log a spend → no errors
- [ ] **Re-enable network:** disable airplane mode → reload → spend persists (data was in localStorage)

## Viewports

- [ ] **360px** (smallest common phone): layout intact, no horizontal scroll, hero readable, FAB reachable
- [ ] **414px** (typical phone): comfortable spacing
- [ ] **768px** (tablet portrait): centered 440px column with phone frame (if ≥900px) or natural width
- [ ] **1440px** (desktop): phone frame visible with notch, centered, dark device-shell background

## Core flows

- [ ] **First open:** landing page appears with hero + 3 bullets + "Start tracking" button
- [ ] **Start tracking → onboarding:** sheet appears, budget + salary day editable, "Get started" → home shows hero
- [ ] **Add spend (3s test):** tap FAB → type 35 → tap Save → toast appears with new "left today" amount
- [ ] **Save & add another:** sheet stays open, amount clears, focus returns to amount field
- [ ] **Quick chips:** type 50, tap +25 → amount becomes 75
- [ ] **Edit:** tap a row → edit sheet pre-populates → change amount → save → hero updates
- [ ] **Delete with undo:** tap row → Delete → in-theme confirm → tap Delete → toast with UNDO → tap UNDO within 10s → spend restored
- [ ] **History tab:** all txns grouped by day, oldest at bottom
- [ ] **Cycle switcher:** tap a past cycle chip → renders past-cycle summary + read-only txns
- [ ] **Categories:** Settings → Add category → appears in entry sheet chip row
- [ ] **Delete category with txns:** prompt to reassign first; after reassign, delete succeeds
- [ ] **Theme switch:** Settings → Theme: Light/Dark/Auto — applies instantly, persists across reload
- [ ] **Export JSON:** downloads file, opens as valid JSON envelope
- [ ] **Export CSV:** downloads file, opens in Excel without Arabic mojibake (UTF-8 BOM)
- [ ] **Import JSON:** picks file → confirm replace → 30s undo toast → tap UNDO within 30s → original data back
- [ ] **Reset all:** confirm dialog → wipes data → 30s undo toast → tap UNDO → data back

## Planning page (per-category budgets)

- [ ] **Plan tab present:** bottom tab bar shows Home · History · **Plan** (▤) · Credit; tapping Plan opens the page
- [ ] **Total planned:** equals the sum of all categories' monthly budgets; zero-budget categories are excluded
- [ ] **Set a budget:** tap a category → sheet shows **Budget** field + **Monthly/Yearly** toggle → save → row shows `spent / budget` with a progress bar
- [ ] **Yearly category:** enter e.g. 6000 + Yearly → row shows the /12 monthly slice (500) in monthly view
- [ ] **Monthly↔Annual toggle:** flipping it multiplies every figure and the total by 12 (annual) / shows monthly; progress bars unchanged
- [ ] **Over budget:** exceed a category's monthly budget → bar turns red + "Over by X" line appears
- [ ] **No budget:** a category with budget 0 shows "No budget set" and no bar
- [ ] **Unallocated row:** a pinned 💰 "Unallocated" row sits at the top (not editable, no × delete) showing `cycle budget − total budgeted`; the Total planned card also shows an "Unallocated: X" line
- [ ] **Over-allocated:** budget categories beyond the cycle budget → both the row and the card line turn red and read "Over-allocated by X"
- [ ] **Unallocated follows the toggle:** flipping Monthly↔Annual scales the unallocated figure ×12 too
- [ ] **Edit persists:** change a budget → reload → new value is retained
- [ ] **Settings shortcut:** Settings → Categories shows a single **Manage categories** button that closes Settings and opens the Plan tab
- [ ] **Delete category with txns:** from the Plan page, deleting a category that has spends prompts to reassign first (existing behavior preserved)

## Import from messages (card SMS)

- [ ] **Open:** Settings → Backup → **📩 Add spends from messages** opens the paste sheet
- [ ] **Scan groups:** paste a batch of card SMS (incl. a declined line, a duplicate, a "was debited" transfer, and a junk line) → **Scan** → rows split into **Purchases** / **Needs your input** (the transfer) / **Possible repeats** (the duplicate, off) / **Not a spend** (the declined, read-only) / **Unrecognized** (the junk, read-only); the summary line counts each
- [ ] **Gate:** each row starts with an empty **category**; "Add N" stays 0 and blocked rows show a red outline until you pick categories; tapping the blocker line scrolls to the first blocked row
- [ ] **Wife toggle:** tick **Wife** on a purchase → after adding it appears under **Credit → "Wife owes you"** and is excluded from the daily pace
- [ ] **Commit + partial:** add only some rows → the added ones land in History dated per the SMS; the sheet stays open with the rest **and your edits preserved**; Undo toast removes exactly the added set
- [ ] **Dirty-check:** after editing rows, tap × / scrim → "Discard your reviewed rows?" confirm appears
- [ ] **Cycle safety:** a back-dated / out-of-cycle SMS lands in **Needs your input** with a cycle picker (never silently into the current cycle)

## App update + sheets

- [ ] **Refresh app:** Settings → App → **↻ Refresh app** shows "Getting the latest version…", reloads, and keeps all data
- [ ] **Sheet close (×):** open any sheet (Settings, entry, edit) and tap the **×** icon itself → the sheet closes (not just clicking outside/the scrim)

## Cycle rollover

- [ ] On salary day (or after), open the app → rollover sheet auto-presents
- [ ] "Start next cycle · same budget" → previous cycle archived, new cycle starts today
- [ ] "Start with a different budget" → reveals input → save → new cycle uses that budget

## Accessibility

- [ ] **Keyboard:** Tab through all visible interactive elements; Enter submits forms; Escape closes sheets
- [ ] **Focus rings:** visible on every focused element in both themes
- [ ] **Screen reader smoke test (NVDA / VoiceOver):** hero announces "X dirhams left to spend today"
- [ ] **200% font zoom:** layout reflows without clipping; primary actions still tappable
- [ ] **prefers-reduced-motion:** enable in OS → reload → no slide animations on sheets/toasts

## Data integrity

- [ ] **Corrupt localStorage:** in DevTools, set `spending-tracker:v1` to `"not json"` → reload → app recovers to empty state + shows banner
- [ ] **Quota exceeded:** simulate via DevTools (set quota to 0) → trigger a save → toast "Couldn't save — storage may be full"
- [ ] **Cross-tab sync:** open two tabs of the same URL → add a spend in tab A → tab B reflects within ~1s after the entry sheet closes
- [ ] **v0 backup import:** export a JSON from the legacy `tracker.html` → import here → all txns migrate to "Other" category in the new cycle

## Production check (on the deployed Netlify URL)

- [ ] Open the production URL on phone Safari/Chrome
- [ ] Add a spend → reload page → spend persists
- [ ] Install as app → use offline → log a spend → re-enable network → no errors
- [ ] Update flow: redeploy a new build → existing tab shows "A new version is available · Reload" toast
