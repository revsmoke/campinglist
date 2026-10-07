// templates.js — template library: browse, preview (sources, review date), create a list or
// add sections to the current one.
import {
  createList,
  appendSectionsState,
  templateToListContent,
  fetchTemplate,
} from "./state.js";
import { renderAll, escapeText } from "./ui.js";
import { promptDialog, showToast } from "./dialogs.js";

let indexPromise = null;
let activeCategory = "all";
let query = "";

function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch("templates/index.json", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`Template index failed to load (${r.status}).`);
      return r.json();
    });
    indexPromise.catch(() => {
      indexPromise = null;
    });
  }
  return indexPromise;
}

function formatReviewDate(iso) {
  const t = Date.parse(iso);
  return Number.isFinite(t)
    ? new Date(t).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : iso;
}

function categoryName(index, id) {
  return index.categories.find((c) => c.id === id)?.name || id;
}

function matches(t) {
  if (activeCategory !== "all" && t.category !== activeCategory) return false;
  if (!query) return true;
  const hay = `${t.name} ${t.tagline} ${(t.tags || []).join(" ")}`.toLowerCase();
  return query.split(/\s+/).every((word) => hay.includes(word));
}

function renderBrowser(dlg, index) {
  const list = dlg.querySelector("#templateList");
  const visible = index.templates.filter(matches);
  dlg.querySelectorAll("#templateTabs button").forEach((b) => {
    const on = b.dataset.category === activeCategory;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
  });
  if (visible.length === 0) {
    list.innerHTML = `<p class="muted">No templates match "${escapeText(query)}".</p>`;
    return;
  }
  list.innerHTML = visible
    .map(
      (t) => `<li>
        <button type="button" class="template-card" data-id="${escapeText(t.id)}">
          <span class="template-card-title">${escapeText(t.name)}</span>
          <span class="template-card-tagline">${escapeText(t.tagline)}</span>
          <span class="template-card-meta muted small">${escapeText(categoryName(index, t.category))} · ${t.sectionCount} sections · ${t.itemCount} items (${t.requiredCount} essential) · ${escapeText(t.season)} · reviewed ${escapeText(formatReviewDate(t.reviewedOn))}</span>
        </button></li>`
    )
    .join("");
}

async function renderDetail(dlg, index, summary) {
  const browser = dlg.querySelector("#templateBrowser");
  const detail = dlg.querySelector("#templateDetail");
  browser.hidden = true;
  detail.hidden = false;
  detail.innerHTML = `<p class="muted">Loading ${escapeText(summary.name)}…</p>`;
  let template;
  try {
    template = await fetchTemplate(`templates/${summary.file}`);
  } catch (error) {
    detail.innerHTML = `<p class="error-text">Could not load this template (${escapeText(error.message)}).</p><button type="button" class="secondary" id="templateBack">Back</button>`;
    detail
      .querySelector("#templateBack")
      .addEventListener("click", () => showBrowser(dlg));
    return;
  }
  const itemCount = template.sections.reduce((n, s) => n + s.items.length, 0);
  detail.innerHTML = `
    <button type="button" class="link-button" id="templateBack">← All templates</button>
    <h4 class="template-title">${escapeText(template.name)}</h4>
    <p>${escapeText(template.description)}</p>
    <p class="small muted">${escapeText(categoryName(index, template.category))} · Season: ${escapeText(template.season)} · Typical length: ${escapeText(template.typicalDuration)} · ${template.sections.length} sections, ${itemCount} items</p>
    <h5>Before you rely on this list</h5>
    <ul class="small">${template.considerations.map((c) => `<li>${escapeText(c)}</li>`).join("")}</ul>
    <h5>What's in it</h5>
    <ul class="small template-sections">${template.sections
      .map(
        (s) =>
          `<li><strong>${escapeText(s.title)}</strong> <span class="muted">(${s.items.length} items, ${s.items.filter((i) => i.required).length} essential)</span></li>`
      )
      .join("")}</ul>
    <details class="small"><summary>Sources and review date</summary>
      <p>Reviewed ${escapeText(formatReviewDate(template.reviewedOn))}. Rules, fees, quotas and conditions change: verify them with the official source before you go.</p>
      <ul>${template.sources
        .map(
          (s) =>
            `<li><a href="${escapeText(s.url)}" target="_blank" rel="noopener noreferrer">${escapeText(s.title)}</a> — ${escapeText(s.publisher)} (accessed ${escapeText(formatReviewDate(s.accessed))})</li>`
        )
        .join("")}</ul></details>
    <p class="small muted">Items marked <span class="tag tag-optional">optional</span> are suggestions; everything else is treated as essential for this kind of trip. Edit freely after creating the list.</p>
    <menu>
      <button type="button" class="secondary" id="templateAppend">Add sections to current list</button>
      <button type="button" id="templateCreate">Create a new list from this template</button>
    </menu>`;
  detail.querySelector("#templateBack").addEventListener("click", () => showBrowser(dlg));
  detail.querySelector("#templateCreate").addEventListener("click", async () => {
    const name = await promptDialog("List name", {
      title: "New list from template",
      value: template.name,
      confirmText: "Create list",
    });
    if (name === null) return;
    const content = templateToListContent(template);
    const record = createList({
      name: name.trim() || template.name,
      data: content.data,
      meta: content.meta,
      pristine: true,
      source: {
        type: "template",
        templateId: template.id,
        reviewedOn: template.reviewedOn,
      },
    });
    if (!record) return;
    dlg.close();
    renderAll();
    showToast(
      `Created "${record.name}" with ${itemCount} items. Customise away!`,
      4000,
      "success"
    );
    document
      .getElementById("checklistContainer")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  detail.querySelector("#templateAppend").addEventListener("click", () => {
    const content = templateToListContent(template);
    const added = appendSectionsState(content.data);
    dlg.close();
    renderAll();
    showToast(
      `Added ${added} sections from "${template.name}" to the current list.`,
      4000,
      "success"
    );
  });
}

function showBrowser(dlg) {
  dlg.querySelector("#templateBrowser").hidden = false;
  dlg.querySelector("#templateDetail").hidden = true;
  dlg.querySelector("#templateSearch")?.focus();
}

export async function openTemplatesDialog() {
  const dlg = document.getElementById("templatesDialog");
  if (!dlg) return;
  const list = dlg.querySelector("#templateList");
  showBrowser(dlg);
  list.innerHTML = `<p class="muted">Loading templates…</p>`;
  if (!dlg.open) dlg.showModal();
  let index;
  try {
    index = await loadIndex();
  } catch (error) {
    list.innerHTML = `<p class="error-text">${escapeText(error.message)}</p>`;
    return;
  }
  const tabs = dlg.querySelector("#templateTabs");
  tabs.innerHTML = [{ id: "all", name: "All" }, ...index.categories]
    .map(
      (c) =>
        `<button type="button" role="tab" data-category="${escapeText(c.id)}" aria-selected="${c.id === activeCategory}">${escapeText(c.name)}</button>`
    )
    .join("");
  renderBrowser(dlg, index);
  tabs.onclick = (e) => {
    const b = e.target.closest("button[data-category]");
    if (!b) return;
    activeCategory = b.dataset.category;
    renderBrowser(dlg, index);
  };
  const search = dlg.querySelector("#templateSearch");
  search.value = query;
  search.oninput = () => {
    query = search.value.trim().toLowerCase();
    renderBrowser(dlg, index);
  };
  list.onclick = (e) => {
    const card = e.target.closest("button.template-card");
    if (!card) return;
    const summary = index.templates.find((t) => t.id === card.dataset.id);
    if (summary) renderDetail(dlg, index, summary);
  };
}

export function setupTemplates() {
  document.getElementById("btnTemplates")?.addEventListener("click", openTemplatesDialog);
  document
    .getElementById("templatesClose")
    ?.addEventListener("click", () =>
      document.getElementById("templatesDialog")?.close()
    );
}
