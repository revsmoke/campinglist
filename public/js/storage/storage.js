// storage.js — user-owned cloud storage: connect/disconnect, app folder, save/load lists,
// trip files, conflict protection and a status line. Provider-specific calls live in adapters
// (Google Drive below, OneDrive in onedrive.js); tokens are kept in memory only.
import { CONFIG } from "../config.js";
import {
  getActiveList,
  getLists,
  getListSnapshot,
  getContentDigest,
  digestOfSnapshot,
  getListSync,
  setListSync,
  createList,
  switchList,
  replaceActiveListContent,
  parseImportedList,
  onStateChange,
} from "../state.js";
import { confirmDialog, showToast } from "../dialogs.js";
import { renderAll, showErrorDialog, escapeText } from "../ui.js";
import {
  getCurrentAccount,
  updateAccountStorage,
  getAccountStorage,
} from "../auth/accounts.js";
import { onAuthChange, openSignInDialog } from "../auth/auth.js";
import { createDriveTokenClient, revokeGoogleToken } from "../auth/google-auth.js";
import { DriveClient, DriveError, LIST_SUFFIX } from "./google-drive.js";
import { pickDriveFolder } from "./google-picker.js";
import { createOneDriveAdapter } from "./onedrive.js";

const AUTOSYNC_KEY = "campList.v2.storage.autosync";
const AUTOSAVE_DELAY = 2500;

/***************** GOOGLE DRIVE ADAPTER *****************/
// 403 reasons that are not about permissions: show them instead of asking to reconnect.
const NON_AUTH_403 = new Set([
  "storageQuotaExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "dailyLimitExceeded",
  "sharingRateLimitExceeded",
  "numChildrenInNonRootLimitExceeded",
]);
function createGoogleAdapter() {
  let token = null;
  let expiresAt = 0;
  let tokenClient = null;
  const client = new DriveClient(() => (token && Date.now() < expiresAt ? token : null));

  const adapter = {
    id: "google",
    name: "Google Drive",
    manageUrl: "https://myaccount.google.com/permissions",
    available: () =>
      Boolean(CONFIG.google.clientId) && CONFIG.features.googleDrive !== false,
    hasValidToken: () => Boolean(token) && Date.now() < expiresAt - 60_000,
    forgetToken() {
      token = null;
      expiresAt = 0;
    },
    async ensureToken({ interactive = true, consent = false, hint = "" } = {}) {
      if (adapter.hasValidToken()) return token;
      if (!interactive) return null;
      if (!tokenClient) tokenClient = await createDriveTokenClient({ hint });
      const response = await tokenClient.request({ prompt: consent ? "consent" : "" });
      token = response.access_token;
      expiresAt = Date.now() + (Number(response.expires_in) || 3600) * 1000;
      return token;
    },
    async whoAmI() {
      try {
        const about = await client.about();
        return {
          email: about?.user?.emailAddress || "",
          name: about?.user?.displayName || "",
        };
      } catch (error) {
        if (error instanceof DriveError && (error.unauthorized || error.forbidden))
          throw error;
        return { email: "", name: "" };
      }
    },
    async ensureFolder(existingId) {
      const folder = await client.ensureFolder(CONFIG.google.driveFolderName, existingId);
      return { id: folder.id, name: folder.name, link: folder.webViewLink || "" };
    },
    async getFileMeta(fileId) {
      try {
        const f = await client.getFile(fileId);
        return f.trashed ? null : normalizeFile(f);
      } catch (error) {
        if (error instanceof DriveError && error.notFound) return null;
        throw error;
      }
    },
    async listLists(folderId) {
      return (await client.listListFiles(folderId)).map(normalizeFile);
    },
    async listFiles(folderId) {
      return (await client.listOtherFiles(folderId)).map(normalizeFile);
    },
    async download(fileId) {
      return client.downloadText(fileId);
    },
    async uploadText({ fileId, folderId, name, content, listId }) {
      const f = await client.uploadText({
        fileId,
        name,
        parents: fileId ? undefined : [folderId],
        content,
        appProperties: { camplist: "list", listId: String(listId).slice(0, 60) },
      });
      return normalizeFile(f);
    },
    async uploadFile(file, folderId, onProgress) {
      return normalizeFile(
        await client.uploadFile(file, {
          parents: [folderId],
          appProperties: { camplist: "file" },
          onProgress,
        })
      );
    },
    async trash(fileId) {
      await client.trashFile(fileId);
    },
    canPickFolder: true,
    async pickFolder() {
      const t = await adapter.ensureToken({ interactive: true });
      const picked = await pickDriveFolder(t);
      return picked ? { id: picked.id, name: picked.name, link: picked.url || "" } : null;
    },
    async moveFile(fileId, fromFolderId, toFolderId) {
      await client.request(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
        {
          method: "PATCH",
          query: {
            addParents: toFolderId,
            removeParents: fromFolderId,
            fields: "id,parents",
          },
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }
      );
    },
    async revoke() {
      const ok = await revokeGoogleToken(token);
      adapter.forgetToken();
      tokenClient = null;
      return ok;
    },
    isAuthError: (error) =>
      error instanceof DriveError &&
      (error.unauthorized || (error.forbidden && !NON_AUTH_403.has(error.reason))),
    isNotFound: (error) => error instanceof DriveError && error.notFound,
    describeError: (error) =>
      error instanceof DriveError ? error.message : error?.message || "Unknown error",
  };
  return adapter;
}

function normalizeFile(f) {
  return {
    id: f.id,
    name: f.name,
    mimeType: f.mimeType || "",
    modifiedTime: f.modifiedTime || "",
    size: f.size ? Number(f.size) : 0,
    webViewLink: f.webViewLink || "",
    trashed: Boolean(f.trashed),
  };
}

/***************** REGISTRY & STATE *****************/
const adapters = {};
const status = {}; // providerId -> { state, message, at }
let autosaveTimer = null;
let autosync = true;
let busyProvider = null;
let resaveRequested = false;

function listAdapters() {
  return Object.values(adapters).filter((a) => a.available());
}

function connection(providerId, account = getCurrentAccount()) {
  if (!account) return null;
  const info = getAccountStorage(account.id, providerId);
  return info?.connected ? info : null;
}

function connectedAdapters() {
  return listAdapters().filter((a) => connection(a.id));
}

function setStatus(providerId, state, message = "") {
  status[providerId] = { state, message, at: Date.now() };
  renderStoragePanel();
}

function safeFileName(name) {
  return (
    String(name || "camplist")
      .replace(/[\\/:*?"<>|]/g, "-")
      .trim()
      .slice(0, 80) || "camplist"
  );
}

function relativeTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, Date.now() - t);
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function formatDateTime(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? new Date(t).toLocaleString() : iso;
}

/***************** CORE FLOWS *****************/
async function withAuthRetry(adapter, operation, { interactive = true } = {}) {
  try {
    return await operation();
  } catch (error) {
    if (!adapter.isAuthError(error)) throw error;
    adapter.forgetToken();
    const account = getCurrentAccount();
    if (account) updateAccountStorage(account.id, adapter.id, { needsReauth: true });
    if (!interactive) throw error;
    // One re-authorisation attempt, then retry the operation once.
    await adapter.ensureToken({
      interactive: true,
      consent: error.status === 403,
      hint: hintFor(account),
    });
    const result = await operation();
    if (account) updateAccountStorage(account.id, adapter.id, { needsReauth: false });
    return result;
  }
}

function hintFor(account) {
  return account?.identities?.find((i) => i.provider === "google")?.email || "";
}

async function connect(providerId) {
  const adapter = adapters[providerId];
  const account = getCurrentAccount();
  if (!adapter || !account) {
    openSignInDialog();
    return;
  }
  if (busyProvider) return;
  busyProvider = providerId;
  setStatus(providerId, "working", "Waiting for authorisation…");
  try {
    const existing = getAccountStorage(account.id, providerId);
    await adapter.ensureToken({
      interactive: true,
      consent: !existing?.connected,
      hint: hintFor(account),
    });
    const who = await adapter.whoAmI();
    const folder = await adapter.ensureFolder(existing?.folderId || null);
    updateAccountStorage(account.id, providerId, {
      connected: true,
      needsReauth: false,
      email: who.email,
      folderId: folder.id,
      folderName: folder.name,
      folderLink: folder.link,
      connectedAt: new Date().toISOString(),
    });
    setStatus(providerId, "idle", "");
    showToast(
      `${adapter.name} connected. Lists are saved to the "${folder.name}" folder.`,
      4000,
      "success"
    );
    if (
      who.email &&
      account.email &&
      who.email.toLowerCase() !== account.email.toLowerCase()
    ) {
      showToast(
        `Note: the connected ${adapter.name} belongs to ${who.email}, not ${account.email}.`,
        8000,
        "warning"
      );
    }
    // The connect step is done; release the busy flag so the first save can run.
    busyProvider = null;
    await saveActiveList(providerId, { interactive: true, silent: true });
  } catch (error) {
    reportError(adapter, error, "connect");
  } finally {
    busyProvider = null;
    renderStoragePanel();
  }
}

async function disconnect(providerId) {
  const adapter = adapters[providerId];
  const account = getCurrentAccount();
  if (!adapter || !account) return;
  const ok = await confirmDialog(
    `Disconnect ${adapter.name}? Your files stay in your ${adapter.name} folder; CampList just stops saving there. Lists remain in this browser.`,
    { title: `Disconnect ${adapter.name}`, confirmText: "Disconnect" }
  );
  if (!ok) return;
  try {
    await adapter.revoke();
  } catch (error) {
    console.warn("Revoke failed:", error);
  }
  updateAccountStorage(account.id, providerId, null);
  for (const list of getLists()) setListSync(list.id, providerId, null);
  status[providerId] = null;
  renderStoragePanel();
  showToast(
    `${adapter.name} disconnected. You can also review app access at ${adapter.manageUrl}.`,
    6000,
    "info"
  );
}

/**
 * Saves the active list to a provider. Returns "saved" | "conflict" | "skipped" | "error".
 * Silent mode never opens dialogs or popups (used for auto-save).
 */
async function saveActiveList(providerId, { interactive = true, silent = false } = {}) {
  const adapter = adapters[providerId];
  const account = getCurrentAccount();
  const conn = connection(providerId, account);
  const list = getActiveList();
  if (!adapter || !conn || !list) return "skipped";
  if (busyProvider) {
    // Never overlap two saves of the same device: the older upload could finish last.
    // A silent save that arrives while one is running is retried once this one completes.
    if (silent) resaveRequested = true;
    return "skipped";
  }
  if (!adapter.hasValidToken() && !interactive) {
    setStatus(
      providerId,
      "unsaved",
      "Unsaved changes. Click Save to re-authorise and save."
    );
    return "skipped";
  }
  busyProvider = providerId;
  setStatus(providerId, "working", "Saving…");
  try {
    const result = await withAuthRetry(
      adapter,
      async () => {
        await adapter.ensureToken({ interactive, hint: hintFor(account) });
        const folder = await adapter.ensureFolder(conn.folderId);
        if (folder.id !== conn.folderId) {
          updateAccountStorage(account.id, providerId, {
            folderId: folder.id,
            folderName: folder.name,
            folderLink: folder.link,
          });
        }
        const sync = getListSync(list.id, providerId);
        const remote = sync?.fileId ? await adapter.getFileMeta(sync.fileId) : null;
        if (remote && sync?.modifiedTime && remote.modifiedTime !== sync.modifiedTime) {
          if (silent) return "conflict";
          const choice = await conflictDialog(adapter, remote, list);
          if (choice === "cancel") return "skipped";
          if (choice === "load") {
            await loadRemoteList(providerId, remote, { replaceListId: list.id });
            return "saved";
          }
        }
        const snapshot = getListSnapshot(list.id);
        const content = JSON.stringify(snapshot, null, 2);
        // Digest of what is actually uploaded; edits made during the upload must not
        // count as saved (they trigger another save below).
        const uploadedDigest = digestOfSnapshot(snapshot);
        const name = `${safeFileName(list.name)}${LIST_SUFFIX}`;
        const file = await adapter.uploadText({
          fileId: remote?.id || null,
          folderId: folder.id,
          name,
          content,
          listId: list.id,
        });
        setListSync(list.id, providerId, {
          fileId: file.id,
          fileName: file.name,
          modifiedTime: file.modifiedTime,
          webViewLink: file.webViewLink,
          digest: uploadedDigest,
          savedAt: new Date().toISOString(),
        });
        if (getContentDigest(list.id) !== uploadedDigest) resaveRequested = true;
        return "saved";
      },
      { interactive }
    );
    if (result === "conflict") {
      setStatus(
        providerId,
        "conflict",
        `The copy in ${adapter.name} changed since this device last saved it.`
      );
    } else if (result === "saved") {
      setStatus(providerId, "saved", "");
      if (!silent) showToast(`Saved to ${adapter.name}.`, 2500, "success");
    } else {
      renderStoragePanel();
    }
    return result;
  } catch (error) {
    reportError(adapter, error, "save", { silent });
    return "error";
  } finally {
    busyProvider = null;
    if (resaveRequested) {
      resaveRequested = false;
      scheduleAutosave();
    }
  }
}

async function conflictDialog(adapter, remote, list) {
  const dlg = document.createElement("dialog");
  dlg.className = "app-dialog";
  dlg.setAttribute("aria-labelledby", "conflictTitle");
  dlg.innerHTML = `
    <h3 id="conflictTitle">This list changed in ${escapeText(adapter.name)}</h3>
    <p>"${escapeText(list.name)}" was modified in ${escapeText(adapter.name)} on ${escapeText(formatDateTime(remote.modifiedTime))}, after this device last saved it (perhaps from another device).</p>
    <p class="small muted">Choose which version to keep. Nothing is deleted: the other version can still be recovered from ${escapeText(adapter.name)}'s version history.</p>
    <menu>
      <button type="button" class="secondary" value="cancel">Cancel</button>
      <button type="button" class="secondary" value="load">Use the ${escapeText(adapter.name)} version here</button>
      <button type="button" class="danger" value="overwrite">Overwrite ${escapeText(adapter.name)} with this device's version</button>
    </menu>`;
  document.body.appendChild(dlg);
  return new Promise((resolve) => {
    dlg.addEventListener("click", (e) => {
      const btn = e.target.closest("button[value]");
      if (btn) {
        dlg.close(btn.value);
      }
    });
    dlg.addEventListener("close", () => {
      const value = dlg.returnValue || "cancel";
      dlg.remove();
      resolve(value);
    });
    dlg.showModal();
  });
}

async function loadRemoteList(providerId, remote, { replaceListId = null } = {}) {
  const adapter = adapters[providerId];
  const text = await adapter.download(remote.id);
  const parsed = parseImportedList(text);
  const sync = {
    fileId: remote.id,
    fileName: remote.name,
    modifiedTime: remote.modifiedTime,
    webViewLink: remote.webViewLink,
    savedAt: new Date().toISOString(),
  };
  const existing = replaceListId
    ? getLists().find((l) => l.id === replaceListId)
    : getLists().find((l) => getListSync(l.id, providerId)?.fileId === remote.id);
  if (existing) {
    if (!replaceListId) {
      const ok = await confirmDialog(
        `"${existing.name}" on this device is linked to this file. Replace the local copy with the ${adapter.name} version? (You can undo.)`,
        { title: "Replace local copy?", confirmText: "Replace" }
      );
      if (!ok) return null;
    }
    switchList(existing.id);
    replaceActiveListContent(parsed);
    setListSync(existing.id, providerId, {
      ...sync,
      digest: getContentDigest(existing.id),
    });
    renderAll();
    return existing;
  }
  const record = createList({
    name: parsed.name,
    data: parsed.data,
    meta: parsed.meta,
    collapsed: parsed.collapsed,
    source: { type: providerId, fileId: remote.id, loadedAt: new Date().toISOString() },
  });
  if (!record) throw new Error("Could not store the loaded list.");
  setListSync(record.id, providerId, { ...sync, digest: getContentDigest(record.id) });
  renderAll();
  return record;
}

async function openFromProvider(providerId) {
  const adapter = adapters[providerId];
  const account = getCurrentAccount();
  const conn = connection(providerId, account);
  if (!adapter || !conn) return;
  setStatus(providerId, "working", `Reading your ${adapter.name} folder…`);
  try {
    const files = await withAuthRetry(adapter, async () => {
      await adapter.ensureToken({ interactive: true, hint: hintFor(account) });
      return adapter.listLists(conn.folderId);
    });
    setStatus(providerId, "idle", "");
    if (files.length === 0) {
      showToast(
        `No CampList files found in your ${adapter.name} folder "${conn.folderName}" yet.`,
        4000,
        "info"
      );
      return;
    }
    const chosen = await pickFromList(
      `Open a list from ${adapter.name}`,
      files.map((f) => ({
        id: f.id,
        title: f.name.replace(LIST_SUFFIX, ""),
        subtitle: `Modified ${formatDateTime(f.modifiedTime)}`,
        linkedLocally: getLists().some(
          (l) => getListSync(l.id, providerId)?.fileId === f.id
        ),
      }))
    );
    if (!chosen) return;
    const remote = files.find((f) => f.id === chosen);
    setStatus(providerId, "working", "Loading…");
    await withAuthRetry(adapter, () => loadRemoteList(providerId, remote));
    setStatus(providerId, "saved", "");
    showToast(
      `Opened "${remote.name.replace(LIST_SUFFIX, "")}" from ${adapter.name}.`,
      3000,
      "success"
    );
  } catch (error) {
    reportError(adapter, error, "open");
  }
}

function pickFromList(title, rows) {
  const dlg = document.createElement("dialog");
  dlg.className = "app-dialog";
  dlg.setAttribute("aria-labelledby", "pickTitle");
  dlg.innerHTML = `<h3 id="pickTitle">${escapeText(title)}</h3>
    <ul class="pick-list">${rows
      .map(
        (r) => `<li><button type="button" class="pick-row" value="${escapeText(r.id)}">
          <span class="pick-title">${escapeText(r.title)}</span>
          <span class="muted small">${escapeText(r.subtitle)}${r.linkedLocally ? " · already on this device" : ""}</span></button></li>`
      )
      .join("")}</ul>
    <menu><button type="button" class="secondary" value="cancel">Cancel</button></menu>`;
  document.body.appendChild(dlg);
  return new Promise((resolve) => {
    dlg.addEventListener("click", (e) => {
      const btn = e.target.closest("button[value]");
      if (btn) dlg.close(btn.value);
    });
    dlg.addEventListener("close", () => {
      const v = dlg.returnValue;
      dlg.remove();
      resolve(v && v !== "cancel" ? v : null);
    });
    dlg.showModal();
  });
}

/***************** TRIP FILES *****************/
async function openFilesDialog(providerId) {
  const adapter = adapters[providerId];
  const account = getCurrentAccount();
  const conn = connection(providerId, account);
  if (!adapter || !conn) return;
  const dlg = document.createElement("dialog");
  dlg.className = "app-dialog files-dialog";
  dlg.setAttribute("aria-labelledby", "filesTitle");
  dlg.innerHTML = `<h3 id="filesTitle">Trip files in ${escapeText(adapter.name)}</h3>
    <p class="small muted">Permits, maps, reservations, photos… Files are uploaded straight from your device to your "${escapeText(conn.folderName)}" folder. CampList never keeps a copy.</p>
    <div id="filesList" class="files-list" aria-live="polite">Loading…</div>
    <div class="upload-row">
      <label class="button-like secondary"><input type="file" id="filesInput" multiple hidden> Upload files…</label>
      <progress id="filesProgress" max="100" value="0" hidden></progress>
    </div>
    <menu><button type="button" class="secondary" value="close">Close</button></menu>`;
  document.body.appendChild(dlg);
  dlg.addEventListener("close", () => dlg.remove());
  dlg.querySelector('button[value="close"]').addEventListener("click", () => dlg.close());
  dlg.showModal();
  const listEl = dlg.querySelector("#filesList");
  const progress = dlg.querySelector("#filesProgress");

  const refresh = async () => {
    try {
      const files = await withAuthRetry(adapter, async () => {
        await adapter.ensureToken({ interactive: true, hint: hintFor(account) });
        return adapter.listFiles(conn.folderId);
      });
      if (files.length === 0) {
        listEl.innerHTML = `<p class="muted small">No files yet.</p>`;
        return;
      }
      listEl.innerHTML = `<ul class="pick-list">${files
        .map(
          (f) => `<li class="file-row">
            <span class="pick-title">${escapeText(f.name)}</span>
            <span class="muted small">${escapeText(formatSize(f.size))} · ${escapeText(formatDateTime(f.modifiedTime))}</span>
            <span class="file-actions">
              ${f.webViewLink ? `<a href="${escapeText(f.webViewLink)}" target="_blank" rel="noopener noreferrer">Open</a>` : ""}
              <button type="button" class="link-button danger-text" data-trash="${escapeText(f.id)}" data-name="${escapeText(f.name)}">Remove</button>
            </span></li>`
        )
        .join("")}</ul>`;
    } catch (error) {
      listEl.innerHTML = `<p class="error-text">${escapeText(adapter.describeError(error))}</p>`;
    }
  };
  await refresh();

  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-trash]");
    if (!btn) return;
    const ok = await confirmDialog(
      `Move "${btn.dataset.name}" to the ${adapter.name} trash? You can restore it from there.`,
      {
        title: "Remove file",
        confirmText: "Move to trash",
        danger: true,
      }
    );
    if (!ok) return;
    try {
      await withAuthRetry(adapter, () => adapter.trash(btn.dataset.trash));
      showToast("File moved to trash.", 2500, "info");
      await refresh();
    } catch (error) {
      showErrorDialog(adapter.describeError(error));
    }
  });

  dlg.querySelector("#filesInput").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    progress.hidden = false;
    let done = 0;
    for (const file of files) {
      try {
        await withAuthRetry(adapter, () =>
          adapter.uploadFile(file, conn.folderId, (ratio) => {
            progress.value = Math.round(((done + ratio) / files.length) * 100);
          })
        );
        done++;
        showToast(`Uploaded ${file.name}.`, 2000, "success");
      } catch (error) {
        showErrorDialog(`Could not upload ${file.name}: ${adapter.describeError(error)}`);
      }
    }
    progress.hidden = true;
    progress.value = 0;
    e.target.value = "";
    await refresh();
  });
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/***************** FOLDER *****************/
async function changeFolder(providerId) {
  const adapter = adapters[providerId];
  const account = getCurrentAccount();
  const conn = connection(providerId, account);
  if (!adapter?.canPickFolder || !conn) return;
  try {
    const picked = await withAuthRetry(adapter, () => adapter.pickFolder());
    if (!picked || picked.id === conn.folderId) return;
    const linked = getLists().filter((l) => getListSync(l.id, providerId)?.fileId);
    let move = false;
    if (linked.length) {
      move = await confirmDialog(
        `Move the ${linked.length} CampList file${linked.length === 1 ? "" : "s"} already saved in "${conn.folderName}" to "${picked.name}"?`,
        {
          title: "Move existing files?",
          confirmText: "Move files",
          cancelText: "Leave them",
        }
      );
    }
    if (move) {
      for (const list of linked) {
        const sync = getListSync(list.id, providerId);
        try {
          await withAuthRetry(adapter, () =>
            adapter.moveFile(sync.fileId, conn.folderId, picked.id)
          );
        } catch (error) {
          console.warn("Move failed for", sync.fileId, error);
        }
      }
    } else {
      for (const list of linked) setListSync(list.id, providerId, null);
    }
    updateAccountStorage(account.id, providerId, {
      folderId: picked.id,
      folderName: picked.name,
      folderLink: picked.link,
    });
    renderStoragePanel();
    showToast(`Now saving to "${picked.name}".`, 3000, "success");
  } catch (error) {
    reportError(adapter, error, "folder");
  }
}

/***************** ERRORS & STATUS *****************/
function reportError(adapter, error, action, { silent = false } = {}) {
  console.error(`${adapter.name} ${action} failed:`, error);
  const code = error?.code;
  if (
    code === "popup_closed" ||
    code === "access_denied" ||
    code === "popup_failed_to_open" ||
    code === "busy"
  ) {
    setStatus(adapter.id, "idle", "");
    if (!silent)
      showToast(error.message, 5000, code === "popup_closed" ? "info" : "warning");
    return;
  }
  if (adapter.isAuthError(error)) {
    setStatus(
      adapter.id,
      "reauth",
      `${adapter.name} access expired or was revoked. Click Reconnect to authorise again.`
    );
    return;
  }
  if (navigator.onLine === false) {
    setStatus(
      adapter.id,
      "offline",
      "You're offline. Changes are kept in this browser and can be saved later."
    );
    return;
  }
  setStatus(adapter.id, "error", adapter.describeError(error));
  if (!silent) showErrorDialog(`${adapter.name}: ${adapter.describeError(error)}`);
}

function statusFor(providerId) {
  const adapter = adapters[providerId];
  const conn = connection(providerId);
  const list = getActiveList();
  if (!adapter || !conn || !list) return null;
  const s = status[providerId];
  if (s && ["working", "conflict", "reauth", "error", "offline"].includes(s.state))
    return s;
  if (conn.needsReauth)
    return { state: "reauth", message: `Reconnect ${adapter.name} to keep saving.` };
  const sync = getListSync(list.id, providerId);
  if (!sync)
    return {
      state: "unsaved",
      message: `This list hasn't been saved to ${adapter.name} yet.`,
    };
  if (sync.digest !== getContentDigest(list.id)) {
    return {
      state: "unsaved",
      message:
        adapter.hasValidToken() && autosync
          ? "Unsaved changes (saving shortly)…"
          : "Unsaved changes. Click Save.",
    };
  }
  return {
    state: "saved",
    message: `Saved to ${adapter.name} ${relativeTime(sync.savedAt)}.`,
  };
}

const STATUS_ICON = {
  saved: "●",
  unsaved: "○",
  working: "◌",
  conflict: "⚠",
  reauth: "⚠",
  error: "✖",
  offline: "◌",
  idle: "",
};

/***************** RENDERING *****************/
export function renderStoragePanel() {
  const panel = document.getElementById("storagePanel");
  const compact = document.getElementById("storageStatus");
  const account = getCurrentAccount();
  const available = listAdapters();
  if (!panel) return;

  if (!account) {
    if (available.length === 0) {
      panel.innerHTML = `<h3>Storage</h3>
        <p class="small">Your lists are saved in this browser only. Cloud storage connections are not available on this site yet; use <strong>Export JSON</strong> in Controls to keep a backup.</p>`;
    } else {
      panel.innerHTML = `<h3>Storage</h3>
        <p class="small">Your lists are saved in this browser only. Sign in to connect storage you control (${available.map((a) => a.name).join(" or ")}) and open your lists on other devices.</p>
        <button type="button" class="secondary" id="btnStorageSignIn">Sign in to connect storage</button>`;
      document
        .getElementById("btnStorageSignIn")
        ?.addEventListener("click", openSignInDialog);
    }
    if (compact) compact.textContent = "Stored in this browser";
    return;
  }

  const connected = connectedAdapters();
  const unconnected = available.filter((a) => !connection(a.id));
  let html = `<h3>Storage</h3>`;
  if (connected.length === 0) {
    html += `<p class="small">Lists stay in this browser until you connect storage. Connecting keeps a copy in a folder you own; CampList only sees files it creates there.</p>`;
  }
  for (const adapter of connected) {
    const conn = connection(adapter.id);
    const st = statusFor(adapter.id) || { state: "idle", message: "" };
    html += `<div class="storage-provider" data-provider="${adapter.id}">
      <div class="storage-head"><strong>${escapeText(adapter.name)}</strong>${conn.email ? `<span class="muted small">${escapeText(conn.email)}</span>` : ""}</div>
      <div class="small">Folder: ${conn.folderLink ? `<a href="${escapeText(conn.folderLink)}" target="_blank" rel="noopener noreferrer">${escapeText(conn.folderName)}</a>` : escapeText(conn.folderName)}
        ${adapter.canPickFolder ? `<button type="button" class="link-button" data-action="folder">Change…</button>` : ""}</div>
      <div class="storage-status status-${st.state}" role="status"><span aria-hidden="true">${STATUS_ICON[st.state] || ""}</span> ${escapeText(st.message || (st.state === "saved" ? "Saved." : ""))}</div>
      <div class="controls-buttons">
        ${st.state === "reauth" ? `<button type="button" data-action="reconnect">Reconnect</button>` : `<button type="button" data-action="save"${st.state === "working" ? " disabled" : ""}>Save now</button>`}
        <button type="button" class="secondary" data-action="open">Open from ${escapeText(adapter.name)}…</button>
        <button type="button" class="secondary" data-action="files">Trip files…</button>
        <button type="button" class="secondary" data-action="disconnect">Disconnect</button>
      </div>
      <label class="checkbox-row small"><input type="checkbox" data-action="autosync" ${autosync ? "checked" : ""}> Save changes automatically while connected</label>
    </div>`;
  }
  if (unconnected.length) {
    html += `<div class="controls-buttons">${unconnected
      .map(
        (a) =>
          `<button type="button" class="secondary" data-action="connect" data-provider="${a.id}">Connect ${escapeText(a.name)}</button>`
      )
      .join("")}</div>`;
  }
  html += `<p class="small muted">Nothing is stored on CampList's servers. <a href="privacy.html#storage">How storage works</a></p>`;
  panel.innerHTML = html;

  if (compact) {
    if (connected.length === 0) compact.textContent = "Stored in this browser";
    else {
      const a = connected[0];
      const st = statusFor(a.id);
      compact.textContent = st ? `${a.name}: ${st.message || "saved"}` : a.name;
      compact.className = `storage-status status-${st?.state || "idle"}`;
    }
  }
}

function wirePanel() {
  const panel = document.getElementById("storagePanel");
  if (!panel) return;
  panel.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || btn.tagName === "INPUT") return;
    const providerId =
      btn.dataset.provider || btn.closest("[data-provider]")?.dataset.provider;
    switch (btn.dataset.action) {
      case "connect":
        await connect(providerId);
        break;
      case "reconnect":
        await connect(providerId);
        break;
      case "save":
        await saveActiveList(providerId, { interactive: true });
        break;
      case "open":
        await openFromProvider(providerId);
        break;
      case "files":
        await openFilesDialog(providerId);
        break;
      case "folder":
        await changeFolder(providerId);
        break;
      case "disconnect":
        await disconnect(providerId);
        break;
    }
  });
  panel.addEventListener("change", (e) => {
    if (e.target.dataset?.action === "autosync") {
      autosync = e.target.checked;
      try {
        localStorage.setItem(AUTOSYNC_KEY, autosync ? "1" : "0");
      } catch {
        /* ignore */
      }
      renderStoragePanel();
    }
  });
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(async () => {
    if (!autosync) return;
    for (const adapter of connectedAdapters()) {
      if (adapter.hasValidToken())
        await saveActiveList(adapter.id, { interactive: false, silent: true });
      else renderStoragePanel();
    }
  }, AUTOSAVE_DELAY);
}

/***************** SETUP *****************/
export function setupStorage() {
  adapters.google = createGoogleAdapter();
  const onedrive = createOneDriveAdapter();
  if (onedrive) adapters.microsoft = onedrive;
  try {
    autosync = localStorage.getItem(AUTOSYNC_KEY) !== "0";
  } catch {
    autosync = true;
  }
  wirePanel();
  renderStoragePanel();
  onStateChange((event) => {
    if (
      event.type === "content" &&
      (event.reason === "save" || event.reason === "rename")
    ) {
      renderStoragePanel();
      if (connectedAdapters().length) scheduleAutosave();
    } else if (event.type === "content") {
      renderStoragePanel();
    }
  });
  onAuthChange((event) => {
    if (event.type === "signout" || event.type === "expired") {
      for (const adapter of Object.values(adapters)) adapter.forgetToken();
    }
    for (const key of Object.keys(status)) status[key] = null;
    renderStoragePanel();
  });
  window.addEventListener("online", () => renderStoragePanel());
  window.addEventListener("offline", () => renderStoragePanel());
  window.addEventListener("beforeunload", (e) => {
    const pending = connectedAdapters().some((a) => statusFor(a.id)?.state === "unsaved");
    if (pending && autosaveTimer) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

export const _test = { connect, saveActiveList, adapters, statusFor };
