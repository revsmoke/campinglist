# Deployment (Replit Autoscale)

Production is a Replit **Autoscale deployment** behind the custom domain `camplist.guide`
(Replit app "Camplist.Guide (1)"). It runs `node server/index.mjs` (`.replit → [deployment]`),
which serves the `public/` directory and the trip wizard's judge endpoint (`POST /api/judge`,
see `docs/WIZARD.md`). There is no build step, no database and no session store; the server is
a few hundred lines of Node with no dependencies.

Until 2026-10-08 the site was a static deployment of `public/`. The switch exists for one
reason: the wizard's judge calls TypeSafe with an API key, and a static site cannot keep a
secret. Replit makes App Secrets available to Autoscale deployments but not to static ones.

## Local development

```bash
npm install          # once
npm start            # serves public/ at http://localhost:8080 (plain static server)
npm run serve        # the production server: public/ plus /api/judge at http://localhost:3000
npm run lint         # ESLint
npm test             # Vitest unit tests (state, accounts, templates, sponsors, wizard, server)
npm run test:e2e     # Playwright journeys against server/index.mjs with mocked Google APIs
npm run guides:shots # re-take the guide screenshots after UI changes (docs/GUIDES.md)
npm run guides:build # rebuild public/guide/ and sitemap.xml after template or text changes
npm run check        # all of the above plus template validation and the guide build
```

Google sign-in from a local `npm start` (port 8080) needs both `http://localhost` and
`http://localhost:8080` listed as authorized JavaScript origins in Google Cloud. The Playwright
server (port 8787) mocks Google and needs nothing registered.

## Releasing

1. Merge to `main` on GitHub (the repository is the source of truth; the Replit workspace must
   not be edited by hand any more). Generated files are committed: after UI changes run
   `npm run guides:shots && npm run guides:build`, after template changes
   `npm run templates:index && npm run guides:build` (`npm test` fails when they are stale).
2. In the Replit workspace, pull the branch (`git pull origin main`), or ask Replit Agent to
   "sync the workspace to the latest commit of GitHub branch main".
3. Publish from the Replit **Publishing** pane (or the Replit MCP `publish_app` tool). The
   deployment type is Autoscale with the run command `node server/index.mjs`, both from
   `.replit`; the server listens on port 3000, mapped to external port 80. Replit's default
   machine size is enough: the server does file reads and one upstream call per judged answer.
4. Verify: `https://camplist.guide/api/health` returns `{"ok":true,"judge":true,…}` (`judge`
   is `false` when the `TYPESAFE_API_KEY` secret is missing from the deployment),
   `https://camplist.guide/templates/index.json` returns the new index,
   `https://camplist.guide/guide/` shows the picture guide, `https://camplist.guide/keys.txt`
   is 404, and the browser console is clean.

## What the server does

- Static files from `public/` only: a directory serves its `index.html` (and `301`s to the
  trailing slash), dotfiles and anything outside `public/` are 404, navigations to a missing
  page get a small HTML 404.
- Headers on every response: `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `X-Frame-Options: DENY`, `Permissions-Policy` (CSP stays a `<meta>` tag in each page; no
  COOP, which would break the Google popups). Weak ETags with `304`;
  `Cache-Control: no-cache` for pages, scripts and data (the URLs carry no cache busting),
  a day for pictures, `no-store` for `/auth/redirect.html` and the API; gzip for text when
  the client accepts it.
- `POST /api/judge`: accepts only the wizard's own requests (the questions are rebuilt
  server-side from `public/js/wizard/` and compared), rate-limits (30 calls a minute per
  visitor, 1,200 an hour per instance), then calls TypeSafe with the key. `GET /api/health`
  reports whether the key is set and the visitor address the limiter sees.
- Environment: `PORT` (3000), `TYPESAFE_API_KEY`, `TYPESAFE_MODEL` (`jev-latest`),
  `TRUSTED_PROXIES` (1: the `X-Forwarded-For` entries Replit's proxy appends),
  `SERVE_STATIC=0` and `ALLOW_ORIGIN` for an API-only host.

## Rollback

Replit keeps previous deployments: open **Deployments → History** and redeploy the previous
one, or check out the previous commit and publish again. Visitor data is unaffected: lists live
in each visitor's browser and in their own Drive/OneDrive, and the new build keeps writing the
legacy `campChecklist_*` keys, so even the pre-2026 build reads the guest list correctly.

To go back to a static deployment, set `deploymentTarget = "static"` and
`publicDir = "public"` under `[deployment]` in `.replit` and publish; the wizard then runs
without the judge (its health probe gets a 404 and it asks the person to pick instead).

## Secrets

One: `TYPESAFE_API_KEY`, an App Secret in the Replit workspace that the Autoscale deployment
receives (**Publishing → Adjust settings → Production app secrets**). `server/index.mjs` reads
it from the environment; it is never written to the repository, to `public/` or to
`config.js`. OAuth client IDs and the Maps browser key are public identifiers protected by
origin/referrer restrictions in Google Cloud (see `docs/AUTH.md`). `keys.txt` and
`client_secret*.json` are gitignored and must never be placed under `public/`.
