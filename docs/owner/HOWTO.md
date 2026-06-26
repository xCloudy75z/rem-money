# How to use Spending Tracker

The app answers one question: **"How much can I spend today and still make it to payday?"**

## Logging a spend (the only thing you do daily)

1. Tap the green **+** button (bottom right)
2. Type the amount — e.g. `35`
3. Tap a **category chip** — Food, Transport, Bills, Fun, Other
4. Tap **Save**

That's it. The big number at the top updates instantly.

**Shortcuts:**
- Tap **+10 / +25 / +50 / +100** to add to the amount (e.g. type 50, tap +25 → becomes 75)
- Tap **Save & add another** to log multiple spends in a row without closing the sheet
- Tap **Yesterday** if you forgot to log something yesterday
- Tap **📅 Pick date** to log a spend for any other day

## Reading the home screen

```
        AED LEFT TODAY
        AED 443.23
        Spent today 35.80 AED · of 479.03 AED limit
        🟢 On track    ·    26 days left
```

- **Big number** = how much you can still spend today without breaking the budget
- **Spent today** = total you've logged today
- **Of XYZ AED limit** = today's allowance, calculated from remaining budget ÷ remaining days
- **🟢 On track / 🟡 Slightly fast / 🔴 Spending fast** = pace vs. a steady spender
- **Days left** = days until your next salary

## Fixing a mistake

**Wrong amount or wrong category?**
Tap the spend row → change → **Save changes**.

**Wrong date?**
Tap the spend row → change the date field → **Save changes**.

**Logged something by accident?**
Tap the spend row → **Delete** (red) → confirm. You have **10 seconds** to tap **UNDO** on the toast that appears.

**Got a refund?**
Add a new spend with the **Refund** toggle ON. It subtracts from your total.

## Looking at the past

Tap **History** in the bottom tab bar.

- Today's spends, then yesterday's, then earlier days
- Tap any row to edit
- **Cycle switcher** at the top: tap a past cycle to see its summary (total spent, biggest day, biggest category)

## When the cycle ends

On the day of your salary (or after), open the app. A sheet appears:

> Cycle ended 🎉
> 25 Apr → 24 May. Here's the summary...

Tap **"Start next cycle · same budget"** and you're set. The old cycle is archived but still browsable in History.

If your salary changed, tap **"Start with a different budget"** instead.

## Planning your budgets

Tap **Plan** in the bottom tab bar.

This is where you set a budget per category and see how you're tracking.

- **Set a budget:** tap a category → type the amount → choose **Monthly** or **Yearly** → Save.
  Got a yearly bill (e.g. car insurance 6,000/year)? Enter `6000` and pick **Yearly** — the app shows
  you the monthly slice (500) automatically. You never do the math.
- **Progress bars:** each category shows `spent this cycle / budget`. The bar turns **red** with an
  "Over by X" line if you go over.
- **Monthly / Annual toggle** (top): flip it to see every budget — and the totals — as monthly or
  yearly amounts. It's just a view switch; it doesn't change anything.
- **Total planned:** the sum of all your category budgets.
- **Unallocated (💰, pinned at the top):** your **cycle budget minus everything you've budgeted**.
  This is money you haven't assigned to a category yet. It turns red ("Over-allocated") if your
  category budgets add up to more than your cycle budget.
- **Manage categories here:** add, rename, recolor, or delete categories on this page (the old
  Settings → Categories is now just a shortcut here).

Budgets are a planning tool — they do **not** change the "left today" number on Home.

## Settings

Tap the **⚙ gear** (top right).

- **Cycle:** change your budget or salary day
- **Categories:** a shortcut to the **Plan** page, where you add, rename, recolor, delete, and budget categories. Can't delete a category that has spends — reassign first.
- **Display:** Light / Dark / Auto theme · currency label
- **Backup:** Export JSON (your safety net) · Import (restore) · Export CSV (for Excel)
- **App → ↻ Refresh app:** force-loads the latest version (clears the cached copy and reloads). Use it after an update instead of reinstalling — your data is kept.
- **Reset all data:** wipes everything. Has a 30-second UNDO.

## Backups

**Once a week:** Settings → Backup → **Export JSON backup** → save it to OneDrive or email.

If anything ever goes wrong (cleared cookies, new phone, app glitch), you can:
1. Open the app fresh
2. Tap landing page → Get started → onboard with any temp budget
3. Settings → Backup → **Import backup** → pick your saved JSON
4. Confirm — your data is back

## Installing as a phone app

**iPhone (Safari):** Tap the Share icon → scroll → **Add to Home Screen**.
**Android (Chrome):** Tap the **⋮** menu → **Install app**.

After installing, the app icon launches it full-screen — no browser bar, no URL bar. Looks and feels native. Works offline (after the first open).

## Works offline?

Yes. After the first time you open the app online, it caches itself. You can:
- Open it on a plane
- Use it in the metro / parking basement
- Lose internet entirely

Data is on your phone, not the cloud. Logging spends works offline. They don't "sync" anywhere — they live on the phone.
