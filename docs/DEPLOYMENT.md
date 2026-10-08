# Deployment (Replit static deployment)

Production is a Replit **Static Deployment** of the `public/` directory behind the custom domain
`camplist.guide` (Replit app "Camplist.Guide (1)"). There is no build step and no server.

## Local development

```bash
npm install          # once
npm start            # serves public/ at http://localhost:8080
npm run lint         # ESLint
npm test             # Vitest unit tests (state, accounts, templates, sponsors)
npm run test:e2e     # Playwright journeys with mocked Google APIs
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
   `.replit` file already sets `publicDir = "public"`, `deploymentTarget = "static"` and the
   response headers (CSP is a `<meta>` tag in `index.html`; `.replit` adds nosniff, referrer
   policy, X-Frame-Options and Permissions-Policy for every file). Replit applied only
   `path = "/*"` rules when this was verified; path-specific rules were ignored.
4. Verify: `https://camplist.guide/templates/index.json` returns the new index,
   `https://camplist.guide/guide/` shows the picture guide, `https://camplist.guide/keys.txt`
   is 404, and the browser console is clean.

## Rollback

Replit keeps previous deployments: open **Deployments → History** and redeploy the previous
one, or check out the previous commit and publish again. Visitor data is unaffected: lists live
in each visitor's browser and in their own Drive/OneDrive, and the new build keeps writing the
legacy `campChecklist_*` keys, so even the pre-2026 build reads the guest list correctly.

## Secrets

There are none. OAuth client IDs and the Maps browser key are public identifiers that are
protected by origin/referrer restrictions in Google Cloud (see `docs/AUTH.md`). `keys.txt`
and `client_secret*.json` are gitignored and must never be placed under `public/`.
