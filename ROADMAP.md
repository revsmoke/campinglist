# CampList Development Roadmap

Below is a developer‑ready roadmap that turns the brainstormed ideas into actionable tasks.

Each feature is broken into step‑by‑step subtasks you can tick off (✔︎) as you implement.
The order is roughly "quick‑wins → core upgrades → optional power‑ups," but you can parallelize many sections.

## Phase 0  Foundation Hardening

### Task

- [✔︎] Convert current project to `Git` repo → commit the v1 checklist (`tag v1.0`).
- [ ] Add `ESLint` & `Prettier` for consistent style.
- [ ] **Split code → modules** (`state.js`, `ui.js`, `drag.js`, `serviceWorker.js`) to keep new features clean. *(Increased Importance)*
- [ ] Unit‑test helpers (`findItem`, `save`/`load`) with `Vitest` or `Jest`.
- [ ] **Error Handling**: Implement robust error handling for `fetch` operations and `localStorage` access (e.g., quota exceeded).
- [ ] **Security Audit**: Review and enhance XSS protections (current `sanitize()` function, etc.) across the application.

## Phase 1  Core Features & Quick Wins

### 1‑A Drag & Drop (Partially Implemented)

- [✔︎] Implement item drag-and-drop reordering (within/between sections).
- [✔︎] Implement visual drop indicators (`item-over`, `.dragging` styles).
- [✔︎] Implement drag ghost effect.
- [ ] **Implement Section Drag-and-Drop**: Enable reordering of entire sections using the `sectionHandle`.
- [ ] Improve drag handle visibility/usability on touch devices (`@media (pointer:coarse)`).

### 1‑B Modal Dialog (Partially Implemented)

- [✔︎] Update any modal form to use the `<dialog>` element and corresponding api if it does not already

### 1‑B Trip Meta Information (Implemented - Review/Refine)

- [✔︎] Display Trip Info (Destination, Dates, Notes) in a dedicated card.
- [✔︎] Implement `<dialog>` for editing Trip Info.
- [✔︎] Persist meta info to separate `localStorage` key (`campChecklist_meta`).
- [ ] Add validation to date inputs (e.g., end date after start date).
- [ ] Improve styling/UX of the meta info display and dialog.
- [ ] Implement rich text formatting for trip notes (e.g., simple markdown support).
- [ ] Add Google Maps and Directions
- [ ] Use Google Maps Places to find useful Places near campsite such as grocery, hostpital, police, etc.

GOOGLE_MAPS_API_KEY = "AIzaSyACkiD1ScnxmAX0gjJnB39j-Gj6jmQx2G4";

### 1‑C Item Notes (Implemented - Review/Refine)

- [✔︎] Add "Notes" button (🗒︎) to each item's actions.
- [✔︎] Use `prompt()` to add/edit notes.
- [✔︎] Store note content in the item's data object (`item.note`).
- [✔︎] Display notes using `<details>` element below the item label.
- [✔︎] Indicate items with notes (e.g., styled button).
- [ ] Replace `prompt()` with a dedicated modal or inline editor for better UX.
- [ ] Add support for formatting in notes (e.g., bullet points, simple markdown).

### 1‑D Section Management (Partially Implemented)

- [✔︎] Implement section collapsing/expanding with chevron icon.
- [ ] Persist collapsed state in localStorage for a consistent UI experience across sessions.
- [ ] Add ability to create new sections (not just items).
- [ ] Add ability to edit section titles.
- [ ] Add ability to delete sections (with confirmation).

### 1‑E Undo / Redo

#### State layer

- Add a history stack (array of deep‑cloned states).
- Push clone after every mutating action.

#### Keyboard & UI hooks

- Listen for `Ctrl`/`⌘`‑`Z` → `undo()`.
- Optional redo on `Shift`‑`Ctrl`‑`Z`.
- Add tiny "↶ Undo" & "↷ Redo" buttons in controls bar (disabled when stack empty).

#### Persistence

- Persist only latest state to `localStorage`; don't store history to save space.

#### Tests

- Ensure 20+ undos don't leak memory.

### 1‑F Dark‑Mode Toggle

#### CSS

- Move all colors to `CSS` custom properties (already 90% there).
- Create `:root.dark { --bg:#1c1c1c; … }` variant.

#### JS

- Add "🌙 Dark" button → toggles `document.documentElement.classList`.
- Persist preference in `localStorage.theme`.
- Detect `prefers‑color‑scheme` on first load.

### 1‑G Fuzzy Search / Filter

- Insert `<input id="filter" placeholder="Search…">` above `checklistContainer`.
- On input event:
  - Lower‑case query.
  - Hide `<li.item>` whose text + note doesn't include substring.
  - Highlight matches with `<mark>` (optional).
- Add loading indicator for first render (already showing "Loading...").

## Phase 2  Trip‑Planning Intelligence

### 2‑A Dependency/Prompt System

#### Schema upgrade

- Add optional `requires: ["id", …]` to any item.

#### Prompt engine

- When user ticks item A, loop `requires`:
  - If required item not present/unchecked ⇒ show toast "Don't forget X".
  - Enable quick‑add button inside toast.
- Toast component = absolute `div` + auto‑fade `CSS` animation.

### 2‑B Weight & Volume Estimator

#### Schema

- Add `weight: number` (grams) & optional `packed: boolean`.

#### UI

- Add "⚖️ Weights" sidebar (`CSS` fixed panel) summarizing totals.
- Input dialog to set weight on any item (💬 icon).

#### Logic

- Recalculate on every tick or weight change.
- Display base‑weight, consumables, total in kg and lb.
- Provide "Export to `CSV`" button (uses `Blob` + `URL.createObjectURL`).

### 2‑C Weather‑Aware Prompts

(stretch if API key available)

- OPENWEATHERMAP_API_KEY = "92df3f0f4c1aa7fdbbe39a05410f8895";
- api.openweathermap.org

- Build settings dialog to enter zip code / lat‑lon + trip start date.
- Fetch 7‑day `JSON` forecast from `OpenWeatherMap API`.
- Map conditions to tags (rain, freeze, heat).
- Items get optional `tags:["rain"]`.
- If tag matched → show orange badge and optional toast.

## Phase 3 Field Use Enhancements

### 3‑A PWA / Offline Install

- Add `manifest.json` (name, icons, start_url).
- Generate `service‑worker` with `Workbox`:
  - Cache app shell (`HTML`, `CSS`, `JS`).
  - `localStorage` already offline; optionally mirror to `IndexedDB`.
- Test on `Chrome` → "Add to Home Screen".
- Set up `GitHub Pages` or `Netlify` to serve over `HTTPS` (`PWA` requirement).

### 3‑B Photo Notes

- In note prompt, add "📷 Add photo" button → hidden file input (`accept="image/*" capture`).
- Convert to `dataURL`; store in `item.noteImage`.
- In details panel, render `<img>` (`max‑width` 100%).
- For space, keep photos ≤ 900 px wide; optionally store in `IndexedDB` and reference key in `JSON`.

### 3‑C On‑Device Notifications

- Ask Notification permission on first load.
- In settings, add "Trip timeline" editor (simple `textarea` → parse `HH:MM` description).
- Use `setTimeout` (or `SW` alarms in `PWA`) to trigger notifications.

### 3‑D Responsive Design Improvements

- Implement specific optimizations for mobile devices:
  - Larger touch targets (at least 44x44 pixels).
  - Bottom-fixed action buttons for frequently used actions.
  - Consider swipe gestures for common actions (e.g., swipe to complete/delete).
- Add `@media` queries for different device sizes.
- Test thoroughly on various screen sizes and orientations.

## Phase 4 Cloud & Collaboration (Optional)

### 4‑A Opt‑in Sync (Supabase)

#### Auth with GitHub or Google (`Supabase` Auth)

#### On login

- Push local data to `profiles/{uid}/checklists/{listId}`.
- Set up realtime listener → merge incoming changes (`timestamp‑wins`).
- Provide "Sync now" spinner & conflict‑resolution `snackbar`.

### 4‑B Share / Import Links

- `encode = btoa(encodeURIComponent(JSON.stringify(data)))`.
- Share link `?import=<encode>`.
- On load with import, prompt "Load packlist?" → duplicates current list under Trips archive.

### 4‑C Multiple Checklist Support

- Add ability to create and manage multiple checklists (e.g., for different trip types).
- Implement a checklist selection UI.
- Allow duplicating/templating checklists for reuse.

## Phase 5 Post‑Trip Review

### 5‑A Usage & Rating Capture

- Provide "End Trip" button.
- For each item -> dialog with:
  - Checkbox "Used?" and 3‑star importance rating.
- Store results in `trips[]` array `{date,name,items:[{id, used, stars}]}`.

### 5‑B Archive & Compare

- Build Trips page (table).
- "Duplicate to new list" copies items + weights, excludes checked state.
- Comparison view: diff ratings vs. current list → suggest removals.

### 5‑C Markdown / PDF Export

- Re‑use current render function to produce `Markdown` string:
  - `- [x] Tent **2.3 kg** — _Essential_`
- Indent notes beneath.
- Copy to clipboard + generate downloadable `.md`.
- Optional: Use `jsPDF` to create `PDF` with same data.

## Performance & Scalability

- **Large Checklist Handling**: Implement virtual scrolling or pagination for very large checklists.
- **Local Storage Limits**: Monitor and handle localStorage size limits (usually ~5MB).
- **Offline Data Backup**: Provide export/import functionality to prevent data loss.
- **Rendering Optimization**: Reduce DOM updates by implementing incremental updates rather than full re-renders.

## Optional Polishing

- **Accessibility Audit**:
  - [ ] Review/add `ARIA` attributes for interactive elements (dialog, drag handles, buttons).
  - [ ] Ensure full keyboard navigation, especially for drag-and-drop alternatives.
  - [ ] Test with screen readers.
  - [ ] Implement high contrast mode for better visibility.
- **Bulk actions** (shift‑click range, context menu)
- **Keyboard shortcuts** (`N`=new item, `E`=edit, `⌫`=delete)
- **i18n JSON bundle** for labels ("Notes", "Add item…")
- **Cypress end‑to‑end tests** for drag, notes, offline‑load
- **TypeScript Migration**: Consider converting to TypeScript for better maintainability in larger versions.

## Implementation Etiquette

- Branch per feature → small `PRs` → `squash‑merge`.
- Comment code heavily – keep same explanatory style we started with.
- Guard against regressions: manual smoke‑test on desktop + mobile before merging.
- Tie new `localStorage` keys to a version value; on major changes, run migration script in `load()`.

You now have a feature‑complete roadmap from v1 to a sophisticated camping‑trip assistant.
Pick a milestone, create the branch, and start checking those boxes!
