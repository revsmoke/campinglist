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
  - `js/templates.js` - template browser; `templates/*.json` + generated `templates/index.json`
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
- `npm run vendor` - re-copy pinned browser libraries into `public/vendor`
- `npm run check` - lint + templates + unit + e2e

## Important Notes

- No secrets exist in this project. Client IDs and the Maps browser key are public and protected by origin/referrer restrictions in Google Cloud (see `docs/AUTH.md`). Never put `keys.txt` or `client_secret*.json` under `public/`.
- Data lives in the visitor's browser (`localStorage`) and optionally in their own Google Drive / OneDrive. Cloud access tokens are kept in memory only.
- Guest data is namespaced under `campList.v2.guest.*` and mirrored to the legacy `campChecklist_*` keys for rollback safety; do not remove that mirror without a migration plan.
- Sign-in and storage are separate user decisions; keep them separate in the UI.
- Microsoft/OneDrive and ads/analytics stay disabled until their identifiers are set in `config.js`.

## Conventions

- Run `npm run lint && npm test` before committing; run `npm run test:e2e` for UI changes.
- Keep every paid placement labelled; max two placements; no pop-ups or sticky ads.
- Templates: add a JSON file, run `npm run templates:index`, cite sources and set `reviewedOn`.
- Docs: `docs/PLAN.md` (findings/plan), `docs/AUTH.md`, `docs/MONETIZATION.md`, `docs/TEMPLATES.md`, `docs/DEPLOYMENT.md`, `docs/HANDOFF.md`.
