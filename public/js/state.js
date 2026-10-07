// state.js — application state, persistence and undo/redo.
//
// Storage model (all in localStorage, all per browser):
//   campList.v2.<ns>.index        -> { active: "<listId>", lists: [{ id, name, createdAt, updatedAt, pristine, sync }] }
//   campList.v2.<ns>.list.<id>    -> { data: [...sections], meta: {...}, collapsed: [...ids], updatedAt }
//   campChecklist_theme           -> "light" | "dark" | "system"   (device-wide preference)
//   campChecklist_data/_meta/_collapsedSections
//                                 -> legacy single-list keys. They are migrated into the "guest"
//                                    namespace on first run and kept mirrored so an older build
//                                    of the site still reads the active guest list (rollback safety).
//
// <ns> is "guest" for visitors who are not signed in, or the account id of the signed-in
// account (see auth.js). Switching namespaces swaps the whole list collection.

import { showErrorDialog, updateUndoRedoButtons } from "./ui.js";

/***************** CONSTANTS *****************/
const PREFIX = "campList.v2";
const GUEST_NS = "guest";
const LEGACY_KEYS = {
  list: "campChecklist_data",
  meta: "campChecklist_meta",
  collapsed: "campChecklist_collapsedSections",
};
const STORAGE_THEME = "campChecklist_theme";
const DEFAULT_TEMPLATE_URL = "templates/camplist-classic.json";
const SCHEMA_VERSION = 2;
const MAX_HISTORY_SIZE = 50;
const MAX_TEXT = 500; // characters per item / section title
const MAX_NOTE = 4000;

const FALLBACK_LIST = [
  {
    id: "general",
    title: "General",
    items: [
      {
        id: "tent",
        text: "Tent",
        checked: false,
        note: "",
        requires: [],
        weight: 0,
        packed: false,
        cost: 0,
        permitRequired: false,
        regulationNotes: "",
        optional: false,
      },
    ],
  },
];

const DEFAULT_META = {
  destination: "",
  startDate: "",
  endDate: "",
  notes: "",
  permitUrl: "",
  permitDeadline: "",
  fireRules: "",
  destinationAddress: "",
  destinationPlaceId: "",
  destinationLat: "",
  destinationLng: "",
};

/***************** MUTABLE STATE *****************/
let namespace = GUEST_NS;
let index = { active: null, lists: [] };
let activeListId = null;

let data = [];
let meta = { ...DEFAULT_META };
let collapsedSections = new Set();
let theme = "system";

let undoStack = [];
let redoStack = [];

const listeners = new Set();

/***************** SMALL UTILITIES *****************/
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function nowIso() {
  return new Date().toISOString();
}

function keyFor(ns, name) {
  return `${PREFIX}.${ns}.${name}`;
}

function listKey(ns, id) {
  return `${PREFIX}.${ns}.list.${id}`;
}

function clamp(str, max) {
  if (typeof str !== "string") return "";
  return str.length > max ? str.slice(0, max) : str;
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Could not read ${key} from storage:`, error);
    return fallback;
  }
}

function writeJSON(key, value, { critical = true } = {}) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    const quota = error instanceof DOMException && error.name === "QuotaExceededError";
    console.error(`Could not write ${key} to storage:`, error);
    if (critical) {
      showErrorDialog(
        quota
          ? "Your browser's storage for this site is full, so the last change could not be saved. Remove some items or lists, or export your data, then try again."
          : "An unexpected error occurred while saving. Please try again."
      );
    }
    return false;
  }
}

/** Cheap, stable digest used to detect unsaved changes (FNV-1a over the JSON text). */
function digestString(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/***************** NORMALISATION *****************/
function normalizeItem(item, groupId) {
  if (!item || typeof item !== "object") return null;
  const normalized = {
    id: typeof item.id === "string" && item.id ? item.id : makeId(groupId || "item"),
    text: clamp(String(item.text ?? ""), MAX_TEXT),
    checked: Boolean(item.checked),
    note: clamp(typeof item.note === "string" ? item.note : "", MAX_NOTE),
    requires: Array.isArray(item.requires)
      ? item.requires.filter((r) => typeof r === "string")
      : [],
    weight: Number.isFinite(Number(item.weight)) ? Math.max(0, Number(item.weight)) : 0,
    packed: Boolean(item.packed),
    cost: Number.isFinite(Number(item.cost)) ? Math.max(0, Number(item.cost)) : 0,
    permitRequired: Boolean(item.permitRequired),
    regulationNotes: clamp(
      typeof item.regulationNotes === "string" ? item.regulationNotes : "",
      MAX_NOTE
    ),
    optional: Boolean(item.optional),
  };
  return normalized;
}

function normalizeSection(group) {
  if (!group || typeof group !== "object") return null;
  const id = typeof group.id === "string" && group.id ? group.id : makeId("section");
  const items = Array.isArray(group.items)
    ? group.items.map((it) => normalizeItem(it, id)).filter(Boolean)
    : [];
  return {
    id,
    title: clamp(String(group.title ?? "Untitled"), MAX_TEXT) || "Untitled",
    items,
  };
}

/** Returns a normalised copy of a sections array; invalid input yields an empty list. */
function normalizeData(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const group of input) {
    const section = normalizeSection(group);
    if (!section) continue;
    // De-duplicate ids defensively (imports from other devices can collide).
    if (seen.has(section.id)) section.id = makeId("section");
    seen.add(section.id);
    for (const item of section.items) {
      if (seen.has(item.id)) item.id = makeId(section.id);
      seen.add(item.id);
    }
    out.push(section);
  }
  return out;
}

function normalizeMeta(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = { ...DEFAULT_META };
  for (const key of Object.keys(DEFAULT_META)) {
    const value = src[key];
    out[key] =
      typeof value === "string"
        ? clamp(value, MAX_NOTE)
        : value == null
          ? ""
          : String(value);
  }
  // Only allow http(s) permit links.
  if (out.permitUrl && !/^https?:\/\//i.test(out.permitUrl)) out.permitUrl = "";
  return out;
}

/***************** TEMPLATES → LIST CONTENT *****************/
/**
 * Converts a template document (templates/*.json) into list content.
 * Accepts both the v2 template shape ({ sections: [{ title, items: [{ text, required, note }] }] })
 * and the legacy raw array shape ([{ id, title, items }]).
 */
function templateToListContent(template) {
  if (Array.isArray(template)) {
    return { data: normalizeData(template), meta: { ...DEFAULT_META } };
  }
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  const data = sections.map((section, sIdx) => {
    const sectionId = makeId(`s${sIdx}`);
    return {
      id: sectionId,
      title: String(section.title ?? "Untitled"),
      items: (Array.isArray(section.items) ? section.items : []).map((item) => ({
        id: makeId(sectionId),
        text: String(item.text ?? ""),
        checked: false,
        note: typeof item.note === "string" ? item.note : "",
        requires: [],
        weight: 0,
        packed: false,
        cost: 0,
        permitRequired: Boolean(item.permitRequired),
        regulationNotes: "",
        optional: item.required === false,
      })),
    };
  });
  const meta = { ...DEFAULT_META };
  if (template?.defaultMeta && typeof template.defaultMeta === "object") {
    Object.assign(meta, normalizeMeta(template.defaultMeta));
  }
  return { data: normalizeData(data), meta };
}

async function fetchTemplate(url, { retries = 3, initialDelay = 400 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Fetch failed with status ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries - 1) await wait(initialDelay * 2 ** attempt);
    }
  }
  throw lastError;
}

async function fetchDefaultContent() {
  try {
    const template = await fetchTemplate(DEFAULT_TEMPLATE_URL);
    return templateToListContent(template);
  } catch (error) {
    console.error("Could not fetch the default checklist template:", error);
    showErrorDialog(
      "Could not fetch the default checklist template from the server. Using a basic built-in list instead."
    );
    return { data: structuredClone(FALLBACK_LIST), meta: { ...DEFAULT_META } };
  }
}

/***************** INDEX & LIST RECORDS *****************/
function loadIndex(ns) {
  const stored = readJSON(keyFor(ns, "index"), null);
  if (stored && Array.isArray(stored.lists)) {
    stored.lists = stored.lists.filter((l) => l && typeof l.id === "string");
    return stored;
  }
  return null;
}

function saveIndex() {
  writeJSON(keyFor(namespace, "index"), index);
  emit("index");
}

function findListRecord(id) {
  return index.lists.find((l) => l.id === id) || null;
}

function readListContent(ns, id) {
  const raw = readJSON(listKey(ns, id), null);
  if (!raw || typeof raw !== "object") return null;
  return {
    data: normalizeData(raw.data),
    meta: normalizeMeta(raw.meta),
    collapsed: Array.isArray(raw.collapsed)
      ? raw.collapsed.filter((c) => typeof c === "string")
      : [],
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : nowIso(),
  };
}

function writeListContent(ns, id, content) {
  return writeJSON(listKey(ns, id), content);
}

function mirrorLegacy() {
  // Keep the legacy keys in sync for the guest namespace so an older build can still read them.
  if (namespace !== GUEST_NS) return;
  writeJSON(LEGACY_KEYS.list, data, { critical: false });
  writeJSON(LEGACY_KEYS.meta, meta, { critical: false });
  writeJSON(LEGACY_KEYS.collapsed, Array.from(collapsedSections), { critical: false });
}

function migrateLegacyGuestData() {
  const legacyData = readJSON(LEGACY_KEYS.list, null);
  if (!Array.isArray(legacyData) || legacyData.length === 0) return null;
  const legacyMeta = readJSON(LEGACY_KEYS.meta, {});
  const legacyCollapsed = readJSON(LEGACY_KEYS.collapsed, []);
  const id = makeId("list");
  const stamp = nowIso();
  const content = {
    data: normalizeData(legacyData),
    meta: normalizeMeta(legacyMeta),
    collapsed: Array.isArray(legacyCollapsed) ? legacyCollapsed : [],
    updatedAt: stamp,
  };
  writeListContent(GUEST_NS, id, content);
  return {
    active: id,
    lists: [
      {
        id,
        name: "My CampList",
        createdAt: stamp,
        updatedAt: stamp,
        pristine: false,
        migratedFromLegacy: true,
        sync: {},
      },
    ],
  };
}

/***************** LOAD *****************/
/**
 * Loads the list collection for a namespace and activates a list.
 * @param {{namespace?: string, listId?: string}} options
 */
async function loadAllState(options = {}) {
  namespace = options.namespace || namespace || GUEST_NS;
  undoStack = [];
  redoStack = [];

  let loaded = loadIndex(namespace);
  if (!loaded && namespace === GUEST_NS) loaded = migrateLegacyGuestData();
  if (!loaded || loaded.lists.length === 0) {
    const content = await fetchDefaultContent();
    const id = makeId("list");
    const stamp = nowIso();
    writeListContent(namespace, id, {
      data: content.data,
      meta: content.meta,
      collapsed: [],
      updatedAt: stamp,
    });
    loaded = {
      active: id,
      lists: [
        {
          id,
          name: "My CampList",
          createdAt: stamp,
          updatedAt: stamp,
          pristine: true,
          sync: {},
        },
      ],
    };
    writeJSON(keyFor(namespace, "index"), loaded);
  }
  index = loaded;

  const requested =
    options.listId && findListRecord(options.listId) ? options.listId : null;
  activeListId =
    requested || (findListRecord(index.active) ? index.active : index.lists[0].id);
  index.active = activeListId;

  const content = readListContent(namespace, activeListId);
  if (content) {
    data = content.data;
    meta = content.meta;
    collapsedSections = new Set(content.collapsed);
  } else {
    showErrorDialog("Could not load the saved checklist. Starting with an empty list.");
    data = [];
    meta = { ...DEFAULT_META };
    collapsedSections = new Set();
    saveListState();
  }

  try {
    const storedTheme = localStorage.getItem(STORAGE_THEME);
    theme = ["light", "dark", "system"].includes(storedTheme) ? storedTheme : "system";
  } catch {
    theme = "system";
  }

  mirrorLegacy();
  emit("namespace");
  emit("content", { reason: "load" });
}

/***************** SAVE *****************/
function saveListState({ touch = true } = {}) {
  const record = findListRecord(activeListId);
  const stamp = nowIso();
  const ok = writeListContent(namespace, activeListId, {
    data,
    meta,
    collapsed: Array.from(collapsedSections),
    updatedAt: stamp,
  });
  if (record && touch) {
    record.updatedAt = stamp;
    record.pristine = false;
    saveIndex();
  }
  mirrorLegacy();
  if (ok) emit("content", { reason: "save" });
  return ok;
}

// Meta is stored inside the list content, so this is an alias kept for existing callers.
function saveMetaState() {
  return saveListState();
}

function saveCollapsedState() {
  // Collapsing is a view preference, not a content change: do not bump updatedAt.
  writeListContent(namespace, activeListId, {
    data,
    meta,
    collapsed: Array.from(collapsedSections),
    updatedAt: findListRecord(activeListId)?.updatedAt || nowIso(),
  });
  mirrorLegacy();
}

function saveThemeState() {
  try {
    localStorage.setItem(STORAGE_THEME, theme);
  } catch (error) {
    console.error("Error saving theme preference:", error);
  }
}

/***************** CHANGE NOTIFICATIONS *****************/
function onStateChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(type, detail = {}) {
  for (const listener of listeners) {
    try {
      listener({ type, namespace, listId: activeListId, ...detail });
    } catch (error) {
      console.error("State listener failed:", error);
    }
  }
}

/***************** HISTORY *****************/
function snapshot() {
  return {
    listId: activeListId,
    data: structuredClone(data),
    meta: structuredClone(meta),
    collapsedSections: new Set(collapsedSections),
  };
}

function _saveStateForUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > MAX_HISTORY_SIZE) undoStack.shift();
  redoStack = [];
  if (typeof updateUndoRedoButtons === "function") updateUndoRedoButtons();
}

function _restoreState(s) {
  data = s.data;
  meta = s.meta;
  collapsedSections = s.collapsedSections;
  saveListState();
}

function undoState() {
  if (undoStack.length === 0) return false;
  redoStack.push(snapshot());
  _restoreState(undoStack.pop());
  if (typeof updateUndoRedoButtons === "function") updateUndoRedoButtons();
  return true;
}

function redoState() {
  if (redoStack.length === 0) return false;
  undoStack.push(snapshot());
  if (undoStack.length > MAX_HISTORY_SIZE) undoStack.shift();
  _restoreState(redoStack.pop());
  if (typeof updateUndoRedoButtons === "function") updateUndoRedoButtons();
  return true;
}

const canUndo = () => undoStack.length > 0;
const canRedo = () => redoStack.length > 0;

/***************** META / VIEW PREFERENCES *****************/
function updateMetaState(newMeta) {
  _saveStateForUndo();
  meta = normalizeMeta(newMeta);
  saveListState();
}

function updateCollapsedState(sectionId, isCollapsed) {
  if (isCollapsed) collapsedSections.add(sectionId);
  else collapsedSections.delete(sectionId);
  saveCollapsedState();
}

function updateThemeState(newTheme) {
  if (["light", "dark", "system"].includes(newTheme)) {
    theme = newTheme;
    saveThemeState();
  } else {
    console.warn("Invalid theme value provided:", newTheme);
  }
}

/***************** ITEM & SECTION MUTATIONS *****************/
function findItemState(id) {
  for (const g of data) {
    const idx = g.items.findIndex((i) => i.id === id);
    if (idx > -1) return { g, idx, item: g.items[idx] };
  }
  return null;
}

function updateItemCheckedState(id, checked) {
  const ctx = findItemState(id);
  if (!ctx) return false;
  _saveStateForUndo();
  ctx.item.checked = Boolean(checked);
  saveListState();
  return true;
}

function addItemState(groupId, text) {
  const group = data.find((g) => g.id === groupId);
  const cleanText = clamp(String(text ?? "").trim(), MAX_TEXT);
  if (!group || !cleanText) return null;
  _saveStateForUndo();
  const newItem = normalizeItem({ id: makeId(groupId), text: cleanText }, groupId);
  group.items.push(newItem);
  saveListState();
  return newItem;
}

function deleteItemState(id) {
  const ctx = findItemState(id);
  if (!ctx) return false;
  _saveStateForUndo();
  ctx.g.items.splice(ctx.idx, 1);
  saveListState();
  return true;
}

function updateItemTextState(id, text) {
  const ctx = findItemState(id);
  const cleanText = clamp(String(text ?? "").trim(), MAX_TEXT);
  if (!ctx || !cleanText) return false;
  _saveStateForUndo();
  ctx.item.text = cleanText;
  saveListState();
  return true;
}

function updateItemNoteState(id, note) {
  const ctx = findItemState(id);
  if (!ctx) return false;
  _saveStateForUndo();
  ctx.item.note = clamp(String(note ?? ""), MAX_NOTE);
  saveListState();
  return true;
}

/** Updates weight/cost/packed/permit/optional details in one undoable step. */
function updateItemDetailsState(id, details = {}) {
  const ctx = findItemState(id);
  if (!ctx) return false;
  _saveStateForUndo();
  const item = ctx.item;
  if ("weight" in details) item.weight = Math.max(0, parseFloat(details.weight) || 0);
  if ("cost" in details) item.cost = Math.max(0, parseFloat(details.cost) || 0);
  if ("packed" in details) item.packed = Boolean(details.packed);
  if ("permitRequired" in details) item.permitRequired = Boolean(details.permitRequired);
  if ("optional" in details) item.optional = Boolean(details.optional);
  if ("regulationNotes" in details)
    item.regulationNotes = clamp(String(details.regulationNotes ?? ""), MAX_NOTE);
  saveListState();
  return true;
}

function moveItemState(itemId, targetItemId) {
  const src = findItemState(itemId);
  const tgt = findItemState(targetItemId);
  if (!src || !tgt || itemId === targetItemId) return false;
  _saveStateForUndo();
  src.g.items.splice(src.idx, 1);
  const insertIndex = src.g === tgt.g && src.idx < tgt.idx ? tgt.idx - 1 : tgt.idx;
  tgt.g.items.splice(insertIndex, 0, src.item);
  saveListState();
  return true;
}

function moveSectionState(sourceSectionId, targetSectionId) {
  const sourceIndex = data.findIndex((g) => g.id === sourceSectionId);
  const targetIndex = data.findIndex((g) => g.id === targetSectionId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return false;
  _saveStateForUndo();
  const [moved] = data.splice(sourceIndex, 1);
  const adjusted = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
  data.splice(adjusted, 0, moved);
  saveListState();
  return true;
}

function addSectionState(title) {
  const cleanTitle = clamp(String(title ?? "").trim(), MAX_TEXT);
  if (!cleanTitle) return null;
  _saveStateForUndo();
  const newSection = { id: makeId("section"), title: cleanTitle, items: [] };
  data.push(newSection);
  saveListState();
  return newSection;
}

function updateSectionTitleState(sectionId, newTitle) {
  const section = data.find((g) => g.id === sectionId);
  const cleanTitle = clamp(String(newTitle ?? "").trim(), MAX_TEXT);
  if (!section || !cleanTitle) return false;
  _saveStateForUndo();
  section.title = cleanTitle;
  saveListState();
  return true;
}

function deleteSectionState(sectionId) {
  const idx = data.findIndex((g) => g.id === sectionId);
  if (idx < 0) return false;
  _saveStateForUndo();
  data.splice(idx, 1);
  collapsedSections.delete(sectionId);
  saveListState();
  return true;
}

/** Appends normalised sections (e.g. from a template) to the active list. */
function appendSectionsState(sections) {
  const normalized = normalizeData(sections);
  if (normalized.length === 0) return 0;
  _saveStateForUndo();
  // Avoid id collisions with the current list.
  const existing = new Set();
  for (const g of data) {
    existing.add(g.id);
    for (const it of g.items) existing.add(it.id);
  }
  for (const section of normalized) {
    if (existing.has(section.id)) section.id = makeId("section");
    for (const item of section.items)
      if (existing.has(item.id)) item.id = makeId(section.id);
    data.push(section);
  }
  saveListState();
  return normalized.length;
}

/** Replaces the content of the active list (import, load from storage). Undoable. */
function replaceActiveListContent({ data: newData, meta: newMeta, collapsed }) {
  _saveStateForUndo();
  data = normalizeData(newData);
  meta = normalizeMeta(newMeta);
  collapsedSections = new Set(Array.isArray(collapsed) ? collapsed : []);
  saveListState();
}

/** Resets the active list back to the default template. Not undoable (history is cleared). */
async function resetAllState() {
  undoStack = [];
  redoStack = [];
  if (typeof updateUndoRedoButtons === "function") updateUndoRedoButtons();
  const content = await fetchDefaultContent();
  data = content.data;
  meta = content.meta;
  collapsedSections = new Set();
  saveListState();
}

/***************** LIST COLLECTION *****************/
function getLists() {
  return index.lists.map((l) => ({ ...l, sync: structuredClone(l.sync || {}) }));
}

function getActiveList() {
  const record = findListRecord(activeListId);
  return record ? { ...record, sync: structuredClone(record.sync || {}) } : null;
}

function getNamespace() {
  return namespace;
}

/**
 * Creates a new list in the current namespace.
 * @param {{name?: string, data?: any[], meta?: object, collapsed?: string[], activate?: boolean, source?: object}} opts
 */
function createList(opts = {}) {
  const id = makeId("list");
  const stamp = nowIso();
  const content = {
    data: normalizeData(opts.data || []),
    meta: normalizeMeta(opts.meta || {}),
    collapsed: Array.isArray(opts.collapsed) ? opts.collapsed : [],
    updatedAt: stamp,
  };
  if (!writeListContent(namespace, id, content)) return null;
  const record = {
    id,
    name: clamp(String(opts.name || "New list").trim(), 120) || "New list",
    createdAt: stamp,
    updatedAt: stamp,
    pristine: Boolean(opts.pristine),
    sync: {},
  };
  if (opts.source && typeof opts.source === "object") record.source = opts.source;
  index.lists.push(record);
  saveIndex();
  if (opts.activate !== false) switchList(id);
  return record;
}

function switchList(id) {
  const record = findListRecord(id);
  if (!record) return false;
  if (id === activeListId) return true;
  // Persist the current list before leaving it.
  if (findListRecord(activeListId)) saveCollapsedState();
  const content = readListContent(namespace, id);
  if (!content) {
    showErrorDialog("That list could not be loaded from storage.");
    return false;
  }
  activeListId = id;
  index.active = id;
  data = content.data;
  meta = content.meta;
  collapsedSections = new Set(content.collapsed);
  undoStack = [];
  redoStack = [];
  if (typeof updateUndoRedoButtons === "function") updateUndoRedoButtons();
  saveIndex();
  mirrorLegacy();
  emit("content", { reason: "switch" });
  return true;
}

function renameList(id, name) {
  const record = findListRecord(id);
  const clean = clamp(String(name ?? "").trim(), 120);
  if (!record || !clean) return false;
  record.name = clean;
  record.updatedAt = nowIso();
  saveIndex();
  emit("content", { reason: "rename" });
  return true;
}

async function deleteList(id) {
  const idx = index.lists.findIndex((l) => l.id === id);
  if (idx < 0) return false;
  index.lists.splice(idx, 1);
  try {
    localStorage.removeItem(listKey(namespace, id));
  } catch (error) {
    console.error("Could not remove list content:", error);
  }
  if (index.lists.length === 0) {
    // Never leave the user without a list.
    const content = await fetchDefaultContent();
    const newId = makeId("list");
    const stamp = nowIso();
    writeListContent(namespace, newId, { ...content, collapsed: [], updatedAt: stamp });
    index.lists.push({
      id: newId,
      name: "My CampList",
      createdAt: stamp,
      updatedAt: stamp,
      pristine: true,
      sync: {},
    });
  }
  if (id === activeListId) {
    activeListId = null;
    switchList(index.lists[0].id);
  } else {
    saveIndex();
  }
  return true;
}

/** Serialisable export of a list (the active one by default). */
function getListSnapshot(id = activeListId) {
  const record = findListRecord(id);
  if (!record) return null;
  const content =
    id === activeListId
      ? {
          data,
          meta,
          collapsed: Array.from(collapsedSections),
          updatedAt: record.updatedAt,
        }
      : readListContent(namespace, id);
  if (!content) return null;
  return {
    schema: SCHEMA_VERSION,
    app: "camplist.guide",
    exportedAt: nowIso(),
    id: record.id,
    name: record.name,
    updatedAt: content.updatedAt,
    data: structuredClone(content.data),
    meta: structuredClone(content.meta),
    collapsedSections: Array.from(content.collapsed || []),
  };
}

/** Digest of the active list content (ignores view state). */
function getContentDigest(id = activeListId) {
  const snap = getListSnapshot(id);
  if (!snap) return "";
  return digestString(
    JSON.stringify({ name: snap.name, data: snap.data, meta: snap.meta })
  );
}

/**
 * Parses an imported JSON document (local file or cloud file) into list content.
 * Accepts v2 snapshots, the v1 export shape ({ data, meta, collapsedSections, theme }) and raw arrays.
 * Throws on malformed input.
 */
function parseImportedList(json) {
  let doc = json;
  if (typeof doc === "string") doc = JSON.parse(doc);
  if (Array.isArray(doc)) {
    return {
      name: "Imported list",
      data: normalizeData(doc),
      meta: { ...DEFAULT_META },
      collapsed: [],
    };
  }
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.data)) {
    throw new Error(
      "The file does not look like a CampList export (missing a 'data' array)."
    );
  }
  const sections = normalizeData(doc.data);
  if (doc.data.length > 0 && sections.length === 0) {
    throw new Error("The file's sections could not be read.");
  }
  return {
    id: typeof doc.id === "string" ? doc.id : undefined,
    name:
      typeof doc.name === "string" && doc.name.trim()
        ? clamp(doc.name.trim(), 120)
        : "Imported list",
    data: sections,
    meta: normalizeMeta(doc.meta),
    collapsed: Array.isArray(doc.collapsedSections) ? doc.collapsedSections : [],
    theme: ["light", "dark", "system"].includes(doc.theme) ? doc.theme : undefined,
    updatedAt: typeof doc.updatedAt === "string" ? doc.updatedAt : undefined,
  };
}

/***************** SYNC METADATA *****************/
function getListSync(id, provider) {
  const record = findListRecord(id);
  return record?.sync?.[provider] ? structuredClone(record.sync[provider]) : null;
}

function setListSync(id, provider, info) {
  const record = findListRecord(id);
  if (!record) return false;
  record.sync = record.sync || {};
  if (info === null) delete record.sync[provider];
  else record.sync[provider] = { ...(record.sync[provider] || {}), ...info };
  saveIndex();
  return true;
}

/***************** NAMESPACES (ACCOUNTS) *****************/
function namespaceHasData(ns) {
  const stored = loadIndex(ns);
  return Boolean(stored && stored.lists.length > 0);
}

function namespaceHasEditedLists(ns) {
  const stored = loadIndex(ns);
  return Boolean(stored && stored.lists.some((l) => l.pristine === false));
}

/** Copies every list of one namespace into another (new ids; sync info is not copied). */
function copyListsBetweenNamespaces(fromNs, toNs) {
  const source = loadIndex(fromNs);
  if (!source) return 0;
  const target = loadIndex(toNs) || { active: null, lists: [] };
  let copied = 0;
  for (const record of source.lists) {
    const content = readListContent(fromNs, record.id);
    if (!content) continue;
    const id = makeId("list");
    const stamp = nowIso();
    if (!writeListContent(toNs, id, { ...content, updatedAt: stamp })) continue;
    target.lists.push({
      id,
      name: record.name,
      createdAt: stamp,
      updatedAt: stamp,
      pristine: record.pristine === true,
      sync: {},
      copiedFrom: fromNs,
    });
    if (!target.active) target.active = id;
    copied++;
  }
  writeJSON(keyFor(toNs, "index"), target);
  return copied;
}

/** Removes every stored list of a namespace (used when an account is forgotten or merged). */
function deleteNamespace(ns) {
  if (ns === namespace) return false;
  const stored = loadIndex(ns);
  try {
    if (stored)
      for (const record of stored.lists) localStorage.removeItem(listKey(ns, record.id));
    localStorage.removeItem(keyFor(ns, "index"));
  } catch (error) {
    console.error("Could not delete namespace:", error);
    return false;
  }
  return true;
}

/** Switches the whole collection to another namespace (e.g. after sign-in or sign-out). */
async function switchNamespace(ns) {
  if (ns === namespace) return;
  if (findListRecord(activeListId)) saveCollapsedState();
  await loadAllState({ namespace: ns });
}

/***************** COMPATIBILITY HELPERS *****************/
function getMeta() {
  return meta;
}

function getState() {
  return { state: { lists: { 0: data }, currentListId: 0 } };
}

export {
  // live state
  data,
  meta,
  collapsedSections,
  theme,
  DEFAULT_META,
  GUEST_NS,
  // load/save
  loadAllState,
  saveListState,
  saveMetaState,
  onStateChange,
  // meta / prefs
  updateMetaState,
  updateCollapsedState,
  updateThemeState,
  getMeta,
  getState,
  // history
  undoState,
  redoState,
  canUndo,
  canRedo,
  // items & sections
  findItemState,
  updateItemCheckedState,
  addItemState,
  deleteItemState,
  updateItemTextState,
  updateItemNoteState,
  updateItemDetailsState,
  moveItemState,
  moveSectionState,
  addSectionState,
  updateSectionTitleState,
  deleteSectionState,
  appendSectionsState,
  replaceActiveListContent,
  resetAllState,
  // lists
  getLists,
  getActiveList,
  createList,
  switchList,
  renameList,
  deleteList,
  getListSnapshot,
  getContentDigest,
  parseImportedList,
  getListSync,
  setListSync,
  // namespaces
  getNamespace,
  namespaceHasData,
  namespaceHasEditedLists,
  copyListsBetweenNamespaces,
  deleteNamespace,
  switchNamespace,
  // templates & utils
  templateToListContent,
  fetchTemplate,
  normalizeData,
  normalizeMeta,
  digestString,
  makeId,
};
