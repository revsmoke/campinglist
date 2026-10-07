// Shared validation for template documents (public/templates/*.json).
// Used by scripts/validate-templates.mjs, scripts/build-template-index.mjs and the unit tests.

export const CATEGORIES = ["general", "style", "destination", "event"];
export const LIMITS = {
  itemText: 120,
  note: 200,
  sectionsMin: 1,
  sectionsMax: 14,
  itemsMin: 5,
  itemsMax: 160,
};

const isString = (v) => typeof v === "string";
const isNonEmpty = (v) => isString(v) && v.trim().length > 0;
const isDate = (v) =>
  isString(v) && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
const isHttpUrl = (v) => isString(v) && /^https?:\/\/\S+$/i.test(v);

/**
 * Validates a template document. Returns an array of error strings (empty = valid).
 * @param {unknown} doc
 * @param {{expectedId?: string}} opts
 */
export function validateTemplate(doc, opts = {}) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (!doc || typeof doc !== "object" || Array.isArray(doc))
    return ["document must be an object"];

  if (!isNonEmpty(doc.id) || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(doc.id))
    err("id must be kebab-case");
  if (opts.expectedId && doc.id !== opts.expectedId)
    err(`id "${doc.id}" must match file name "${opts.expectedId}"`);
  if (!isNonEmpty(doc.name) || doc.name.length > 80)
    err("name is required (max 80 chars)");
  if (!CATEGORIES.includes(doc.category))
    err(`category must be one of ${CATEGORIES.join(", ")}`);
  if (!isNonEmpty(doc.tagline) || doc.tagline.length > 200)
    err("tagline is required (max 200 chars)");
  if (!isNonEmpty(doc.description) || doc.description.length > 1200)
    err("description is required (max 1200 chars)");
  if (!isNonEmpty(doc.season)) err("season is required");
  if (!isNonEmpty(doc.typicalDuration)) err("typicalDuration is required");
  if (!Array.isArray(doc.considerations) || doc.considerations.length === 0)
    err("considerations must be a non-empty array");
  else
    doc.considerations.forEach((c, i) => {
      if (!isNonEmpty(c) || c.length > 450)
        err(`considerations[${i}] must be a string (max 450 chars)`);
    });
  if (!isDate(doc.reviewedOn)) err("reviewedOn must be YYYY-MM-DD");
  if (!Array.isArray(doc.sources) || doc.sources.length === 0)
    err("sources must be a non-empty array");
  else
    doc.sources.forEach((s, i) => {
      if (!s || typeof s !== "object") return err(`sources[${i}] must be an object`);
      if (!isNonEmpty(s.title)) err(`sources[${i}].title is required`);
      if (!isNonEmpty(s.publisher)) err(`sources[${i}].publisher is required`);
      if (!isHttpUrl(s.url)) err(`sources[${i}].url must be an http(s) URL`);
      if (!isDate(s.accessed)) err(`sources[${i}].accessed must be YYYY-MM-DD`);
    });
  if (doc.tags !== undefined) {
    if (!Array.isArray(doc.tags) || !doc.tags.every(isNonEmpty))
      err("tags must be an array of strings");
  }
  if (!Array.isArray(doc.sections)) {
    err("sections must be an array");
    return errors;
  }
  if (
    doc.sections.length < LIMITS.sectionsMin ||
    doc.sections.length > LIMITS.sectionsMax
  ) {
    err(`sections count must be between ${LIMITS.sectionsMin} and ${LIMITS.sectionsMax}`);
  }
  let itemCount = 0;
  const seenTitles = new Set();
  doc.sections.forEach((section, si) => {
    if (!section || typeof section !== "object")
      return err(`sections[${si}] must be an object`);
    if (!isNonEmpty(section.title) || section.title.length > 80)
      err(`sections[${si}].title is required (max 80 chars)`);
    else if (seenTitles.has(section.title.toLowerCase()))
      err(`duplicate section title "${section.title}"`);
    else seenTitles.add(section.title.toLowerCase());
    if (!Array.isArray(section.items) || section.items.length === 0)
      return err(`sections[${si}].items must be a non-empty array`);
    const seenText = new Set();
    section.items.forEach((item, ii) => {
      itemCount++;
      const where = `sections[${si}].items[${ii}]`;
      if (!item || typeof item !== "object") return err(`${where} must be an object`);
      if (!isNonEmpty(item.text) || item.text.length > LIMITS.itemText)
        err(`${where}.text is required (max ${LIMITS.itemText} chars)`);
      else if (seenText.has(item.text.toLowerCase()))
        err(`${where}.text duplicates another item in the section`);
      else seenText.add(item.text.toLowerCase());
      if (typeof item.required !== "boolean") err(`${where}.required must be a boolean`);
      if (
        item.note !== undefined &&
        (!isString(item.note) || item.note.length > LIMITS.note)
      )
        err(`${where}.note must be a string (max ${LIMITS.note} chars)`);
      if (item.permitRequired !== undefined && typeof item.permitRequired !== "boolean")
        err(`${where}.permitRequired must be a boolean`);
      for (const key of Object.keys(item)) {
        if (!["text", "required", "note", "permitRequired"].includes(key))
          err(`${where} has unknown key "${key}"`);
      }
    });
  });
  if (itemCount < LIMITS.itemsMin || itemCount > LIMITS.itemsMax)
    err(
      `item count ${itemCount} must be between ${LIMITS.itemsMin} and ${LIMITS.itemsMax}`
    );
  return errors;
}

/** Summary row for templates/index.json. */
export function summarizeTemplate(doc, file) {
  const itemCount = doc.sections.reduce((n, s) => n + s.items.length, 0);
  const requiredCount = doc.sections.reduce(
    (n, s) => n + s.items.filter((i) => i.required).length,
    0
  );
  return {
    id: doc.id,
    name: doc.name,
    category: doc.category,
    tagline: doc.tagline,
    season: doc.season,
    typicalDuration: doc.typicalDuration,
    reviewedOn: doc.reviewedOn,
    sectionCount: doc.sections.length,
    itemCount,
    requiredCount,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    file,
  };
}
