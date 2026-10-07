// google-auth.js — thin wrapper around Google Identity Services (GIS).
//
// Two separate Google interactions, kept separate on purpose:
//   1. Sign-in: the "Sign in with Google" button returns an ID token (who the user is).
//   2. Storage: an OAuth token client requests the drive.file scope only when the user
//      chooses to connect Google Drive (incremental authorisation). Access tokens live in
//      memory for about an hour and are never written to storage.
import { CONFIG } from "../config.js";

const GIS_SRC = "https://accounts.google.com/gsi/client";
let gisPromise = null;
let idInitialized = false;

export function isGoogleSignInConfigured() {
  return Boolean(CONFIG.google.clientId) && CONFIG.features.googleSignIn !== false;
}

/** Loads the GIS library on demand (no onload-callback race: we await the script ourselves). */
export function loadGis() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google.accounts);
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    const script = existing || document.createElement("script");
    const done = () => {
      if (window.google?.accounts?.id) resolve(window.google.accounts);
      else reject(new Error("Google Identity Services loaded but is unavailable."));
    };
    script.addEventListener("load", done, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("The Google sign-in library could not be loaded.")),
      { once: true }
    );
    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    setTimeout(
      () => reject(new Error("Timed out loading the Google sign-in library.")),
      15000
    );
  });
  gisPromise.catch(() => {
    gisPromise = null;
  });
  return gisPromise;
}

/**
 * Initialises the ID-token flow. `onCredential(idToken, selectBy)` is called after a
 * successful sign-in; errors are reported through `onError(Error)`.
 */
export async function initGoogleSignIn({ onCredential, onError }) {
  const accounts = await loadGis();
  if (idInitialized) return accounts;
  accounts.id.initialize({
    client_id: CONFIG.google.clientId,
    callback: (response) => {
      try {
        if (!response?.credential) throw new Error("Google did not return a credential.");
        onCredential(response.credential, response.select_by || "");
      } catch (error) {
        onError?.(error);
      }
    },
    auto_select: false,
    cancel_on_tap_outside: true,
    itp_support: true,
    ux_mode: "popup",
    context: "signin",
  });
  idInitialized = true;
  return accounts;
}

/** Renders Google's own button into `container` (the library owns its markup and a11y). */
export function renderGoogleButton(container, options = {}) {
  if (!window.google?.accounts?.id || !container) return false;
  container.innerHTML = "";
  window.google.accounts.id.renderButton(container, {
    type: "standard",
    theme: options.theme || "outline",
    size: options.size || "large",
    text: options.text || "signin_with",
    shape: "pill",
    logo_alignment: "left",
    width: options.width || 260,
  });
  return true;
}

/** Prevents automatic re-sign-in after an explicit sign-out. */
export function disableGoogleAutoSelect() {
  try {
    window.google?.accounts?.id?.disableAutoSelect?.();
  } catch (error) {
    console.warn("disableAutoSelect failed:", error);
  }
}

/**
 * Creates an OAuth token client for Google Drive. `request({ prompt, hint })` resolves with the
 * token response `{ access_token, expires_in, scope }` or rejects with an Error whose `.code`
 * is one of: popup_closed, popup_failed_to_open, access_denied, invalid_request, unknown.
 */
export async function createDriveTokenClient({ hint = "" } = {}) {
  const accounts = await loadGis();
  let pending = null;
  const settle = (fn, value) => {
    const p = pending;
    pending = null;
    if (p) fn === "resolve" ? p.resolve(value) : p.reject(value);
  };
  const toError = (code, message) => {
    const error = new Error(message);
    error.code = code;
    return error;
  };
  const client = accounts.oauth2.initTokenClient({
    client_id: CONFIG.google.clientId,
    scope: CONFIG.google.driveScope,
    include_granted_scopes: true,
    ...(hint ? { login_hint: hint } : {}),
    callback: (response) => {
      if (response?.error) {
        const code =
          response.error === "access_denied" ? "access_denied" : response.error;
        settle("reject", toError(code, describeTokenError(code)));
        return;
      }
      if (!response?.access_token) {
        settle("reject", toError("unknown", "Google did not return an access token."));
        return;
      }
      const granted = accounts.oauth2.hasGrantedAllScopes(
        response,
        CONFIG.google.driveScope
      );
      if (!granted) {
        settle(
          "reject",
          toError("access_denied", "Google Drive access was not granted.")
        );
        return;
      }
      settle("resolve", response);
    },
    error_callback: (err) => {
      const code = err?.type || "unknown";
      settle("reject", toError(code, describeTokenError(code)));
    },
  });
  return {
    request({ prompt = "" } = {}) {
      if (pending)
        return Promise.reject(
          toError("busy", "A Google authorisation window is already open.")
        );
      return new Promise((resolve, reject) => {
        pending = { resolve, reject };
        try {
          client.requestAccessToken({ prompt });
        } catch (error) {
          settle("reject", toError("unknown", error.message));
        }
      });
    },
  };
}

export function describeTokenError(code) {
  switch (code) {
    case "popup_closed":
      return "The Google window was closed before finishing. Nothing was changed.";
    case "popup_failed_to_open":
      return "The Google window was blocked. Allow pop-ups for this site and try again.";
    case "access_denied":
      return "Google Drive access was declined. You can connect it later from the Storage panel.";
    case "invalid_request":
    case "invalid_client":
      return "This site is not authorised for Google sign-in. Please contact support.";
    case "busy":
      return "A Google authorisation window is already open.";
    default:
      return "Google authorisation failed. Please try again.";
  }
}

/** Revokes an access token (also removes the grant for this app). Resolves regardless. */
export function revokeGoogleToken(accessToken) {
  return new Promise((resolve) => {
    if (!accessToken || !window.google?.accounts?.oauth2) {
      resolve(false);
      return;
    }
    try {
      window.google.accounts.oauth2.revoke(accessToken, () => resolve(true));
      setTimeout(() => resolve(false), 5000);
    } catch {
      resolve(false);
    }
  });
}
