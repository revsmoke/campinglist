// /Applications/ColdFusion2023/cfusion/wwwroot/campinglist/location.js
// --- Google Maps Autocomplete using PlaceAutocompleteElement ---

// Track initialization state
let placeChangeListenerInitialized = false;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 5; // Reduced from 10

/**
 * Checks if the Google Maps API is fully loaded
 * @returns {boolean} True if API is available
 */
function isGoogleMapsAvailable() {
  const available = (
    typeof window.google !== "undefined" &&
    typeof window.google.maps !== "undefined" &&
    typeof window.google.maps.places !== "undefined"
  );
  console.log(`Google Maps API available: ${available}`);
  return available;
}

/**
 * Fixes data binding issues by manually copying values from hidden fields to the form
 */
function syncHiddenFieldsToFormData() {
  console.log("Syncing hidden fields to form data");
  // Get the form element
  const metaForm = document.getElementById("metaForm");
  if (!metaForm) {
    console.warn("metaForm not found, cannot sync hidden fields");
    return;
  }

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
  } else {
    console.log("No address value to sync or hidden input missing");
  }
}

// Function to remove existing event listener and prepare for reattachment
function cleanupExistingListener() {
  const autocompleteElement = document.getElementById(
    "destinationAutocompleteElement"
  );
  
  if (autocompleteElement) {
    // Mark as not having a listener attached
    delete autocompleteElement.dataset.listenerAttached;
    console.log("Removed existing listener data attribute");
    
    // Note: We cannot easily remove the existing event listener directly
    // since we don't have a reference to the handler function
    // Instead, we'll rely on the dataset flag to track attachment state
  }
  
  placeChangeListenerInitialized = false;
}

// Export the function to be used by other modules
export function initMap() {
  console.log(`[INIT] Initializing Google Maps Autocomplete (attempt ${++initAttempts})...`);

  // Check if Google Maps API is loaded
  if (!isGoogleMapsAvailable()) {
    console.warn(
      "[INIT] Google Maps API not fully loaded yet, initialization deferred"
    );
    // We'll rely on the callback to initialize when ready
    return;
  }

  // Function to set up the event listener on the autocomplete element
  function setupPlaceChangeListener() {
    console.log("[SETUP] Starting setupPlaceChangeListener");
    
    // Get the new Web Component element
    const autocompleteElement = document.getElementById(
      "destinationAutocompleteElement"
    );
    console.log("[SETUP] Found autocomplete element:", !!autocompleteElement);
    
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
        "[SETUP] PlaceAutocompleteElement (#destinationAutocompleteElement) not found!"
      );
      return false;
    }

    if (
      !addressHiddenInput ||
      !placeIdHiddenInput ||
      !latHiddenInput ||
      !lngHiddenInput
    ) {
      console.error("[SETUP] One or more hidden destination input fields are missing!");
      return false;
    }

    // Check if the listener is already attached
    if (autocompleteElement.dataset.listenerAttached === "true") {
      console.log("[SETUP] Place change listener already attached.");
      return true;
    }

    // Check if the element is fully initialized by the Google Maps API
    // The Web Component should have shadowRoot or children when fully initialized
    const isInitialized = autocompleteElement.shadowRoot || 
                          (autocompleteElement.children && autocompleteElement.children.length > 0);
    console.log(`[SETUP] Autocomplete element initialized: ${isInitialized}`);
    
    if (!isInitialized) {
      console.log(
        "[SETUP] Autocomplete element not fully initialized by Google Maps API yet."
      );

      // If we've tried too many times, force setup anyway
      if (initAttempts >= MAX_INIT_ATTEMPTS) {
        console.warn(
          `[SETUP] Reached max initialization attempts (${MAX_INIT_ATTEMPTS}), forcing setup...`
        );
      } else {
        return false;
      }
    }

    console.log(
      "[SETUP] Setting up place change listener on element"
    );

    // Listen for the custom event fired by the component when a place is selected
    autocompleteElement.addEventListener("gmp-placechange", (event) => {
      console.log("[EVENT] gmp-placechange FIRED!", event);

      const place = event.detail.place; // Access place details from event.detail

      if (!place || !place.geometry || !place.geometry.location) {
        console.warn(
          "[EVENT] Place selected, but no geometry data available:",
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
      console.log("[EVENT] Place selected via PlaceAutocompleteElement:", place);

      const address = place.formatted_address || "";
      const placeId = place.place_id || "";
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      // Populate the hidden input fields for form submission
      addressHiddenInput.value = address;
      placeIdHiddenInput.value = placeId;
      latHiddenInput.value = lat;
      lngHiddenInput.value = lng;
      
      // CRITICAL: Update the meta.destination field directly
      // This is the key fix to make sure the destination gets saved
      try {
        const meta = window.getMeta ? window.getMeta() : {};
        if (meta) {
          // Update in memory meta directly
          meta.destination = address;
          meta.destinationPlaceId = placeId;
          meta.destinationLat = lat;
          meta.destinationLng = lng;
          console.log("[EVENT] ✅ Updated meta object directly with address:", address);
        }
      } catch (err) {
        console.error("[EVENT] Failed to update meta directly:", err);
      }

      // Debug: Log the values after setting them
      console.log("[EVENT] Hidden fields after place selection:");
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

    console.log("[SETUP] PlaceAutocompleteElement listener attached successfully.");

    // Also sync existing values
    syncHiddenFieldsToFormData();

    return true;
  }

  // Try to set up the listener immediately
  const initialized = setupPlaceChangeListener();
  console.log(`[INIT] Initial setup ${initialized ? 'succeeded' : 'failed'}`);

  // If initialization failed, use simpler retry logic
  if (!initialized) {
    console.log("[INIT] Setting up retry mechanisms...");

    // Simple timeout retry with increasing delay
    const retryWithTimeout = (attempt = 1, maxRetries = 3) => {
      if (attempt > maxRetries || placeChangeListenerInitialized) return;
      
      const delay = 200 * attempt; // Increasing delay: 200ms, 400ms, 600ms...
      console.log(`[INIT] Scheduling retry attempt ${attempt} in ${delay}ms`);
      
      setTimeout(() => {
        if (!placeChangeListenerInitialized) {
          console.log(`[INIT] Retry attempt ${attempt}`);
          if (setupPlaceChangeListener()) {
            console.log(`[INIT] Retry attempt ${attempt} succeeded`);
          } else {
            retryWithTimeout(attempt + 1, maxRetries);
          }
        }
      }, delay);
    };
    
    // Start retry sequence
    retryWithTimeout();
  }
}

// Function to monitor form submission
export function setupFormSubmitSync() {
  const metaForm = document.getElementById("metaForm");
  if (metaForm) {
    console.log("Setting up form submit sync");
    metaForm.addEventListener("submit", () => {
      // Ensure all hidden fields are synced before submission
      syncHiddenFieldsToFormData();
      console.log("Form submission - Hidden fields synced");
    });
    console.log("Form submit listener attached");
  } else {
    console.warn("metaForm not found, cannot set up form submit sync");
  }
}

// Expose a function to manually reinitialize the place autocomplete
// This can be called when the dialog is opened
export function reinitializePlaceAutocomplete() {
  console.log("[REINIT] Manually reinitializing Place Autocomplete...");

  // Check if Google Maps API is loaded before attempting to reinitialize
  if (!isGoogleMapsAvailable()) {
    console.error("[REINIT] Cannot reinitialize - Google Maps API not fully loaded");
    return;
  }

  // Clean up existing listener state
  cleanupExistingListener();
  
  // Reset counters
  initAttempts = 0;
  
  // Add a short delay to ensure the dialog is fully rendered
  setTimeout(() => {
    console.log("[REINIT] Running initMap with delay");
    initMap();
    setupFormSubmitSync();
  }, 100);
}

// --- End Google Maps Autocomplete ---
