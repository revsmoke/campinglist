// wizard.js — the trip wizard page (/plan/). Seven questions, a review step and a create step.
// The decisions live in rules.js (deterministic); typed answers go through judge.js (keywords
// first, TypeSafe's Jev only when configured and only for what the keywords cannot place).
// The list is written with the same state module as the app, into the signed-in account's
// namespace or the guest namespace, so it is simply there when the app opens.
import { GUEST_NS, createList, loadAllState, templateToListContent } from "../state.js";
import { getCurrentAccount, namespaceForAccount } from "../auth/accounts.js";
import { escapeText as esc } from "../escape.js";
import { setupSponsors } from "../sponsors.js";
import {
  CHOICES,
  EXTRAS,
  GROUP_SIZES,
  NIGHTS,
  PLACES,
  SEASONS,
  STEPS,
} from "./questions.js";
import {
  buildPlan,
  dateLabel,
  pickBaseTemplate,
  rebuildWithout,
  resolvePlace,
  whenFacts,
} from "./rules.js";
import { judgeChoice, judgeExtras } from "./judge.js";

const DRAFT_KEY = "campList.v2.wizard.draft";
const QUESTION_STEPS = STEPS.length - 1; // the review step is not counted in "x of 7"

const ICONS = {
  tent: '<path d="M2 20 12 5l10 15"/><path d="M1 20h22"/><path d="M8.5 20 12 13l3.5 7"/>',
  pack: '<path d="M8 8h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/><path d="M6 14h12"/>',
  canoe:
    '<path d="M3 15c3 0 3 2 6 2s3-2 6-2 3 2 6 2"/><path d="M5 12h14l-2-5H7z"/><path d="M12 7V4"/>',
  bike: '<circle cx="6" cy="16" r="4"/><circle cx="18" cy="16" r="4"/><path d="m6 16 4-8h5l3 8"/><path d="M10 8h4"/>',
  truck:
    '<path d="M3 16h2l2-6h10l3 6h1"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/><path d="M7 10V7h8"/>',
  ticket:
    '<path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4z"/><path d="M14 5v14" stroke-dasharray="2 2"/>',
  home: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><path d="M12 17h.01"/>',
  hammock:
    '<path d="M3 8c3 6 15 6 18 0"/><path d="M3 8v12M21 8v12"/><path d="M6 12c3 3 9 3 12 0"/>',
  tarp: '<path d="M3 16 12 7l9 9"/><path d="M3 16h18"/><path d="M12 7v9"/>',
  stove:
    '<rect x="4" y="10" width="16" height="8" rx="2"/><path d="M8 10V7M16 10V7M8 18v2M16 18v2"/>',
  fire: '<path d="M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 1-6 1-9z"/>',
  cooler:
    '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 12h18M8 8V6h8v2"/>',
  tap: '<path d="M4 10h10a3 3 0 0 1 3 3v2"/><path d="M9 10V6M6 6h6"/><path d="M17 18c0 1 1 2 1 2s1-1 1-2-1-2-1-2-1 1-1 2z"/>',
  filter: '<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
  jug: '<path d="M8 3h8v3l2 3v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9l2-3z"/><path d="M6 13h12"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  people:
    '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M15 20a4.5 4.5 0 0 1 7 0"/>',
  list: '<rect x="3" y="4" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/><rect x="3" y="16" width="4" height="4" rx="1"/><path d="M10 6h11M10 12h11M10 18h11"/>',
  sparkle:
    '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
};
const icon = (name, cls = "ico") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.help}</svg>`;

const blankAnswers = () => ({
  placeText: "",
  placeId: null,
  placeDeclined: false,
  tripType: null,
  tripTypeText: "",
  startDate: "",
  endDate: "",
  season: null,
  nightsId: null,
  groupSize: null,
  kids: false,
  dog: false,
  shelter: null,
  shelterText: "",
  cooking: null,
  water: null,
  foodText: "",
  extras: [],
  extrasText: "",
});

const state = {
  step: 0,
  answers: blankAnswers(),
  readings: {}, // judge results by choice id, for the "we read that as" rows
  skipped: [], // module ids left out on the review step
  plan: null,
  listName: null,
  error: "",
  busy: false,
};
const templateCache = new Map();
let library = [];
let root;

// ---------------------------------------------------------------- persistence of the draft
function saveDraft() {
  try {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        step: state.step,
        answers: state.answers,
        skipped: state.skipped,
        listName: state.listName,
      })
    );
  } catch {
    /* private mode: the draft just does not survive a reload */
  }
}
function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (draft && typeof draft === "object" && draft.answers) {
      state.answers = { ...blankAnswers(), ...draft.answers };
      state.step = Math.min(Number(draft.step) || 0, STEPS.length - 1);
      state.skipped = Array.isArray(draft.skipped) ? draft.skipped : [];
      state.listName = typeof draft.listName === "string" ? draft.listName : null;
    }
  } catch {
    /* ignore a bad draft */
  }
}
function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------- shared pieces
function progress(stepIndex) {
  const n = Math.min(stepIndex + 1, QUESTION_STEPS);
  const label = STEPS[stepIndex].id === "review" ? "Review" : STEPS[stepIndex].title;
  return `<div class="wizard-progress">
    <div class="wizard-progress-labels"><strong>Step ${n} of ${QUESTION_STEPS}</strong><span class="muted">${esc(label)}</span></div>
    <div class="wizard-progress-bar" style="--steps:${QUESTION_STEPS}" aria-hidden="true">${Array.from(
      { length: QUESTION_STEPS },
      (_, i) => `<span class="${i < n ? "done" : ""}"></span>`
    ).join("")}</div>
  </div>`;
}

function heading(step) {
  return `<div><h2 id="wizardHeading" tabindex="-1">${esc(step.title)}</h2><p class="muted small">${esc(step.hint)}</p></div>`;
}

function optButton(o, pressed, attrs = "") {
  return `<button type="button" class="opt${o.id === "unsure" ? " muted-opt" : ""}" data-opt="${esc(o.id)}" aria-pressed="${pressed ? "true" : "false"}" ${attrs}>
    ${icon(o.icon || "help")}<span>${esc(o.label)}${o.hint ? `<small>${esc(o.hint)}</small>` : ""}</span></button>`;
}

function chip(id, label, pressed, extra = "") {
  return `<button type="button" class="chip" data-chip="${esc(id)}" aria-pressed="${pressed ? "true" : "false"}" ${extra}>${esc(label)}</button>`;
}

function nav({ back = true, next = "Next", skip = "", primaryIcon = "arrow" } = {}) {
  return `<div class="wizard-nav">
    ${back ? `<button type="button" class="secondary" data-action="back">Back</button>` : "<span></span>"}
    <div class="right">
      ${skip ? `<button type="button" class="link-button" data-action="skip">${esc(skip)}</button>` : ""}
      <button type="button" class="primary" data-action="next">${esc(next)} ${icon(primaryIcon, "ico inline")}</button>
    </div>
  </div>
  ${state.error ? `<p class="wizard-error" role="alert">${esc(state.error)}</p>` : ""}`;
}

/** The row under a typed answer: what the judge made of it and the alternatives. */
function readingRow(choiceId, options, chosen) {
  const r = state.readings[choiceId];
  if (!r) return "";
  const label = (id) => options.find((o) => o.id === id)?.label || id;
  const others = r.candidates
    .filter((c) => c.id !== r.choice && c.id !== "unsure")
    .slice(0, 3);
  if (r.status === "unresolved") {
    return `<div class="reading asking" data-reading="${esc(choiceId)}">${icon("help", "ico inline")}<span>Which is closest?</span>${r.candidates
      .filter((c) => c.id !== "unsure")
      .map((c) => chip(c.id, c.label, chosen === c.id, `data-for="${esc(choiceId)}"`))
      .join("")}</div>`;
  }
  const verb = r.status === "accepted" ? "We read that as" : "Sounds like";
  return `<div class="reading" data-reading="${esc(choiceId)}">${icon("check", "ico inline")}<span>${verb} <strong>${esc(label(r.choice))}</strong>${r.status === "suggested" ? "?" : "."}</span><span class="muted">Not it?</span>${others
    .map((c) => chip(c.id, c.label, false, `data-for="${esc(choiceId)}"`))
    .join("")}</div>`;
}

// ---------------------------------------------------------------- steps
function renderWhere(a) {
  const known = PLACES.filter((p) => p.kind !== "style");
  const place = PLACES.find((p) => p.id === a.placeId);
  let reading = "";
  if (place && !a.placeDeclined) {
    const alternatives = (state.readings.where?.candidates || [])
      .filter((c) => c.id !== place.id && c.kind !== "style")
      .slice(0, 2);
    const starts =
      place.kind === "style"
        ? `We'll lean towards the ${place.label.toLowerCase()} list.`
        : `We'll start from the ${esc(place.label)} list.`;
    reading = `<div class="reading" data-reading="where">${icon("pin", "ico inline")}<span>Sounds like <strong>${esc(place.label)}</strong>. ${starts}</span><span class="muted">Not it?</span>${alternatives
      .map((c) => chip(c.id, c.label, false, 'data-for="where"'))
      .join("")}${chip("elsewhere", "Somewhere else", false, 'data-for="where"')}</div>`;
  }
  return `${progress(0)}${heading(STEPS[0])}
    <div class="field"><label for="whereInput">Destination</label>
      <input id="whereInput" type="text" maxlength="120" autocomplete="off" value="${esc(a.placeText)}" placeholder="Yosemite, the BWCA, a beach near Big Sur…"></div>
    <div id="whereReading">${reading}</div>
    <div class="field"><span class="label">Or pick a place we have a researched list for</span>
      <div class="chips">${known.map((p) => chip(p.id, p.label, a.placeId === p.id)).join("")}</div></div>
    ${nav({ back: false, skip: "Skip" })}`;
}

function renderChoiceStep(index, choiceId, textKey, answerKey, { label }) {
  const step = STEPS[index];
  const a = state.answers;
  const options = CHOICES[choiceId].options;
  return `${progress(index)}${heading(step)}
    <div class="opts" role="group" aria-label="${esc(step.title)}">${options.map((o) => optButton(o, a[answerKey] === o.id)).join("")}</div>
    <div class="field or"><label for="${choiceId}Input">${esc(label)}</label>
      <input id="${choiceId}Input" type="text" maxlength="300" autocomplete="off" value="${esc(a[textKey])}" placeholder="e.g. taking the truck and sleeping in the rooftop tent, off grid for a few days">
      <div id="${choiceId}Reading">${readingRow(choiceId, options, a[answerKey])}</div></div>
    ${nav()}`;
}

function renderWhen(a) {
  const facts = whenFacts(a);
  const summary =
    facts.nights !== null || facts.season
      ? `<p class="small"><strong>${facts.nights !== null ? `${facts.nights} night${facts.nights === 1 ? "" : "s"}` : ""}</strong>${facts.nights !== null && facts.season ? " · " : ""}${facts.season ? esc(facts.season) : ""}</p>`
      : "";
  return `${progress(2)}${heading(STEPS[2])}
    <div class="field-row">
      <div class="field"><label for="startDate">First night</label><input id="startDate" type="date" value="${esc(a.startDate)}"></div>
      <div class="field"><label for="endDate">Last morning</label><input id="endDate" type="date" value="${esc(a.endDate)}" min="${esc(a.startDate)}"></div>
    </div>
    ${summary}
    <div class="field or"><span class="label">No dates yet? Pick a season and a length</span>
      <div class="chips" data-group="season">${SEASONS.map((s) => chip(s.id, s.label, !a.startDate && a.season === s.id)).join("")}</div>
      <div class="chips" data-group="nights">${NIGHTS.map((n) => chip(n.id, n.label, !a.endDate && a.nightsId === n.id)).join("")}</div></div>
    ${nav()}`;
}

function renderGroup(a) {
  return `${progress(3)}${heading(STEPS[3])}
    <div class="field"><span class="label">How many people?</span>
      <div class="chips" data-group="size">${GROUP_SIZES.map((g) => chip(g.id, g.label, a.groupSize === g.id)).join("")}</div></div>
    <div class="field"><span class="label">Tap what applies</span>
      <div class="chips" data-group="flags">${chip("kids", "Kids coming", a.kids)}${chip("dog", "Dog coming", a.dog)}</div></div>
    ${nav()}`;
}

function renderFood(a) {
  return `${progress(5)}${heading(STEPS[5])}
    <div class="field"><span class="label">Cooking</span>
      <div class="opts" data-group="cooking">${CHOICES.cooking.options.map((o) => optButton(o, a.cooking === o.id, 'data-group="cooking"')).join("")}</div>
      <div id="cookingReading">${readingRow("cooking", CHOICES.cooking.options, a.cooking)}</div></div>
    <div class="field"><span class="label">Drinking water</span>
      <div class="opts" data-group="water">${CHOICES.water.options.map((o) => optButton(o, a.water === o.id, 'data-group="water"')).join("")}</div>
      <div id="waterReading">${readingRow("water", CHOICES.water.options, a.water)}</div></div>
    <div class="field or"><label for="foodInput">Or describe it in your own words</label>
      <input id="foodInput" type="text" maxlength="300" autocomplete="off" value="${esc(a.foodText)}" placeholder="e.g. cooking on the fire, filtering from the creek"></div>
    ${nav()}`;
}

function renderExtras(a) {
  return `${progress(6)}${heading(STEPS[6])}
    <div class="chips" role="group" aria-label="Extras">${EXTRAS.map((e) => chip(e.id, e.label, a.extras.includes(e.id))).join("")}</div>
    <div class="field or"><label for="extrasInput">Or describe your plans</label>
      <input id="extrasInput" type="text" maxlength="400" autocomplete="off" value="${esc(a.extrasText)}" placeholder="e.g. fishing in the mornings, maybe a climb; it's bear country and there's no signal">
      <div id="extrasReading"></div></div>
    ${nav({ next: "Review my list", primaryIcon: "list" })}`;
}

function renderReview() {
  const plan = state.plan;
  if (!plan)
    return `${progress(7)}${heading(STEPS[7])}<p class="muted">Building your plan…</p>`;
  const a = state.answers;
  const facts = plan.facts;
  const groupLabel = [
    a.groupSize ? GROUP_SIZES.find((g) => g.id === a.groupSize)?.label : "",
    a.kids ? "kids" : "",
    a.dog ? "dog" : "",
  ]
    .filter(Boolean)
    .join(", ");
  const whenLabel = a.startDate
    ? `${dateLabel(a.startDate)}${a.endDate ? ` to ${dateLabel(a.endDate)}` : ""}`
    : facts.season || "";
  const fact = (name, label, value) =>
    `<li class="fact">${icon(name)}<span class="fact-label">${esc(label)}</span><span class="fact-value">${esc(value || "–")}</span></li>`;
  const kept = plan.modules.filter((m) => !state.skipped.includes(m.id));
  const current =
    kept.length === plan.modules.length
      ? plan
      : rebuildWithout(plan, a, state.skipped, {
          templates: [templateCache.get(plan.templateId)],
          library,
        });
  return `${progress(7)}${heading(STEPS[7])}
    <div class="plan-base">${icon("pin")}<div>
      <span class="plan-base-label">Starting from</span>
      <span class="plan-base-name">${esc(plan.templateName)}</span>
      <span class="small">${plan.templateSections} sections · ${plan.templateItems} items · reviewed ${esc(plan.reviewedOn)} · <a href="../guide/templates/${esc(plan.templateId)}.html" target="_blank" rel="noopener">see the template</a></span>
    </div></div>
    <ul class="facts">
      ${fact("calendar", "When", whenLabel)}
      ${fact("moon", "Nights", facts.nights === null ? "" : String(facts.nights))}
      ${fact("people", "Group", groupLabel)}
      ${fact("list", "Items", `about ${current.itemCount}`)}
    </ul>
    ${
      plan.modules.length
        ? `<div class="field"><div class="plan-modules-head"><span class="label">Added for your answers</span><span class="small muted">tap one to leave it out</span></div>
      <div class="chips" data-group="modules">${plan.modules
        .map(
          (m) =>
            `<button type="button" class="chip${state.skipped.includes(m.id) ? " off" : ""}" data-chip="${esc(m.id)}" aria-pressed="${state.skipped.includes(m.id) ? "false" : "true"}" title="${esc(m.why)}">${esc(m.title)} <span class="count">${state.skipped.includes(m.id) ? "left out" : `${m.count} items`}</span></button>`
        )
        .join("")}</div></div>`
        : `<p class="small muted">Nothing extra needed: the template covers your answers.</p>`
    }
    <details class="small"><summary>Sections in your list (${current.sections.length})</summary>
      <ul class="plan-sections">${current.sections.map((s) => `<li>${esc(s.title)} <span class="muted">(${s.items.length})</span></li>`).join("")}</ul></details>
    <div class="field"><label for="listNameInput">List name</label>
      <input id="listNameInput" type="text" maxlength="120" value="${esc(state.listName ?? plan.name)}">
      <span class="small muted">Trip info is filled in too: destination, dates, and a note about these answers.</span></div>
    <div class="wizard-nav">
      <button type="button" class="secondary" data-action="back">Back</button>
      <div class="right">
        <button type="button" class="link-button" data-action="restart">Start over</button>
        <button type="button" class="primary" data-action="create" ${state.busy ? "disabled" : ""}>${state.busy ? "Creating…" : "Create my list"} ${icon("check", "ico inline")}</button>
      </div>
    </div>
    ${state.error ? `<p class="wizard-error" role="alert">${esc(state.error)}</p>` : ""}`;
}

function renderDone() {
  const { record, itemCount } = state.created;
  return `<div class="done">${icon("check")}
    <h2 id="wizardHeading" tabindex="-1">Your list is ready</h2>
    <p>"<strong>${esc(record.name)}</strong>" has ${itemCount} items and is now your active list. Trip info is filled in.</p>
    <p><a class="button-link primary big" href="../">Open my list ${icon("arrow", "ico inline")}</a></p>
    <p><button type="button" class="link-button" data-action="restart">Plan another trip</button></p>
  </div>`;
}

// ---------------------------------------------------------------- rendering + events
function render() {
  const a = state.answers;
  let html;
  if (state.created) html = renderDone();
  else
    switch (STEPS[state.step].id) {
      case "where":
        html = renderWhere(a);
        break;
      case "tripType":
        html = renderChoiceStep(1, "tripType", "tripTypeText", "tripType", {
          label: "Or describe it in your own words",
        });
        break;
      case "when":
        html = renderWhen(a);
        break;
      case "group":
        html = renderGroup(a);
        break;
      case "shelter":
        html = renderChoiceStep(4, "shelter", "shelterText", "shelter", {
          label: "Or describe it",
        });
        break;
      case "food":
        html = renderFood(a);
        break;
      case "extras":
        html = renderExtras(a);
        break;
      default:
        html = renderReview();
    }
  root.innerHTML = html;
  wire();
}

function focusHeading() {
  root.querySelector("#wizardHeading")?.focus({ preventScroll: false });
  window.scrollTo({
    top: Math.max(0, root.getBoundingClientRect().top + window.scrollY - 16),
    behavior: "smooth",
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Chips inside a "we read that as" row pick that option; rows are re-rendered by the judge. */
function onReadingChip(event) {
  const c = event.target.closest(".reading .chip[data-for]");
  if (!c || !root.contains(c)) return;
  const choiceId = c.dataset.for;
  if (choiceId === "where") return; // handled by the where step
  const a = state.answers;
  a[choiceId] = c.dataset.chip;
  state.readings[choiceId] = {
    ...state.readings[choiceId],
    status: "accepted",
    choice: c.dataset.chip,
    source: "person",
  };
  state.error = "";
  saveDraft();
  render();
}

/** Re-renders only a reading row so typing is not interrupted. */
function patchReading(choiceId) {
  const holder = root.querySelector(`#${choiceId}Reading`);
  if (holder)
    holder.innerHTML = readingRow(
      choiceId,
      CHOICES[choiceId].options,
      state.answers[choiceId]
    );
  root
    .querySelectorAll(
      `.opt[data-opt]${choiceId === "cooking" || choiceId === "water" ? `[data-group="${choiceId}"]` : ""}`
    )
    .forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.opt === state.answers[choiceId]));
    });
}

const judgeTyped = debounce(async (choiceId, text) => {
  const a = state.answers;
  if (!text.trim()) {
    delete state.readings[choiceId];
    patchReading(choiceId);
    return;
  }
  const result = await judgeChoice(choiceId, text, {
    destination: a.placeText,
    tripType: a.tripType,
  });
  // Ignore a late answer for text that has since changed.
  const current = {
    tripType: a.tripTypeText,
    shelter: a.shelterText,
    cooking: a.foodText,
    water: a.foodText,
  }[choiceId];
  if (current !== text) return;
  state.readings[choiceId] = result;
  if (result.status !== "unresolved") a[choiceId] = result.choice;
  else a[choiceId] = null;
  saveDraft();
  patchReading(choiceId);
}, 350);

const judgeTypedExtras = debounce(async (text) => {
  const a = state.answers;
  if (!text.trim()) return;
  const { picked, source } = await judgeExtras(text, {
    destination: a.placeText,
    tripType: a.tripType,
  });
  if (a.extrasText !== text) return;
  for (const id of picked) if (!a.extras.includes(id)) a.extras.push(id);
  saveDraft();
  root
    .querySelectorAll('.chips[role="group"] .chip')
    .forEach((c) =>
      c.setAttribute("aria-pressed", String(a.extras.includes(c.dataset.chip)))
    );
  const holder = root.querySelector("#extrasReading");
  if (holder)
    holder.innerHTML = picked.length
      ? `<div class="reading">${icon("check", "ico inline")}<span>Added: <strong>${esc(picked.map((id) => EXTRAS.find((e) => e.id === id)?.label || id).join(", "))}</strong>${source === "typesafe" ? "" : ""}</span></div>`
      : `<div class="reading asking">${icon("help", "ico inline")}<span>Nothing recognised yet. Tap the extras that apply.</span></div>`;
}, 350);

function wire() {
  const a = state.answers;
  root.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => onAction(btn.dataset.action));
  });
  root.querySelectorAll("input[type=text]").forEach((input) => {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onAction("next");
      }
    });
  });
  const stepId = state.created ? "done" : STEPS[state.step].id;

  if (stepId === "where") {
    const input = root.querySelector("#whereInput");
    const onType = debounce(() => {
      a.placeText = input.value;
      a.placeDeclined = false;
      const r = resolvePlace(a.placeText);
      state.readings.where = r;
      a.placeId = r.placeId && r.confidence >= 0.3 ? r.placeId : null;
      saveDraft();
      root.querySelector("#whereReading").innerHTML =
        renderWhere(a).match(
          /<div id="whereReading">([\s\S]*?)<\/div>\s*<div class="field"><span class="label">Or pick/
        )?.[1] || "";
      root
        .querySelectorAll(".chips .chip")
        .forEach((c) =>
          c.setAttribute("aria-pressed", String(c.dataset.chip === a.placeId))
        );
      wireChips();
    }, 200);
    input.addEventListener("input", onType);
    wireChips();
    function wireChips() {
      root.querySelectorAll(".chip[data-chip]").forEach((c) => {
        c.onclick = () => {
          const id = c.dataset.chip;
          if (id === "elsewhere") {
            a.placeId = null;
            a.placeDeclined = true;
          } else {
            const p = PLACES.find((x) => x.id === id);
            a.placeId = id;
            a.placeDeclined = false;
            if (p && !c.closest(".reading")) {
              a.placeText = p.label;
              input.value = p.label;
            }
          }
          saveDraft();
          render();
        };
      });
    }
  }

  if (["tripType", "shelter"].includes(stepId)) {
    const choiceId = stepId;
    const textKey = `${choiceId}Text`;
    root.querySelectorAll(".opt[data-opt]").forEach((b) => {
      b.addEventListener("click", () => {
        a[choiceId] = b.dataset.opt;
        delete state.readings[choiceId];
        state.error = "";
        saveDraft();
        render();
      });
    });
    const input = root.querySelector(`#${choiceId}Input`);
    input.addEventListener("input", () => {
      a[textKey] = input.value;
      a[choiceId] = null;
      root
        .querySelectorAll(".opt[data-opt]")
        .forEach((b) => b.setAttribute("aria-pressed", "false"));
      judgeTyped(choiceId, input.value);
    });
  }

  if (stepId === "when") {
    const start = root.querySelector("#startDate");
    const end = root.querySelector("#endDate");
    const onDates = () => {
      a.startDate = start.value;
      a.endDate = end.value;
      if (a.startDate) a.season = null;
      state.error = "";
      saveDraft();
      render();
    };
    start.addEventListener("change", onDates);
    end.addEventListener("change", onDates);
    root.querySelectorAll('[data-group="season"] .chip').forEach((c) =>
      c.addEventListener("click", () => {
        a.season = c.dataset.chip;
        a.startDate = "";
        a.endDate = "";
        state.error = "";
        saveDraft();
        render();
      })
    );
    root.querySelectorAll('[data-group="nights"] .chip').forEach((c) =>
      c.addEventListener("click", () => {
        a.nightsId = c.dataset.chip;
        a.endDate = "";
        saveDraft();
        render();
      })
    );
  }

  if (stepId === "group") {
    root.querySelectorAll('[data-group="size"] .chip').forEach((c) =>
      c.addEventListener("click", () => {
        a.groupSize = c.dataset.chip;
        state.error = "";
        saveDraft();
        render();
      })
    );
    root.querySelectorAll('[data-group="flags"] .chip').forEach((c) =>
      c.addEventListener("click", () => {
        a[c.dataset.chip] = !a[c.dataset.chip];
        saveDraft();
        render();
      })
    );
  }

  if (stepId === "food") {
    root.querySelectorAll(".opt[data-opt]").forEach((b) => {
      b.addEventListener("click", () => {
        a[b.dataset.group] = b.dataset.opt;
        delete state.readings[b.dataset.group];
        state.error = "";
        saveDraft();
        render();
      });
    });
    const input = root.querySelector("#foodInput");
    input.addEventListener("input", () => {
      a.foodText = input.value;
      judgeTyped("cooking", input.value);
      judgeTyped("water", input.value);
    });
  }

  if (stepId === "extras") {
    root.querySelectorAll('.chips[role="group"] .chip').forEach((c) =>
      c.addEventListener("click", () => {
        const id = c.dataset.chip;
        a.extras = a.extras.includes(id)
          ? a.extras.filter((x) => x !== id)
          : [...a.extras, id];
        saveDraft();
        c.setAttribute("aria-pressed", String(a.extras.includes(id)));
      })
    );
    const input = root.querySelector("#extrasInput");
    input.addEventListener("input", () => {
      a.extrasText = input.value;
      judgeTypedExtras(input.value);
    });
  }

  if (stepId === "review" && state.plan) {
    root.querySelectorAll('[data-group="modules"] .chip').forEach((c) =>
      c.addEventListener("click", () => {
        const id = c.dataset.chip;
        state.skipped = state.skipped.includes(id)
          ? state.skipped.filter((x) => x !== id)
          : [...state.skipped, id];
        saveDraft();
        render();
      })
    );
    const name = root.querySelector("#listNameInput");
    name.addEventListener("input", () => {
      state.listName = name.value;
      saveDraft();
    });
  }
}

// ---------------------------------------------------------------- navigation and validation
function validate(stepId) {
  const a = state.answers;
  switch (stepId) {
    case "tripType":
      return a.tripType ? "" : "Pick the closest option, or 'Not sure yet'.";
    case "when": {
      if (a.startDate && a.endDate && Date.parse(a.endDate) < Date.parse(a.startDate))
        return "The last morning comes before the first night.";
      const facts = whenFacts(a);
      return facts.season || facts.nights !== null
        ? ""
        : "Pick dates, or a season and a length.";
    }
    case "group":
      return a.groupSize ? "" : "How many people are coming?";
    case "shelter":
      return a.shelter ? "" : "Pick where you will sleep.";
    case "food":
      return a.cooking && a.water ? "" : "Pick a cooking option and a water option.";
    default:
      return "";
  }
}

async function loadTemplate(id) {
  if (templateCache.has(id)) return templateCache.get(id);
  const r = await fetch(`../templates/${encodeURIComponent(id)}.json`, {
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`Template ${id} failed to load (${r.status}).`);
  const t = await r.json();
  templateCache.set(id, t);
  return t;
}

async function preparePlan() {
  const a = state.answers;
  state.plan = null;
  render();
  const templateId = pickBaseTemplate(a);
  try {
    const template = await loadTemplate(templateId);
    state.plan = buildPlan(a, { templates: [template], library });
    state.listName = state.listName ?? null;
  } catch (error) {
    state.error = `Could not build the list: ${error.message}`;
  }
  render();
  focusHeading();
}

async function onAction(action) {
  const a = state.answers;
  const stepId = STEPS[state.step].id;
  if (action === "back") {
    state.error = "";
    state.step = Math.max(0, state.step - 1);
    saveDraft();
    render();
    focusHeading();
    return;
  }
  if (action === "restart") {
    state.answers = blankAnswers();
    state.readings = {};
    state.skipped = [];
    state.plan = null;
    state.listName = null;
    state.created = null;
    state.step = 0;
    state.error = "";
    clearDraft();
    render();
    focusHeading();
    return;
  }
  if (action === "skip") {
    a.placeText = "";
    a.placeId = null;
    state.error = "";
    state.step += 1;
    saveDraft();
    render();
    focusHeading();
    return;
  }
  if (action === "next") {
    const problem = validate(stepId);
    state.error = problem;
    if (problem) {
      render();
      return;
    }
    state.step += 1;
    saveDraft();
    if (STEPS[state.step].id === "review") await preparePlan();
    else {
      render();
      focusHeading();
    }
    return;
  }
  if (action === "create") await createFromPlan();
}

async function createFromPlan() {
  const plan = state.plan;
  if (!plan || state.busy) return;
  state.busy = true;
  state.error = "";
  render();
  try {
    const template = templateCache.get(plan.templateId);
    const final = rebuildWithout(plan, state.answers, state.skipped, {
      templates: [template],
      library,
    });
    const content = templateToListContent({ sections: final.sections });
    const name =
      (
        root.querySelector("#listNameInput")?.value ||
        state.listName ||
        plan.name
      ).trim() || plan.name;
    const record = createList({
      name,
      data: content.data,
      meta: { ...content.meta, ...final.meta },
      pristine: false,
      source: {
        type: "wizard",
        templateId: plan.templateId,
        reviewedOn: plan.reviewedOn,
      },
    });
    if (!record)
      throw new Error("the browser refused to store the list (storage full or blocked)");
    state.created = { record, itemCount: final.itemCount };
    clearDraft();
  } catch (error) {
    state.error = `Could not create the list: ${error.message}`;
  }
  state.busy = false;
  render();
  focusHeading();
}

// ---------------------------------------------------------------- start
async function init() {
  root = document.getElementById("wizard");
  if (!root) return;
  const account = getCurrentAccount();
  const namespace = account ? namespaceForAccount(account.id) : GUEST_NS;
  const [, lib] = await Promise.all([
    loadAllState({ namespace }),
    fetch("../wizard/modules.json", { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error(`modules.json ${r.status}`);
      return r.json();
    }),
  ]);
  library = lib.modules;
  root.addEventListener("click", onReadingChip);
  loadDraft();
  if (STEPS[state.step].id === "review") await preparePlan();
  else render();
  document.body.classList.add("wizard-ready");
  setupSponsors();
}

init().catch((error) => {
  console.error(error);
  if (root)
    root.innerHTML = `<p class="error-text">The trip wizard could not start: ${esc(error.message)}</p>`;
});
