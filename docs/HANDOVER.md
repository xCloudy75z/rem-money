# Handover — Spending Tracker 2.0

For future-me, future-Claude, or any engineer picking this up.

## What this is

Single-user offline-first PWA for tracking daily spending against a fixed cycle budget. Rebuilt from a legacy single-file `tracker.html` (still in `Desktop/Spending Tracker/`) into a tested, modular, properly-architected version (`Desktop/Spending Tracker/v2/`).

Read first:
- `docs/PROJECT-OVERVIEW.md` — architecture map
- `docs/PROJECT-STATUS.md` — current state, what's done, what's next
- `docs/owner/HOWTO.md` — how the user uses the app

## How to ship a change

```
cd "C:\Users\games\Desktop\Spending Tracker\v2"
npm test                   # all 152 tests must pass
npm run lint:pure          # pure modules must stay clean
git push                   # CI (.github/workflows/deploy.yml) tests, lints,
                           # builds, and deploys dist/ to GitHub Pages.
#   Repo: https://github.com/xCloudy75z/rem-money (this v2/ folder IS the repo)
#   Pages source = "GitHub Actions". Don't commit dist/ (gitignored; CI builds it).
```

Before any non-trivial change:
1. Read `07-product-specification.md` (in `Desktop/Spending Tracker/rebuild/`) for locked decisions
2. Write a failing test first if the change touches `calc.js`, `store.js`, `migrate.js`, `validate.js`, or `format.js`
3. Run `npm run lint:pure` after editing any pure module

## Deploy this for the first time (cutover from legacy)

The user is currently using `Desktop/Spending Tracker/tracker.html` on a Netlify URL (the v1 deploy). To cut over:

1. **Build v2**
   ```
   cd "C:\Users\games\Desktop\Spending Tracker\v2"
   npm run build
   ```

2. **Get a new Netlify URL** (don't overwrite the v1 URL yet)
   - Drag `v2/dist/` onto https://app.netlify.com/drop
   - Pick a memorable subdomain like `spending-tracker-v2.netlify.app`
   - Save the URL

3. **User exports their v1 data**
   - User opens the existing v1 app on their phone
   - Settings → Backup (JSON) → save the file to OneDrive

4. **User opens the v2 URL on their phone**
   - Landing page appears
   - Tap "Start tracking →"
   - Onboard with any temp budget (this just creates a placeholder cycle)
   - Then: Settings → Backup → **Import backup** → pick the saved JSON
   - Confirm — v0 schema migrates to v1 automatically; all txns appear under "Other" category
   - User can recategorise transactions over the next few days

5. **User installs v2 as a PWA**
   - iPhone: Share → Add to Home Screen
   - Android: ⋮ menu → Install app
   - The old v1 icon can stay on the home screen as backup for 30 days

6. **After 30 days of confirmed working v2**, remove the v1 Netlify site

## Why some things are the way they are

| Question | Answer |
|---|---|
| Why no React/Vue/build pipeline beyond an inliner? | Single user, single file deploy, want survivability on a phone in 5 years. Frameworks add risk surface for zero benefit at this scale. |
| Why IIFE modules instead of ES modules? | Lets the inliner concat trivially without a bundler. `<script>` tags work everywhere, no module-loading complications. |
| Why pure-module discipline so strict? | Two bug categories *disappear* — timezone bugs and "tests pass on Tuesday, fail on Wednesday." Worth the small ergonomic cost. |
| Why is the bundle 109 KB > 80 KB target? | Comfort scope expansion; one user; gzipped it's ~25 KB. Optimise later if it ever matters. |
| Why "today included in divisor"? | User explicitly chose this on 2026-05-30. Don't change without their say-so. |
| Why a phone frame on desktop? | The 440px-centered column looks lost on a 1920px screen. The frame makes the design read as intentional rather than broken. |

## Pitfalls to avoid

- **Don't add `new Date()` to a pure module.** `lint:pure` will fail. If you genuinely need time in a pure module, pass it as an argument.
- **Don't mutate state in place.** All Store mutators clone first. If you skip cloning, two views can become inconsistent.
- **Don't change the storage key without writing a migration.** It's `spending-tracker:v1`. New shape → bump `schemaVersion` inside, add a v1→v2 step in `migrate.js`.
- **Don't trust `prompt()` UX in Settings.** It's a placeholder. The plan has a `ReassignSheet` pattern that should be applied to budget edit and category rename in V2 polish.
- **Don't `console.log` in production code.** The lint script doesn't catch this yet.

## V2 priorities (in user-pain order)

1. **Replace `prompt()` in SettingsSheet** with proper in-sheet inputs for budget edit, salary day edit, category name/icon/color edit.
2. **Per-category soft budgets** — schema-additive (`budget?` on category), non-blocking chips.
3. **Arabic UI** — fill `STRINGS.ar` table, ship language toggle in Settings, set `dir="rtl"` on `<html>`.
4. **Backup reminder banner** — non-intrusive nudge every 30 days.
5. **Trend chip** — week-over-week category change (uses existing data, just `calc.js` addition).

Each of the above is a feature, not a rewrite. The schema and architecture already accommodate them.

## If the user reports a bug

1. Have them export their JSON backup first (always)
2. Ask them to take a screenshot of what they see
3. Ask them which step exactly broke it
4. Reproduce by importing their JSON into your local dev server
5. Write a failing test for the bug before fixing it
