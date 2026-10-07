// google-drive.js — minimal Google Drive v3 client using fetch() and a caller-supplied token.
// Scope: drive.file (only files/folders this app created or the user picked are visible).

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
export const LIST_SUFFIX = ".camplist.json";
export const FILE_FIELDS =
  "id,name,mimeType,modifiedTime,size,webViewLink,iconLink,trashed,parents,appProperties,md5Checksum";

export class DriveError extends Error {
  constructor(message, { status = 0, reason = "", retryable = false } = {}) {
    super(message);
    this.name = "DriveError";
    this.status = status;
    this.reason = reason;
    this.retryable = retryable;
  }
  get unauthorized() {
    return this.status === 401;
  }
  get forbidden() {
    return this.status === 403;
  }
  get notFound() {
    return this.status === 404;
  }
}

function escapeQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class DriveClient {
  /** @param {() => string|null} getToken returns the current access token or null */
  constructor(getToken) {
    this.getToken = getToken;
  }

  async request(
    url,
    { method = "GET", query, headers = {}, body, responseType = "json" } = {}
  ) {
    const token = this.getToken();
    if (!token) throw new DriveError("Not connected to Google Drive.", { status: 401 });
    const target = new URL(url);
    if (query)
      for (const [k, v] of Object.entries(query))
        if (v !== undefined) target.searchParams.set(k, v);
    let response;
    try {
      response = await fetch(target, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...headers },
        body,
      });
    } catch (error) {
      throw new DriveError(`Network error talking to Google Drive: ${error.message}`, {
        retryable: true,
      });
    }
    if (!response.ok) {
      let message = `Google Drive request failed (${response.status}).`;
      let reason = "";
      try {
        const payload = await response.json();
        message = payload?.error?.message || message;
        reason = payload?.error?.errors?.[0]?.reason || payload?.error?.status || "";
      } catch {
        /* no body */
      }
      throw new DriveError(message, {
        status: response.status,
        reason,
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    if (response.status === 204) return null;
    if (responseType === "text") return response.text();
    if (responseType === "blob") return response.blob();
    return response.json();
  }

  /** Who the token belongs to (lets the UI say which Google account holds the files). */
  async about() {
    return this.request(`${API}/about`, {
      query: { fields: "user(emailAddress,displayName),storageQuota(limit,usage)" },
    });
  }

  async getFile(fileId, fields = FILE_FIELDS) {
    return this.request(`${API}/files/${encodeURIComponent(fileId)}`, {
      query: { fields },
    });
  }

  async list(q, { pageSize = 100, orderBy = "modifiedTime desc" } = {}) {
    const files = [];
    let pageToken;
    do {
      const page = await this.request(`${API}/files`, {
        query: {
          q,
          pageSize,
          orderBy,
          pageToken,
          fields: `nextPageToken,files(${FILE_FIELDS})`,
          spaces: "drive",
        },
      });
      files.push(...(page.files || []));
      pageToken = page.nextPageToken;
    } while (pageToken && files.length < 1000);
    return files;
  }

  async findFolderByName(name) {
    const q = `mimeType='${FOLDER_MIME}' and name='${escapeQuery(name)}' and trashed=false`;
    const folders = await this.list(q, { orderBy: "createdTime" });
    return folders[0] || null;
  }

  async createFolder(name, parentId = null) {
    const metadata = {
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    };
    return this.request(`${API}/files`, {
      method: "POST",
      query: { fields: FILE_FIELDS },
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metadata),
    });
  }

  /** Finds the app folder by name or creates it; verifies an existing id when given. */
  async ensureFolder(name, existingId = null) {
    if (existingId) {
      try {
        const folder = await this.getFile(existingId);
        if (folder && !folder.trashed && folder.mimeType === FOLDER_MIME) return folder;
      } catch (error) {
        if (!(error instanceof DriveError && error.notFound)) throw error;
      }
    }
    return (await this.findFolderByName(name)) || this.createFolder(name);
  }

  async listListFiles(folderId) {
    const q = `'${escapeQuery(folderId)}' in parents and trashed=false and name contains '${escapeQuery(LIST_SUFFIX)}'`;
    return (await this.list(q)).filter((f) => f.name.endsWith(LIST_SUFFIX));
  }

  async listOtherFiles(folderId) {
    const q = `'${escapeQuery(folderId)}' in parents and trashed=false and mimeType!='${FOLDER_MIME}'`;
    return (await this.list(q)).filter((f) => !f.name.endsWith(LIST_SUFFIX));
  }

  async downloadText(fileId) {
    return this.request(`${API}/files/${encodeURIComponent(fileId)}`, {
      query: { alt: "media" },
      responseType: "text",
    });
  }

  /** Multipart upload of a small text/JSON document (create or update). */
  async uploadText({
    fileId = null,
    name,
    parents,
    content,
    mimeType = "application/json",
    appProperties,
  }) {
    const boundary = `camplist_${Math.random().toString(36).slice(2)}`;
    const metadata = { name, mimeType, ...(appProperties ? { appProperties } : {}) };
    if (!fileId && parents) metadata.parents = parents;
    const body = new Blob(
      [
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
        content,
        `\r\n--${boundary}--`,
      ],
      { type: `multipart/related; boundary=${boundary}` }
    );
    const url = fileId
      ? `${UPLOAD}/files/${encodeURIComponent(fileId)}`
      : `${UPLOAD}/files`;
    return this.request(url, {
      method: fileId ? "PATCH" : "POST",
      query: { uploadType: "multipart", fields: FILE_FIELDS },
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  /**
   * Resumable upload for arbitrary files (any size), with optional progress callback.
   * Uses XMLHttpRequest for the data transfer so upload progress can be reported.
   */
  async uploadFile(file, { name = file.name, parents, appProperties, onProgress } = {}) {
    const token = this.getToken();
    if (!token) throw new DriveError("Not connected to Google Drive.", { status: 401 });
    const metadata = {
      name,
      mimeType: file.type || "application/octet-stream",
      parents,
      ...(appProperties ? { appProperties } : {}),
    };
    let session;
    try {
      session = await fetch(
        `${UPLOAD}/files?uploadType=resumable&fields=${encodeURIComponent(FILE_FIELDS)}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": metadata.mimeType,
            "X-Upload-Content-Length": String(file.size),
          },
          body: JSON.stringify(metadata),
        }
      );
    } catch (error) {
      throw new DriveError(`Network error starting the upload: ${error.message}`, {
        retryable: true,
      });
    }
    if (!session.ok) {
      throw new DriveError(`Could not start the upload (${session.status}).`, {
        status: session.status,
      });
    }
    const location = session.headers.get("Location");
    if (!location) throw new DriveError("Google Drive did not return an upload session.");
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", location, true);
      xhr.setRequestHeader("Content-Type", metadata.mimeType);
      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            resolve(JSON.parse(xhr.responseText));
          } catch {
            resolve({ id: null, name });
          }
        } else {
          reject(
            new DriveError(`Upload failed (${xhr.status}).`, {
              status: xhr.status,
              retryable: xhr.status >= 500,
            })
          );
        }
      };
      xhr.onerror = () =>
        reject(new DriveError("Network error during the upload.", { retryable: true }));
      xhr.send(file);
    });
  }

  /** Moves a file to the trash (never a permanent delete). */
  async trashFile(fileId) {
    return this.request(`${API}/files/${encodeURIComponent(fileId)}`, {
      method: "PATCH",
      query: { fields: "id,trashed" },
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    });
  }
}

export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
