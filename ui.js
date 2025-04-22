// Import state and state manipulation functions
import {
  data,
  meta,
  updateThemeState,
  collapsedSections,
  updateMetaState,
  updateItemCheckedState,
  addItemState,
  addSectionState,
  deleteItemState,
  deleteSectionState,
  updateItemTextState,
  updateItemNoteState,
  updateCollapsedState,
  updateSectionTitleState,
  undoState,
  redoState,
  canUndo,
  canRedo,
  resetAllState,
  findItemState,
  saveListState,
} from "./state.js";

/***************** UI UTILS *****************/
const $ = (id) => document.getElementById(id);

// Use DOMPurify (loaded in index.html) for robust sanitization
// Configure to return safe HTML string suitable for innerHTML
const sanitize = (s) =>
  DOMPurify.sanitize(s, {
    USE_PROFILES: { html: true }, // Ensure it outputs safe HTML, not just text
  });

const btnTheme = $("btnTheme"); // Get theme button reference
const filterInput = $("filterInput"); // Get filter input reference
const btnClearFilter = $("btnClearFilter"); // Get clear button reference

/***************** RENDER META PANEL *****************/
function renderMeta() {
  const container = $("metaContainer");
  if (!container) return; // Guard against missing element

  const html = `<section class="card meta-card">
    <h2 style="cursor:default">Trip Info</h2>
    <div class="meta-grid">
      <div class="label">Destination</div><div>${sanitize(meta.destination) || "–"}</div>
      <div class="label">Start Date</div><div>${meta.startDate || "–"}</div>
      <div class="label">End Date</div><div>${meta.endDate || "–"}</div>
      <div class="label">Notes</div><div>${sanitize(meta.notes) || "–"}</div>
    </div>
    <button id="editMetaBtn" class="secondary" style="margin-top:1rem">Edit Trip Info</button>
  </section>`;

  container.innerHTML = html;
  // Re-attach listener after innerHTML overwrite
  const editBtn = $("editMetaBtn");
  if (editBtn) {
    editBtn.onclick = openMetaDialog;
  } else {
    console.error("Could not find #editMetaBtn after rendering meta panel.");
  }
}

// Added for error dialog
const errorDialog = $("errorDialog");
const errorMessageElement = $("errorMessage");
// Added for note dialog
const noteDialog = $("noteDialog");
const noteForm = $("noteForm");
const noteDialogItemText = $("noteDialogItemText");

function showErrorDialog(message) {
  if (!errorDialog || !errorMessageElement) {
    console.error("Error dialog elements not found!");
    alert(message); // Fallback to alert
    return;
  }
  errorMessageElement.textContent = message;
  errorDialog.showModal();
}

function openMetaDialog() {
  const dlg = $("metaDialog");
  const f = $("metaForm");
  if (!dlg || !f) return; // Guard against missing elements

  f.destination.value = meta.destination;
  f.startDate.value = meta.startDate;
  f.endDate.value = meta.endDate;
  f.notes.value = meta.notes;
  dlg.showModal();
}

// Added function to open and populate the note dialog
function openNoteDialog(itemId, itemText, currentNote) {
  const dialog = $("noteDialog");
  const titleEl = $("noteDialogItemText");
  const form = $("noteForm");
  const noteInput = form.querySelector('[name="noteText"]');
  const idField = form.querySelector('[name="itemId"]');

  if (dialog && titleEl && form && noteInput && idField) {
    titleEl.textContent = itemText;
    noteInput.value = currentNote || "";
    idField.value = itemId;
    dialog.showModal(); // Show the dialog
  }
}

// Add the new openWeightDialog function
function openWeightDialog(itemId, itemText, currentWeight, isPacked) {
  const dialog = $("weightDialog");
  const titleEl = $("weightDialogItemText");
  const form = $("weightForm");
  const weightInput = form.querySelector('[name="itemWeight"]');
  const packedInput = form.querySelector('[name="itemPacked"]');
  const idField = form.querySelector('[name="itemId"]');

  if (dialog && titleEl && form && weightInput && packedInput && idField) {
    titleEl.textContent = itemText;
    weightInput.value = currentWeight || 0;
    packedInput.checked = !!isPacked;
    idField.value = itemId;
    dialog.showModal(); // Show the dialog
  }
}

// Add a function to handle weight updates
function updateItemWeightState(id, weight, packed) {
  const itemContext = findItemState(id);
  if (itemContext) {
    // Save state before mutation for undo
    _saveStateForUndo();

    itemContext.item.weight = weight;
    itemContext.item.packed = packed;
    saveListState();

    // Re-render (or update just UI)
    renderList();
    calculateAndDisplayWeights(); // Update the weight totals display
    return true;
  }
  return false;
}

// Add function to calculate weight totals and update the sidebar
function calculateAndDisplayWeights() {
  const totalWeightEl = $("totalWeight");
  const packedWeightEl = $("packedWeight");
  const sectionWeightsEl = $("weightBySection");

  if (!totalWeightEl || !packedWeightEl || !sectionWeightsEl) return;

  let totalWeight = 0;
  let packedWeight = 0;

  // Build section weights HTML
  let sectionWeightsHTML = "";

  data.forEach((section) => {
    let sectionTotal = 0;
    let sectionPacked = 0;

    section.items.forEach((item) => {
      if (typeof item.weight === "number") {
        sectionTotal += item.weight;
        totalWeight += item.weight;

        if (item.packed) {
          sectionPacked += item.weight;
          packedWeight += item.weight;
        }
      }
    });

    // Only show sections with weight > 0
    if (sectionTotal > 0) {
      sectionWeightsHTML += `
        <div class="weight-section">
          <div class="weight-section-title">${sanitize(section.title)}</div>
          <div class="weight-section-value">
            <span>Total: ${sectionTotal}g</span>
            <span>Packed: ${sectionPacked}g</span>
          </div>
        </div>
      `;
    }
  });

  // Update displays
  totalWeightEl.textContent = `${totalWeight}g`;
  packedWeightEl.textContent = `${packedWeight}g`;
  sectionWeightsEl.innerHTML = sectionWeightsHTML;
}

// Toggle weight sidebar visibility
function toggleWeightSidebar() {
  const sidebar = $("weightSidebar");
  if (sidebar) {
    sidebar.classList.toggle("collapsed");
    // Could save preference to localStorage here
  }
}

function noteHTML(n) {
  return n
    ? `<details class="details-note"><summary>Notes</summary><div>${sanitize(n)}</div></details>`
    : "";
}

function renderList() {
  const container = $("checklistContainer");
  if (!container) return; // Guard

  const html = data
    .map((g) => {
      // Check if this section should be rendered as collapsed
      const isCollapsed = collapsedSections.has(g.id);
      const chevronIcon = isCollapsed ? "▸" : "▾";
      const listClass = isCollapsed ? "checklist collapsed" : "checklist";

      return `<section class="card" data-group="${g.id}">
          <h2>
            <span class="sectionHandle" draggable="true">☰</span>
            <span class="sectionTitle">${sanitize(g.title)}</span>
            <button class="btnEditSection" title="Edit Section Title">✎</button>
            <button class="btnDeleteSection" title="Delete Section">✕</button>
            <span class="chevron">${chevronIcon}</span>
          </h2>
          <ul class="${listClass}">${g.items
            .map((it) => {
              const hasNote = !!it.note;
              const cbId = `cb-${it.id}`;
              return `<li class="item ${it.checked ? "checked" : ""}" data-id="${it.id}">
                <span class="handle" draggable="true">☰</span>
                <input type="checkbox" id="${cbId}" ${it.checked ? "checked" : ""}>
                <div class="item-body">
                  <label for="${cbId}">${sanitize(it.text)}</label>
                  ${noteHTML(it.note)}
                </div>
                <span class="actions">
                  <button class="btnNote ${hasNote ? "has-note" : ""}" title="Edit Note">🗒︎</button>
                  <button class="btnWeight ${it.weight > 0 ? "has-weight" : ""}" title="Edit Weight">⚖️</button>
                  <button class="btnEdit" title="Edit Item">✎</button>
                  <button class="btnDel" title="Delete Item">✕</button>
                </span>
              </li>`;
            })
            .join("")}</ul>
          <form class="addItem" data-group="${g.id}">
            <input type="text" placeholder="Add new item..." required>
            <button type="submit">Add</button>
          </form>
        </section>`;
    })
    .join("");
  container.innerHTML = html;
}

/***************** EVENT HANDLERS *****************/
function setupEventListeners() {
  const checklistContainer = $("checklistContainer");
  const metaDialog = $("metaDialog");
  const metaForm = $("metaForm");
  const addSectionForm = $("addSectionForm");

  // Use event delegation on a parent element where possible

  // Checklist item actions (check, add, edit, delete, note, collapse)
  if (checklistContainer) {
    checklistContainer.addEventListener("change", (e) => {
      if (e.target.type === "checkbox") {
        const li = e.target.closest("li.item");
        if (li) {
          const id = li.dataset.id;
          const checked = e.target.checked;
          // Find the item state *before* updating it for dependency check
          const itemContext = findItemState(id);
          if (updateItemCheckedState(id, checked)) {
            li.classList.toggle("checked", checked);
            updateUndoRedoButtons();

            // Check dependencies ONLY if the item was just checked
            if (
              checked &&
              itemContext &&
              itemContext.item.requires &&
              itemContext.item.requires.length > 0
            ) {
              let missingDeps = [];
              itemContext.item.requires.forEach((requiredId) => {
                const requiredItemContext = findItemState(requiredId);
                // Check if required item exists and is NOT checked
                if (requiredItemContext && !requiredItemContext.item.checked) {
                  missingDeps.push(requiredItemContext.item.text);
                }
              });
              if (missingDeps.length > 0) {
                // Use toast notification instead of error dialog
                showToast(
                  `Reminder: You might also need: ${missingDeps.join(", ")}`,
                  5000,
                  "warning" // 5 sec duration, warning type
                );
              }
            }
          }
        }
      }
    });

    checklistContainer.addEventListener("submit", (e) => {
      if (e.target.matches("form.addItem")) {
        e.preventDefault();
        const form = e.target;
        const input = form.querySelector('input[type="text"]');
        const gId = form.dataset.group;
        const txt = input.value.trim();
        if (txt && gId) {
          if (addItemState(gId, txt)) {
            renderList();
            updateUndoRedoButtons();
            input.value = "";
          } // else: handle error?
        }
      }
    });

    checklistContainer.addEventListener("click", (e) => {
      const target = e.target;
      const li = target.closest("li.item");
      const sectionCard = target.closest("section.card"); // Get section card

      let stateChanged = false; // Flag to track if re-render is needed

      if (target.classList.contains("btnDel") && li) {
        if (confirm("Delete item?")) {
          if (deleteItemState(li.dataset.id)) {
            stateChanged = true;
          }
        }
      } else if (target.classList.contains("btnEdit") && li) {
        const id = li.dataset.id;
        const itemContext = findItemState(id); // Need findItemState from state.js
        if (itemContext) {
          const t = prompt("Edit item text", itemContext.item.text);
          if (t !== null && t.trim()) {
            if (updateItemTextState(id, t.trim())) {
              stateChanged = true;
            }
          }
        }
      } else if (target.classList.contains("btnNote") && li) {
        const id = li.dataset.id;
        const itemContext = findItemState(id); // Need findItemState from state.js
        if (itemContext) {
          // Replace prompt() with call to openNoteDialog
          openNoteDialog(id, itemContext.item.text, itemContext.item.note);
        }
      } else if (target.classList.contains("btnWeight") && li) {
        const id = li.dataset.id;
        const itemContext = findItemState(id);
        if (itemContext) {
          openWeightDialog(
            id,
            itemContext.item.text,
            itemContext.item.weight || 0,
            itemContext.item.packed || false
          );
        }
      } else if (target.classList.contains("chevron")) {
        const sectionContent = sectionCard?.querySelector("ul.checklist"); // Use querySelector within the card
        const sectionId = sectionCard?.dataset.group;

        if (sectionContent && sectionId) {
          const isNowCollapsed = sectionContent.classList.toggle("collapsed");
          target.textContent = isNowCollapsed ? "▸" : "▾";
          // Call state update function
          updateCollapsedState(sectionId, isNowCollapsed);
        }
      } else if (target.classList.contains("btnEditSection") && sectionCard) {
        const sectionId = sectionCard.dataset.group;
        const currentTitleElement = sectionCard.querySelector(".sectionTitle"); // Find title span
        const currentTitle = currentTitleElement
          ? currentTitleElement.textContent
          : ""; // Get current text

        if (sectionId) {
          const newTitle = prompt("Edit section title:", currentTitle);
          if (newTitle !== null && newTitle.trim()) {
            if (updateSectionTitleState(sectionId, newTitle.trim())) {
              stateChanged = true;
            }
          }
        }
      } else if (target.classList.contains("btnDeleteSection") && sectionCard) {
        const sectionId = sectionCard.dataset.group;
        const sectionTitle =
          sectionCard.querySelector(".sectionTitle")?.textContent ||
          "this section";

        // Confirm deletion
        if (
          sectionId &&
          confirm(
            `Are you sure you want to delete the section "${sectionTitle}" and all its items?`
          )
        ) {
          if (deleteSectionState(sectionId)) {
            stateChanged = true;
          } else {
            // Optional: Show error if deletion failed in state
            showErrorDialog("Could not delete the section. Please try again.");
          }
        }
      } else if (target.classList.contains("btnToggleWeightSidebar")) {
        toggleWeightSidebar();
      }

      // Re-render and update buttons if state changed
      if (stateChanged) {
        renderList();
        updateUndoRedoButtons();
      }
    });
  }

  // Add Section Form submission
  if (addSectionForm) {
    addSectionForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const titleInput = $("newSectionTitle"); // Assuming this is the ID of the input
      const title = titleInput?.value.trim();
      if (title && addSectionState(title)) {
        renderList(); // Re-render to show the new section
        updateUndoRedoButtons();
        titleInput.value = ""; // Clear the input
      } else if (title) {
        console.error("Failed to add section state for title:", title);
        showErrorDialog("Could not add the new section. Please try again.");
      }
    });
  }

  // Filter Input Listener (NEW)
  if (filterInput) {
    filterInput.addEventListener("input", (e) => {
      filterItems(e.target.value);
    });

    // Prevent form submission if inside a form
    filterInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
      }
    });
  }

  // Clear Filter Button Listener (NEW)
  if (btnClearFilter && filterInput) {
    btnClearFilter.onclick = () => {
      filterInput.value = "";
      filterItems(""); // Re-apply filter with empty query
      filterInput.focus(); // Keep focus on input
    };
  }

  // Error Dialog close button (add this)
  if (errorDialog) {
    // Assumes the form inside the dialog handles the closing via method="dialog"
    // If not, you'd add a click listener to the close button here.
    // Example:
    // const closeButton = errorDialog.querySelector('button[value="close"]');
    // if (closeButton) {
    //   closeButton.addEventListener('click', () => errorDialog.close());
    // }
  }

  // Note Dialog form submission (add this)
  if (noteForm && noteDialog) {
    noteForm.addEventListener("submit", (e) => {
      console.log("noteForm submitted", e);
      // Default behavior for submit in a method="dialog" form is to close.
      // We need to prevent that only if saving fails, but here we assume success.
      const itemId = noteForm.itemId.value;
      const newNoteText = noteForm.noteText.value.trim(); // Trim whitespace
      if (itemId && updateItemNoteState(itemId, newNoteText)) {
        renderList(); // Re-render the list to show updated note/indicator
        updateUndoRedoButtons();
      } else {
        console.error("Failed to update note state for item ID:", itemId);
        // Optionally show an error
      }
      // No need to call noteDialog.close() because method="dialog" handles it on submit
      // unless e.preventDefault() was called.
    });

    noteDialog.addEventListener("close", (e) => {
      console.log("noteDialog closed", e);
      // Clear the form/item text when dialog closes
      noteDialogItemText.textContent = "";
      noteForm.reset(); // Clears textarea and hidden input
    });
  }

  // Meta Dialog actions
  if (metaForm && metaDialog) {
    metaForm.addEventListener("submit", (e) => {
      console.log("metaForm submitted", e);
      // Don't prevent default immediately, only if validation fails
      const fd = new FormData(metaForm);
      const startDate = fd.get("startDate");
      const endDate = fd.get("endDate");

      // Validate dates: Only if both are present and end is before start
      if (startDate && endDate && endDate < startDate) {
        e.preventDefault(); // Prevent form submission and dialog closing
        showErrorDialog("End date cannot be before the start date.");
        return; // Stop processing
      }

      // If validation passes, proceed with update
      const newMeta = {
        destination: fd.get("destination").trim(),
        startDate: startDate, // Use the already retrieved value
        endDate: endDate, // Use the already retrieved value
        notes: fd.get("notes").trim(),
      };
      updateMetaState(newMeta);
      renderMeta(); // Re-render the meta display
      updateUndoRedoButtons();
      metaDialog.close(); // Close dialog programmatically IF validation passes
    });

    metaDialog.addEventListener("reset", (e) => {
      console.log("metaDialog reset", e);
      // The default behavior for reset in a dialog is to close it.
      // No need to call close() explicitly unless preventing default.
    });

    metaDialog.addEventListener("close", (e) => {
      console.log("metaDialog closed", e);
      // Handle anything needed when the dialog closes, regardless of how
      // For example, maybe reset scroll position
    });
  }

  // General page controls
  const btnReset = $("btnReset");
  if (btnReset) {
    btnReset.onclick = async () => {
      if (!confirm("Reset checklist and trip info?")) return;
      await resetAllState();
      renderMeta();
      renderList();
      updateUndoRedoButtons();
    };
  }

  // Add listeners for Undo/Redo buttons
  const btnUndo = $("btnUndo");
  const btnRedo = $("btnRedo");
  if (btnUndo) {
    btnUndo.onclick = () => {
      if (undoState()) {
        renderList();
        renderMeta();
        updateUndoRedoButtons();
      }
    };
  }
  if (btnRedo) {
    btnRedo.onclick = () => {
      if (redoState()) {
        renderList();
        renderMeta();
        updateUndoRedoButtons();
      }
    };
  }

  // Add Keyboard listener for Undo/Redo
  document.addEventListener("keydown", (e) => {
    // Check for Ctrl+Z or Cmd+Z (Undo)
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault(); // Prevent browser's default undo
      btnUndo?.click(); // Simulate click on the button
    }
    // Check for Ctrl+Y or Cmd+Shift+Z (Redo)
    else if (
      (e.ctrlKey && e.key === "y") ||
      (e.metaKey && e.shiftKey && e.key === "z")
    ) {
      e.preventDefault(); // Prevent browser's default redo
      btnRedo?.click(); // Simulate click on the button
    }
  });

  // Add Listener for Theme Toggle button
  if (btnTheme) {
    btnTheme.onclick = () => {
      const currentIsDark = document.documentElement.classList.contains("dark");
      const nextTheme = currentIsDark ? "light" : "dark";
      updateThemeState(nextTheme);
      applyTheme(nextTheme);
    };
  }

  // Set initial button state
  updateUndoRedoButtons();

  const btnPrint = $("btnPrint");
  if (btnPrint) {
    btnPrint.onclick = () => window.print();
  }

  // Weight Dialog Submission
  const weightDialog = $("weightDialog");
  const weightForm = $("weightForm");

  if (weightDialog && weightForm) {
    weightForm.addEventListener("submit", (e) => {
      // For <dialog> forms, default action is to close
      // Extract form values for later handling
      const itemId = e.target.querySelector('[name="itemId"]').value;
      const weight =
        Number(e.target.querySelector('[name="itemWeight"]').value) || 0;
      const packed = e.target.querySelector('[name="itemPacked"]').checked;

      // Since dialog will close automatically, this needs to be handled
      // after the dialog is closed to maintain proper UI state
      setTimeout(() => {
        if (updateItemWeightState(itemId, weight, packed)) {
          updateUndoRedoButtons();
        }
      }, 0);
    });

    // For cancel button - handled automatically by <dialog>
  }

  // Initial calculation
  calculateAndDisplayWeights();
}

// Added function to update undo/redo button states
const btnUndo = $("btnUndo");
const btnRedo = $("btnRedo");
function updateUndoRedoButtons() {
  if (btnUndo) btnUndo.disabled = !canUndo();
  if (btnRedo) btnRedo.disabled = !canRedo();
}

// --- Theme Application ---
function applyTheme(themePreference) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let applyDark = false;

  if (themePreference === "dark") {
    applyDark = true;
  } else if (themePreference === "light") {
    applyDark = false;
  } else {
    // 'system'
    applyDark = prefersDark;
  }

  document.documentElement.classList.toggle("dark", applyDark);

  // Update button icon
  if (btnTheme) {
    btnTheme.textContent = applyDark ? "☀️" : "🌙";
    btnTheme.title = applyDark
      ? "Switch to Light Theme"
      : "Switch to Dark Theme";
  }
}
// --- End Theme Application ---

// --- Toast Notification Logic ---
const toastContainer = $("toastContainer");

function showToast(message, duration = 3000, type = "info") {
  if (!toastContainer) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`; // Add type class (e.g., 'warning', 'error')
  toast.textContent = message; // message is already sanitized where needed before calling

  toastContainer.appendChild(toast);

  // Trigger reflow to enable transition
  toast.offsetHeight;

  // Add class to fade in
  toast.classList.add("show");

  // Set timeout to remove the toast
  setTimeout(() => {
    toast.classList.remove("show");
    // Remove element after fade out transition completes
    toast.addEventListener("transitionend", () => {
      if (toast.parentNode === toastContainer) {
        // Check if still attached
        toastContainer.removeChild(toast);
      }
    });
  }, duration);
}
// --- End Toast Notification Logic ---

// --- Filter Logic ---
function filterItems(query) {
  const searchTerm = query.toLowerCase().trim();
  const items = document.querySelectorAll("#checklistContainer li.item");
  let matchCount = 0;
  const sanitizeForMark = (str) =>
    DOMPurify.sanitize(str, {
      USE_PROFILES: { html: true },
      ADD_TAGS: ["mark"],
    });

  // Clear existing highlights first
  document.querySelectorAll("#checklistContainer mark").forEach((mark) => {
    const parent = mark.parentNode;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
    parent.normalize(); // Merge adjacent text nodes
  });

  items.forEach((item) => {
    const itemId = item.dataset.id;
    const itemState = findItemState(itemId); // Find original state for text
    if (!itemState) return; // Should not happen, but safety check

    const label = item.querySelector("label");
    const noteDiv = item.querySelector(".details-note div");

    // Always start with original, unsanitized text from state
    const originalItemText = itemState.item.text;
    const originalNoteText = itemState.item.note;

    let isMatch = false;
    let finalItemHTML = sanitize(originalItemText); // Default: sanitized original text
    let finalNoteHTML = sanitize(originalNoteText); // Default: sanitized original note

    if (searchTerm !== "") {
      // Escape regex special characters in the search term
      const escapedSearchTerm = searchTerm.replace(
        /[-/\\^$*+?.()|[\]{}]/g,
        "\\$&"
      );
      const regex = new RegExp(escapedSearchTerm, "ig"); // case-insensitive, global
      const itemTextLower = originalItemText.toLowerCase();
      const noteTextLower = originalNoteText.toLowerCase();

      isMatch =
        itemTextLower.includes(searchTerm) ||
        noteTextLower.includes(searchTerm);

      if (isMatch) {
        // Apply highlighting only if matched
        finalItemHTML = sanitizeForMark(
          originalItemText.replace(regex, (match) => `<mark>${match}</mark>`)
        );
        finalNoteHTML = originalNoteText
          ? sanitizeForMark(
              originalNoteText.replace(
                regex,
                (match) => `<mark>${match}</mark>`
              )
            )
          : "";
      }
    } else {
      isMatch = true; // Show all items if search is empty
    }

    // Update DOM
    if (label) label.innerHTML = finalItemHTML;
    if (noteDiv) noteDiv.innerHTML = finalNoteHTML;
    item.classList.toggle("filtered-out", !isMatch);

    if (isMatch) {
      matchCount++;
    }
  });

  // Show/hide clear button
  if (btnClearFilter) {
    btnClearFilter.hidden = searchTerm === "";
  }

  // Show/hide "No results" message
  const filterMessage = $("filterMessage");
  if (filterMessage) {
    if (searchTerm !== "" && matchCount === 0) {
      filterMessage.textContent = `No items match "${sanitize(searchTerm)}"`;
      filterMessage.hidden = false;
    } else {
      filterMessage.hidden = true;
    }
  }
}
// --- End Filter Logic ---

// Export functions needed by other modules (like main.js)
export {
  renderMeta,
  renderList,
  setupEventListeners,
  updateUndoRedoButtons,
  openMetaDialog,
  showErrorDialog,
  applyTheme,
  showToast,
  calculateAndDisplayWeights, // Export for potential usage
};

// For internal state management like undo/redo
// Using underscore prefix to match the convention in state.js
const _saveStateForUndo = () => {
  // Call undoState's preparatory function if available
  if (typeof undoState === "function") {
    // Just trigger undo/redo button updates, actual state saving happens in state.js
    updateUndoRedoButtons();
  }
};
