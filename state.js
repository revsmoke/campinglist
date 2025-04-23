import { showErrorDialog, updateUndoRedoButtons } from "./ui.js";

/***************** CONFIG & STATE *****************/
// LocalStorage key for the main checklist array
const STORAGE_LIST = "campChecklist_data";
// LocalStorage key for the trip‑meta object (destination / dates / notes)
const STORAGE_META = "campChecklist_meta";
// LocalStorage key for the set of collapsed section IDs
const STORAGE_COLLAPSED = "campChecklist_collapsedSections";
// LocalStorage key for the theme preference
const STORAGE_THEME = "campChecklist_theme";
// Remote JSON template fetched on first load (or when user resets)
const REMOTE_JSON = "camplist.json";
// Minimal hard‑coded list used if remote fetch fails (guarantees the UI always has something to render)
const FALLBACK_LIST = [
  {
    id: "general",
    title: "General",
    items: [{ id: "tent", text: "Tent", checked: false, note: "" }],
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
  // Add location fields from Google Places Autocomplete
  destinationAddress: "",
  destinationPlaceId: "",
  destinationLat: "",
  destinationLng: "",
};

// Use 'let' so they can be reassigned by loadAll()
let data = [];
let meta = { ...DEFAULT_META };
let collapsedSections = new Set(); // Store IDs of collapsed sections
let theme = "system"; // 'light', 'dark', or 'system'

// Undo/Redo History
const MAX_HISTORY_SIZE = 50; // Limit history to prevent memory issues
let undoStack = [];
let redoStack = [];

// Helper function for retries
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/***************** LOAD & SAVE *****************/
async function fetchDefaultList() {
  const MAX_RETRIES = 3;
  const INITIAL_DELAY = 500; // ms

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // console.log(`Attempt ${attempt + 1} to fetch ${REMOTE_JSON}...`);
      const r = await fetch(REMOTE_JSON, { cache: "no-store" });

      if (!r.ok) {
        // Throw specific error for HTTP issues to potentially handle differently
        throw new Error(`Fetch failed with status ${r.status}`);
      }

      // Attempt to parse JSON - this can also throw an error
      const jsonData = await r.json();
      // console.log("Fetch successful!");
      return jsonData; // Success!
    } catch (error) {
      console.warn(`Fetch attempt ${attempt + 1} failed:`, error.message); // Log warning for this attempt

      if (attempt === MAX_RETRIES - 1) {
        // Last attempt failed, log final error, show dialog, and return fallback
        console.error(
          `Failed to fetch default list after ${MAX_RETRIES} attempts:`,
          error
        );
        showErrorDialog(
          "Could not fetch the default checklist template from the server after multiple attempts. Using a basic built-in list instead."
        );
        return structuredClone(FALLBACK_LIST);
      }

      // Calculate delay for next retry with exponential backoff
      const delay = INITIAL_DELAY * Math.pow(2, attempt);
      // console.log(`Waiting ${delay}ms before next fetch attempt...`);
      await wait(delay);
    }
  }
  // Should theoretically not be reached due to the return in the loop/catch
  // but as a safeguard, return fallback if loop finishes unexpectedly.
  console.error(
    "fetchDefaultList loop completed unexpectedly. Returning fallback."
  );
  return structuredClone(FALLBACK_LIST);
}

async function loadAllState() {
  // Load checklist from localStorage or remote template
  try {
    const lsRaw = localStorage.getItem(STORAGE_LIST);
    data = lsRaw ? JSON.parse(lsRaw) : await fetchDefaultList();
    // If loaded from fetch/default (lsRaw is null), save it immediately
    if (!lsRaw) {
      try {
        localStorage.setItem(STORAGE_LIST, JSON.stringify(data));
      } catch (saveError) {
        // Handle potential quota error during the *initial* save
        if (
          saveError instanceof DOMException &&
          saveError.name === "QuotaExceededError"
        ) {
          showErrorDialog(
            "Could not save initial checklist. Storage space may be full."
          );
        } else {
          console.error("Error saving initial checklist data:", saveError);
          showErrorDialog(
            "An unexpected error occurred saving the initial checklist."
          );
        }
      }
    }
  } catch (error) {
    console.error("Error loading checklist data:", error);
    showErrorDialog("Could not load saved checklist data. Using default list.");
    data = structuredClone(FALLBACK_LIST); // Fallback on error
    // Attempt to overwrite corrupted data with fallback
    try {
      localStorage.setItem(STORAGE_LIST, JSON.stringify(data));
    } catch (overwriteError) {
      if (
        overwriteError instanceof DOMException &&
        overwriteError.name === "QuotaExceededError"
      ) {
        showErrorDialog(
          "Storage full: Could not even save the default checklist."
        );
      } else {
        console.error(
          "Error overwriting checklist data with fallback:",
          overwriteError
        );
        // No need for another dialog here, the first one suffices
      }
    }
  }

  // Data Migration/Normalization (Ensure all items have expected fields)
  if (Array.isArray(data)) {
    data.forEach((group) => {
      if (group && Array.isArray(group.items)) {
        group.items.forEach((item) => {
          if (item && typeof item === "object") {
            if (!Object.hasOwn(item, "note")) {
              item.note = ""; // Add missing note field
            }
            if (!Object.hasOwn(item, "requires")) {
              item.requires = []; // Add missing requires field (NEW)
            }
            if (!Object.hasOwn(item, "weight")) {
              item.weight = 0; // Add missing weight field
            }
            if (!Object.hasOwn(item, "packed")) {
              item.packed = false; // Add missing packed field
            }
            if (!Object.hasOwn(item, "cost")) {
              item.cost = 0; // Add missing cost field
            }
            if (!Object.hasOwn(item, "permitRequired")) {
              item.permitRequired = false; // Add missing permitRequired field
            }
            if (!Object.hasOwn(item, "regulationNotes")) {
              item.regulationNotes = ""; // Add missing regulationNotes field
            }
          }
        });
      }
    });
  }

  // Load meta info
  try {
    const metaRaw = localStorage.getItem(STORAGE_META);
    meta = metaRaw ? JSON.parse(metaRaw) : { ...DEFAULT_META };

    // Add new permit fields to existing meta if they don't exist
    if (!Object.hasOwn(meta, "permitUrl")) {
      meta.permitUrl = "";
    }
    if (!Object.hasOwn(meta, "fireRules")) {
      meta.fireRules = "";
    }
    if (!Object.hasOwn(meta, "permitDeadline")) {
      meta.permitDeadline = "";
    }

    // Add new location fields to existing meta if they don't exist
    if (!Object.hasOwn(meta, "destinationAddress")) {
      meta.destinationAddress = "";
    }
    if (!Object.hasOwn(meta, "destinationPlaceId")) {
      meta.destinationPlaceId = "";
    }
    if (!Object.hasOwn(meta, "destinationLat")) {
      meta.destinationLat = "";
    }
    if (!Object.hasOwn(meta, "destinationLng")) {
      meta.destinationLng = "";
    }

    // If loaded from default (metaRaw is null), save it immediately
    if (!metaRaw) {
      try {
        localStorage.setItem(STORAGE_META, JSON.stringify(meta));
      } catch (saveError) {
        // Handle potential quota error during the *initial* save
        if (
          saveError instanceof DOMException &&
          saveError.name === "QuotaExceededError"
        ) {
          showErrorDialog(
            "Could not save initial trip info. Storage space may be full."
          );
        } else {
          console.error("Error saving initial meta data:", saveError);
          showErrorDialog(
            "An unexpected error occurred saving the initial trip info."
          );
        }
      }
    }
  } catch (error) {
    console.error("Error loading meta data:", error);
    showErrorDialog("Could not load saved trip info. Using defaults.");
    meta = { ...DEFAULT_META }; // Fallback on error
    // Attempt to overwrite corrupted data with default
    try {
      localStorage.setItem(STORAGE_META, JSON.stringify(meta));
    } catch (overwriteError) {
      if (
        overwriteError instanceof DOMException &&
        overwriteError.name === "QuotaExceededError"
      ) {
        showErrorDialog(
          "Storage full: Could not even save the default trip info."
        );
      } else {
        console.error(
          "Error overwriting meta data with default:",
          overwriteError
        );
        // No need for another dialog here
      }
    }
  }

  // Load collapsed sections state
  try {
    const collapsedRaw = localStorage.getItem(STORAGE_COLLAPSED);
    if (collapsedRaw) {
      const collapsedArray = JSON.parse(collapsedRaw);
      if (Array.isArray(collapsedArray)) {
        collapsedSections = new Set(collapsedArray);
      }
    }
    // If nothing is stored, collapsedSections remains an empty Set (default: all expanded)
  } catch (error) {
    console.error("Error loading collapsed sections state:", error);
    collapsedSections = new Set(); // Fallback to empty Set on error
  }

  // Load theme preference
  try {
    theme = localStorage.getItem(STORAGE_THEME) || "system"; // Default to system
  } catch (error) {
    console.error("Error loading theme preference:", error);
    theme = "system"; // Fallback
  }

  // Clear history on initial load
  undoStack = [];
  redoStack = [];
  // Can't call updateUndoRedoButtons() here as UI might not be ready
}

function saveListState() {
  try {
    localStorage.setItem(STORAGE_LIST, JSON.stringify(data));
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      showErrorDialog(
        "Could not save checklist changes. Storage space is full. Please remove some items or clear other website data."
      );
    } else {
      console.error("Error saving checklist data:", error);
      showErrorDialog(
        "An unexpected error occurred while saving the checklist. Please try again."
      );
    }
  }
  saveMetaState();
}

function saveMetaState() {
  try {
    localStorage.setItem(STORAGE_META, JSON.stringify(meta));
  } catch (error) {
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      showErrorDialog(
        "Could not save trip info changes. Storage space is full. Please remove some items or clear other website data."
      );
    } else {
      console.error("Error saving meta data:", error);
      showErrorDialog(
        "An unexpected error occurred while saving the trip info. Please try again."
      );
    }
  }
}

// Save the set of collapsed section IDs
function saveCollapsedState() {
  try {
    const collapsedArray = Array.from(collapsedSections); // Convert Set to Array for storage
    localStorage.setItem(STORAGE_COLLAPSED, JSON.stringify(collapsedArray));
  } catch (error) {
    // Don't show error dialog for this, just log it. It's non-critical.
    console.error("Error saving collapsed sections state:", error);
  }
}

// Add or remove a section ID from the collapsed set
function updateCollapsedState(sectionId, isCollapsed) {
  _saveStateForUndo(); // Save state BEFORE mutation
  if (isCollapsed) {
    collapsedSections.add(sectionId);
  } else {
    collapsedSections.delete(sectionId);
  }
  saveCollapsedState(); // Persist the change
}

function updateMetaState(newMeta) {
  _saveStateForUndo(); // Save state BEFORE mutation
  meta = { ...newMeta };
  saveMetaState();
}

// Save theme preference to localStorage
function saveThemeState() {
  try {
    localStorage.setItem(STORAGE_THEME, theme);
  } catch (error) {
    // Non-critical, just log
    console.error("Error saving theme preference:", error);
  }
}

// Update the current theme state
function updateThemeState(newTheme) {
  if (["light", "dark", "system"].includes(newTheme)) {
    theme = newTheme;
    saveThemeState();
  } else {
    console.warn("Invalid theme value provided:", newTheme);
  }
}

/***************** STATE UTILS *****************/
function findItemState(id) {
  for (const g of data) {
    const idx = g.items.findIndex((i) => i.id === id);
    if (idx > -1) return { g, idx, item: g.items[idx] };
  }
  return null;
}

function updateItemCheckedState(id, checked) {
  const itemContext = findItemState(id);
  if (itemContext) {
    _saveStateForUndo(); // Save state BEFORE mutation
    itemContext.item.checked = checked;
    saveListState();
    return true;
  }
  return false;
}

function addItemState(groupId, text) {
  const group = data.find((g) => g.id === groupId);
  if (group) {
    _saveStateForUndo(); // Save state BEFORE mutation
    const newItem = {
      id: `${groupId}-${Date.now()}`,
      text,
      checked: false,
      note: "",
      requires: [],
      weight: 0,
      packed: false,
      cost: 0, // Add cost field
    };
    group.items.push(newItem);
    saveListState();
    return newItem;
  }
  return null;
}

function deleteItemState(id) {
  for (const g of data) {
    const idx = g.items.findIndex((i) => i.id === id);
    if (idx > -1) {
      _saveStateForUndo(); // Save state BEFORE mutation
      g.items.splice(idx, 1);
      saveListState();
      return true;
    }
  }
  return false;
}

function updateItemTextState(id, text) {
  const itemContext = findItemState(id);
  if (itemContext) {
    _saveStateForUndo(); // Save state BEFORE mutation
    itemContext.item.text = text;
    saveListState();
    return true;
  }
  return false;
}

function updateItemNoteState(id, note) {
  const itemContext = findItemState(id);
  if (itemContext) {
    _saveStateForUndo(); // Save state BEFORE mutation
    itemContext.item.note = note;
    saveListState();
    return true;
  }
  return false;
}

function moveItemState(itemId, targetItemId) {
  const srcCtx = findItemState(itemId);
  const tgtCtx = findItemState(targetItemId);
  if (srcCtx && tgtCtx) {
    _saveStateForUndo(); // Save state BEFORE mutation
    // Remove from original position
    srcCtx.g.items.splice(srcCtx.idx, 1);
    // Insert at target position (adjust index if target was after source in same group)
    const insertIndex =
      srcCtx.g === tgtCtx.g && srcCtx.idx < tgtCtx.idx
        ? tgtCtx.idx - 1
        : tgtCtx.idx;
    tgtCtx.g.items.splice(insertIndex, 0, srcCtx.item);
    saveListState();
    return true;
  }
  return false;
}

function moveSectionState(sourceSectionId, targetSectionId) {
  const sourceIndex = data.findIndex((g) => g.id === sourceSectionId);
  const targetIndex = data.findIndex((g) => g.id === targetSectionId);

  if (sourceIndex > -1 && targetIndex > -1 && sourceIndex !== targetIndex) {
    _saveStateForUndo(); // Save state BEFORE mutation
    // Remove the source section from its original position
    const [movedSection] = data.splice(sourceIndex, 1);

    // Insert the moved section at the target index
    // Note: The targetIndex might need adjustment if source was before target
    const adjustedTargetIndex =
      sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    data.splice(adjustedTargetIndex, 0, movedSection);

    saveListState(); // Save the new order
    return true;
  }
  console.warn(
    "Could not move section: invalid IDs or indices",
    sourceSectionId,
    targetSectionId
  );
  return false;
}

async function resetAllState() {
  // DON'T save state before reset, just clear history
  undoStack = [];
  redoStack = [];
  // Update button state after clearing
  if (typeof updateUndoRedoButtons === "function") {
    updateUndoRedoButtons();
  }

  try {
    localStorage.removeItem(STORAGE_LIST);
    localStorage.removeItem(STORAGE_META);
  } catch (error) {
    // Log error, but don't prevent the rest of the reset
    console.error(
      "Error removing items from localStorage during reset:",
      error
    );
  }
  data = await fetchDefaultList();
  meta = { ...DEFAULT_META };
  saveListState(); // Save the newly fetched/default state
  saveMetaState();
}

// Creates and adds a new section (group) to the list
function addSectionState(title) {
  if (!title || !title.trim()) {
    console.error("Cannot add section with empty title.");
    return null;
  }
  _saveStateForUndo(); // Save state BEFORE mutation
  const newSection = {
    id: `section-${Date.now()}`,
    title: title.trim(),
    items: [], // New sections start with no items
  };
  data.push(newSection);
  saveListState();
  return newSection;
}

function updateSectionTitleState(sectionId, newTitle) {
  const section = data.find((g) => g.id === sectionId);
  if (section && newTitle && newTitle.trim()) {
    _saveStateForUndo(); // Save state BEFORE mutation
    section.title = newTitle.trim();
    saveListState();
    return true;
  } else {
    console.error(
      "Could not update section title: Invalid ID or title",
      sectionId,
      newTitle
    );
    return false;
  }
}

function deleteSectionState(sectionId) {
  const index = data.findIndex((g) => g.id === sectionId);
  if (index > -1) {
    _saveStateForUndo(); // Save state BEFORE mutation
    data.splice(index, 1); // Remove section from data array
    collapsedSections.delete(sectionId); // Remove from collapsed set if present
    saveListState(); // Save the updated list
    saveCollapsedState(); // Save the updated collapsed set
    return true;
  } else {
    console.error("Could not delete section: Invalid ID", sectionId);
    return false;
  }
}

// --- History Management ---

// Capture current state for undo (call BEFORE mutation)
function _saveStateForUndo() {
  // Deep clone essential state parts
  const stateSnapshot = {
    data: structuredClone(data),
    meta: structuredClone(meta),
    collapsedSections: new Set(collapsedSections), // Clone the Set
  };

  undoStack.push(stateSnapshot);

  // Enforce history limit
  if (undoStack.length > MAX_HISTORY_SIZE) {
    undoStack.shift(); // Remove the oldest state
  }

  // Any new action clears the redo stack
  redoStack = [];

  // Update UI button states
  if (typeof updateUndoRedoButtons === "function") {
    updateUndoRedoButtons();
  } else {
    console.warn("updateUndoRedoButtons not available when saving state");
  }
}

// Restore a previous state from the stack
function _restoreState(stateSnapshot) {
  data = stateSnapshot.data;
  meta = stateSnapshot.meta;
  collapsedSections = stateSnapshot.collapsedSections;
  // Important: Do NOT save to localStorage here. Only update memory.
}

// Public Undo function
function undoState() {
  if (undoStack.length === 0) {
    console.log("Undo stack empty");
    return false; // Nothing to undo
  }

  // Save current state to redo stack BEFORE restoring
  const currentState = {
    data: structuredClone(data),
    meta: structuredClone(meta),
    collapsedSections: new Set(collapsedSections),
  };
  redoStack.push(currentState);

  // Pop and restore previous state
  const previousState = undoStack.pop();
  _restoreState(previousState);

  // Update UI button states
  if (typeof updateUndoRedoButtons === "function") {
    updateUndoRedoButtons();
  }
  console.log("Undo successful");
  return true;
}

// Public Redo function
function redoState() {
  if (redoStack.length === 0) {
    console.log("Redo stack empty");
    return false; // Nothing to redo
  }

  // Save current state to undo stack BEFORE restoring
  const currentState = {
    data: structuredClone(data),
    meta: structuredClone(meta),
    collapsedSections: new Set(collapsedSections),
  };
  undoStack.push(currentState);
  // Enforce history limit on undo stack again
  if (undoStack.length > MAX_HISTORY_SIZE) {
    undoStack.shift();
  }

  // Pop and restore next state
  const nextState = redoStack.pop();
  _restoreState(nextState);

  // Update UI button states
  if (typeof updateUndoRedoButtons === "function") {
    updateUndoRedoButtons();
  }
  console.log("Redo successful");
  return true;
}

// Check if undo/redo is possible (for UI button state)
function canUndo() {
  return undoStack.length > 0;
}

function canRedo() {
  return redoStack.length > 0;
}

// --- End History Management ---

// Helper function to get current state and dispatch
function getState() {
  return {
    state: {
      // For compatibility with our existing code, we return the data array directly
      lists: { [0]: data },
      currentListId: 0,
    },
    dispatch: (action) => {
      if (action.type === "UPDATE_ITEM") {
        const itemContext = findItemState(action.payload.itemId);
        if (itemContext) {
          _saveStateForUndo(); // Save state before mutation
          // Update the item with all properties from payload item
          Object.assign(itemContext.item, action.payload.item);
          saveListState();
          return true;
        }
        return false;
      }
      // Add more action types as needed
      return false;
    },
  };
}

// Export necessary functions and state variables
export {
  data,
  meta,
  collapsedSections, // Export the set
  theme, // Export theme state
  loadAllState,
  saveListState, // May not be needed externally if mutations handle saving
  saveMetaState, // May not be needed externally if mutations handle saving
  updateMetaState,
  updateCollapsedState, // Export the update function
  updateThemeState, // Export theme update function
  undoState, // Export Undo
  redoState, // Export Redo
  canUndo, // Export check
  canRedo, // Export check
  findItemState,
  updateItemCheckedState,
  addItemState,
  addSectionState, // Export the new function
  deleteItemState,
  deleteSectionState, // Export the new function
  updateItemTextState,
  updateItemNoteState,
  moveItemState,
  moveSectionState,
  resetAllState,
  updateSectionTitleState, // Export the new function
  getState, // Export getState function
  getMeta, // Export getMeta function
};

// Add a getter function for meta
function getMeta() {
  return meta;
}
