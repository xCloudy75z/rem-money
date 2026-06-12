# Spec — "Wife owes me" reimbursement tracking

**Date:** 2026-06-12
**Status:** Approved (brainstorming → spec). Ready for implementation plan.
**Builds on:** the Credit (liability) tracker shipped 2026-06-10 (commit `e2164eb`).

## Problem

The user's wife uses his credit card. She transfers money back to reimburse him, but he
loses track of **how much she has used and how much she still owes**. The app already tracks
one debt (user → bank, the Credit tab). This adds a second, independent debt
(wife → user) without disturbing the first.

## Locked requirements (from brainstorming)

- **Q1 — budget:** Wife's spending must **not** count toward the user's daily limit / pace.
- **Q2 — reimbursement:** She pays in a **mix** of lump sums and specific items → need a
  running balance *and* the ability to clear specific items.
- **Q3 — scope:** Track **only the wife** (one person). YAGNI: no general "people" list.
- **Q4 — vs bank credit:** Wife purchases **also count toward the bank-credit total** (it's on
  his card).
- **Bank list treatment (resolved during validation):** Wife items appear in the bank unpaid
  list **tagged "Wife"** and **are** included in the bank's per-item "Paid" / "Mark all paid"
  (those mean "I paid the bank", which is true for wife purchases too). This is fully
  independent from whether *she* has paid *him* back.

## Chosen approach: Approach A — payment ledger + derived running balance

A wife purchase is a normal transaction tagged `byWife`. Her transfers are separate credit
records. Her balance is always **derived** as `charged − paid`, so it can never drift and
deleting any record self-corrects.

## Data model

### Transaction — one new field

- `byWife: boolean` (default `false`).

**Invariant:** whenever `byWife === true`, the transaction must also have
`isCredit === true` and `isExcludedFromPace === true`. This is enforced in the **`Store`
mutators** (`addTransaction` / `updateTransaction` normalize the record so `byWife:true`
implies the other two), not just in the UI — so a `byWife:true, isCredit:false` state is
impossible regardless of how the record was constructed.

Consequences that fall out of **existing** calc code with no changes:
- `isExcludedFromPace:true` → already skipped by `cycleTotalSpent`, `todaySpent`, `todayLimit`,
  `pace`, `historicalLimitsByDay`, `cycleSummary` (Q1 satisfied).
- `isCredit:true` → already summed by `liabilitySummary` (Q4 satisfied).

### New top-level collection — her transfers

```
state.wifePayments: {
  [id]: { id, amount, date, note, createdAt }
}
```

- `amount`: positive number (a *reduction* of what she owes).
- `date`: ISO `YYYY-MM-DD` (defaults to today on entry).
- `note`: optional string, ≤ 280 chars (matches existing note constraint).
- `createdAt`: local-wall-clock ISO (via `app.js` `nowISO()`, same as transactions).

### Schema version

Bump `schemaVersion` 1 → 2 (this is a structural addition of a top-level collection, unlike
the field-only credit change). Initialize `wifePayments: {}` in **`Store.empty()`**, in
**`Migrate`** (idempotent — create if absent), and validate its shape in **`Validate`**.

## Two independent settlements

For any wife purchase there are two unrelated yes/no states:

1. **Did the user pay the BANK?** → existing `liabilitySettled` flag (per-item Paid /
   Mark-all-paid on the Credit tab). Unchanged.
2. **Did SHE pay the user back?** → **not** a per-item flag. Captured only by the running
   balance (`wifePayments`). She may settle before or after the bank is paid.

## Balance logic — `Calc.wifeSummary(state)` (new pure fn)

Mirrors `liabilitySummary`'s style. Returns:

- `charged` = Σ `txnSignedAmount(t)` over `state.transactions` where `t.byWife` (a wife
  **refund** — `isRefund:true` — naturally reduces it via the existing signed-amount helper).
- `paid` = Σ `p.amount` over `state.wifePayments`.
- `balance` = `round2(charged − paid)` → **"Wife owes you AED X"**. May be **negative** if she
  overpaid (shown as a credit, see UI).
- `purchases` = her transactions, newest-first.
- `payments` = her transfers, newest-first.

Add `wifeSummary` to the `Calc` return object.

**Worked example:** wife buys 100 (`byWife,isCredit`), buys 50, refunds 20
(`byWife,isCredit,isRefund`) → `charged = 130`. She transfers 80 (lump) + 50 (for the second
item) → `paid = 130` → `balance = 0`.

### Edge cases (decided)

- **Overpayment / negative balance:** allowed. Displayed as **"Wife credit: AED X"**. The
  Record-payment amount is pre-filled with the current balance **only when balance > 0**;
  otherwise the field starts empty.
- **Wife refund (`byWife + isRefund`):** allowed and meaningful — she returned an item, which
  reduces what she owes (handled by `txnSignedAmount`). It is distinct from her *paying him
  back* (a `wifePayment`). UI labels it as a refund, not a payment.
- **Deleting a wife purchase that's been (aggregately) paid:** balance may go negative; this is
  acceptable — it's the user's own correction and the derived balance stays internally correct.

## UI

### Lives inside the existing Credit tab (no new bottom tab)

`src/views/liabilities.js` gains a **"Wife owes you" card**, rendered alongside the existing
bank-credit card:

- **Balance** — big number from `wifeSummary.balance` (or "Wife credit: …" when negative; an
  all-settled empty state at exactly 0).
- **Record payment** button.
- **Her purchases** — collapsible list, newest-first. Each row tappable (see below).
- **Her payments** — collapsible list, newest-first. Each row has a **remove** action with the
  existing toast-undo pattern.

The existing bank card/list is unchanged except that wife items in it carry a **"Wife"** tag
(per the resolved bank-list treatment) and remain part of Mark-all-paid.

### Record payment sheet

A small sheet (follows `entrySheet.js` conventions):
- **Amount** — pre-filled with current balance when balance > 0, else empty.
- **Date** — defaults to today (today/yesterday/custom, like the entry sheet).
- **Note** — optional.

**Per-item clear (Q2):** tapping a purchase in "Her purchases" opens this same sheet
pre-filled with *that purchase's amount*. This is a **convenience for entering the right
number** — it records a normal `wifePayment`; it does **not** mark that specific row settled
(the model is aggregate). The purchases list is a charge history; the balance is the truth.

### Entry / Edit sheets

- Add a **"Wife"** toggle beneath the existing "On credit" toggle in both
  `entrySheet.js` and `editSheet.js`.
- When Wife is turned **on**: set `isCredit:true` + `isExcludedFromPace:true`, and **disable +
  lock** the on-credit toggle (visually checked, non-interactive) with a hint such as
  "Wife purchases are always on credit."
- When Wife is turned **off** (edit): re-enable the on-credit toggle.
- `entrySheet.js` `local` object initializes `byWife:false`; `onSave` includes `byWife`.

### Tags in Home / History

`home.js` and `history.js` (the `creditTag` spot, ~line 7) gain a **Wife** tag for `byWife`
transactions, alongside the existing Credit tag.

## Persistence, migration, validation, export

- **`Store` (`store.js`):** `empty()` includes `wifePayments: {}`. New immutable mutators
  `addWifePayment(state, payment)` and `deleteWifePayment(state, id)`, following the
  `addTransaction` / `deleteTransaction` clone-and-patch pattern. `addWifePayment` throws on
  missing `id` or non-positive `amount`; `deleteWifePayment` throws if `id` absent.
  `Store.addTransaction` / `updateTransaction` enforce the `byWife` invariant (force
  `isCredit` + `isExcludedFromPace`).
- **`Migrate` (`migrate.js`):** idempotent — create `state.wifePayments = {}` if absent;
  backfill `t.byWife = false` where undefined; set `schemaVersion = 2`. Re-running is a no-op.
- **`Validate` (`validate.js`):** check `wifePayments` is an object and each entry has
  `id`, `amount` (number > 0), `date` (ISO), `note` (string ≤ 280), `createdAt` (ISO); check
  `byWife` is boolean on transactions.
- **Export:**
  - JSON backup covers `wifePayments` automatically (whole-state envelope).
  - CSV (`settingsSheet.js` `exportCSV`, ~lines 19/27): add a **`byWife`** column after
    `onCredit`. Her payments are **JSON-only** (not in the transaction CSV).
- **`seed.js` / onboarding sample txns:** set `byWife:false` explicitly on any sample
  transactions created in-memory before first persist.

## i18n

New string keys (English + Arabic stubs in `i18n.js`), e.g.:
`wife_tag`, `wife_owes_you`, `wife_credit` (overpaid label), `record_payment`,
`her_purchases`, `her_payments`, `wife_payment_removed`, `wife_always_credit_hint`,
`wife_settled_empty`. RTL is already handled by the existing logical CSS.

## CSS

`main.css`: a `.wife-card` block reusing `.summary-card` conventions; a Wife tag chip
(reuse/extend the credit-tag style); collapsible section styling consistent with the existing
paid-section pattern.

## Testing

New `tests/wife.test.js` (mirrors `tests/liabilities.test.js`):
- `wifeSummary`: `charged − paid`; wife **refund** reduces `charged`; multiple + **partial**
  payments; **overpayment** → negative balance; empty state.
- Invariant: `byWife` transaction is **excluded from pace/limit** but **counted in
  `liabilitySummary`**.
- `Store`: `addWifePayment` / `deleteWifePayment` immutability + validation throws;
  `addTransaction` forces `isCredit`+`isExcludedFromPace` when `byWife`.
- `Migrate`: initializes `wifePayments`, backfills `byWife`, bumps to v2, idempotent re-run.
- `Validate`: rejects malformed payments.
- Update `tests/integration.test.js` round-trip fixture to include a wife purchase + payment.

## Out of scope (YAGNI)

- Multiple people / a general payer list (Q3 = wife only).
- Per-purchase settlement flags / linking payments to specific purchases (aggregate balance is
  sufficient; tap-to-prefill covers the "specific item" case).
- Importing the `byWife` CSV column back in (CSV remains export-only as today; JSON is the
  round-trip format).

## Files touched (from validation, for the plan)

`src/store.js`, `src/calc.js`, `src/migrate.js`, `src/validate.js`, `src/seed.js`,
`src/app.js`, `src/components/entrySheet.js`, `src/components/editSheet.js`,
`src/components/settingsSheet.js`, `src/views/liabilities.js`, `src/views/home.js`,
`src/views/history.js`, `src/i18n.js`, `src/styles/main.css`, `index.html` (new sheet/script
wiring if needed), `tests/wife.test.js` (new), `tests/integration.test.js`.
