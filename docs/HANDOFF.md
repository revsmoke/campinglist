# CampList handoff (2026-10-07)

Merged into `main` on 2026-10-07 via pull request
[revsmoke/campinglist#1](https://github.com/revsmoke/campinglist/pull/1) (merge commit `fb64d02`).
Live: https://camplist.guide (Replit static deployment of `public/`).

## 1. What changed and what is live

| Area | Before | Now |
| --- | --- | --- |
| Core list | Worked, but live `ui.js` had stubbed functions: weight totals, toasts and search broken | Rebuilt UI; multiple lists per device; accessible dialogs instead of `prompt()`/`confirm()`; keyboard-reachable controls; mobile checks |
| Google sign-in | Button permanently disabled (script load-order race); requested 6 scopes incl. `drive.appdata`, `drive.install` | Google Identity Services ID-token sign-in, loaded on demand; local accounts with 30-day sliding sessions; sign-out, cancelled/blocked/expired handling; explicit verified-email account linking |
| Storage | "Export to Drive" into the hidden app-data folder; no status, no conflict handling | Google Drive with `drive.file` only: visible `CampList` folder (or any folder via the Picker), per-list files, trip-file uploads, conflict protection, reauth/revoked states, autosave, status line. OneDrive built, hidden until configured |
| Microsoft | None | MSAL v5 sign-in + OneDrive app folder, vendored; enabled by setting `microsoft.clientId` |
| Templates | One default list | 23 researched templates with sources and review dates; browser dialog; create or append |
| Monetisation | None | Labelled sponsor/house slots (max 2), Google Analytics 4 on (GPC respected, cookieless in the EEA/UK/CH), AdSense behind flags, updated privacy/terms, economics doc |
| Security | `keys.txt` served publicly; prototype pages deployed; CDN DOMPurify without SRI; no CSP | Only `public/` is deployed; secrets gitignored and absent; DOMPurify/MSAL vendored and pinned; CSP meta + Replit response headers (nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy on every file; Replit ignored the path-specific COOP and no-store rules, see §3) |
| Maps | Autocomplete never initialised (`initMap` race) | Loaded lazily when Trip Info opens; manual entry fallback |
| Engineering | No package.json/tests in repo | ESLint, Prettier, Vitest (34 tests), Playwright (38 journeys), template validator, docs |

## 2. What was tested

* `npm run lint`, `npm run templates:validate` (23/23), `npm test` (34), `npm run test:e2e`
  (38: sign-in/out, session expiry, cancelled sign-in, library blocked, wrong audience,
  providers-disabled flags, same-email account linking and its refusal, Drive
  connect/connecting state/failed connect/save/autosave/mid-upload edits/conflict/open/upload/
  revoked/disconnect/declined consent, templates, core flows, legal pages, mobile viewport).
  Google Identity and Drive are mocked in these tests.
* Headless Chromium against a local server with the **real** Google libraries: the Google button
  renders, Places autocomplete mounts and the CSP causes no violations.
* Production verification: see section 3.

## 3. Production verification (2026-10-07, deployment `b094d18f`, re-verified after republishing commit `c5452e3`)

Checked from a headless Chromium session and curl against https://camplist.guide:

| Check | Result |
| --- | --- |
| New build live | Title "My CampList · CampList"; default list 11 sections / 85 items; `body.app-ready` reached; no page errors |
| Templates | `/templates/index.json` 200; 23 template cards render in the browser dialog |
| Trip info / Maps | Places autocomplete mounts with the new restricted key; Places API probes with a `camplist.guide` or `www.camplist.guide` referrer succeed, other or missing referrers are rejected |
| Sponsor slot | House card renders with its "From CampList" label |
| Security | `/keys.txt` 404, `/googledrive.html` 404, `/package.json` 404, `/docs/PLAN.md` 404 (only `public/` is served); CSP meta present; headers `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy` applied to every file |
| Legal pages | `/terms.html` and `/privacy.html` render their full text with the visible "Last updated: 7 October 2026" line (the blank terms page from the first deployment is fixed) |
| Google sign-in | With the recreated client (`662895092391-…`, build `9b93e13`): Google's button renders in the sign-in dialog with no origin or client errors, and clicking it opens Google's real sign-in page "Sign in to continue to CampList.Guide" with the privacy and terms links. Completing a sign-in needs a real Google account, so that last step was not exercised here. (An earlier build with the old client showed `Error 401: disabled_client`.) |
| Google Drive | Owner-confirmed on 2026-10-07 from a real browser on the current build: "Google Drive · Connected" with the account email, folder `CampList`, "Saved to Google Drive just now", autosave on, and "Disconnect Google Drive" in place of the Connect button. Earlier attempts had ended on the not-connected panel; it now explains that signing in does not connect Drive, shows "Connecting…" progress, and prints Google's response under the button when a connect fails |
| Hosts | `http://camplist.guide` → 301 to https; `https://www.camplist.guide` fails TLS (no www domain configured in Replit) |

Not applied by Replit: path-specific response-header rules (COOP for `/`, `no-store` for the
MSAL bridge page). Neither is required for the current features.

## 4. Limitations and disabled integrations

1. **Google sign-in and Drive are switched on** with the recreated client (the original client
   had been disabled by Google after six months without use); the owner completed a real
   sign-in, Drive connect and save. The flags `features.googleSignIn` / `features.googleDrive`
   in `public/js/config.js` remain the kill switch.
2. **Google Drive** connect and save are confirmed by the owner. "Open from Google Drive…",
   trip-file uploads, the folder picker and conflict handling have mocked end-to-end coverage;
   try them once in a real browser when convenient.
3. **Microsoft sign-in / OneDrive** are hidden until an Entra client ID exists (section 5).
   They have unit/mock coverage only; the first real sign-in should be tested with a personal
   Microsoft account and a work account (the `Files.ReadWrite.AppFolder` scope's behaviour for
   work accounts is documented inconsistently by Microsoft).
4. **Ads** stay off until an AdSense publisher ID is configured and `ads.txt` is added
   (analytics is on; see `docs/MONETIZATION.md`). Display ads are not recommended at current
   traffic (see `docs/MONETIZATION.md`).
5. **App-managed storage / subscriptions** are evaluated, not built (needs a backend).
6. The Replit workspace must now be treated as a deploy target only; edit on GitHub. It is
   synced from `main` (the rebuild PR, merged on 2026-10-07); the published build is `c5452e3`
   and the docs-only commits after it need no republish.
7. `www.camplist.guide` is not served (no certificate). Either add it as a second custom domain in
   Replit (plus DNS) or leave it; Google origins only need the hosts you actually serve.

## 5. What is needed from you

1. **Google:** done (client recreated, key restricted, real sign-in, Drive connect and save
   confirmed). Optional: try "Open from Google Drive…", "Trip files…" and "Change…" (the folder
   picker, which needs the Google Picker API enabled in project `662895092391`) once in a real
   browser.
2. **Microsoft Entra (optional, 10 minutes):** app registration per `docs/AUTH.md` §5; paste the
   client ID into `config.js → microsoft.clientId`.
3. **Replit:** the rebuild PR is merged into `main`; keep the workspace synced from `main`
   before publishing (`docs/DEPLOYMENT.md`). If Replit ever ignores `publicDir` from `.replit`,
   set "Public directory = public" in the Publishing pane once.
4. **Sponsors/ads (when ready):** edit `public/sponsors.json`; for AdSense set
   `ads.adsenseClient` + slot IDs and add `public/ads.txt`.

## 6. Operating costs and maintenance

* Hosting: Replit static deployment is free on the Core plan apart from outbound transfer
  ($0.05/GiB beyond the plan allowance); no compute, no database.
* Google: Maps JavaScript/Places (New) autocomplete calls are billed per session only when the
  Trip Info search is used (loaded lazily); Drive/Identity are free. Keep the key restricted.
* Microsoft Entra: free.
* Maintenance: `npm run vendor` after bumping DOMPurify/MSAL; re-review destination/event
  templates each season (`docs/TEMPLATES.md`); run `npm run check` before publishing.
* Replit Agent was used once to sync the workspace from GitHub (charged to your Replit
  credits). Future syncs can be a `git pull` in the workspace shell.

## 7. Rollback

* Replit → Deployments → History → redeploy the previous deployment (pre-2026-10-07 build), or
  check out `main` (commit `79d57dc`) in the workspace and publish.
* Visitor data: the new build keeps writing the legacy `campChecklist_*` keys for the guest
  list, so the previous build still reads it. Account-namespaced lists (`campList.v2.*`) are
  simply ignored by the old build and remain in the browser.

## 8. Research caveats carried into the templates

The researchers flagged facts they could not confirm from an official page; each is phrased
cautiously in the template text. Notable ones: BWCAW can/bottle ban (secondary sources only);
California campfire-permit shovel condition; Yosemite park-entry reservation status for 2026;
Bonnaroo and Electric Forest prohibited-item lists came from search extracts of the official
support pages (fetches were blocked); Zion advance-reservation window; JMT resupply vendor
terms; Glastonbury 2026 is a fallow year (2025 rules cited, 2027 dates confirmed). Re-verify
before relying on any date, fee or quota.
