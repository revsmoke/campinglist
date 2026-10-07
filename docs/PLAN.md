# CampList — Inspection findings and implementation plan

Date: 2026-10-07. Author: lead engineer session. Status: executed in this branch; see `docs/HANDOFF.md` for the final state.

## 1. What exists today

| Area | Finding |
| --- | --- |
| Hosting | Replit app "Camplist.Guide (1)" (replId `451fb8e0-…`), **static deployment**, `publicDir = "/"`, custom domain `camplist.guide`. Last publish succeeded; live HTML last modified 2025-05-30. |
| Source of truth | **Diverged.** GitHub `main` last commit 2025-04-27. The Replit workspace carries newer, hand-edited files (title, hidden inputs, `rel=noopener`, refactored `state.js`, new `initMap`) that were never committed. |
| Live site: core list | Works: default template loads (11 sections / 85 items), add/check/delete, sections, undo/redo, theme, print, local JSON export/import, drag and drop. |
| Live site: broken | (1) **Google sign-in is dead**: `<script onload="gisLoaded()">` runs before the ES module that defines `window.gisLoaded` → `ReferenceError` → GIS never initialises → "Sign in with Google" button stays disabled forever. (2) **Places autocomplete never appears**: `callback=initMap` fires before `window.initMap` exists (`initMap is not a function`). (3) **Weight calculator, toasts and search filter are broken**: the live `ui.js` contains stub bodies (`/* ... (same as before) ... */`) for `convertWeightFromGrams`, `formatWeight`, `showToast`, `filterItems`, etc. Total weight renders empty. |
| Security | `keys.txt` is **served publicly** from the deployment root (`GET /keys.txt` → 200). The Maps/Picker browser API key is embedded in HTML (expected for a browser key, but it must be HTTP-referrer-restricted in Google Cloud). Prototype pages `googledrive.html` / `googledriveui.html` are deployed. The scope list on live requested `drive.appdata`, `drive.install`, `userinfo.*` — far more than needed. No CSP. DOMPurify loaded from a CDN without SRI. |
| Repo | No `package.json`, no tests, no lint config checked in (all gitignored), despite README/CLAUDE.md claiming `npm test`. `auth.js` in the repo has placeholder client IDs. |
| Data | Everything is in `localStorage` under `campChecklist_*` keys (single list, global, not per account). |
| Legal pages | `privacy.html` / `terms.html` exist (April 2025) and already anticipate accounts, analytics and ads. |

## 2. Architecture decision

**Keep CampList a static, client-side app (no backend) for this release.** Reasons: it matches the existing Replit static deployment (zero compute cost, trivial rollback), the product vision puts user-owned storage first, and every requirement in sections 2–7 of the brief can be met client-side:

* Sign-in = Google Identity Services ID-token flow (and MSAL for Microsoft). The app keeps a local account registry and namespaces data per account.
* Storage = Google Drive (`drive.file` scope, incremental authorisation, token held in memory only) and OneDrive (Graph app folder). Files stay in the user's storage; the app never copies them elsewhere.
* Account linking = explicit, only between verified-email identities while signed in (no silent merges by email).
* App-managed storage + subscriptions need a backend (users, Stripe webhooks, object storage). That is evaluated and costed in `docs/MONETIZATION.md` and deliberately **not** built yet.

Direct provider integrations were chosen over WorkOS; the comparison is in `docs/AUTH.md`.

## 3. Prioritised plan and acceptance criteria

| # | Work item | Acceptance criteria |
| --- | --- | --- |
| P0 | Reconcile sources; move the site into `public/`; add `package.json`, ESLint, Prettier, Vitest, Playwright; remove secrets and prototypes from the deployable directory; `.replit` points at `public/`. | `npm run lint`, `npm test`, `npm run test:e2e` pass locally. `keys.txt`, prototypes and docs are not in `public/`. Existing `campChecklist_*` data is preserved and still loads. |
| P0 | Fix the three live breakages (load-order race, stubbed functions, autocomplete). | Weight totals, toasts, filter and autocomplete work in the browser test; no `ReferenceError` on load. |
| P1 | Google sign-in via GIS ID token: sign-in, returning-user auto sign-in, sign-out, cancelled/blocked/expired handling, per-account data namespace, explicit account linking rules. | E2E: with a mocked GIS, sign-in shows the account, reload keeps the session, sign-out clears it, cancel shows a non-blocking message; unit tests for token validation + linking rules. Production: the real Google popup shows the account chooser (not an `origin_mismatch` error). |
| P1 | Google Drive storage: connect/disconnect, CampList folder (create or pick), save/load lists, upload/list trip files, export, revoked/expired handling, conflict protection, status line. | E2E with mocked Drive API: save creates the folder and file, second save updates, remote change → conflict prompt, 401 → "reconnect" state. No tokens in `localStorage`. |
| P1 | Microsoft sign-in (MSAL) + OneDrive app folder, behind config flags; docs for Entra setup. | Unit tests for the OneDrive client with mocked Graph; UI hidden until `microsoft.clientId` is configured. |
| P1 | Templates: schema, validator, index builder, template browser, create-from-template, required vs suggested, sources + review dates. | ≥ 20 researched templates validate; E2E creates a list from a template; each template shows sources and a review date. |
| P2 | Monetisation foundation: sponsor/ad slots with clear labels, AdSense + analytics behind config, affiliate disclosure, privacy policy update, tier economics doc. | Slots render house content when nothing is configured; no slot without a "Sponsored"/"Advertisement" label; max two placements; nothing loads third-party scripts until configured. |
| P2 | Modernisation: CSP, a11y (labels, focus, live regions, keyboard), mobile layout, input validation, dialogs instead of `prompt()`, DOMPurify vendored and pinned, error reporting hook. | Lighthouse-style checks in Playwright (axe not required); CSP has no violations in the console during E2E; import rejects malformed JSON safely. |
| P0 | Deploy: sync Replit workspace from the GitHub branch, publish, verify at camplist.guide, write handoff. | Live site serves the new build (title, `/templates/index.json` 200, `/keys.txt` 404). Browser check at camplist.guide shows no console errors and a Google account-chooser popup. |

## 4. Rollback

* Replit keeps previous deployments; re-publishing the previous commit (or "rollback" in the Deployments pane) restores the old site.
* The old site is also preserved in git history (`main` before this branch) plus the live-site snapshot captured during inspection (`docs/legacy/` is not kept in the repo; the Replit workspace retains its own history).
* User data lives in each visitor's browser (`localStorage`) and their own Drive; the new build reads the legacy keys unchanged, so rolling back loses nothing.
