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
| Server | `server/index.mjs` | Optional: serves `public/` and proxies `/api/judge` to TypeSafe with the key from the environment |

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

Only when the keywords stay below 0.6 and `wizard.judgeUrl` is set in `public/js/config.js`
does the wizard call the site's judge endpoint with one request: a `choice` question whose
`criteria` are the option descriptions, and for the extras step one `noul` per extra, all over
the same state `{ answer, context }` (TypeSafe's
[Choice](https://docs.typesafe.ai/primitives/choice) and
[Noul](https://docs.typesafe.ai/primitives/noul), sent together as the docs recommend). The
answer is gated with the same thresholds; a slow (4 s), failed or unconfigured endpoint simply
means the person picks. Nothing is sent to TypeSafe unless the person types free text and the
keywords cannot place it; the request carries only that text and the earlier answers' option
ids, never the person's lists.

### The judge endpoint (TypeSafe's API key)

The site is a static deployment; a key in the browser would be public, so the key lives in a
server. `server/index.mjs` (Node 20+, no dependencies) serves `public/` and answers
`POST /api/judge`: it validates the request (small state, 1 to 24 questions of the three
TypeSafe types, option caps), rate-limits per IP (30 a minute), forwards to
`https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer $TYPESAFE_API_KEY` and
`model: jev-latest`, and returns `{ model, answers, usage }`. Without a key it answers 503 and
the wizard asks the person. `GET /api/health` reports whether the key is set.

```bash
TYPESAFE_API_KEY=… npm run serve          # http://localhost:3000, judge on
curl -s -X POST localhost:3000/api/judge -H 'content-type: application/json' \
  -d '{"state":{"answer":"truck with a rooftop tent"},"questions":{"t":{"type":"choice","instructions":"Trip type?","criteria":{"overlanding":null,"campground":null}}}}'
```

Two ways to run it in production:

- **One deployment.** Switch the Replit deployment from Static to Autoscale with the run command
  `node server/index.mjs`; the `TYPESAFE_API_KEY` secret is already in the Replit app. Set
  `wizard.judgeUrl: "/api/judge"` in `config.js`. Cost: Autoscale compute instead of free static
  hosting.
- **Static site plus a small API.** Keep the static deployment and run the server elsewhere with
  `SERVE_STATIC=0` and `ALLOW_ORIGIN=https://camplist.guide` (a second Replit app from this
  repository, a Cloudflare Worker port of the handler, or any Node host); set
  `wizard.judgeUrl` to that host's `/api/judge`. The site's CSP meta must then allow that
  host in `connect-src`.

Until one of these runs, the wizard is fully deterministic: every question has chips, and typed
answers the keywords cannot place end in "Which is closest?".

## Adding a question, an option or an add-on

- An option: add it to the step's list in `questions.js` with keywords and a one-line
  `criteria` description that separates it from the others; add a rule in `rules.js` if it
  changes the template or the add-ons; add a test.
- An add-on: add a module to `modules.json` (unique `id`, section `title`, `why`, items; use
  `removeItems` only for gear it replaces); map it from a rule or an extra.
- A place: add it to `PLACES` with its aliases (lower case, as people type them) once a template
  for it exists.
- Thresholds: `THRESHOLDS` in `judge.js`; the TypeSafe docs suggest validating them on real
  answers (`TYPESAFE_API_KEY=… npm run wizard:eval` runs the sample answers in
  `scripts/wizard-eval.mjs` through the live model and prints how each one was read).
