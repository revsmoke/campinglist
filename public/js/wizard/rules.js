// rules.js — the trip wizard's decisions, as pure functions over the answers. Nothing here
// talks to the network or the DOM, so every path is unit-tested (tests/unit/wizard.test.js).
//
// answers = {
//   placeText: "half dome in july", placeId: "yosemite-wilderness-backpacking" | null,
//   tripType: "backpacking" | ..., startDate: "2027-07-10", endDate: "2027-07-13",
//   season: "summer" | null, nightsId: "2-3" | null, groupSize: "3-5", kids: true, dog: false,
//   shelter: "tent", cooking: "stove", water: "filter", extras: ["hiking", "bear"]
// }
import { EXTRAS, NIGHTS, PLACES, TRIP_TYPE_LABELS } from "./questions.js";

const DAY = 86_400_000;

/** Lower-case, punctuation stripped, single spaces: the text every matcher sees. */
export function normalizeText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-word (or whole-phrase) presence of a keyword in normalized text. */
export function hasKeyword(normalized, keyword) {
  const k = normalizeText(keyword);
  if (!k) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(k)}([^a-z0-9]|$)`).test(normalized);
}

/**
 * Keyword matching as a Choice answer: the option with the most keyword hits wins; the
 * probabilities are hit shares and the confidence is TypeSafe's formula
 * (p_max - 1/n) / (1 - 1/n), so local and remote answers are gated the same way.
 */
export function localChoice(text, options) {
  const normalized = normalizeText(text);
  const n = options.length;
  const hits = options.map((o) =>
    (o.keywords || []).reduce(
      (sum, k) => sum + (hasKeyword(normalized, k) ? k.split(" ").length : 0),
      0
    )
  );
  const total = hits.reduce((a, b) => a + b, 0);
  const probabilities = {};
  options.forEach((o, i) => {
    probabilities[o.id] = total ? hits[i] / total : 1 / n;
  });
  let best = 0;
  hits.forEach((h, i) => {
    if (h > hits[best]) best = i;
  });
  const pMax = total ? hits[best] / total : 1 / n;
  const confidence = n > 1 ? Math.max(0, (pMax - 1 / n) / (1 - 1 / n)) : 1;
  return {
    choice: total ? options[best].id : null,
    probabilities,
    confidence: Number(confidence.toFixed(3)),
    matched: total > 0,
  };
}

/** Yes/no keyword judgments for the extras, as Noul-style probabilities. */
export function localExtras(text, extras = EXTRAS) {
  const normalized = normalizeText(text);
  const answers = {};
  for (const extra of extras) {
    const hit = (extra.keywords || []).some((k) => hasKeyword(normalized, k));
    answers[extra.id] = hit ? 0.95 : 0.05;
  }
  return answers;
}

/**
 * Which known place (a destination, an event or a camping style) a typed place names.
 * Longer aliases count more, so "zion narrows" beats "zion", and destinations and events
 * outrank styles ("beach" is a hint, "Yosemite" is an answer).
 */
export function resolvePlace(text, places = PLACES) {
  const normalized = normalizeText(text);
  if (!normalized) return { placeId: null, confidence: 0, candidates: [] };
  const scored = places
    .map((p) => {
      let score = 0;
      for (const alias of p.aliases) {
        if (hasKeyword(normalized, alias)) {
          score += alias.split(" ").length * (p.kind === "style" ? 1 : 2);
        }
      }
      return { id: p.id, kind: p.kind, label: p.label, score };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
  if (!scored.length) return { placeId: null, confidence: 0, candidates: [] };
  const total = scored.reduce((s, p) => s + p.score, 0);
  const pMax = scored[0].score / total;
  const n = scored.length;
  const confidence = n > 1 ? (pMax - 1 / n) / (1 - 1 / n) : 1;
  return {
    placeId: scored[0].id,
    kind: scored[0].kind,
    confidence: Number(confidence.toFixed(3)),
    candidates: scored.map((p) => ({ id: p.id, label: p.label, kind: p.kind })),
  };
}

/** A readable destination from the typed text: trims filler such as "we are going to". */
export function destinationName(text, placeId, places = PLACES) {
  const place = places.find((p) => p.id === placeId);
  if (place && place.kind !== "style") return place.label;
  const cleaned = String(text ?? "")
    .replace(
      /^\s*(we(?:'re| are)?\s+)?(going|heading|headed|driving|flying|hiking)\s+(to|up to|out to|into)\s+/i,
      ""
    )
    .replace(/^\s*(to|the)\s+/i, "")
    .trim();
  const sentence = cleaned.split(/[,.;!?\n]/)[0].trim();
  return sentence.length > 60 ? sentence.slice(0, 60).trim() : sentence;
}

/** Northern-hemisphere season for a month (1-12). */
export function seasonForMonth(month) {
  if ([12, 1, 2].includes(month)) return "winter";
  if ([3, 4, 5].includes(month)) return "spring";
  if ([6, 7, 8].includes(month)) return "summer";
  return "fall";
}

export function nightsBetween(startDate, endDate) {
  const a = Date.parse(startDate);
  const b = Date.parse(endDate);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const nights = Math.round((b - a) / DAY);
  return nights >= 0 ? nights : null;
}

/** Season and nights from the "when" answers: dates win over the manual picks. */
export function whenFacts(a) {
  let season = a.season || null;
  let nights = null;
  if (a.startDate) {
    const start = new Date(a.startDate + "T00:00:00Z");
    if (!Number.isNaN(start.getTime())) season = seasonForMonth(start.getUTCMonth() + 1);
    if (a.endDate) nights = nightsBetween(a.startDate, a.endDate);
  }
  if (nights === null && a.nightsId) {
    const pick = NIGHTS.find((n) => n.id === a.nightsId);
    nights = pick ? pick.nights : null;
  }
  return { season, nights };
}

const WINTER = "winter-cold-weather-camping";

/** The researched template the list starts from. */
export function pickBaseTemplate(a, facts = whenFacts(a), places = PLACES) {
  const place = places.find((p) => p.id === a.placeId) || null;
  const placeKind = place?.kind || null;
  const type = a.tripType || "unsure";
  // A known destination or event is the best starting point whatever the trip type, except
  // that an event list only fits a festival trip and a destination only a trip that goes there.
  if (place && placeKind === "event") return place.id;
  if (place && placeKind === "destination" && type !== "festival") return place.id;
  if (type === "festival") return "camplist-classic";
  if (type === "backpacking")
    return facts.season === "winter" ? WINTER : "backpacking-three-season";
  if (type === "paddling") return "canoe-kayak-camping";
  if (type === "bikepacking") return "bikepacking";
  if (type === "overlanding") return "overlanding-vehicle-remote";
  if (type === "cabin") return a.kids ? "family-car-camping" : "camplist-classic";
  // Campground or unsure: a style the place implies, else the season, shelter and group.
  if (place && placeKind === "style") return place.id;
  if (facts.season === "winter") return WINTER;
  if (a.shelter === "hammock") return "hammock-camping-forest";
  if (a.kids) return "family-car-camping";
  return "camplist-classic";
}

const sectionTitles = (template) =>
  (template?.sections || []).map((s) => String(s.title || ""));
const templateHas = (template, pattern) =>
  (template?.sections || []).some(
    (s) =>
      pattern.test(s.title || "") ||
      (s.items || []).some((i) => pattern.test(i.text || ""))
  );

/** Which add-on modules the answers call for, given the base template's own content. */
export function modulesFor(a, base, facts = whenFacts(a)) {
  const ids = [];
  const add = (id) => {
    if (!ids.includes(id)) ids.push(id);
  };
  const extras = new Set(a.extras || []);
  const baseId = base?.id || "";

  if (a.kids) add("kids");
  if (a.dog) add("dog");
  if (a.groupSize === "6+") add("bigGroup");
  if (a.groupSize === "1") add("solo");

  if (a.shelter === "hammock" && baseId !== "hammock-camping-forest") add("hammock");
  if (a.shelter === "vehicle" && baseId !== "overlanding-vehicle-remote")
    add("vehicleSleep");
  if (a.shelter === "none" || a.tripType === "cabin") add("cabin");
  if (a.shelter === "bivy") add("bivy");

  if (a.cooking === "campfire") add("campfire");
  if (a.cooking === "stove" && !templateHas(base, /stove|kitchen|cook/i)) add("stove");
  if (a.cooking === "none") add("noCook");
  if (a.water === "filter" && !templateHas(base, /filter|purif/i)) add("waterFilter");
  if (a.water === "carry" && !templateHas(base, /jug|gallon|water capacity/i))
    add("waterCarry");

  if (
    a.tripType === "festival" &&
    !/burning-man|bonnaroo|electric-forest|glastonbury/.test(baseId)
  )
    add("festival");

  for (const extra of EXTRAS) {
    if (extras.has(extra.id)) add(extra.module);
  }
  // Season-driven extras the person did not already pick.
  if (facts.season === "winter" && baseId !== WINTER) add("cold");
  if (
    facts.season === "summer" &&
    /forest|canoe|boundary|smokies|hammock|family|classic/.test(baseId)
  )
    add("bugs");
  if (
    facts.season === "summer" &&
    /desert|joshua|grand-canyon|burning-man/.test(baseId) &&
    !extras.has("heat")
  )
    add("heat");
  if (facts.nights !== null && facts.nights >= 5) add("longTrip");
  return ids;
}

/**
 * Builds the list's sections: the template's sections with any items a module removes taken
 * out, then each module's items merged into a section of the same title or added as a new one.
 */
export function assembleSections(template, moduleIds, library) {
  const modules = moduleIds.map((id) => library.find((m) => m.id === id)).filter(Boolean);
  const removals = modules.flatMap((m) =>
    (m.removeItems || []).map((r) => new RegExp(r, "i"))
  );
  const sections = (template?.sections || []).map((s) => ({
    title: String(s.title || "Untitled"),
    items: (s.items || [])
      .filter((i) => !removals.some((r) => r.test(i.text || "")))
      .map((i) => ({
        text: String(i.text || ""),
        required: i.required !== false,
        ...(i.note ? { note: String(i.note) } : {}),
        ...(i.permitRequired ? { permitRequired: true } : {}),
      })),
  }));
  for (const mod of modules) {
    let target = sections.find((s) => s.title.toLowerCase() === mod.title.toLowerCase());
    if (!target) {
      target = { title: mod.title, items: [] };
      sections.push(target);
    }
    const seen = new Set(target.items.map((i) => normalizeText(i.text)));
    for (const item of mod.items) {
      const key = normalizeText(item.text);
      if (seen.has(key)) continue;
      seen.add(key);
      target.items.push({
        text: item.text,
        required: item.required !== false,
        ...(item.note ? { note: item.note } : {}),
        ...(item.permitRequired ? { permitRequired: true } : {}),
      });
    }
  }
  return sections.filter((s) => s.items.length > 0);
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function dateLabel(iso) {
  const d = new Date(String(iso) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Yosemite, Jul 2027", "Backpacking trip, summer", "Camping trip". */
export function listName(a, facts = whenFacts(a)) {
  const place = destinationName(a.placeText, a.placeId);
  const type = a.tripType && a.tripType !== "unsure" ? TRIP_TYPE_LABELS[a.tripType] : "";
  const head = place || (type ? `${type} trip` : "Camping trip");
  let when = "";
  if (a.startDate) {
    const d = new Date(a.startDate + "T00:00:00Z");
    if (!Number.isNaN(d.getTime()))
      when = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  } else if (facts.season) {
    when = facts.season;
  }
  return when ? `${head}, ${when}` : head;
}

/** The note the wizard leaves in Trip Info so the choices are visible later. */
export function tripNotes(a, facts, moduleTitles, templateName) {
  const parts = [];
  if (a.tripType && a.tripType !== "unsure")
    parts.push(TRIP_TYPE_LABELS[a.tripType].toLowerCase());
  if (facts.nights !== null)
    parts.push(`${facts.nights} night${facts.nights === 1 ? "" : "s"}`);
  if (a.groupSize)
    parts.push(
      `group of ${a.groupSize}${a.kids ? " with kids" : ""}${a.dog ? ", dog" : ""}`
    );
  const base = templateName ? `Started from "${templateName}".` : "";
  const extras = moduleTitles.length ? ` Added: ${moduleTitles.join(", ")}.` : "";
  return `Planned with the trip wizard: ${parts.join(", ") || "camping trip"}. ${base}${extras}`.trim();
}

/** Everything the review step shows and the create step writes. */
export function buildPlan(a, { templates, library }) {
  const facts = whenFacts(a);
  const templateId = pickBaseTemplate(a, facts);
  const template = templates.find((t) => t.id === templateId);
  if (!template) throw new Error(`Unknown template ${templateId}`);
  const moduleIds = modulesFor(a, template, facts).filter((id) =>
    library.some((m) => m.id === id)
  );
  const modules = moduleIds.map((id) => {
    const m = library.find((x) => x.id === id);
    return { id, title: m.title, why: m.why, count: m.items.length };
  });
  const sections = assembleSections(template, moduleIds, library);
  const itemCount = sections.reduce((n, s) => n + s.items.length, 0);
  return {
    templateId,
    templateName: template.name,
    templateSections: sectionTitles(template).length,
    templateItems: (template.sections || []).reduce((n, s) => n + s.items.length, 0),
    reviewedOn: template.reviewedOn,
    facts,
    modules,
    sections,
    itemCount,
    name: listName(a, facts),
    meta: {
      destination: destinationName(a.placeText, a.placeId),
      startDate: a.startDate || "",
      endDate: a.endDate || "",
      notes: tripNotes(
        a,
        facts,
        modules.map((m) => m.title),
        template.name
      ),
    },
  };
}

/** The plan again with some modules left out (the review step's chips). */
export function rebuildWithout(plan, a, skipped, { templates, library }) {
  const template = templates.find((t) => t.id === plan.templateId);
  const keep = plan.modules.map((m) => m.id).filter((id) => !skipped.includes(id));
  const sections = assembleSections(template, keep, library);
  return {
    ...plan,
    sections,
    itemCount: sections.reduce((n, s) => n + s.items.length, 0),
    meta: {
      ...plan.meta,
      notes: tripNotes(
        a,
        plan.facts,
        plan.modules.filter((m) => keep.includes(m.id)).map((m) => m.title),
        plan.templateName
      ),
    },
  };
}
