# Import spends from card SMS — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the owner paste forwarded bank/card SMS, review an editable grouped preview (manually picking each category and confirming every row), and bulk-add the chosen spends into the correct cycle — without wiping existing data.

**Architecture:** A pure parser (`src/smsParse.js`) turns pasted text into `{rows, unrecognized}`. A view-only sheet (`src/components/importSmsSheet.js`) renders 5 groups, enforces a per-row commit gate, and emits plain rows. `app.js` builds transactions through one shared `_buildTxn` scaffold (also used by manual entry) and bulk-adds via `Store.addTransactions`, with Undo. New pure helper `Calc.cycleIdForDate`. **Invariant: nothing is ever silently dropped, mis-filed, or added invalid.**

**Tech Stack:** Vanilla ES5-style IIFE modules, no deps. `node --test`; `scripts/build.js` inliner; `scripts/lint-pure.js` forbids `new Date`/`Math.random` in pure modules.

**Spec:** `docs/superpowers/specs/2026-07-12-sms-import-design.md`

---

## File structure

| File | Change | Responsibility |
|---|---|---|
| `src/smsParse.js` | **Create** (pure) | text → `{rows, unrecognized}` with kind/status/repeatOfIndex |
| `src/calc.js` | Modify (pure) | add `cycleIdForDate(state, dateISO)` |
| `src/store.js` | Modify | add `addTransactions(state, txns)` |
| `src/app.js` | Modify | extract `_buildTxn`; add `_onImportSms`; open sheet |
| `src/components/sheet.js` | Modify | optional `guard` hook for close (dirty-check) |
| `src/components/importSmsSheet.js` | **Create** | paste → grouped preview → gate → blocker readout → commit |
| `src/components/settingsSheet.js` | Modify | "Add spends from messages" button + handler |
| `src/i18n.js` | Modify | en + ar strings |
| `index.html` | Modify | register the two new scripts |
| `src/styles/main.css` | Modify | preview styles |
| tests | `smsParse.test.js` (new) + calc/store additions |

**Out of scope (do NOT build):** auto-guessing categories, OCR/screenshots, auto-import without preview, iOS share-target, other banks' formats (they must appear in the visible "Unrecognized" group). Daily-limit/pace math untouched.

---

## Task 1: Pure SMS parser

**Files:** Create `src/smsParse.js`; Test `tests/smsParse.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/smsParse.test.js`:

```javascript
const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');
const SmsParse = loadModule('smsParse.js');

const APPROVED = 'Trx. of AED40.00 on your card ending *124 at QASR AL KHARAZ TAILORI, UAE is Approved. Avl. card bal is 97083.14. Trx Date: 12/07/26 17:35';
const DEBIT = 'Dear Customer, AED 250.00 was debited from your account *147. Your available account balance is AED 13730.38';
const DECLINED = 'Trx. of AED40.00 on your card ending *124 at QASR AL KHARAZ TAILORI, UAE is Declined. Trx Date: 12/07/26 17:36';

test('parses an approved card purchase', () => {
  const { rows } = SmsParse.parse(APPROVED);
  assert.strictEqual(rows.length, 1);
  const r = rows[0];
  assert.strictEqual(r.kind, 'purchase');
  assert.strictEqual(r.status, 'approved');
  assert.strictEqual(r.amount, 40);
  assert.strictEqual(r.note, 'QASR AL KHARAZ TAILORI');
  assert.strictEqual(r.dateISO, '2026-07-12');
  assert.strictEqual(r.timeHHMM, '17:35');
  assert.strictEqual(r.repeatOfIndex, null);
});

test('a declined line is recognized but not an addable purchase', () => {
  const { rows } = SmsParse.parse(DECLINED);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].kind, 'purchase');
  assert.strictEqual(rows[0].status, 'not-approved');
});

test('parses an account debit with no shop/date', () => {
  const { rows } = SmsParse.parse(DEBIT);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].kind, 'debit');
  assert.strictEqual(rows[0].amount, 250);
  assert.strictEqual(rows[0].dateISO, null);
  assert.strictEqual(rows[0].timeHHMM, null);
});

test('handles AED with and without a space, and comma thousands', () => {
  const noSpace = SmsParse.parse('Trx. of AED1,250.00 on your card ending *1 at SHOP, UAE is Approved. Trx Date: 01/07/26 09:00').rows[0];
  assert.strictEqual(noSpace.amount, 1250);
  const spaced = SmsParse.parse(DEBIT).rows[0];
  assert.strictEqual(spaced.amount, 250);
});

test('keeps within-paste repeats (never drops) and marks the 2nd', () => {
  const { rows } = SmsParse.parse(APPROVED + '\n' + APPROVED);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].repeatOfIndex, null);
  assert.strictEqual(rows[1].repeatOfIndex, 0);
});

test('keeps two identical debits (no collapse)', () => {
  const { rows } = SmsParse.parse(DEBIT + '\n' + DEBIT);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1].repeatOfIndex, 0);
});

test('unrecognized non-blank lines are returned as raw text, not in rows', () => {
  const { rows, unrecognized } = SmsParse.parse('hello world\n\n' + APPROVED);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(unrecognized, ['hello world']);
});

test('merchant name containing a comma still parses', () => {
  const r = SmsParse.parse('Trx. of AED10.00 on your card ending *1 at ALBAIK, DUBAI, UAE is Approved. Trx Date: 02/07/26 10:00').rows[0];
  assert.strictEqual(r.note, 'ALBAIK, DUBAI');
  assert.strictEqual(r.amount, 10);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/smsParse.test.js`
Expected: FAIL — `Cannot find module 'smsParse.js'` / `SmsParse` undefined.

- [ ] **Step 3: Implement the parser**

Create `src/smsParse.js`:

```javascript
var SmsParse = (function () {
  'use strict';

  function _num(x) {
    return Math.round(parseFloat(String(x).replace(/,/g, '')) * 100) / 100;
  }

  // "Trx. of AED40.00 ... at <SHOP>, <COUNTRY> is <Status>. ... Trx Date: DD/MM/YY HH:MM"
  function _matchPurchase(s) {
    var m = s.match(/Trx\.\s*of\s*AED\s?([\d,]+(?:\.\d{1,2})?)\b.*?\bat\s+(.+?),\s*[A-Za-z.\s]+?\bis\s+(\w+)\b/i);
    if (!m) return null;
    var status = /^approved$/i.test(m[3]) ? 'approved' : 'not-approved';
    var d = s.match(/Trx\s*Date:\s*(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/i);
    return {
      raw: s, kind: 'purchase', status: status,
      amount: _num(m[1]), note: m[2].trim(),
      dateISO: d ? ('20' + d[3] + '-' + d[2] + '-' + d[1]) : null,
      timeHHMM: d ? (d[4] + ':' + d[5]) : null,
      repeatOfIndex: null
    };
  }

  function _matchDebit(s) {
    var m = s.match(/AED\s?([\d,]+(?:\.\d{1,2})?)\s+was\s+debited\s+from\s+your\s+account/i);
    if (!m) return null;
    return {
      raw: s, kind: 'debit', status: 'approved',
      amount: _num(m[1]), note: '', dateISO: null, timeHHMM: null, repeatOfIndex: null
    };
  }

  function _key(row) {
    if (row.kind === 'purchase') {
      return Number(row.amount).toFixed(2) + '|' + row.note.toUpperCase() + '|' + (row.dateISO || '') + '|' + (row.timeHHMM || '');
    }
    return Number(row.amount).toFixed(2) + '|' + row.raw;
  }

  function parse(text) {
    var lines = String(text || '').split(/\r?\n/);
    var rows = [];
    var unrecognized = [];
    var seen = {};
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s) continue;
      var row = _matchPurchase(s) || _matchDebit(s);
      if (!row) { unrecognized.push(s); continue; }
      var k = _key(row);
      if (Object.prototype.hasOwnProperty.call(seen, k)) row.repeatOfIndex = seen[k];
      else seen[k] = rows.length;
      rows.push(row);
    }
    return { rows: rows, unrecognized: unrecognized };
  }

  return { parse: parse };
})();
```

> Loading note: `tests/store.test.js`'s `loadModule` evals the file with `new Function(code + '; return SmsParse;')` and reads the global — so `smsParse.js` must be a bare IIFE assigned to `var SmsParse` with **no** `module.exports` line (matches `calc.js`/`store.js`). The filename `smsParse.js` auto-resolves to the `SmsParse` global (no `map` entry needed).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/smsParse.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Lint**

Run: `npm run lint:pure`
Expected: clean (no `new Date`/`Math.random`).

- [ ] **Step 6: Commit**

```bash
git add src/smsParse.js tests/smsParse.test.js
git commit -m "feat(smsParse): pure bank-SMS parser (rows + unrecognized, repeats kept)"
```

---

## Task 2: `Calc.cycleIdForDate`

**Files:** Modify `src/calc.js`; Test `tests/calc.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/calc.test.js`:

```javascript
test('cycleIdForDate: matches inside, at bounds, null outside', () => {
  let s = seedStateWithCycle('2026-06-25', '2026-07-24', 10000);
  assert.strictEqual(Calc.cycleIdForDate(s, '2026-07-12'), 'c1');
  assert.strictEqual(Calc.cycleIdForDate(s, '2026-06-25'), 'c1');
  assert.strictEqual(Calc.cycleIdForDate(s, '2026-07-24'), 'c1');
  assert.strictEqual(Calc.cycleIdForDate(s, '2026-07-25'), null);
  assert.strictEqual(Calc.cycleIdForDate(s, '2026-06-24'), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/calc.test.js`
Expected: FAIL — `Calc.cycleIdForDate is not a function`.

- [ ] **Step 3: Implement**

In `src/calc.js`, before the `return {` export block, add:

```javascript
  // The id of the cycle whose date range contains dateISO (archived or not), else
  // null. Pure/geometric; the archived/active policy lives in the import layer.
  function cycleIdForDate(state, dateISO) {
    var cycles = (state && state.cycles) || {};
    for (var id in cycles) {
      var c = cycles[id];
      if (!c) continue;
      if (dateISO >= c.startDate && dateISO <= c.endDate) return id;
    }
    return null;
  }
```

Then add `cycleIdForDate: cycleIdForDate,` to the returned object.

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/calc.test.js` → PASS. Then `npm run lint:pure` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/calc.js tests/calc.test.js
git commit -m "feat(calc): cycleIdForDate maps a date to its cycle"
```

---

## Task 3: `Store.addTransactions`

**Files:** Modify `src/store.js`; Test `tests/store.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/store.test.js` (inside the same file that defines `loadModule`; it already has `Store`):

```javascript
test('addTransactions adds many immutably and enforces byWife', () => {
  let s = Store.empty();
  s = Store.addCycle(s, { id: 'c1', startDate: '2026-06-25', endDate: '2026-07-24', startBudget: 1000, archivedAt: null, createdAt: '' });
  s = Store.addCategory(s, { id: 'k', name: 'K', icon: '•', color: '#999', order: 0, isArchived: false, createdAt: '' });
  const before = s;
  const out = Store.addTransactions(s, [
    { id: 't1', cycleId: 'c1', categoryId: 'k', date: '2026-07-01', amount: 10, isRefund: false, isExcludedFromPace: false, note: '', createdAt: '', updatedAt: '' },
    { id: 't2', cycleId: 'c1', categoryId: 'k', date: '2026-07-02', amount: 20, isRefund: false, byWife: true, note: '', createdAt: '', updatedAt: '' }
  ]);
  assert.strictEqual(Object.keys(out.transactions).length, 2);
  assert.strictEqual(out.transactions.t2.isCredit, true);          // byWife enforcement
  assert.strictEqual(out.transactions.t2.isExcludedFromPace, true);
  assert.strictEqual(Object.keys(before.transactions).length, 0);  // original untouched
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/store.test.js`
Expected: FAIL — `Store.addTransactions is not a function`.

- [ ] **Step 3: Implement**

In `src/store.js`, right after the `addTransaction` function, add:

```javascript
  function addTransactions(state, txns) {
    var s = clone(state);
    for (var i = 0; i < txns.length; i++) {
      var t = txns[i];
      if (!t || !t.id) throw new Error('addTransactions: txn.id required');
      s.transactions[t.id] = _enforceWife(t);
    }
    return s;
  }
```

Then add `addTransactions: addTransactions,` to the returned object (next to `addTransaction`).

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/store.test.js` → PASS. Then `npm run lint:pure` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/store.js tests/store.test.js
git commit -m "feat(store): addTransactions bulk mutator"
```

---

## Task 4: Extract `App._buildTxn` (shared scaffold)

**Files:** Modify `src/app.js:313-323`

Behavior-preserving refactor so manual entry and import build identical txn shapes.

- [ ] **Step 1: Add `_buildTxn` and route `_onAddTxn` through it**

In `src/app.js`, replace the start of `_onAddTxn` (lines 313-323, the `var now = nowISO(); var txn = Object.assign({...}, txnInput);`) with:

```javascript
  // Single source of truth for a new transaction's default shape. Used by manual
  // entry (_onAddTxn) and SMS import (_onImportSms) so the two can never drift.
  function _buildTxn(input) {
    var now = nowISO();
    return Object.assign({
      id: uuid('txn'),
      cycleId: state.settings.activeCycleId,
      createdAt: now, updatedAt: now,
      isExcludedFromPace: false,
      isCredit: false, liabilitySettled: false, settledAt: null,
      byWife: false, wifeSettled: false, wifeSettledAt: null
    }, input);
  }

  function _onAddTxn(txnInput) {
    var txn = _buildTxn(txnInput);
    state = Store.addTransaction(state, txn);
    state = Store.updateSettings(state, { lastUsedCategoryId: txn.categoryId });
```

Leave the rest of `_onAddTxn` (the `persist(); render(); _pulseHero();` and toast) unchanged.

- [ ] **Step 2: Verify nothing broke**

Run: `npm test`
Expected: all existing tests still PASS (the integration/happy-path tests exercise `_onAddTxn` indirectly; the shape is identical).

Run: `node --check src/app.js` → no error.

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "refactor(app): extract _buildTxn shared by manual entry + import"
```

---

## Task 5: Sheet close-guard hook (dirty-check support)

**Files:** Modify `src/components/sheet.js`

Add an optional `guard` so a sheet can intercept user-initiated close (scrim/Escape/X). No behavior change when `guard` is absent.

- [ ] **Step 1: Store the guard and consult it**

In `src/components/sheet.js` `open(opts)`, where `current` is assigned (the `current = { wrap: wrap, onClose: opts.onClose, lastFocus: lastFocus };` line), add the guard:

```javascript
    current = { wrap: wrap, onClose: opts.onClose, lastFocus: lastFocus, guard: opts.guard };
```

Change the Escape handler:

```javascript
    function onKey(e) { if (e.key === 'Escape') { if (current && current.guard) { current.guard(); return; } close(); } }
```

Change the click handler (the `[data-close]` one):

```javascript
    wrap.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-close]')) {
        if (current && current.guard) { current.guard(); return; }
        close();
      }
    });
```

> `Sheet.close()` itself is unchanged and always closes — the guard only gates the three user-initiated paths. A guarded sheet is responsible for calling `Sheet.close()` when it decides to.

- [ ] **Step 2: Verify**

Run: `node --check src/components/sheet.js` → no error.
Run: `npm test` → all PASS (no test depends on guard; existing sheets pass no guard).

- [ ] **Step 3: Commit**

```bash
git add src/components/sheet.js
git commit -m "feat(sheet): optional close guard for dirty-check"
```

---

## Task 6: i18n strings (en + ar)

**Files:** Modify `src/i18n.js`

- [ ] **Step 1: Add EN strings**

In `src/i18n.js`, in the `en:` object, right after the `backup_tip:` line, insert:

```javascript
      sms_import_btn: '📩 Add spends from messages',
      sms_title: 'Add from messages',
      sms_paste_label: 'Paste your card SMS',
      sms_paste_hint: 'On your phone: select the messages → Forward → copy the box → paste here.',
      sms_scan: 'Scan messages',
      sms_group_purchases: 'Purchases',
      sms_group_needs: 'Needs your input',
      sms_group_repeats: 'Possible repeats',
      sms_group_notspend: 'Not a spend (declined/reversed)',
      sms_group_unrecognized: "Not understood — add these by hand if they're spends",
      sms_choose_category: 'Choose…',
      sms_choose_cycle: 'Choose cycle…',
      sms_files_into: 'files into: {cycle}',
      sms_summary: '{p} purchases · {n} need details · {r} possible repeats · {x} not understood',
      sms_add_n: 'Add {n} spends',
      sms_blocked: '{n} ticked rows still need a category, date, amount, or cycle',
      sms_added: 'Added {n} spends.',
      sms_remaining: '{added} added — {left} rows still need details.',
      sms_discard_title: 'Discard your reviewed rows?',
      sms_discard_text: "You've edited rows that haven't been added yet. Close and lose them?",
      sms_discard_ok: 'Discard',
      sms_empty: 'Nothing to import — paste some messages first.',
```

- [ ] **Step 2: Add AR strings**

In the `ar:` object, right after its `backup_tip:` line, insert:

```javascript
      sms_import_btn: '📩 إضافة مصاريف من الرسائل',
      sms_title: 'إضافة من الرسائل',
      sms_paste_label: 'الصق رسائل البطاقة',
      sms_paste_hint: 'على هاتفك: حدّد الرسائل ← إعادة توجيه ← انسخ المربع ← الصقه هنا.',
      sms_scan: 'فحص الرسائل',
      sms_group_purchases: 'المشتريات',
      sms_group_needs: 'تحتاج إدخالك',
      sms_group_repeats: 'تكرارات محتملة',
      sms_group_notspend: 'ليست مصروفاً (مرفوضة/معكوسة)',
      sms_group_unrecognized: 'غير مفهومة — أضفها يدوياً إن كانت مصاريف',
      sms_choose_category: 'اختر…',
      sms_choose_cycle: 'اختر الدورة…',
      sms_files_into: 'تُسجّل في: {cycle}',
      sms_summary: '{p} مشتريات · {n} تحتاج تفاصيل · {r} تكرارات · {x} غير مفهومة',
      sms_add_n: 'إضافة {n} مصاريف',
      sms_blocked: '{n} صفوف مؤشرة تحتاج فئة أو تاريخ أو مبلغ أو دورة',
      sms_added: 'تمت إضافة {n} مصاريف.',
      sms_remaining: 'أُضيف {added} — {left} صفوف تحتاج تفاصيل.',
      sms_discard_title: 'تجاهل الصفوف المراجَعة؟',
      sms_discard_text: 'راجعت صفوفاً لم تُضَف بعد. أغلق وتفقدها؟',
      sms_discard_ok: 'تجاهل',
      sms_empty: 'لا شيء للاستيراد — الصق بعض الرسائل أولاً.',
```

- [ ] **Step 3: Verify + commit**

Run: `node --check src/i18n.js` → no error.

```bash
git add src/i18n.js
git commit -m "feat(i18n): SMS import strings (en/ar)"
```

---

## Task 7: The import sheet component

**Files:** Create `src/components/importSmsSheet.js`

A view-only component: reads `state` for display (categories, cycles, existing-txn keys), renders the paste box then the grouped editable preview, computes the gate/blocker live from the DOM, and on commit emits plain rows to `opts.onCommit`. It never generates ids or timestamps.

- [ ] **Step 1: Create the component**

Create `src/components/importSmsSheet.js`:

```javascript
var ImportSmsSheet = (function () {
  'use strict';

  // opts: { state, onCommit(rows) }
  //   rows: [{ amount, categoryId, dateISO, note, cycleId, createdAtISO }]
  function open(opts) {
    var state = opts.state;
    var cats = Object.keys(state.categories).map(function (id) { return state.categories[id]; })
      .filter(function (c) { return !c.isArchived; })
      .sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
    var cycles = Object.keys(state.cycles).map(function (id) { return state.cycles[id]; })
      .sort(function (a, b) { return b.startDate.localeCompare(a.startDate); });
    var activeCycleId = state.settings.activeCycleId;

    var m = { phase: 'paste', items: [], unrecognized: [], dirty: false };

    var wrap = Sheet.open({
      contentHTML: _pasteHTML(),
      title: I18n.t('sms_title'),
      guard: function () {
        if (!m.dirty) { Sheet.close(); return; }
        ConfirmDialog.open({
          title: I18n.t('sms_discard_title'),
          text: I18n.t('sms_discard_text'),
          okLabel: I18n.t('sms_discard_ok'),
          danger: true
        }).then(function (ok) { if (ok) Sheet.close(); });
      }
    });

    function body() { return wrap.querySelector('.sheet-body'); }

    // ---- existing-txn dup keys (amount|NOTE|date|time) ----
    var existing = {};
    for (var tid in state.transactions) {
      var t = state.transactions[tid];
      var tm = (t.createdAt && t.createdAt.length >= 16) ? t.createdAt.slice(11, 16) : '';
      existing[_key(t.amount, t.note, t.date, tm)] = true;
    }

    function _scan(text) {
      var parsed = SmsParse.parse(text);
      m.unrecognized = parsed.unrecognized;
      m.items = parsed.rows.map(function (r, i) {
        var group;
        if (r.kind === 'purchase' && r.status !== 'approved') group = 'notspend';
        else if (r.repeatOfIndex != null) group = 'repeat';
        else if (r.kind === 'purchase' && existing[_key(r.amount, r.note, r.dateISO, r.timeHHMM)]) group = 'repeat';
        else if (!r.dateISO) group = 'needs';                       // debits
        else {
          var cyc = Calc.cycleIdForDate(state, r.dateISO);
          var cObj = cyc ? state.cycles[cyc] : null;
          group = (!cyc || (cObj && cObj.archivedAt)) ? 'needs' : 'purchase';
        }
        var resolved = r.dateISO ? Calc.cycleIdForDate(state, r.dateISO) : null;
        return {
          idx: i, raw: r.raw, kind: r.kind, group: group,
          amount: r.amount, note: r.note, dateISO: r.dateISO || '', timeHHMM: r.timeHHMM,
          categoryId: '', cycleId: (group === 'purchase') ? resolved : (resolved || activeCycleId || '')
        };
      });
      m.phase = 'preview';
      body().innerHTML = _previewHTML();
      _refreshFooter();
    }

    // ---- render: paste phase ----
    function _pasteHTML() {
      return '<div class="sheet-section">'
        + '<label>' + I18n.t('sms_paste_label') + '</label>'
        + '<textarea class="input" id="sms-text" rows="7" style="resize:vertical"></textarea>'
        + '<p style="color:var(--muted);font-size:12px;margin-top:8px;line-height:1.5">' + I18n.t('sms_paste_hint') + '</p>'
        + '</div>'
        + '<div class="sheet-footer"><button class="btn btn-primary btn-block" id="sms-scan">' + I18n.t('sms_scan') + '</button></div>';
    }

    // ---- render: preview phase ----
    function _catOptions(sel) {
      return '<option value="">' + I18n.t('sms_choose_category') + '</option>'
        + cats.map(function (c) {
            return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>'
              + Format.escapeHTML((c.icon || '•') + ' ' + c.name) + '</option>';
          }).join('');
    }
    function _cycleOptions(sel) {
      return '<option value="">' + I18n.t('sms_choose_cycle') + '</option>'
        + cycles.map(function (c) {
            var label = Format.fmtDateShort(c.startDate) + ' → ' + Format.fmtDateShort(c.endDate) + (c.archivedAt ? ' ·closed' : '') + (c.id === activeCycleId ? ' ·now' : '');
            return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + label + '</option>';
          }).join('');
    }
    function _editableRow(it) {
      var needsCyclePicker = (it.group === 'needs') || (it.cycleId && it.cycleId !== activeCycleId);
      return '<div class="sms-row" data-idx="' + it.idx + '">'
        + '<input type="checkbox" class="sms-inc"' + (it.group === 'purchase' ? ' checked' : '') + '>'
        + '<input class="input sms-amt" type="number" min="0" inputmode="decimal" value="' + it.amount + '" aria-label="amount">'
        + '<input class="input sms-date" type="date" value="' + it.dateISO + '" aria-label="date">'
        + '<select class="input sms-cat" aria-label="category">' + _catOptions(it.categoryId) + '</select>'
        + '<input class="input sms-note" maxlength="280" value="' + Format.escapeHTML(it.note) + '" aria-label="note">'
        + (needsCyclePicker ? '<select class="input sms-cyc" aria-label="cycle">' + _cycleOptions(it.cycleId) + '</select>' : '<input type="hidden" class="sms-cyc" value="' + it.cycleId + '">')
        + '</div>';
    }
    function _group(key, titleKey) {
      var list = m.items.filter(function (it) { return it.group === key; });
      if (!list.length) return '';
      var readOnly = (key === 'notspend');
      var rowsHTML = list.map(function (it) {
        return readOnly
          ? '<div class="sms-row ro">' + Format.escapeHTML(it.raw) + '</div>'
          : _editableRow(it);
      }).join('');
      return '<div class="section-h">' + I18n.t(titleKey) + '</div>' + rowsHTML;
    }
    function _previewHTML() {
      var unrec = m.unrecognized.length
        ? '<div class="section-h">' + I18n.t('sms_group_unrecognized') + '</div>'
          + m.unrecognized.map(function (l) { return '<div class="sms-row ro">' + Format.escapeHTML(l) + '</div>'; }).join('')
        : '';
      var counts = _counts();
      return '<div class="sheet-section">'
        + '<p style="color:var(--muted);font-size:12px;margin-bottom:10px">'
        + I18n.t('sms_summary', { p: counts.purchases, n: counts.needs, r: counts.repeats, x: m.unrecognized.length }) + '</p>'
        + _group('purchase', 'sms_group_purchases')
        + _group('needs', 'sms_group_needs')
        + _group('repeat', 'sms_group_repeats')
        + _group('notspend', 'sms_group_notspend')
        + unrec
        + '</div>'
        + '<div class="sheet-footer" style="flex-direction:column;gap:6px">'
        + '<p id="sms-blocker" style="color:var(--muted);font-size:12px;margin:0"></p>'
        + '<button class="btn btn-primary btn-block" id="sms-add"></button>'
        + '</div>';
    }
    function _counts() {
      var c = { purchases: 0, needs: 0, repeats: 0 };
      m.items.forEach(function (it) {
        if (it.group === 'purchase') c.purchases++;
        else if (it.group === 'needs') c.needs++;
        else if (it.group === 'repeat') c.repeats++;
      });
      return c;
    }

    // ---- read a DOM row -> plain values ----
    function _readRow(el) {
      var amt = parseFloat(el.querySelector('.sms-amt').value);
      var cyc = el.querySelector('.sms-cyc');
      return {
        el: el,
        include: el.querySelector('.sms-inc').checked,
        amount: (isFinite(amt) ? Math.round(amt * 100) / 100 : NaN),
        dateISO: el.querySelector('.sms-date').value,
        categoryId: el.querySelector('.sms-cat').value,
        note: el.querySelector('.sms-note').value,
        cycleId: cyc ? cyc.value : ''
      };
    }
    function _isValid(r) {
      return r.include && isFinite(r.amount) && r.amount > 0 && r.categoryId && r.dateISO && r.cycleId;
    }

    // ---- footer state (gate + blocker) ----
    function _refreshFooter() {
      var addBtn = wrap.querySelector('#sms-add');
      var blocker = wrap.querySelector('#sms-blocker');
      if (!addBtn) return;
      var addable = 0, blocked = 0;
      wrap.querySelectorAll('.sms-row[data-idx]').forEach(function (el) {
        var r = _readRow(el);
        if (_isValid(r)) addable++;
        else if (r.include) blocked++;
      });
      addBtn.textContent = I18n.t('sms_add_n', { n: addable });
      addBtn.disabled = addable === 0;
      blocker.textContent = blocked ? I18n.t('sms_blocked', { n: blocked }) : '';
    }

    // ---- commit ----
    function _commit() {
      var out = [];
      var toRemove = [];
      wrap.querySelectorAll('.sms-row[data-idx]').forEach(function (el) {
        var r = _readRow(el);
        if (!_isValid(r)) return;
        var time = '12:00';
        var it = m.items[+el.getAttribute('data-idx')];
        if (it && it.timeHHMM) time = it.timeHHMM;
        out.push({
          amount: r.amount, categoryId: r.categoryId, dateISO: r.dateISO,
          note: r.note, cycleId: r.cycleId,
          createdAtISO: r.dateISO + 'T' + time + ':00.000Z'
        });
        toRemove.push(el);
      });
      if (!out.length) return;
      opts.onCommit(out);
      // remove committed rows; drop them from the model too
      var idxs = toRemove.map(function (el) { return +el.getAttribute('data-idx'); });
      m.items = m.items.filter(function (it) { return idxs.indexOf(it.idx) === -1; });
      var stillEditable = m.items.some(function (it) { return it.group !== 'notspend'; });
      if (!stillEditable) { Sheet.close(); return; }
      body().innerHTML = _previewHTML();
      _refreshFooter();
      var left = m.items.filter(function (it) { return it.group !== 'notspend'; }).length;
      Toast.show({ message: I18n.t('sms_remaining', { added: out.length, left: left }), variant: 'success' });
    }

    // ---- wiring ----
    wrap.addEventListener('click', function (e) {
      var t = e.target;
      if (t.id === 'sms-scan') {
        var text = wrap.querySelector('#sms-text').value;
        if (!text.trim()) { Toast.show({ message: I18n.t('sms_empty'), variant: 'error' }); return; }
        _scan(text);
        return;
      }
      if (t.id === 'sms-add') { _commit(); return; }
    });
    wrap.addEventListener('input', function (e) {
      if (e.target.closest('.sms-row[data-idx]')) { m.dirty = true; _refreshFooter(); }
    });
    wrap.addEventListener('change', function (e) {
      if (e.target.closest('.sms-row[data-idx]')) { m.dirty = true; _refreshFooter(); }
    });
  }

  function _key(amount, note, dateISO, timeHHMM) {
    return Number(amount).toFixed(2) + '|' + String(note || '').trim().toUpperCase() + '|' + (dateISO || '') + '|' + (timeHHMM || '');
  }

  return { open: open };
})();
```

- [ ] **Step 2: Verify syntax**

Run: `node --check src/components/importSmsSheet.js` → no error.

- [ ] **Step 3: Commit**

```bash
git add src/components/importSmsSheet.js
git commit -m "feat(import): SMS paste + grouped preview + gate + dirty-check sheet"
```

---

## Task 8: Wire it up (app.js + Settings + index.html + CSS)

**Files:** Modify `src/app.js`, `src/components/settingsSheet.js`, `index.html`, `src/styles/main.css`

- [ ] **Step 1: Register the two scripts**

In `index.html`, in the MODULES block: add `<script src="src/smsParse.js"></script>` next to the other pure modules (after `src/calc.js`), and `<script src="src/components/importSmsSheet.js"></script>` next to the other components (after `src/components/categorySheet.js`).

- [ ] **Step 2: Add `_onImportSms` in app.js**

In `src/app.js`, immediately before `function _openSettings() {`, add:

```javascript
  function _onImportSms(rows) {
    if (!rows || !rows.length) return;
    var built = rows.map(function (r) {
      return _buildTxn({
        cycleId: r.cycleId,
        categoryId: r.categoryId,
        date: r.dateISO,
        amount: r.amount,
        isRefund: false,
        note: (r.note || '').slice(0, 280),
        createdAt: r.createdAtISO || nowISO(),
        updatedAt: r.createdAtISO || nowISO()
      });
    }).filter(function (t) { return t.cycleId; });   // never write a null-cycle txn
    if (!built.length) return;
    state = Store.addTransactions(state, built);
    persist(); render();
    var ids = built.map(function (t) { return t.id; });
    Toast.show({
      message: I18n.t('sms_added', { n: built.length }),
      action: I18n.t('undo'),
      duration: 8000,
      onAction: function () {
        var s = state;
        ids.forEach(function (id) { s = Store.deleteTransaction(s, id); });
        state = s; persist(); render();
      },
      variant: 'success'
    });
  }

  function _openImportSms() {
    ImportSmsSheet.open({ state: state, onCommit: _onImportSms });
  }
```

- [ ] **Step 3: Route the Settings callback**

In `src/app.js` `_openSettings()`, add to the callbacks object (next to `onManageCategories`):

```javascript
      onImportSms: function () { _openImportSms(); },
```

- [ ] **Step 4: Add the Settings button + handler**

In `src/components/settingsSheet.js` `_render`, inside the Backup `settings-section`, after the `export-csv` button line, add:

```javascript
      +   '<button class="btn btn-block" data-action="import-sms" style="margin-bottom:6px">' + I18n.t('sms_import_btn') + '</button>'
```

In `open()`'s click handler, alongside the other actions, add:

```javascript
      if (action === 'import-sms') { Sheet.close(); callbacks.onImportSms(); return; }
```

- [ ] **Step 5: Add CSS**

Append to `src/styles/main.css`:

```css
/* ===== SMS import preview ===== */
.sms-row { display: grid; grid-template-columns: auto 84px 130px 1fr; gap: 6px; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(128,128,128,.12); }
.sms-row .sms-note { grid-column: 1 / -1; }
.sms-row .sms-cyc { grid-column: 1 / -1; }
.sms-row.ro { display: block; font-size: 12px; color: var(--muted); word-break: break-word; }
.sms-row .input { min-width: 0; }
```

- [ ] **Step 6: Build + full verification**

Run: `npm run build` → `OK Built dist/index.html (...)` (no MODULES-markers error).
Run: `npm test` → all PASS.
Run: `npm run lint:pure` → clean.

- [ ] **Step 7: Commit**

```bash
git add index.html src/app.js src/components/settingsSheet.js src/styles/main.css
git commit -m "feat(import): wire SMS importer into Settings + app"
```

---

## Task 9: Manual verification + checklist

No DOM test harness exists for sheets, so verify by hand in the dev server.

- [ ] **Step 1: Run the dev server** (`npm run dev`, open http://localhost:5173).

- [ ] **Step 2: Walk the flow** — Settings → Backup → "Add spends from messages" → paste the real batch:

```
Trx. of AED25.50 on your card ending *124 at TAREEQ AL SEYOH GROCE, UAE is Approved. Avl. card bal is 97357.54. Trx Date: 11/07/26 17:44
Trx. of AED66.00 on your card ending *124 at ALBAIK, UAE is Approved. Avl. card bal is 97291.54. Trx Date: 11/07/26 21:50
Dear Customer, AED 250.00 was debited from your account *147. Your available account balance is AED 13730.38
Trx. of AED40.00 on your card ending *124 at QASR AL KHARAZ TAILORI, UAE is Approved. Avl. card bal is 97083.14. Trx Date: 12/07/26 17:35
Trx. of AED40.00 on your card ending *124 at QASR AL KHARAZ TAILORI, UAE is Approved. Avl. card bal is 97083.14. Trx Date: 12/07/26 17:35
Trx. of AED99.00 on your card ending *124 at SOMEPLACE, UAE is Declined. Trx Date: 12/07/26 18:00
weird unparseable line
```

Verify: 2 clean purchases in **Purchases**; the debit in **Needs your input**; the 2nd QASR in **Possible repeats** (off); the declined line in **Not a spend** (read-only); "weird unparseable line" in **Unrecognized** (read-only). Pick categories; the **Add N** count only rises as categories are chosen; the blocker line explains what's missing. Add → Undo toast; History shows the new spends dated 11–12 Jul. Re-open and dismiss with edits → "Discard your reviewed rows?" appears.

- [ ] **Step 3: Add checklist rows** to `tests/MANUAL-CHECKLIST.md` under a new "Import from messages" section capturing Step 2.

- [ ] **Step 4: Final** — `npm test` (all pass), `npm run lint:pure` (clean), `npm run build` (OK).

- [ ] **Step 5: Commit**

```bash
git add tests/MANUAL-CHECKLIST.md
git commit -m "docs(test): manual checklist for SMS import"
```

---

## Self-review notes

- **Spec coverage:** parser w/ status+repeatOfIndex+unrecognized (T1); cycleIdForDate (T2); addTransactions (T3); shared _buildTxn (T4); dirty-check via Sheet guard (T5); i18n (T6); 5-group preview + gate + blocker + stay-open + createdAt-from-SMS (T7); null-cycle guard + Undo + Settings button + registration + CSS (T8); manual verify (T9). Invariant honored: notspend/repeat/needs/unrecognized are all shown and default OFF; amount validated `>0`; cycleId filtered non-null before write.
- **Type consistency:** parser row shape (`raw,kind,status,amount,note,dateISO,timeHHMM,repeatOfIndex`) is consumed unchanged by the component's `_scan`; component emits `{amount,categoryId,dateISO,note,cycleId,createdAtISO}` consumed verbatim by `_onImportSms`; `_buildTxn` input keys match `Store.addTransaction`'s expectations.
- **Open items for the plan's stress-test:** (a) `loadModule` export convention for `smsParse.js` (Step-1 note); (b) whether the `.sms-row` grid is usable at 360px — may need a stacked layout; (c) `createdAtISO` uses `12:00` for debits — acceptable since only display ordering depends on it.
```
