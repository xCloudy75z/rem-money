---
description: Reconcile the app's "On credit" total against the bank card statement, then tell the user exactly what to fix.
---

# Reconcile credit vs bank

Goal: find why the app's **On credit** (need-to-pay) total differs from the **bank credit-card** outstanding, and hand the user a short list of concrete edits that make them match to the fils. Explain everything in plain language (no jargon).

Optional argument `$ARGUMENTS` = the bank's current outstanding figure (e.g. `1971.78`), and/or a backup path. If not given, ask for the number in Step 1.

---

## Step 1 — Gather the required inputs (ask, then wait)

Request these before analysing. Don't proceed until you have the first two.

1. **The bank's current outstanding / statement balance** — one number. (May be in `$ARGUMENTS`.)
2. **The bank's credit-card transactions** — screenshots or pasted text. They must cover at least everything **since the last "Mark all paid"** in the app. Warn: screenshot seams overlap, so **watch for duplicate rows** across images.
3. **Confirm scope**: only the ONE tracked credit card feeds "credit." Spends paid from **other accounts (e.g. FAB), transfers, or cash** are NOT credit and must be excluded. Installment-converted card buys are excluded from the revolving balance too.

Tell the user you'll pull the latest backup yourself (Step 2).

## Step 2 — Pull the latest app backup

1. Make sure OneDrive is running (launch `OneDrive.exe` if not); it may lag a few minutes.
2. Newest backup lives in `C:\Users\games\OneDrive\Spending Tracker Backups\spending-tracker-backup-<date>.json` (it overwrites in place — check `LastWriteTime` to confirm it's fresh). See the `credit-reconciliation` memory.
3. Write the analysis script below to the scratchpad and run it with `node` (Bash tends to fail on the OneDrive path — use PowerShell to run node).

```js
// reconcile.js  —  usage: node reconcile.js "<backup path>"
const fs = require('fs');
const st = (j => j.state || j)(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
const cats = st.categories || {};
const name = id => (cats[id] && cats[id].name) || id || '—';
const arr = Array.isArray(st.transactions) ? st.transactions : Object.values(st.transactions || {});
const m = n => (Math.round(n * 100) / 100).toFixed(2);
const signed = x => (x.isRefund ? -Number(x.amount || 0) : Number(x.amount || 0));

// Outstanding = every isCredit && !liabilitySettled, refunds signed negative (mirrors Calc.liabilitySummary)
let outstanding = 0; const unpaid = [], paid = [];
for (const x of arr) { if (!x || !x.isCredit) continue; x.liabilitySettled ? paid.push(x) : (unpaid.push(x), outstanding += signed(x)); }
outstanding = Math.round(outstanding * 100) / 100;

// Comparison window = after the most recent bulk settle (settledAt)
const lastSettle = paid.map(x => x.settledAt).filter(Boolean).sort().pop();
console.log('OUTSTANDING (app "On credit"):', m(outstanding), '| unpaid items:', unpaid.length);
console.log('Last bulk "Mark all paid":', (lastSettle || '(none)').slice(0, 19), '→ compare bank items AFTER this date\n');

console.log('=== UNPAID CREDIT ITEMS (newest first) — diff these against the bank ===');
unpaid.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
unpaid.forEach((x, i) => console.log(String(i + 1).padStart(2), x.date, m(signed(x)).padStart(9), ' ',
  name(x.categoryId).padEnd(15), (x.note || '').slice(0, 34), [x.isRefund && 'REFUND', x.byWife && 'WIFE'].filter(Boolean).join(',')));

console.log('\n=== CULPRIT 1: card-era spends marked NOT credit (should some be credit? e.g. petrol/ADNOC) ===');
arr.filter(x => !x.isCredit && !x.isRefund && (x.date || '') >= (lastSettle || '0000').slice(0, 10))
   .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
   .forEach(x => console.log(' ', x.date, m(x.amount).padStart(9), '|', name(x.categoryId).padEnd(15), '|', (x.note || '').slice(0, 34)));

console.log('\n=== CULPRIT 3: refunds NOT tagged on-credit (won\'t reduce the total) ===');
arr.filter(x => x.isRefund && !x.isCredit)
   .forEach(x => console.log(' ', x.date, m(x.amount).padStart(9), '|', name(x.categoryId), '|', (x.note || '').slice(0, 34)));
```

## Step 3 — Diff and classify

1. Catalogue the bank rows from the screenshots, **deduping seam overlaps**. Keep only rows **after the last "Mark all paid"** (Step 2 prints that date).
2. Match each app unpaid item to a bank charge. Then sort the leftovers into these buckets:
   - **Culprit 1 — on the card but logged as non-credit** (classic: petrol/ADNOC). → app too low; fix = mark credit.
   - **Culprit 2 — in app credit but NOT on the bank** (a transfer/cash/other-account spend wrongly tagged credit). → app too high; fix = untick "on credit".
   - **Culprit 3 — a refund entered without "on credit"** (the script flags these). → app too high; fix = tick "on credit" (keep refund flag).
   - **Excluded — installments / other accounts (FAB)**: appear on the bank but correctly not in the revolving balance and not in the app. Leave out.
3. Build the reconciling equation and check it lands on the bank figure exactly:
   `app outstanding  +Σ(culprit 1)  −Σ(culprit 2)  −Σ(culprit 3 refunds)  = bank outstanding`

## Step 4 — Tell the user what to do

Report in plain language:
- The **gap** (app vs bank) and the **exact arithmetic** that closes it.
- A short **checklist of edits** (each with its ± effect): "mark ADNOC 213.82 as credit (+213.82)", "untick the 180 transfer (−180.00)", "tick 'on credit' on the 3.02 refund (−3.02)".
- The **projected total after edits**, shown equal to the bank number.
- Anything intentionally **excluded** (FAB, installments) so it's clear it's not a bug.

Offer to re-verify once they re-export the backup to OneDrive.

---

### Reference facts
- Formula: outstanding = Σ amount where `isCredit && !liabilitySettled`, refunds (`isRefund`) count negative.
- It's **all-time** unsettled, not per-cycle. "Mark all paid" settles everything at once with a shared `settledAt`.
- Only the one credit card = "credit." FAB / transfers / cash / installments are out.
- The three recurring drift culprits: (1) petrol/ADNOC logged non-credit, (2) transfer/cash marked credit, (3) refund missing the on-credit tag.
