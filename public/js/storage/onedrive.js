// onedrive.js — OneDrive storage adapter using the Microsoft Graph "app folder"
// (Files.ReadWrite.AppFolder: the app only ever sees Apps/CampList in the user's OneDrive).
import { CONFIG } from "../config.js";
import { isMicrosoftConfigured, acquireGraphToken } from "../auth/microsoft-auth.js";
import { LIST_SUFFIX } from "./google-drive.js";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024; // conservative: use an upload session above this
const CHUNK = 10 * 1024 * 1024; // multiple of 320 KiB, as Graph requires
const ITEM_FIELDS = "id,name,size,lastModifiedDateTime,webUrl,file,folder,eTag,deleted";

export class GraphError extends Error {
  constructor(message, { status = 0, code = "" } = {}) {
    super(message);
    this.name = "GraphError";
    this.status = status;
    this.code = code;
  }
}

function normalizeItem(item) {
  return {
    id: item.id,
    name: item.name,
    mimeType: item.file?.mimeType || (item.folder ? "folder" : ""),
    modifiedTime: item.lastModifiedDateTime || item.eTag || "",
    size: Number(item.size) || 0,
    webViewLink: item.webUrl || "",
    trashed: Boolean(item.deleted),
  };
}

export function createOneDriveAdapter() {
  if (!isMicrosoftConfigured() || !CONFIG.features.oneDrive) return null;
  let token = null;
  let expiresAt = 0;
  const scopes = CONFIG.microsoft.oneDriveScopes;

  async function request(
    path,
    { method = "GET", headers = {}, body, responseType = "json", auth = true } = {}
  ) {
    const url = path.startsWith("http") ? path : `${GRAPH}${path}`;
    let response;
    try {
      response = await fetch(url, {
        method,
        headers: { ...(auth ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        body,
      });
    } catch (error) {
      throw new GraphError(`Network error talking to OneDrive: ${error.message}`);
    }
    if (!response.ok) {
      let message = `OneDrive request failed (${response.status}).`;
      let code = "";
      try {
        const payload = await response.json();
        message = payload?.error?.message || message;
        code = payload?.error?.code || "";
      } catch {
        /* no body */
      }
      throw new GraphError(message, { status: response.status, code });
    }
    if (response.status === 204) return null;
    if (responseType === "text") return response.text();
    return response.json();
  }

  async function uploadLarge(file, name, onProgress) {
    const session = await request(
      `/me/drive/special/approot:/${encodeURIComponent(name)}:/createUploadSession`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: { "@microsoft.graph.conflictBehavior": "rename", name },
        }),
      }
    );
    const uploadUrl = session.uploadUrl;
    let offset = 0;
    let last = null;
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK, file.size);
      const chunk = file.slice(offset, end);
      let response;
      try {
        response = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Range": `bytes ${offset}-${end - 1}/${file.size}`,
            "Content-Length": String(end - offset),
          },
          body: chunk,
        });
      } catch (error) {
        throw new GraphError(`Network error during the upload: ${error.message}`);
      }
      if (!response.ok)
        throw new GraphError(`Upload failed (${response.status}).`, {
          status: response.status,
        });
      last = response.status === 202 ? null : await response.json();
      offset = end;
      onProgress?.(offset / file.size);
    }
    return last;
  }

  const adapter = {
    id: "microsoft",
    name: "OneDrive",
    manageUrl: "https://account.live.com/consent/Manage",
    available: () => isMicrosoftConfigured() && CONFIG.features.oneDrive !== false,
    hasValidToken: () => Boolean(token) && Date.now() < expiresAt - 60_000,
    forgetToken() {
      token = null;
      expiresAt = 0;
    },
    async ensureToken({ interactive = true, consent = false } = {}) {
      if (adapter.hasValidToken()) return token;
      const result = await acquireGraphToken(scopes, { interactive, consent });
      if (!result) {
        if (!interactive) return null;
        throw new GraphError("Microsoft authorisation is required.", { status: 401 });
      }
      token = result.accessToken;
      expiresAt = result.expiresOn
        ? new Date(result.expiresOn).getTime()
        : Date.now() + 3600_000;
      return token;
    },
    async whoAmI() {
      try {
        const drive = await request("/me/drive?$select=id,owner");
        const user = drive?.owner?.user || {};
        return { email: user.email || "", name: user.displayName || "" };
      } catch {
        return { email: "", name: "" };
      }
    },
    async ensureFolder() {
      const root = await request("/me/drive/special/approot?$select=id,name,webUrl");
      return { id: root.id, name: root.name || "CampList", link: root.webUrl || "" };
    },
    async getFileMeta(fileId) {
      try {
        const item = await request(
          `/me/drive/items/${encodeURIComponent(fileId)}?$select=${ITEM_FIELDS}`
        );
        return item.deleted ? null : normalizeItem(item);
      } catch (error) {
        if (error instanceof GraphError && error.status === 404) return null;
        throw error;
      }
    },
    async children() {
      const items = [];
      let url = `/me/drive/special/approot/children?$select=${ITEM_FIELDS}&$top=200`;
      while (url) {
        const page = await request(url);
        items.push(...(page.value || []));
        url = page["@odata.nextLink"] || null;
      }
      return items.filter((i) => !i.folder && !i.deleted).map(normalizeItem);
    },
    async listLists() {
      return (await adapter.children()).filter((f) => f.name.endsWith(LIST_SUFFIX));
    },
    async listFiles() {
      return (await adapter.children()).filter((f) => !f.name.endsWith(LIST_SUFFIX));
    },
    async download(fileId) {
      // Graph answers GET …/content with a 302 that browsers cannot follow under CORS;
      // use the pre-authenticated download URL instead (no Authorization header).
      const item = await request(
        `/me/drive/items/${encodeURIComponent(fileId)}?$select=id,@microsoft.graph.downloadUrl`
      );
      const downloadUrl = item["@microsoft.graph.downloadUrl"];
      if (!downloadUrl) throw new GraphError("OneDrive did not provide a download link.");
      return request(downloadUrl, { auth: false, responseType: "text" });
    },
    async uploadText({ fileId, name, content }) {
      const path = fileId
        ? `/me/drive/items/${encodeURIComponent(fileId)}/content`
        : `/me/drive/special/approot:/${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=rename`;
      const item = await request(path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: content,
      });
      return normalizeItem(item);
    },
    async uploadFile(file, _folderId, onProgress) {
      if (file.size <= SIMPLE_UPLOAD_LIMIT) {
        const item = await request(
          `/me/drive/special/approot:/${encodeURIComponent(file.name)}:/content?@microsoft.graph.conflictBehavior=rename`,
          {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          }
        );
        onProgress?.(1);
        return normalizeItem(item);
      }
      const item = await uploadLarge(file, file.name, onProgress);
      return item ? normalizeItem(item) : { id: null, name: file.name };
    },
    async trash(fileId) {
      await request(`/me/drive/items/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
      });
    },
    canPickFolder: false,
    async pickFolder() {
      return null;
    },
    async moveFile() {
      /* fixed app folder */
    },
    async revoke() {
      adapter.forgetToken();
      return false; // grants are managed at manageUrl; nothing to revoke client-side
    },
    isAuthError: (error) =>
      error instanceof GraphError && (error.status === 401 || error.status === 403),
    isNotFound: (error) => error instanceof GraphError && error.status === 404,
    describeError: (error) => error?.userMessage || error?.message || "Unknown error",
  };
  return adapter;
}
