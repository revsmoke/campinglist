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
    // OAuth 2.0 Web client (Google Cloud Console → APIs & Services → Credentials). Recreated on
    // 2026-10-07 after Google had disabled the unused original client.
    clientId: "662895092391-fp3lbispslf7ihorelbfq4fr61oc7p5l.apps.googleusercontent.com",
    // Project number (first segment of the client ID); used by the Google Picker.
    appId: "662895092391",
    // Browser key for Maps JavaScript / Places / Picker (created 2026-10-07; restricted by
    // referrer and API in Google Cloud, which is what protects it).
    mapsApiKey: "AIzaSyAynlVBTFm9z9F8L4FTMy0K2lxR11RrNZg",
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
    // Google AdSense publisher ID. Loads the AdSense script on the app page (ads.txt and the
    // google-adsense-account meta tag are in public/ as well). Empty = no ad scripts are loaded.
    adsenseClient: "ca-pub-4491650261060374",
    // Ad-unit slot IDs for the two allowed placements (AdSense display units named "Sidebar"
    // and "Footer"). Empty = that placement shows the labelled sponsor/house card instead;
    // an unfilled or blocked unit falls back to that card as well.
    slots: { sidebar: "2930956606", footer: "7181192800" },
  },

  analytics: {
    // Google Analytics 4 measurement ID. Loaded by js/analytics.js on every page; never loaded
    // for browsers that send Global Privacy Control; cookieless (Consent Mode "denied") for
    // visitors in the EEA, UK and Switzerland. Empty = the tag is not loaded.
    gaMeasurementId: "G-YBTYHE8TK0",
    // Domain configured in Plausible (cookieless analytics). Empty = no analytics script is loaded.
    plausibleDomain: "",
  },

  sponsors: {
    // JSON file with the current sponsor/house cards (see docs/MONETIZATION.md for the format).
    url: "sponsors.json",
  },

  features: {
    templates: true,
    // Google sign-in and Drive (docs/AUTH.md §6). Set both to false to hide the sign-in button
    // and the storage connections, e.g. while the OAuth client is unavailable.
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
