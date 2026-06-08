# Spending Tracker 2.0

Offline-first PWA spending tracker. Single-file deploy.

## Dev
- `npm run dev` — watch + rebuild + serve on http://localhost:5173
- `npm test` — run Node test suite
- `npm run lint:pure` — verify calc/store/validate/migrate/seed/format have no `new Date()` / `Math.random()` / etc.

## Build
- `npm run build` — emits `dist/index.html` (single inlined file) + `dist/sw.js` + icons/manifest

## Deploy (GitHub Pages via CI)
- Repo: https://github.com/xCloudy75z/rem-money — this `v2/` folder **is** the repo (source at root).
- Just `git push` to `main`. The GitHub Action (`.github/workflows/deploy.yml`) runs `npm test`,
  `npm run lint:pure`, `npm run build`, then publishes `dist/` to GitHub Pages.
- Pages source must be set to **GitHub Actions** (Settings → Pages → Build and deployment → Source).
- `dist/` is gitignored — it's a build artifact, never committed; CI rebuilds it.
