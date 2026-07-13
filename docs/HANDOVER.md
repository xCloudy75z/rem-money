# Handover — Spending Tracker 2.0

**For the next session (Claude or engineer). Read this top to bottom before doing anything.**
Last updated: 2026-07-13.

---

## 1. Snapshot

- **What:** single-user, offline-first PWA. "How much can I spend today and still make payday?" — a self-correcting daily limit over a pay cycle (25th → 24th).
- **Repo:** `xCloudy75z/rem-money`. **This `v2/` folder IS the repo.** Anything on the Desktop outside `v2/` is legacy.
- **Live:** https://xcloudy75z.github.io/rem-money/ — deploys automatically on push to `main` (GitHub Actions → Pages).
- **State:** **334 tests green**, lint clean, build ~200 KB. Vanilla JS, IIFE modules, no framework, no deps.
- **Read next:** `docs/PROJECT-OVERVIEW.md` (architecture), `docs/PROJECT-STATUS.md` (state + locked decisions), `docs/CHANGELOG.md` (history), `docs/owner/HOWTO.md` (user-facing), and the memory files (auto-loaded).

## 2. Current state

**Live & shipped:** rolling daily limit + pace; History; **Credit** tab (on-credit liabilities); **Wife reimbursement** ("Wife owes you"); **Per-category budgets + Plan tab** (monthly/yearly toggle, progress bars, unallocated readout); **Refresh app** button (Settings → App); sheet **X-button** fix; and **Import spends from card SMS** (Settings → Backup → 📩 Add spends from messages).

**✅ Confirmed done (2026-07-13):** the SMS-import review sheet had a bad **iOS Safari** layout (native controls overlapping). Fixed with a **stacked, iOS-safe row** (each control full-width on its own line: category / amount+date / note / Wife) — deployed to live (`9b079c6`). **The user confirmed on their iPhone it looks "much better" — no further layout work needed.** (If a future long-batch import ever feels too tall, height can be tightened; it was deliberately traded height-for-safety.)

**Throwaway to clean up:** repo `xCloudy75z/rem-money-preview` still exists (a disposable preview). Couldn't auto-delete (token lacks `delete_repo` scope). Harmless; delete from its GitHub page when convenient.

## 3. Operating rules (these govern how to work — follow them)

### Devices (also in `CLAUDE.md` + memory `device-setup-and-workflow`)
| # | Device | Role |
|---|--------|------|
| 1 | **Local PC** | Dev: build, tests, git, deploys. |
| 2 | **iPhone (Remote 1)** | **Production keeper** — the real app + data. Source of truth for backups. |
| 3 | **College PC (Remote 2)** | Remote Claude session; **only GitHub Pages URLs reachable** (localhost blocked). |
| 4 | **College phone / Android (Remote 3)** | **Testing only.** Throwaway data; the user **never exports a backup from it**. |

- **"iPhone Update" is a trigger phrase.** When the user says it, give the full step-by-step to apply/update on the **iPhone** (Settings → App → ↻ Refresh app; restore-from-JSON only if needed). That's where real changes land. **Don't push to `main` / go live without the user's OK** — merging deploys to their live iPhone app.
- Testing happens on the **Android against a Pages URL**. Never tell a remote device to use localhost.
- **Communicate jargon-free** (memory `jargon-free-explanations`): plain language to the user, technical detail in docs/commits.

### Deploy & preview
- `git push` to `main` → CI (test → lint → build → deploy `dist/` to Pages). `dist/` is gitignored (CI builds it). Confirm with the user before merging to `main`.
- **Test-before-merge for remote devices** = a disposable **preview repo** `rem-money-preview` (Pages: main / root → https://xcloudy75z.github.io/rem-money-preview/). Push the built `dist/index.html` (+ sw.js, manifest, icons) there; separate origin ⇒ separate storage ⇒ real data untouched. (See memory `remote-delivery-constraints`, `verify-on-pages-not-local-dev`.)

## 4. How we build (the methodology — the user expects ALL of this)

The full pipeline, per feature:

1. **Brainstorm** (`superpowers:brainstorming`) — clarify one question at a time; use the visual companion / `mcp__visualize__show_widget` for layout questions; get design approval.
2. **Write the spec** → **ATTACK THE SPEC.** Run an adversarial multi-agent `Workflow`: N critics find holes, each finding independently verified, synthesized into fixes. Apply fixes.
3. **Write the plan** (`superpowers:writing-plans`) → **ATTACK THE PLAN.** Same adversarial workflow, this time tracing the plan's actual code against the repo.
4. **Build** (`superpowers:subagent-driven-development`) — one fresh subagent per plan task, strict TDD, frequent commits.
5. **ATTACK THE BUILD.** Adversarial multi-agent review over the final diff (correctness + invariants + regressions), each finding verified. Fix confirmed issues.
6. **For UI: ATTACK THE UI.** A multi-agent UI/UX/layout attack (density, tap targets, hierarchy/state, flow, a11y/theme) → merged redesign → implement → verify.
7. **Verify in a real browser** (Pages deploy — see §5), then ship.

**Rule the user is emphatic about: spec, plan, AND app code are each independently stress-tested "to break" before proceeding.** Don't skip a break stage. Scale the number of critics to the feature size.

Engineering invariants: pure modules (`calc/store/validate/migrate/seed/format/smsParse`) never use `new Date`/`Math.random`/`crypto` (enforced by `npm run lint:pure`); Store mutators clone (immutable); schema changes are **additive, no `schemaVersion` bump**, back-filled by `migrate.js` (old JSON backups must still load); storage key `spending-tracker:v1`.

## 5. Debugging playbook — issues we hit and the RIGHT fix (avoid the 100-iteration trap)

| Symptom | Root cause | Correct fix (do this immediately) |
|---|---|---|
| Local dev server serves **stale** JS/CSS after edits (even `cache:'no-store'` fetch) | `npm run dev` / preview MCP process caches files | **Don't trust local-dev for verification.** Verify on the **Pages deploy** (push to preview repo, wait `status:built`, navigate there, clear SW+caches, measure). |
| Browser **screenshots time out** in this environment | Renderer quirk | Use `mcp__Claude_Browser__javascript_tool` with `getBoundingClientRect()` / `getComputedStyle` for measurements. For the *user's* visual confirmation, ask them for a screenshot. |
| A CSS class toggled by JS **flips on instead of off** ("wall of red") | `el.classList.toggle('x', force)` with `force === undefined` **flips** (treats undefined as "no arg") | Coerce the force arg to boolean: `toggle('x', !!expr)`. Any boolean from `&&`/`||` chains can be `undefined`. |
| An element with the `hidden` attribute **still shows** | A class like `.chip { display: inline-flex }` overrides the UA `[hidden]{display:none}` | Hide via `el.style.display = 'none'` (or `!important`), not the `hidden` attribute. |
| **iOS Safari** layout overlaps though Chromium looks fine | Native `<select>`/`<input type=date/number>` have large intrinsic sizes and don't shrink in tight flex rows | **Stack controls** (one per line or a simple 2-col grid), give every control `width:100%; box-sizing:border-box`; don't cram multiple native controls on one flex line. **You cannot fully test iOS locally — get a user screenshot to confirm.** |
| Stale rendering after a deploy | Service worker + Cache Storage | Clear both before verifying: `caches.keys()→delete`, `serviceWorker.getRegistrations()→unregister`, then hard reload. (This is exactly what the in-app **Refresh app** button does for the user.) |
| `git` via **PowerShell** reports exit 1 but the command worked | PS wraps git's stderr as an error record | Look at the actual output lines (e.g. `-> main`); it usually succeeded. |
| Multi-line **commit messages** break / add a BOM | PS `-m` quoting + UTF-8 BOM | Write the message to a temp file with `[System.IO.File]::WriteAllText($f,$msg)` and `git commit -F $f`. |
| Deleting a repo via `gh` → 403 | Token lacks `delete_repo` scope | Can't delete programmatically; tell the user to delete from the repo's GitHub page, or `gh auth refresh -s delete_repo`. |
| Workflow agents die mid-run ("session limit … resets 1am Asia/Dubai") | Rate/usage limit | Re-run with `Workflow({scriptPath, resumeFromRunId})` after reset — cached agents replay instantly; only failed ones re-run. |

## 6. Repo / branch state

- `main` is current and deployed (HEAD ~ `9b079c6`, "iOS-safe stacked row layout").
- All feature branches this session were merged (`--no-ff`) and deleted. No open branches.
- `dist/` is gitignored; never commit it.

## 7. Architecture (one line each; full map in `PROJECT-OVERVIEW.md`)

`app.js` orchestrates (only module allowed `new Date`/uuid); pure `calc/store/validate/migrate/seed/format/smsParse`; `i18n` (en + ar); views `home/history/pastCycle/plan/liabilities/landing`; components `sheet/toast/confirmDialog/entrySheet/editSheet/settingsSheet/categorySheet/reassignSheet/recordPaymentSheet/importSmsSheet/…`; `scripts/build.js` inlines everything into `dist/index.html`.

## 8. Open items / candidate next work

- Confirm the iOS SMS-import layout (screenshot) → tighten height if needed.
- Delete the `rem-money-preview` throwaway repo.
- Deferred: Arabic UI (STRINGS.ar is stubbed, RTL-ready), trend/sparkline charts, transaction search, keyboard shortcuts, per-category soft-budget alerts.
- Infra: CI still forces Node 24 over deprecated Node 20 actions (non-blocking warning).

## 9. Starter prompt for the NEXT session (user will paste this)

> You are continuing work on the "Spending Tracker 2.0" PWA (`C:\Users\games\Desktop\Spending Tracker\v2`).
> **First, read `docs/HANDOVER.md` in full, then `docs/PROJECT-OVERVIEW.md`, `docs/PROJECT-STATUS.md`, and `CLAUDE.md`, and load your memory.** These define the project, the device setup, the "iPhone Update" trigger, the deploy/preview rules, the build methodology (spec → break, plan → break, build → break, plus a UI attack — all three artifacts adversarially stress-tested), and a debugging playbook of issues already solved (stale dev server → verify on Pages; iOS native-control overlap → stacked full-width layout; `classList.toggle(undefined)` flips → coerce with `!!`; etc.). Follow all of it.
> **Immediate context:** an iOS-safe redesign of the SMS-import sheet is live and I (the user, on iPhone) am about to send a screenshot to confirm it looks right. Wait for it before assuming the SMS feature is done.
> **Before starting any real work, if anything in the handover is unclear or underspecified, prepare a concise numbered list of questions for me to relay to the previous session** — don't guess on anything that could be answered. Otherwise, confirm you've read everything and ask what I want to build next.
