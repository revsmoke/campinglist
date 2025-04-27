// Secure configuration management for API keys
async function loadApiKeys() {
  try {
    const response = await fetch("keys.txt");
    if (!response.ok) {
      console.error("Failed to load API keys file");
      return { GOOGLE_MAPS_API_KEY: "" };
    }

    const text = await response.text();
    const keys = {};

    // Parse keys.txt format (KEY = "value")
    text.split("\n").forEach((line) => {
      const match = line.match(/([A-Z_]+)\s*=\s*"([^"]+)"/);
      if (match && match.length === 3) {
        keys[match[1]] = match[2];
      }
    });

    return keys;
  } catch (error) {
    console.error("Error loading API keys:", error);
    return { GOOGLE_MAPS_API_KEY: "" };
  }
}

// Function to dynamically load Google Maps API
async function loadGoogleMapsApi() {
  try {
    const keys = await loadApiKeys();
    const apiKey = keys.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      console.error(
        'Google Maps API key not found in keys.txt file. Create this file with: GOOGLE_MAPS_API_KEY = "your-api-key-here"'
      );

      // Register a function to show the error once the DOM is ready
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          showApiKeyError();
        });
      } else {
        // DOM is already ready
        setTimeout(showApiKeyError, 1000);
      }
      return;
    }

    // Create script element
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&callback=googleMapsApiLoaded`;
    script.async = true;
    script.defer = true;

    // Append to document head
    document.head.appendChild(script);
    console.log("Google Maps API script injected dynamically");
  } catch (error) {
    console.error("Failed to load Google Maps API:", error);
  }
}

function showApiKeyError() {
  // Try to find the error dialog element first
  const errorDialog = document.getElementById("errorDialog");
  const errorMessage = document.getElementById("errorMessage");

  if (errorDialog && errorMessage) {
    errorMessage.textContent =
      "Google Maps API key not found. Location features will not work correctly.";
    errorDialog.showModal();
  } else {
    // Fall back to alert if error dialog isn't available
    alert(
      "Google Maps API key not found. Location features will not work correctly."
    );
  }
}

export { loadApiKeys, loadGoogleMapsApi };
