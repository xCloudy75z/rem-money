# Category Budgets + Planning Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-category budget (entered as monthly or yearly) and a new **Plan** tab that lists every category with its budget and a spent-this-cycle progress bar, plus a global Monthly↔Annual display toggle. Category management (add/edit/delete/reassign) moves onto the Plan page.

**Architecture:** Planning-only overlay, same additive pattern as the Credit/Wife features. Two new fields on each category (`budget`, `budgetPeriod`), three new pure functions in `calc.js`, one new view (`src/views/plan.js`), and wiring in `app.js`. The daily-limit / pace math (`Calc.todayLimit`, `Calc.pace`) is **untouched**. No `schemaVersion` bump — `migrate.js` back-fills old data and old JSON backups.

**Tech Stack:** Vanilla ES5-style IIFE modules, no framework, no deps. `node --test` for tests, `scripts/build.js` inliner, `scripts/lint-pure.js` forbids `new Date`/`Math.random` in pure modules.

**Spec:** `docs/superpowers/specs/2026-06-26-category-budgets-planning-page-design.md`

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/seed.js` | Modify | Default categories carry `budget:0, budgetPeriod:'monthly'` |
| `src/migrate.js` | Modify | Back-fill `budget`/`budgetPeriod` on categories (idempotent) |
| `src/validate.js` | Modify | Validate `budget` (number ≥ 0) and `budgetPeriod` (`monthly`/`yearly`) |
| `src/calc.js` | Modify | `monthlyBudget`, `categorySpentThisCycle`, `planSummary` (all pure) |
| `src/i18n.js` | Modify | New EN + AR strings for the Plan page and the budget fields |
| `src/components/categorySheet.js` | Modify | Add Budget amount input + Monthly/Yearly toggle |
| `src/views/plan.js` | **Create** | The Plan page view (header, toggle, total, category rows) |
| `src/styles/main.css` | Modify | Append a small Plan-page CSS block |
| `index.html` | Modify | Register `src/views/plan.js` in the MODULES block |
| `src/app.js` | Modify | `plan` tab + route, unit-toggle state, category-CRUD handlers, settings shortcut |
| `src/components/settingsSheet.js` | Modify | Replace the Categories section with a "Manage categories" shortcut |
| tests `calc/migrate/validate/seed.test.js` | Modify | New unit tests |

**No change needed in `src/store.js`** — `addCategory` stores the passed object verbatim and `updateCategory` merges the patch, so the new fields flow through unchanged.

**Out of scope (do NOT implement):** drag-to-reorder categories (not implemented today either — categories render in their existing `order`); adding budgets to CSV export; touching the daily-limit / pace math; calendar-month tracking; budget rollover.

---

## Task 1: Seed default categories with budget fields

**Files:**
- Modify: `src/seed.js:12-22` (the `defaultCategories` factory)
- Test: `tests/seed.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/seed.test.js`:

```javascript
test('Seed.defaultCategories carry a zero monthly budget', () => {
  let i = 0;
  const idGen = (prefix) => prefix + '-' + (i++);
  const cats = Seed.defaultCategories('2026-05-30T00:00:00.000Z', idGen);
  Object.values(cats).forEach(c => {
    assert.strictEqual(c.budget, 0);
    assert.strictEqual(c.budgetPeriod, 'monthly');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/seed.test.js`
Expected: FAIL — `c.budget` is `undefined`, not `0`.

- [ ] **Step 3: Add the fields in the factory**

In `src/seed.js`, change the object built inside `defaultCategories` (lines 16-18) from:

```javascript
      map[id] = {
        id: id, name: c.name, icon: c.icon, color: c.color,
        order: c.order, isArchived: false, createdAt: nowISO
      };
```

to:

```javascript
      map[id] = {
        id: id, name: c.name, icon: c.icon, color: c.color,
        order: c.order, isArchived: false, createdAt: nowISO,
        budget: 0, budgetPeriod: 'monthly'
      };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/seed.test.js`
Expected: PASS (all seed tests).

- [ ] **Step 5: Commit**

```bash
git add src/seed.js tests/seed.test.js
git commit -m "feat(seed): default categories carry zero monthly budget"
```

---

## Task 2: Migrate back-fills budget fields on categories

**Files:**
- Modify: `src/migrate.js:114-123` (next to the existing txn back-fill loop)
- Test: `tests/migrate.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/migrate.test.js`:

```javascript
test('migrate back-fills budget/budgetPeriod on categories', () => {
  const Store = loadModule('store.js');
  const opts = {
    now: '2026-01-01T00:00:00.000Z',
    idGen: (p) => p + '-1',
    empty: Store.empty,
    get defaultCategories() { return {}; }
  };
  const state = {
    schemaVersion: 1,
    settings: { salaryDay: 25, currency: 'AED' },
    categories: { a: { id: 'a', name: 'A' } },
    cycles: {}, transactions: {}
  };
  const out = Migrate.migrate(state, opts);
  assert.strictEqual(out.categories.a.budget, 0);
  assert.strictEqual(out.categories.a.budgetPeriod, 'monthly');
});

test('migrate does not overwrite an existing category budget', () => {
  const Store = loadModule('store.js');
  const opts = { now: '2026-01-01T00:00:00.000Z', idGen: (p) => p + '-1', empty: Store.empty, get defaultCategories() { return {}; } };
  const state = {
    schemaVersion: 1,
    settings: { salaryDay: 25, currency: 'AED' },
    categories: { a: { id: 'a', name: 'A', budget: 2000, budgetPeriod: 'yearly' } },
    cycles: {}, transactions: {}
  };
  const out = Migrate.migrate(state, opts);
  assert.strictEqual(out.categories.a.budget, 2000);
  assert.strictEqual(out.categories.a.budgetPeriod, 'yearly');
});
```

> Note: `tests/migrate.test.js` already requires `loadModule` and `Migrate` at the top (it is the existing migrate test file). If a local `Store` is already loaded at the top of the file, drop the `const Store = loadModule('store.js');` line from each test above to avoid a redeclaration error.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/migrate.test.js`
Expected: FAIL — `out.categories.a.budget` is `undefined`.

- [ ] **Step 3: Add the back-fill loop**

In `src/migrate.js`, immediately AFTER the transaction back-fill loop (after line 123, the `}` closing the `for (var tid in txns)` loop) and BEFORE the `wifePayments` initialization comment, insert:

```javascript
    // Backfill per-category budget fields so categories created before the
    // Planning feature (and old JSON backups) load cleanly. Idempotent.
    var pcats = s.categories || {};
    for (var pcid in pcats) {
      var pc = pcats[pcid];
      if (!pc) continue;
      if (pc.budget === undefined) pc.budget = 0;
      if (pc.budgetPeriod === undefined) pc.budgetPeriod = 'monthly';
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/migrate.test.js`
Expected: PASS (all migrate tests, including the existing v0 fixture).

- [ ] **Step 5: Commit**

```bash
git add src/migrate.js tests/migrate.test.js
git commit -m "feat(migrate): back-fill category budget/budgetPeriod"
```

---

## Task 3: Validate budget fields

**Files:**
- Modify: `src/validate.js:21-28` (the category loop)
- Test: `tests/validate.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/validate.test.js`:

```javascript
(function () {
  const Validate2 = loadModule('validate.js');
  const Store2 = loadModule('store.js');

  function validBudgetState() {
    let s = Store2.empty();
    s = Store2.addCategory(s, { id: 'c', name: 'C', icon: '•', color: '#999', order: 0, isArchived: false, createdAt: '', budget: 100, budgetPeriod: 'monthly' });
    s = Store2.addCycle(s, { id: 'cy', startDate: '2026-01-01', endDate: '2026-01-31', startBudget: 1000, archivedAt: null, createdAt: '' });
    s = Store2.updateSettings(s, { activeCycleId: 'cy' });
    return s;
  }

  test('validate: a valid category budget passes', () => {
    assert.strictEqual(Validate2.validate(validBudgetState()).ok, true);
  });
  test('validate: negative budget fails', () => {
    let s = validBudgetState();
    s.categories.c.budget = -1;
    assert.strictEqual(Validate2.validate(s).ok, false);
  });
  test('validate: bad budgetPeriod fails', () => {
    let s = validBudgetState();
    s.categories.c.budgetPeriod = 'weekly';
    assert.strictEqual(Validate2.validate(s).ok, false);
  });
})();
```

> Note: if `tests/validate.test.js` already has top-level `loadModule`, `Validate`, and `Store` bindings, you may reuse them instead of the IIFE — but the IIFE above is self-contained and safe to append regardless.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/validate.test.js`
Expected: FAIL — negative budget and bad period are currently accepted.

- [ ] **Step 3: Add the validation rules**

In `src/validate.js`, inside the `for (var cid in (state.categories || {}))` loop, AFTER the line `if (c.name.length > 32) errors.push('category ' + cid + ' name >32 chars');` (line 24), insert:

```javascript
      if (c.budget !== undefined && (typeof c.budget !== 'number' || !isFinite(c.budget) || c.budget < 0))
        errors.push('category ' + cid + ' budget must be a number >= 0');
      if (c.budgetPeriod !== undefined && c.budgetPeriod !== 'monthly' && c.budgetPeriod !== 'yearly')
        errors.push('category ' + cid + ' budgetPeriod must be monthly or yearly');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/validate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/validate.js tests/validate.test.js
git commit -m "feat(validate): enforce category budget and budgetPeriod"
```

---

## Task 4: `Calc.monthlyBudget`

**Files:**
- Modify: `src/calc.js` (add function + export)
- Test: `tests/calc.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/calc.test.js`:

```javascript
// ---- Category budgets ----
test('monthlyBudget: monthly passes through', () => {
  assert.strictEqual(Calc.monthlyBudget({ budget: 2000, budgetPeriod: 'monthly' }), 2000);
});
test('monthlyBudget: yearly divides by 12', () => {
  assert.strictEqual(Calc.monthlyBudget({ budget: 6000, budgetPeriod: 'yearly' }), 500);
});
test('monthlyBudget: yearly rounds to 2dp', () => {
  assert.strictEqual(Calc.monthlyBudget({ budget: 1000, budgetPeriod: 'yearly' }), Math.round((1000 / 12) * 100) / 100);
});
test('monthlyBudget: missing/zero budget is 0', () => {
  assert.strictEqual(Calc.monthlyBudget({ budgetPeriod: 'monthly' }), 0);
  assert.strictEqual(Calc.monthlyBudget({ budget: 0, budgetPeriod: 'yearly' }), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/calc.test.js`
Expected: FAIL — `Calc.monthlyBudget is not a function`.

- [ ] **Step 3: Implement**

In `src/calc.js`, AFTER the `wifeSummary` function (after line 259, before the `return {` block), add:

```javascript
  // ---- Per-category budgets (planning overlay) ----
  // Normalize a category's budget to a monthly figure. A yearly budget is the
  // owner's natural unit (e.g. car insurance 6,000/yr); we divide to a monthly
  // slice so progress can be compared against one cycle's spend.
  function monthlyBudget(category) {
    if (!category) return 0;
    var b = Number(category.budget) || 0;
    if (b <= 0) return 0;
    if (category.budgetPeriod === 'yearly') return Math.round((b / 12) * 100) / 100;
    return Math.round(b * 100) / 100;
  }
```

Then add `monthlyBudget: monthlyBudget,` to the returned object (inside the `return { ... }` block, e.g. right after `wifeSummary: wifeSummary`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/calc.test.js`
Expected: PASS.

- [ ] **Step 5: Run the pure-module lint**

Run: `npm run lint:pure`
Expected: clean (no `new Date`/`Math.random` introduced).

- [ ] **Step 6: Commit**

```bash
git add src/calc.js tests/calc.test.js
git commit -m "feat(calc): monthlyBudget normalizes yearly to monthly"
```

---

## Task 5: `Calc.categorySpentThisCycle`

**Files:**
- Modify: `src/calc.js` (add function + export)
- Test: `tests/calc.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/calc.test.js`:

```javascript
test('categorySpentThisCycle: signed sum for one category in one cycle', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 10000);
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-26', 100));
  s = Store.addTransaction(s, mkTxn('t2', '2026-05-27', 40, { isRefund: true }));
  assert.strictEqual(Calc.categorySpentThisCycle(s, 'cat-x', 'c1'), 60);
});
test('categorySpentThisCycle: includes excluded-from-pace items (e.g. byWife)', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 10000);
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-26', 100, { isExcludedFromPace: true, byWife: true }));
  assert.strictEqual(Calc.categorySpentThisCycle(s, 'cat-x', 'c1'), 100);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/calc.test.js`
Expected: FAIL — `Calc.categorySpentThisCycle is not a function`.

- [ ] **Step 3: Implement**

In `src/calc.js`, directly AFTER the `monthlyBudget` function you just added, add:

```javascript
  // Total spent on a category within a cycle. Signed (refunds subtract).
  // Deliberately does NOT apply the isExcludedFromPace filter: the Plan page
  // answers "what did this category cost," so a byWife/credit spend still
  // counts against the category budget even though it is out of the daily pace.
  function categorySpentThisCycle(state, categoryId, cycleId) {
    var sum = 0;
    var txns = cycleTransactions(state, cycleId);
    for (var i = 0; i < txns.length; i++) {
      if (txns[i].categoryId !== categoryId) continue;
      sum += txnSignedAmount(txns[i]);
    }
    return Math.round(sum * 100) / 100;
  }
```

Then add `categorySpentThisCycle: categorySpentThisCycle,` to the returned object.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/calc.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/calc.js tests/calc.test.js
git commit -m "feat(calc): categorySpentThisCycle signed per-cycle sum"
```

---

## Task 6: `Calc.planSummary`

**Files:**
- Modify: `src/calc.js` (add function + export)
- Test: `tests/calc.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/calc.test.js`:

```javascript
test('planSummary: spent/budget/over/pct and total', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 10000);
  s = Store.updateCategory(s, 'cat-x', { budget: 2000, budgetPeriod: 'monthly' });
  s = Store.addCategory(s, { id: 'cat-y', name: 'Y', icon: '•', color: '#abc', order: 1, isArchived: false, createdAt: '', budget: 6000, budgetPeriod: 'yearly' });
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-26', 1500));                       // cat-x: 1500 / 2000
  s = Store.addTransaction(s, mkTxn('t2', '2026-05-27', 700, { categoryId: 'cat-y' })); // cat-y: 700 / 500 (over)
  const sum = Calc.planSummary(s, 'c1');
  const rx = sum.rows.find(r => r.categoryId === 'cat-x');
  const ry = sum.rows.find(r => r.categoryId === 'cat-y');
  assert.strictEqual(rx.spent, 1500);
  assert.strictEqual(rx.monthlyBudget, 2000);
  assert.strictEqual(rx.pct, 75);
  assert.strictEqual(rx.over, false);
  assert.strictEqual(ry.monthlyBudget, 500);
  assert.strictEqual(ry.pct, 100);
  assert.strictEqual(ry.over, true);
  assert.strictEqual(sum.totalMonthlyPlanned, 2500);
});
test('planSummary: zero-budget excluded from total, archived skipped', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 10000);              // cat-x has no budget
  s = Store.addCategory(s, { id: 'cat-z', name: 'Z', icon: '•', color: '#abc', order: 1, isArchived: true, createdAt: '', budget: 999, budgetPeriod: 'monthly' });
  const sum = Calc.planSummary(s, 'c1');
  assert.strictEqual(sum.totalMonthlyPlanned, 0);
  assert.ok(!sum.rows.some(r => r.categoryId === 'cat-z'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/calc.test.js`
Expected: FAIL — `Calc.planSummary is not a function`.

- [ ] **Step 3: Implement**

In `src/calc.js`, directly AFTER `categorySpentThisCycle`, add:

```javascript
  // Build the Plan-page model: one row per non-archived category (sorted by
  // order) with its monthly budget, this-cycle spend, percent, and over flag,
  // plus the total of all monthly budgets. Zero-budget categories are still
  // listed (so they can be edited) but contribute nothing to the total.
  function planSummary(state, cycleId) {
    var cats = [];
    for (var id in (state.categories || {})) {
      var c = state.categories[id];
      if (!c || c.isArchived) continue;
      cats.push(c);
    }
    cats.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var rows = [];
    var total = 0;
    for (var i = 0; i < cats.length; i++) {
      var cat = cats[i];
      var mb = monthlyBudget(cat);
      var spent = categorySpentThisCycle(state, cat.id, cycleId);
      var pct = mb > 0 ? Math.min(100, Math.round((spent / mb) * 100)) : 0;
      var over = mb > 0 && spent > mb;
      if (mb > 0) total += mb;
      rows.push({
        categoryId: cat.id, name: cat.name, icon: cat.icon, color: cat.color,
        order: cat.order, spent: spent, monthlyBudget: mb, pct: pct, over: over
      });
    }
    return { rows: rows, totalMonthlyPlanned: Math.round(total * 100) / 100 };
  }
```

Then add `planSummary: planSummary` to the returned object.

- [ ] **Step 4: Run the full suite + lint**

Run: `npm test`
Expected: PASS — all prior tests plus the new ones.

Run: `npm run lint:pure`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/calc.js tests/calc.test.js
git commit -m "feat(calc): planSummary builds the Plan-page model"
```

---

## Task 7: i18n strings

**Files:**
- Modify: `src/i18n.js` (the `en` block ~line 19 area and the `ar` block ~line 157 area)

- [ ] **Step 1: Add the EN strings**

In `src/i18n.js`, inside the `en:` object, on the line containing `tab_home: 'Home', tab_history: 'History', tab_credit: 'Credit',` (line 19), change it to add the Plan tab label:

```javascript
      tab_home: 'Home', tab_history: 'History', tab_plan: 'Plan', tab_credit: 'Credit',
```

Then, immediately AFTER that line, insert:

```javascript
      plan_title: 'Plan',
      plan_total_planned: 'Total planned',
      plan_unit_monthly: 'Monthly',
      plan_unit_annual: 'Annual',
      plan_per_month: '/mo',
      plan_per_year: '/yr',
      plan_no_budget: 'No budget set',
      plan_over_by: 'Over by {amount}',
      plan_no_categories: 'No categories yet — add one below.',
      manage_categories: 'Manage categories',
      edit_category: 'Edit category',
      cat_budget_label: 'Budget (0 = none)',
      cat_budget_period: 'Budget period',
      period_monthly: 'Monthly',
      period_yearly: 'Yearly',
```

- [ ] **Step 2: Add the AR strings**

In the `ar:` object, on the line `tab_credit: 'الائتمان',` (line 157), insert BEFORE it:

```javascript
      tab_plan: 'الخطة',
```

Then, after the `tab_credit: 'الائتمان',` line, insert:

```javascript
      plan_title: 'الخطة',
      plan_total_planned: 'إجمالي المخطط',
      plan_unit_monthly: 'شهري',
      plan_unit_annual: 'سنوي',
      plan_per_month: '/شهر',
      plan_per_year: '/سنة',
      plan_no_budget: 'لا توجد ميزانية',
      plan_over_by: 'تجاوز بـ {amount}',
      plan_no_categories: 'لا توجد فئات بعد — أضف واحدة أدناه.',
      manage_categories: 'إدارة الفئات',
      edit_category: 'تعديل الفئة',
      cat_budget_label: 'الميزانية (0 = بلا)',
      cat_budget_period: 'فترة الميزانية',
      period_monthly: 'شهري',
      period_yearly: 'سنوي',
```

- [ ] **Step 3: Sanity-check the file parses**

Run: `node -e "require('./src/i18n.js')" 2>/dev/null || node --check src/i18n.js`
Expected: no syntax error. (The file is an IIFE assigned to `var I18n`; `node --check src/i18n.js` validates syntax.)

- [ ] **Step 4: Commit**

```bash
git add src/i18n.js
git commit -m "feat(i18n): Plan page + category budget strings (en/ar)"
```

---

## Task 8: CategorySheet — budget amount + period toggle

**Files:**
- Modify: `src/components/categorySheet.js`

- [ ] **Step 1: Extend the default + local state**

In `src/components/categorySheet.js`, change the `init`/`local` setup (lines 8-9):

```javascript
    var init = opts.initial || { name: '', icon: '•', color: PALETTE[0] };
    var local = { name: init.name, icon: init.icon || '•', color: init.color || PALETTE[0] };
```

to:

```javascript
    var init = opts.initial || { name: '', icon: '•', color: PALETTE[0], budget: 0, budgetPeriod: 'monthly' };
    var local = {
      name: init.name, icon: init.icon || '•', color: init.color || PALETTE[0],
      budget: (typeof init.budget === 'number' ? init.budget : 0),
      budgetPeriod: (init.budgetPeriod === 'yearly' ? 'yearly' : 'monthly')
    };
```

- [ ] **Step 2: Add the budget + period markup**

In the same file, in the `html` string, AFTER the color section (the `'</div>'` that closes the `sheet-section` containing `cs-colors`, line 30) and BEFORE the `'<div class="sheet-footer">'` line (line 31), insert:

```javascript
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('cat_budget_label') + '</label>'
      +   '<input class="input" id="cs-budget" type="number" min="0" inputmode="decimal" value="' + (local.budget > 0 ? local.budget : '') + '">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('cat_budget_period') + '</label>'
      +   '<div class="seg" id="cs-period">'
      +     '<button type="button" class="' + (local.budgetPeriod === 'monthly' ? 'active' : '') + '" data-period="monthly">' + I18n.t('period_monthly') + '</button>'
      +     '<button type="button" class="' + (local.budgetPeriod === 'yearly' ? 'active' : '') + '" data-period="yearly">' + I18n.t('period_yearly') + '</button>'
      +   '</div>'
      + '</div>'
```

- [ ] **Step 3: Handle the period toggle clicks**

In the `wrap.addEventListener('click', ...)` handler, AFTER the color-chip block (after the `if (col) { ... return; }` block, line 46), insert:

```javascript
      var per = t.closest && t.closest('[data-period]');
      if (per) {
        local.budgetPeriod = per.getAttribute('data-period');
        wrap.querySelectorAll('#cs-period [data-period]').forEach(function (el) { el.classList.toggle('active', el === per); });
        return;
      }
```

- [ ] **Step 4: Include budget/period in the save payload**

In the `if (t.id === 'cs-save')` block, change the save lines (50-52):

```javascript
        if (!name) { wrap.querySelector('#cs-name').classList.add('error'); Toast.show({ message: 'Name is required.', variant: 'error' }); return; }
        if (opts.onSave) opts.onSave({ name: name, icon: icon, color: local.color });
        Sheet.close();
```

to:

```javascript
        if (!name) { wrap.querySelector('#cs-name').classList.add('error'); Toast.show({ message: 'Name is required.', variant: 'error' }); return; }
        var budgetRaw = parseFloat(wrap.querySelector('#cs-budget').value);
        var budget = (isFinite(budgetRaw) && budgetRaw > 0) ? Math.round(budgetRaw * 100) / 100 : 0;
        if (opts.onSave) opts.onSave({ name: name, icon: icon, color: local.color, budget: budget, budgetPeriod: local.budgetPeriod });
        Sheet.close();
```

- [ ] **Step 5: Verify syntax**

Run: `node --check src/components/categorySheet.js`
Expected: no syntax error.

- [ ] **Step 6: Commit**

```bash
git add src/components/categorySheet.js
git commit -m "feat(categorySheet): budget amount + monthly/yearly period"
```

---

## Task 9: Plan view + CSS

**Files:**
- Create: `src/views/plan.js`
- Modify: `src/styles/main.css` (append a block at the end)

- [ ] **Step 1: Create the view**

Create `src/views/plan.js` with exactly:

```javascript
var PlanView = (function () {
  'use strict';

  function _catRow(r, currency, mult) {
    var hasBudget = r.monthlyBudget > 0;
    var barColor = r.over ? '#e74c3c' : r.color;
    var bar = hasBudget
      ? '<div class="bar"><div style="width:' + r.pct + '%;background:' + barColor + '"></div></div>'
      : '';
    var amounts = hasBudget
      ? '<span class="plan-amounts">' + Format.fmtMoney(r.spent * mult, currency)
        + ' <span class="muted">/ ' + Format.fmtMoney(r.monthlyBudget * mult, currency) + '</span></span>'
      : '<span class="plan-amounts muted">' + I18n.t('plan_no_budget') + '</span>';
    var overLine = r.over
      ? '<div class="plan-over">' + I18n.t('plan_over_by', { amount: Format.fmtMoney((r.spent - r.monthlyBudget) * mult, currency) }) + '</div>'
      : '';
    return '<li class="plan-row" data-edit-cat-id="' + r.categoryId + '">'
      +   '<div class="plan-row-head">'
      +     '<span class="cat-dot" style="background:' + r.color + '33;color:' + r.color + '">' + Format.escapeHTML(r.icon || '•') + '</span>'
      +     '<span class="plan-name">' + Format.escapeHTML(r.name) + '</span>'
      +     amounts
      +     '<button class="del-cat" data-del-cat-id="' + r.categoryId + '" aria-label="Delete">×</button>'
      +   '</div>'
      +   bar
      +   overLine
      + '</li>';
  }

  function render(state, ctx) {
    var currency = state.settings.currency;
    var unit = ctx && ctx.unit === 'yearly' ? 'yearly' : 'monthly';
    var mult = unit === 'yearly' ? 12 : 1;
    var unitSuffix = unit === 'yearly' ? I18n.t('plan_per_year') : I18n.t('plan_per_month');

    var header = ''
      + '<header class="app-header">'
      +   '<div class="app-title">' + I18n.t('plan_title') + '</div>'
      +   '<button class="icon-btn" data-action="open-settings" aria-label="Settings">⚙</button>'
      + '</header>';

    var cyc = Calc.activeCycle(state);
    if (!cyc) {
      return header + '<div class="app-body"><div class="empty-state">' + I18n.t('no_active_cycle') + '</div></div>';
    }

    var sum = Calc.planSummary(state, cyc.id);

    var toggle = ''
      + '<div class="seg plan-unit-seg">'
      +   '<button class="' + (unit === 'monthly' ? 'active' : '') + '" data-action="plan-unit" data-unit="monthly">' + I18n.t('plan_unit_monthly') + '</button>'
      +   '<button class="' + (unit === 'yearly' ? 'active' : '') + '" data-action="plan-unit" data-unit="yearly">' + I18n.t('plan_unit_annual') + '</button>'
      + '</div>';

    var totalCard = ''
      + '<div class="summary-card">'
      +   '<div class="head"><span class="label">' + I18n.t('plan_total_planned') + '</span>' + toggle + '</div>'
      +   '<div class="big">' + Format.fmtMoney(sum.totalMonthlyPlanned * mult, currency)
      +     ' <small style="font-size:14px;color:var(--muted)">' + unitSuffix + '</small></div>'
      + '</div>';

    var rowsHTML = sum.rows.length
      ? sum.rows.map(function (r) { return _catRow(r, currency, mult); }).join('')
      : '<li><div class="empty-state">' + I18n.t('plan_no_categories') + '</div></li>';

    var addBtn = '<button class="btn btn-ghost btn-block" data-action="plan-add-cat" style="margin-top:6px">' + I18n.t('add_category') + '</button>';

    return header
      + '<div class="app-body">'
      +   totalCard
      +   '<ul class="plan-list">' + rowsHTML + '</ul>'
      +   addBtn
      + '</div>';
  }

  return { render: render };
})();
```

- [ ] **Step 2: Append the CSS**

Append to the END of `src/styles/main.css`:

```css
/* ===== Plan page ===== */
.plan-list { list-style: none; margin: 0; padding: 0; }
.plan-row { padding: 12px 0; border-bottom: 1px solid rgba(128,128,128,.15); }
.plan-row:last-child { border-bottom: none; }
.plan-row-head { display: flex; align-items: center; gap: 10px; }
.plan-name { flex: 1; font-weight: 600; font-size: 14px; }
.plan-amounts { font-size: 13px; white-space: nowrap; }
.plan-amounts .muted { color: var(--muted); font-weight: 400; }
.plan-row .bar { margin-top: 8px; }
.plan-over { color: #e74c3c; font-size: 12px; margin-top: 4px; }
.plan-unit-seg { transform: scale(.9); transform-origin: right center; }
.plan-row .del-cat { background: none; border: none; color: var(--muted); font-size: 18px; line-height: 1; cursor: pointer; padding: 0 4px; }
```

- [ ] **Step 3: Verify the view parses**

Run: `node --check src/views/plan.js`
Expected: no syntax error.

- [ ] **Step 4: Commit**

```bash
git add src/views/plan.js src/styles/main.css
git commit -m "feat(views): Plan page view + styles"
```

---

## Task 10: Wire the Plan tab into app.js + index.html

**Files:**
- Modify: `index.html:59` (register the view)
- Modify: `src/app.js` (state, render, tabbar, click handlers, category CRUD, settings shortcut)

- [ ] **Step 1: Register the view in the build/dev shell**

In `index.html`, after the line `<script src="src/views/liabilities.js"></script>` (line 58) and before `<script src="src/views/landing.js"></script>`, insert:

```html
<script src="src/views/plan.js"></script>
```

- [ ] **Step 2: Add `planUnit` to UI state**

In `src/app.js`, change line 37:

```javascript
  var ui = { tab: 'home', viewingCycleId: null };
```

to:

```javascript
  var ui = { tab: 'home', viewingCycleId: null, planUnit: 'monthly' };
```

- [ ] **Step 3: Render the Plan tab**

In the `render()` function, change the view-selection block (lines 237-239) from:

```javascript
    if (ui.tab === 'home') html = HomeView.render(state, { todayISO: todayISO() });
    else if (ui.tab === 'history') html = HistoryView.render(state, { todayISO: todayISO(), viewingCycleId: ui.viewingCycleId });
    else if (ui.tab === 'credit') html = LiabilitiesView.render(state, { todayISO: todayISO() });
```

to:

```javascript
    if (ui.tab === 'home') html = HomeView.render(state, { todayISO: todayISO() });
    else if (ui.tab === 'history') html = HistoryView.render(state, { todayISO: todayISO(), viewingCycleId: ui.viewingCycleId });
    else if (ui.tab === 'plan') html = PlanView.render(state, { todayISO: todayISO(), unit: ui.planUnit });
    else if (ui.tab === 'credit') html = LiabilitiesView.render(state, { todayISO: todayISO() });
```

- [ ] **Step 4: Add the Plan tab button**

In `_renderTabbar()`, change the History/Credit buttons block (lines 247-248) to insert the Plan tab between them:

```javascript
      + '<button class="tab ' + (ui.tab === 'history' ? 'active' : '') + '" data-tab="history"><div class="icon">≣</div>' + I18n.t('tab_history') + '</button>'
      + '<button class="tab ' + (ui.tab === 'plan' ? 'active' : '') + '" data-tab="plan"><div class="icon">▤</div>' + I18n.t('tab_plan') + '</button>'
      + '<button class="tab ' + (ui.tab === 'credit' ? 'active' : '') + '" data-tab="credit"><div class="icon">💳' + badge + '</div>' + I18n.t('tab_credit') + '</button>'
```

- [ ] **Step 5: Add the Plan-page click handlers**

In the global `document.addEventListener('click', ...)` handler, AFTER the `var tab = e.target.closest('.tab[data-tab]'); ...` block (after line 277) insert:

```javascript
    var planUnitBtn = e.target.closest('[data-action="plan-unit"]');
    if (planUnitBtn) { ui.planUnit = planUnitBtn.getAttribute('data-unit') === 'yearly' ? 'yearly' : 'monthly'; render(); return; }
    var planAddCat = e.target.closest('[data-action="plan-add-cat"]');
    if (planAddCat) { _openAddCategory(); return; }
    var delCatBtn = e.target.closest('[data-del-cat-id]');
    if (delCatBtn) { _deleteCategoryFlow(delCatBtn.getAttribute('data-del-cat-id')); return; }
    var editCatRow = e.target.closest('[data-edit-cat-id]');
    if (editCatRow) { _openEditCategory(editCatRow.getAttribute('data-edit-cat-id')); return; }
```

> Order matters: `delCatBtn` must be checked before `editCatRow` because the delete button sits inside the editable row.

- [ ] **Step 6: Add the category-CRUD functions**

In `src/app.js`, immediately BEFORE the `function _openSettings() {` line (line 449), insert:

```javascript
  // ===== Category management (Plan page) =====
  function _openAddCategory() {
    CategorySheet.open({
      title: I18n.t('add_category').replace(/^\+\s*/, ''),
      initial: { name: '', icon: '•', color: '#5ab19a', budget: 0, budgetPeriod: 'monthly' },
      onSave: function (input) {
        try {
          var cats = Object.values(state.categories);
          var maxOrder = cats.reduce(function (m, c) { return Math.max(m, c.order || 0); }, -1);
          var cat = {
            id: uuid('cat'), name: input.name, icon: input.icon || '•', color: input.color || '#5ab19a',
            order: maxOrder + 1, isArchived: false, createdAt: nowISO(),
            budget: input.budget || 0, budgetPeriod: input.budgetPeriod || 'monthly'
          };
          state = Store.addCategory(state, cat);
          persist(); render();
        } catch (err) { Toast.show({ message: err.message, variant: 'error' }); }
      }
    });
  }

  function _openEditCategory(id) {
    var cat = state.categories[id];
    if (!cat) return;
    CategorySheet.open({
      title: I18n.t('edit_category'),
      initial: { name: cat.name, icon: cat.icon, color: cat.color, budget: cat.budget || 0, budgetPeriod: cat.budgetPeriod || 'monthly' },
      onSave: function (input) {
        try { state = Store.updateCategory(state, id, input); persist(); render(); }
        catch (err) { Toast.show({ message: err.message, variant: 'error' }); }
      }
    });
  }

  function _deleteCategoryFlow(id) {
    var refCount = Object.values(state.transactions).filter(function (x) { return x.categoryId === id; }).length;
    if (refCount === 0) {
      state = Store.deleteCategory(state, id);
      persist(); render();
      return;
    }
    var others = Object.values(state.categories).filter(function (c) { return c.id !== id && !c.isArchived; });
    if (others.length === 0) { Toast.show({ message: 'Add another category first.', variant: 'error' }); return; }
    ReassignSheet.open({
      others: others,
      refCount: refCount,
      onPick: function (newCatId) {
        state = Store.reassignCategory(state, id, newCatId);
        state = Store.deleteCategory(state, id);
        persist(); render();
      }
    });
  }
```

- [ ] **Step 7: Swap the Settings callbacks**

In `_openSettings()`, the `SettingsSheet.open(state, { ... })` callbacks object: REMOVE the four category callbacks (`onAddCategory`, `onUpdateCategory`, `onDeleteCategory`, `onReassignAndDelete`, lines 470-492) and REPLACE them with a single shortcut:

```javascript
      onManageCategories: function () { ui.tab = 'plan'; render(); },
```

Leave `onCycleBudget`, `onSalaryDay`, `onTheme`, `onLang`, `onExportJSON`, `onExportCSV`, `onRestore`, `onResetAll` exactly as they are.

- [ ] **Step 8: Build and verify**

Run: `npm run build`
Expected: `OK Built dist/index.html (NNN KB)` — no "MODULES markers missing" error.

Run: `npm test`
Expected: all tests PASS.

Run: `npm run lint:pure`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add index.html src/app.js
git commit -m "feat(app): Plan tab, unit toggle, category CRUD on Plan page"
```

---

## Task 11: Settings — replace Categories section with a shortcut

**Files:**
- Modify: `src/components/settingsSheet.js`

- [ ] **Step 1: Replace the Categories render block**

In `src/components/settingsSheet.js`, in `_render`, replace the entire Categories `settings-section` (lines 53-64, the block starting `+ '<div class="settings-section">'` whose `<h3>` is `I18n.t('categories')` and ending just before the Display section) with:

```javascript
      + '<div class="settings-section">'
      +   '<h3>' + I18n.t('categories') + '</h3>'
      +   '<button class="btn btn-ghost btn-block" data-action="manage-categories">' + I18n.t('manage_categories') + '</button>'
      + '</div>'
```

- [ ] **Step 2: Remove the now-dead txnCounts/cats locals**

Still in `_render`, delete the now-unused locals near the top (lines 35-42): the `var cats = ...` block and the `var txnCounts = {}; ... }` loop. Keep `var cyc = Calc.activeCycle(state);` and `var theme = state.settings.theme;`. After deletion the top of `_render` reads:

```javascript
  function _render(state) {
    var cyc = Calc.activeCycle(state);
    var theme = state.settings.theme;

    return ''
```

- [ ] **Step 3: Replace the category click branches with the shortcut**

In `open()`'s click handler, REMOVE the three category branches — `if (action === 'add-cat') { ... }`, `if (action === 'edit-cat') { ... }`, and `if (action === 'delete-cat') { ... }` (lines 147-195) — and in their place add:

```javascript
      if (action === 'manage-categories') {
        Sheet.close();
        callbacks.onManageCategories();
        return;
      }
```

> Leave the `edit-budget`, `edit-salary`, `theme`, `lang`, `export-*`, `import-json`, and `reset-all` branches unchanged. `CategorySheet`, `ReassignSheet`, and `reopenSelf` may now be unused by this file — that is fine; do not remove `reopenSelf` (still used by `edit-budget`/`edit-salary`).

- [ ] **Step 4: Build + full verification**

Run: `npm run build`
Expected: `OK Built dist/index.html (...)`.

Run: `npm test`
Expected: all PASS.

Run: `npm run lint:pure`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/settingsSheet.js
git commit -m "refactor(settings): category management moves to Plan page"
```

---

## Task 12: Manual verification + checklist

No automated DOM harness exists for the views, so verify the UI by hand in the dev server.

**Files:**
- Reference: `tests/MANUAL-CHECKLIST.md` (add Plan-page checks)

- [ ] **Step 1: Run the dev server**

Run: `npm run dev`
Open: `http://localhost:5173`

- [ ] **Step 2: Walk the happy path**

Verify each:
1. A 4th **Plan** tab appears (Home · History · Plan · Credit) and opens the Plan page.
2. "Total planned" starts at `0.00 AED /mo` on a fresh install (default categories have no budget).
3. Tap **Add category** (or edit one) → the sheet shows a **Budget** field and a **Monthly/Yearly** toggle. Save `2000` monthly for one, `6000` yearly for another.
4. The yearly category shows `500.00 AED` in monthly view (6000 ÷ 12); "Total planned" includes 2000 + 500 = `2500.00 AED /mo`.
5. Flip the top **Monthly/Annual** toggle → every figure and the total switch to `/yr` (×12); progress bars do not change.
6. Log a spend in a budgeted category → its bar fills; exceed the budget → bar turns red and an "Over by …" line appears.
7. **Settings → Categories** now shows a single **Manage categories** button that closes Settings and opens the Plan tab.
8. Delete a category that has spends → the reassign sheet appears (existing behavior preserved).

- [ ] **Step 3: Add Plan-page rows to the manual checklist**

Append a short "Planning page" section to `tests/MANUAL-CHECKLIST.md` capturing items 1-8 above.

- [ ] **Step 4: Final full verification**

Run: `npm test`
Expected: all PASS.

Run: `npm run lint:pure`
Expected: clean.

Run: `npm run build`
Expected: `OK Built dist/index.html (...)`.

- [ ] **Step 5: Commit**

```bash
git add tests/MANUAL-CHECKLIST.md
git commit -m "docs(test): manual checklist for Planning page"
```

---

## Self-review notes (for the implementer)

- **Spec coverage:** data model (Tasks 1-3), calc (Tasks 4-6), navigation/4th tab (Task 10), edit sheet (Task 8), Plan view + actuals bars (Task 9), category-management consolidation (Tasks 10-11), tests (Tasks 1-6), build/deploy (no pipeline change — Task 10 step 1 registers the view). The three spec "open questions" are resolved here as: tab icon `▤`; the Monthly/Annual toggle is **session-local** (`ui.planUnit`, not persisted); CSV export is **deferred** (not implemented).
- **Type consistency:** the row object shape from `Calc.planSummary` (`categoryId, name, icon, color, order, spent, monthlyBudget, pct, over`) is exactly what `PlanView._catRow` reads. `categorySheet.onSave` emits `{ name, icon, color, budget, budgetPeriod }` — consumed verbatim by `_openAddCategory`/`_openEditCategory`.
- **Pure discipline:** the new `calc.js` functions use no `Date`/`Math.random`; `lint:pure` is run in Tasks 4, 6, 10, 11, 12.
