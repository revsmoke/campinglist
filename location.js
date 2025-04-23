// /Applications/ColdFusion2023/cfusion/wwwroot/campinglist/location.js
// --- Google Maps Autocomplete using PlaceAutocompleteElement ---

// Track initialization state
let placeChangeListenerInitialized = false;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 10;

/**
 * Checks if the Google Maps API is fully loaded
 * @returns {boolean} True if API is available
 */
function isGoogleMapsAvailable() {
  return (
    typeof window.google !== "undefined" &&
    typeof window.google.maps !== "undefined" &&
    typeof window.google.maps.places !== "undefined"
  );
}

/**
 * Fixes data binding issues by manually copying values from hidden fields to the form
 */
function syncHiddenFieldsToFormData() {
  // Get the form element
  const metaForm = document.getElementById("metaForm");
  if (!metaForm) return;

  // Get the address hidden field (only one we need to sync with autocomplete)
  const addressHiddenInput = document.getElementById(
    "destinationAddressHidden"
  );

  // Create or update form data properties to ensure they're included in form submission
  if (addressHiddenInput && addressHiddenInput.value) {
    const addressValue = addressHiddenInput.value;
    console.log(`Syncing destinationAddress: ${addressValue}`);

    // Set the autocomplete element's initial value if available
    const autocompleteElement = document.getElementById(
      "destinationAutocompleteElement"
    );
    if (autocompleteElement) {
      autocompleteElement.setAttribute("data-initial-value", addressValue);
      console.log(`Set autocomplete initial value: ${addressValue}`);
    }
  }
}

// Export the function to be used by other modules
export function initMap() {
  console.log(
    `Initializing Google Maps Autocomplete (attempt ${++initAttempts})...`
  );

  // Check if Google Maps API is loaded
  if (!isGoogleMapsAvailable()) {
    console.warn(
      "Google Maps API not fully loaded yet, initialization deferred"
    );
    // We'll rely on the callback to initialize when ready
    return;
  }

  // Function to set up the event listener on the autocomplete element
  function setupPlaceChangeListener() {
    // Get the new Web Component element
    const autocompleteElement = document.getElementById(
      "destinationAutocompleteElement"
    );
    // Get references to the hidden input fields
    const addressHiddenInput = document.getElementById(
      "destinationAddressHidden"
    );
    const placeIdHiddenInput = document.getElementById(
      "destinationPlaceIdHidden"
    );
    const latHiddenInput = document.getElementById("destinationLatHidden");
    const lngHiddenInput = document.getElementById("destinationLngHidden");

    if (!autocompleteElement) {
      console.error(
        "PlaceAutocompleteElement (#destinationAutocompleteElement) not found when initMap was called!"
      );
      return false;
    }

    if (
      !addressHiddenInput ||
      !placeIdHiddenInput ||
      !latHiddenInput ||
      !lngHiddenInput
    ) {
      console.error("One or more hidden destination input fields are missing!");
      return false;
    }

    // Check if the listener is already attached
    if (autocompleteElement.dataset.listenerAttached === "true") {
      console.log("Place change listener already attached.");
      return true;
    }

    // Check if the element is fully initialized by the Google Maps API
    // The Web Component should have child elements and shadow roots when properly initialized
    // Google Maps may need more time to initialize the web component
    if (
      !autocompleteElement.shadowRoot &&
      !autocompleteElement.children.length
    ) {
      console.log(
        "Autocomplete element not fully initialized by Google Maps API yet."
      );

      // If we've tried too many times, force setup anyway
      if (initAttempts >= MAX_INIT_ATTEMPTS) {
        console.warn(
          `Reached max initialization attempts (${MAX_INIT_ATTEMPTS}), forcing setup...`
        );
      } else {
        return false;
      }
    }

    console.log(
      "Setting up place change listener on element:",
      autocompleteElement
    );

    // Listen for the custom event fired by the component when a place is selected
    autocompleteElement.addEventListener("gmp-placechange", (event) => {
      console.log("gmp-placechange event triggered!", event);

      const place = event.detail.place; // Access place details from event.detail

      if (!place || !place.geometry || !place.geometry.location) {
        console.warn(
          "Place selected, but no geometry data available:",
          place?.name
        );
        // Clear hidden fields if the selection is invalid or cleared by user
        addressHiddenInput.value = "";
        placeIdHiddenInput.value = "";
        latHiddenInput.value = "";
        lngHiddenInput.value = "";
        return;
      }

      // --- Process the selected place ---
      console.log("Place selected via PlaceAutocompleteElement:", place);

      const address = place.formatted_address || "";
      const placeId = place.place_id || "";
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Populate the hidden input fields for form submission
      addressHiddenInput.value = address;
      placeIdHiddenInput.value = placeId;
      latHiddenInput.value = lat;
      lngHiddenInput.value = lng;

      // Debug: Log the values after setting them
      console.log("Hidden fields after place selection:");
      console.log("addressHiddenInput:", addressHiddenInput.value);
      console.log("placeIdHiddenInput:", placeIdHiddenInput.value);
      console.log("latHiddenInput:", latHiddenInput.value);
      console.log("lngHiddenInput:", lngHiddenInput.value);

      // Ensure form data is in sync with hidden fields
      syncHiddenFieldsToFormData();
    });

    // Mark that the listener has been attached
    autocompleteElement.dataset.listenerAttached = "true";
    placeChangeListenerInitialized = true;

    console.log("PlaceAutocompleteElement listener attached successfully.");

    // Also sync existing values
    syncHiddenFieldsToFormData();

    return true;
  }

  // Try to set up the listener immediately
  const initialized = setupPlaceChangeListener();

  // If initialization failed, set up a MutationObserver to watch for changes to the dialog
  // and try again when the dialog is fully loaded/rendered
  if (!initialized) {
    console.log("Setting up MutationObserver to watch for dialog rendering...");

    // Watch for changes in the metaDialog
    const metaDialog = document.getElementById("metaDialog");
    if (metaDialog) {
      const observer = new MutationObserver(() => {
        // Try to initialize again on DOM changes
        if (!placeChangeListenerInitialized && setupPlaceChangeListener()) {
          // If successful this time, disconnect the observer
          observer.disconnect();
        }
      });

      // Start observing
      observer.observe(metaDialog, {
        childList: true,
        subtree: true,
        attributes: true,
      });

      // Also set retry with timeout as a backup
      setTimeout(() => {
        if (!placeChangeListenerInitialized) {
          console.log("Trying initialization again after timeout");
          setupPlaceChangeListener();
        }
      }, 500);
    }

    // Also set up an event listener for when the dialog is shown
    if (metaDialog) {
      metaDialog.addEventListener("click", () => {
        if (!placeChangeListenerInitialized) {
          setupPlaceChangeListener();
        }
      });
    }
  }
}

// Function to monitor form submission
export function setupFormSubmitSync() {
  const metaForm = document.getElementById("metaForm");
  if (metaForm) {
    metaForm.addEventListener("submit", () => {
      // Ensure all hidden fields are synced before submission
      syncHiddenFieldsToFormData();
      console.log("Form submission - Hidden fields synced");
    });
    console.log("Form submit listener attached");
  }
}

// Expose a function to manually reinitialize the place autocomplete
// This can be called when the dialog is opened
export function reinitializePlaceAutocomplete() {
  console.log("Manually reinitializing Place Autocomplete...");

  // Check if Google Maps API is loaded before attempting to reinitialize
  if (!isGoogleMapsAvailable()) {
    console.error("Cannot reinitialize - Google Maps API not fully loaded");
    return;
  }

  placeChangeListenerInitialized = false;
  initAttempts = 0; // Reset attempts counter
  initMap();
  setupFormSubmitSync();
}

// --- End Google Maps Autocomplete ---
