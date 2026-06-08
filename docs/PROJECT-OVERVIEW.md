# Spending Tracker 2.0 — Project Overview

**One-line:** Offline-first PWA that answers "how much can I spend today?" with a self-correcting rolling daily limit.

**Owner:** Abdulla (UAE) · single user · mobile-first.

**Status:** V1 shipped 2026-05-30. See [PROJECT-STATUS.md](PROJECT-STATUS.md) for current state.

## Architecture (one-screen mental model)

```
Browser
├── localStorage:'spending-tracker:v1'   ← all data, single JSON blob
├── localStorage:'spending-tracker:lastAutoBackup'  ← undo snapshot
├── localStorage:'spending-tracker:theme-cache'     ← FOUC prevention
│
├── index.html (deployed as single inlined file)
│   ├── inline <style> (everything from src/styles/main.css)
│   ├── inline <script> per src/*.js (IIFE modules)
│   ├── inline data-URI manifest (PWA)
│   └── inline apple-touch-icon SVG
│
└── sw.js (service worker)
    ├── precaches:    './', './index.html'
    ├── nav strategy: stale-while-revalidate (cached shell, refresh in background)
    └── other:        cache-first
```

## Pure module discipline (the most important rule)

Modules in `src/` are split into two camps:

| Module | Allowed to use `new Date()` / `Math.random()` / `crypto.randomUUID()`? |
|---|---|
| `calc.js`, `store.js`, `validate.js`, `migrate.js`, `seed.js`, `format.js` | ❌ **NO.** Enforced by `npm run lint:pure`. Time and ids come in as arguments. |
| `app.js` | ✅ Yes — the ONLY module that may. |
| Components (`src/components/*.js`) and views (`src/views/*.js`) | ✅ Yes for DOM-side things; prefer passing time/ids through props. |

This makes the pure modules **deterministic** — tests pin the math forever, timezone bugs disappear.

## Data model (full)

See `docs/superpowers/specs/07-product-specification.md` §Data Architecture. Summary:

- `schemaVersion: 1` inside the payload (migrate() handles future bumps)
- `settings` — currency, salaryDay (1–28), theme, activeCycleId, locale, lastUsedCategoryId
- `categories: {id → {name, icon, color, order, isArchived, createdAt}}`
- `cycles: {id → {startDate, endDate, startBudget, archivedAt, createdAt}}`
- `transactions: {id → {cycleId, categoryId, date, amount, isRefund, isExcludedFromPace, note, createdAt, updatedAt}}`

All ids are UUID v4 strings generated in the `app` layer.

## Core math (the heart of the product)

```javascript
daysLeft     = daysBetweenInclusive(today, cycle.endDate)   // includes today
spentBefore  = sum(txns where date < today, signed by isRefund, excluding isExcludedFromPace)
remaining    = cycle.startBudget − spentBefore
todayLimit   = remaining / daysLeft
spentToday   = sum(today's txns, same rules)
aedLeftToday = todayLimit − spentToday
```

**Locked decision (2026-05-30):** today IS counted in the divisor. Day 1 of a 31-day cycle with budget 12,454.70 = 401.76 AED/day.

## Build & deploy

```
src/*.js + src/styles/main.css
  → scripts/build.js (inline everything between <!-- MODULES:START --> markers)
  → dist/index.html (single file, ~109 KB)
  + dist/sw.js (separate, ~2 KB)
  → drag dist/ folder to https://app.netlify.com/drop
```

Netlify serves both files; service worker registers on first visit; second visit is offline-capable.

## Test posture

```
npm test           # node --test, 150+ tests, no deps
npm run lint:pure  # forbids new Date / Math.random in pure modules
```

Coverage:
- `tests/store.test.js` — storage contracts, immutable mutators
- `tests/calc.test.js` — rolling-limit math, pace, historical reconstruction, summaries
- `tests/migrate.test.js` — v0→v1 migration, real fixture from legacy app
- `tests/validate.test.js` — FK integrity, unique names, cycle non-overlap
- `tests/seed.test.js` — default categories + cycle factory
- `tests/format.test.js` — money / date / escapeHTML / parseAmount
- `tests/integration.test.js` — full happy path + cutover scenarios
- `tests/perf.test.js` — 5000-txn budget enforcement
- `tests/MANUAL-CHECKLIST.md` — release-gate manual tests

## Where things live

```
v2/
├── index.html              # dev shell
├── src/
│   ├── app.js              # orchestrator (time + uuid + render pipeline)
│   ├── calc.js             # pure: math
│   ├── store.js            # pure: storage + mutators
│   ├── validate.js         # pure: state validation
│   ├── migrate.js          # pure: v0→v1, defensive backfill
│   ├── seed.js             # pure: default categories + cycle factory
│   ├── format.js           # pure: money / date / escape / parse
│   ├── i18n.js             # STRINGS.en + t()
│   ├── sw.js               # service worker (copied to dist/ by build)
│   ├── views/{home, history, pastCycle, landing}.js
│   ├── components/{sheet, toast, confirmDialog, entrySheet, editSheet, settingsSheet, onboardingSheet, cycleRolloverSheet, reassignSheet}.js
│   └── styles/main.css     # all tokens + components, RTL-ready logical properties
├── scripts/
│   ├── build.js            # inliner: src/* → dist/index.html
│   ├── dev.js              # watch + serve on :5173
│   └── lint-pure.js        # forbids Date/random in pure modules
├── tests/
│   ├── *.test.js           # node --test
│   ├── fixtures/v0-existing-app.json
│   └── MANUAL-CHECKLIST.md
├── dist/                   # build output, gitignored
└── docs/
    ├── PROJECT-OVERVIEW.md (this file)
    ├── PROJECT-STATUS.md
    ├── HANDOVER.md
    └── owner/
        ├── UPDATE.md       # for the user — deploys are safe
        └── HOWTO.md        # for the user — how to use the app
```

## V2/Future expansion (additive, no rewrite)

See `docs/superpowers/specs/08-feature-inventory.md` §V2 and §Future. Highlights:
- Arabic UI (fill `STRINGS.ar`, set `dir="rtl"`)
- Soft per-category budgets
- Trend / sparkline charts (hand-rolled SVG)
- Search, swipe-to-delete, keyboard shortcuts
- Cloud sync (Supabase/Firebase) via the existing JSON envelope as wire format
