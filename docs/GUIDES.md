# Visual guides (`public/guide/`)

Two picture-first guides live on the site, plus one page per template:

| Page | What it is |
| --- | --- |
| `/guide/` | "How to use CampList": 21 numbered steps, each a screenshot of the real app with numbered boxes and a short legend |
| `/guide/templates.html` | How templates work (5 steps) and a catalogue of every template |
| `/guide/templates/<id>.html` | One page per template: facts, "check before you go", every section and item, sources, and a **Use this template** button that opens the template's preview in the app (`/?template=<id>`) |

The guides are generated. Do not edit the HTML under `public/guide/` by hand (it is
Prettier-ignored and a unit test fails when it is stale); change the inputs and rebuild.

Each page carries the same two labelled placements as the app page (`js/sponsors.js` via
`js/guide.js`: AdSense units from `ads.slots` in `config.js`, with the sponsor/house cards from
`public/sponsors.json` as the fallback), one between content sections and one above the
footer, and the app shell's Content-Security-Policy copied in at build time.

## Inputs and outputs

```
guides/locales/en.json        every piece of text (titles, callout labels, hints, facts, nav)
guides/site-guide.json        the steps of the "How to use" guide: picture + callouts, in order
guides/templates-guide.json   the steps of the Templates guide + the pictogram per category
guides/shots/<lang>.json      picture sizes and callout boxes (% of the picture), generated
public/guide/img/<lang>/      the pictures (WebP, 2x), generated
public/templates/*.json       the template library (one page per file)
public/guide/guide.css        hand-written styles (tokens come from css/camplist.css)
scripts/capture-guide-shots.mjs   takes the pictures and measures the callouts
scripts/build-guides.mjs          writes the pages and public/sitemap.xml
```

```bash
npm run guides:shots    # re-take the pictures (Playwright; ~2 minutes)
npm run guides:build    # rebuild the pages + sitemap from the inputs
```

`guides:shots` starts a local server on port 8080, drives the app with the mocked Google
libraries from `tests/e2e/mocks`, and writes `public/guide/img/en/*.webp` plus
`guides/shots/en.json`. Two dialogs need Google's real libraries (the sign-in button and the
Places destination search); they are taken online from the local server (`localhost:8080` is an
authorised origin) and fall back to the mocked versions offline. Behind a proxy that blocks
loopback traffic, pass `--real-base https://camplist.guide` to take those two from the live site.

Pictures are deterministic: fixed sample data, the trip dates are the next 10 April at least two
months away (so a permit deadline is never "past due"), focus rings are blurred, and the
viewport is enlarged automatically when a section or dialog is taller than the screen.

## When to rebuild

- **UI change** that moves or renames something the guides point at: `npm run guides:shots`
  then `npm run guides:build`, look at `/guide/` locally, commit the pictures and JSON too.
- **Template added or edited**: `npm run templates:index` then `npm run guides:build` (the
  template pages and the catalogue come from the JSON; no pictures involved).
- **Text change**: edit `guides/locales/en.json`, then `npm run guides:build`.
- Adding a step: add the picture to `scripts/capture-guide-shots.mjs` (a `shoot(...)` call
  with the elements to box as `anchors`), list it in `guides/site-guide.json` with the anchor
  keys in callout order, add its strings under `guide.steps.<id>`, re-take and rebuild.

`npm test` checks that every step has its picture and anchors, that the default locale has
every string, and that the generated pages on disk match the inputs.

## Writing rules (keep them universal)

- Pictures first; numbers on the picture match the legend under it. Avoid words a picture can
  carry: labels are one to three words, hints one short sentence, no idioms, no "left/right".
- No text is baked into the pictures other than the app's own UI, so a localized app only needs
  re-taking the pictures.
- Dates are ISO (`2026-10-07`), counts are digits, and facts are shown as label + value tiles
  rather than sentences, so no plural or word-order rules are needed.
- Pictograms are simple stroke icons defined once in `scripts/build-guides.mjs` (`ICONS`).

## Adding a language

1. Copy `guides/locales/en.json` to `guides/locales/<lang>.json`, set `lang` (and `dir` for
   right-to-left scripts) and translate the values. Keys stay as they are; a missing key falls
   back to English and is reported by the build.
2. Once the app itself is localized, take its pictures: `npm run guides:shots -- --lang <lang>`
   (writes `public/guide/img/<lang>/` and `guides/shots/<lang>.json`). Until then the English
   pictures are reused automatically.
3. `npm run guides:build` writes `public/guide/<lang>/…` (same structure, relative links), adds
   `hreflang` alternates to every page and the new URLs to `public/sitemap.xml`.
4. Template names, items and sources are data from `public/templates/*.json` and stay in English
   until the library itself is translated.
