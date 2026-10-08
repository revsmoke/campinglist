# Claude Code Assistant Notes

## Project Information

- **Project Name**: CampList (camplist.guide)
- **Description**: Free camping checklist planner. Static, client-side web app (ES modules, no bundler, no server), deployed as a Replit static deployment from `public/`.
- **Main Files** (all under `public/`):
  - `index.html` - page shell, dialogs, CSP meta
  - `js/app.js` - entry point
  - `js/state.js` - lists, items, undo/redo, per-account namespaces, persistence (localStorage)
  - `js/ui.js` - rendering and event handling
  - `js/dialogs.js` - confirm/prompt dialogs and toasts
  - `js/auth/` - `accounts.js` (local accounts, sessions, linking rules), `auth.js` (UI flow), `google-auth.js` (GIS), `microsoft-auth.js` (MSAL v5)
  - `js/storage/` - `storage.js` (panel, save/load, conflicts), `google-drive.js` (Drive REST), `google-picker.js`, `onedrive.js` (Graph app folder)
  - `js/templates.js` - template browser (`/?template=<id>` deep link); `templates/*.json` + generated `templates/index.json`
  - `guide/` - generated picture guides (`index.html`, `templates.html`, `templates/<id>.html`, `img/`), hand-written `guide.css`; inputs live in repo-root `guides/` (`locales/<lang>.json`, step structure, shot metadata), see `docs/GUIDES.md`
  - `plan/` + `js/wizard/` (`questions.js`, `rules.js`, `judge.js`, `wizard.js`) + `wizard/modules.json` - the trip wizard: deterministic rules, keyword matching, optional TypeSafe (Jev) judge via `server/index.mjs` (repo root; keeps `TYPESAFE_API_KEY`), see `docs/WIZARD.md`
  - `js/sponsors.js` + `sponsors.json` - labelled sponsor/house cards, optional AdSense/Plausible
  - `js/maps.js` - lazy Google Places autocomplete
  - `js/config.js` - public configuration (client IDs, Maps key, feature flags)
  - `css/camplist.css`, `vendor/` (pinned DOMPurify, MSAL), `auth/redirect.html` (MSAL bridge)

## Commands

- `npm test` - Vitest unit tests (jsdom)
- `npm run test:e2e` - Playwright journeys (serves `public/` on port 8787; Google APIs are mocked)
- `npm run lint` - ESLint (flat config)
- `npm run format` - Prettier
- `npm run templates:index` / `npm run templates:validate` - rebuild/validate template index
- `npm run guides:shots` - re-take the guide screenshots with Playwright (after UI changes)
- `npm run guides:build` - rebuild `public/guide/` and `public/sitemap.xml` (after template or guide-text changes)
- `npm run serve` - Node server: `public/` plus `POST /api/judge` (needs `TYPESAFE_API_KEY`; without it the endpoint answers 503)
- `npm run vendor` - re-copy pinned browser libraries into `public/vendor`
- `npm run check` - lint + templates + guides build + unit + e2e

## Important Notes

- The only secret is `TYPESAFE_API_KEY`, read by `server/index.mjs` from the environment (a Replit secret); never put it in `public/` or `config.js`. Otherwise no secrets exist in this project. Client IDs and the Maps browser key are public and protected by origin/referrer restrictions in Google Cloud (see `docs/AUTH.md`). Never put `keys.txt` or `client_secret*.json` under `public/`.
- Data lives in the visitor's browser (`localStorage`) and optionally in their own Google Drive / OneDrive. Cloud access tokens are kept in memory only.
- Guest data is namespaced under `campList.v2.guest.*` and mirrored to the legacy `campChecklist_*` keys for rollback safety; do not remove that mirror without a migration plan.
- Sign-in and storage are separate user decisions; keep them separate in the UI.
- Microsoft/OneDrive and ads/analytics stay disabled until their identifiers are set in `config.js`.

## Conventions

- Run `npm run lint && npm test` before committing; run `npm run test:e2e` for UI changes.
- Keep every paid placement labelled; max two placements; no pop-ups or sticky ads.
- Templates: add a JSON file, run `npm run templates:index` and `npm run guides:build`, cite sources and set `reviewedOn`.
- Guides: never edit `public/guide/*.html` by hand (generated, Prettier-ignored); change `guides/` inputs and rebuild. Guide text goes in `guides/locales/<lang>.json`; keep labels to a few words.
- Wizard: keep decisions in `rules.js` (pure, unit-tested); the judge only maps typed text to existing options. Thresholds in `judge.js`.
- Docs: `docs/PLAN.md` (findings/plan), `docs/AUTH.md`, `docs/MONETIZATION.md`, `docs/TEMPLATES.md`, `docs/GUIDES.md`, `docs/WIZARD.md`, `docs/DEPLOYMENT.md`, `docs/HANDOFF.md`.
