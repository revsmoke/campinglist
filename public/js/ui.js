// ui.js — rendering and user interaction for the checklist, trip info and sidebar panels.
import {
  data,
  theme,
  collapsedSections,
  updateThemeState,
  updateMetaState,
  updateItemCheckedState,
  addItemState,
  addSectionState,
  deleteItemState,
  deleteSectionState,
  updateItemTextState,
  updateItemNoteState,
  updateItemDetailsState,
  updateCollapsedState,
  updateSectionTitleState,
  undoState,
  redoState,
  canUndo,
  canRedo,
  resetAllState,
  findItemState,
  getMeta,
  getLists,
  getActiveList,
  createList,
  switchList,
  renameList,
  deleteList,
  getListSnapshot,
  parseImportedList,
} from "./state.js";
import { confirmDialog, promptDialog, showToast } from "./dialogs.js";
import { prepareDestinationSearch } from "./maps.js";
import { escapeText } from "./escape.js";

/***************** UI UTILS *****************/
const $ = (id) => document.getElementById(id);

// DOMPurify (vendored) turns any user-entered string into safe HTML for innerHTML.
const sanitize = (s) =>
  DOMPurify.sanitize(String(s ?? ""), { USE_PROFILES: { html: true } });
// Escapes text for safe interpolation into HTML *and* quoted attributes.

/***************** ERROR DIALOG *****************/
function showErrorDialog(message) {
  const errorDialog = $("errorDialog");
  const errorMessageElement = $("errorMessage");
  if (!errorDialog || !errorMessageElement) {
    console.error("Error dialog elements not found:", message);
    alert(message);
    return;
  }
  errorMessageElement.textContent = message;
  if (!errorDialog.open) errorDialog.showModal();
}

/***************** RENDER: META PANEL *****************/
function renderMeta() {
  const container = $("metaContainer");
  if (!container) return;
  const m = getMeta();
  const destination = m.destination || "–";
  const address =
    m.destinationAddress && m.destinationAddress !== m.destination
      ? m.destinationAddress
      : "";
  const mapLink =
    m.destinationLat && m.destinationLng
      ? `<a class="map-link" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${m.destinationLat},${m.destinationLng}`
        )}${m.destinationPlaceId ? `&query_place_id=${encodeURIComponent(m.destinationPlaceId)}` : ""}" target="_blank" rel="noopener noreferrer">Open in Google Maps</a>`
      : "";
  container.innerHTML = `<section class="sidebar-section trip-info" aria-labelledby="tripInfoHeading">
    <h2 id="tripInfoHeading" class="plain">Trip Info</h2>
    <div class="meta-grid">
      <div class="label">Destination</div><div>${escapeText(destination)}${address ? `<div class="muted small">${escapeText(address)}</div>` : ""}${mapLink ? `<div class="small">${mapLink}</div>` : ""}</div>
      <div class="label">Dates</div><div>${m.startDate ? formatDate(m.startDate) : "–"}${m.endDate ? ` → ${formatDate(m.endDate)}` : ""}${tripLength(m.startDate, m.endDate)}</div>
      <div class="label">Notes</div><div class="pre-line">${escapeText(m.notes) || "–"}</div>
    </div>
    <button id="editMetaBtn" class="secondary" type="button">Edit Trip Info</button>
  </section>`;
  const editBtn = $("editMetaBtn");
  if (editBtn) editBtn.onclick = openMetaDialog;
  updatePermitInfo();
  updatePermitRequiredItems();
}

function tripLength(start, end) {
  if (!start || !end) return "";
  const nights = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000);
  if (!Number.isFinite(nights) || nights < 0) return "";
  return ` <span class="muted small">(${nights} night${nights === 1 ? "" : "s"})</span>`;
}

/***************** RENDER: LISTS BAR *****************/
function renderListsBar() {
  const select = $("listSelect");
  if (!select) return;
  const active = getActiveList();
  select.innerHTML = getLists()
    .map(
      (l) =>
        `<option value="${escapeText(l.id)}"${active && l.id === active.id ? " selected" : ""}>${escapeText(l.name)}</option>`
    )
    .join("");
  const deleteBtn = $("btnDeleteList");
  if (deleteBtn) deleteBtn.disabled = getLists().length <= 1;
  document.title = active ? `${active.name} · CampList` : "CampList";
}

/***************** DIALOGS: META *****************/
async function openMetaDialog() {
  const dlg = $("metaDialog");
  const f = $("metaForm");
  if (!dlg || !f) return;
  const m = getMeta();
  f.destination.value = m.destination || "";
  f.startDate.value = m.startDate || "";
  f.endDate.value = m.endDate || "";
  f.notes.value = m.notes || "";
  f.permitUrl.value = m.permitUrl || "";
  f.permitDeadline.value = m.permitDeadline || "";
  f.fireRules.value = m.fireRules || "";
  f.destinationAddress.value = m.destinationAddress || "";
  f.destinationPlaceId.value = m.destinationPlaceId || "";
  f.destinationLat.value = m.destinationLat || "";
  f.destinationLng.value = m.destinationLng || "";
  dlg.showModal();
  // Google Places is loaded lazily the first time the dialog opens; the form works without it.
  prepareDestinationSearch({
    container: $("destinationContainer"),
    status: $("destinationSearchStatus"),
    onPlace: (place) => {
      f.destination.value = place.name || "";
      f.destinationAddress.value = place.address || "";
      f.destinationPlaceId.value = place.placeId || "";
      f.destinationLat.value = place.lat ?? "";
      f.destinationLng.value = place.lng ?? "";
    },
  });
}

/***************** DIALOGS: NOTE & ITEM DETAILS *****************/
function openNoteDialog(itemId, itemText, currentNote) {
  const dialog = $("noteDialog");
  const form = $("noteForm");
  if (!dialog || !form) return;
  $("noteDialogItemText").textContent = itemText;
  form.noteText.value = currentNote || "";
  form.itemId.value = itemId;
  dialog.showModal();
  form.noteText.focus();
}

function openDetailsDialog(item) {
  const dialog = $("weightDialog");
  const form = $("weightForm");
  if (!dialog || !form) return;
  $("weightDialogItemText").textContent = item.text;
  form.elements.itemId.value = item.id;
  form.elements.itemWeight.value = item.weight || "";
  form.elements.itemPacked.checked = Boolean(item.packed);
  form.elements.itemCost.value = item.cost || "";
  form.elements.itemOptional.checked = Boolean(item.optional);
  form.elements.permitRequired.checked = Boolean(item.permitRequired);
  form.elements.regulationNotes.value = item.regulationNotes || "";
  dialog.showModal();
}

/***************** WEIGHT HELPERS *****************/
function toggleWeightSidebar() {
  const sidebar = $("weightSidebar");
  if (!sidebar) return;
  const collapsed = sidebar.classList.toggle("collapsed");
  const btn = $("btnToggleWeightSidebar");
  if (btn) btn.setAttribute("aria-expanded", String(!collapsed));
}

function convertWeightFromGrams(weightInGrams, toUnit) {
  if (toUnit === "kg") return (weightInGrams / 1000).toFixed(2);
  if (toUnit === "lb") return (weightInGrams / 453.592).toFixed(2);
  if (toUnit === "oz") return (weightInGrams / 28.3495).toFixed(1);
  return String(Math.round(weightInGrams));
}

function formatWeight(weightValue, unit) {
  return `${weightValue} ${unit}`;
}

function saveWeightUnitPreference(unit) {
  try {
    localStorage.setItem("campChecklist_weightUnit", unit);
  } catch (error) {
    console.error("Error saving weight unit preference:", error);
  }
}

function loadWeightUnitPreference() {
  try {
    const unit = localStorage.getItem("campChecklist_weightUnit");
    return ["g", "kg", "lb", "oz"].includes(unit) ? unit : "g";
  } catch {
    return "g";
  }
}

function calculateAndDisplayWeights() {
  const totalWeightEl = $("totalWeight");
  const packedWeightEl = $("packedWeight");
  const sectionWeightsEl = $("weightBySection");
  const weightUnitSelect = $("weightUnit");
  if (!totalWeightEl || !packedWeightEl || !sectionWeightsEl) return;
  const unit = weightUnitSelect ? weightUnitSelect.value : "g";
  let total = 0;
  let packed = 0;
  let html = "";
  for (const section of data) {
    let sectionTotal = 0;
    let sectionPacked = 0;
    for (const item of section.items) {
      const w = typeof item.weight === "number" ? item.weight : 0;
      sectionTotal += w;
      if (item.packed) sectionPacked += w;
    }
    total += sectionTotal;
    packed += sectionPacked;
    if (sectionTotal > 0) {
      html += `<div class="weight-section"><div class="weight-section-title">${escapeText(section.title)}</div>
        <div class="weight-section-value"><span>Total: ${formatWeight(convertWeightFromGrams(sectionTotal, unit), unit)}</span>
        <span>Packed: ${formatWeight(convertWeightFromGrams(sectionPacked, unit), unit)}</span></div></div>`;
    }
  }
  totalWeightEl.textContent = formatWeight(convertWeightFromGrams(total, unit), unit);
  packedWeightEl.textContent = formatWeight(convertWeightFromGrams(packed, unit), unit);
  sectionWeightsEl.innerHTML =
    html || `<p class="muted small">Add weights to items (⚖️) to see totals.</p>`;
}

/***************** RENDER: CHECKLIST *****************/
function noteHTML(n) {
  return n
    ? `<details class="details-note"><summary>Notes</summary><div>${escapeText(n)}</div></details>`
    : "";
}

function renderItem(it) {
  const cbId = `cb-${it.id}`;
  const classes = ["item"];
  if (it.checked) classes.push("checked");
  if (it.permitRequired) classes.push("item-with-permit");
  if (it.weight > 0) classes.push("item-with-weight");
  if (it.optional) classes.push("item-optional");
  const safeText = escapeText(it.text);
  return `<li class="${classes.join(" ")}" data-id="${escapeText(it.id)}">
    <span class="handle" draggable="true" aria-hidden="true" title="Drag to reorder">☰</span>
    <input type="checkbox" id="${cbId}" ${it.checked ? "checked" : ""}>
    <div class="item-body">
      <label for="${cbId}">${escapeText(it.text)}${it.optional ? ` <span class="tag tag-optional">optional</span>` : ""}${it.permitRequired ? ` <span class="tag tag-permit">permit</span>` : ""}</label>
      ${noteHTML(it.note)}
    </div>
    <span class="actions">
      <button type="button" class="btnNote ${it.note ? "has-note" : ""}" aria-label="Edit note for ${safeText}" title="Edit note">🗒︎</button>
      <button type="button" class="btnWeight ${it.weight > 0 ? "has-weight" : ""}" aria-label="Edit weight, cost and status for ${safeText}" title="Weight, cost, packed, permit">⚖️</button>
      <button type="button" class="btnEdit" aria-label="Rename ${safeText}" title="Rename item">✎</button>
      <button type="button" class="btnDel" aria-label="Delete ${safeText}" title="Delete item">✕</button>
    </span>
  </li>`;
}

function renderList() {
  const container = $("checklistContainer");
  if (!container) return;
  if (data.length === 0) {
    container.innerHTML = `<section class="card empty-state"><p>This list is empty. Add a section below, or start from a template.</p>
      <button type="button" class="secondary" id="btnEmptyTemplates">Browse templates</button></section>`;
    $("btnEmptyTemplates")?.addEventListener("click", () => $("btnTemplates")?.click());
    return;
  }
  container.innerHTML = data
    .map((g) => {
      const isCollapsed = collapsedSections.has(g.id);
      const done = g.items.filter((i) => i.checked).length;
      const safeTitle = escapeText(g.title);
      return `<section class="card" data-group="${escapeText(g.id)}">
        <h2>
          <span class="sectionHandle" draggable="true" aria-hidden="true" title="Drag to reorder section">☰</span>
          <span class="sectionTitle">${escapeText(g.title)}</span>
          <span class="section-count muted small" aria-label="${done} of ${g.items.length} done">${done}/${g.items.length}</span>
          <button type="button" class="btnEditSection" aria-label="Rename section ${safeTitle}" title="Rename section">✎</button>
          <button type="button" class="btnDeleteSection" aria-label="Delete section ${safeTitle}" title="Delete section">✕</button>
          <button type="button" class="chevron" aria-expanded="${!isCollapsed}" aria-label="${isCollapsed ? "Expand" : "Collapse"} section ${safeTitle}">${isCollapsed ? "▸" : "▾"}</button>
        </h2>
        <ul class="checklist${isCollapsed ? " collapsed" : ""}">${g.items.map(renderItem).join("")}</ul>
        <form class="addItem" data-group="${escapeText(g.id)}">
          <label class="visually-hidden" for="add-${escapeText(g.id)}">Add item to ${safeTitle}</label>
          <input type="text" id="add-${escapeText(g.id)}" placeholder="Add new item..." required maxlength="500" autocomplete="off">
          <button type="submit">Add</button>
        </form>
      </section>`;
    })
    .join("");
}

/** Re-render everything that depends on list content. */
function renderAll() {
  renderListsBar();
  renderMeta();
  renderList();
  calculateAndDisplayWeights();
  calculateAndDisplayCosts();
  updatePermitInfo();
  updatePermitRequiredItems();
  updateUndoRedoButtons();
  const filterInput = $("filterInput");
  if (filterInput && filterInput.value) filterItems(filterInput.value);
}

/***************** EVENT HANDLERS *****************/
function setupEventListeners() {
  const checklistContainer = $("checklistContainer");
  const metaDialog = $("metaDialog");
  const metaForm = $("metaForm");
  const addSectionForm = $("addSectionForm");
  const btnTheme = $("btnTheme");
  const btnUndo = $("btnUndo");
  const btnRedo = $("btnRedo");
  const filterInput = $("filterInput");
  const btnClearFilter = $("btnClearFilter");

  if (checklistContainer) {
    checklistContainer.addEventListener("change", (e) => {
      if (e.target.type !== "checkbox") return;
      const li = e.target.closest("li.item");
      if (!li) return;
      const id = li.dataset.id;
      const checked = e.target.checked;
      const ctx = findItemState(id);
      if (!updateItemCheckedState(id, checked)) return;
      li.classList.toggle("checked", checked);
      const section = li.closest("section.card");
      if (section) {
        const group = data.find((g) => g.id === section.dataset.group);
        const count = section.querySelector(".section-count");
        if (group && count)
          count.textContent = `${group.items.filter((i) => i.checked).length}/${group.items.length}`;
      }
      updateUndoRedoButtons();
      if (checked && ctx?.item.requires?.length) {
        const missing = ctx.item.requires
          .map((rid) => findItemState(rid))
          .filter((r) => r && !r.item.checked)
          .map((r) => r.item.text);
        if (missing.length)
          showToast(
            `Reminder: you might also need ${missing.join(", ")}`,
            5000,
            "warning"
          );
      }
    });

    checklistContainer.addEventListener("submit", (e) => {
      if (!e.target.matches("form.addItem")) return;
      e.preventDefault();
      const input = e.target.querySelector('input[type="text"]');
      const txt = input.value.trim();
      const gId = e.target.dataset.group;
      if (!txt || !gId) return;
      if (addItemState(gId, txt)) {
        renderList();
        updateUndoRedoButtons();
        calculateAndDisplayWeights();
        const again = checklistContainer.querySelector(
          `form.addItem[data-group="${CSS.escape(gId)}"] input`
        );
        if (again) again.focus();
      } else {
        showErrorDialog("Could not add the item. Please try again.");
      }
    });

    checklistContainer.addEventListener("click", async (e) => {
      const target = e.target.closest("button");
      if (!target) return;
      const li = target.closest("li.item");
      const sectionCard = target.closest("section.card");
      let stateChanged = false;

      if (target.classList.contains("btnDel") && li) {
        const ctx = findItemState(li.dataset.id);
        const ok = await confirmDialog(`Delete "${ctx?.item.text || "this item"}"?`, {
          title: "Delete item",
          confirmText: "Delete",
          danger: true,
        });
        if (ok && deleteItemState(li.dataset.id)) stateChanged = true;
      } else if (target.classList.contains("btnEdit") && li) {
        const ctx = findItemState(li.dataset.id);
        if (ctx) {
          const t = await promptDialog("Item text", {
            title: "Rename item",
            value: ctx.item.text,
          });
          if (t !== null && t.trim() && updateItemTextState(li.dataset.id, t.trim()))
            stateChanged = true;
        }
      } else if (target.classList.contains("btnNote") && li) {
        const ctx = findItemState(li.dataset.id);
        if (ctx) openNoteDialog(li.dataset.id, ctx.item.text, ctx.item.note);
      } else if (target.classList.contains("btnWeight") && li) {
        const ctx = findItemState(li.dataset.id);
        if (ctx) openDetailsDialog(ctx.item);
      } else if (target.classList.contains("chevron") && sectionCard) {
        const list = sectionCard.querySelector("ul.checklist");
        const sectionId = sectionCard.dataset.group;
        if (list && sectionId) {
          const nowCollapsed = list.classList.toggle("collapsed");
          target.textContent = nowCollapsed ? "▸" : "▾";
          target.setAttribute("aria-expanded", String(!nowCollapsed));
          updateCollapsedState(sectionId, nowCollapsed);
        }
      } else if (target.classList.contains("btnEditSection") && sectionCard) {
        const sectionId = sectionCard.dataset.group;
        const current = sectionCard.querySelector(".sectionTitle")?.textContent || "";
        const t = await promptDialog("Section title", {
          title: "Rename section",
          value: current,
        });
        if (t !== null && t.trim() && updateSectionTitleState(sectionId, t.trim()))
          stateChanged = true;
      } else if (target.classList.contains("btnDeleteSection") && sectionCard) {
        const sectionId = sectionCard.dataset.group;
        const title =
          sectionCard.querySelector(".sectionTitle")?.textContent || "this section";
        const ok = await confirmDialog(
          `Delete the section "${title}" and all of its items?`,
          {
            title: "Delete section",
            confirmText: "Delete section",
            danger: true,
          }
        );
        if (ok) {
          if (deleteSectionState(sectionId)) stateChanged = true;
          else showErrorDialog("Could not delete the section. Please try again.");
        }
      }

      if (stateChanged) {
        renderList();
        updateUndoRedoButtons();
        calculateAndDisplayWeights();
        calculateAndDisplayCosts();
        updatePermitRequiredItems();
        if (filterInput?.value) filterItems(filterInput.value);
      }
    });
  }

  if (addSectionForm) {
    addSectionForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const titleInput = $("newSectionTitle");
      const title = titleInput?.value.trim();
      if (!title) return;
      if (addSectionState(title)) {
        renderList();
        updateUndoRedoButtons();
        titleInput.value = "";
        const lastInput = checklistContainer?.querySelector(
          "section.card:last-of-type form.addItem input"
        );
        if (lastInput) lastInput.focus();
      } else {
        showErrorDialog("Could not add the new section. Please try again.");
      }
    });
  }

  if (filterInput) {
    filterInput.addEventListener("input", (e) => filterItems(e.target.value));
    filterInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") e.preventDefault();
      if (e.key === "Escape") {
        filterInput.value = "";
        filterItems("");
      }
    });
  }
  if (btnClearFilter && filterInput) {
    btnClearFilter.onclick = () => {
      filterInput.value = "";
      filterItems("");
      filterInput.focus();
    };
  }

  // Note dialog
  const noteDialog = $("noteDialog");
  const noteForm = $("noteForm");
  if (noteForm && noteDialog) {
    noteForm.addEventListener("submit", () => {
      const itemId = noteForm.itemId.value;
      if (updateItemNoteState(itemId, noteForm.noteText.value.trim())) renderList();
    });
    noteDialog.addEventListener("close", () => noteForm.reset());
    $("noteCancelBtn")?.addEventListener("click", () => {
      noteForm.reset();
      noteDialog.close();
    });
  }

  // Meta dialog
  if (metaForm && metaDialog) {
    metaForm.addEventListener("submit", (e) => {
      const fd = new FormData(metaForm);
      const startDate = fd.get("startDate");
      const endDate = fd.get("endDate");
      if (startDate && endDate && endDate < startDate) {
        e.preventDefault();
        showErrorDialog("End date cannot be before the start date.");
        return;
      }
      const permitUrl = String(fd.get("permitUrl") || "").trim();
      if (permitUrl && !/^https?:\/\//i.test(permitUrl)) {
        e.preventDefault();
        showErrorDialog("The permit link must start with http:// or https://.");
        return;
      }
      updateMetaState({
        destination: String(fd.get("destination") || "").trim(),
        destinationAddress: String(fd.get("destinationAddress") || "").trim(),
        destinationPlaceId: String(fd.get("destinationPlaceId") || "").trim(),
        destinationLat: String(fd.get("destinationLat") || "").trim(),
        destinationLng: String(fd.get("destinationLng") || "").trim(),
        startDate,
        endDate,
        notes: String(fd.get("notes") || "").trim(),
        permitUrl,
        permitDeadline: fd.get("permitDeadline"),
        fireRules: String(fd.get("fireRules") || "").trim(),
      });
      renderMeta();
      updateUndoRedoButtons();
    });
    $("metaCancelBtn")?.addEventListener("click", () => {
      metaForm.reset();
      metaDialog.close();
    });
    $("btnClearDestination")?.addEventListener("click", () => {
      metaForm.destination.value = "";
      metaForm.destinationAddress.value = "";
      metaForm.destinationPlaceId.value = "";
      metaForm.destinationLat.value = "";
      metaForm.destinationLng.value = "";
    });
  }

  // Reset
  const btnReset = $("btnReset");
  if (btnReset) {
    btnReset.onclick = async () => {
      const ok = await confirmDialog(
        "Replace everything in the current list with the default checklist? Trip info is cleared too. This cannot be undone.",
        { title: "Reset this list", confirmText: "Reset list", danger: true }
      );
      if (!ok) return;
      await resetAllState();
      renderAll();
      if (filterInput) filterInput.value = "";
      filterItems("");
      showToast("List reset to the default checklist.", 3000, "info");
    };
  }

  // Undo / redo
  if (btnUndo) {
    btnUndo.onclick = () => {
      if (undoState()) renderAll();
    };
  }
  if (btnRedo) {
    btnRedo.onclick = () => {
      if (redoState()) renderAll();
    };
  }
  document.addEventListener("keydown", (e) => {
    const active = document.activeElement;
    const typing =
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable);
    if (typing || document.querySelector("dialog[open]")) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      btnUndo?.click();
    } else if (
      (e.ctrlKey && e.key.toLowerCase() === "y") ||
      (e.metaKey && e.shiftKey && e.key.toLowerCase() === "z")
    ) {
      e.preventDefault();
      btnRedo?.click();
    }
  });

  // Theme
  if (btnTheme) {
    btnTheme.onclick = () => {
      const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
      updateThemeState(next);
      applyTheme(next);
    };
  }
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => applyTheme(theme));

  updateUndoRedoButtons();

  $("btnPrint")?.addEventListener("click", () => window.print());

  // Item details dialog
  const weightDialog = $("weightDialog");
  const weightForm = $("weightForm");
  if (weightDialog && weightForm) {
    weightForm.addEventListener("submit", () => {
      const el = weightForm.elements;
      if (
        updateItemDetailsState(el.itemId.value, {
          weight: el.itemWeight.value,
          packed: el.itemPacked.checked,
          cost: el.itemCost.value,
          optional: el.itemOptional.checked,
          permitRequired: el.permitRequired.checked,
          regulationNotes: el.regulationNotes.value,
        })
      ) {
        renderList();
        calculateAndDisplayWeights();
        calculateAndDisplayCosts();
        updatePermitRequiredItems();
        updateUndoRedoButtons();
        if (filterInput?.value) filterItems(filterInput.value);
      }
    });
    weightDialog.querySelector(".btn-cancel-dialog")?.addEventListener("click", () => {
      weightForm.reset();
      weightDialog.close();
    });
  }

  // Weight sidebar
  $("btnToggleWeightSidebar")?.addEventListener("click", toggleWeightSidebar);
  const weightUnitSelect = $("weightUnit");
  if (weightUnitSelect) {
    weightUnitSelect.value = loadWeightUnitPreference();
    weightUnitSelect.addEventListener("change", () => {
      saveWeightUnitPreference(weightUnitSelect.value);
      calculateAndDisplayWeights();
    });
  }

  // Lists bar
  $("listSelect")?.addEventListener("change", (e) => {
    if (switchList(e.target.value)) {
      renderAll();
      if (filterInput) filterInput.value = "";
      filterItems("");
    }
  });
  $("btnNewList")?.addEventListener("click", async () => {
    const name = await promptDialog("List name", {
      title: "New list",
      value: "",
      placeholder: "e.g. Zion, May 2027",
    });
    if (name === null) return;
    const record = createList({
      name: name.trim() || "New list",
      data: [],
      pristine: true,
    });
    if (record) {
      renderAll();
      showToast(
        `Created "${record.name}". Add sections or start from a template.`,
        3500,
        "success"
      );
    }
  });
  $("btnRenameList")?.addEventListener("click", async () => {
    const active = getActiveList();
    if (!active) return;
    const name = await promptDialog("List name", {
      title: "Rename list",
      value: active.name,
    });
    if (name !== null && name.trim() && renameList(active.id, name.trim()))
      renderListsBar();
  });
  $("btnDeleteList")?.addEventListener("click", async () => {
    const active = getActiveList();
    if (!active) return;
    const ok = await confirmDialog(
      `Delete the list "${active.name}" from this browser? Copies saved to your cloud storage are not deleted.`,
      { title: "Delete list", confirmText: "Delete list", danger: true }
    );
    if (!ok) return;
    await deleteList(active.id);
    renderAll();
    showToast("List deleted.", 2500, "info");
  });

  // Export / import JSON
  $("btnExport")?.addEventListener("click", exportDataAsJSON);
  $("btnImport")?.addEventListener("click", importDataFromJSON);

  // Initial calculations
  calculateAndDisplayWeights();
  calculateAndDisplayCosts();
  updatePermitInfo();
  updatePermitRequiredItems();
}

/***************** IMPORT / EXPORT (LOCAL FILE) *****************/
function safeFileName(name) {
  return (
    String(name || "camplist")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "camplist"
  );
}

function exportDataAsJSON() {
  try {
    const snapshot = getListSnapshot();
    if (!snapshot) throw new Error("No active list");
    snapshot.theme = theme;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFileName(snapshot.name)}-${new Date().toISOString().slice(0, 10)}.camplist.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  } catch (err) {
    showErrorDialog("Failed to export data: " + err.message);
  }
}

const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

function importDataFromJSON() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > MAX_IMPORT_BYTES) {
      showErrorDialog(
        "That file is larger than 5 MB, which is far bigger than any CampList export. Import cancelled."
      );
      return;
    }
    try {
      const parsed = parseImportedList(await file.text());
      const record = createList({
        name: parsed.name,
        data: parsed.data,
        meta: parsed.meta,
        collapsed: parsed.collapsed,
        source: {
          type: "import",
          fileName: file.name,
          importedAt: new Date().toISOString(),
        },
      });
      if (!record) throw new Error("Could not store the imported list.");
      if (parsed.theme) {
        updateThemeState(parsed.theme);
        applyTheme(parsed.theme);
      }
      renderAll();
      showToast(`Imported "${record.name}" as a new list.`, 3500, "success");
    } catch (err) {
      showErrorDialog("Failed to import: " + err.message);
    }
  });
  input.click();
}

/***************** UNDO / REDO BUTTONS *****************/
function updateUndoRedoButtons() {
  const btnUndo = $("btnUndo");
  const btnRedo = $("btnRedo");
  if (btnUndo) btnUndo.disabled = !canUndo();
  if (btnRedo) btnRedo.disabled = !canRedo();
}

/***************** THEME *****************/
function applyTheme(themePreference) {
  const btnTheme = $("btnTheme");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.remove("dark", "light");
  if (themePreference === "dark") document.documentElement.classList.add("dark");
  else if (themePreference === "light") document.documentElement.classList.add("light");
  const isDarkMode =
    themePreference === "dark" || (themePreference === "system" && prefersDark);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", isDarkMode ? "#1a1a1a" : "#f7f5f0");
  if (btnTheme) {
    btnTheme.textContent = isDarkMode ? "☀️" : "🌙";
    const label =
      themePreference === "system"
        ? "Theme: follows your system. Switch to light theme"
        : themePreference === "light"
          ? "Theme: light. Switch to dark theme"
          : "Theme: dark. Switch to system theme";
    btnTheme.title = label;
    btnTheme.setAttribute("aria-label", label);
  }
}

/***************** FILTER *****************/
function filterItems(query) {
  const searchTerm = String(query || "")
    .toLowerCase()
    .trim();
  const items = document.querySelectorAll("#checklistContainer li.item");
  const btnClearFilter = $("btnClearFilter");
  let matchCount = 0;
  const sanitizeForMark = (str) =>
    DOMPurify.sanitize(str, { USE_PROFILES: { html: true }, ADD_TAGS: ["mark"] });

  items.forEach((item) => {
    const ctx = findItemState(item.dataset.id);
    if (!ctx) return;
    const label = item.querySelector("label");
    const noteDetails = item.querySelector(".details-note");
    const noteDiv = noteDetails?.querySelector("div");
    const text = ctx.item.text;
    const note = ctx.item.note || "";
    let isMatch = true;
    let labelHTML = escapeText(text);
    let noteHTMLOut = escapeText(note);
    if (searchTerm) {
      const escaped = searchTerm.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
      const regex = new RegExp(escaped, "ig");
      isMatch =
        text.toLowerCase().includes(searchTerm) ||
        note.toLowerCase().includes(searchTerm);
      if (isMatch) {
        labelHTML = sanitizeForMark(
          escapeText(text).replace(regex, (m) => `<mark>${m}</mark>`)
        );
        noteHTMLOut = note
          ? sanitizeForMark(escapeText(note).replace(regex, (m) => `<mark>${m}</mark>`))
          : "";
        if (noteDetails && note.toLowerCase().includes(searchTerm))
          noteDetails.open = true;
      }
    }
    if (label) {
      const tags = Array.from(label.querySelectorAll(".tag"))
        .map((t) => t.outerHTML)
        .join(" ");
      label.innerHTML = labelHTML + (tags ? " " + tags : "");
    }
    if (noteDiv) noteDiv.innerHTML = noteHTMLOut;
    item.classList.toggle("filtered-out", !isMatch);
    if (isMatch) matchCount++;
  });

  // Hide sections with no visible items while filtering.
  document.querySelectorAll("#checklistContainer section.card").forEach((card) => {
    const visible = card.querySelectorAll("li.item:not(.filtered-out)").length;
    card.classList.toggle("filtered-out", Boolean(searchTerm) && visible === 0);
  });

  if (btnClearFilter) btnClearFilter.hidden = !searchTerm;
  const filterMessage = $("filterMessage");
  if (filterMessage) {
    if (searchTerm && matchCount === 0) {
      filterMessage.textContent = `No items match "${searchTerm}"`;
      filterMessage.hidden = false;
    } else {
      filterMessage.hidden = true;
    }
  }
}

/***************** COSTS *****************/
function calculateAndDisplayCosts() {
  const totalCostEl = $("totalCost");
  const costBySectionEl = $("costBySection");
  if (!totalCostEl || !costBySectionEl) return;
  let totalCost = 0;
  const sections = [];
  for (const group of data) {
    let sectionCost = 0;
    for (const item of group.items) sectionCost += parseFloat(item.cost) || 0;
    totalCost += sectionCost;
    if (sectionCost > 0) sections.push([group.title, sectionCost]);
  }
  totalCostEl.textContent = `$${totalCost.toFixed(2)}`;
  costBySectionEl.innerHTML = "";
  if (sections.length === 0) {
    costBySectionEl.innerHTML = `<p class="muted small">Add costs to items (⚖️) to track your budget.</p>`;
    return;
  }
  for (const [title, cost] of sections) {
    const row = document.createElement("div");
    row.className = "cost-section";
    const t = document.createElement("div");
    t.className = "cost-section-title";
    t.textContent = title;
    const v = document.createElement("div");
    v.className = "cost-section-value";
    v.textContent = `$${cost.toFixed(2)}`;
    row.append(t, v);
    costBySectionEl.appendChild(row);
  }
}

/***************** PERMITS *****************/
function updatePermitRequiredItems() {
  const permitItemsList = $("permitItemsList");
  if (!permitItemsList) return;
  permitItemsList.innerHTML = "";
  const items = data.flatMap((group) =>
    group.items.filter((item) => item.permitRequired)
  );
  if (items.length === 0) {
    permitItemsList.innerHTML =
      "<li class='muted'>No items marked as requiring permits.</li>";
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    li.textContent = item.text;
    if (item.regulationNotes) {
      const note = document.createElement("div");
      note.className = "muted small";
      note.textContent = item.regulationNotes;
      li.appendChild(note);
    }
    permitItemsList.appendChild(li);
  }
}

function updatePermitInfo() {
  const permitUrlLink = $("permitUrlLink");
  const permitDeadlineText = $("permitDeadlineText");
  const fireRulesText = $("fireRulesText");
  if (!permitUrlLink || !permitDeadlineText || !fireRulesText) return;
  const m = getMeta();

  if (m.permitUrl && /^https?:\/\//i.test(m.permitUrl)) {
    permitUrlLink.href = m.permitUrl;
    permitUrlLink.textContent = "View permit info";
    permitUrlLink.classList.remove("disabled-link");
    permitUrlLink.removeAttribute("aria-disabled");
  } else {
    permitUrlLink.removeAttribute("href");
    permitUrlLink.textContent = "None specified";
    permitUrlLink.classList.add("disabled-link");
    permitUrlLink.setAttribute("aria-disabled", "true");
  }

  permitDeadlineText.classList.remove("warning", "past-due");
  if (m.permitDeadline) {
    const deadline = new Date(m.permitDeadline + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days = Math.ceil((deadline - today) / 86_400_000);
    if (Number.isNaN(days)) {
      permitDeadlineText.textContent = "Invalid date";
    } else {
      permitDeadlineText.textContent = formatDate(m.permitDeadline);
      if (days < 0) {
        permitDeadlineText.classList.add("past-due");
        permitDeadlineText.textContent += " (past due)";
      } else if (days <= 14) {
        permitDeadlineText.classList.add("warning");
        permitDeadlineText.textContent += ` (${days} day${days === 1 ? "" : "s"} left)`;
      }
    }
  } else {
    permitDeadlineText.textContent = "None";
  }

  if (m.fireRules) fireRulesText.textContent = m.fireRules;
  else fireRulesText.textContent = "None specified";
}

/***************** DATES *****************/
/** Formats YYYY-MM-DD as MM/DD/YYYY without timezone shifts. */
function formatDate(dateString) {
  if (!dateString) return "";
  const parts = String(dateString).split("-");
  if (parts.length !== 3) return "Invalid date";
  const [y, m, d] = parts.map((p) => parseInt(p, 10));
  if (![y, m, d].every(Number.isFinite)) return "Invalid date";
  return `${String(m).padStart(2, "0")}/${String(d).padStart(2, "0")}/${y}`;
}

export {
  renderMeta,
  renderList,
  renderListsBar,
  renderAll,
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
  filterItems,
  formatDate,
  convertWeightFromGrams,
  sanitize,
  escapeText,
};
