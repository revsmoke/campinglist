// Main application entry point

import { loadAllState, theme } from "./state.js";
import {
  renderMeta,
  renderList,
  setupEventListeners,
  applyTheme,
} from "./ui.js";
import { setupDragAndDrop } from "./drag.js";

/***************** BOOT *****************/
// Initial app bootstrap
async function initializeApp() {
  // 1. Load data (from localStorage or fetch default)
  await loadAllState();

  // 2. Apply initial theme based on saved pref or system setting
  applyTheme(theme);

  // 3. Render initial UI
  renderMeta();
  renderList();

  // 4. Setup all event listeners
  setupEventListeners();
  setupDragAndDrop();

  // console.log("App Initialized");
}

// Run the initialization function when the DOM is ready
// Use DOMContentLoaded to ensure the DOM is fully parsed, even if not fully rendered
if (document.readyState === "loading") {
  // Loading hasn't finished yet
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  // `DOMContentLoaded` has already fired
  initializeApp();
}
