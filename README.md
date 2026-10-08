# CampList (camplist.guide)

A free camping checklist planner. Organise gear in sections, track weight, cost and permits,
start from researched templates, and keep your lists in your browser or in storage you control
(Google Drive, OneDrive). No account is required; signing in is optional.

Static site: no build step, no server. Deployed on Replit as a static deployment.

## Features

- Multiple lists per device (and per signed-in account), undo/redo, drag-and-drop ordering
- 23 researched templates (camping styles, destinations, events) with sources and review dates
- Weight calculator (g/kg/oz/lb), cost summary, permit reminders, "optional" item tags
- Trip info with Google Places destination search (loaded on demand)
- Sign in with Google (Microsoft ready once configured); explicit, verified-email account linking
- Save/open lists and upload trip files in your own Google Drive (OneDrive ready once configured)
  with conflict protection and clear "saved / unsaved / reconnect" status
- Import/export JSON, print view, light/dark theme, mobile-friendly, keyboard accessible
- Picture guides at `/guide/` (how to use) and `/guide/templates.html` (how templates work, a
  catalogue, one page per template with a link that opens it in the app)
- Clearly labelled sponsor slots; no ads or analytics scripts unless configured

## Development

```bash
npm install
npm start           # http://localhost:8080
npm run lint
npm test            # unit tests (Vitest)
npm run test:e2e    # browser journeys (Playwright, mocked Google APIs)
npm run guides:shots # re-take the guide screenshots (after UI changes)
npm run guides:build # rebuild the guide pages + sitemap (after template or text changes)
npm run check       # everything
```

## Project layout

```
public/            deployable site (index.html, js/, css/, templates/, images/, vendor/)
public/js/config.js public configuration: client IDs, Maps key, feature flags
public/templates/  checklist templates + generated index.json
public/guide/      generated picture guides (+ guide.css, img/)
guides/            guide inputs: locales/<lang>.json text, step structure, shot metadata
scripts/           template validator/index builder, guide capture/builder, vendor copier
tests/unit         Vitest; tests/e2e Playwright
docs/              PLAN, AUTH, MONETIZATION, TEMPLATES, DEPLOYMENT, HANDOFF, research notes
```

## Configuration

Everything configurable is in `public/js/config.js` and is public by nature (OAuth client IDs,
a referrer-restricted Maps key, feature flags). See `docs/AUTH.md` for the Google Cloud and
Microsoft Entra setup, `docs/MONETIZATION.md` for sponsors/ads, `docs/TEMPLATES.md` for adding
templates, `docs/GUIDES.md` for the picture guides and `docs/DEPLOYMENT.md` for releasing.

## License

ISC
