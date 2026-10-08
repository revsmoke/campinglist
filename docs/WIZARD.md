# Trip wizard (`/plan/`)

Seven questions, a review step and a create step. The answers decide which researched template
the list starts from and which add-on sections are merged in; the list is written with the same
state module as the app, into the signed-in account's namespace or the guest namespace, and
becomes the active list. One labelled placement sits under the wizard card (the page's only ad).

## Deterministic by design

| Piece | File | What it does |
| --- | --- | --- |
| Questions | `public/js/wizard/questions.js` | Steps, options (label, hint, icon), the keywords the local matcher uses for typed answers, the description the TypeSafe judge gets per option, and the places (destinations, events, styles) a typed destination can name |
| Add-ons | `public/wizard/modules.json` | 30 sections (kids, dog, fishing, bear country, cold, rain, hammock, vehicle sleeping, festival, …) with items; some remove template items they replace (a hammock removes tent items) |
| Rules | `public/js/wizard/rules.js` | Pure functions: `resolvePlace`, `whenFacts` (season and nights from dates or picks), `pickBaseTemplate`, `modulesFor`, `assembleSections`, `listName`, `tripNotes`, `buildPlan`, `rebuildWithout` |
| Judge | `public/js/wizard/judge.js` | Turns typed text into an option: keywords first, TypeSafe second, the person last |
| Page | `public/plan/index.html`, `public/js/wizard/wizard.js`, `public/plan/plan.css` | The interview UI; the draft survives a reload (sessionStorage) |
| Server | `server/index.mjs` | Serves `public/` and answers `/api/judge` by forwarding the wizard's own questions to TypeSafe with the key from the environment; what production runs |

The same answers always give the same list (`tests/unit/wizard.test.js` pins the paths):

1. **Base template.** A recognised destination or event wins (Yosemite, the JMT, Grand Canyon,
   Boundary Waters, Joshua Tree, the Smokies, the Appalachian Trail, Zion Narrows; Burning Man,
   Bonnaroo, Electric Forest, Glastonbury). Otherwise the trip type: backpacking (winter →
   winter template), paddling, bikepacking, overlanding, cabin. Otherwise a style the place
   implies (beach, desert, public land, snow), then winter, then hammock, then kids
   (family car camping), then the classic list.
2. **Add-ons.** Group (kids, dog, 6+, solo), shelter (hammock, vehicle, cabin, bivy), cooking and
   water (only when the template lacks them), extras the person picked or typed, the season
   (cold, bugs, heat), length (5+ nights), and festival gear for a festival on a non-event
   template. Each add-on is a chip on the review step and can be left out.
3. **Assembly.** Template sections, minus items an add-on replaces, plus each add-on's items
   merged into a same-named section or appended as a new one; duplicates are dropped.
4. **Trip info.** Destination (the recognised place or the typed text, trimmed), dates, and a
   note recording the answers and the template, so the choices stay visible in the list.

## Typed answers: keywords, then Jev, then the person

Typed text is matched against each option's keywords (whole words, longer phrases count more);
the shares become probabilities and the confidence is TypeSafe's own Choice formula
`(p_max − 1/n) / (1 − 1/n)`, so local and remote answers are gated alike
([docs.typesafe.ai/confidence](https://docs.typesafe.ai/confidence)):

| Confidence | Behaviour |
| --- | --- |
| ≥ 0.6 | accepted: "We read that as X. Not it?" plus two alternatives |
| 0.3 to 0.6 | suggested: "Sounds like X?" plus alternatives |
| < 0.3 | ask: "Which is closest?" with every option |
| any, choice "Not sure yet" | ask: the text did not say, so the person picks |

Only when the keywords stay below 0.6 (and the endpoint answered its health probe, see below)
does the wizard call the site's judge endpoint with one request: a `choice` question whose
`criteria` are the option descriptions, and for the extras step one `noul` per extra, all over
the same state `{ answer, context }` (TypeSafe's
[Choice](https://docs.typesafe.ai/primitives/choice) and
[Noul](https://docs.typesafe.ai/primitives/noul), sent together as the docs recommend). The
answer is gated with the same thresholds; a slow (4 s), failed, keyless or absent endpoint
simply means the person picks. Nothing is sent to TypeSafe unless the person types free text and the
keywords cannot place it; the request carries only that text and the earlier answers' option
ids, never the person's lists.

### The judge endpoint (TypeSafe's API key)

A key in the browser would be public, so the key lives in the server that also serves the
site: `server/index.mjs` (Node 20+, no dependencies) answers `POST /api/judge`. It accepts
only the wizard's own requests: a typed answer of up to 1,000 characters, a small context, and
questions identical to the ones `judge.js` builds (the server rebuilds them from the same
data and compares; anything else is a 400, so the endpoint is no general proxy for the key).
It rate-limits per visitor (30 calls a minute) and per instance (1,200 an hour), forwards to
`https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer $TYPESAFE_API_KEY` and
`model: jev-latest`, and returns `{ model, answers, usage }`. Without a key it answers 503.

`GET /api/health` reports whether the key is set. The wizard probes it once per page and asks
the person instead when the endpoint is absent or keyless, so a static copy of the site keeps
working. Nothing is sent to TypeSafe unless the person types free text the keywords cannot
place; the request carries only that text and the earlier answers' option ids, never lists.

```bash
TYPESAFE_API_KEY=… npm run serve                              # http://localhost:3000, judge on
JUDGE_URL=http://localhost:3000/api/judge npm run wizard:eval  # the sample answers through it
```

Production: the Replit Autoscale deployment runs this server with the `TYPESAFE_API_KEY`
App Secret (`docs/DEPLOYMENT.md`); `wizard.judgeUrl` in `public/js/config.js` is `/api/judge`.
An API-only host elsewhere is also possible (`SERVE_STATIC=0 ALLOW_ORIGIN=https://camplist.guide`,
`judgeUrl` pointing at it, and that host allowed in the pages' CSP `connect-src`).

## Adding a question, an option or an add-on

- An option: add it to the step's list in `questions.js` with keywords and a one-line
  `criteria` description that separates it from the others; add a rule in `rules.js` if it
  changes the template or the add-ons; add a test.
- An add-on: add a module to `modules.json` (unique `id`, section `title`, `why`, items; use
  `removeItems` only for gear it replaces); map it from a rule or an extra.
- A place: add it to `PLACES` with its aliases (lower case, as people type them) once a template
  for it exists.
- Thresholds: `THRESHOLDS` in `judge.js`; the TypeSafe docs suggest validating them on real
  answers (`JUDGE_URL=https://camplist.guide/api/judge npm run wizard:eval` runs the sample
  answers in `scripts/wizard-eval.mjs` through the deployed endpoint and prints how the
  keywords and Jev read each one; `TYPESAFE_API_KEY=…` asks TypeSafe directly).
