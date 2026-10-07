import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const gisMockSource = readFileSync(join(here, "mocks", "gis-mock.js"), "utf8");

/** Turns the Google features on (they ship disabled until the OAuth client is restored). */
export async function enableGoogleFeatures(page) {
  await page.addInitScript(() => {
    window.CAMPLIST_CONFIG = Object.assign({}, window.CAMPLIST_CONFIG, {
      features: Object.assign({}, window.CAMPLIST_CONFIG?.features, {
        googleSignIn: true,
        googleDrive: true,
      }),
    });
  });
}

/** Serves the GIS mock instead of Google's library (and enables the Google features). */
export async function mockGoogleIdentity(page, options = {}) {
  await enableGoogleFeatures(page);
  await page.addInitScript((opts) => {
    window.__gisMock = Object.assign({}, opts);
  }, options);
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: gisMockSource,
    })
  );
}

/** Makes the GIS script fail to load (offline / blocked by an extension). */
export async function blockGoogleIdentity(page) {
  await enableGoogleFeatures(page);
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.abort("failed")
  );
}

/** Blocks Google Maps so the Trip Info dialog exercises its fallback. */
export async function blockGoogleMaps(page) {
  await page.route("https://maps.googleapis.com/**", (route) => route.abort("failed"));
}

export async function signInWithMock(page) {
  await page.click("#btnSignIn");
  await page.waitForSelector("#mockGoogleButton");
  await page.click("#mockGoogleButton");
  await page.waitForSelector("#btnAccountMenu", { timeout: 10000 });
}

/**
 * In-memory Google Drive API used by the storage tests. Returns helpers to inspect the state and
 * to force the next requests to fail with a given status.
 */
export async function mockDriveApi(page, { userEmail = "casey@example.com" } = {}) {
  const state = { files: new Map(), nextId: 1, failNextWith: null, requests: [] };
  const newId = (prefix) => `${prefix}-${state.nextId++}`;
  const now = () => new Date().toISOString();
  const fileJson = (f) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    size: String(f.content ? f.content.length : 0),
    webViewLink: `https://drive.google.com/open?id=${f.id}`,
    trashed: Boolean(f.trashed),
    parents: f.parents || [],
    appProperties: f.appProperties || {},
  });

  const handler = async (route, request) => {
    const url = new URL(request.url());
    const method = request.method();
    state.requests.push(`${method} ${url.pathname}${url.search}`);
    const headers = request.headers();
    const json = (status, body) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    // Resumable-upload PUTs go to a pre-authorised session URL and carry no Authorization header.
    if (
      !url.searchParams.has("upload_id") &&
      !/^Bearer mock-token-\d+$/.test(headers.authorization || "")
    ) {
      return json(401, {
        error: {
          code: 401,
          message: "Invalid Credentials",
          errors: [{ reason: "authError" }],
        },
      });
    }
    if (state.failNextWith) {
      const status = state.failNextWith;
      state.failNextWith = null;
      return json(status, {
        error: {
          code: status,
          message: `Forced ${status}`,
          errors: [
            { reason: status === 403 ? "insufficientPermissions" : "backendError" },
          ],
        },
      });
    }
    const path = url.pathname;
    if (path === "/drive/v3/about")
      return json(200, { user: { emailAddress: userEmail, displayName: "Casey" } });
    if (path === "/drive/v3/files" && method === "GET") {
      const q = url.searchParams.get("q") || "";
      let files = Array.from(state.files.values()).filter((f) => !f.trashed);
      const parent = q.match(/'([^']+)' in parents/);
      if (parent) files = files.filter((f) => (f.parents || []).includes(parent[1]));
      const name = q.match(/name='([^']+)'/);
      if (name) files = files.filter((f) => f.name === name[1]);
      const ap = q.match(/appProperties has \{ key='([^']+)' and value='([^']+)' \}/);
      if (ap) files = files.filter((f) => f.appProperties?.[ap[1]] === ap[2]);
      const contains = q.match(/name contains '([^']+)'/);
      if (contains) files = files.filter((f) => f.name.includes(contains[1]));
      if (q.includes("mimeType='application/vnd.google-apps.folder'"))
        files = files.filter((f) => f.mimeType === "application/vnd.google-apps.folder");
      if (q.includes("mimeType!='application/vnd.google-apps.folder'"))
        files = files.filter((f) => f.mimeType !== "application/vnd.google-apps.folder");
      return json(200, { files: files.map(fileJson) });
    }
    if (path === "/drive/v3/files" && method === "POST") {
      const body = request.postDataJSON();
      const f = {
        id: newId("folder"),
        name: body.name,
        mimeType: body.mimeType,
        modifiedTime: now(),
        parents: body.parents || [],
      };
      state.files.set(f.id, f);
      return json(200, fileJson(f));
    }
    const fileMatch = path.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (fileMatch) {
      const f = state.files.get(decodeURIComponent(fileMatch[1]));
      if (!f) return json(404, { error: { code: 404, message: "File not found" } });
      if (method === "GET" && url.searchParams.get("alt") === "media") {
        return route.fulfill({
          status: 200,
          contentType: f.mimeType,
          body: f.content || "",
        });
      }
      if (method === "GET") return json(200, fileJson(f));
      if (method === "PATCH") {
        const body = request.postDataJSON() || {};
        if (body.trashed) f.trashed = true;
        if (url.searchParams.get("addParents"))
          f.parents = [url.searchParams.get("addParents")];
        return json(200, fileJson(f));
      }
    }
    const uploadMatch = path.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/);
    if (uploadMatch) {
      const uploadType = url.searchParams.get("uploadType");
      if (uploadType === "multipart") {
        if (state.uploadDelayMs)
          await new Promise((r) => setTimeout(r, state.uploadDelayMs));
        const raw = request.postDataBuffer()?.toString("utf8") || "";
        const parts = raw.split(/--camplist_[a-z0-9]+(?:--)?/).filter((p) => p.trim());
        const metaPart = parts[0] || "";
        const contentPart = parts[1] || "";
        const metadata = JSON.parse(metaPart.slice(metaPart.indexOf("{")));
        const content = contentPart.replace(/^[\s\S]*?\r\n\r\n/, "").replace(/\r\n$/, "");
        let f;
        if (uploadMatch[1]) {
          f = state.files.get(decodeURIComponent(uploadMatch[1]));
          if (!f) return json(404, { error: { code: 404, message: "File not found" } });
          f.name = metadata.name || f.name;
          f.content = content;
          f.modifiedTime = new Date(Date.now() + 1000 * state.nextId).toISOString();
          f.appProperties = metadata.appProperties || f.appProperties;
        } else {
          f = {
            id: newId("file"),
            name: metadata.name,
            mimeType: metadata.mimeType || "application/json",
            modifiedTime: now(),
            parents: metadata.parents || [],
            content,
            appProperties: metadata.appProperties || {},
          };
          state.files.set(f.id, f);
        }
        return json(200, fileJson(f));
      }
      if (uploadType === "resumable" && method === "POST") {
        const metadata = request.postDataJSON();
        const id = newId("upload");
        state.files.set(id, {
          id,
          name: metadata.name,
          mimeType: metadata.mimeType,
          modifiedTime: now(),
          parents: metadata.parents || [],
          content: "",
          pending: true,
          appProperties: metadata.appProperties || {},
        });
        return route.fulfill({
          status: 200,
          headers: {
            Location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${id}`,
            "Access-Control-Expose-Headers": "Location",
          },
          body: "",
        });
      }
      if (uploadType === "resumable" && method === "PUT") {
        const id = url.searchParams.get("upload_id");
        const f = state.files.get(id);
        if (!f)
          return json(404, { error: { code: 404, message: "Upload session not found" } });
        const buffer = request.postDataBuffer();
        f.content = buffer
          ? buffer.toString("utf8")
          : "(binary body not captured by the mock)";
        f.pending = false;
        return json(200, fileJson(f));
      }
    }
    return json(404, { error: { code: 404, message: `Unmocked ${method} ${path}` } });
  };
  await page.route("https://www.googleapis.com/**", handler);
  return {
    state,
    files: () => Array.from(state.files.values()).filter((f) => !f.trashed),
    listFiles: () =>
      Array.from(state.files.values()).filter(
        (f) => f.name.endsWith(".camplist.json") && !f.trashed
      ),
    failNextWith: (status) => {
      state.failNextWith = status;
    },
  };
}
