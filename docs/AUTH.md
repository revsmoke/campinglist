# Sign-in, accounts and storage connections

This document explains how CampList handles identity without a backend, why direct provider
integrations were chosen over WorkOS, and exactly what has to be configured with Google and
Microsoft for production.

## 1. Model

CampList is a static site. There is no CampList server, database or session store. Consequently:

| Concept | Where it lives | Notes |
| --- | --- | --- |
| Account | `localStorage` key `campList.v2.auth.accounts` | One record per provider identity (`google:<sub>`, `microsoft:<oid>`), with optional linked identities. |
| Session | `localStorage` key `campList.v2.auth.session` | 30-day sliding expiry (`config.js → session.maxAgeDays`). Expired sessions are explained and cleared. |
| Lists | `localStorage` namespace per account (`campList.v2.<ns>.*`) | Guests use the `guest` namespace, which also mirrors the legacy `campChecklist_*` keys for rollback safety. |
| Cloud tokens | Memory (Google); per-tab `sessionStorage` (Microsoft) | Google access tokens (≈1 h) live only in memory. MSAL keeps its token cache in `sessionStorage`, which is cleared when the tab closes and purged on sign-out. Connection *metadata* (folder id, email) is stored, never credentials. |
| Files | The user's Google Drive / OneDrive | Only files CampList created (or the user picked) are visible to the app. |

Signing in and connecting storage are two separate user decisions with separate consent screens.

## 2. Google sign-in (what the code does)

* `public/js/auth/google-auth.js` loads Google Identity Services on demand (no `onload=` race: the
  live site was broken because the script's callback ran before the ES module defined it).
* The "Sign in with Google" button is rendered by Google (`renderButton`). The ID token's claims
  are checked client-side (`iss`, `aud` = our client ID, `exp`, `sub`) and used only for display
  and namespacing. A client-only app cannot verify the signature; a future backend must.
* Returning users: the local session is used; no Google call happens until it expires.
* Sign-out: `endSession()` + `google.accounts.id.disableAutoSelect()`; lists switch back to the
  guest namespace. "Forget on this device" also deletes the account's local lists.
* Error handling: library load failure, cancelled popups, wrong audience, expired tokens and
  expired sessions each produce a specific, non-blocking message (see `tests/e2e/auth.spec.js`).

## 3. Account linking rules

Implemented in `public/js/auth/accounts.js`, tested in `tests/unit/accounts.test.js`.

1. Identity key is provider + stable id (`sub` for Google, `oid` for Microsoft), never email.
2. Signing in with a new provider never merges automatically, even when the email matches.
   The user is told that another local account uses the same email and can link explicitly from
   the account menu.
3. Linking requires a verified email on both sides: the identity being linked must be
   **verified by its provider** (`email_verified` for Google; `xms_edov` or a consumer-account
   tenant for Microsoft), and the signed-in account must itself hold a verified identity for
   that email before linking is offered.
4. Linking is only offered while signed in to the target account. The absorbed account's lists
   are copied into the target first (all or nothing: a failed copy changes nothing), then every
   one of its sign-in methods is linked and its record removed. An account with a sign-in method
   whose email is unverified cannot be absorbed; the app explains this and suggests linking from
   the other side or exporting and importing the lists instead.

Because nothing exists server-side, "account takeover" would only expose an attacker's own
browser data. The rules still matter: they keep the model correct if a backend is added later.

## 4. Google Drive (user-owned storage)

* Scope: `https://www.googleapis.com/auth/drive.file` only (non-sensitive; no Google app
  verification required beyond brand verification; no 100-user cap).
* Folder: `CampList` created at the Drive root on first connect, or any folder chosen with the
  Google Picker ("Change…"). Existing files can be moved when the folder changes.
* Each list is saved as `<list name>.camplist.json` (schema v2 snapshot) with
  `appProperties { camplist: "list", listId }`. Trip files are uploaded with resumable uploads.
* Conflict protection: before every save the file's `modifiedTime` is compared with the value
  recorded at the last sync. A mismatch (edited on another device) stops auto-save and, on a
  manual save, asks whether to overwrite or load the Drive version. Nothing is ever deleted;
  Drive's version history keeps the losing copy.
* Revoked or expired access → "Reconnect" state; disconnecting revokes the grant and clears local
  sync metadata but never touches the files.

## 5. Microsoft sign-in and OneDrive (built, disabled until configured)

`public/js/auth/microsoft-auth.js` and `public/js/storage/onedrive.js` use MSAL.js v5 (vendored)
with PKCE and the Graph app folder (`Files.ReadWrite.AppFolder`, no admin consent). They are
hidden until `microsoft.clientId` is set in `public/js/config.js`.

MSAL v5 requires a dedicated redirect page because Microsoft now sends COOP headers:
`public/auth/redirect.html` (served with `Cache-Control: no-store`, no COOP; see `.replit`).

### Entra app registration (one-time, by the account owner)

1. Azure portal → Microsoft Entra ID → App registrations → **New registration**.
2. Name: `CampList`. Supported account types: **Accounts in any organizational directory and
   personal Microsoft accounts**.
3. Platform: **Single-page application**. Redirect URI: `https://camplist.guide/auth/redirect.html`
   (add `https://www.camplist.guide/auth/redirect.html` if www is served, and
   `http://localhost:8787/auth/redirect.html` for local testing).
4. API permissions (delegated): `openid`, `profile`, `email`, `Files.ReadWrite.AppFolder`.
5. Token configuration → optional claims → ID token: add `email` and `xms_edov`.
6. Copy the **Application (client) ID** into `public/js/config.js → microsoft.clientId`.

## 6. Google Cloud configuration (what is needed now)

**Status on 2026-10-07:** Google reports the client ID that was deployed
(`431848192736-…`) as `disabled_client`, and the second one found in the repo
(`419953829018-…`) as `deleted_client`. Google automatically disables and later deletes OAuth
clients that stay unused for six months, which matches a sign-in button that never worked.
Until a working client ID is configured, the Google features are switched off by the
`features.googleSignIn` / `features.googleDrive` flags; with the flags on, the button renders
but Google refuses the sign-in with "The OAuth client was disabled".

Steps (Google Cloud Console → APIs & Services):

1. **Credentials** → if client `431848192736-…` is listed as disabled, try **Enable**. If it is gone,
   **Create credentials → OAuth client ID → Web application**, name `CampList web`.
2. **Authorized JavaScript origins**: `https://camplist.guide` (and `https://www.camplist.guide`
   only if that host is added to Replit; today it has no certificate), `http://localhost:8787`
   (dev). No redirect URIs are needed (GIS popup flow).
3. **OAuth consent screen / Branding**: app name CampList, support email, logo
   (`public/images/camplist_logo_oauth.png`), privacy `https://camplist.guide/privacy.html`,
   terms `https://camplist.guide/terms.html`. **Publishing status must be "In production"**
   (Testing caps sign-ins at 100 listed test users).
4. **Enabled APIs**: Google Drive API, Google Picker API, Maps JavaScript API, Places API (New).
5. **API key** (`AIzaSyCdSd…`, used for Maps/Places/Picker): restrict to HTTP referrers
   `https://camplist.guide/*`, `https://www.camplist.guide/*`, `https://docs.google.com/*`
   (the Picker iframe) and restrict APIs to the four above. Today the key is unrestricted
   (it worked from localhost during testing).
6. Paste the client ID into `public/js/config.js → google.clientId` and, if the project number
   changed, `google.appId`; set `features.googleSignIn` and `features.googleDrive` to `true`
   (they ship as `false` so visitors never see a sign-in that cannot succeed). Redeploy.

## 7. Why direct integrations instead of WorkOS

| Criterion | WorkOS AuthKit (client-only) | Direct GIS + MSAL (chosen) |
| --- | --- | --- |
| Backend needed | No (PKCE), but production sessions need a **custom auth domain ($99/month)** so the refresh-token cookie is first-party | No |
| Cost | Free to 1M MAU + $99/month domain | $0 |
| Drive / OneDrive tokens | **Not exposed** by the client SDK; Google/Microsoft would still have to be integrated directly | Native |
| Account linking | Hosted, email-based, verified-inbox rule | Implemented locally with the same verified-email rule |
| User experience | Hosted sign-in page, then a second Google consent for Drive anyway | One provider popup for sign-in, one for storage |
| Maintenance | One vendor SDK + two provider SDKs | Two provider SDKs, both vendored/pinned |
| Privacy | Third party sees every sign-in | Nothing leaves the browser except to the provider |

WorkOS becomes attractive once CampList has a backend with server-side accounts (app-managed
storage, subscriptions): AuthKit would then replace the local account registry and add MFA,
magic links and passkeys. Until then it adds cost and a second Google consent without
removing any integration work.
