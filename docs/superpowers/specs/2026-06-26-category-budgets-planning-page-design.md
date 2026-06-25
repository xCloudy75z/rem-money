# Category Budgets + Planning Page — Design

**Date:** 2026-06-26
**Status:** Approved (brainstorm), pending implementation plan
**Author:** brainstormed with owner (Abdulla)

## One-line

Add a per-category budget (monthly or yearly) and a new **Plan** tab that lists
every category with its budget and a spent-this-cycle progress bar, plus a global
Monthly↔Annual display toggle. Planning-only overlay — it does **not** change the
daily "left today" limit or pace.

## Goals

- Set a budget per category, entered in its natural period (e.g. Car Insurance =
  6,000 / **year**; Home Groceries = 2,000 / **month**). The app converts yearly to
  monthly automatically — the owner never divides by 12.
- A new Plan page lists categories with: icon, name, budget, and a progress bar of
  spent-this-cycle vs the monthly budget. Over-budget rows turn red.
- A global **Monthly / Annual** toggle re-displays every budget (and a "Total
  planned" header) in the chosen unit. Pure display conversion (×12 / ÷12).
- The Plan page becomes the single home for all category management (add, rename,
  icon, color, reorder, delete) **plus** budget — consolidating what is today split
  between Settings and nowhere.

## Non-goals (YAGNI)

- Category budgets do **not** feed the cycle budget, daily limit, or pace. The
  `Calc.todayLimit` / `Calc.pace` math is untouched.
- No calendar-month tracking — "spent" is measured over the active pay cycle
  (25th → 24th), the same window the rest of the app already uses.
- No per-category rollover/carryover of unspent budget.
- No alerts/notifications when a category goes over.

## Decisions locked (this brainstorm)

| Decision | Value |
|---|---|
| Budget model | Planning-only overlay; daily limit/pace untouched |
| Annual handling | Per-category native period (`monthly`/`yearly`); app converts yearly→monthly |
| Period label on rows | **Not shown** as a per-row sub-label; captured silently at entry |
| Actuals | Show spent-vs-budget progress, measured over the **active cycle** |
| Category management | **Consolidated** onto the Plan page; Settings → Categories becomes a shortcut to it |
| Placement | New 4th bottom tab: Home · History · **Plan** · Credit |
| Schema | Additive, **no schema bump**; back-filled by `migrate.js` (same as Credit/Wife) |

## Data model

Two additive fields on each category record in `categories[id]`:

```
budget:       number   // amount in AED, stored in the category's native period. 0 = "no budget set".
budgetPeriod: string   // 'monthly' | 'yearly'. Default 'monthly'.
```

- `budget: 0` means no budget set → no progress bar, excluded from "Total planned".
- Old categories and old JSON backups: `migrate.js` back-fills any category missing
  these fields with `budget: 0, budgetPeriod: 'monthly'`. No `schemaVersion` bump —
  consistent with the Credit (`isCredit`…) and Wife (`byWife`) additive precedent.
- `seed.js` default categories gain `budget: 0, budgetPeriod: 'monthly'`.
- `validate.js`: `budget` is a finite number ≥ 0; `budgetPeriod` ∈ {`monthly`,`yearly`}.

## Calc — new pure functions (`calc.js`)

All deterministic, no `new Date()` — `npm run lint:pure` stays green.

```
Calc.monthlyBudget(category)
  → category.budgetPeriod === 'yearly'
      ? round2(category.budget / 12)
      : (category.budget || 0)
  // single source of truth for "the monthly slice"

Calc.categorySpentThisCycle(state, categoryId, cycleId)
  → signed sum (refunds subtract) of transactions where
    t.cycleId === cycleId && t.categoryId === categoryId, rounded to 2dp.
  // reuses existing cycleTransactions(); no exclusion filters —
  // we want the true category spend, including byWife/credit items.

Calc.planSummary(state, cycleId)
  → {
      rows: [ { categoryId, name, icon, color, order,
                spent, monthlyBudget, pct, over } ... ],   // order: category.order
      totalMonthlyPlanned: number                          // sum of monthlyBudget where budget>0
    }
  // pct = monthlyBudget>0 ? min(100, round(spent/monthlyBudget*100)) : 0
  // over = spent > monthlyBudget (and monthlyBudget>0)
  // rows include archived? NO — skip isArchived categories.
```

The Plan view renders straight off `planSummary`. The Monthly↔Annual toggle is a
**display-layer** concern in the view: monthly values shown as-is, annual values
shown as `value × 12`. No separate annual computation in calc.

> **Spent definition note:** `categorySpentThisCycle` does **not** apply the
> `isExcludedFromPace` filter. A `byWife` grocery purchase still counts against the
> Groceries budget here, even though it is excluded from the daily-limit pace. This
> is intentional — the Plan page answers "what did this category cost," not "what
> counts toward my daily allowance."

## Navigation (`app.js`)

- `ui.tab` gains `'plan'`. Render branch: `ui.tab === 'plan'` → `PlanView.render(state, { todayISO: todayISO() })`.
- Tab bar: insert Plan between History and Credit. Icon `ti-clipboard-list` (or a
  comparable glyph consistent with the existing tab icons — finalize in plan).
  Order: Home · History · **Plan** · Credit.
- Settings → "Categories" row becomes a shortcut that sets `ui.tab='plan'` and
  re-renders, instead of opening the in-Settings category manager. The old in-Settings
  category management UI is removed (its functionality moves to the Plan page).

## New view (`src/views/plan.js`)

Mirrors the structure/idioms of existing views (`home.js`, `history.js`,
`pastCycle.js`). Responsibilities:

- Header: title, Monthly/Annual segmented toggle, "Total planned" summary card.
- One row per non-archived category (sorted by `order`): icon chip, name, `spent /
  budget` figures (in the toggled unit), progress bar (category color; red when
  over), and an "Over by X" line when applicable.
- "Add category" button → opens `categorySheet` in add mode.
- Tap a row → opens `categorySheet` in edit mode (name, icon, color, budget,
  period). Reorder + delete affordances relocated from the current Settings
  category manager (delete still blocked when the category has transactions →
  reassign first, preserving existing rule).
- The toggle state is view-local UI (e.g. `ui.planUnit`), not persisted — defaults
  to Monthly each open. (Confirm during plan; trivial to persist later if wanted.)

## Edit/Add category sheet (`src/components/categorySheet.js`)

Extend the existing sheet with:
- **Budget amount** input (numeric, AED, blank/0 allowed = no budget).
- **Monthly / Yearly** segmented toggle for `budgetPeriod`.
- `onSave` payload gains `budget` and `budgetPeriod`; `app.js` create/update
  category handlers persist them via `Store`.

No new sheet component — reuse `categorySheet` so add and edit stay identical.

## Store (`store.js`)

- `addCategory` / `updateCategory` (or equivalent existing mutators) accept and
  persist `budget` and `budgetPeriod`. Immutable-update discipline unchanged.

## CSV export

Optional, low priority: include each category's `budget` and `budgetPeriod` in the
category section of the CSV export if/where categories are exported. Decide in plan;
not required for the feature to ship.

## Tests

- **`calc.test.js`**
  - `monthlyBudget`: monthly passthrough; yearly ÷ 12 with rounding (6000/yr → 500);
    `budget: 0` → 0.
  - `categorySpentThisCycle`: signed sum, refund subtracts, only the named category
    and cycle, cross-cycle isolation, includes a `byWife`/credit txn.
  - `planSummary`: pct/over correctness, `budget:0` excluded from total and bars,
    archived categories skipped, totalMonthlyPlanned sum (mixed monthly+yearly).
- **`migrate.test.js`**
  - A category record missing `budget`/`budgetPeriod` back-fills to `0`/`monthly`.
  - Existing `tests/fixtures/v0-existing-app.json` still migrates and passes.
- **`validate.test.js`**: rejects negative budget, bad `budgetPeriod`.
- All existing 264 tests stay green; `npm run lint:pure` stays clean.

## Build / deploy

No pipeline change. New `src/views/plan.js` is picked up by the existing
`scripts/build.js` inliner (add it to the module include list / markers as other
views are). Ship via the normal push-to-`main` → GitHub Actions → Pages flow.

## Open questions for the plan stage

1. Final tab icon + exact tab order styling.
2. Whether to persist the Monthly/Annual toggle choice (default: no, session-local).
3. CSV export inclusion (default: defer).
