import { describe, it, expect, beforeEach } from "vitest";
import {
  decodeJwtPayload,
  identityFromGoogleIdToken,
  identityFromMicrosoftAccount,
  upsertAccountFromIdentity,
  linkIdentityToAccount,
  findAccountsByEmail,
  startSession,
  getCurrentAccount,
  isSessionValid,
  touchSession,
  endSession,
  sessionExpired,
  namespaceForAccount,
  updateAccountStorage,
  getAccountStorage,
} from "../../public/js/auth/accounts.js";
import { CONFIG } from "../../public/js/config.js";

function makeJwt(payload) {
  const enc = (obj) => {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  return `${enc({ alg: "RS256", typ: "JWT" })}.${enc(payload)}.sig`;
}

const googlePayload = (overrides = {}) => ({
  iss: "https://accounts.google.com",
  aud: CONFIG.google.clientId,
  sub: "1234567890",
  email: "Camper@Example.com",
  email_verified: true,
  name: "Casey Camper",
  given_name: "Casey",
  picture: "https://example.com/p.png",
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...overrides,
});

describe("ID token handling", () => {
  it("decodes a JWT payload", () => {
    const payload = decodeJwtPayload(makeJwt({ sub: "x", name: "Ünïcode ✓" }));
    expect(payload).toMatchObject({ sub: "x", name: "Ünïcode ✓" });
    expect(decodeJwtPayload("garbage")).toBeNull();
    expect(decodeJwtPayload(null)).toBeNull();
  });

  it("accepts a valid Google ID token and normalises the email", () => {
    const identity = identityFromGoogleIdToken(googlePayload());
    expect(identity).toMatchObject({
      provider: "google",
      providerId: "1234567890",
      email: "camper@example.com",
      emailVerified: true,
      givenName: "Casey",
    });
  });

  it("rejects wrong issuer, audience and expired tokens", () => {
    expect(() =>
      identityFromGoogleIdToken(googlePayload({ iss: "https://evil.example" }))
    ).toThrow(/issuer/);
    expect(() => identityFromGoogleIdToken(googlePayload({ aud: "other" }))).toThrow(
      /different app/
    );
    expect(() => identityFromGoogleIdToken(googlePayload({ exp: 1 }))).toThrow(/expired/);
    expect(() => identityFromGoogleIdToken(null)).toThrow();
  });

  it("treats Microsoft emails as verified only for consumer accounts or xms_edov", () => {
    const consumer = identityFromMicrosoftAccount({
      name: "Pat",
      username: "pat@outlook.com",
      idTokenClaims: {
        oid: "o1",
        tid: "9188040d-6c67-4c5b-b112-36a304b66dad",
        email: "pat@outlook.com",
      },
    });
    expect(consumer.emailVerified).toBe(true);
    const work = identityFromMicrosoftAccount({
      name: "Pat",
      username: "pat@contoso.com",
      idTokenClaims: { oid: "o2", tid: "tenant", email: "pat@contoso.com" },
    });
    expect(work.emailVerified).toBe(false);
    const workVerified = identityFromMicrosoftAccount({
      name: "Pat",
      username: "pat@contoso.com",
      idTokenClaims: {
        oid: "o3",
        tid: "tenant",
        email: "pat@contoso.com",
        xms_edov: true,
      },
    });
    expect(workVerified.emailVerified).toBe(true);
  });
});

describe("accounts and linking", () => {
  beforeEach(() => localStorage.clear());

  it("creates an account on first sign-in and reuses it afterwards", () => {
    const first = upsertAccountFromIdentity(identityFromGoogleIdToken(googlePayload()));
    expect(first.created).toBe(true);
    expect(first.account.id).toBe("google:1234567890");
    const second = upsertAccountFromIdentity(
      identityFromGoogleIdToken(googlePayload({ name: "Casey C." }))
    );
    expect(second.created).toBe(false);
    expect(second.account.name).toBe("Casey C.");
    expect(namespaceForAccount(second.account.id)).toBe("google_1234567890");
  });

  it("never merges accounts by email automatically, but reports candidates", () => {
    upsertAccountFromIdentity(identityFromGoogleIdToken(googlePayload()));
    const ms = identityFromMicrosoftAccount({
      name: "Casey",
      username: "camper@example.com",
      idTokenClaims: {
        oid: "ms-1",
        tid: "9188040d-6c67-4c5b-b112-36a304b66dad",
        email: "camper@example.com",
      },
    });
    const result = upsertAccountFromIdentity(ms);
    expect(result.created).toBe(true);
    expect(result.account.id).toBe("microsoft:ms-1");
    expect(result.sameEmailAccounts.map((a) => a.id)).toEqual(["google:1234567890"]);
    expect(findAccountsByEmail("camper@example.com")).toHaveLength(2);
  });

  it("does not suggest linking for unverified emails", () => {
    upsertAccountFromIdentity(identityFromGoogleIdToken(googlePayload()));
    const unverified = identityFromMicrosoftAccount({
      name: "Mallory",
      username: "camper@example.com",
      idTokenClaims: { oid: "ms-2", tid: "attacker-tenant", email: "camper@example.com" },
    });
    const result = upsertAccountFromIdentity(unverified);
    expect(result.sameEmailAccounts).toHaveLength(0);
    expect(() => linkIdentityToAccount("google:1234567890", unverified)).toThrow(
      /verified/
    );
  });

  it("links a verified identity explicitly and can absorb an empty duplicate account", () => {
    const g = upsertAccountFromIdentity(
      identityFromGoogleIdToken(googlePayload())
    ).account;
    const ms = identityFromMicrosoftAccount({
      name: "Casey",
      username: "camper@example.com",
      idTokenClaims: {
        oid: "ms-1",
        tid: "9188040d-6c67-4c5b-b112-36a304b66dad",
        email: "camper@example.com",
      },
    });
    const msAccount = upsertAccountFromIdentity(ms).account;
    expect(() => linkIdentityToAccount(g.id, ms)).toThrow(/another CampList account/);
    const linked = linkIdentityToAccount(g.id, ms, { absorbAccountId: msAccount.id });
    expect(linked.identities.map((i) => i.provider)).toEqual(["google", "microsoft"]);
    expect(findAccountsByEmail("camper@example.com")).toHaveLength(1);
    // Signing in with Microsoft now resolves to the linked account.
    expect(upsertAccountFromIdentity(ms).account.id).toBe(g.id);
  });

  it("stores storage connection info per provider without tokens", () => {
    const g = upsertAccountFromIdentity(
      identityFromGoogleIdToken(googlePayload())
    ).account;
    updateAccountStorage(g.id, "google", {
      connected: true,
      folderId: "f1",
      folderName: "CampList",
    });
    expect(getAccountStorage(g.id, "google")).toMatchObject({
      connected: true,
      folderId: "f1",
    });
    updateAccountStorage(g.id, "google", null);
    expect(getAccountStorage(g.id, "google")).toBeNull();
  });
});

describe("sessions", () => {
  beforeEach(() => localStorage.clear());

  it("starts, validates, extends and ends sessions", () => {
    const g = upsertAccountFromIdentity(
      identityFromGoogleIdToken(googlePayload())
    ).account;
    const t0 = Date.parse("2026-10-07T12:00:00Z");
    const session = startSession(g.id, "google", t0);
    expect(isSessionValid(session, t0 + 1000)).toBe(true);
    expect(getCurrentAccount(t0 + 1000).id).toBe(g.id);
    const day29 = t0 + 29 * 86_400_000;
    expect(isSessionValid(session, day29)).toBe(true);
    const touched = touchSession(day29);
    expect(Date.parse(touched.expiresAt)).toBe(day29 + 30 * 86_400_000);
    expect(isSessionValid(touched, day29 + 31 * 86_400_000)).toBe(false);
    expect(sessionExpired(day29 + 31 * 86_400_000)).toBe(true);
    expect(getCurrentAccount(day29 + 31 * 86_400_000)).toBeNull();
    endSession();
    expect(sessionExpired(day29)).toBe(false);
  });

  it("invalidates a session whose account was removed", () => {
    const t0 = Date.now();
    const session = startSession("google:ghost", "google", t0);
    expect(isSessionValid(session, t0)).toBe(false);
  });
});
