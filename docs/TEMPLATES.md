# Checklist templates

Templates live in `public/templates/*.json` (one file per template) plus a generated
`public/templates/index.json`. The browser loads the index for the picker and a template file
only when it is previewed or used. Nothing else needs to change to add a template.

## Adding or updating a template

1. Copy an existing file, give it a new kebab-case `id` that matches the file name.
2. Fill the fields below. Keep rules that change over time (fees, quotas, dates, bans) phrased as
   "check current …" in `considerations` or item notes, and cite the official source.
3. Validate and rebuild the index:

   ```bash
   npm run templates:index && npm run templates:validate
   ```

4. Run `npm test` (the unit suite validates every template) and commit both the template and
   `index.json`.

## Schema (validated by `scripts/template-schema.mjs`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | kebab-case, equals file name |
| `name` | string ≤ 80 | display name |
| `category` | `general` \| `style` \| `destination` \| `event` | picker tab |
| `tagline` | string ≤ 200 | one sentence |
| `description` | string ≤ 1200 | scope, assumptions, what to adapt |
| `season`, `typicalDuration` | string | e.g. "May–Sept", "3–6 nights" |
| `considerations` | string[] (≤ 450 chars each) | weather, terrain, facilities, rules that change |
| `reviewedOn` | `YYYY-MM-DD` | when a human last checked the sources |
| `sources` | `{ title, publisher, url (https), accessed }[]` | shown in the picker |
| `tags` | string[] (optional) | search keywords |
| `sections[].title` | string ≤ 80 | unique within the template |
| `sections[].items[]` | `{ text ≤ 120, required: boolean, note? ≤ 200, permitRequired? }` | `required: false` renders an "optional" tag |

Limits: 1–14 sections, 5–160 items. Templates are copied into a user's list with fresh ids, so
editing a template never changes lists users already created.

## Current library (reviewed 2026-10-07)

23 templates: the classic all-round list, 10 camping styles (three-season backpacking, winter,
family car camping, canoe/kayak, bikepacking, overlanding, hammock, desert, beach/coastal,
dispersed BLM/USFS), 8 destinations (Yosemite wilderness, John Muir Trail, Grand Canyon
rim-to-river, Boundary Waters, Joshua Tree, Great Smoky Mountains backcountry, Appalachian
Trail section hike, Zion Narrows) and 4 events (Burning Man, Bonnaroo, Electric Forest,
Glastonbury).

Facts the researchers could not confirm from an official page are phrased cautiously inside
the templates; the research notes listing them are in the session handoff (`docs/HANDOFF.md`).
Re-review destination and event templates before each season: dates, permit systems and
prohibited-item lists change yearly.
