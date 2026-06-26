# Changelog

Notable changes to Spending Tracker 2.0. Newest first.

## 2026-06-26

### Added
- **Per-category budgets + Planning page.** Set a monthly or yearly budget per category and see how
  this cycle's spend tracks against it. A planning-only overlay — it does **not** change the daily
  "left today" limit or pace.
  - **Data:** categories gain `budget` (AED, `0` = none) and `budgetPeriod` (`monthly`|`yearly`).
    Back-filled on load by `Migrate` (idempotent, **no schema bump** — old backups load cleanly);
    `Validate` enforces `budget ≥ 0` and a valid period.
  - **Calc:** `Calc.monthlyBudget` normalizes a yearly budget to its monthly slice (÷12);
    `Calc.categorySpentThisCycle` sums a category's signed spend in the active cycle (includes
    byWife/credit spends — it answers "what did this category cost"); `Calc.planSummary` builds the
    page model (rows + `totalMonthlyPlanned`). All pure, `lint:pure` clean.
  - **Plan tab:** new 4th tab (Home · History · **Plan** · Credit) listing each category with a
    spent-vs-budget progress bar (red + "Over by X" when exceeded), a "Total planned" header, and a
    global **Monthly/Annual** display toggle (×12). Zero-budget categories show "No budget set" and
    are excluded from the total.
  - **Category management consolidated:** add/rename/icon/color/delete/reassign + budget now live on
    the Plan page; the category sheet gains a Budget field and a Monthly/Yearly toggle. Settings →
    Categories is now a single "Manage categories" shortcut to the Plan tab.
  - **i18n:** full EN + AR strings.
  - **Tests:** new calc/migrate/validate/seed coverage — **278 tests**.
  - **Process:** brainstormed (with visual mockups) → spec → 12-task TDD plan
    (`docs/superpowers/specs/` + `docs/superpowers/plans/`) → subagent-per-task implementation →
    5-dimension adversarial review workflow (6 findings, all fixed).
  - Shipped to `main` (merge `a01296a`) and deployed **live** via GitHub Pages CI.

## 2026-06-12

### Added
- **Wife reimbursement tracker.** Track what your wife owes you for spends she puts on your card —
  a running `charged − paid` balance that stays out of your daily budget but counts toward the
  bank-credit total — and record her lump-sum and per-item reimbursements.
  - **Data:** transactions gain a `byWife` flag; a new top-level `wifePayments` collection holds
    her reimbursements. A `byWife` spend is forced by the Store mutators to also be `isCredit` +
    `isExcludedFromPace` (counts toward the bank, out of your pace). Back-filled on load by
    `Migrate` (idempotent, **no schema bump** — old backups load cleanly).
  - **Calc:** `Calc.wifeSummary` derives her balance — signed charged (a wife refund reduces it)
    minus her payments — plus the purchase/payment lists. A wife spend appears in
    `liabilitySummary` but never in cycle spend/pace.
  - **Credit tab:** a "Wife owes you" card (with overpaid/"Wife credit" state) plus "Her purchases"
    and "Her payments" sections. A "Record payment" sheet logs a lump sum; each purchase has a
    "She paid" button that pre-fills the amount. Removing a payment restores the balance (with Undo).
  - **Entry/Edit sheets** gain a "Wife used my card" toggle that auto-checks and **locks** the
    On-credit toggle. Home/History/bank rows show a **Wife** tag.
  - **Export:** CSV gains a `byWife` column (JSON backup covers `wifePayments` automatically).
  - **i18n:** full EN + AR strings for the feature.
  - **Tests:** new `tests/wife.test.js` (wifeSummary balance/refund/overpay/defensive + the
    budget-vs-credit invariant) plus store/migrate/validate/integration coverage. 176 → **264 tests**.
  - **Process:** brainstormed → 5-critic adversarial design validation → spec → 14-task TDD plan
    (`docs/superpowers/specs/` + `docs/superpowers/plans/`) → task-by-task implementation.
  - Shipped to `main` (commits `9d39738`…`4060475`) and deployed **live** via GitHub Pages CI.

## 2026-06-10

### Added
- **Credit (liability) tracker.** Tag any spend as "on credit" and track what is still owed
  across all cycles, with per-item and bulk "Paid" settlement.
  - **Data:** transactions gain `isCredit` / `liabilitySettled` / `settledAt`. Back-filled on
    load by `Migrate` (idempotent, **no schema bump** — old backups load cleanly).
  - **Calc:** `Calc.liabilitySummary` returns the global running total of unpaid credit (refunds
    reduce it). Credit spends still count toward budget/pace exactly as before.
  - **New "Credit" bottom tab + view** (`src/views/liabilities.js`): total owed, unpaid list with
    per-row "Paid", "Mark all paid" (confirm + undo), and a collapsible "Recently paid" with
    "Unpay". Tab shows an unpaid-count badge.
  - **Entry/Edit sheets** gain an "On credit" toggle; Home/History rows show a Credit tag.
  - **Export:** CSV gains `onCredit` / `creditSettled` columns (JSON backup covers it
    automatically).
  - **Tests:** new `tests/liabilities.test.js` (summary cross-cycle/refund/paid, settle
    transitions, migrate backfill) + integration round-trip fixture updated. 156 → **176 tests**.
  - Shipped to `main` (commit `e2164eb`) and live; this entry back-fills the docs for it.

## 2026-06-08

### Fixed
- **Transaction times displayed in the wrong timezone.** `app.js` stamped `createdAt`/`updatedAt`
  with `toISOString()` (UTC) while the rest of the app reads ISO strings as literal local wall-clock
  (e.g. `Format.fmtTime` extracts `HH:MM` verbatim). In UTC+4 (UAE) every recorded time showed 4 hours
  behind the actual entry time, and could group a late-evening spend under the wrong day.
  - **Fix:** `nowISO()` now builds the timestamp from **local** `Date` components (matching the
    long-standing behavior of `todayISO()`), so new entries display the correct local time.
  - **Back-fill:** a one-time migration (`Migrate.localizeTimestamps`, driven by the injected
    `App.localizeISO`) converts pre-existing UTC `createdAt`/`updatedAt` to local on next load.
    It is gated by a new `settings.localTimestamps` flag so it runs **exactly once** and never
    double-shifts entries that are already local. Idempotent: re-runs from the always-UTC stored
    source produce the same result until a mutation bakes it in.
  - **Tests:** +1 in `format.test.js` (local wall-clock round-trip), +3 in `migrate.test.js`
    (localizes once, respects the flag, no-op without an injected converter). 153 → **156 tests**.
  - Pure-module discipline preserved: `app.js` remains the only module touching `new Date()`;
    the migration receives the converter as an argument.

### Changed — infrastructure
- **Deployment moved from Netlify to GitHub Pages via CI.** Dropped the manual "drag `dist/` to
  Netlify Drop" flow. The `v2/` folder is now a git repo (`xCloudy75z/rem-money`); a GitHub Actions
  workflow (`.github/workflows/deploy.yml`) runs test → lint → build → deploy on every push to `main`.
  Shipping is now just `git push`. See [DEPLOYMENT.md](DEPLOYMENT.md).
- Repo restructured: source at root, `dist/` gitignored (CI builds it). The previous "built files at
  root" layout was backed up to a `pre-restructure` branch, then removed once CI was verified.
- Added `.gitattributes` (normalize line endings) and removed the obsolete `netlify.toml`.
- CI actions pinned to `checkout@v5` / `setup-node@v5` with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`
  to clear the Node 20 runner deprecation.
- CI skips deploys for doc-only pushes (`paths-ignore: ['**/*.md', 'docs/**']`); a code change still
  deploys, and `gh workflow run` forces one manually.

### Security
- Redacted and **revoked** live tokens (GitHub classic PAT, Netlify PAT, a fine-grained PAT) that had
  been listed in plaintext in `HANDOVER-2026-05-31.md`. GitHub push protection blocked the initial
  push, so they were never committed to the remote; the commit history was rewritten to exclude them.

## 2026-05-30

- **V1 shipped.** All 8 layers complete; 152 tests green. See [PROJECT-STATUS.md](PROJECT-STATUS.md)
  for the layer-by-layer breakdown and locked decisions.
