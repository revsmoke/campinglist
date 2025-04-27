// /Applications/ColdFusion2023/cfusion/wwwroot/campinglist/camplist.js

// --- Google Maps API Callback ---
// Define the callback function globally BEFORE imports to ensure it's available
// when the Google Maps API script loads
async function initMap() {
  let destinationContainer = document.getElementById("destinationContainer");
  let destinationInput = document.getElementById("destinationInput");
  let destinationAddressInput = document.getElementById(
    "destinationAddressInput"
  );
  let destinationPlaceIdHidden = document.getElementById(
    "destinationPlaceIdHidden"
  );
  let destinationLatInput = document.getElementById("destinationLatInput");
  let destinationLngInput = document.getElementById("destinationLngInput");
  // Request needed libraries. (loaded in index.html)
  await google.maps.importLibrary("places");
  // Create the input HTML element, and append it.
  //google.maps.places.PlaceAutocompleteElementOptions
  //name - destinationAutocomplete
  let options = {
    name: "destinationAutocomplete",
    id: "destinationAutocompleteInput",
  };
  const placeAutocomplete = new google.maps.places.PlaceAutocompleteElement(
    options
  );
  //@ts-ignore
  destinationContainer.appendChild(placeAutocomplete);
  // Inject HTML UI.
  //const selectedPlaceTitle = document.createElement("p");
  //selectedPlaceTitle.textContent = "";
  //destinationContainer.appendChild(selectedPlaceTitle);
  //const selectedPlaceInfo = document.createElement("pre");
  //selectedPlaceInfo.textContent = "";
  //destinationContainer.appendChild(selectedPlaceInfo);
  // Add the gmp-placeselect listener, and display the results.
  //@ts-ignore
  placeAutocomplete.addEventListener(
    "gmp-select",
    async ({ placePrediction }) => {
      const place = placePrediction.toPlace();
      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "location"],
      });
      /* {
  "id": "EiRLIE8gQSBDYW1wZ3JvdW5kLCBZcHNpbGFudGksIE1JLCBVU0EiLiosChQKEglFhk3KQFg7iBETdgeQWa4jdBIUChIJrfq42W2oPIgRUTRKX0D3xvk",
  "displayName": "K O A Campground",
  "formattedAddress": "K O A Campground, Ypsilanti Township, MI 48197, USA",
  "location": {
    "lat": 42.192646,
    "lng": -83.5659717
  }
}*/
      destinationInput.value = place.displayName;
      destinationAddressInput.value = place.formattedAddress;
      destinationPlaceIdHidden.value = place.id;
      destinationLatInput.value = place.location.lat();
      destinationLngInput.value = place.location.lng();
      //selectedPlaceTitle.textContent = "Selected Place:";
      //selectedPlaceInfo.textContent = JSON.stringify(
      //  place.toJSON(),
      //  /* replacer */ null,
      //  /* space */ 2
      //);
      //console.log(place);
    }
  );
}

// --- End Google Maps API Callback ---

// Import necessary functions from other modules
import { loadAllState, theme } from "./state.js";
import {
  renderMeta,
  renderList,
  setupEventListeners as setupUiEventListeners, // Rename to avoid conflict
  applyTheme,
  calculateAndDisplayWeights,
  calculateAndDisplayCosts,
  updatePermitRequiredItems,
  updatePermitInfo,
} from "./ui.js";
import { setupDragAndDrop } from "./drag.js";
// Import Google Auth setup
import { setupAuthEventListeners, gapiLoaded, gisLoaded } from "./auth.js"; // Import auth functions

// Make GAPI/GIS load callbacks globally accessible
window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;

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
  setupUiEventListeners(); // Setup UI specific listeners
  setupAuthEventListeners(); // Setup Google Auth listeners
  setupDragAndDrop();

  // 5. Initialize calculators and info
  calculateAndDisplayWeights();
  calculateAndDisplayCosts();
  updatePermitRequiredItems();
  updatePermitInfo();

  // 6. Initialize Google Maps Autocomplete (if meta dialog exists)
  const metaDialog = document.getElementById("metaDialog");
  if (metaDialog) {
      // Assuming initMap is safe to call even if called multiple times or before dialog is shown
      // It might be better to trigger initMap only when the dialog is first opened if it causes issues.
      await initMap();
  } else {
      console.warn("Meta dialog not found, skipping Maps initialization.");
  }


  console.log("App Initialized");
}

// Run the initialization function when the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initializeApp();
});
