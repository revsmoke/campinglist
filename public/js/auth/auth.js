// auth.js — sign-in orchestration: account area UI, sign-in dialog, sessions, namespaces, linking.
import { CONFIG } from "../config.js";
import {
  getNamespace,
  switchNamespace,
  namespaceHasData,
  namespaceHasUserLists,
  copyListsBetweenNamespaces,
  deleteNamespace,
  GUEST_NS,
} from "../state.js";
import { renderAll, showErrorDialog, escapeText } from "../ui.js";
import { confirmDialog, showToast } from "../dialogs.js";
import {
  decodeJwtPayload,
  identityFromGoogleIdToken,
  upsertAccountFromIdentity,
  linkIdentityToAccount,
  findAccountsByEmail,
  getCurrentAccount,
  getAccount,
  startSession,
  endSession,
  touchSession,
  sessionExpired,
  namespaceForAccount,
  removeAccount,
} from "./accounts.js";
import {
  isGoogleSignInConfigured,
  initGoogleSignIn,
  renderGoogleButton,
  disableGoogleAutoSelect,
} from "./google-auth.js";
import {
  isMicrosoftConfigured,
  signInWithMicrosoft,
  signOutMicrosoft,
} from "./microsoft-auth.js";

const listeners = new Set();
let currentAccount = null;
let signInBusy = false;

/***************** PUBLIC API *****************/
export function onAuthChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSignedInAccount() {
  return currentAccount;
}

/** Namespace to load before the first render (valid session → account namespace). */
export function resolveInitialNamespace() {
  const account = getCurrentAccount();
  currentAccount = account;
  return account ? namespaceForAccount(account.id) : GUEST_NS;
}

export async function setupAuth() {
  renderAccountArea();
  wireDialogs();
  if (!currentAccount && sessionExpired()) {
    endSession();
    showToast(
      "Your sign-in expired after 30 days without activity. Sign in again to open your account's lists.",
      7000,
      "warning"
    );
  }
  // Sliding session: extend on activity (throttled inside touchSession).
  const touch = () => currentAccount && touchSession();
  document.addEventListener("click", touch, { passive: true });
  document.addEventListener("keydown", touch, { passive: true });
  // Re-check validity periodically (e.g. tab left open for weeks).
  setInterval(
    () => {
      if (currentAccount && !getCurrentAccount()) handleSessionExpired();
    },
    5 * 60 * 1000
  );
}

export async function openSignInDialog() {
  const dlg = document.getElementById("signInDialog");
  if (!dlg) return;
  const status = document.getElementById("signInStatus");
  const googleSlot = document.getElementById("googleSignInSlot");
  const msSlot = document.getElementById("microsoftSignInSlot");
  if (msSlot) msSlot.hidden = !isMicrosoftConfigured();
  if (!dlg.open) dlg.showModal();
  if (googleSlot) {
    if (!isGoogleSignInConfigured()) {
      googleSlot.innerHTML = `<p class="muted small">Google sign-in is not configured on this site.</p>`;
    } else {
      googleSlot.innerHTML = `<p class="muted small">Loading Google sign-in…</p>`;
      try {
        await initGoogleSignIn({
          onCredential: handleGoogleCredential,
          onError: reportSignInError,
        });
        renderGoogleButton(googleSlot);
        if (status) status.textContent = "";
      } catch (error) {
        console.warn("Google sign-in unavailable:", error);
        googleSlot.innerHTML = "";
        if (status)
          status.textContent =
            "Google sign-in could not load (offline, or blocked by a browser extension). You can keep using CampList without signing in.";
      }
    }
  }
}

export async function signOut({ silent = false } = {}) {
  const was = currentAccount;
  endSession();
  disableGoogleAutoSelect();
  try {
    await signOutMicrosoft();
  } catch {
    /* ignore */
  }
  currentAccount = null;
  emit("signout", { account: was });
  if (getNamespace() !== GUEST_NS) {
    await switchNamespace(GUEST_NS);
    renderAll();
  }
  renderAccountArea();
  if (!silent)
    showToast(
      "Signed out. You're now viewing the lists stored in this browser.",
      4000,
      "info"
    );
}

/***************** SIGN-IN HANDLERS *****************/
async function handleGoogleCredential(idToken) {
  try {
    const identity = identityFromGoogleIdToken(decodeJwtPayload(idToken));
    await completeSignIn(identity);
  } catch (error) {
    reportSignInError(error);
  }
}

async function handleMicrosoftSignIn() {
  if (signInBusy) return;
  signInBusy = true;
  const status = document.getElementById("signInStatus");
  if (status) status.textContent = "Opening Microsoft sign-in…";
  try {
    const identity = await signInWithMicrosoft();
    if (identity) await completeSignIn(identity);
    else if (status)
      status.textContent = "Microsoft sign-in was cancelled. Nothing was changed.";
  } catch (error) {
    reportSignInError(error);
  } finally {
    signInBusy = false;
  }
}

function reportSignInError(error) {
  console.error("Sign-in failed:", error);
  const status = document.getElementById("signInStatus");
  const message =
    error?.userMessage || error?.message || "Sign-in failed. Please try again.";
  if (status) status.textContent = message;
  else showToast(message, 6000, "error");
}

async function completeSignIn(identity) {
  const { account, created, sameEmailAccounts } = upsertAccountFromIdentity(identity);
  const ns = namespaceForAccount(account.id);
  if (
    created &&
    !namespaceHasData(ns) &&
    getNamespace() === GUEST_NS &&
    namespaceHasUserLists(GUEST_NS)
  ) {
    closeSignInDialog();
    const copy = await confirmDialog(
      "You have lists in this browser that were made without signing in. Copy them into your new account? (The originals stay available when you're signed out.)",
      {
        title: "Keep your current lists?",
        confirmText: "Copy my lists",
        cancelText: "Start fresh",
      }
    );
    if (copy) copyListsBetweenNamespaces(GUEST_NS, ns, { skipUntouchedDefault: true });
  }
  startSession(account.id, identity.provider);
  currentAccount = getAccount(account.id);
  closeSignInDialog();
  await switchNamespace(ns);
  renderAll();
  renderAccountArea();
  emit("signin", { account: currentAccount, created });
  showToast(
    `Signed in as ${currentAccount.name || currentAccount.email}.`,
    3500,
    "success"
  );
  if (sameEmailAccounts.length) {
    showToast(
      "Another CampList account on this device uses the same email. Open your account menu to link them.",
      8000,
      "info"
    );
  }
}

function handleSessionExpired() {
  const was = currentAccount;
  currentAccount = null;
  endSession();
  emit("expired", { account: was });
  switchNamespace(GUEST_NS).then(() => {
    renderAll();
    renderAccountArea();
  });
  showToast(
    "Your sign-in expired. Sign in again to keep working in your account.",
    7000,
    "warning"
  );
}

/***************** ACCOUNT AREA *****************/
export function renderAccountArea() {
  const area = document.getElementById("accountArea");
  if (!area) return;
  if (!currentAccount) {
    if (!isGoogleSignInConfigured() && !isMicrosoftConfigured()) {
      // No sign-in provider is enabled on this site: show nothing rather than a dead end.
      area.innerHTML = "";
      return;
    }
    area.innerHTML = `<button type="button" id="btnSignIn" class="secondary account-button">Sign in</button>`;
    document.getElementById("btnSignIn")?.addEventListener("click", openSignInDialog);
    return;
  }
  const a = currentAccount;
  const initials = escapeText(
    (a.givenName || a.name || a.email || "?").trim().charAt(0).toUpperCase()
  );
  const avatar = a.picture
    ? `<img class="avatar" src="${escapeText(a.picture)}" alt="" width="28" height="28" referrerpolicy="no-referrer">`
    : `<span class="avatar avatar-initials" aria-hidden="true">${initials}</span>`;
  area.innerHTML = `<button type="button" id="btnAccountMenu" class="secondary account-button" aria-haspopup="dialog" aria-label="Account menu for ${escapeText(a.name || a.email)}">
      ${avatar}<span class="account-name">${escapeText(a.givenName || a.name || a.email)}</span></button>`;
  document.getElementById("btnAccountMenu")?.addEventListener("click", openAccountDialog);
}

function providerLabel(provider) {
  return provider === "google"
    ? "Google"
    : provider === "microsoft"
      ? "Microsoft"
      : provider;
}

async function openAccountDialog() {
  const dlg = document.getElementById("accountDialog");
  const body = document.getElementById("accountDialogBody");
  if (!dlg || !body || !currentAccount) return;
  const a = getAccount(currentAccount.id) || currentAccount;
  const linkable = findAccountsByEmail(a.email).filter((o) => o.id !== a.id);
  const methods = a.identities
    .map((i) => `${providerLabel(i.provider)} (${escapeText(i.email || "no email")})`)
    .join(", ");
  body.innerHTML = `
    <p><strong>${escapeText(a.name || a.email)}</strong><br><span class="muted">${escapeText(a.email || "")}</span></p>
    <p class="small">Sign-in methods: ${methods}</p>
    <p class="small muted">Your account exists only in this browser (CampList has no server). Connect storage you control from the Storage panel to keep lists in your own cloud folder and open them elsewhere.</p>
    ${
      linkable.length
        ? `<div class="notice"><p class="small"><strong>Same email, separate account:</strong> ${linkable
            .map((o) => `${providerLabel(o.primaryProvider)} (${escapeText(o.email)})`)
            .join(", ")}. Linking merges that account's lists into this one.</p>
           <button type="button" class="secondary" id="btnLinkSameEmail">Link accounts</button></div>`
        : ""
    }
    ${
      isMicrosoftConfigured() && !a.identities.some((i) => i.provider === "microsoft")
        ? `<button type="button" class="secondary" id="btnLinkMicrosoft">Add Microsoft sign-in</button>`
        : ""
    }`;
  dlg.showModal();
  document
    .getElementById("btnLinkSameEmail")
    ?.addEventListener("click", () => linkSameEmailAccounts(a, linkable));
  document.getElementById("btnLinkMicrosoft")?.addEventListener("click", async () => {
    try {
      const identity = await signInWithMicrosoft();
      if (!identity) return;
      if (!identity.emailVerified) {
        showErrorDialog(
          "That Microsoft account's email address isn't verified by Microsoft, so it can't be linked. You can still sign in with it separately."
        );
        return;
      }
      const existing = findAccountsByEmail(identity.email).find((o) =>
        o.identities.some(
          (i) => i.provider === "microsoft" && i.providerId === identity.providerId
        )
      );
      linkIdentityToAccount(a.id, identity, { absorbAccountId: existing?.id || null });
      if (existing) mergeNamespace(existing.id, a.id);
      currentAccount = getAccount(a.id);
      dlg.close();
      showToast("Microsoft sign-in linked to this account.", 3500, "success");
    } catch (error) {
      showErrorDialog(error.userMessage || error.message);
    }
  });
}

async function linkSameEmailAccounts(target, others) {
  const dlg = document.getElementById("accountDialog");
  const ok = await confirmDialog(
    `Link ${others.map((o) => providerLabel(o.primaryProvider)).join(" and ")} sign-in to this account and move their lists here? This only affects this browser.`,
    { title: "Link accounts", confirmText: "Link accounts" }
  );
  if (!ok) return;
  try {
    for (const other of others) {
      for (const identity of other.identities) {
        if (!identity.emailVerified) continue;
        linkIdentityToAccount(target.id, identity, { absorbAccountId: other.id });
      }
      mergeNamespace(other.id, target.id);
    }
    currentAccount = getAccount(target.id);
    dlg?.close();
    await switchNamespace(namespaceForAccount(target.id));
    renderAll();
    showToast("Accounts linked.", 3000, "success");
  } catch (error) {
    showErrorDialog(error.message);
  }
}

function mergeNamespace(fromAccountId, toAccountId) {
  const from = namespaceForAccount(fromAccountId);
  const to = namespaceForAccount(toAccountId);
  // Copy everything the user made (edited lists, template lists, new lists) before the
  // source namespace is removed; only the untouched auto-created default is left behind.
  copyListsBetweenNamespaces(from, to, { skipUntouchedDefault: true });
  deleteNamespace(from);
  removeAccount(fromAccountId);
}

/***************** DIALOG WIRING *****************/
function closeSignInDialog() {
  const dlg = document.getElementById("signInDialog");
  if (dlg?.open) dlg.close();
}

function wireDialogs() {
  document.getElementById("signInCancel")?.addEventListener("click", closeSignInDialog);
  document
    .getElementById("btnMicrosoftSignIn")
    ?.addEventListener("click", handleMicrosoftSignIn);
  document
    .getElementById("accountDialogClose")
    ?.addEventListener("click", () => document.getElementById("accountDialog")?.close());
  document.getElementById("btnSignOut")?.addEventListener("click", async () => {
    document.getElementById("accountDialog")?.close();
    await signOut();
  });
  document.getElementById("btnForgetAccount")?.addEventListener("click", async () => {
    if (!currentAccount) return;
    const a = currentAccount;
    document.getElementById("accountDialog")?.close();
    const ok = await confirmDialog(
      `Remove "${a.name || a.email}" and its lists from this browser? Copies in your own cloud storage are not touched. This cannot be undone.`,
      {
        title: "Forget this account",
        confirmText: "Remove from this browser",
        danger: true,
      }
    );
    if (!ok) return;
    await signOut({ silent: true });
    deleteNamespace(namespaceForAccount(a.id));
    removeAccount(a.id);
    showToast("Account removed from this browser.", 3500, "info");
  });
}

function emit(type, detail) {
  for (const listener of listeners) {
    try {
      listener({ type, ...detail });
    } catch (error) {
      console.error("Auth listener failed:", error);
    }
  }
}

export const _test = { completeSignIn, handleGoogleCredential };
export { CONFIG as _config };
