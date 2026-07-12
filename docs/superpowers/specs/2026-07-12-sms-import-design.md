# Import spends from card SMS — Design

**Date:** 2026-07-12
**Status:** Approved (brainstorm), pending implementation plan
**Author:** brainstormed with owner (Abdulla)

## One-line

Paste forwarded bank/card SMS into the app, review an editable preview (you pick
each category and confirm), and bulk-add the chosen spends into the right cycle
without wiping existing data.

## Problem

The owner gets one bank SMS per card purchase. After a tracking gap, re-typing a
week of spends by hand is tedious. iOS blocks apps from receiving shared text
directly, so the practical path is: **select messages → Forward → copy the
compose box → paste into the app**. The app then does the parsing, review, and
bulk insertion.

## Goals

- One "paste everything here" box; the app parses many messages at once.
- Recognize the owner's two real SMS styles (card purchase, account debit).
- Editable preview: the owner confirms/edits every row and **manually picks the
  category** (no auto-guessing) before anything is saved.
- Flag likely duplicates (same spend already recorded, or repeated in the paste)
  and default them **off**.
- Bulk-add the ticked rows into the cycle matching each spend's date, additively
  (never replace existing data), with a 30-second Undo.

## Non-goals (YAGNI)

- **No category auto-guessing.** Category starts empty on every row; the owner
  picks it. (Explicit owner decision.)
- No screenshots / OCR.
- No auto-import — a preview + confirm is always required.
- No iOS "share directly to the app" (unsupported by iOS PWAs). Forward→copy→paste
  stays the input method.
- Only the owner's bank's two message styles for now; other formats are additive
  later (the parser is written to fail safe on unknown lines).
- Daily-limit / pace math is untouched.

## The two SMS formats (from real samples)

**A — card purchase** (has amount + shop + date):
```
Trx. of AED40.00 on your card ending *124 at QASR AL KHARAZ TAILORI, UAE is Approved. Avl. card bal is 97083.14. Trx Date: 12/07/26 17:35
```
Extract: amount `40.00`, shop `QASR AL KHARAZ TAILORI`, datetime `12/07/26 17:35`.

**B — account debit** (amount only; transfers, fees):
```
Dear Customer, AED 250.00 was debited from your account *147. Your available account balance is AED 13730.38
```
Extract: amount `250.00`. **No shop, no date** → flagged "needs a date + category".

Real batch also proved: messages arrive newline-separated, amounts may be
`AED40.00` (no space) or `AED 250.00` (space), dates are `DD/MM/YY HH:MM`, and the
same purchase can appear twice (dedup needed).

## Architecture

Three new/changed units, matching the existing additive/pure-module split.

### 1. `src/smsParse.js` — pure parser (no `Date`/`Math.random`; lint:pure clean)

```
SmsParse.parse(text) -> {
  rows: [
    {
      raw: string,           // the original line, for dedup/debugging
      kind: 'purchase'|'debit',
      amount: number,        // 2dp, commas stripped
      note: string,          // shop for purchases; '' for debits (owner fills)
      dateISO: string|null,  // 'YYYY-MM-DD' for purchases; null for debits
      timeHHMM: string|null  // 'HH:MM' for purchases; null for debits
    }, ...
  ],
  unrecognizedCount: number  // non-empty lines matching neither format
}
```

- Split input on newlines; trim; ignore blank lines.
- **Purchase** regex captures amount, shop (between `at ` and `, UAE`), and
  `Trx Date: DD/MM/YY HH:MM`. `DD/MM/YY` → `20YY-MM-DD` (2-digit year → 20YY).
- **Debit** regex captures the amount from `AED <amt> was debited`.
- Amounts: strip `,`, parse float, round 2dp.
- A line matching neither increments `unrecognizedCount` (never silently dropped
  from the count).
- **Within-paste dedup:** collapse exact-duplicate rows. Key = `amount|note|dateISO|timeHHMM`
  (so the twice-sent QASR 40 becomes one row). Debits (null date) dedup on `amount|raw`.
- Pure and deterministic — no clock. The 2-digit-year → 20YY rule is fixed (no
  "current century" logic needed; these are 20xx).

### 2. `Calc.cycleIdForDate(state, dateISO)` — pure helper

Returns the id of the cycle whose `startDate <= dateISO <= endDate`, else `null`.
Used at commit time to file each spend under the cycle its date falls in;
callers fall back to the active cycle when it returns `null`.

### 3. `Store.addTransactions(state, txns)` — bulk mutator

Immutable; adds an array of transaction objects in one cloned state (loops the
same normalization as `addTransaction`, including the `byWife` enforcement). Undo
removes them by id (`deleteTransaction` loop).

### 4. `src/components/importSmsSheet.js` — paste + preview UI

Opened from **Settings → Backup → "Add spends from messages"**.

**Step 1 — paste:** a large textarea (`Paste your forwarded messages here`) + a
**Scan** button. Helper text tells the owner the forward→copy trick.

**Step 2 — preview:** `SmsParse.parse` output rendered as editable rows, grouped:
- **Purchases** — each row: include checkbox (**on**), amount (editable), date
  (editable, pre-filled), **category picker (empty — owner must pick)**, note
  (editable, = shop).
- **Needs your input** (debits) — include checkbox (**off**), amount, date picker
  (empty, required), category picker (empty, required), note (editable).
- **Duplicates** — rows whose `amount|note|dateISO` matches an existing
  transaction are shown flagged and ticked **off**.
- Summary line: `"5 purchases · 2 need details · 1 duplicate skipped · 2 lines not recognized"`.

**Step 3 — commit:** **"Add N spends"**. Only rows that are (a) ticked, (b) have a
category, and (c) have a date are added; rows missing a required field are
highlighted and blocked from inclusion (the button count reflects only valid
ticked rows). Each becomes a transaction:
```
{ id: uuid('txn'), cycleId: Calc.cycleIdForDate(state,date) || activeCycleId,
  categoryId: <picked>, date: <YYYY-MM-DD>, amount, isRefund:false,
  isExcludedFromPace:false, isCredit:false, liabilitySettled:false,
  settledAt:null, byWife:false, note:<shop/edited>,
  createdAt:<SMS datetime as local ISO, or nowISO() if none>, updatedAt:<same> }
```
Then `Store.addTransactions`, `persist()`, `render()`, and an **Undo** toast
(`Added N spends · Undo`) that removes them.

Time and ids come from the app layer (the component receives `todayISO`,
`nowISO`, and a uuid generator via props/callbacks, per existing sheet patterns).

## Dedup against existing data

Before rendering the preview, build a set of existing-transaction keys
`amount.toFixed(2) + '|' + note.trim().toUpperCase() + '|' + date` from
`state.transactions`. A candidate purchase whose key is in the set is flagged
duplicate and defaulted off. Debits (no date) are only deduped within the paste.

## Cycle assignment

Each spend files under `Calc.cycleIdForDate(state, row.date)`; if that is `null`
(date outside every cycle), it falls back to `state.settings.activeCycleId`. This
correctly routes a spend dated in a past cycle to that cycle.

## Data flow

```
paste text
  → SmsParse.parse(text)                     (pure)
  → dedup vs existing (app builds key set)
  → editable preview (owner edits + picks categories)
  → build txns (app: uuid + local ISO from SMS datetime)
  → Store.addTransactions                    (additive)
  → persist + render + Undo toast
```

## Error / edge handling

- Empty paste or zero recognized rows → friendly empty state, no commit button.
- All rows duplicates/unticked → button disabled.
- A debit with no date left un-dated → excluded from the add (can't be filed).
- Malformed amount / unparseable line → counted in `unrecognizedCount`, not added.
- Amount `0.00` (e.g. some fee formats) → allowed (validate permits amount ≥ 0).
- Very large paste → parsing is linear; no special handling needed.

## Tests

- **`tests/smsParse.test.js`** (new): the exact real samples →
  - purchase: amount / shop / `DD/MM/YY HH:MM` → ISO date + `HH:MM`;
  - `AED40.00` (no space) and `AED 250.00` (space) both parse;
  - comma amount `1,250.00` → `1250`;
  - debit detection (null date/note);
  - within-paste dedup (QASR 40 twice → one row);
  - unrecognized line increments `unrecognizedCount`, not `rows`.
- **`tests/calc.test.js`**: `cycleIdForDate` inside/at-bounds/outside → id/null.
- **`tests/store.test.js`**: `addTransactions` adds many immutably; `byWife`
  normalization still applies; original state untouched.
- Existing 280 stay green; `npm run lint:pure` stays clean.

## Files

| File | Change |
|---|---|
| `src/smsParse.js` | **Create** — pure parser |
| `src/calc.js` | Add pure `cycleIdForDate` |
| `src/store.js` | Add `addTransactions` bulk mutator |
| `src/components/importSmsSheet.js` | **Create** — paste + preview + commit UI |
| `src/components/settingsSheet.js` | Add "Add spends from messages" button (Backup section) + handler |
| `src/app.js` | `onImportSms` callback: open sheet, build txns, bulk-add, Undo |
| `src/i18n.js` | New en + ar strings |
| `index.html` | Register `src/smsParse.js` + `src/components/importSmsSheet.js` |
| `src/styles/main.css` | Preview-row styles |
| tests | `smsParse.test.js` (new) + calc/store additions |

## Build / deploy

No pipeline change. New modules are added to the `index.html` MODULES block so the
inliner picks them up. Ships via the normal push-to-`main` → Pages flow.

## Open questions for the plan stage

1. Category picker widget in a preview row: reuse the entry-sheet category chip
   row, or a compact `<select>`? (Lean: compact chip/`select` per row; finalize in plan.)
2. Whether to persist the pasted text if the owner backs out mid-review (default: no).
