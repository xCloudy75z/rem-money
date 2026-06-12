# Wife Reimbursement Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track what the user's wife owes him for using his credit card — a running balance (`charged − paid`) that stays out of his daily budget but counts toward the bank-credit total — and let him record her lump-sum and per-item reimbursements.

**Architecture:** Wife purchases are ordinary transactions tagged `byWife` (which the Store mutators force to also be `isCredit` + `isExcludedFromPace`). Her transfers are a new top-level `wifePayments` collection. The owed balance is *derived* by a new pure `Calc.wifeSummary`. A "Wife owes you" card on the existing Credit tab shows the balance and a Record-payment sheet. No schema-version bump (additive, matching the credit feature).

**Tech Stack:** Vanilla JS IIFE modules (no framework/bundler), `node --test` for tests, string-concatenation views, localStorage persistence. Build inlines `src/` into one HTML via `scripts/build.js`.

**Spec:** `docs/superpowers/specs/2026-06-12-wife-reimbursement-design.md`

**Conventions to respect:**
- `src/calc.js`, `store.js`, `migrate.js`, `validate.js`, `seed.js`, `format.js`, `i18n.js` are **pure** — no `new Date()`, `Math.random()`, or `crypto`. IDs and timestamps are injected from `app.js` (`uuid()`, `nowISO()`). `npm run lint:pure` enforces this.
- Mutators are immutable: clone via `Store.clone`, never mutate inputs.
- Run the whole suite with `npm test` (from `v2/`). Run one file with `node --test tests/wife.test.js`.

---

## File structure

**Modify:**
- `src/store.js` — `wifePayments` in `empty()`; `addWifePayment`/`deleteWifePayment`; `_enforceWife` invariant in `addTransaction`/`updateTransaction`.
- `src/migrate.js` — init `wifePayments`, backfill `byWife`.
- `src/validate.js` — validate `wifePayments` + `byWife` boolean.
- `src/calc.js` — new `wifeSummary(state)`.
- `src/i18n.js` — new EN + AR strings.
- `src/components/entrySheet.js`, `src/components/editSheet.js` — Wife toggle + credit-toggle lock.
- `src/components/settingsSheet.js` — `byWife` CSV column.
- `src/views/liabilities.js` — Wife card + purchases/payments sections; Wife tag on bank rows.
- `src/views/home.js`, `src/views/history.js` — Wife tag on rows.
- `src/app.js` — `byWife:false` default; wife-payment handlers; onboarding sample `byWife:false`.
- `src/styles/main.css` — disabled-switch style (one rule).
- `index.html` — `<script>` for the new sheet.

**Create:**
- `src/components/recordPaymentSheet.js` — the Record-payment sheet.
- `tests/wife.test.js` — unit tests for the data/calc layer.

**Modify (tests):**
- `tests/integration.test.js` — round-trip fixture gains a wife purchase + payment; existing round-trip txn gains `byWife:false`.

---

## Task 1: Store — `wifePayments` collection, mutators, and `byWife` invariant

**Files:**
- Modify: `src/store.js`
- Test: `tests/store.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/store.test.js` (before the final `module.exports` line):

```javascript
test('Store.empty() includes an empty wifePayments map', () => {
  assert.deepStrictEqual(Store.empty().wifePayments, {});
});

test('addWifePayment adds immutably; original unchanged', () => {
  const a = Store.empty();
  const p = { id: 'wp1', amount: 100, date: '2026-06-12', note: '', createdAt: '2026-06-12T10:00:00.000Z' };
  const b = Store.addWifePayment(a, p);
  assert.strictEqual(Object.keys(a.wifePayments).length, 0);
  assert.deepStrictEqual(b.wifePayments['wp1'], p);
});

test('addWifePayment throws without id or with non-positive amount', () => {
  const a = Store.empty();
  assert.throws(() => Store.addWifePayment(a, { amount: 10 }));
  assert.throws(() => Store.addWifePayment(a, { id: 'wp1', amount: 0 }));
  assert.throws(() => Store.addWifePayment(a, { id: 'wp1', amount: -5 }));
});

test('deleteWifePayment removes the key', () => {
  let s = Store.addWifePayment(Store.empty(), { id: 'wp1', amount: 100, date: '2026-06-12', note: '', createdAt: '' });
  s = Store.deleteWifePayment(s, 'wp1');
  assert.strictEqual(s.wifePayments['wp1'], undefined);
});

test('addTransaction forces isCredit + isExcludedFromPace when byWife is true', () => {
  const txn = { id: 't1', amount: 50, categoryId: 'c', cycleId: 'cy', date: '2026-06-12', byWife: true };
  const b = Store.addTransaction(Store.empty(), txn);
  assert.strictEqual(b.transactions['t1'].byWife, true);
  assert.strictEqual(b.transactions['t1'].isCredit, true);
  assert.strictEqual(b.transactions['t1'].isExcludedFromPace, true);
  // input object must NOT be mutated
  assert.strictEqual(txn.isCredit, undefined);
});

test('updateTransaction toggling byWife on forces the flags', () => {
  let s = Store.addTransaction(Store.empty(), { id: 't1', amount: 50, categoryId: 'c', cycleId: 'cy', date: '2026-06-12', isCredit: false, isExcludedFromPace: false });
  s = Store.updateTransaction(s, 't1', { byWife: true });
  assert.strictEqual(s.transactions['t1'].isCredit, true);
  assert.strictEqual(s.transactions['t1'].isExcludedFromPace, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/store.test.js`
Expected: FAIL — `Store.addWifePayment is not a function`, `wifePayments` undefined, byWife not forced.

- [ ] **Step 3: Implement in `src/store.js`**

In `empty()`, add `wifePayments: {}` after the `transactions: {}` line:

```javascript
      categories: {},
      cycles: {},
      transactions: {},
      wifePayments: {}
    };
```

Add the `_enforceWife` helper and use it in the transaction mutators. Replace the existing `addTransaction` and `updateTransaction` (lines 71–83) with:

```javascript
  // A byWife spend is on the user's card (counts toward the bank-credit total)
  // and is the wife's to repay (so it must stay out of the user's pace/limit).
  // Normalize on a copy so the caller's object is never mutated, and so a
  // non-wife txn passes through unchanged (no stray byWife field injected).
  function _enforceWife(txn) {
    if (txn && txn.byWife) {
      return Object.assign({}, txn, { isCredit: true, isExcludedFromPace: true });
    }
    return txn;
  }

  function addTransaction(state, txn) {
    if (!txn || !txn.id) throw new Error('addTransaction: txn.id required');
    var s = clone(state);
    s.transactions[txn.id] = _enforceWife(txn);
    return s;
  }

  function updateTransaction(state, id, patch) {
    if (!state.transactions[id]) throw new Error('updateTransaction: id not found');
    var s = clone(state);
    s.transactions[id] = _enforceWife(Object.assign({}, s.transactions[id], patch));
    return s;
  }
```

Add the wife-payment mutators after `deleteTransaction` (after line 89):

```javascript
  // ---- Immutable mutators: wife reimbursement payments ----
  function addWifePayment(state, payment) {
    if (!payment || !payment.id) throw new Error('addWifePayment: payment.id required');
    if (typeof payment.amount !== 'number' || payment.amount <= 0) throw new Error('addWifePayment: amount must be > 0');
    var s = clone(state);
    if (!s.wifePayments) s.wifePayments = {};
    s.wifePayments[payment.id] = payment;
    return s;
  }

  function deleteWifePayment(state, id) {
    var s = clone(state);
    if (s.wifePayments) delete s.wifePayments[id];
    return s;
  }
```

Add both to the `return {...}` object. Change the `addCycle, archiveCycle,` line region by adding after `deleteTransaction: deleteTransaction,`:

```javascript
    addTransaction: addTransaction, updateTransaction: updateTransaction, deleteTransaction: deleteTransaction,
    addWifePayment: addWifePayment, deleteWifePayment: deleteWifePayment,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/store.test.js`
Expected: PASS (including the pre-existing `addTransaction is immutable` and `Store.empty() returns canonical empty shape` tests — `_enforceWife` is a no-op for non-wife txns, and the new `wifePayments` key doesn't break the field-by-field empty-shape assertions).

- [ ] **Step 5: Commit**

```bash
git add src/store.js tests/store.test.js
git commit -m "feat(store): wifePayments collection + byWife invariant in txn mutators"
```

---

## Task 2: Migrate — initialize `wifePayments`, backfill `byWife`

**Files:**
- Modify: `src/migrate.js`
- Test: `tests/migrate.test.js`

- [ ] **Step 1: Write failing tests**

Append to `tests/migrate.test.js` (read the file first to match its existing `require`/helper style; it loads modules via `loadModule` from `store.test.js`, like the other test files):

```javascript
test('migrate initializes wifePayments when absent', () => {
  const input = {
    schemaVersion: 1,
    settings: { currency: 'AED', salaryDay: 25, localTimestamps: true },
    categories: {}, cycles: {}, transactions: {}
  };
  const out = Migrate.migrate(input, { now: '2026-06-12T00:00:00.000Z', idGen: (p) => p + '-1', empty: Store.empty });
  assert.deepStrictEqual(out.wifePayments, {});
});

test('migrate preserves existing wifePayments', () => {
  const input = {
    schemaVersion: 1,
    settings: { currency: 'AED', salaryDay: 25, localTimestamps: true },
    categories: {}, cycles: {}, transactions: {},
    wifePayments: { wp1: { id: 'wp1', amount: 100, date: '2026-06-10', note: '', createdAt: '' } }
  };
  const out = Migrate.migrate(input, { now: '2026-06-12T00:00:00.000Z', idGen: (p) => p + '-1', empty: Store.empty });
  assert.strictEqual(out.wifePayments.wp1.amount, 100);
});

test('migrate backfills byWife:false on legacy transactions', () => {
  const input = {
    schemaVersion: 1,
    settings: { currency: 'AED', salaryDay: 25, localTimestamps: true },
    categories: {}, cycles: {},
    transactions: { t1: { id: 't1', date: '2026-06-01', amount: 50, categoryId: 'c', cycleId: 'cy' } }
  };
  const out = Migrate.migrate(input, { now: '2026-06-12T00:00:00.000Z', idGen: (p) => p + '-1', empty: Store.empty });
  assert.strictEqual(out.transactions.t1.byWife, false);
});
```

Confirm the top of `tests/migrate.test.js` already loads `Store` via `loadModule('store.js')`; if not, add `const Store = loadModule('store.js');` next to the existing `loadModule` calls.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/migrate.test.js`
Expected: FAIL — `out.wifePayments` is `undefined`, `out.transactions.t1.byWife` is `undefined`.

- [ ] **Step 3: Implement in `src/migrate.js`**

In the transaction backfill loop (lines 116–122), add a `byWife` line alongside the credit fields:

```javascript
    for (var tid in txns) {
      var t = txns[tid];
      if (!t) continue;
      if (t.isCredit === undefined) t.isCredit = false;
      if (t.liabilitySettled === undefined) t.liabilitySettled = false;
      if (t.settledAt === undefined) t.settledAt = null;
      if (t.byWife === undefined) t.byWife = false;
    }

    // Wife reimbursement ledger: initialize the collection if this state predates
    // the feature (or came from an old JSON backup). Idempotent.
    if (!s.wifePayments || typeof s.wifePayments !== 'object') s.wifePayments = {};

    return s;
```

(The `if (!s.wifePayments ...)` line goes immediately before `return s;`.)

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/migrate.test.js`
Expected: PASS (all, including the existing credit-backfill tests).

- [ ] **Step 5: Commit**

```bash
git add src/migrate.js tests/migrate.test.js
git commit -m "feat(migrate): init wifePayments + backfill byWife"
```

---

## Task 3: Validate — `wifePayments` shape and `byWife` boolean

**Files:**
- Modify: `src/validate.js`
- Test: `tests/validate.test.js`

- [ ] **Step 1: Write failing tests**

Read `tests/validate.test.js` first to match its helpers (it builds a valid state, likely via a local helper or `Store.empty()` + seed). Append tests that build on whatever "valid base state" helper exists; if there is none, construct one inline like this:

```javascript
test('validate accepts a well-formed wifePayment', () => {
  const s = Store.empty();
  s.categories['c'] = { id: 'c', name: 'Other' };
  s.cycles['cy'] = { id: 'cy', startDate: '2026-06-01', endDate: '2026-06-30', startBudget: 1000 };
  s.settings.activeCycleId = 'cy';
  s.wifePayments['wp1'] = { id: 'wp1', amount: 100, date: '2026-06-12', note: 'ok', createdAt: '2026-06-12T10:00:00.000Z' };
  assert.strictEqual(Validate.validate(s).ok, true, JSON.stringify(Validate.validate(s).errors));
});

test('validate rejects a wifePayment with non-positive amount', () => {
  const s = Store.empty();
  s.categories['c'] = { id: 'c', name: 'Other' };
  s.cycles['cy'] = { id: 'cy', startDate: '2026-06-01', endDate: '2026-06-30', startBudget: 1000 };
  s.wifePayments['wp1'] = { id: 'wp1', amount: 0, date: '2026-06-12', note: '', createdAt: '' };
  assert.strictEqual(Validate.validate(s).ok, false);
});

test('validate rejects a wifePayment with malformed date', () => {
  const s = Store.empty();
  s.categories['c'] = { id: 'c', name: 'Other' };
  s.cycles['cy'] = { id: 'cy', startDate: '2026-06-01', endDate: '2026-06-30', startBudget: 1000 };
  s.wifePayments['wp1'] = { id: 'wp1', amount: 50, date: 'June 12', note: '', createdAt: '' };
  assert.strictEqual(Validate.validate(s).ok, false);
});

test('validate rejects a transaction whose byWife is not boolean', () => {
  const s = Store.empty();
  s.categories['c'] = { id: 'c', name: 'Other' };
  s.cycles['cy'] = { id: 'cy', startDate: '2026-06-01', endDate: '2026-06-30', startBudget: 1000 };
  s.transactions['t1'] = { id: 't1', date: '2026-06-12', amount: 10, categoryId: 'c', cycleId: 'cy', byWife: 'yes' };
  assert.strictEqual(Validate.validate(s).ok, false);
});
```

Ensure `Store` is loaded at the top of `tests/validate.test.js` (`const Store = loadModule('store.js');`).

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/validate.test.js`
Expected: FAIL — the malformed-payment and non-boolean-`byWife` cases currently return `ok: true`.

- [ ] **Step 3: Implement in `src/validate.js`**

In the transaction loop (after line 52, the note-length check), add the `byWife` type check:

```javascript
      if (typeof t.note === 'string' && t.note.length > 280) errors.push('txn ' + tid + ' note >280 chars');
      if (t.byWife !== undefined && typeof t.byWife !== 'boolean') errors.push('txn ' + tid + ' byWife must be boolean');
    }
```

After the transaction loop closes (before `return { ok: ... }`), add the wifePayments loop:

```javascript
    for (var pid in (state.wifePayments || {})) {
      var p = state.wifePayments[pid];
      if (!p || !p.id) { errors.push('wifePayment ' + pid + ' missing id'); continue; }
      if (typeof p.amount !== 'number' || p.amount <= 0) errors.push('wifePayment ' + pid + ' amount must be > 0');
      if (!ISO_DATE.test(p.date || '')) errors.push('wifePayment ' + pid + ' has malformed date');
      if (typeof p.note === 'string' && p.note.length > 280) errors.push('wifePayment ' + pid + ' note >280 chars');
    }

    return { ok: errors.length === 0, errors: errors };
```

- [ ] **Step 4: Run to verify they pass**

Run: `node --test tests/validate.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/validate.js tests/validate.test.js
git commit -m "feat(validate): wifePayments shape + byWife boolean checks"
```

---

## Task 4: Calc — `wifeSummary` + the budget/credit invariants

**Files:**
- Modify: `src/calc.js`
- Test: `tests/wife.test.js` (create)

- [ ] **Step 1: Write the failing test file**

Create `tests/wife.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');

const Calc = loadModule('calc.js');
const Store = loadModule('store.js');

function mkTxn(id, amount, opts) {
  return Object.assign({
    id: id, cycleId: 'c1', categoryId: 'cat', date: '2026-06-01', amount: amount,
    isRefund: false, isExcludedFromPace: false,
    isCredit: false, liabilitySettled: false, settledAt: null,
    byWife: false, note: '', createdAt: '', updatedAt: ''
  }, opts || {});
}

function stateWith(txns, payments) {
  var s = Store.empty();
  (txns || []).forEach(function (t) { s.transactions[t.id] = t; });
  (payments || []).forEach(function (p) { s.wifePayments[p.id] = p; });
  return s;
}

function pay(id, amount, date) {
  return { id: id, amount: amount, date: date || '2026-06-05', note: '', createdAt: '' };
}

test('wifeSummary: charged minus paid = balance', () => {
  const s = stateWith(
    [mkTxn('t1', 100, { byWife: true, isCredit: true }), mkTxn('t2', 50, { byWife: true, isCredit: true })],
    [pay('p1', 80)]
  );
  const sum = Calc.wifeSummary(s);
  assert.strictEqual(sum.charged, 150);
  assert.strictEqual(sum.paid, 80);
  assert.strictEqual(sum.balance, 70);
  assert.strictEqual(sum.purchases.length, 2);
  assert.strictEqual(sum.payments.length, 1);
});

test('wifeSummary: a wife refund reduces charged', () => {
  const s = stateWith(
    [mkTxn('t1', 100, { byWife: true, isCredit: true }), mkTxn('t2', 25, { byWife: true, isCredit: true, isRefund: true })],
    []
  );
  assert.strictEqual(Calc.wifeSummary(s).charged, 75);
  assert.strictEqual(Calc.wifeSummary(s).balance, 75);
});

test('wifeSummary: overpayment yields a negative balance', () => {
  const s = stateWith([mkTxn('t1', 100, { byWife: true, isCredit: true })], [pay('p1', 150)]);
  assert.strictEqual(Calc.wifeSummary(s).balance, -50);
});

test('wifeSummary: ignores non-wife transactions', () => {
  const s = stateWith([mkTxn('t1', 100, { isCredit: true }), mkTxn('t2', 40, { byWife: true, isCredit: true })], []);
  assert.strictEqual(Calc.wifeSummary(s).charged, 40);
});

test('wifeSummary: empty state is zero', () => {
  const sum = Calc.wifeSummary(Store.empty());
  assert.strictEqual(sum.charged, 0);
  assert.strictEqual(sum.paid, 0);
  assert.strictEqual(sum.balance, 0);
});

test('wifeSummary: handles a state with no wifePayments key (defensive)', () => {
  const s = Store.empty();
  delete s.wifePayments;
  s.transactions['t1'] = mkTxn('t1', 60, { byWife: true, isCredit: true });
  assert.strictEqual(Calc.wifeSummary(s).balance, 60);
});

test('invariant: a byWife credit spend counts in liabilitySummary but is excluded from pace', () => {
  // byWife spends are stored via Store.addTransaction, which forces the flags.
  let s = Store.empty();
  s.cycles['c1'] = { id: 'c1', startDate: '2026-06-01', endDate: '2026-06-30', startBudget: 3000 };
  s = Store.addTransaction(s, { id: 't1', cycleId: 'c1', categoryId: 'cat', date: '2026-06-01', amount: 200, byWife: true });
  // counts toward what is owed to the bank:
  assert.strictEqual(Calc.liabilitySummary(s).outstanding, 200);
  // but NOT toward cycle spend / pace (isExcludedFromPace forced true):
  assert.strictEqual(Calc.cycleTotalSpent(s, 'c1'), 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/wife.test.js`
Expected: FAIL — `Calc.wifeSummary is not a function`.

- [ ] **Step 3: Implement `wifeSummary` in `src/calc.js`**

Add this function immediately after `liabilitySummary` (after line 220), reusing the existing `txnSignedAmount` helper:

```javascript
  // ---- Wife reimbursement overlay (global, across ALL cycles) ----
  // A byWife spend is excluded from the user's pace/limit and counts toward the
  // bank-credit total; SEPARATELY the wife owes the user for it. Her balance is
  // derived: charged (signed, so a wife refund reduces it) minus her payments.
  function wifeSummary(state) {
    var purchases = [];
    var charged = 0;
    for (var tid in state.transactions) {
      var t = state.transactions[tid];
      if (!t || !t.byWife) continue;
      purchases.push(t);
      charged += txnSignedAmount(t);
    }
    var payments = [];
    var paid = 0;
    var wp = state.wifePayments || {};
    for (var pid in wp) {
      var p = wp[pid];
      if (!p) continue;
      payments.push(p);
      paid += Number(p.amount) || 0;
    }
    function _byDateDesc(a, b) {
      return (b.date || '').localeCompare(a.date || '')
        || (b.createdAt || '').localeCompare(a.createdAt || '');
    }
    purchases.sort(_byDateDesc);
    payments.sort(_byDateDesc);
    charged = Math.round(charged * 100) / 100;
    paid = Math.round(paid * 100) / 100;
    return {
      charged: charged,
      paid: paid,
      balance: Math.round((charged - paid) * 100) / 100,
      purchases: purchases,
      payments: payments
    };
  }
```

Add `wifeSummary: wifeSummary` to the `return {...}` object (after `liabilitySummary: liabilitySummary`).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/wife.test.js`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Verify the pure-module lint still passes**

Run: `npm run lint:pure`
Expected: exit 0 (no `Date`/`Math.random`/`crypto` introduced into `calc.js`).

- [ ] **Step 6: Commit**

```bash
git add src/calc.js tests/wife.test.js
git commit -m "feat(calc): wifeSummary derived balance + invariant tests"
```

---

## Task 5: i18n — English + Arabic strings

**Files:**
- Modify: `src/i18n.js`

- [ ] **Step 1: Add English strings**

In `STRINGS.en`, after the `credit_paid_tag: 'Credit · paid',` line (line 115), add:

```javascript
      wife_tag: 'Wife',
      wife_card_title: 'Wife owes you',
      wife_credit_label: 'Wife credit (overpaid)',
      wife_settled: 'All settled — she owes you nothing.',
      wife_record_payment: 'Record payment',
      wife_she_paid: 'She paid',
      wife_purchases_section: 'Her purchases',
      wife_payments_section: 'Her payments',
      wife_remove_payment: 'Remove',
      wife_payment_title: 'Record wife payment',
      wife_payment_amount: 'Amount received (AED)',
      wife_always_credit: 'Wife purchases are always on credit.',
      on_wife: 'Wife used my card (she reimburses me)',
      toast_wife_payment_added: 'Payment recorded · {balance} still owed.',
      toast_wife_payment_removed: 'Payment removed · {balance} owed.',
```

- [ ] **Step 2: Add Arabic strings**

In `STRINGS.ar`, after the `credit_paid_tag: 'ائتمان · مسدّد',` line (line 258), add:

```javascript
      wife_tag: 'الزوجة',
      wife_card_title: 'الزوجة مدينة لك',
      wife_credit_label: 'رصيد للزوجة (دفعت زيادة)',
      wife_settled: 'تمت التسوية — لا تدين لك بشيء.',
      wife_record_payment: 'تسجيل دفعة',
      wife_she_paid: 'دفعت',
      wife_purchases_section: 'مشترياتها',
      wife_payments_section: 'دفعاتها',
      wife_remove_payment: 'إزالة',
      wife_payment_title: 'تسجيل دفعة الزوجة',
      wife_payment_amount: 'المبلغ المستلم (درهم)',
      wife_always_credit: 'مشتريات الزوجة دائماً على الائتمان.',
      on_wife: 'الزوجة استخدمت بطاقتي (تعيد المبلغ لي)',
      toast_wife_payment_added: 'تم تسجيل الدفعة · {balance} لا يزال مستحقاً.',
      toast_wife_payment_removed: 'تمت إزالة الدفعة · {balance} مستحق.',
```

- [ ] **Step 3: Sanity-check the module still parses and stays pure**

Run: `npm run lint:pure`
Expected: exit 0 (i18n.js parses and introduces no `Date`/`Math.random`/`crypto`).

- [ ] **Step 4: Commit**

```bash
git add src/i18n.js
git commit -m "feat(i18n): wife reimbursement strings (en + ar)"
```

---

## Task 6: Entry & Edit sheets — Wife toggle + credit-toggle lock

**Files:**
- Modify: `src/components/entrySheet.js`
- Modify: `src/components/editSheet.js`

- [ ] **Step 1: EntrySheet — add `byWife` to local state**

In `src/components/entrySheet.js`, change the `local` initializer (line 17) to include `byWife`:

```javascript
    var local = { categoryId: defaultCatId, date: todayISO, isRefund: false, isCredit: false, byWife: false };
```

- [ ] **Step 2: EntrySheet — add the Wife toggle row**

After the on-credit toggle row (lines 62–65), add a Wife toggle row:

```javascript
      + '<div class="toggle-row">'
      +   '<span>' + I18n.t('on_credit') + '</span>'
      +   '<button class="switch" id="es-credit" aria-pressed="false"></button>'
      + '</div>'
      + '<div class="toggle-row">'
      +   '<span>' + I18n.t('on_wife') + '</span>'
      +   '<button class="switch" id="es-wife" aria-pressed="false"></button>'
      + '</div>'
```

- [ ] **Step 3: EntrySheet — include `byWife` in the saved payload**

In `doSave`, change the `onSave({...})` call (line 87) to pass `byWife`:

```javascript
      onSave({ amount: amt, categoryId: local.categoryId, date: local.date, note: note, isRefund: local.isRefund, isCredit: local.isCredit, byWife: local.byWife });
```

- [ ] **Step 4: EntrySheet — wire the Wife toggle (and lock credit)**

In the click handler, add a branch before the `if (t.id === 'es-save')` branch (around line 137). Also define a small helper to lock the credit toggle visually:

```javascript
      if (t.id === 'es-wife') {
        local.byWife = !local.byWife;
        t.classList.toggle('on', local.byWife);
        t.setAttribute('aria-pressed', String(local.byWife));
        var creditBtn = wrap.querySelector('#es-credit');
        if (local.byWife) {
          local.isCredit = true;
          creditBtn.classList.add('on', 'disabled');
          creditBtn.setAttribute('aria-pressed', 'true');
        } else {
          creditBtn.classList.remove('disabled');
        }
        return;
      }
```

In the existing `if (t.id === 'es-credit')` branch (line 132), make it ignore clicks while locked:

```javascript
      if (t.id === 'es-credit') {
        if (t.classList.contains('disabled')) return;
        local.isCredit = !local.isCredit;
        t.classList.toggle('on', local.isCredit);
        t.setAttribute('aria-pressed', String(local.isCredit));
        return;
      }
```

- [ ] **Step 5: EditSheet — mirror the same changes**

In `src/components/editSheet.js`, change `local` (line 5) to include `byWife`:

```javascript
    var local = { categoryId: txn.categoryId, date: txn.date, isRefund: !!txn.isRefund, isCredit: !!txn.isCredit, byWife: !!txn.byWife };
```

After the on-credit toggle row (lines 38–41), add the Wife toggle row reflecting current state:

```javascript
      + '<div class="toggle-row">'
      +   '<span>' + I18n.t('on_credit') + '</span>'
      +   '<button class="switch ' + (local.isCredit ? 'on' : '') + (local.byWife ? ' disabled' : '') + '" id="ed-credit" aria-pressed="' + local.isCredit + '"></button>'
      + '</div>'
      + '<div class="toggle-row">'
      +   '<span>' + I18n.t('on_wife') + '</span>'
      +   '<button class="switch ' + (local.byWife ? 'on' : '') + '" id="ed-wife" aria-pressed="' + local.byWife + '"></button>'
      + '</div>'
```

In the click handler, guard `ed-credit` and add `ed-wife` (mirror entrySheet). Replace the `ed-credit` branch (lines 71–75) and add the wife branch:

```javascript
      if (t.id === 'ed-credit') {
        if (t.classList.contains('disabled')) return;
        local.isCredit = !local.isCredit;
        t.classList.toggle('on', local.isCredit);
        t.setAttribute('aria-pressed', String(local.isCredit));
        return;
      }
      if (t.id === 'ed-wife') {
        local.byWife = !local.byWife;
        t.classList.toggle('on', local.byWife);
        t.setAttribute('aria-pressed', String(local.byWife));
        var creditBtn = wrap.querySelector('#ed-credit');
        if (local.byWife) {
          local.isCredit = true;
          creditBtn.classList.add('on', 'disabled');
          creditBtn.setAttribute('aria-pressed', 'true');
        } else {
          creditBtn.classList.remove('disabled');
        }
        return;
      }
```

In the `ed-save` branch, include `byWife` in the patch (line 82):

```javascript
        onAction('save', { amount: amt, categoryId: local.categoryId, date: date, note: note, isRefund: local.isRefund, isCredit: local.isCredit, byWife: local.byWife });
```

- [ ] **Step 6: Add the disabled-switch CSS**

In `src/styles/main.css`, after the `.switch.on::after` rule (line 147), add:

```css
.switch.disabled { opacity: 0.55; pointer-events: none; }
```

- [ ] **Step 7: Build to confirm no syntax errors**

Run: `npm run build`
Expected: exit 0, `dist/index.html` rewritten.

- [ ] **Step 8: Commit**

```bash
git add src/components/entrySheet.js src/components/editSheet.js src/styles/main.css
git commit -m "feat(sheets): Wife toggle that locks On-credit in entry + edit"
```

---

## Task 7: Record-payment sheet (new component)

**Files:**
- Create: `src/components/recordPaymentSheet.js`
- Modify: `index.html`

- [ ] **Step 1: Create the component**

Create `src/components/recordPaymentSheet.js` (modeled on `entrySheet.js`'s Sheet usage; `onSave` receives `{ amount, date, note }`, the caller stamps `id`/`createdAt`):

```javascript
var RecordPaymentSheet = (function () {
  'use strict';

  // opts: { prefillAmount (number|null), todayISO, onSave({amount,date,note}) }
  function open(opts) {
    var prefill = (typeof opts.prefillAmount === 'number' && opts.prefillAmount > 0)
      ? opts.prefillAmount.toFixed(2) : '';

    var html = ''
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('wife_payment_amount') + '</label>'
      +   '<input class="input input-lg" id="rp-amount" inputmode="decimal" placeholder="0.00" value="' + prefill + '">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('when') + '</label>'
      +   '<input type="date" class="input" id="rp-date" value="' + Format.escapeHTML(opts.todayISO) + '">'
      + '</div>'
      + '<div class="sheet-section">'
      +   '<label>' + I18n.t('note') + '</label>'
      +   '<input class="input" id="rp-note" maxlength="280" placeholder="' + Format.escapeHTML(I18n.t('note_placeholder')) + '">'
      + '</div>'
      + '<div class="sheet-footer">'
      +   '<button class="btn btn-primary btn-block" id="rp-save">' + I18n.t('wife_record_payment') + '</button>'
      + '</div>';

    var wrap = Sheet.open({ contentHTML: html, title: I18n.t('wife_payment_title') });
    var amountEl = wrap.querySelector('#rp-amount');
    amountEl.focus();

    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT') {
        e.preventDefault();
        wrap.querySelector('#rp-save').click();
      }
    });

    wrap.addEventListener('click', function (e) {
      if (e.target.id !== 'rp-save') return;
      var amt = Format.parseAmount(amountEl.value);
      if (!(amt > 0)) { amountEl.focus(); amountEl.classList.add('error'); return; }
      var date = wrap.querySelector('#rp-date').value || opts.todayISO;
      var note = (wrap.querySelector('#rp-note').value || '').trim();
      opts.onSave({ amount: amt, date: date, note: note });
      Sheet.close();
    });
  }

  return { open: open };
})();
```

- [ ] **Step 2: Wire the script into `index.html`**

After the `editSheet.js` line (line 47), add:

```html
<script src="src/components/recordPaymentSheet.js"></script>
```

- [ ] **Step 3: Build to confirm it loads**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/recordPaymentSheet.js index.html
git commit -m "feat: record-payment sheet component"
```

---

## Task 8: app.js — default `byWife`, payment handlers, onboarding sample

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Default `byWife:false` on new transactions**

In `_onAddTxn`, add `byWife: false` to the defaults object (lines 296–302):

```javascript
    var txn = Object.assign({
      id: uuid('txn'),
      cycleId: state.settings.activeCycleId,
      createdAt: now, updatedAt: now,
      isExcludedFromPace: false,
      isCredit: false, liabilitySettled: false, settledAt: null,
      byWife: false
    }, txnInput);
```

(The Store mutator will force `isCredit`/`isExcludedFromPace` when `txnInput.byWife` is true, so the order here is safe.)

- [ ] **Step 2: Set `byWife:false` on onboarding sample txns**

In `_onOnboardingComplete`, the sample txn object (lines 138–142) — add `byWife: false`:

```javascript
        var txn = {
          id: uuid('txn'), cycleId: cycle.id, categoryId: cat.id, date: startDate,
          amount: amt, isRefund: false, isExcludedFromPace: false,
          byWife: false,
          note: 'Sample', createdAt: now, updatedAt: now
        };
```

- [ ] **Step 3: Add click-handler branches for the wife-payment actions**

In the document click handler, add these branches **before** the `var editRow = e.target.closest('[data-edit-id]');` line (line 285) so the "She paid" button on a purchase row is handled before the row's edit fallthrough:

```javascript
    var recordWifePay = e.target.closest('[data-action="record-wife-payment"]');
    if (recordWifePay) { _openWifePayment(null); return; }
    var prefillWifePay = e.target.closest('[data-action="wife-prefill-pay"]');
    if (prefillWifePay) { _openWifePayment(Number(prefillWifePay.getAttribute('data-amount'))); return; }
    var removeWifePay = e.target.closest('[data-action="remove-wife-payment"]');
    if (removeWifePay) { _removeWifePayment(removeWifePay.getAttribute('data-payment-id')); return; }
```

- [ ] **Step 4: Add the handler functions**

After `_markAllLiabilitiesPaid` (after line 401), add:

```javascript
  // ===== Wife reimbursement =====
  function _openWifePayment(prefillAmount) {
    RecordPaymentSheet.open({
      prefillAmount: (typeof prefillAmount === 'number' && prefillAmount > 0) ? prefillAmount : null,
      todayISO: todayISO(),
      onSave: function (input) {
        var payment = {
          id: uuid('wpay'),
          amount: input.amount,
          date: input.date,
          note: input.note || '',
          createdAt: nowISO()
        };
        state = Store.addWifePayment(state, payment);
        persist(); render();
        var bal = Calc.wifeSummary(state).balance;
        Toast.show({
          message: I18n.t('toast_wife_payment_added', { balance: Format.fmtMoney(bal, state.settings.currency) }),
          variant: 'success'
        });
      }
    });
  }

  function _removeWifePayment(id) {
    var removed = state.wifePayments && state.wifePayments[id];
    if (!removed) return;
    state = Store.deleteWifePayment(state, id);
    persist(); render();
    var bal = Calc.wifeSummary(state).balance;
    Toast.show({
      message: I18n.t('toast_wife_payment_removed', { balance: Format.fmtMoney(bal, state.settings.currency) }),
      action: I18n.t('undo'),
      onAction: function () { state = Store.addWifePayment(state, removed); persist(); render(); },
      variant: 'success'
    });
  }
```

- [ ] **Step 5: Build to confirm no syntax errors**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app.js
git commit -m "feat(app): wife-payment record/remove handlers + byWife defaults"
```

---

## Task 9: Liabilities view — Wife card, sections, and Wife tag on bank rows

**Files:**
- Modify: `src/views/liabilities.js`

- [ ] **Step 1: Tag wife items in the bank rows**

In `_row` (the bank-credit row builder), add a Wife tag to the top line. Change the top-line construction (line 16) from:

```javascript
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + '</div>'
```

to:

```javascript
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + (t.byWife ? ' · ' + I18n.t('wife_tag') : '') + '</div>'
```

- [ ] **Step 2: Add a wife-purchase row builder**

Add this helper function inside the IIFE, after `_row` (after line 22):

```javascript
  function _wifePurchaseRow(t, state) {
    var cat = state.categories[t.categoryId] || { name: '—', icon: '•', color: '#999' };
    var when = Format.fmtDateShort(t.date);
    var sub = when + (t.note ? ' · ' + Format.escapeHTML(t.note) : '');
    var amount = (t.isRefund ? '−' : '') + Number(t.amount).toFixed(2);
    return '<li class="txn credit-row" data-edit-id="' + t.id + '">'
      +   '<span class="cat-dot" style="background:' + cat.color + '33;color:' + cat.color + '">' + Format.escapeHTML(cat.icon || '•') + '</span>'
      +   '<div class="main">'
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + '</div>'
      +     '<div class="bot-line">' + sub + '</div>'
      +   '</div>'
      +   '<div class="amount ' + (t.isRefund ? 'refund' : '') + '">' + amount + '</div>'
      +   '<button class="btn btn-ghost btn-sm" data-action="wife-prefill-pay" data-amount="' + Number(t.amount).toFixed(2) + '">' + I18n.t('wife_she_paid') + '</button>'
      + '</li>';
  }

  function _wifePaymentRow(p, currency) {
    var when = Format.fmtDateShort(p.date);
    var sub = when + (p.note ? ' · ' + Format.escapeHTML(p.note) : '');
    return '<li class="txn credit-row">'
      +   '<span class="cat-dot" style="background:#2ecc7133;color:#2ecc71">✓</span>'
      +   '<div class="main">'
      +     '<div class="top-line">' + Format.fmtMoney(p.amount, currency) + '</div>'
      +     '<div class="bot-line">' + sub + '</div>'
      +   '</div>'
      +   '<div class="amount refund">−' + Number(p.amount).toFixed(2) + '</div>'
      +   '<button class="btn btn-ghost btn-sm" data-action="remove-wife-payment" data-payment-id="' + p.id + '">' + I18n.t('wife_remove_payment') + '</button>'
      + '</li>';
  }
```

- [ ] **Step 2b: Build the wife card in `render`**

In `render`, after `var sum = Calc.liabilitySummary(state);` (line 25), add:

```javascript
    var wife = Calc.wifeSummary(state);
    var currency = state.settings.currency;
```

(Note: `currency` is already declared on the next line — remove the now-duplicate `var currency = state.settings.currency;` that was line 26 so it isn't declared twice.)

Then build the wife card HTML. After the `totalCard` definition block (after line 46), add:

```javascript
    var wifeBalanceText = wife.balance < 0
      ? I18n.t('wife_credit_label') + ': ' + Format.fmtMoney(Math.abs(wife.balance), currency)
      : Format.fmtMoney(wife.balance, currency);

    var wifeCard = ''
      + '<div class="summary-card">'
      +   '<div class="head">'
      +     '<span class="label">' + I18n.t('wife_card_title') + '</span>'
      +   '</div>'
      +   '<div class="big">' + wifeBalanceText + '</div>'
      +   '<button class="btn btn-ghost btn-block" data-action="record-wife-payment" style="margin-top:12px">' + I18n.t('wife_record_payment') + '</button>'
      + '</div>';

    var wifePurchasesHTML = wife.purchases.length
      ? '<div class="section-h">' + I18n.t('wife_purchases_section') + '</div>'
        + '<ul class="txn-list">' + wife.purchases.map(function (t) { return _wifePurchaseRow(t, state); }).join('') + '</ul>'
      : '';

    var wifePaymentsHTML = wife.payments.length
      ? '<div class="section-h">' + I18n.t('wife_payments_section') + '</div>'
        + '<ul class="txn-list">' + wife.payments.map(function (p) { return _wifePaymentRow(p, currency); }).join('') + '</ul>'
      : '';

    var wifeSection = (wife.purchases.length || wife.payments.length || wife.balance !== 0)
      ? wifeCard + wifePurchasesHTML + wifePaymentsHTML
      : '';
```

- [ ] **Step 3: Insert the wife section into the returned body**

Change the final `return` (lines 59–64) to include `wifeSection` after the bank lists:

```javascript
    return header
      + '<div class="app-body">'
      +   totalCard
      +   unpaidHTML
      +   paidHTML
      +   wifeSection
      + '</div>';
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/views/liabilities.js
git commit -m "feat(credit tab): Wife owes-you card, purchases/payments, bank-row tag"
```

---

## Task 10: Home & History — Wife tag on transaction rows

**Files:**
- Modify: `src/views/home.js`
- Modify: `src/views/history.js`

- [ ] **Step 1: Home — add the wife tag**

In `src/views/home.js` `_txnRow`, after the `creditTag` line (line 7), add a `wifeTag` and append it to the top line:

```javascript
    var creditTag = t.isCredit ? ' · ' + I18n.t(t.liabilitySettled ? 'credit_paid_tag' : 'credit_tag') : '';
    var wifeTag = t.byWife ? ' · ' + I18n.t('wife_tag') : '';
```

Change the top-line (line 11) to append `wifeTag`:

```javascript
      +     '<div class="top-line">' + Format.escapeHTML(cat.name) + (t.isRefund ? ' · Refund' : '') + creditTag + wifeTag + '</div>'
```

- [ ] **Step 2: History — identical change**

In `src/views/history.js` `_txnRow`, apply the same two edits (add `wifeTag` after line 7; append it on line 11).

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/views/home.js src/views/history.js
git commit -m "feat(views): Wife tag on Home and History rows"
```

---

## Task 11: CSV export — `byWife` column

**Files:**
- Modify: `src/components/settingsSheet.js`

- [ ] **Step 1: Add the header and value**

In `exportCSV` (lines 18–28), add `byWife` to the header row after `onCredit` (line 19):

```javascript
    var rows = [['date', 'categoryName', 'amount', 'isRefund', 'isExcludedFromPace', 'onCredit', 'byWife', 'creditSettled', 'note', 'cycleStart', 'cycleEnd']];
```

And add the value in the same position in the pushed row (line 27):

```javascript
      rows.push([t.date, name, Number(t.amount).toFixed(2), t.isRefund ? 'true' : 'false', t.isExcludedFromPace ? 'true' : 'false', t.isCredit ? 'true' : 'false', t.byWife ? 'true' : 'false', t.liabilitySettled ? 'true' : 'false', note, cyc.startDate, cyc.endDate]);
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/settingsSheet.js
git commit -m "feat(export): byWife column in CSV"
```

---

## Task 12: Integration test — round-trip fixture with wife data

**Files:**
- Modify: `tests/integration.test.js`

- [ ] **Step 1: Update the existing round-trip txn and add wife data**

In the test `'integration: restore round-trip — export → migrate → validate → state matches'` (lines 86–108), the source txn (lines 88–93) must include `byWife` (because `migrate` now backfills it, so the migrated copy would otherwise differ in the `deepStrictEqual`). Change it to:

```javascript
  s = Store.addTransaction(s, {
    id: idGen('t'), cycleId: cycle.id, categoryId: otherId, date: '2026-05-30',
    amount: 35.80, isRefund: false, isExcludedFromPace: false,
    isCredit: false, liabilitySettled: false, settledAt: null, byWife: false,
    note: 'Lunch', createdAt: '', updatedAt: ''
  });

  // A wife purchase (forced isCredit + excluded-from-pace by the Store mutator)
  s = Store.addTransaction(s, {
    id: idGen('t'), cycleId: cycle.id, categoryId: otherId, date: '2026-05-30',
    amount: 60, isRefund: false, byWife: true,
    isCredit: true, isExcludedFromPace: true, liabilitySettled: false, settledAt: null,
    note: 'Groceries', createdAt: '', updatedAt: ''
  });
  // A reimbursement from her
  s = Store.addWifePayment(s, { id: 'wp-1', amount: 40, date: '2026-05-31', note: '', createdAt: '' });
```

- [ ] **Step 2: Assert the wife data survives the round-trip**

After the existing assertions in that test (after line 107), add:

```javascript
  assert.deepStrictEqual(migrated.wifePayments, s.wifePayments);
  assert.strictEqual(Calc.wifeSummary(migrated).balance, 20); // 60 charged − 40 paid
```

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS — all tests green, count increased by the new wife/store/migrate/validate tests (was 176; expect ~196+).

- [ ] **Step 4: Commit**

```bash
git add tests/integration.test.js
git commit -m "test(integration): wife purchase + payment survive the round-trip"
```

---

## Task 13: Full verification — tests, lint, build

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: `pass` count up from 176, `fail 0`.

- [ ] **Step 2: Run the pure-module lint**

Run: `npm run lint:pure`
Expected: exit 0 (no `Date`/`Math.random`/`crypto` in calc/store/migrate/validate/seed/i18n/format).

- [ ] **Step 3: Build the artifact**

Run: `npm run build`
Expected: exit 0; `dist/index.html` + `dist/sw.js` produced.

- [ ] **Step 4: Manual smoke test (dev server)**

Run: `npm run dev` and open http://localhost:5173, then verify:
- Add a spend with **Wife** on → On-credit auto-checks and locks; the spend does **not** change the Home hero number; it shows a **Wife** tag on Home.
- Credit tab shows the spend in the bank list (tagged Wife) **and** a "Wife owes you" card with the right balance.
- "Record payment" (lump) and a purchase's "She paid" button both reduce the balance; overpaying shows "Wife credit".
- Remove a payment → balance restores; Undo works.
- Export CSV → the `byWife` column is present and correct.

- [ ] **Step 5: Update docs**

Add a `2026-06-12` entry to `docs/CHANGELOG.md` (newest first) summarizing the wife reimbursement tracker, and add a row to the "Post-V1 features shipped" table in `docs/PROJECT-STATUS.md` (bump the test count). Follow the existing entry style.

- [ ] **Step 6: Commit**

```bash
git add docs/CHANGELOG.md docs/PROJECT-STATUS.md
git commit -m "docs: record wife reimbursement tracker"
```

---

## Notes for the implementer

- **Two settlements are independent.** A wife purchase can be `liabilitySettled` (you paid the bank) while she still owes you, and vice-versa. Don't try to couple them.
- **The balance is the source of truth**, not per-row state. "She paid" just pre-fills the amount; it records a normal `wifePayment`. Don't add per-purchase settled flags.
- **Don't bump `schemaVersion`.** It stays `1`. Safety comes from initializing `wifePayments` in `empty()`/`migrate` and reading it defensively in `calc`.
- **Keep the pure modules pure.** Any `id`/timestamp must come from `app.js` (`uuid`, `nowISO`); never add `new Date()`/`Math.random()` to `calc/store/migrate/validate`.
