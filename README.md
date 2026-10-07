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
- Clearly labelled sponsor slots; no ads or analytics scripts unless configured

## Development

```bash
npm install
npm start           # http://localhost:8080
npm run lint
npm test            # unit tests (Vitest)
npm run test:e2e    # browser journeys (Playwright, mocked Google APIs)
npm run check       # everything
```

## Project layout

```
public/            deployable site (index.html, js/, css/, templates/, images/, vendor/)
public/js/config.js public configuration: client IDs, Maps key, feature flags
public/templates/  checklist templates + generated index.json
scripts/           template validator/index builder, vendor copier
tests/unit         Vitest; tests/e2e Playwright
docs/              PLAN, AUTH, MONETIZATION, TEMPLATES, DEPLOYMENT, HANDOFF, research notes
```

## Configuration

Everything configurable is in `public/js/config.js` and is public by nature (OAuth client IDs,
a referrer-restricted Maps key, feature flags). See `docs/AUTH.md` for the Google Cloud and
Microsoft Entra setup, `docs/MONETIZATION.md` for sponsors/ads, `docs/TEMPLATES.md` for adding
templates and `docs/DEPLOYMENT.md` for releasing.

## License

ISC
