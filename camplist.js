// /Applications/ColdFusion2023/cfusion/wwwroot/campinglist/camplist.js

// --- Google Maps API Callback ---
// Define the callback function globally BEFORE imports to ensure it's available
// when the Google Maps API script loads
window.googleMapsApiLoaded = function () {
  console.log("Google Maps API script loaded.");
  window.googleMapsApiReady = true;
  // The actual initialization will happen in initializeApp()
};
// --- End Google Maps API Callback ---

// Import necessary functions from other modules
import { loadAllState, theme } from "./state.js";
import {
  renderMeta,
  renderList,
  setupEventListeners,
  applyTheme,
  calculateAndDisplayWeights,
  calculateAndDisplayCosts,
  updatePermitRequiredItems,
  updatePermitInfo,
} from "./ui.js";
import { setupDragAndDrop } from "./drag.js";
// Import the Google Maps initialization functions
import {
  initMap as initGoogleMapsAutocomplete,
  reinitializePlaceAutocomplete,
  setupFormSubmitSync,
} from "./location.js";

// Store API ready state
let googleMapsApiReady = window.googleMapsApiReady || false;

/***************** BOOT *****************/
// Initial app bootstrap
async function initializeApp() {
  // 1. Load data (from localStorage or fetch default)
  await loadAllState();

  // 2. Apply initial theme based on saved pref or system setting
  applyTheme(theme);

  // 3. Render initial UI (this should create the #metaDialog and its contents)
  renderMeta(); // Ensure this renders the dialog containing #destinationInput
  renderList();

  // 4. Setup all event listeners
  setupEventListeners(); // This likely includes the listener to open #metaDialog
  setupDragAndDrop();

  // 5. Initialize calculators and info
  calculateAndDisplayWeights();
  calculateAndDisplayCosts();
  updatePermitRequiredItems();
  updatePermitInfo();

  // 6. Check if Google Maps API loaded *before* DOMContentLoaded
  //    and initialize if necessary. This handles race conditions.
  // Get latest API ready state from window
  googleMapsApiReady = window.googleMapsApiReady || googleMapsApiReady;
  if (googleMapsApiReady) {
    console.log(
      "API was ready before initializeApp completed, calling initGoogleMapsAutocomplete()"
    );
    initGoogleMapsAutocomplete();
    // Also set up form submission syncing
    setupFormSubmitSync();
  } else {
    console.log("Google Maps API not ready yet, will initialize when it loads");
  }

  // 7. Add a listener to reinitialize autocomplete when the dialog opens
  const metaDialog = document.getElementById("metaDialog");
  const editMetaButton = document.querySelector("#metaContainer button");

  if (editMetaButton && metaDialog) {
    editMetaButton.addEventListener("click", () => {
      console.log("Edit Trip Info button clicked");
      metaDialog.showModal(); // Ensure the dialog is shown

      // Ensure maps API is ready before trying to reinit
      googleMapsApiReady = window.googleMapsApiReady || googleMapsApiReady;
      if (googleMapsApiReady) {
        // Use the dedicated reinitialize function for reliability
        setTimeout(reinitializePlaceAutocomplete, 100);
      } else {
        console.warn("Meta dialog opened, but Google Maps API not ready yet");
      }
    });
  }

  console.log("App Initialized");
}

// Run the initialization function when the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  // `DOMContentLoaded` has already fired
  initializeApp();
}
