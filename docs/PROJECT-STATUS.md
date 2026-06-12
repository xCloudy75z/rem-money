# Project Status — Spending Tracker 2.0

**Last updated:** 2026-06-12

## V1 status: ✅ SHIPPED & DEPLOYED

All 8 layers complete. 264/264 tests green. Lint clean. Built artifact: ~130 KB inlined HTML + 2 KB service worker.

**Live:** https://xcloudy75z.github.io/rem-money/ — auto-deployed by CI on every push to `main`.
See [DEPLOYMENT.md](DEPLOYMENT.md) for the full pipeline and [CHANGELOG.md](CHANGELOG.md) for recent changes.

## Layer-by-layer

| Layer | Status | Notes |
|---|---|---|
| 1. Foundation + build pipeline | ✅ | package.json, build.js inliner, dev server, lint:pure script, smoke test, netlify.toml |
| 2. Data layer | ✅ | Store contracts, immutable mutators, schema migration (v0→v1), validation, seed defaults |
| 3. Calc engine + format | ✅ | Pure date math (no `new Date()`), rolling-limit (today included), pace with ±3% deadband, O(N) historical reconstruction |
| 4. UI shell + hero loop | ✅ | Home, History, Past-cycle summary, 7 sheets (entry/edit/settings/onboarding/rollover/reassign/confirm), toast, FAB, tab bar |
| 4.5. Landing page + desktop phone frame | ✅ | Landing renders on first run; CTA opens onboarding. Phone-frame chrome at viewports ≥900px. |
| 5. PWA / offline | ✅ | sw.js with stale-while-revalidate, cache versioning, update-available toast, SKIP_WAITING handler |
| 6. Polish | ✅ | Hero pulse, prefers-reduced-motion, safe-area-inset, overscroll-behavior, focus-visible rings, RTL-ready logical CSS |
| 7. Testing hardening | ✅ | Integration tests (full happy path + cutover from v0), perf tests (5000 txn budget), manual checklist |
| 8. Release docs | ✅ | UPDATE.md, HOWTO.md, PROJECT-OVERVIEW.md, this file, HANDOVER.md |

## Post-V1 features shipped

| Date | Feature | Notes |
|---|---|---|
| 2026-06-10 | **Credit (liability) tracker** | Tag spends "on credit"; new Credit tab tracks total owed across cycles with per-item + bulk "Paid" settlement. Additive fields (`isCredit`/`liabilitySettled`/`settledAt`), back-filled by migrate, no schema bump. Commit `e2164eb`. See [CHANGELOG.md](CHANGELOG.md). |
| 2026-06-12 | **Wife reimbursement tracker** | Tag spends `byWife` (forced on-credit + out-of-pace); new top-level `wifePayments` ledger; `Calc.wifeSummary` derives her `charged − paid` balance. "Wife owes you" card on the Credit tab with lump-sum + per-item "She paid" reimbursements. Additive, no schema bump, back-filled by migrate. 176 → 264 tests. Commits `9d39738`…`4060475`, deployed live via CI. See [CHANGELOG.md](CHANGELOG.md). |

## Deploy state

- **Production URL:** https://xcloudy75z.github.io/rem-money/ (GitHub Pages)
- **Repo:** https://github.com/xCloudy75z/rem-money — this `v2/` folder **is** the repo root.
- **Pipeline:** push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) runs test + lint + build, publishes `dist/` to Pages. Pages source = "GitHub Actions".
- **Build artifact:** `dist/index.html` (~130 KB) + `dist/sw.js` (2.0 KB) — built by CI, **not** committed (gitignored).
- **Local dev URL:** http://localhost:5173 (via `npm run dev`)

## Open items (V2 / deferred — not blocking V1 ship)

| ID | Item | Notes |
|---|---|---|
| infra | Pages actions on Node 20 | Forced to Node 24 via env var; will self-resolve when GitHub ships Node 24 builds of configure-pages/deploy-pages (or by June 2026 default) |
| V1 | Arabic UI | Harness in place (STRINGS.ar stub, RTL-ready CSS) |
| V2 | Per-category soft budgets | Schema-additive |
| V3 | Trend chart / sparkline | Pure SVG, no library |
| V5 | Transaction search | History tab `/`-key |
| V10 | Desktop keyboard shortcuts | `N` open entry, `,` settings |
| polish | Bundle size > 80KB target (currently 109KB) | Acceptable for one user; gzip will compress |

## Decisions locked

| Decision | Value | Date |
|---|---|---|
| Daily limit math: today included in divisor | Day 1 of 31-day cycle, AED 12,454.70 → **401.76 AED/day** | 2026-05-30 |
| Storage key | `spending-tracker:v1` (single key, version inside payload) | 2026-05-30 |
| Cycle pattern | 25th → 24th of next month (lock from FinanceOS pay-cycle convention) | 2026-05-30 |
| Pace deadband | ±3% | 2026-05-30 |
| MVP categories | Food / Transport / Bills / Fun / Other | 2026-05-30 |
| Theme default | `system` (follows OS) | 2026-05-30 |
| Container width | 440px max, same shell mobile + desktop | 2026-05-30 |
| Desktop chrome | Phone-frame at ≥900px viewport | 2026-05-30 |
| Backup envelope | `{app, schemaVersion, exportedAt, state}` | 2026-05-30 |
| Restore safety | Auto-snapshot to `lastAutoBackup` + 30s UNDO | 2026-05-30 |
| Timestamps stored as **local wall-clock** ISO (not UTC) | `createdAt`/`updatedAt` use local time so displayed times match the device clock | 2026-06-08 |
| One-time UTC→local migration, gated by `settings.localTimestamps` | Converts pre-existing UTC timestamps once, never double-shifts | 2026-06-08 |
| Deploy via GitHub Pages CI (dropped Netlify) | `git push` → Actions build + deploy | 2026-06-08 |
| Credit tracking is additive, no schema bump | `isCredit`/`liabilitySettled`/`settledAt` back-filled by migrate; old backups load cleanly | 2026-06-10 |
| Credit spends still count toward budget/pace | "On credit" only adds a liability total; it does not exclude the spend from the daily limit | 2026-06-10 |
| Wife spends excluded from pace, counted in bank-credit | `byWife` forces `isExcludedFromPace`+`isCredit`; stays out of your daily limit but counts toward what you owe the bank | 2026-06-12 |
| Wife reimbursement is an aggregate balance | `charged − paid` (no per-item settled flag); "She paid" just pre-fills a `wifePayment` amount | 2026-06-12 |
