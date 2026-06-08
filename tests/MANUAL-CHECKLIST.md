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
