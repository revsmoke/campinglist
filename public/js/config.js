// config.js — public, non-secret configuration for the CampList front end.
//
// Everything here ships to the browser, so nothing in this file is a secret:
//  - OAuth *client IDs* are public identifiers. Security comes from the authorised
//    JavaScript origins / redirect URIs configured with each provider.
//  - The Google Maps key is a browser key and MUST be restricted (HTTP referrers:
//    https://camplist.guide/*; APIs: Maps JavaScript API, Places API (New), Google Picker API).
//
// Leave an integration's identifier empty to keep that feature disabled in the UI.
// Tests and local setups may override values via `window.CAMPLIST_CONFIG` before app.js runs.

const defaults = {
  appName: "CampList",
  siteUrl: "https://camplist.guide",
  version: "2.0.0",
  contactEmail: "hello@camplist.guide",

  google: {
    // OAuth 2.0 Web client (Google Cloud Console → APIs & Services → Credentials).
    clientId: "431848192736-nmejcnj9u2h73udiomh2vece28292dol.apps.googleusercontent.com",
    // Project number (first segment of the client ID); used by the Google Picker.
    appId: "431848192736",
    // Browser key for Maps JavaScript / Places / Picker. Restrict it by referrer.
    mapsApiKey: "AIzaSyCdSdxIXIbaXoWV-V-VVHQ7HSIdFUANBY0",
    // Only files CampList creates or the user explicitly picks are visible with this scope.
    driveScope: "https://www.googleapis.com/auth/drive.file",
    driveFolderName: "CampList",
  },

  microsoft: {
    // Microsoft Entra app registration (Application (client) ID). Empty = Microsoft features hidden.
    clientId: "",
    authority: "https://login.microsoftonline.com/common",
    // SPA redirect URI registered in Entra. MSAL v5 needs a dedicated bridge page; defaults to
    // <origin>/auth/redirect.html at runtime (register exactly that URL in Entra).
    redirectUri: "",
    oneDriveScopes: ["Files.ReadWrite.AppFolder"],
  },

  session: {
    // Local app session length (sliding). Cloud tokens have their own, shorter lifetimes.
    maxAgeDays: 30,
  },

  ads: {
    // Google AdSense publisher ID (ca-pub-XXXXXXXXXXXXXXXX). Empty = no ad scripts are loaded.
    adsenseClient: "",
    // Slot IDs for the two allowed placements. Empty = that placement shows sponsor/house content.
    slots: { sidebar: "", footer: "" },
  },

  analytics: {
    // Domain configured in Plausible (cookieless analytics). Empty = no analytics script is loaded.
    plausibleDomain: "",
  },

  sponsors: {
    // JSON file with the current sponsor/house cards (see docs/MONETIZATION.md for the format).
    url: "sponsors.json",
  },

  features: {
    templates: true,
    googleSignIn: true,
    googleDrive: true,
    microsoftSignIn: false, // flipped on automatically when microsoft.clientId is set
    oneDrive: false,
  },
};

function deepMerge(base, override) {
  if (!override || typeof override !== "object") return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override)) {
    out[key] =
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === "object"
        ? deepMerge(base[key], value)
        : value;
  }
  return out;
}

const merged = deepMerge(
  defaults,
  typeof window !== "undefined" ? window.CAMPLIST_CONFIG : undefined
);
if (merged.microsoft.clientId) {
  merged.features.microsoftSignIn = true;
  merged.features.oneDrive = true;
}
if (!merged.microsoft.redirectUri && typeof location !== "undefined") {
  merged.microsoft.redirectUri = location.origin + "/auth/redirect.html";
}

export const CONFIG = Object.freeze(merged);
export default CONFIG;
