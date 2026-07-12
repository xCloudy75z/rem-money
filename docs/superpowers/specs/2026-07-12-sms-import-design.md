# Import spends from card SMS — Design (v2, post stress-test)

**Date:** 2026-07-12
**Status:** Revised after adversarial stress-test (18 confirmed holes closed); pending owner review → plan
**Author:** brainstormed with owner (Abdulla)

## One-line

Paste forwarded bank/card SMS into the app, review an editable preview (you pick
each category and confirm every row), and bulk-add the chosen spends into the
right cycle — without wiping existing data.

## Guiding invariant (the reason this design is shaped the way it is)

**Nothing is ever silently dropped, mis-filed, or added invalid.** Every non-blank
pasted line ends up *somewhere the owner can see it*. Anything uncertain —
duplicate, un-dated, declined, out-of-cycle, unparsed — is **shown, flagged, and
defaulted OFF**, never removed or auto-added. Only rows the owner explicitly ticks
*and* completes get written.

## Problem

The owner gets one bank SMS per card purchase. After a tracking gap, re-typing a
week of spends by hand is tedious. iOS blocks apps from receiving shared text
directly, so the practical path is **select → Forward → copy the compose box →
paste into the app**. The app parses, the owner reviews, the app bulk-inserts.

## Goals

- One "paste everything here" box; parse many messages at once.
- Recognize the owner's two real SMS styles (card purchase, account debit).
- Editable preview where the owner confirms/edits **every** row and **manually
  picks the category** (no auto-guessing) before anything is saved.
- Surface — never hide — duplicates, un-dated debits, declined/reversed lines,
  out-of-cycle dates, and unparsed lines; default all of them OFF.
- Bulk-add ticked+valid rows into the cycle matching each spend's date,
  additively (never replace), with an Undo.

## Non-goals (YAGNI)

- **No category auto-guessing.** Category starts empty on every row.
- No screenshots / OCR.
- No auto-import — a preview + confirm is always required.
- No iOS "share directly to the app" (unsupported). Forward→copy→paste stays.
- Only this bank's two message styles for now; other formats are additive later
  and are **guaranteed to appear in the visible "Unrecognized" list**, never dropped.
- Daily-limit / pace math is untouched.

## The two SMS formats (from real samples)

**A — card purchase** (amount + shop + date + status):
```
Trx. of AED40.00 on your card ending *124 at QASR AL KHARAZ TAILORI, UAE is Approved. Avl. card bal is 97083.14. Trx Date: 12/07/26 17:35
```
**B — account debit** (amount only; transfers, fees):
```
Dear Customer, AED 250.00 was debited from your account *147. Your available account balance is AED 13730.38
```
Real batch also proved: newline-separated; amounts `AED40.00` (no space) or
`AED 250.00` (space); dates `DD/MM/YY HH:MM`; the same purchase can appear twice;
and two different debits can report the *same* balance (so balance is not an id).

## Architecture

### 1. `src/smsParse.js` — pure parser (no `Date`/`Math.random`; lint:pure clean)

```
SmsParse.parse(text) -> {
  rows: [
    {
      raw: string,                 // original line
      kind: 'purchase' | 'debit',
      status: 'approved' | 'not-approved',   // purchases only; debit => 'approved'
      amount: number,              // 2dp, commas stripped
      note: string,                // shop for purchases; '' for debits
      dateISO: string | null,      // 'YYYY-MM-DD' for purchases; null for debits
      timeHHMM: string | null,     // 'HH:MM' for purchases; null for debits
      repeatOfIndex: number | null // index of the earlier identical row, else null
    }, ...
  ],
  unrecognized: string[]           // raw non-blank lines matching neither format
}
```

Rules:
- Split on newlines; trim; ignore blank lines.
- **Purchase** = a `Trx. of AED<amt> … at <shop>, <country> is Approved.` line with
  a `Trx Date: DD/MM/YY HH:MM`. The **`is Approved` token is REQUIRED** to set
  `kind:'purchase'`. A `Trx.` line that is `Declined`/`Reversed`/`Refund`
  (same shape, different status word) parses with `status:'not-approved'` and is
  routed to the "Not a spend" group — **never** defaulted ON. Shop is captured
  between `at ` and `, <COUNTRY> is Approved` (not hard-locked to `UAE`).
- **Debit** = `AED <amt> was debited from your account`. No shop, no date.
- **No dropping, ever.** Exact within-paste repeats are **kept**; the 2nd+
  occurrence gets `repeatOfIndex` = the first one's index (purchase repeat key =
  `amount|note|dateISO|timeHHMM`; debit repeat key = `amount|raw`). The UI groups
  them and defaults the repeats OFF — the owner decides.
- Amounts: strip `,`, parse float, round 2dp. `DD/MM/YY` → `20YY-MM-DD`.
- Any non-blank line matching neither format goes into `unrecognized` **as raw
  text** (not just a count).
- Pure/deterministic — no clock.

### 2. `Calc.cycleIdForDate(state, dateISO)` — pure helper

Returns the id of the cycle whose `startDate <= dateISO <= endDate` (geometric
match, archived or not), else `null`. It stays pure and dumb; the **archived /
non-active / no-match policy lives in the commit layer** (below), where it can be
shown and confirmed.

### 3. `Store.addTransactions(state, txns)` — bulk mutator

Immutable; adds an array in one cloned state, applying the same normalization as
`addTransaction` (incl. `byWife` enforcement). **Throws on any txn with a falsy
`id` or `cycleId`** (the null-cycle guard). Undo removes them by id.

### 4. `App._buildTxn(input)` — shared transaction scaffold

Extract the default-field block currently inline in `_onAddTxn` into one
`_buildTxn(input)` used by **both** manual entry and import, so the two paths can
never drift. Import rows flow through it; the import spec does **not** re-list
field defaults.

### 5. `src/components/importSmsSheet.js` — paste + preview UI

Opened from **Settings → Backup → "Add spends from messages"**. The component is a
**view only**: it never generates ids or timestamps. It emits an array of plain
edited rows `{ amount, categoryId, dateISO, note, cycleId, byWife }`; `app.js`
builds the transactions via `_buildTxn` and calls `Store.addTransactions`.

**Edits are persisted to an in-memory model, not read only at commit.** Each parsed
row is a model item (`include`, `amount`, `dateISO`, `categoryId`, `note`,
`cycleId`, `byWife`, `timeHHMM`, `group`, `idx`). Every `input`/`change` writes the
row's values back into its model item (resolved by `idx`, not array position). The
preview re-renders from the model, so a **partial commit keeps the owner's edits on
the rows that remain** — nothing typed is lost.

**Step 1 — paste:** a large textarea + **Scan** button, with a one-line hint about
the forward→copy trick.

**Step 2 — preview** (`SmsParse.parse` output, grouped; nothing hidden):
- **Purchases** (approved) — ticked ON, but *blocked until valid* (see gate).
  Fields per row: include checkbox · amount (editable) · date (editable) ·
  **category (empty — owner picks)** · note (= shop, editable) · a **"Wife"
  toggle** (off by default; ticking it marks the row `byWife` so it becomes the
  wife's to repay). A normal purchase always files into the active cycle (the only
  non-archived cycle whose range holds a recent date), so no cycle picker is shown
  here; back-dated/out-of-range dates are routed to **Needs your input** instead.
- **Needs your input** — debits (no date), rows whose date matches **no** cycle,
  and rows whose date matches an **archived / non-active** cycle. Ticked OFF;
  each needs a date and/or an explicit target-cycle pick before it can be added.
- **Possible repeats** — within-paste repeats (`repeatOfIndex != null`) and
  against-existing duplicates. Ticked OFF, with a "keep both?" affordance.
- **Not a spend** — `status:'not-approved'` lines (declined/reversed). Read-only,
  never addable; shown so the owner knows they were seen.
- **Unrecognized** — the raw `unrecognized` lines, read-only, with a note: "these
  weren't understood — add them by hand if they're spends." Guarantees no line
  disappears.
- Summary: `"5 purchases · 2 need details · 1 possible repeat · 1 not a spend · 2 unrecognized"`.

**Duplicate flagging (against existing data):** build a key set from
`state.transactions` using `amount.toFixed(2) | note.trim().toUpperCase() | dateISO | timeHHMM`
where the existing txn's `timeHHMM` is derived from its `createdAt`. The **same
key** (incl. time) is used for within-paste and against-existing, so genuine
same-day different-time repeats are *not* falsely merged. A match → row shown in
**Possible repeats**, OFF by default.

**Per-row commit gate — a row is addable only when ALL hold:**
1. ticked ON,
2. `amount` is a finite number `> 0`,
3. a category is picked,
4. a date is set,
5. its target cycle is resolved to a concrete cycle id (active by default; for
   non-active/archived/no-match, the owner has explicitly confirmed/picked it).

**Blocker readout (Step 3):** next to the button, an aggregate reason —
`"5 ticked rows still need a category, date, amount, or cycle"` — which is
**tappable to scroll to the first blocked row**. Every ticked-but-invalid row also
carries a visible `.blocked` highlight. The button count reflects only addable
rows; a reduced/disabled button always states *why*.

**Wife purchases:** ticking a row's "Wife" toggle sets `byWife:true` on the emitted
row. `app.js` passes it through `_buildTxn`, and `Store._enforceWife` (existing)
auto-sets `isCredit` + `isExcludedFromPace`, so the spend stays out of the daily
pace and shows up under "Wife owes you" via `Calc.wifeSummary` — no import-specific
wife logic. Default off; the owner ticks wife rows the same way they pick categories.

**Commit:** builds txns via `App._buildTxn` (cycleId = the row's resolved target;
`createdAt` = the SMS `dateISO`+`timeHHMM` as a local wall-clock ISO, or
`nowISO()` when absent), `Store.addTransactions`, `persist()`, `render()`, and an
Undo toast with an explicit duration that removes **exactly** the added set.
- If un-added rows remain, the sheet **stays open** showing only them:
  `"30 added — 6 rows still need details."` It closes only when nothing is left
  (or the owner dismisses with the dirty-check below).

**Dirty-check on dismiss:** once any category is picked or field edited,
scrim / Escape / X must confirm `"Discard your reviewed rows?"`. Reviewed rows
live in the component's in-memory model for the session (this also answers old
open-question 2: we retain reviewed rows, not just the raw text).

## Cycle assignment (safe)

For each row: `target = Calc.cycleIdForDate(state, dateISO)`.
- `target === activeCycleId` → file there (normal case).
- `target` is a **different** cycle (past) → show `"files into: <label>"`; if that
  cycle `isArchived`, move the row to **Needs your input** and require explicit
  confirmation before it can be ticked.
- `target === null` (date in a gap / outside all cycles) → **Needs your input**;
  owner picks a target cycle (defaults to active) before it can be added.
- If `activeCycleId` is also null (fresh install / restored backup) → the commit
  is blocked with a clear message. The invariant is enforced at the data layer:
  **`Store.addTransactions` throws on any txn with a falsy `cycleId`**, so no
  transaction can ever be written with a null cycle — asserted by a store test
  (not just the UI gate).

## Error / edge handling

- Empty paste or zero rows → friendly empty state, no commit button.
- Amount edited to empty/NaN/non-numeric/negative → row blocked (gate #2),
  highlighted, excluded from the count. (Guards the pace/limit math from `NaN`.)
- Note edited beyond 280 chars → capped at 280 on input (matches every other note
  field in the app).
- All rows off/blocked → button disabled with the blocker readout.
- Large paste (50+) → linear parse; groups are scrollable; blocker readout makes
  off-screen problems visible.

## Tests

- **`tests/smsParse.test.js`** (new), fixtures = the real samples + adversarial variants:
  - approved purchase → amount / shop / `DD/MM/YY HH:MM` → ISO + `HH:MM`;
  - **declined/reversed line → `status:'not-approved'`, NOT an addable purchase**;
  - debit → `kind:'debit'`, null date/note;
  - `AED40.00` (no space) and `AED 250.00` (space) both parse; comma `1,250.00` → 1250;
  - within-paste repeat → both rows present, 2nd has `repeatOfIndex` (nothing dropped);
  - two identical debits → both present (no collapse);
  - unrecognized line → appears in `unrecognized[]` as raw text, not in `rows`.
- **`tests/calc.test.js`**: `cycleIdForDate` inside / at-bounds / gap / outside → id / null.
- **`tests/store.test.js`**: `addTransactions` adds many immutably; `byWife`
  normalization applies; original state untouched; **never writes cycleId null**
  (commit-gate invariant).
- Existing 280 stay green; `npm run lint:pure` stays clean.

## Files

| File | Change |
|---|---|
| `src/smsParse.js` | **Create** — pure parser (rows + unrecognized[], status, repeatOfIndex) |
| `src/calc.js` | Add pure `cycleIdForDate` |
| `src/store.js` | Add `addTransactions` bulk mutator |
| `src/app.js` | Extract `_buildTxn`; add `onImportSms` (build via `_buildTxn`, bulk-add, Undo); cycle-resolution + null-cycle guard |
| `src/components/importSmsSheet.js` | **Create** — paste + grouped preview + gate + blocker readout + dirty-check |
| `src/components/settingsSheet.js` | "Add spends from messages" button (Backup) + handler |
| `src/i18n.js` | New en + ar strings |
| `index.html` | Register `src/smsParse.js` + `src/components/importSmsSheet.js` |
| `src/styles/main.css` | Preview group/row styles |
| tests | `smsParse.test.js` (new) + calc/store additions |

## Build / deploy

No pipeline change. New modules added to the `index.html` MODULES block. Ships via
push-to-`main` → Pages.

## Resolved open questions

1. **Category picker widget** — compact per-row `<select>` (or chip menu) of the
   owner's categories, starting empty. Finalize exact widget in the plan.
2. **Back-out persistence** — reviewed rows are retained in memory for the session
   and protected by the dirty-check; raw text is not separately persisted.
