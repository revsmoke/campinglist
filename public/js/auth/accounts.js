// accounts.js — provider-agnostic local account registry, app session and linking rules.
//
// CampList has no backend: an "account" is a record in this browser that remembers which
// identity provider (Google, Microsoft) signed in, which storage connections belong to it and
// which list collection (namespace) to show. Nothing here is a credential; cloud access tokens
// are held in memory only (see storage/*.js).

import { CONFIG } from "../config.js";

const ACCOUNTS_KEY = "campList.v2.auth.accounts";
const SESSION_KEY = "campList.v2.auth.session";
const PROVIDERS = ["google", "microsoft"];

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Could not persist ${key}:`, error);
    return false;
  }
}

function nowIso() {
  return new Date().toISOString();
}

export function accountIdFor(provider, providerId) {
  return `${provider}:${providerId}`;
}

/** Namespace used by state.js for this account's lists. */
export function namespaceForAccount(accountId) {
  return accountId.replace(/[^a-zA-Z0-9]/g, "_");
}

export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

/***************** ID TOKEN HELPERS *****************/
/** Decodes a JWT payload without verifying the signature (display/local use only). */
export function decodeJwtPayload(token) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Checks the claims of a Google ID token payload and converts it to an identity.
 * This is a sanity check for a client-only app (the signature cannot be verified here);
 * a backend would have to verify the token cryptographically before trusting it.
 */
export function identityFromGoogleIdToken(
  payload,
  { clientId = CONFIG.google.clientId, now = Date.now() } = {}
) {
  if (!payload || typeof payload !== "object") throw new Error("Empty sign-in response.");
  const issuerOk =
    payload.iss === "https://accounts.google.com" ||
    payload.iss === "accounts.google.com";
  if (!issuerOk) throw new Error("Sign-in response came from an unexpected issuer.");
  if (payload.aud !== clientId)
    throw new Error("Sign-in response was issued for a different app.");
  if (typeof payload.exp !== "number" || payload.exp * 1000 < now)
    throw new Error("Sign-in response has expired. Please try again.");
  if (typeof payload.sub !== "string" || !payload.sub)
    throw new Error("Sign-in response is missing the account id.");
  return {
    provider: "google",
    providerId: payload.sub,
    email: normalizeEmail(payload.email),
    emailVerified: payload.email_verified === true,
    name: payload.name || payload.email || "Google user",
    givenName: payload.given_name || "",
    picture: typeof payload.picture === "string" ? payload.picture : "",
    hostedDomain: payload.hd || "",
  };
}

/** Converts an MSAL account/ID-token-claims object to an identity. */
export function identityFromMicrosoftAccount(account) {
  if (!account || typeof account !== "object") throw new Error("Empty sign-in response.");
  const claims = account.idTokenClaims || {};
  const providerId = claims.oid || account.localAccountId || claims.sub;
  if (!providerId) throw new Error("Sign-in response is missing the account id.");
  const email = normalizeEmail(
    claims.email || claims.preferred_username || account.username
  );
  // Microsoft only asserts verified ownership for consumer accounts and for work accounts whose
  // tenant verified the domain (xms_edov). Treat everything else as unverified for linking.
  const verified =
    claims.xms_edov === true ||
    claims.xms_edov === "1" ||
    /^(9188040d-6c67-4c5b-b112-36a304b66dad)$/i.test(claims.tid || "");
  return {
    provider: "microsoft",
    providerId,
    email,
    emailVerified: Boolean(email) && verified,
    name: account.name || claims.name || email || "Microsoft user",
    givenName: claims.given_name || (account.name || "").split(" ")[0] || "",
    picture: "",
    hostedDomain: "",
  };
}

/***************** ACCOUNT REGISTRY *****************/
export function getAccounts() {
  const accounts = readJSON(ACCOUNTS_KEY, []);
  return Array.isArray(accounts)
    ? accounts.filter((a) => a && typeof a.id === "string")
    : [];
}

function saveAccounts(accounts) {
  return writeJSON(ACCOUNTS_KEY, accounts);
}

export function getAccount(accountId) {
  return getAccounts().find((a) => a.id === accountId) || null;
}

export function findAccountByIdentity(provider, providerId) {
  return (
    getAccounts().find((a) =>
      a.identities?.some((i) => i.provider === provider && i.providerId === providerId)
    ) || null
  );
}

export function findAccountsByEmail(email, { verifiedOnly = true } = {}) {
  const wanted = normalizeEmail(email);
  if (!wanted) return [];
  return getAccounts().filter((a) =>
    a.identities?.some(
      (i) => normalizeEmail(i.email) === wanted && (!verifiedOnly || i.emailVerified)
    )
  );
}

function identityRecord(identity) {
  return {
    provider: identity.provider,
    providerId: identity.providerId,
    email: normalizeEmail(identity.email),
    emailVerified: Boolean(identity.emailVerified),
    name: identity.name || "",
    linkedAt: nowIso(),
  };
}

/**
 * Finds or creates the account for a signed-in identity.
 * Never merges accounts silently: if other accounts share the (verified) email, they are
 * returned in `sameEmailAccounts` so the UI can offer explicit linking.
 */
export function upsertAccountFromIdentity(identity) {
  if (!PROVIDERS.includes(identity?.provider))
    throw new Error("Unsupported sign-in provider.");
  const accounts = getAccounts();
  let account = accounts.find((a) =>
    a.identities?.some(
      (i) => i.provider === identity.provider && i.providerId === identity.providerId
    )
  );
  const stamp = nowIso();
  let created = false;
  if (account) {
    const idn = account.identities.find(
      (i) => i.provider === identity.provider && i.providerId === identity.providerId
    );
    idn.email = normalizeEmail(identity.email) || idn.email;
    idn.emailVerified = Boolean(identity.emailVerified);
    idn.name = identity.name || idn.name;
    account.name = identity.name || account.name;
    account.givenName = identity.givenName || account.givenName;
    account.picture = identity.picture || account.picture;
    account.email = account.email || normalizeEmail(identity.email);
    account.lastSignInAt = stamp;
    account.lastProvider = identity.provider;
  } else {
    created = true;
    account = {
      id: accountIdFor(identity.provider, identity.providerId),
      primaryProvider: identity.provider,
      lastProvider: identity.provider,
      email: normalizeEmail(identity.email),
      name: identity.name || "",
      givenName: identity.givenName || "",
      picture: identity.picture || "",
      createdAt: stamp,
      lastSignInAt: stamp,
      identities: [identityRecord(identity)],
      storage: {},
    };
    accounts.push(account);
  }
  saveAccounts(accounts);
  const sameEmailAccounts = identity.emailVerified
    ? findAccountsByEmail(identity.email).filter((a) => a.id !== account.id)
    : [];
  return { account, created, sameEmailAccounts };
}

/**
 * Links an identity to an existing account. Rules:
 *  - the caller must be signed in to `targetAccountId` (checked by the caller via the session);
 *  - the identity's email must be verified by its provider;
 *  - the identity must not belong to another account, unless `absorbAccountId` names that
 *    account explicitly (its record is removed; the caller decides what to do with its lists).
 */
export function linkIdentityToAccount(
  targetAccountId,
  identity,
  { absorbAccountId = null } = {}
) {
  if (!identity?.emailVerified) {
    throw new Error("Only identities with a verified email address can be linked.");
  }
  const accounts = getAccounts();
  const target = accounts.find((a) => a.id === targetAccountId);
  if (!target) throw new Error("The target account no longer exists.");
  const owner = accounts.find((a) =>
    a.identities?.some(
      (i) => i.provider === identity.provider && i.providerId === identity.providerId
    )
  );
  if (owner && owner.id !== target.id) {
    if (owner.id !== absorbAccountId) {
      throw new Error(
        "That sign-in method already belongs to another CampList account on this device."
      );
    }
    accounts.splice(accounts.indexOf(owner), 1);
  }
  if (
    !target.identities.some(
      (i) => i.provider === identity.provider && i.providerId === identity.providerId
    )
  ) {
    target.identities.push(identityRecord(identity));
  }
  saveAccounts(accounts);
  return target;
}

export function unlinkIdentity(accountId, provider, providerId) {
  const accounts = getAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return false;
  if (account.identities.length <= 1)
    throw new Error("An account needs at least one sign-in method.");
  account.identities = account.identities.filter(
    (i) => !(i.provider === provider && i.providerId === providerId)
  );
  saveAccounts(accounts);
  return true;
}

export function updateAccountStorage(accountId, provider, info) {
  const accounts = getAccounts();
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return null;
  account.storage = account.storage || {};
  if (info === null) delete account.storage[provider];
  else account.storage[provider] = { ...(account.storage[provider] || {}), ...info };
  saveAccounts(accounts);
  return account.storage[provider] || null;
}

export function getAccountStorage(accountId, provider) {
  return getAccount(accountId)?.storage?.[provider] || null;
}

export function removeAccount(accountId) {
  const accounts = getAccounts().filter((a) => a.id !== accountId);
  return saveAccounts(accounts);
}

/***************** SESSION *****************/
export function getSession() {
  const session = readJSON(SESSION_KEY, null);
  if (!session || typeof session.accountId !== "string") return null;
  return session;
}

export function isSessionValid(session = getSession(), now = Date.now()) {
  if (!session) return false;
  const expires = Date.parse(session.expiresAt);
  return (
    Number.isFinite(expires) && expires > now && Boolean(getAccount(session.accountId))
  );
}

function expiryFrom(now) {
  return new Date(now + CONFIG.session.maxAgeDays * 86_400_000).toISOString();
}

export function startSession(accountId, provider, now = Date.now()) {
  const session = {
    accountId,
    provider,
    signedInAt: new Date(now).toISOString(),
    lastActiveAt: new Date(now).toISOString(),
    expiresAt: expiryFrom(now),
  };
  writeJSON(SESSION_KEY, session);
  return session;
}

/** Extends a valid session (sliding expiry). Cheap enough to call on user activity. */
export function touchSession(now = Date.now()) {
  const session = getSession();
  if (!session || !isSessionValid(session, now)) return null;
  const last = Date.parse(session.lastActiveAt) || 0;
  if (now - last < 60 * 60 * 1000) return session; // at most once an hour
  session.lastActiveAt = new Date(now).toISOString();
  session.expiresAt = expiryFrom(now);
  writeJSON(SESSION_KEY, session);
  return session;
}

export function endSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Returns the session's account when the session is valid, otherwise null (and clears an expired one). */
export function getCurrentAccount(now = Date.now()) {
  const session = getSession();
  if (!session) return null;
  if (!isSessionValid(session, now)) return null;
  return getAccount(session.accountId);
}

export function sessionExpired(now = Date.now()) {
  const session = getSession();
  return Boolean(session && !isSessionValid(session, now));
}
