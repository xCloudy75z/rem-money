# Deployment

**TL;DR — to ship a change:** commit and `git push`. CI does the rest.

```powershell
cd "C:\Users\games\Desktop\Spending Tracker\v2"
git add -A
git commit -m "describe the change"
git push
# ~2 min later it's live at https://xcloudy75z.github.io/rem-money/
```

## How it works

This `v2/` folder **is** the GitHub repo [`xCloudy75z/rem-money`](https://github.com/xCloudy75z/rem-money) — the
source lives at the repo root. The built single-file app (`dist/`) is **not** committed; it is a build
artifact (gitignored) that GitHub Actions regenerates on every push.

```
git push to main
  └─► .github/workflows/deploy.yml  (GitHub Actions)
        1. npm test            ← 156 tests must pass
        2. npm run lint:pure   ← pure modules must stay clean
        3. npm run build       ← src/ → dist/index.html + sw.js + icons + manifest
        4. upload dist/ as the Pages artifact
        5. deploy to GitHub Pages
  └─► live at https://xcloudy75z.github.io/rem-money/
```

If tests or lint fail, **the deploy is skipped** — a broken build never reaches production.

## One-time setup (already done — recorded for future machines)

- **Tools:** `git` and `gh` (GitHub CLI), installed via `winget install Git.Git` / `winget install GitHub.cli`.
  A fresh PowerShell may need them on PATH:
  `$env:Path += ";$env:ProgramFiles\Git\cmd;$env:ProgramFiles\GitHub CLI"`
- **Auth:** `gh auth login` (GitHub.com → HTTPS → web browser). This also configures git's credential helper,
  so `git push` works without re-entering credentials. Token is stored in the OS keyring.
- **Pages source:** repo Settings → Pages → Build and deployment → Source = **GitHub Actions**
  (not "Deploy from a branch"). Verify with `gh api repos/xCloudy75z/rem-money/pages` → `"build_type":"workflow"`.

## Watching / inspecting a deploy

```powershell
gh run list --limit 5                 # recent runs + status
gh run watch <run-id> --exit-status   # live progress until it finishes
gh run view <run-id> --log-failed     # logs for a failed run
```

Verify the live site actually updated (cache-bust to bypass the service worker):

```powershell
(Invoke-WebRequest "https://xcloudy75z.github.io/rem-money/index.html?cb=$([guid]::NewGuid())" -UseBasicParsing).Content.Length
```

## What the user sees after a deploy

Their data is in their phone's `localStorage`, untouched by deploys. On next open they get a
"new version available · Reload" toast (service worker, stale-while-revalidate). See [owner/UPDATE.md](owner/UPDATE.md).

## Rolling back

Every version is a commit. To roll back, revert and push — CI redeploys the older build:

```powershell
git revert <bad-commit>     # or: git revert HEAD
git push
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Push rejected: "Push cannot contain secrets" | GitHub push protection found a token in a commit. Remove/redact it and rewrite the commit — never bypass. (This happened once with an old PAT in `HANDOVER-2026-05-31.md`; the tokens were redacted and revoked.) |
| CI fails at **Test** | A test broke. Run `npm test` locally, fix, push again. Deploy is correctly blocked until green. |
| CI fails at **Lint pure modules** | A pure module (`calc/store/validate/migrate/seed/format`) used `new Date()`/`Math.random()`/etc. Move the impurity into `app.js` and inject it. |
| Live site shows old version | Service worker cache — hard-refresh, or open the app twice (first open fetches in background, second shows the update). |
| Deploy succeeds but Pages doesn't update | Confirm Pages source is "GitHub Actions" (`build_type: workflow`), not branch deploy. |
| "Node.js 20 … forced to run on Node.js 24" notice | Benign. The Pages actions haven't shipped Node 24 builds yet; the workflow's `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` env handles it. Self-resolves by ~June 2026. |

## Files that drive deployment

- `.github/workflows/deploy.yml` — the CI pipeline
- `scripts/build.js` — the inliner (`src/` → `dist/`)
- `.gitignore` — keeps `dist/` and `node_modules/` out of the repo
- `package.json` — `test`, `lint:pure`, `build` scripts (no dependencies)
