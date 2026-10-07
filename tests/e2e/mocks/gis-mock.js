// Mock of https://accounts.google.com/gsi/client for end-to-end tests.
// Renders a plain button; clicking it returns a fake (unsigned) ID token for the configured
// client ID. The OAuth token client returns a fake access token. Behaviour can be steered via
// window.__gisMock = { cancelSignIn, tokenError, email, name, sub }.
(function () {
  const mock = (window.__gisMock = window.__gisMock || {});
  mock.events = [];
  let idConfig = null;

  function b64url(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function makeIdToken() {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: "https://accounts.google.com",
      aud: mock.aud || idConfig.client_id,
      sub: mock.sub || "100000000000000000001",
      email: mock.email || "casey@example.com",
      email_verified: mock.emailVerified !== false,
      name: mock.name || "Casey Camper",
      given_name: (mock.name || "Casey Camper").split(" ")[0],
      picture: "",
      iat: now,
      exp: now + 3600,
    };
    return `${b64url({ alg: "RS256", typ: "JWT" })}.${b64url(payload)}.signature`;
  }

  window.google = window.google || {};
  window.google.accounts = {
    id: {
      initialize(config) {
        idConfig = config;
        mock.events.push("id.initialize");
      },
      renderButton(container) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "mockGoogleButton";
        btn.textContent = "Sign in with Google (mock)";
        btn.addEventListener("click", () => {
          mock.events.push("button.click");
          if (mock.cancelSignIn) return; // user closed the popup: nothing happens
          setTimeout(
            () => idConfig.callback({ credential: makeIdToken(), select_by: "btn" }),
            50
          );
        });
        container.innerHTML = "";
        container.appendChild(btn);
      },
      prompt() {},
      disableAutoSelect() {
        mock.events.push("id.disableAutoSelect");
      },
    },
    oauth2: {
      initTokenClient(config) {
        mock.tokenConfig = config;
        return {
          requestAccessToken(overrides) {
            mock.events.push(`token.request:${(overrides && overrides.prompt) || ""}`);
            setTimeout(() => {
              if (mock.tokenError === "popup_closed") {
                config.error_callback({ type: "popup_closed" });
              } else if (mock.tokenError === "access_denied") {
                config.callback({ error: "access_denied" });
              } else {
                mock.tokenCounter = (mock.tokenCounter || 0) + 1;
                config.callback({
                  access_token: `mock-token-${mock.tokenCounter}`,
                  expires_in: mock.expiresIn || 3600,
                  scope: config.scope,
                  token_type: "Bearer",
                });
              }
            }, 30);
          },
        };
      },
      hasGrantedAllScopes() {
        return true;
      },
      revoke(token, done) {
        mock.events.push(`revoke:${token}`);
        if (done) setTimeout(done, 10);
      },
    },
  };
})();
