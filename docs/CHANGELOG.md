# Changelog

Notable changes to Spending Tracker 2.0. Newest first.

## 2026-06-08

### Fixed
- **Transaction times displayed in the wrong timezone.** `app.js` stamped `createdAt`/`updatedAt`
  with `toISOString()` (UTC) while the rest of the app reads ISO strings as literal local wall-clock
  (e.g. `Format.fmtTime` extracts `HH:MM` verbatim). In UTC+4 (UAE) every recorded time showed 4 hours
  behind the actual entry time, and could group a late-evening spend under the wrong day.
  - **Fix:** `nowISO()` now builds the timestamp from **local** `Date` components (matching the
    long-standing behavior of `todayISO()`), so new entries display the correct local time.
  - **Back-fill:** a one-time migration (`Migrate.localizeTimestamps`, driven by the injected
    `App.localizeISO`) converts pre-existing UTC `createdAt`/`updatedAt` to local on next load.
    It is gated by a new `settings.localTimestamps` flag so it runs **exactly once** and never
    double-shifts entries that are already local. Idempotent: re-runs from the always-UTC stored
    source produce the same result until a mutation bakes it in.
  - **Tests:** +1 in `format.test.js` (local wall-clock round-trip), +3 in `migrate.test.js`
    (localizes once, respects the flag, no-op without an injected converter). 153 → **156 tests**.
  - Pure-module discipline preserved: `app.js` remains the only module touching `new Date()`;
    the migration receives the converter as an argument.

### Changed — infrastructure
- **Deployment moved from Netlify to GitHub Pages via CI.** Dropped the manual "drag `dist/` to
  Netlify Drop" flow. The `v2/` folder is now a git repo (`xCloudy75z/rem-money`); a GitHub Actions
  workflow (`.github/workflows/deploy.yml`) runs test → lint → build → deploy on every push to `main`.
  Shipping is now just `git push`. See [DEPLOYMENT.md](DEPLOYMENT.md).
- Repo restructured: source at root, `dist/` gitignored (CI builds it). The previous "built files at
  root" layout was backed up to a `pre-restructure` branch, then removed once CI was verified.
- Added `.gitattributes` (normalize line endings) and removed the obsolete `netlify.toml`.
- CI actions pinned to `checkout@v5` / `setup-node@v5` with `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`
  to clear the Node 20 runner deprecation.
- CI skips deploys for doc-only pushes (`paths-ignore: ['**/*.md', 'docs/**']`); a code change still
  deploys, and `gh workflow run` forces one manually.

### Security
- Redacted and **revoked** live tokens (GitHub classic PAT, Netlify PAT, a fine-grained PAT) that had
  been listed in plaintext in `HANDOVER-2026-05-31.md`. GitHub push protection blocked the initial
  push, so they were never committed to the remote; the commit history was rewritten to exclude them.

## 2026-05-30

- **V1 shipped.** All 8 layers complete; 152 tests green. See [PROJECT-STATUS.md](PROJECT-STATUS.md)
  for the layer-by-layer breakdown and locked decisions.
