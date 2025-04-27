// Import state and state manipulation functions
import {
  data,
  theme,
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
  getState,
  saveMetaState,
  saveListState, // Keep if used by updateItemWeightState
  getMeta, // Add new import for getMeta function
} from "./state.js";

/***************** UI UTILS *****************/
const $ = (id) => document.getElementById(id);

// Use DOMPurify (loaded in index.html) for robust sanitization
// Configure to return safe HTML string suitable for innerHTML
const sanitize = (s) =>
  DOMPurify.sanitize(s, {
    USE_PROFILES: { html: true }, // Ensure it outputs safe HTML, not just text
  });

/***************** RENDER META PANEL *****************/
function renderMeta() {
  let container = $("metaContainer");

  // Use getMeta() to get the current state
  const currentMeta = getMeta();

  // LOG 2: Check the value renderMeta is about to use
  console.log(
    "[renderMeta] Reading meta.destination:",
    currentMeta.destination
  );
  // Use meta.destination (which should hold the formatted address)
  const displayDestination = currentMeta.destination || "–";

  const html = `<section class="sidebar-section">
    <h2 style="cursor:default">Trip Info</h2>
    <div class="meta-grid">
      <div class="label">Destination</div><div>${sanitize(displayDestination)}</div>
      <div class="label">Start Date</div><div>${currentMeta.startDate ? formatDate(currentMeta.startDate) : "–"}</div>
      <div class="label">End Date</div><div>${currentMeta.endDate ? formatDate(currentMeta.endDate) : "–"}</div>
      <div class="label">Notes</div><div>${sanitize(currentMeta.notes) || "–"}</div>
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

  // Update permit information in the sidebar
  updatePermitInfo();
  updatePermitRequiredItems();
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
  let destinationInput = $("destinationInput");

  if (!dlg || !f) return; // Guard against missing elements

  // Get current meta state
  const currentMeta = getMeta();

  destinationInput.value = currentMeta.destination || "";

  // Populate standard fields
  f.startDate.value = currentMeta.startDate || "";
  f.endDate.value = currentMeta.endDate || "";
  f.notes.value = currentMeta.notes || "";
  if (f.permitUrl) f.permitUrl.value = currentMeta.permitUrl || "";
  if (f.permitDeadline)
    f.permitDeadline.value = currentMeta.permitDeadline || "";
  if (f.fireRules) f.fireRules.value = currentMeta.fireRules || "";

  // Populate hidden destination fields from state
  const addressHiddenInput = $("destinationAddressInput");
  const placeIdHiddenInput = $("destinationPlaceIdHidden");
  const latHiddenInput = $("destinationLatInput");
  const lngHiddenInput = $("destinationLngInput");
  const autocompleteElement = $("destinationAutocompleteElement");
  //input whose name not id is destinationAutocomplete
  let destinationAutocomplete = document.querySelector(
    'input[name="destinationAutocomplete"]'
  );
  console.log("destinationAutocomplete", destinationAutocomplete);
  //destinationAutocomplete.value = currentMeta.destination || "";

  if (addressHiddenInput)
    addressHiddenInput.value = currentMeta.destinationAddress || "";
  if (placeIdHiddenInput)
    placeIdHiddenInput.value = currentMeta.destinationPlaceId || "";
  if (latHiddenInput) latHiddenInput.value = currentMeta.destinationLat || "";
  if (lngHiddenInput) lngHiddenInput.value = currentMeta.destinationLng || "";

  // The Place Autocomplete Element is a web component that doesn't have a simple value property
  // We can only set the value through the selection event, but we can try to set some properties
  if (autocompleteElement && currentMeta.destination) {
    // Try setting the component's internal value as best we can
    try {
      // Experiment with updating visible input - note that this is a web component
      // so this might not work directly, but it's worth trying
      autocompleteElement.setAttribute(
        "data-initial-value",
        currentMeta.destination
      );

      // Log that we're trying to update the autocomplete element
      console.log(
        "Attempting to populate autocomplete with:",
        currentMeta.destination
      );

      // Note: Google's web components don't have a direct way to set their value programmatically,
      // so the user will likely need to re-select a place if editing an existing destination
    } catch (error) {
      console.warn("Error trying to set autocomplete value:", error);
    }
  }

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

/**
 * Opens the weight dialog with the current item values
 */
function openWeightDialog(
  id,
  text,
  weight,
  packed,
  cost,
  permitRequired,
  regulationNotes
) {
  const weightDialog = document.getElementById("weightDialog");
  const form = document.getElementById("weightForm");
  const itemText = document.getElementById("weightDialogItemText");

  if (!weightDialog || !form || !itemText) {
    console.error("Weight dialog elements not found!");
    return;
  }

  itemText.textContent = text;
  form.elements.itemId.value = id;
  form.elements.itemWeight.value = weight || ""; // Weight is stored in grams
  form.elements.itemPacked.checked = packed || false;
  form.elements.itemCost.value = cost || "";
  form.elements.permitRequired.checked = permitRequired || false;
  form.elements.regulationNotes.value = regulationNotes || "";

  weightDialog.showModal();
}

/**
 * Updates the weight and packed status of an item
 */
function updateItemWeightState(
  itemId,
  weight, // Assume weight passed in is in grams
  packed,
  cost,
  permitRequired,
  regulationNotes
) {
  const itemContext = findItemState(itemId);
  if (!itemContext) return false;

  const parsedWeight = parseFloat(weight) || 0; // Ensure it's a number (grams)
  const parsedCost = parseFloat(cost) || 0;

  // Save state BEFORE mutation for undo
  _saveStateForUndo();

  // Update item properties
  itemContext.item.weight = parsedWeight;
  itemContext.item.packed = packed;
  itemContext.item.cost = parsedCost;
  itemContext.item.permitRequired = permitRequired;
  itemContext.item.regulationNotes = regulationNotes || ""; // Ensure string

  // Save state
  saveListState(); // This now saves the updated item

  // Update UI (Consider more targeted updates later)
  renderList(); // Re-render might be needed to update weight/permit indicators
  calculateAndDisplayWeights();
  calculateAndDisplayCosts();
  updatePermitRequiredItems(); // Update permit items in sidebar

  return true;
}

// Toggle weight sidebar visibility
function toggleWeightSidebar() {
  const sidebar = $("weightSidebar");
  if (sidebar) {
    sidebar.classList.toggle("collapsed");
    // Could save preference to localStorage here
  }
}

// Unit conversion functions (Weight is always stored in grams)
function convertWeightFromGrams(weightInGrams, toUnit) {
  if (toUnit === "g") {
    return Math.round(weightInGrams); // Round grams to nearest integer
  } else if (toUnit === "kg") {
    return (weightInGrams / 1000).toFixed(2); // Keep 2 decimal places for kg
  } else if (toUnit === "lb") {
    return (weightInGrams / 453.592).toFixed(2); // Keep 2 decimal places for lb
  }
  return weightInGrams; // Fallback
}

function formatWeight(weightValue, unit) {
  return `${weightValue}${unit}`;
}

// Save weight unit preference
function saveWeightUnitPreference(unit) {
  try {
    localStorage.setItem("campChecklist_weightUnit", unit);
  } catch (error) {
    console.error("Error saving weight unit preference:", error);
  }
}

// Load weight unit preference
function loadWeightUnitPreference() {
  try {
    return localStorage.getItem("campChecklist_weightUnit") || "g"; // Default to grams
  } catch (error) {
    console.error("Error loading weight unit preference:", error);
    return "g";
  }
}

/**
 * Updates the weight summary in the sidebar
 */
function calculateAndDisplayWeights() {
  const totalWeightEl = $("totalWeight");
  const packedWeightEl = $("packedWeight");
  const sectionWeightsEl = $("weightBySection");
  const weightUnitSelect = $("weightUnit");

  if (!totalWeightEl || !packedWeightEl || !sectionWeightsEl) return;

  // Get selected unit
  const selectedUnit = weightUnitSelect ? weightUnitSelect.value : "g";

  let totalWeightGrams = 0;
  let packedWeightGrams = 0;

  // Build section weights HTML
  let sectionWeightsHTML = "";

  data.forEach((section) => {
    let sectionTotalGrams = 0;
    let sectionPackedGrams = 0;

    section.items.forEach((item) => {
      const itemWeightGrams = typeof item.weight === "number" ? item.weight : 0;
      sectionTotalGrams += itemWeightGrams;
      totalWeightGrams += itemWeightGrams;

      if (item.packed) {
        sectionPackedGrams += itemWeightGrams;
        packedWeightGrams += itemWeightGrams;
      }
    });

    // Only show sections with weight > 0
    if (sectionTotalGrams > 0) {
      // Convert section totals to selected unit for display
      const displaySectionTotal = convertWeightFromGrams(
        sectionTotalGrams,
        selectedUnit
      );
      const displaySectionPacked = convertWeightFromGrams(
        sectionPackedGrams,
        selectedUnit
      );

      sectionWeightsHTML += `
        <div class="weight-section">
          <div class="weight-section-title">${sanitize(section.title)}</div>
          <div class="weight-section-value">
            <span>Total: ${formatWeight(displaySectionTotal, selectedUnit)}</span>
            <span>Packed: ${formatWeight(displaySectionPacked, selectedUnit)}</span>
          </div>
        </div>
      `;
    }
  });

  // Convert total weights to selected unit for display
  const displayTotalWeight = convertWeightFromGrams(
    totalWeightGrams,
    selectedUnit
  );
  const displayPackedWeight = convertWeightFromGrams(
    packedWeightGrams,
    selectedUnit
  );

  // Update displays
  totalWeightEl.textContent = formatWeight(displayTotalWeight, selectedUnit);
  packedWeightEl.textContent = formatWeight(displayPackedWeight, selectedUnit);
  sectionWeightsEl.innerHTML = sectionWeightsHTML;
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
              const permitClass = it.permitRequired ? "item-with-permit" : "";
              const weightClass = it.weight > 0 ? "item-with-weight" : ""; // Add class if weight > 0
              return `<li class="item ${it.checked ? "checked" : ""} ${permitClass} ${weightClass}" data-id="${it.id}">
                <span class="handle" draggable="true">☰</span>
                <input type="checkbox" id="${cbId}" ${it.checked ? "checked" : ""}>
                <div class="item-body">
                  <label for="${cbId}">${sanitize(it.text)}</label>
                  ${noteHTML(it.note)}
                </div>
                <span class="actions">
                  <button class="btnNote ${hasNote ? "has-note" : ""}" title="Edit Note">🗒︎</button>
                  <button class="btnWeight ${it.weight > 0 ? "has-weight" : ""}" title="Edit Weight/Cost/Status">⚖️</button>
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
  let metaDialog = $("metaDialog");
  let metaForm = $("metaForm");
  let addSectionForm = $("addSectionForm");
  let btnTheme = $("btnTheme"); // Get theme button reference
  let btnUndo = $("btnUndo");
  let btnRedo = $("btnRedo");
  let filterInput = $("filterInput"); // Get filter input reference
  let btnClearFilter = $("btnClearFilter"); // Get clear button reference

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
            renderList(); // Re-render the list to show the new item
            updateUndoRedoButtons();
            input.value = "";
            input.focus(); // Keep focus in the add item input
          } else {
            showErrorDialog("Could not add the item. Please try again.");
          }
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
        const itemContext = findItemState(id);
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
        const itemContext = findItemState(id);
        if (itemContext) {
          openNoteDialog(id, itemContext.item.text, itemContext.item.note);
        }
      } else if (target.classList.contains("btnWeight") && li) {
        const id = li.dataset.id;
        const itemContext = findItemState(id);
        if (itemContext) {
          openWeightDialog(
            id,
            itemContext.item.text,
            itemContext.item.weight || 0, // Pass weight in grams
            itemContext.item.packed || false,
            itemContext.item.cost || 0,
            itemContext.item.permitRequired || false,
            itemContext.item.regulationNotes || ""
          );
        }
      } else if (target.classList.contains("chevron")) {
        const sectionContent = sectionCard?.querySelector("ul.checklist");
        const sectionId = sectionCard?.dataset.group;

        if (sectionContent && sectionId) {
          const isNowCollapsed = sectionContent.classList.toggle("collapsed");
          target.textContent = isNowCollapsed ? "▸" : "▾";
          updateCollapsedState(sectionId, isNowCollapsed); // Update state, no re-render needed
        }
      } else if (target.classList.contains("btnEditSection") && sectionCard) {
        const sectionId = sectionCard.dataset.group;
        const currentTitleElement = sectionCard.querySelector(".sectionTitle");
        const currentTitle = currentTitleElement
          ? currentTitleElement.textContent
          : "";

        if (sectionId) {
          const newTitle = prompt("Edit section title:", currentTitle);
          if (newTitle !== null && newTitle.trim()) {
            if (updateSectionTitleState(sectionId, newTitle.trim())) {
              stateChanged = true; // Re-render needed to update title display
            }
          }
        }
      } else if (target.classList.contains("btnDeleteSection") && sectionCard) {
        const sectionId = sectionCard.dataset.group;
        const sectionTitle =
          sectionCard.querySelector(".sectionTitle")?.textContent ||
          "this section";

        if (
          sectionId &&
          confirm(
            `Are you sure you want to delete the section "${sectionTitle}" and all its items?`
          )
        ) {
          if (deleteSectionState(sectionId)) {
            stateChanged = true; // Re-render needed to remove section
          } else {
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
      const titleInput = $("newSectionTitle");
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

  // Filter Input Listener
  if (filterInput) {
    filterInput.addEventListener("input", (e) => {
      filterItems(e.target.value);
    });

    filterInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
      }
    });
  }

  // Clear Filter Button Listener
  if (btnClearFilter && filterInput) {
    btnClearFilter.onclick = () => {
      filterInput.value = "";
      filterItems(""); // Re-apply filter with empty query
      filterInput.focus(); // Keep focus on input
    };
  }

  // Error Dialog close button (using form method="dialog")

  // Note Dialog form submission
  if (noteForm && noteDialog) {
    noteForm.addEventListener("submit", () => {
      // Default behavior for submit in a method="dialog" form is to close.
      const itemId = noteForm.itemId.value;
      const newNoteText = noteForm.noteText.value.trim();

      if (updateItemNoteState(itemId, newNoteText)) {
        renderList(); // Re-render to show updated note
      } else {
        console.error("Failed to update note for item:", itemId);
      }
    });

    noteDialog.addEventListener("close", () => {
      // Clear the form/item text when dialog closes
      if (noteDialogItemText) noteDialogItemText.textContent = "";
      noteForm.reset(); // Clears textarea and hidden input
    });

    const noteCancelBtn = $("noteCancelBtn");
    if (noteCancelBtn) {
      noteCancelBtn.addEventListener("click", () => {
        noteForm.reset();
        noteDialog.close();
      });
    }
  }

  // Meta Dialog actions
  if (metaForm && metaDialog) {
    metaForm.addEventListener("submit", (e) => {
      // The default submit for method="dialog" closes the dialog.
      // We need to prevent this only if validation fails.
      // e.preventDefault(); // Only prevent if validation fails

      // LOG 1: Check if renderMeta is being called after state update
      console.log("[Submit Handler] ");

      console.log("metaForm", metaForm);

      let fd = new FormData(metaForm);
      let startDate = fd.get("startDate");
      let endDate = fd.get("endDate");
      let destination = fd.get("destination").trim();
      let destinationAddress = fd.get("destinationAddress").trim();
      let destinationPlaceId = fd.get("destinationPlaceId").trim();
      let destinationLat = fd.get("destinationLat").trim();
      let destinationLng = fd.get("destinationLng").trim();
      let notes = fd.get("notes").trim();
      let permitUrl = fd.get("permitUrl").trim();
      let permitDeadline = fd.get("permitDeadline");
      let fireRules = fd.get("fireRules").trim();

      console.log("fd:", fd);

      // Validate dates: Only if both are present and end is before start
      if (startDate && endDate && endDate < startDate) {
        e.preventDefault(); // Prevent closing dialog on validation error
        showErrorDialog("End date cannot be before the start date.");
        return; // Stop processing
      }

      // Update meta data using hidden fields for destination
      const newMeta = {
        destination: destination,
        destinationAddress: destinationAddress,
        destinationPlaceId: destinationPlaceId,
        destinationLat: destinationLat,
        destinationLng: destinationLng,
        startDate: startDate,
        endDate: endDate,
        notes: notes,
        permitUrl: permitUrl,
        permitDeadline: permitDeadline,
        fireRules: fireRules,
      };

      console.log("newMeta", newMeta);
      // Update state (this now includes saving)
      updateMetaState(newMeta);

      // Update UI
      renderMeta(); // Re-render the meta sidebar section
      updatePermitInfo(); // Update permit details in sidebar
      updateUndoRedoButtons();

      // Dialog closes automatically on successful submit (no preventDefault)
      // metaDialog.close(); // Not needed if not preventing default
    });

    // Cancel button listener
    const metaCancelBtn = $("metaCancelBtn");
    if (metaCancelBtn) {
      metaCancelBtn.addEventListener("click", () => {
        metaForm.reset(); // Reset form fields
        /*
        let fd = new FormData(metaForm);
      let startDate = fd.get("startDate");
      let endDate = fd.get("endDate");
      let destination = fd.get("destination").trim();
      let destinationAddress = fd.get("destinationAddress").trim();
      let destinationPlaceId = fd.get("destinationPlaceId").trim();
      let destinationLat = fd.get("destinationLat").trim();
      let destinationLng = fd.get("destinationLng").trim();
      let notes = fd.get("notes").trim();
      let permitUrl = fd.get("permitUrl").trim();
      let permitDeadline = fd.get("permitDeadline");
        let fireRules = fd.get("fireRules").trim();
        */
        metaDialog.close(); // Close the dialog
      });
    }

    metaDialog.addEventListener("close", () => {
      // Optional: Add any cleanup needed when dialog closes regardless of method
    });
  }

  // General page controls
  const btnReset = $("btnReset");
  if (btnReset) {
    btnReset.onclick = async () => {
      if (!confirm("Reset checklist and trip info? This cannot be undone."))
        return;
      await resetAllState();
      renderMeta();
      renderList();
      updateUndoRedoButtons();
      // Reset filter
      if (filterInput) filterInput.value = "";
      filterItems("");
      showToast("Checklist reset to default.", 3000, "info");
    };
  }

  // Add listeners for Undo/Redo buttons

  if (btnUndo) {
    btnUndo.onclick = () => {
      if (undoState()) {
        renderList();
        renderMeta(); // Also re-render meta in case it changed
        updateUndoRedoButtons();
        // Re-apply filter after undo/redo potentially changes items
        if (filterInput) filterItems(filterInput.value);
      }
    };
  }
  if (btnRedo) {
    btnRedo.onclick = () => {
      if (redoState()) {
        renderList();
        renderMeta(); // Also re-render meta in case it changed
        updateUndoRedoButtons();
        // Re-apply filter after undo/redo potentially changes items
        if (filterInput) filterItems(filterInput.value);
      }
    };
  }

  document.addEventListener(
    "gmp-placechange",
    (event) => {
      console.log("Document-level gmp-placechange captured:", event);

      if (event.target.id === "destinationAutocompleteElement") {
        const place = event.detail.place;
        console.log("Place selected:", place);
        // Process place...
      }
    },
    true
  ); // Use capture phase

  // Add Keyboard listener for Undo/Redo
  document.addEventListener("keydown", (e) => {
    // Ignore shortcuts if focus is inside an input/textarea/dialog
    const activeEl = document.activeElement;
    const isInputFocused =
      activeEl &&
      (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
    const isDialogOpen = document.querySelector("dialog[open]");

    if (isInputFocused || isDialogOpen) {
      return;
    }

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
      // Use the stored theme state
      const currentTheme = theme;

      // Cycle through themes: system -> light -> dark -> system
      let nextTheme;
      if (currentTheme === "system") {
        nextTheme = "light";
      } else if (currentTheme === "light") {
        nextTheme = "dark";
      } else {
        nextTheme = "system";
      }

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
    weightForm.addEventListener("submit", () => {
      // Dialog closes automatically via method="dialog"
      const id = weightForm.elements.itemId.value;
      const weightGrams = parseFloat(weightForm.elements.itemWeight.value) || 0; // Assume input is grams
      const packed = weightForm.elements.itemPacked.checked;
      const cost = weightForm.elements.itemCost.value;
      const permitRequired = weightForm.elements.permitRequired.checked;
      const regulationNotes = weightForm.elements.regulationNotes.value;

      updateItemWeightState(
        id,
        weightGrams, // Pass weight in grams
        packed,
        cost,
        permitRequired,
        regulationNotes
      );
      // UI updates (renderList, calculators) are handled within updateItemWeightState
    });

    const weightCancelBtn = weightDialog.querySelector(".btn-cancel-dialog");
    if (weightCancelBtn) {
      weightCancelBtn.addEventListener("click", () => {
        weightForm.reset();
        weightDialog.close();
      });
    }
  }

  // Initial calculations
  calculateAndDisplayWeights();
  calculateAndDisplayCosts();

  // Initialize permit information
  updatePermitInfo();
  updatePermitRequiredItems();

  // Weight unit selector
  const weightUnitSelect = $("weightUnit");
  if (weightUnitSelect) {
    weightUnitSelect.value = loadWeightUnitPreference(); // Set initial value

    weightUnitSelect.addEventListener("change", () => {
      saveWeightUnitPreference(weightUnitSelect.value);
      calculateAndDisplayWeights(); // Recalculate and display with new unit
    });
  }

  // Add listeners for Export/Import buttons
  const btnExport = $("btnExport");
  const btnImport = $("btnImport");
  if (btnExport) btnExport.onclick = exportDataAsJSON;
  if (btnImport) btnImport.onclick = importDataFromJSON;
}

// --- Import/Export JSON Logic ---
function exportDataAsJSON() {
  try {
    // Gather all relevant state
    const exportObj = {
      data: structuredClone(data),
      meta: structuredClone(getMeta()),
      collapsedSections: Array.from(collapsedSections),
      theme: theme
    };
    const jsonStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campinglist-export-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  } catch (err) {
    showErrorDialog('Failed to export data: ' + err.message);
  }
}

function importDataFromJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = JSON.parse(text);
      if (!imported.data || !imported.meta) {
        showErrorDialog('Invalid file format.');
        return;
      }
      // Overwrite state and save
      data.length = 0;
      imported.data.forEach(g => data.push(g));
      updateMetaState(imported.meta);
      collapsedSections.clear();
      if (Array.isArray(imported.collapsedSections)) {
        imported.collapsedSections.forEach(id => collapsedSections.add(id));
      }
      if (imported.theme) {
        updateThemeState(imported.theme);
        applyTheme(imported.theme);
      }
      saveListState();
      saveMetaState();
      // UI updates
      renderList();
      renderMeta();
      calculateAndDisplayWeights(); // Add this line to update the weight sidebar
      calculateAndDisplayCosts(); // Also update costs
      updatePermitInfo(); // Update permit info
      updatePermitRequiredItems(); // Update permit items list
      updateUndoRedoButtons();
      showToast('Import successful!', 3000, 'info');
    } catch (err) {
      showErrorDialog('Failed to import: ' + err.message);
    }
  });
  input.click();
}

// Added function to update undo/redo button states

function updateUndoRedoButtons() {
  let btnUndo = $("btnUndo");
  let btnRedo = $("btnRedo");
  if (btnUndo) btnUndo.disabled = !canUndo();
  if (btnRedo) btnRedo.disabled = !canRedo();
}

// --- Theme Application ---
function applyTheme(themePreference) {
  let btnTheme = $("btnTheme"); // Get theme button reference
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  // First remove both classes to start clean
  document.documentElement.classList.remove("dark", "light");

  // Then apply the appropriate class based on preference
  if (themePreference === "dark") {
    document.documentElement.classList.add("dark");
  } else if (themePreference === "light") {
    document.documentElement.classList.add("light");
  }
  // For "system", don't add any class - let the media query handle it

  // For button display purposes, determine if dark mode is active
  const isDarkMode =
    themePreference === "dark" || (themePreference === "system" && prefersDark);

  // Update button icon
  if (btnTheme) {
    btnTheme.textContent = isDarkMode ? "☀️" : "🌙";
    btnTheme.title = isDarkMode
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
  let btnClearFilter = $("btnClearFilter");
  let matchCount = 0;
  const sanitizeForMark = (str) =>
    DOMPurify.sanitize(str, {
      USE_PROFILES: { html: true },
      ADD_TAGS: ["mark"], // Allow <mark> tag
    });

  // Clear existing highlights first
  document.querySelectorAll("#checklistContainer mark").forEach((mark) => {
    const parent = mark.parentNode;
    if (parent) {
      parent.replaceChild(
        document.createTextNode(mark.textContent || ""),
        mark
      );
      parent.normalize(); // Merge adjacent text nodes
    }
  });

  items.forEach((item) => {
    const itemId = item.dataset.id;
    const itemState = findItemState(itemId);
    if (!itemState) return;

    const label = item.querySelector("label");
    const noteDetails = item.querySelector(".details-note"); // Target details element
    const noteDiv = noteDetails?.querySelector("div"); // Div inside details

    const originalItemText = itemState.item.text;
    const originalNoteText = itemState.item.note;

    let isMatch = false;
    let finalItemHTML = sanitize(originalItemText); // Default: sanitized original text
    let finalNoteHTML = sanitize(originalNoteText); // Default: sanitized original note

    if (searchTerm !== "") {
      const escapedSearchTerm = searchTerm.replace(
        /[-/^$*+?.()|[\]{}]/g,
        "\\$&"
      );
      const regex = new RegExp(escapedSearchTerm, "ig");
      const itemTextLower = originalItemText.toLowerCase();
      const noteTextLower = originalNoteText.toLowerCase();

      isMatch =
        itemTextLower.includes(searchTerm) ||
        noteTextLower.includes(searchTerm);

      if (isMatch) {
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

    // Ensure note <details> is open if the note contains a match and search is active
    if (noteDetails) {
      const noteMatches =
        searchTerm !== "" &&
        originalNoteText.toLowerCase().includes(searchTerm);
      if (noteMatches) {
        noteDetails.open = true;
      }
      // Optionally close if it doesn't match? Or leave as user set? Let's leave it.
    }

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

/**
 * Updates the cost summary in the sidebar
 */
function calculateAndDisplayCosts() {
  const { state } = getState();
  // Assuming list ID 0 for simplicity, adjust if multiple lists are possible
  const list = state.lists[0]; // Access data directly
  if (!list) return;

  const sections = {};
  let totalCost = 0;

  list.forEach((group) => {
    const section = group.title || "Uncategorized";
    if (!sections[section]) {
      sections[section] = 0;
    }

    group.items.forEach((item) => {
      const cost = parseFloat(item.cost) || 0;
      totalCost += cost;

      if (cost > 0) {
        sections[section] += cost;
      }
    });
  });

  const totalCostEl = document.getElementById("totalCost");
  if (totalCostEl) {
    totalCostEl.textContent = `$${totalCost.toFixed(2)}`;
  }

  const costBySectionEl = document.getElementById("costBySection");
  if (!costBySectionEl) return;

  costBySectionEl.innerHTML = ""; // Clear previous entries

  Object.keys(sections)
    .sort()
    .forEach((section) => {
      if (sections[section] > 0) {
        const sectionDiv = document.createElement("div");
        sectionDiv.className = "cost-section";

        const titleDiv = document.createElement("div");
        titleDiv.className = "cost-section-title";
        titleDiv.textContent = sanitize(section); // Sanitize section title

        const valueDiv = document.createElement("div");
        valueDiv.className = "cost-section-value";
        valueDiv.textContent = `$${sections[section].toFixed(2)}`;

        sectionDiv.appendChild(titleDiv);
        sectionDiv.appendChild(valueDiv);
        costBySectionEl.appendChild(sectionDiv);
      }
    });
}

// Helper function for consistent undo state saving (Placeholder - actual logic is in state.js)
const _saveStateForUndo = () => {
  // The actual saving happens within the state mutation functions (e.g., updateItemWeightState)
  // This function might not be needed here anymore, but keep if called elsewhere.
  // console.log("_saveStateForUndo called in ui.js (should be handled in state.js)");
};

/**
 * Updates the permit required items list in the sidebar
 */
function updatePermitRequiredItems() {
  const permitItemsList = document.getElementById("permitItemsList");
  if (!permitItemsList) return;

  permitItemsList.innerHTML = ""; // Clear previous list

  const itemsRequiringPermits = data.flatMap((group) =>
    group.items.filter((item) => item.permitRequired)
  );

  if (itemsRequiringPermits.length === 0) {
    permitItemsList.innerHTML =
      "<li>No items marked as requiring permits.</li>";
    return;
  }

  itemsRequiringPermits.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = sanitize(item.text); // Sanitize item text
    permitItemsList.appendChild(li);
  });
}

/**
 * Updates the permit information in the sidebar
 */
function updatePermitInfo() {
  const permitUrlLink = document.getElementById("permitUrlLink");
  const permitDeadlineText = document.getElementById("permitDeadlineText");
  const fireRulesText = document.getElementById("fireRulesText");

  if (!permitUrlLink || !permitDeadlineText || !fireRulesText) return;

  // Get current meta state
  const currentMeta = getMeta();

  // Update permit URL
  if (currentMeta.permitUrl) {
    permitUrlLink.href = currentMeta.permitUrl;
    permitUrlLink.textContent = "View Permit Info"; // Keep it concise
    permitUrlLink.classList.remove("disabled-link");
  } else {
    permitUrlLink.href = "#"; // Prevent navigation
    permitUrlLink.textContent = "None specified";
    permitUrlLink.classList.add("disabled-link");
    permitUrlLink.onclick = (e) => e.preventDefault(); // Explicitly prevent click
  }

  // Update permit deadline
  if (currentMeta.permitDeadline) {
    try {
      // Ensure the date string includes timezone info or is treated as UTC to avoid off-by-one day issues
      const deadline = new Date(currentMeta.permitDeadline + "T00:00:00"); // Treat as local time start of day
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Compare start of day to start of day

      // Calculate difference in milliseconds and convert to days
      const diffTime = deadline - today;
      const daysUntilDeadline = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      permitDeadlineText.textContent = formatDate(currentMeta.permitDeadline); // Format as MM/DD/YYYY
      permitDeadlineText.classList.remove("warning", "past-due"); // Clear previous classes

      if (daysUntilDeadline < 0) {
        permitDeadlineText.classList.add("past-due");
        permitDeadlineText.textContent += ` (Past Due)`;
      } else if (daysUntilDeadline <= 14) {
        permitDeadlineText.classList.add("warning");
        permitDeadlineText.textContent += ` (${daysUntilDeadline} day${daysUntilDeadline !== 1 ? "s" : ""} left)`;
      }
    } catch (e) {
      console.error("Error parsing permit deadline date:", e);
      permitDeadlineText.textContent = "Invalid Date";
      permitDeadlineText.classList.remove("warning", "past-due");
    }
  } else {
    permitDeadlineText.textContent = "None";
    permitDeadlineText.classList.remove("warning", "past-due");
  }

  // Update fire rules (Sanitize potentially user-entered HTML/script)
  if (currentMeta.fireRules) {
    fireRulesText.innerHTML = sanitize(currentMeta.fireRules); // Use innerHTML with sanitize
  } else {
    fireRulesText.textContent = "None specified";
  }
}

/**
 * Format a date string (like Yfine-MM-DD) as MM/DD/YYYY.
 * Handles potential timezone issues by parsing as UTC.
 */
function formatDate(dateString) {
  if (!dateString) return "";
  try {
    // Split the date string and create a UTC date to avoid timezone shifts
    const parts = dateString.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
      const day = parseInt(parts[2], 10);
      const date = new Date(Date.UTC(year, month, day));

      // Format using UTC methods to ensure consistency
      const formattedMonth = (date.getUTCMonth() + 1)
        .toString()
        .padStart(2, "0");
      const formattedDay = date.getUTCDate().toString().padStart(2, "0");
      const formattedYear = date.getUTCFullYear();
      return `${formattedMonth}/${formattedDay}/${formattedYear}`;
    }
  } catch (e) {
    console.error("Error formatting date:", e);
  }
  return "Invalid Date"; // Fallback for invalid input
}

// --- End Google Maps Autocomplete Logic ---

// Export UI functions AND potentially the map init functions if needed by camplist.js
export {
  renderMeta,
  renderList,
  setupEventListeners,
  updateUndoRedoButtons,
  openMetaDialog,
  showErrorDialog,
  applyTheme,
  showToast,
  calculateAndDisplayWeights,
  calculateAndDisplayCosts,
  updatePermitRequiredItems,
  updatePermitInfo,
  formatDate,
};
