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

- [ ] **State layer**: history stack of deep clones; push after each mutation.
- [ ] **Keyboard/UI**: `Ctrl/⌘+Z` undo; `Shift+Ctrl/⌘+Z` redo; ↶ ↷ toolbar buttons.
- [ ] **Persistence**: store only latest snapshot in `localStorage`.
- [ ] **Tests**: ensure ≥20 undos without leaks.

#### State layer

- [ ] Add a history stack (array of deep‑cloned states).
- [ ] Push clone after every mutating action.

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

- [ ] Move all colors to `CSS` custom properties (already 90% there).
- [ ] Create `:root.dark { --bg:#1c1c1c; … }` variant.

#### JS

- [ ] Add "🌙 Dark" button → toggles `document.documentElement.classList`.
- [ ] Persist preference in `localStorage.theme`.
- [ ] Detect `prefers‑color‑scheme` on first load.

### 1‑G Fuzzy Search / Filter

- [ ] Insert `<input id="filter" placeholder="Search…">` above `checklistContainer`.
- [ ] On input event:
  - [ ] Lower‑case query.
  - [ ] Hide `<li.item>` whose text + note doesn't include substring.
  - [ ] Highlight matches with `<mark>` (optional).
- [ ] Add loading indicator for first render (already showing "Loading...").

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

GOOGLE_MAPS_API_KEY = "AIzaSyACkiD1ScnxmAX0gjJnB39j-Gj6jmQx2G4";

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

### 1-F: Undo / Redo

- [ ] **State Layer**:
  - [ ] Create a history stack data structure (array of states)
  - [ ] Implement deep cloning of checklist state
  - [ ] Add logic to push new state onto stack after each significant mutation
  - [ ] Implement maximum history size limit to prevent memory issues
- [ ] **Keyboard/UI Hooks**:
  - [ ] Add event listener for `Ctrl`/`⌘`‑`Z` for undo
  - [ ] Add event listener for `Shift`‑`Ctrl`/`⌘`‑`Z` for redo
  - [ ] Create "↶ Undo" & "↷ Redo" toolbar buttons in the controls bar
  - [ ] Implement logic to disable buttons when appropriate stacks are empty
- [ ] **Persistence**:
  - [ ] Modify storage logic to only save latest state to `localStorage`
  - [ ] Ensure history stack is maintained only in memory
  - [ ] Add safeguards to prevent history loss on page refresh
- [ ] **Tests**:
  - [ ] Write unit tests for undo/redo functionality
  - [ ] Create memory leak detection tests
  - [ ] Verify support for ≥20 undo operations without performance degradation
  - [ ] Test edge cases (empty state, maximum history size)

### 1-G: Dark Mode Toggle

- [ ] **CSS Setup**:
  - [ ] Utilize existing CSS custom properties
  - [ ] Move all colors to CSS custom properties
  - [ ] Define a `:root.dark { --bg:#1c1c1c; … }` color palette variant
- [ ] **UI Implementation**:
  - [ ] Add a UI toggler (e.g., a 🌙 button)
  - [ ] Implement toggle functionality for `document.documentElement.classList`
  - [ ] Create smooth transition effects between modes
- [ ] **Persistence**:
  - [ ] Store user's preference in `localStorage.theme`
  - [ ] Detect and respect `prefers-color-scheme` media query on first load
  - [ ] Implement logic to apply saved preference on page reload

### 1-H: Fuzzy Search / Filter

- [ ] **Search Field Implementation**:
  - [ ] Add an input field (e.g., `<input id="filter" placeholder="Search…">`) above the checklist container.
  - [ ] Style the search field to match the app's design.
  - [ ] Add clear button (×) to reset the search.

- [ ] **Filtering Logic**:
  - [ ] Implement event listener for input changes.
  - [ ] Create function to lowercase both query and item text for case-insensitive matching.
  - [ ] Write logic to hide `<li.item>` elements whose text + notes don't include the search substring.
  - [ ] Add visual feedback when no items match the search.

- [ ] **Search Result Enhancement**:
  - [ ] Implement highlighting of matching text using the `<mark>` tag.
  - [ ] Ensure highlighting works for both item text and notes.
  - [ ] Add count of matching items (e.g., "5 of 24 items").

- [ ] **Loading State**:
  - [ ] Add loading indicator for first render (already showing "Loading...").
  - [ ] Implement transition from loading state to loaded state.

### 1-I: Local Data Encryption *(Optional)*

- [ ] **Encryption Implementation**:
  - [ ] Research and select an appropriate AES encryption library for client-side use
  - [ ] Create function to generate secure salt and initialization vector (IV)
  - [ ] Implement encryption function to convert JSON data to encrypted string
  - [ ] Implement decryption function to restore data from encrypted string

- [ ] **User Interface**:
  - [ ] Add passphrase input dialog with strength indicator
  - [ ] Create toggle for enabling/disabling encryption
  - [ ] Add visual indicator when encryption is active

- [ ] **Storage Logic**:
  - [ ] Modify localStorage save function to encrypt data when enabled
  - [ ] Store salt and IV separately but unencrypted
  - [ ] Implement secure error handling for decryption failures
  - [ ] Add option to export/backup encryption keys

## Phase 2: Trip-Planning Intelligence

### 2-A: Dependency / Prompt System

- [ ] **Schema upgrade**:
  - [ ] Add an optional `requires: ["item_id", …]` array field to the item schema
  - [ ] Update JSON structure to support dependency relationships
  - [ ] Ensure backward compatibility with existing data

- [ ] **Prompt engine**:
  - [ ] Implement event listener for checkbox changes
  - [ ] When a user ticks item A (a "parent" item), loop through its `requires` array
  - [ ] Check if required items exist in the list
  - [ ] Check if required items are already checked
  - [ ] If a required item is not present or unchecked ⇒ display a toast notification

- [ ] **Toast notifications**:
  - [ ] Create "Don't forget X" reminder message for dependent items
  - [ ] Enable quick‑add button inside toast for missing items
  - [ ] Implement toast component using absolute `div` positioning
  - [ ] Add auto‑fade `CSS` animation for toast dismissal

### 2-B: Weight & Volume Estimator

- [ ] **Schema**:
  - [ ] Add `weight: number` (grams) field to item schema
  - [ ] Add optional `packed: boolean` field to item schema

- [ ] **UI**:
  - [ ] Create "⚖️ Weights" sidebar with fixed CSS positioning
  - [ ] Implement summary panel showing weight totals
  - [ ] Add weight input dialog accessible via 💬 icon on items

- [ ] **Logic**:
  - [ ] Implement weight calculation function
  - [ ] Set up event listeners for checkbox and weight changes
  - [ ] Calculate and display base-weight separately from consumables
  - [ ] Show totals in both kg and lb units

- [ ] **Export**:
  - [ ] Create "Export to `CSV`" button
  - [ ] Implement export functionality using `Blob` + `URL.createObjectURL`

### 2-C: Cost Tracker

- [ ] **Cost Tracking**:
  - [ ] Add an optional `cost: number` field to the item schema
  - [ ] Update JSON structure to support cost data
  - [ ] Ensure backward compatibility with existing items

- [ ] **UI Integration**:
  - [ ] Add cost input field to item creation/edit dialog
  - [ ] Display cost alongside items in the main list
  - [ ] Create cost summary section in the sidebar
  - [ ] Implement running total calculation function

- [ ] **Budget Management**:
  - [ ] Add optional `budget: number` field to Trip Meta information
  - [ ] Display budget and remaining amount in the sidebar
  - [ ] Add visual indicator when approaching/exceeding budget
  - [ ] Implement budget vs. actual comparison view

### 2-D: Permits & Regulations Helper

- [ ] **Schema Enhancements**:
  - [ ] Add `permitUrl` field to trip metadata schema
  - [ ] Add `fireRules` field to trip metadata schema
  - [ ] Add `permitRequired: boolean` flag for relevant items
  - [ ] Add `regulationNotes: string` field for special rules

- [ ] **UI Components**:
  - [ ] Create permit information panel in trip details section
  - [ ] Add visual indicators for items with special regulations
  - [ ] Implement collapsible regulations summary view

- [ ] **Warning System**:
  - [ ] Build logic to detect missing permits based on destination
  - [ ] Create warning badges for items with regulation restrictions
  - [ ] Implement toast notifications for permit deadlines
  - [ ] Add links to official regulation websites

### 2-E: Weather-Aware Prompts

- [ ] **Location & Date Setup**:
  - [ ] Build settings dialog UI component
  - [ ] Add input fields for zip code / lat-lon coordinates
  - [ ] Implement auto-detect location functionality
  - [ ] Add date picker for trip start date
  - [ ] Save location and date to trip metadata

- [ ] **Weather API Integration**:
  - [ ] Set up OpenWeatherMap API client
  - [ ] Fetch 7-day `JSON` forecast from `api.openweathermap.org`
  - [ ] Implement error handling for API requests
  - [ ] Cache weather data in `localStorage`
  - [ ] Add refresh button to update forecast

- [ ] **Condition Mapping**:
  - [ ] Define weather condition tags (rain, freeze, heat)
  - [ ] Create mapping logic from API weather codes to tags
  - [ ] Build condition severity assessment (light/heavy rain, etc.)
  - [ ] Store mapped conditions in trip metadata

- [ ] **Item Tag System**:
  - [ ] Update item schema to include optional `tags:["rain"]` field
  - [ ] Add tag management UI in item edit dialog
  - [ ] Create predefined tag suggestions based on item type
  - [ ] Ensure backward compatibility with existing items

- [ ] **UI Notifications**:
  - [ ] Implement orange badge for weather-affected items
  - [ ] Create toast notification system for weather alerts
  - [ ] Add weather summary panel to trip dashboard
  - [ ] Build toggle for enabling/disabling weather alerts

### OpenWeatherMap API Key (for Weather-Aware Prompts)

OPENWEATHERMAP_API_KEY = "92df3f0f4c1aa7fdbbe39a05410f8895";

## Phase 3 Field Use Enhancements

### 3‑A PWA / Offline Install

- [ ] Add `manifest.json`:
  - [ ] Define app name and description
  - [ ] Create and add app icons (192x192, 512x512)
  - [ ] Configure start_url and display mode
  - [ ] Set theme and background colors
- [ ] Generate `service‑worker` with `Workbox`:
  - [ ] Cache app shell (`HTML`, `CSS`, `JS`)
  - [ ] Implement offline fallback page
  - [ ] Handle API requests with stale-while-revalidate strategy
  - [ ] `localStorage` already offline; optionally mirror to `IndexedDB`
- [ ] Test on `Chrome`:
  - [ ] Verify "Add to Home Screen" functionality
  - [ ] Test offline capabilities
  - [ ] Validate PWA in Chrome DevTools Lighthouse
- [ ] Set up hosting with `HTTPS`:
  - [ ] Configure `Replit`
  - [ ] Ensure proper SSL certificate setup
  - [ ] Verify PWA requirements are met

### 3‑B Photo Notes

- [ ] **Photo Notes Implementation**:
  - [ ] Add "📷 Add photo" button to note prompt
  - [ ] Create hidden file input with `accept="image/*" capture` attribute
  - [ ] Implement click handler to trigger file input
  - [ ] Add event listener for file selection
  
- [ ] **Image Processing**:
  - [ ] Convert selected image to `dataURL` format
  - [ ] Store image data in `item.noteImage` property
  - [ ] Implement image compression if needed
  
- [ ] **UI Display**:
  - [ ] Render `<img>` element in details panel
  - [ ] Apply `max-width: 100%` styling to image
  - [ ] Add loading indicator during image processing
  
- [ ] **Storage Optimization**:
  - [ ] Resize images to maximum 900px width
  - [ ] Implement quality reduction for large images
  - [ ] Add option to store images in `IndexedDB`
  - [ ] Create reference system to link `JSON` data to `IndexedDB` image keys

### 3‑C On‑Device Notifications

- [ ] **Notification Permission**:
  - [ ] Implement permission request dialog on first app load
  - [ ] Store permission status in local storage
  - [ ] Add fallback for browsers that don't support notifications

- [ ] **Trip Timeline Editor**:
  - [ ] Create "Trip timeline" section in settings
  - [ ] Implement simple `textarea` for timeline entry
  - [ ] Add parser to extract `HH:MM` time formats and descriptions
  - [ ] Validate and store timeline data

- [ ] **Notification Triggers**:
  - [ ] Implement `setTimeout` for standard notification delivery
  - [ ] Add `ServiceWorker` alarms for PWA implementation
  - [ ] Create notification display with relevant timeline information
  - [ ] Handle notification clicks to open relevant app section

### 3‑D Responsive Design Improvements

- [ ] **Implement specific optimizations for mobile devices**:
  - [ ] Larger touch targets (at least 44x44 pixels)
  - [ ] Bottom-fixed action buttons for frequently used actions
  - [ ] Consider swipe gestures for common actions (e.g., swipe to complete/delete)
- [ ] **Add `@media` queries for different device sizes**:
  - [ ] Create breakpoints for mobile devices (< 480px)
  - [ ] Create breakpoints for tablets (480px - 768px)
  - [ ] Create breakpoints for desktops (> 768px)
- [ ] **Test thoroughly on various screen sizes and orientations**:
  - [ ] Test on small mobile devices (320px width)
  - [ ] Test on larger mobile devices (375px-428px width)
  - [ ] Test on tablets (768px width)
  - [ ] Test in both portrait and landscape orientations

## Phase 3: Field-Use Enhancements

### 3-A: PWA / Offline Install

- [ ] **PWA Setup**:
  - [ ] Create `manifest.json` file
  - [ ] Add app name and description
  - [ ] Configure icons in various sizes
  - [ ] Set appropriate start_url

- [ ] **Service Worker Implementation**:
  - [ ] Install Workbox library/tools
  - [ ] Generate service worker script
  - [ ] Configure caching for HTML, CSS, and JS files
  - [ ] Implement offline fallback page

- [ ] **Data Storage**:
  - [ ] Verify localStorage functionality works offline
  - [ ] Implement optional mirroring to IndexedDB
  - [ ] Create data sync mechanism between storage types

- [ ] **Testing**:
  - [ ] Test PWA on Chrome browser
  - [ ] Verify "Add to Home Screen" functionality
  - [ ] Test offline capabilities
  - [ ] Validate on multiple devices

- [ ] **Deployment**:
  - [ ] Set up GitHub Pages or Netlify hosting
  - [ ] Configure for HTTPS (required for PWA)
  - [ ] Verify service worker registration in production
  - [ ] Test installed PWA functionality

### 3-B: Photo Notes

- [ ] **Photo Notes Implementation**:
  - [ ] Add "📷 Add photo" button to note prompt
  - [ ] Create hidden file input with `accept="image/*" capture` attribute
  - [ ] Integrate camera capture functionality
  - [ ] Implement photo processing:
    - [ ] Convert captured images to `dataURL` format
    - [ ] Store image data in `item.noteImage` property
    - [ ] Add compression functionality to reduce file size
  - [ ] Display photos in details panel:
    - [ ] Render `<img>` element with `max-width: 100%`
    - [ ] Ensure responsive display across device sizes
  - [ ] Optimize storage:
    - [ ] Limit photo width to ≤ 900 px for space efficiency
    - [ ] Implement optional `IndexedDB` storage for photo data
    - [ ] Create reference system to store keys in `JSON` instead of full image data

### 3-C: On-Device Notifications

- [ ] **On-Device Notifications**:
  - [ ] Ask Notification permission on first load
  - [ ] Implement settings for notifications:
    - [ ] Add "Trip timeline" editor (simple `textarea`)
    - [ ] Create parser for `HH:MM` description format
  - [ ] Implement notification triggers:
    - [ ] Use `setTimeout` for in-app notifications
    - [ ] Implement Service Worker alarms in PWA mode
    - [ ] Create notification display system for timed events

### 3-D: Battery-Aware Mode

- [ ] **Battery-Aware Mode Implementation**:
  - [ ] Utilize the Battery Status API:
    - [ ] Implement detection of device's battery level
    - [ ] Add event listeners for battery status changes
  - [ ] Create low-power mode functionality:
    - [ ] Define battery threshold for activation (e.g., 15%)
    - [ ] Implement UI dimming for images when in low-power mode
    - [ ] Add system to disable non-essential background tasks
    - [ ] Create user settings to configure battery-aware features
  - [ ] Add visual indicator when low-power mode is active

### 3-E: Share via QR Code

- [ ] **QR Code Sharing Implementation**:
  - [ ] Encode checklist data:
    - [ ] Convert checklist JSON to string
    - [ ] Implement base64 encoding function
    - [ ] Add compression if needed for large checklists
  - [ ] Generate QR code:
    - [ ] Add QR code generation library
    - [ ] Create function to convert base64 string to QR code
    - [ ] Implement error handling for oversized data
  - [ ] Build UI components:
    - [ ] Add "Share via QR" button to checklist view
    - [ ] Create modal dialog to display generated QR code
    - [ ] Add option to save QR code as image
  - [ ] Implement QR code scanner for importing:
    - [ ] Add camera access for QR scanning
    - [ ] Build decoder to extract base64 data
    - [ ] Create import workflow for scanned checklists

### 3-F: Responsive Polish

- [ ] **Implement specific optimizations for mobile devices**:
  - [ ] Increase the size of touch targets for better usability on mobile devices (at least 44x44 pixels)
  - [ ] Implement a bottom-fixed action bar for commonly used actions
  - [ ] Explore implementing swipe gestures for common actions (e.g., marking an item as packed or deleting)

- [ ] **Add responsive design elements**:
  - [ ] Create `@media` queries for different device sizes
  - [ ] Implement flexible layouts that adapt to screen dimensions
  - [ ] Optimize font sizes and spacing for different viewport widths

- [ ] **Test thoroughly across devices**:
  - [ ] Test on various screen sizes (phone, tablet, desktop)
  - [ ] Verify functionality in both portrait and landscape orientations
  - [ ] Create device testing checklist for consistent quality assurance

## Phase 4 Cloud & Collaboration (Optional)

### 4‑A Opt‑in Sync (Supabase)

#### Auth with Google (Auth)

#### On login

- [ ] **Data Synchronization**:
  - [ ] Push local data to `profiles/{uid}/checklists/{listId}`
  - [ ] Implement timestamp-based versioning for change tracking
  - [ ] Add error handling for failed sync attempts

- [ ] **Realtime Updates**:
  - [ ] Set up realtime listener for remote changes
  - [ ] Implement merge strategy with `timestamp-wins` conflict resolution
  - [ ] Create background sync process for automatic updates

- [ ] **UI Feedback**:
  - [ ] Add "Sync now" button with loading spinner
  - [ ] Implement `snackbar` notifications for sync status
  - [ ] Create conflict-resolution dialog for manual intervention
  - [ ] Add visual indicators for sync state (in-sync, pending, error)

### 4‑B Share / Import Links

- [ ] **Implement sharing functionality**:
  - [ ] Create data encoding function using `encode = btoa(encodeURIComponent(JSON.stringify(data)))`
  - [ ] Build URL generator that appends encoded data as `?import=<encode>` parameter
  - [ ] Add "Share" button to generate and copy link to clipboard
  - [ ] Implement optional QR code generation for the share link

- [ ] **Develop import functionality**:
  - [ ] Add URL parameter detection on page load
  - [ ] Create parser to extract and decode data from `?import=<encode>` parameter
  - [ ] Build confirmation dialog prompting "Load packlist?"
  - [ ] Implement duplication logic to add imported list under Trips archive
  - [ ] Add validation to ensure data integrity of imported lists

### 4‑C Multiple Checklist Support

- [ ] **Multiple Checklist Management**:
  - [ ] Create data structure to store multiple checklists
  - [ ] Implement CRUD operations for checklist management
  - [ ] Add ability to name and categorize checklists by trip type
  - [ ] Design UI for checklist overview and management

- [ ] **Checklist Selection UI**:
  - [ ] Build dropdown or tab-based selection interface
  - [ ] Implement state management for active checklist
  - [ ] Create smooth transitions between different checklists
  - [ ] Add visual indicators for current active checklist

- [ ] **Templating System**:
  - [ ] Implement "Duplicate Checklist" functionality
  - [ ] Create "Save as Template" option for reusable checklists
  - [ ] Build template selection interface for new checklists
  - [ ] Add ability to merge items from different checklists

## Phase 4: Cloud & Collaboration *(Opt-in)*

### 4-A: Sync via Supabase

- [ ] **Backend Integration**:
  - [ ] Research and select Supabase as backend service
  - [ ] Set up Supabase project and database schema
  - [ ] Configure API endpoints for checklist data
  - [ ] Implement optional cloud synchronization toggle

- [ ] **Authentication**:
  - [ ] Integrate Supabase Auth components
  - [ ] Implement GitHub OAuth login flow
  - [ ] Implement Google OAuth login flow
  - [ ] Create user profile management UI

- [ ] **Data Synchronization**:
  - [ ] Implement data structure for `profiles/{uid}/checklists/{listId}`
  - [ ] Create function to push local data to cloud on login
  - [ ] Set up realtime listener for remote changes
  - [ ] Implement `timestamp-wins` conflict resolution strategy

- [ ] **UI Components**:
  - [ ] Add "Sync now" button with loading spinner
  - [ ] Create conflict-resolution snackbar notifications
  - [ ] Implement sync status indicators (in-sync, pending, error)
  - [ ] Add user account management panel

- [ ] **Access Control**:
  - [ ] Design role-based Access Control Lists (ACL)
  - [ ] Implement view vs. edit permission levels
  - [ ] Create UI for managing shared list permissions
  - [ ] Add invitation system for collaborative editing

### 4-B: Share / Import Links

- [ ] **Share Link Generation**:
  - [ ] Create function to serialize checklist data to JSON
  - [ ] Implement base64 encoding using `btoa(encodeURIComponent(JSON.stringify(data)))`
  - [ ] Generate shareable URL with encoded data in hash parameter
  - [ ] Add "Share" button to UI with copy-to-clipboard functionality
  - [ ] Create shortened URL option for very large checklists

- [ ] **Import Functionality**:
  - [ ] Detect `?import=<encoded-data>` parameter on page load
  - [ ] Parse and validate imported data from URL
  - [ ] Create confirmation dialog "Load packlist?"
  - [ ] Implement duplication logic to store under Trips archive
  - [ ] Add duplicate detection to prevent identical imports
  - [ ] Display success/error notifications after import

### 4-C: Multiple Checklists

- [ ] **Multiple Checklists Management**:
  - [ ] Add ability to create and manage multiple checklists
  - [ ] Design data structure for storing multiple checklists
  - [ ] Develop a checklist manager UI
  - [ ] Implement CRUD operations for checklists

- [ ] **Checklist Selection**:
  - [ ] Create dropdown or sidebar navigation for checklist selection
  - [ ] Implement state management for active checklist
  - [ ] Add visual indicators for current selected checklist
  - [ ] Save last selected checklist in localStorage

- [ ] **Templating & Reuse**:
  - [ ] Add "Duplicate Checklist" functionality
  - [ ] Implement checklist templates feature
  - [ ] Create template selection UI for new checklists
  - [ ] Add import/export functionality for individual checklists

## Phase 5 Post‑Trip Review

### 5‑A Usage & Rating Capture

- [ ] **End Trip Functionality**:
  - [ ] Create "End Trip" button in the UI
  - [ ] Implement click handler for the button
  - [ ] Design confirmation dialog before proceeding

- [ ] **Item Usage Dialog**:
  - [ ] Build modal dialog component for item review
  - [ ] Add "Used?" checkbox for each item
  - [ ] Implement 3-star rating system UI
  - [ ] Create navigation controls between items
  - [ ] Add progress indicator (e.g., "Item 5 of 20")

- [ ] **Data Storage**:
  - [ ] Define `trips[]` array structure in localStorage
  - [ ] Implement function to collect all usage and rating data
  - [ ] Store trip metadata (date, name) with results
  - [ ] Save item data with format `{id, used, stars}`
  - [ ] Add error handling for storage failures

### 5‑B Archive & Compare

- [ ] **Build Trips Archive Page**:
  - [ ] Create table layout for displaying archived trips
  - [ ] Implement sorting functionality by date, name, etc.
  - [ ] Add search/filter capabilities for finding specific trips
  - [ ] Design responsive view for mobile compatibility

- [ ] **Implement Duplication Functionality**:
  - [ ] Create "Duplicate to new list" button on trip details
  - [ ] Build function to copy items and weights to new checklist
  - [ ] Ensure checked states are reset in the duplicated list
  - [ ] Add confirmation dialog before creating duplicate

- [ ] **Develop Comparison Analysis**:
  - [ ] Build diff engine to compare ratings between trips
  - [ ] Create visualization for highlighting unused/low-rated items
  - [ ] Implement suggestion algorithm for potential removals
  - [ ] Add option to apply suggestions automatically to current list

### 5‑C Markdown / PDF Export

- [ ] **Markdown Export Implementation**:
  - [ ] Re‑use current render function to produce `Markdown` string:
    - [ ] Format items as `[x] Tent **2.3 kg** — _Essential_`
    - [ ] Implement proper indentation for nested items
    - [ ] Ensure notes are indented beneath parent items
  - [ ] Clipboard Integration:
    - [ ] Add "Copy to Clipboard" button
    - [ ] Implement clipboard API functionality
    - [ ] Add success/failure notification
  - [ ] File Download:
    - [ ] Create downloadable `.md` file generation
    - [ ] Implement file naming convention (e.g., `packlist-[date].md`)
    - [ ] Add download button to UI
  - [ ] PDF Export (Optional):
    - [ ] Integrate `jsPDF` library
    - [ ] Create PDF formatting function
    - [ ] Implement PDF download functionality
    - [ ] Add PDF styling options

## Phase 5: Post-Trip Review

### 5-A: Usage & Rating Capture

- [ ] **End Trip Functionality**:
  - [ ] Create "End Trip" button in the UI
  - [ ] Design and implement "End Trip" wizard interface
  - [ ] Add confirmation dialog before starting the end trip process

- [ ] **Item Usage & Rating Collection**:
  - [ ] Build dialog UI with "Used?" checkbox for each item
  - [ ] Implement 3-star rating component for importance assessment
  - [ ] Create navigation controls to move between items in the wizard
  - [ ] Add progress indicator showing completion status

- [ ] **Data Storage**:
  - [ ] Define `trips[]` array data structure in the application
  - [ ] Implement function to collect trip metadata (date, name)
  - [ ] Create storage format for item data `{id, used, stars}`
  - [ ] Build save functionality to persist trip data
  - [ ] Add error handling for storage failures

### 5-B: Archive & Compare

- [ ] **Build Trips Archive Page**:
  - [ ] Create dedicated "Trips" page with table layout
  - [ ] Implement sorting functionality by date, name, and location
  - [ ] Add filtering options for trip types and seasons
  - [ ] Design responsive UI for both desktop and mobile views

- [ ] **Implement List Duplication Feature**:
  - [ ] Create "Duplicate to new list" button in trip details
  - [ ] Build function to copy items and weights while excluding checked states
  - [ ] Add option to rename duplicated list during creation
  - [ ] Implement success notification after duplication

- [ ] **Develop Comparison Analysis Tools**:
  - [ ] Build diff engine to compare ratings between trips
  - [ ] Create visualization for highlighting unused/low-rated items
  - [ ] Implement suggestion algorithm for potential removals
  - [ ] Add option to apply suggestions automatically to current list

### 5-C: Markdown / PDF Export

- [ ] **Markdown Export**:
  - [ ] Re‑use current render function to produce `Markdown` string: `[x] Tent **2.3 kg** — _Essential_`
  - [ ] Implement indentation for notes beneath items
  - [ ] Add "Copy to Clipboard" button functionality
  - [ ] Create downloadable `.md` file generation

- [ ] **PDF Export**:
  - [ ] Integrate `jsPDF` library
  - [ ] Create PDF formatting function using same data structure
  - [ ] Implement PDF download functionality
  - [ ] Add basic styling options for the PDF output

### 5-D: Auto-Suggest Future Lists

- [ ] **Analyze usage data from past trips**:
  - [ ] Create function to aggregate item usage across multiple trips
  - [ ] Implement data structure to track usage patterns
  - [ ] Build algorithm to identify consistently unused items
  - [ ] Add metrics for frequency of use across different trip types

- [ ] **Implement suggestion system**:
  - [ ] Create logic to identify items unused for two or more consecutive trips
  - [ ] Build "Optional" category/bucket in the checklist structure
  - [ ] Design suggestion dialog UI with item details and usage history
  - [ ] Add options to move item to "Optional" bucket or remove entirely
  - [ ] Implement "Don't suggest again" option for false positives

## Performance & Scalability

- [ ] **Large Checklist Handling**:
  - [ ] Research virtual scrolling libraries or implement custom solution
  - [ ] Add pagination controls for lists exceeding certain threshold (e.g., 100+ items)
  - [ ] Implement lazy loading for checklist sections
  - [ ] Test performance with 500+ item lists

- [ ] **Local Storage Limits**:
  - [ ] Create function to calculate current storage usage
  - [ ] Implement warning system when approaching 80% of 5MB limit
  - [ ] Add user-friendly notification UI for storage warnings
  - [ ] Build cleanup suggestions for reducing storage usage

- [ ] **Offline Data Backup**:
  - [ ] Create JSON export functionality with date-stamped filenames
  - [ ] Implement file picker for importing backup files
  - [ ] Add validation for imported data structure
  - [ ] Build automatic backup scheduling system (optional)

- [ ] **Rendering Optimization**:
  - [ ] Implement DOM diffing algorithm for efficient updates
  - [ ] Replace full re-renders with targeted DOM updates
  - [ ] Add debouncing for rapid user interactions
  - [ ] Measure and optimize render performance metrics

- [ ] **Background Processing**:
  - [ ] Create Web Worker implementation for heavy calculations
  - [ ] Move data processing operations off the main thread
  - [ ] Implement message passing interface for worker communication
  - [ ] Add fallback for browsers without Web Worker support

## Optional Polishing

- [ ] **Accessibility Audit**:
  - [ ] Review/add `ARIA` attributes for interactive elements:
    - [ ] Add appropriate ARIA roles to dialog components
    - [ ] Implement aria-labels for drag handles
    - [ ] Ensure buttons have descriptive aria-labels
    - [ ] Add aria-expanded states for expandable sections
  - [ ] Ensure full keyboard navigation:
    - [ ] Implement tab order for all interactive elements
    - [ ] Create keyboard alternatives for drag-and-drop functionality
    - [ ] Add focus indicators for all interactive elements
    - [ ] Test navigation flow with keyboard only
  - [ ] Test with screen readers:
    - [ ] Test with NVDA on Windows
    - [ ] Test with VoiceOver on macOS/iOS
    - [ ] Document and fix any issues found
    - [ ] Verify all important content is properly announced
  - [ ] Implement high contrast mode:
    - [ ] Create high-contrast CSS variables
    - [ ] Add toggle for high-contrast mode
    - [ ] Test color contrast ratios meet WCAG standards
    - [ ] Ensure all UI elements are visible in high-contrast mode

- [ ] **Implement Bulk Actions**:
  - [ ] Create multi-select functionality:
    - [ ] Add checkboxes to list items
    - [ ] Implement shift-click for range selection
    - [ ] Add visual indicators for selected items
  - [ ] Build bulk action controls:
    - [ ] Create action toolbar for selected items
    - [ ] Implement bulk delete functionality
    - [ ] Add bulk category/section move capability
    - [ ] Include bulk tag application feature

- [ ] **Add Context Menu**:
  - [ ] Design context menu UI:
    - [ ] Create menu component with consistent styling
    - [ ] Implement positioning logic for different screen sizes
  - [ ] Implement for items:
    - [ ] Add edit, delete, duplicate options
    - [ ] Include move to section functionality
    - [ ] Add tagging options
  - [ ] Implement for sections:
    - [ ] Add rename, delete, collapse options
    - [ ] Include section reordering functionality

- [ ] **Implement Keyboard Shortcuts**:
  - [ ] Define shortcut mapping:
    - [ ] Map `N` to new item creation
    - [ ] Map `E` to edit current item
    - [ ] Map `⌫` to delete selected item(s)
    - [ ] Create additional shortcuts for common actions
  - [ ] Build keyboard shortcut system:
    - [ ] Implement event listeners for key combinations
    - [ ] Add visual feedback for activated shortcuts
    - [ ] Create help dialog showing all available shortcuts
    - [ ] Add user preferences for customizing shortcuts

- [ ] **Externalize User-Facing Strings**:
  - [ ] Create i18n structure:
    - [ ] Build JSON bundle for all UI text
    - [ ] Organize strings by feature/component
    - [ ] Include placeholders for dynamic content
  - [ ] Implement string loading system:
    - [ ] Create function to retrieve localized strings
    - [ ] Add fallback mechanism for missing translations
    - [ ] Implement language detection and selection
  - [ ] Audit and replace hardcoded strings:
    - [ ] Update all UI components to use i18n function
    - [ ] Test with pseudo-localization to find missed strings

- [ ] **Write Cypress End-to-End Tests**:
  - [ ] Set up testing infrastructure:
    - [ ] Install and configure Cypress
    - [ ] Create test directory structure
    - [ ] Set up CI integration for automated testing
  - [ ] Implement core flow tests:
    - [ ] Test item creation and manipulation
    - [ ] Test drag-and-drop functionality
    - [ ] Verify notes creation and editing
    - [ ] Test offline data loading and persistence
  - [ ] Create visual regression tests:
    - [ ] Add screenshot comparisons for key UI states
    - [ ] Implement responsive testing for different viewports

- [ ] **TypeScript Migration**:
  - [ ] Prepare for migration:
    - [ ] Install TypeScript and configure tsconfig.json
    - [ ] Define initial type definitions for core data structures
    - [ ] Set up build process for TypeScript files
  - [ ] Implement incremental migration:
    - [ ] Convert utility functions first
    - [ ] Migrate core data models to interfaces/types
    - [ ] Convert UI components with proper props typing
    - [ ] Add comprehensive type coverage

- [ ] **Develop Theming System**:
  - [ ] Create CSS variable framework:
    - [ ] Define color palette variables
    - [ ] Add typography and spacing variables
    - [ ] Implement component-specific variables
  - [ ] Build theme switching mechanism:
    - [ ] Add data-theme attribute to root element
    - [ ] Create theme selection UI
    - [ ] Implement theme persistence in user preferences
  - [ ] Create predefined themes:
    - [ ] Design light and dark themes
    - [ ] Add high-contrast accessibility theme
    - [ ] Create seasonal/special themes

- [ ] **Create Sustainability Theme**:
  - [ ] Design low-power color scheme:
    - [ ] Use darker colors for OLED screens
    - [ ] Minimize contrast changes and animations
    - [ ] Optimize for reduced battery consumption
  - [ ] Implement power-saving features:
    - [ ] Add reduced animation mode
    - [ ] Create simplified rendering option
    - [ ] Integrate with device battery status API

- [ ] **Implement Onboarding Tour**:
  - [ ] Design tour overlay:
    - [ ] Create highlight component for focused elements
    - [ ] Build step navigation controls
    - [ ] Add dismissible tooltips with instructions
  - [ ] Develop tour content:
    - [ ] Write concise explanations for key features
    - [ ] Create logical progression of steps
    - [ ] Add visual cues for interactive elements
  - [ ] Implement tour logic:
    - [ ] Add first-time user detection
    - [ ] Create tour state management
    - [ ] Allow pausing and resuming the tour
    - [ ] Add option to restart tour from settings

## Implementation Etiquette

- [ ] **Version Control Best Practices**:
  - [ ] Create a dedicated Git branch per feature or task
  - [ ] Submit small, focused Pull Requests (PRs)
  - [ ] Use squash-merging when merging PRs to keep the commit history clean

- [ ] **Quality Assurance**:
  - [ ] Ensure the CI pipeline passes (linting, tests, Lighthouse budget) before merging any PR
  - [ ] Perform manual smoke-test on desktop before considering a feature complete
  - [ ] Perform manual smoke-test on mobile before considering a feature complete

- [ ] **Code Documentation**:
  - [ ] Comment code generously
  - [ ] Maintain an explanatory style in code
  - [ ] Write clear PR descriptions

- [ ] **Data Management**:
  - [ ] Include a schema version key in `localStorage`
  - [ ] Write migration scripts in the `load()` function
  - [ ] Handle breaking schema updates gracefully

**You now have a comprehensive, feature‑complete roadmap from v1 to a sophisticated camping‑trip assistant.*
*Choose your next milestone, create the branch, and start checking those boxes!**
