# CampList handoff (2026-10-08)

The rebuild was merged into `main` on 2026-10-07 via pull request
[revsmoke/campinglist#1](https://github.com/revsmoke/campinglist/pull/1) (merge commit `fb64d02`);
the follow-up pull requests (revsmoke/campinglist#2 through revsmoke/campinglist#14: Google
client switch, Drive connect state, analytics, AdSense, picture guides and their placements,
the trip wizard) were merged the same way, the latest being merge commit `400358c` on
2026-10-08.
Live: https://camplist.guide (Replit Autoscale deployment running `server/index.mjs`, which
serves `public/` and the trip wizard's judge endpoint; a static deployment until 2026-10-08).

## 1. What changed and what is live

| Area | Before | Now |
| --- | --- | --- |
| Core list | Worked, but live `ui.js` had stubbed functions: weight totals, toasts and search broken | Rebuilt UI; multiple lists per device; accessible dialogs instead of `prompt()`/`confirm()`; keyboard-reachable controls; mobile checks |
| Google sign-in | Button permanently disabled (script load-order race); requested 6 scopes incl. `drive.appdata`, `drive.install` | Google Identity Services ID-token sign-in, loaded on demand; local accounts with 30-day sliding sessions; sign-out, cancelled/blocked/expired handling; explicit verified-email account linking |
| Storage | "Export to Drive" into the hidden app-data folder; no status, no conflict handling | Google Drive with `drive.file` only: visible `CampList` folder (or any folder via the Picker), per-list files, trip-file uploads, conflict protection, reauth/revoked states, autosave, status line. OneDrive built, hidden until configured |
| Microsoft | None | MSAL v5 sign-in + OneDrive app folder, vendored; enabled by setting `microsoft.clientId` |
| Templates | One default list | 23 researched templates with sources and review dates; browser dialog; create or append |
| Monetisation | None | Labelled sponsor/house slots (max 2), Google Analytics 4 on (GPC respected, cookieless in the EEA/UK/CH), AdSense units in both placements with house-card fallbacks, updated privacy/terms, economics doc |
| Security | `keys.txt` served publicly; prototype pages deployed; CDN DOMPurify without SRI; no CSP | Only `public/` is deployed; secrets gitignored and absent; DOMPurify/MSAL vendored and pinned; CSP meta + response headers set by the server (nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy on every file, no-store on the MSAL bridge); the TypeSafe key lives only in a Replit secret behind an endpoint that forwards nothing but the wizard's own questions |
| Maps | Autocomplete never initialised (`initMap` race) | Loaded lazily when Trip Info opens; manual entry fallback |
| Guides | None | Picture-first guides generated from the real app: `/guide/` (21 numbered steps), `/guide/templates.html` (how templates work + catalogue) and one page per template with a "Use this template" deep link; text in one locale file, screenshots re-taken by script (`docs/GUIDES.md`); `sitemap.xml` + `robots.txt` |
| Trip wizard | None | `/plan/`: seven questions build a list from the templates with deterministic rules (base template, add-on sections, trip info); typed answers matched by keywords with TypeSafe-style confidence and, when the keywords cannot place them, judged by TypeSafe's Jev through `server/index.mjs` (the key stays in the Replit secret); one labelled placement (`docs/WIZARD.md`) |
| Engineering | No package.json/tests in repo | ESLint, Prettier, Vitest (78 tests), Playwright (55 journeys, run against the production server), template validator, guide capture/builder, a dependency-free Node server, docs |

## 2. What was tested

* `npm run lint`, `npm run templates:validate` (23/23), `npm test` (78), `npm run test:e2e`
  (55: sign-in/out, session expiry, cancelled sign-in, library blocked, wrong audience,
  providers-disabled flags, same-email account linking and its refusal, Drive
  connect/connecting state/failed connect/save/autosave/mid-upload edits/conflict/open/upload/
  revoked/disconnect/declined consent, templates, core flows, legal pages, mobile viewport,
  analytics tag with consent defaults, AdSense units with unfilled/blocked fallbacks and the
  no-slot pause guard, only configured sign-in providers offered, guide pages with their
  pictures, the template catalogue and a template page's deep link into the app, the two
  placements on guide pages with their house-card fallback, sitemap and robots, the trip
  wizard's chip path into a created list, its typed path, the draft surviving a reload, the
  judge endpoint, its fallback and its health probe; all served by `server/index.mjs`). The unit suite also checks that the generated guide pages match their inputs and exercises the server over HTTP (question allow-list, ETag/304, gzip, path traversal, health, rate limit).
  Google Identity and Drive are mocked in these tests.
* Headless Chromium against a local server with the **real** Google libraries: the Google button
  renders, Places autocomplete mounts and the CSP causes no violations.
* Production verification: see section 3.

## 3. Production verification (deployment `b094d18f`; 2026-10-07 on commit `c5452e3`, re-verified 2026-10-08 on commits `74019d8`, `c690d23`, `5d333d5` and `400358c`)

Checked from a headless Chromium session and curl against https://camplist.guide:

| Check | Result |
| --- | --- |
| New build live | Title "My CampList · CampList"; default list 11 sections / 85 items; `body.app-ready` reached; no page errors |
| Templates | `/templates/index.json` 200; 23 template cards render in the browser dialog |
| Trip info / Maps | Places autocomplete mounts with the new restricted key; Places API probes with a `camplist.guide` or `www.camplist.guide` referrer succeed, other or missing referrers are rejected |
| Sponsor slot | House card renders with its "From CampList" label |
| Analytics | `gtag.js` (`G-YBTYHE8TK0`) loads on the app and legal pages, consent defaults are denied for the EEA/UK/CH region list and the collect request is answered 204 |
| AdSense units (2026-10-08) | Both placements render an `<ins class="adsbygoogle">` with the configured slot id under an "Advertisement" label; `adsbygoogle.js` loads (200) and ad requests go out. While the site is "Getting ready" Google's ad server answers 400 and marks the units unfilled, and the house cards take their place within a few seconds; no CSP violations |
| Guides (2026-10-08, `c690d23`) | `/guide/` (21 steps), `/guide/templates.html` (5 steps, 23 cards) and `/guide/templates/bikepacking.html` return 200 with every picture loading and no console errors; a template page's "Use this template" button opens that template's preview in the live app and drops the parameter from the URL; the header shows the Guide link; `/robots.txt` and `/sitemap.xml` are served; the sign-in dialog no longer shows the unconfigured Microsoft button. Build `5d333d5`: each guide page carries the two placements (sidebar then footer slot) with the app's CSP and no console errors; while AdSense leaves the units unfilled they show the labelled house cards |
| Trip wizard (2026-10-08, `400358c`) | `/plan/` returns 200 with the app's CSP and exactly one labelled placement; a typed "half dome in july" is read as Yosemite and "taking the truck and sleeping in the rooftop tent" as Overlanding without any network call; the review step shows the Yosemite template; "Create my list" produces "Yosemite, Jul 2027", the app opens on it with trip info filled and the header carries "Plan a trip"; no console errors. The TypeSafe judge endpoint is not deployed (static site), so typed answers the keywords cannot place end in "Which is closest?" |
| Autoscale deployment + Jev (2026-10-08, `36c7844`) | The site is served by `server/index.mjs`: `/` 200 with nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy and a weak ETag (conditional GET 304); `app.js` gzip-compressed; `/plan` 301 → `/plan/`; `/auth/redirect.html` no-store; guide pictures cached a day; `/keys.txt`, `/package.json`, `/docs/PLAN.md`, `/server/index.mjs`, `/.replit`, `/.git/HEAD`, `/tests/…` all 404 (an HTML 404 page for navigations); sitemap, robots, ads.txt, guides, templates, legal pages and `/plan/` 200. `/api/health` → `{"ok":true,"judge":true}` (the `TYPESAFE_API_KEY` secret reaches the deployment); `POST /api/judge` with the wizard's trip-type question and "we'll be self-sufficient on the dirt roads for a few days" → Jev `jev-1.13.0` answers `overlanding` with confidence 1.0 in 625 ms (550 input / 90 output tokens); a foreign question is rejected 400, GET is 405. In the browser the same typed answer shows "We read that as Overlanding" after one health probe and one judge call; the chip path still creates "Yosemite, Jul 2027" (12/12 checks). `wizard:eval` through the endpoint: Jev agrees with the keywords on all 18 placed samples and resolves the two the keywords cannot ("self-sufficient on the dirt roads" → overlanding 1.00; "the usual" → not sure 0.94); extras: fishing 0.98, climbing 0.74, remote 0.96, stargazing 0.97, first-timer 0.97 (bear stays with the keywords). Found and fixed next: the limiter keyed visitors on the proxy's address (four proxy hops append to X-Forwarded-For, not one) and a confident "Not sure yet" verdict read as "We read that as Not sure yet" instead of asking. Re-verified on `1e04299`: `/api/health` reports the caller's own address (four proxy hops; a client-supplied `X-Forwarded-For` is ignored), "the usual" now asks "Which is closest?", the fuzzy answer is read through Jev in about 400 ms, and 41 of 41 live checks pass |
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
4. **Ads:** the AdSense account (`ca-pub-4491650261060374`) is connected (`ads.txt`
   authorised, account meta tag on every page, script on the app page) and the two display
   units are configured (Sidebar `2930956606`, Footer `7181192800`), labelled "Advertisement";
   the same two placements sit on every guide page (between content sections and above the
   footer).
   Until AdSense approves the site ("Getting ready" on 2026-10-08) the units come back
   unfilled and the placements show the house cards instead; the same fallback covers content
   blockers. Auto ads is off and the GDPR/US consent messages are published. Display ads are
   not recommended at current traffic (see `docs/MONETIZATION.md`).
5. **App-managed storage / subscriptions** are evaluated, not built (needs a backend).
   **Trip wizard judge:** the deployment is now Autoscale running `server/index.mjs` with the
   `TYPESAFE_API_KEY` secret, so typed answers the keywords cannot place go to TypeSafe's Jev
   through `/api/judge` (`docs/WIZARD.md`); the wizard probes `/api/health` once per page and
   asks the person instead whenever the endpoint is absent or keyless. Verified live on
   `36c7844` (§3): Jev answers through the endpoint and the page reads a fuzzy answer with it.
   **Guides** exist in English only; the inputs are built for localization (one strings file per
   language, pictures re-taken per language once the app itself is translated), see
   `docs/GUIDES.md`. Template names and items stay English until the library is translated.
6. The Replit workspace must now be treated as a deploy target only; edit on GitHub. It is
   synced from `main` after each merged pull request; the published build is `1e04299`
   (2026-10-08) and docs-only commits after it need no resync or republish.
7. `www.camplist.guide` is not served (no certificate). Either add it as a second custom domain in
   Replit (plus DNS) or leave it; Google origins only need the hosts you actually serve.

## 5. What is needed from you

1. **Google:** done (client recreated, key restricted, real sign-in, Drive connect and save
   confirmed). Optional: try "Open from Google Drive…", "Trip files…" and "Change…" (the folder
   picker, which needs the Google Picker API enabled in project `662895092391`) once in a real
   browser.
2. **Microsoft Entra (optional, 10 minutes):** app registration per `docs/AUTH.md` §5; paste the
   client ID into `config.js → microsoft.clientId`.
3. **Replit:** keep the workspace synced from `main` before publishing (`docs/DEPLOYMENT.md`).
   The deployment is Autoscale with the run command `node server/index.mjs` (from `.replit`);
   `https://camplist.guide/api/health` says `"judge": true` while the `TYPESAFE_API_KEY`
   secret reaches it (Publishing → Adjust settings → Production app secrets).
4. **AdSense (console):** wait for the site review to finish ("Getting ready" → "Ready");
   the guide pages (`/guide/`, 23 template pages) are the crawlable content reviewers look for.
   Keep Auto ads off. Sponsors: edit `public/sponsors.json`.
5. **Trip wizard:** decided: the judge runs inside the Autoscale deployment with the key in
   the Replit secret. `JUDGE_URL=https://camplist.guide/api/judge npm run wizard:eval` prints
   how the keywords and Jev read the sample answers (no key needed) to check the thresholds.
6. **Guides:** nothing to set up. After UI changes run `npm run guides:shots` then
   `npm run guides:build`; after template changes `npm run guides:build`; to add a language
   follow `docs/GUIDES.md`.

## 6. Operating costs and maintenance

* Hosting: Replit Autoscale deployment, billed for requests and compute time only while it
  serves (it scales to zero when idle) plus outbound transfer; check the Replit usage page
  after the first weeks. TypeSafe: per-call usage only when a typed answer needs Jev; the
  server caps that at 1,200 calls an hour. No database.
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
