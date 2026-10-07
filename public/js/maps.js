// maps.js — lazy loader for Google Maps Places autocomplete used in the Trip Info dialog.
// The Maps script is only requested the first time the dialog opens, which avoids loading
// (and paying for) the library on every visit. The dialog works without it.
import { CONFIG } from "./config.js";

let loadPromise = null;
let authFailed = false;

function loadMapsScript() {
  if (loadPromise) return loadPromise;
  const key = CONFIG.google.mapsApiKey;
  if (!key) return Promise.reject(new Error("Google Maps API key is not configured."));
  loadPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.importLibrary) {
      resolve();
      return;
    }
    const callbackName = "__campListMapsReady";
    window[callbackName] = () => {
      delete window[callbackName];
      resolve();
    };
    // Google reports key/referrer problems through this global hook.
    window.gm_authFailure = () => {
      authFailed = true;
      reject(new Error("Google Maps rejected this site's API key."));
    };
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key,
      v: "weekly",
      libraries: "places",
      loading: "async",
      callback: callbackName,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () =>
      reject(new Error("The Google Maps script could not be loaded."));
    document.head.appendChild(script);
  });
  loadPromise.catch(() => {
    loadPromise = null; // allow a retry on the next open
  });
  return loadPromise;
}

/**
 * Mounts (once) a Place Autocomplete element inside `container` and reports selections
 * through `onPlace({ name, address, placeId, lat, lng })`. Falls back to a status message.
 */
export async function prepareDestinationSearch({ container, status, onPlace }) {
  if (!container) return false;
  container.__onPlace = onPlace;
  if (container.querySelector("gmp-place-autocomplete")) return true;
  if (authFailed) {
    setStatus(
      status,
      "Destination search is unavailable right now. Type the destination name below."
    );
    return false;
  }
  setStatus(status, "Loading destination search…");
  try {
    await loadMapsScript();
    const { PlaceAutocompleteElement } = await window.google.maps.importLibrary("places");
    if (container.querySelector("gmp-place-autocomplete")) return true;
    const element = new PlaceAutocompleteElement({});
    element.id = "destinationAutocomplete";
    element.setAttribute("aria-label", "Search for a destination");
    container.innerHTML = "";
    container.appendChild(element);
    element.addEventListener("gmp-select", async (event) => {
      try {
        const place = event.placePrediction?.toPlace?.();
        if (!place) return;
        await place.fetchFields({
          fields: ["displayName", "formattedAddress", "location", "id"],
        });
        const lat = place.location?.lat?.();
        const lng = place.location?.lng?.();
        container.__onPlace?.({
          name: place.displayName || "",
          address: place.formattedAddress || "",
          placeId: place.id || "",
          lat: Number.isFinite(lat) ? lat : "",
          lng: Number.isFinite(lng) ? lng : "",
        });
        setStatus(
          status,
          "Destination filled in from Google Maps. You can still edit the name below."
        );
      } catch (error) {
        console.error("Place selection failed:", error);
        setStatus(status, "Could not read that place. Type the destination name below.");
      }
    });
    setStatus(
      status,
      "Start typing to search Google Maps, or type a destination name below."
    );
    return true;
  } catch (error) {
    console.warn("Destination search unavailable:", error.message);
    setStatus(
      status,
      "Destination search is unavailable right now. Type the destination name below."
    );
    return false;
  }
}

function setStatus(el, text) {
  if (el) el.textContent = text;
}
