# Updates — Read me first

**Short version: deploys are safe. Your data lives in your browser, not on the website.**

## What you need to know

When I push a new version of Spending Tracker to your Netlify URL:

1. **Your transactions stay.** They're stored in your phone's browser storage (`localStorage`), not on the website. Updating the website doesn't touch your phone.
2. **You'll see a small "A new version is available · Reload" toast** the next time you open the app. Tap Reload to get the new version. Or ignore it — the old version keeps working.
3. **If anything looks wrong after an update**, you can:
   - Tap **Settings → Backup → Export JSON backup** (do this *now* as a habit — see below)
   - Reinstall from the URL → Import the JSON backup → you're back

## Habit: back up once a week

Open the app, tap **⚙ Settings → Backup → Export JSON backup**. Save the file to OneDrive, Google Drive, or email it to yourself.

That JSON file is your only safety net if:
- You clear your browser data
- You switch phones
- Your browser glitches and loses storage
- The app changes its data format in a way I forgot to test (rare but possible)

It takes 10 seconds. Do it on the 1st of every month at the same time you check your bank balance.

## What lives where

| Thing | Where | What happens if site goes down? |
|---|---|---|
| Your transactions | Your phone's browser | Nothing — they're not on the site |
| The app code | Netlify (the website) | Site has a downtime, but you can still open the installed app icon if it cached |
| Your backup JSON file | Wherever you saved it (OneDrive etc.) | It's a normal file. Open it in any text editor. |

## If you need to roll back

Tell me which version was last good. I keep the previous build in `dist/` history. I can redeploy it in 60 seconds.

## Questions

If anything feels off — wrong number, sheet won't close, button doesn't work — message me. Don't try to "fix" it by clearing data; that's the one thing that can lose your transactions.
