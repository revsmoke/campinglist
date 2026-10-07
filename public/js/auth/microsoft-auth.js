// microsoft-auth.js — Microsoft sign-in (MSAL.js v5, PKCE) and Graph token acquisition.
// Disabled until CONFIG.microsoft.clientId is set. The library is vendored (public/vendor) and
// only loaded when a Microsoft feature is used.
import { CONFIG } from "../config.js";
import { identityFromMicrosoftAccount } from "./accounts.js";

const MSAL_SRC = "vendor/msal-browser.min.js";
let msalPromise = null;
let clientPromise = null;

export function isMicrosoftConfigured() {
  return Boolean(CONFIG.microsoft.clientId) && CONFIG.features.microsoftSignIn !== false;
}

function loadMsal() {
  if (msalPromise) return msalPromise;
  msalPromise = new Promise((resolve, reject) => {
    if (window.msal?.PublicClientApplication) {
      resolve(window.msal);
      return;
    }
    const script = document.createElement("script");
    script.src = MSAL_SRC;
    script.async = true;
    script.onload = () =>
      window.msal
        ? resolve(window.msal)
        : reject(new Error("MSAL loaded but is unavailable."));
    script.onerror = () =>
      reject(new Error("The Microsoft sign-in library could not be loaded."));
    document.head.appendChild(script);
  });
  msalPromise.catch(() => {
    msalPromise = null;
  });
  return msalPromise;
}

export async function getMsalClient() {
  if (!isMicrosoftConfigured())
    throw userError("Microsoft sign-in is not configured on this site.");
  if (clientPromise) return clientPromise;
  clientPromise = (async () => {
    const msal = await loadMsal();
    const pca = new msal.PublicClientApplication({
      auth: {
        clientId: CONFIG.microsoft.clientId,
        authority: CONFIG.microsoft.authority,
        redirectUri: CONFIG.microsoft.redirectUri,
        postLogoutRedirectUri: location.origin + "/",
      },
      cache: { cacheLocation: "localStorage" },
      system: { allowPlatformBroker: false },
    });
    await pca.initialize();
    try {
      const result = await pca.handleRedirectPromise?.();
      if (result?.account) pca.setActiveAccount(result.account);
    } catch (error) {
      console.warn("MSAL redirect handling:", error);
    }
    if (!pca.getActiveAccount()) {
      const accounts = pca.getAllAccounts();
      if (accounts.length === 1) pca.setActiveAccount(accounts[0]);
    }
    return pca;
  })();
  clientPromise.catch(() => {
    clientPromise = null;
  });
  return clientPromise;
}

function userError(message, code = "microsoft_error") {
  const error = new Error(message);
  error.code = code;
  error.userMessage = message;
  return error;
}

function translateError(error) {
  const code = error?.errorCode || "";
  if (
    code === "user_cancelled" ||
    (code === "popup_window_error" && /closed/i.test(error.message || ""))
  ) {
    return null; // cancelled: not an error
  }
  if (code === "popup_window_error" || code === "empty_window_error") {
    return userError(
      "The Microsoft window was blocked. Allow pop-ups for this site and try again.",
      "popup_failed_to_open"
    );
  }
  if (code === "interaction_in_progress") {
    return userError("A Microsoft sign-in window is already open.", "busy");
  }
  if (
    code === "consent_required" ||
    code === "interaction_required" ||
    code === "login_required"
  ) {
    return userError("Microsoft needs you to sign in again to continue.", "reauth");
  }
  return userError(
    error?.message || "Microsoft sign-in failed. Please try again.",
    code || "microsoft_error"
  );
}

/** Interactive sign-in. Resolves with an identity, or null when the user cancelled. */
export async function signInWithMicrosoft() {
  const pca = await getMsalClient();
  try {
    const result = await pca.loginPopup({
      scopes: ["openid", "profile", "email"],
      prompt: "select_account",
    });
    pca.setActiveAccount(result.account);
    return identityFromMicrosoftAccount(result.account);
  } catch (error) {
    const translated = translateError(error);
    if (translated === null) return null;
    throw translated;
  }
}

/** Clears cached Microsoft tokens for this app without signing the user out of Microsoft itself. */
export async function signOutMicrosoft() {
  if (!clientPromise) return;
  const pca = await getMsalClient();
  const account = pca.getActiveAccount();
  try {
    if (typeof pca.clearCache === "function")
      await pca.clearCache(account ? { account } : undefined);
  } catch (error) {
    console.warn("MSAL clearCache failed:", error);
  }
  pca.setActiveAccount(null);
}

/**
 * Acquires a Microsoft Graph access token for the given scopes. Silent first (cache / refresh
 * token), then an interactive popup when allowed. Returns { accessToken, expiresOn } or null when
 * interaction is needed but not allowed.
 */
export async function acquireGraphToken(
  scopes,
  { interactive = true, consent = false } = {}
) {
  const pca = await getMsalClient();
  const account = pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
  const request = { scopes, account: account || undefined };
  if (account && !consent) {
    try {
      const result = await pca.acquireTokenSilent(request);
      return {
        accessToken: result.accessToken,
        expiresOn: result.expiresOn,
        account: result.account,
      };
    } catch (error) {
      const code = error?.errorCode || "";
      const needsInteraction =
        error?.name === "InteractionRequiredAuthError" ||
        /interaction|consent|login|monitor_window_timeout|no_account/i.test(code);
      if (!needsInteraction) throw translateError(error);
      if (!interactive) return null;
    }
  } else if (!interactive) {
    return null;
  }
  try {
    const result = await pca.acquireTokenPopup({
      ...request,
      prompt: consent ? "consent" : undefined,
    });
    if (result.account) pca.setActiveAccount(result.account);
    return {
      accessToken: result.accessToken,
      expiresOn: result.expiresOn,
      account: result.account,
    };
  } catch (error) {
    const translated = translateError(error);
    if (translated === null)
      throw userError(
        "The Microsoft window was closed before finishing. Nothing was changed.",
        "popup_closed"
      );
    throw translated;
  }
}

export function getMicrosoftAccountEmail() {
  if (!clientPromise || !window.msal) return "";
  return "";
}
