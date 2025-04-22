# CampList Development Roadmap

This document presents a comprehensive roadmap for the CampList project. The structure prioritizes foundational improvements, core features, and quick wins before moving onto more advanced capabilities. Many sections can be parallelized during implementation. The order is roughly "quick‑wins → core upgrades → optional power‑ups."

Each feature is broken into step‑by‑step subtasks you can tick off (✔︎) as you implement.

## Phase 0  Foundation Hardening

### Task

- [✔︎] Convert current project to **Git** repository; commit the v1 checklist (`tag v1.0`).
- [ ] Add **ESLint** & **Prettier** for consistent code style enforcement.
- [ ] **Split code into modules** (`state.js`, `ui.js`, `drag.js`, `serviceWorker.js`) to improve organization and maintainability, keeping new features clean. *(Increased Importance)*
- [ ] Write **Unit Tests** for core helper functions (`findItem`, `save`/`load`) using **Vitest** or **Jest**.
- [ ] Implement robust **Error Handling** for fetch/Workspace operations and `localStorage` access (e.g., handling quota exceeded errors).
- [ ] Conduct a **Security Audit** to review and strengthen XSS protections across the application, including the current `sanitize()` function.
- [ ] Set up **Continuous Integration (CI)** using GitHub Actions to run linting, unit tests, and a **Lighthouse CI** performance budget check on every push.
- [ ] Implement **Automated Dependency Updates** using Dependabot or Renovate.
- [ ] Adopt **Conventional Commits** and **semantic-release** for automated CHANGELOG generation and semantic version tagging.

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

### 1‑E  Undo / Redo

- **State layer**: history stack of deep clones; push after each mutation.
- **Keyboard/UI**: `Ctrl/⌘+Z` undo; `Shift+Ctrl/⌘+Z` redo; ↶ ↷ toolbar buttons.
- **Persistence**: store only latest snapshot in `localStorage`.
- **Tests**: ensure ≥20 undos without leaks.

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

## Phase 1: Core Features & Quick Wins

### 1-A: Drag & Drop *(Partially Implemented)*

- [✔︎] Implement item drag-and-drop reordering (within and between sections).
- [✔︎] Implement visual drop indicators (`item-over`, `.dragging` styles/CSS classes).
- [✔︎] Implement drag ghost preview effect.
- [ ] **Implement Section Drag-and-Drop**: Enable reordering of entire sections using a `sectionHandle`.
- [ ] Improve drag handle visibility/usability on touch devices (`@media (pointer:coarse)`).

### 1-B: Modal Dialogs *(Implemented)*

- [✔︎] Ensure all modal UI elements use the native `<dialog>` API and its corresponding API if not already.

### 1-C: Trip Meta Information *(Implemented — Review/Refine)*

- [✔︎] Display Trip Information (Destination, Dates, Notes) in a dedicated card or panel.
- [✔︎] Implement editing of Trip Info via a `<dialog>` with native date pickers.
- [✔︎] Persist meta information to a separate `localStorage` key (`campChecklist_meta`).
- [ ] Add validation to date inputs (e.g., ensure **end date is greater than or equal to start date**).
- [ ] Improve styling and user experience (UX) of the meta information display and editing dialog.
- [ ] Implement rich-text or simple markdown support for the *Trip Notes* field (bold, lists, links).
- [ ] **Google Maps & Directions Integration**:
  - [ ] Display a static map image for campsite coordinates (using Maps Static API).
  - [ ] Provide a link for turn-by-turn navigation in a maps app.
- [ ] **Nearby Places Lookup**: Integrate with the Google Places API to find nearby points of interest (grocery stores, hospitals, police, ranger stations, etc.).

```env
# Google Maps API Key
Maps_API_KEY="YOUR_Maps_KEY_HERE"
```

### 1-D: Item Notes *(Implemented — Review/Refine)*

- [✔︎] Add a 🗒︎ button to each item's actions; store note content in an `item.note` field.
- [✔︎] Display notes using `<details>` element below the item label.
- [✔︎] Indicate items with notes (e.g., styled button).
- [ ] Replace the current `prompt()` for adding/editing notes with a dedicated modal dialog or inline editor for better UX that supports markdown preview, bullet points, and potentially sub-tasks.
- [ ] Add support for formatting in notes (e.g., bullet points, simple markdown).

### 1-E: Section Management *(Partially Implemented)*

- [✔︎] Implement section collapsing and expanding functionality with a chevron icon.
- [ ] Persist the collapsed state of sections in `localStorage` for a consistent UI experience across sessions.
- [ ] Add the ability to create **new sections** (not just items).
- [ ] Add the ability to rename section titles.
- [ ] Implement the ability to delete sections (with a confirmation step).

### 1-F: Undo / Redo *(New)*

- **State Layer**: Implement a history stack (array of deep‑cloned states) of deep clones of the checklist state, pushing a new state onto the stack after each significant mutation.
- **Keyboard/UI Hooks**: Add support for `Ctrl`/`⌘`‑`Z` for undo and optional `Shift`‑`Ctrl`/`⌘`‑`Z` for redo. Add tiny "↶ Undo" & "↷ Redo" toolbar buttons in the controls bar (disabled when stack empty).
- **Persistence**: Store only the latest snapshot of the state in `localStorage`; don't store history to save space.
- **Tests**: Write tests to ensure the undo/redo functionality works correctly and that there are no memory leaks, supporting at least ≥20 undo operations without leaks.

### 1-G: Dark Mode Toggle *(New)*

- Utilize existing CSS custom properties; move all colors to `CSS` custom properties and define a `:root.dark { --bg:#1c1c1c; … }` color palette variant.
- Add a UI toggler (e.g., a 🌙 button) → toggles `document.documentElement.classList` to switch between light and dark modes.
- Persist the user's preference in `localStorage.theme` and respect the `prefers-color-scheme` media query on first load.

### 1-H: Fuzzy Search / Filter *(New)*

- Add an input field (e.g., `<input id="filter" placeholder="Search…">`) above the checklist container.
- On input event: Implement live filtering to Lower‑case query and Hide `<li.item>` whose text + note doesn't include substring.
- Optionally, highlight matching text within items using the `<mark>` tag.
- Add loading indicator for first render (already showing "Loading...").

### 1-I: Local Data Encryption *(Optional)*

- Implement client-side encryption of the `localStorage` payload using AES with a user-provided passphrase. Store the salt and initialization vector (IV) separately but unencrypted.


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

## Phase 2: Trip-Planning Intelligence

### 2-A: Dependency / Prompt System

- **Schema upgrade**: Add an optional `requires: ["item_id", …]` array field to the item schema to define dependencies.
- **Prompt engine**: When a user ticks item A (a "parent" item), loop its `requires`: If a required item is not present or unchecked ⇒ display a toast notification "Don't forget X" reminding them about dependent items.
- Enable quick‑add button inside toast.
- Toast component = absolute `div` + auto‑fade `CSS` animation.

### 2-B: Weight & Volume Estimator

- **Schema**: Add `weight: number` (grams) & optional `packed: boolean` fields.
- **UI**: Add "⚖️ Weights" sidebar (`CSS` fixed panel) summarizing totals. Add input dialog to set weight on any item (💬 icon).
- **Logic**: Recalculate totals on every tick or weight change. Display base‑weight, consumables, and total in kg and lb.
- Provide "Export to `CSV`" button (uses `Blob` + `URL.createObjectURL`).

### 2-C: Cost Tracker *(New)*

- Add an optional `cost` field to items.
- Display a running total of costs in the sidebar.
- Optionally, add a budget field to the Trip Meta information and display the remaining budget.

### 2-D: Permits & Regulations Helper *(New)*

- Add extra metadata fields to items or the trip (e.g., `permitUrl`, `fireRules`).
- Implement a mechanism to surface warnings or reminders based on this metadata.

### 2-E: Weather-Aware Prompts *(Stretch if API key available)*

- Build settings dialog to enter zip code / lat‑lon + trip start date for the trip location (auto-detect or user input).
- Fetch the 7‑day `JSON` forecast from an API like `api.openweathermap.org` (OpenWeatherMap API / One Call API).
- Map conditions to tags (rain, freeze, heat).
- Items get optional `tags:["rain"]`.
- If tag matched → show orange badge and optional toast notification.

```env
# OpenWeatherMap API Key (for Weather-Aware Prompts)
OPENWEATHERMAP_API_KEY="YOUR_OPENWEATHER_KEY"
```


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
  - `[x] Tent **2.3 kg** — _Essential_`
- Indent notes beneath.
- Copy to clipboard + generate downloadable `.md`.
- Optional: Use `jsPDF` to create `PDF` with same data.

## Performance & Scalability

- **Large Checklist Handling**: Implement virtual scrolling or pagination for very large checklists to improve rendering performance.
- **Local Storage Limits**: Monitor and handle `localStorage` size limits (usually ~5MB). Implement a quota monitor to alert users.
- **Offline Data Backup**: Provide manual export/import functionality to prevent data loss.
- **Rendering Optimization**: Reduce DOM updates by implementing incremental DOM diffing and updates rather than full re-renders.
- **Background Processing**: Offload heavy computational operations to Web Workers to avoid blocking the main thread.

## Optional Polishing

- **Accessibility Audit**:
  - [ ] Review/add `ARIA` attributes for interactive elements (dialog, drag handles, buttons).
  - [ ] Ensure full keyboard navigation, especially for drag-and-drop alternatives/fallback.
  - [ ] Test with screen readers.
  - [ ] Implement high contrast mode for better visibility.
- Implement **Bulk actions**: bulk multi-select (shift‑click range) and actions.
- Add a **context menu** for items and sections.
- Implement **Keyboard shortcuts** for common actions (e.g., `N`=new item, `E`=edit, `⌫`=delete).
- Externalize all user-facing strings into an **i18n JSON bundle** for labels ("Notes", "Add item…") and future internationalization.
- Write **Cypress end‑to‑end (e2e) tests** for core flows like drag, notes, and offline‑load.
- **TypeScript Migration**: Consider converting the codebase to TypeScript for better maintainability and type safety in larger versions.
- Develop a comprehensive **theming system** using a `data-theme` attribute and CSS variables, allowing for user-defined palettes.
- Create a specific **sustainability or "low-power" theme**.
- Implement a guided **onboarding tour overlay** for new users.

## Implementation Etiquette

- Create a dedicated Git branch per feature or task.
- Submit small, focused Pull Requests (PRs).
- Use squash-merging when merging PRs to keep the commit history clean.
- Ensure the CI pipeline passes (linting, tests, Lighthouse budget) before merging any PR.
- Comment code generously and maintain an explanatory style in code and PR descriptions.
- Guard against regressions: Always perform manual smoke‑test on desktop + mobile before before considering a feature complete.
- Include a schema version key in `localStorage` and write migration scripts in the `load()` function to handle breaking schema updates gracefully.

You now have a feature‑complete roadmap from v1 to a sophisticated camping‑trip assistant.
Pick a milestone, create the branch, and start checking those boxes!

ROADMAP UPDATE




---

## Phase 3: Field-Use Enhancements

### 3-A: PWA / Offline Install

- Add `manifest.json` (name, icons, start_url).
- Generate `service‑worker` with `Workbox` to cache app shell (`HTML`, `CSS`, `JS`) and enable offline functionality.
- `localStorage` already offline; optionally mirror to `IndexedDB`.
- Test on `Chrome` → "Add to Home Screen".
- Set up `GitHub Pages` or `Netlify` to serve over `HTTPS` (`PWA` requirement).

### 3-B: Photo Notes

- In note prompt, add "📷 Add photo" button → hidden file input (`accept="image/*" capture`). Integrate camera capture functionality.
- Convert to `dataURL`; store in `item.noteImage`. Allow users to capture and compress photos.
- In details panel, render `<img>` (`max‑width` 100%).
- For space, keep photos ≤ 900 px wide; optionally store photo data in `IndexedDB` and reference key in `JSON`.

### 3-C: On-Device Notifications

- Ask Notification permission on first load.
- In settings, add "Trip timeline" editor (simple `textarea` → parse `HH:MM` description).
- Use `setTimeout` (or `SW` alarms in `PWA`) to trigger notifications for timed events.

### 3-D: Battery-Aware Mode *(New)*

- Utilize the Battery Status API to detect the device's battery level.
- Automatically enable a "low-power" mode when the battery is below a certain threshold (e.g., 15%), which could include dimming images or disabling non-essential background tasks like polling.

### 3-E: Share via QR Code *(New)*

- Encode the checklist data and meta information into a base64 string.
- Generate a QR code from the base64 string to facilitate offline sharing or importing of checklists.

### 3-F: Responsive Polish

- Implement specific optimizations for mobile devices:
  - Increase the size of touch targets for better usability on mobile devices (at least 44x44 pixels).
  - Implement a bottom-fixed action bar for commonly used actions.
  - Explore implementing swipe gestures for common actions (e.g., marking an item as packed or deleting).
- Add `@media` queries for different device sizes.
- Test thoroughly on various screen sizes and orientations.

---

## Phase 4: Cloud & Collaboration *(Opt-in)*

### 4-A: Sync via Supabase

- Integrate with a backend service like Supabase for optional cloud synchronization.
- **Auth**: Implement authentication with GitHub or Google (`Supabase` Auth).
- **On login**: Push local data to `profiles/{uid}/checklists/{listId}`. Set up realtime listener → merge incoming changes (potentially using a `timestamp‑wins` conflict resolution strategy). Provide "Sync now" spinner & conflict‑resolution `snackbar`.
- Implement role-based Access Control Lists (ACL) to manage view vs. edit permissions for shared lists.

### 4-B: Share / Import Links

- Implement functionality to generate shareable links by encoding the checklist data and meta information into a base64 string in the URL hash (e.g., `encode = btoa(encodeURIComponent(JSON.stringify(data)))`). Share link `?import=<encode>`.
- On load with import, prompt "Load packlist?" → duplicates current list under Trips archive, checking for duplicates.

### 4-C: Multiple Checklists

- Add ability to create and manage multiple checklists (e.g., for different trip types). Develop a checklist manager UI.
- Implement a checklist selection UI.
- Allow duplicating/templating checklists for reuse. Implement import/export functionality for individual checklists.

## Phase 5: Post-Trip Review

### 5-A: Usage & Rating Capture

- Provide "End Trip" button. Implement an "End Trip" wizard.
- For each item -> dialog with: Checkbox "Used?" and 3‑star importance rating. Allow users to mark items as "used" or "not used".
- Store results in `trips[]` array `{date,name,items:[{id, used, stars}]}`.

### 5-B: Archive & Compare

- Build Trips page (table). Create a dedicated "Trips" page to view archived trips.
- "Duplicate to new list" copies items + weights, excludes checked state.
- Comparison view: diff ratings vs. current list → suggest removals for items that were consistently marked as unused. Implement a diffing tool.

### 5-C: Markdown / PDF Export

- Re‑use current render function to produce `Markdown` string: `[x] Tent **2.3 kg** — _Essential_`.
- Indent notes beneath.
- Copy to clipboard + generate downloadable `.md`.
- Optional: Use `jsPDF` to create `PDF` with same data. Integrate a library like jsPDF.

### 5-D: Auto-Suggest Future Lists *(New)*

- Analyze usage data from past trips.
- If an item is marked as "didn't use" for two or more consecutive trips, automatically suggest moving it to an "Optional" bucket or suggest its removal in a dialog.

---
**You now have a comprehensive, feature‑complete roadmap from v1 to a sophisticated camping‑trip assistant.*
*Choose your next milestone, create the branch, and start checking those boxes!**