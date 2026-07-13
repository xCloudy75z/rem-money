# Spending Tracker — project instructions

Offline-first vanilla-JS PWA. Architecture & conventions live in `docs/PROJECT-OVERVIEW.md`;
current state in `docs/PROJECT-STATUS.md`. Pure modules (calc/store/validate/migrate/seed/format/smsParse)
must not use `new Date`/`Math.random` — enforced by `npm run lint:pure`. Tests: `npm test`.

## Devices & workflow (fixed roles)

| # | Device | Role |
|---|--------|------|
| 1 | **Local PC** | Dev: build, tests, git, deploys. |
| 2 | **iPhone (Remote 1)** | **Production "keeper."** The real, kept copy of the app + data. Source of truth for real backups. |
| 3 | **College PC (Remote 2)** | Remote Claude session; **only GitHub Pages URLs reachable** — localhost and everything else is blocked. |
| 4 | **College phone / Android (Remote 3)** | **Testing only.** All hands-on testing here, via GitHub Pages URLs. Throwaway data — the user will **never export a backup from the Android**; never treat Android state as real. |

**Rules:**
- Testing → Android (Remote 3) against a GitHub Pages URL. Never tell a remote device to use localhost.
- **"iPhone Update" is a trigger phrase:** when the user says it, give the complete step-by-step to apply/update on the **iPhone** (install/refresh the PWA, restore-from-JSON, etc.). That's where real changes land.
- Live app deploys from `main` via GitHub Actions → https://xcloudy75z.github.io/rem-money/ .
- **Test-before-merge** for remote devices uses a **disposable preview repo** `xCloudy75z/rem-money-preview`
  (Pages: `main` / root → https://xcloudy75z.github.io/rem-money-preview/ ). Separate origin ⇒ separate
  storage, so the real app/data stay untouched. Delete the preview repo after merge.

## Deploy

`git push` to `main` → Actions (test → lint → build → deploy `dist/` to Pages). Confirm with the user
before merging to `main`, since it deploys to the live iPhone app.
