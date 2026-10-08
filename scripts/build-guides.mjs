// Builds the visual guides under public/guide/ from
//   guides/locales/<lang>.json      every piece of text (en is the default locale)
//   guides/site-guide.json          which pictures and callouts the "How to use" guide shows
//   guides/templates-guide.json     same for the Templates guide
//   guides/shots/<lang>.json        picture sizes and callout boxes (scripts/capture-guide-shots.mjs)
//   public/templates/*.json         the template library (one page per template)
//
//   node scripts/build-guides.mjs
//
// Output: public/guide/index.html, public/guide/templates.html, public/guide/templates/<id>.html,
// the same under public/guide/<lang>/ for every other locale, and public/sitemap.xml.
// Pages are static, script-free apart from the analytics module, and contain no dates other
// than the templates' own review dates, so the output only changes when the inputs do.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SITE_URL = "https://camplist.guide";
export const DEFAULT_LANG = "en";

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ------------------------------------------------------------------ icons (inline SVG sprite)
// Simple stroke pictograms on a 24px grid; they inherit the text colour.
export const ICONS = {
  tent: '<path d="M2 20 12 5l10 15"/><path d="M1 20h22"/><path d="M8.5 20 12 13l3.5 7"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
  ticket:
    '<path d="M3 9V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4z"/><path d="M14 5v14" stroke-dasharray="2 2"/>',
  list: '<rect x="3" y="4" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/><rect x="3" y="16" width="4" height="4" rx="1"/><path d="M10 6h11M10 12h11M10 18h11"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  cloud:
    '<path d="M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.5 2 3 3 0 0 1 0 6H7z"/><path d="M12 12v6m-3-3 3-3 3 3"/>',
  print:
    '<path d="M6 9V4h12v5M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2"/><rect x="6" y="14" width="12" height="7"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  grid: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.9 9.5l6.1-.9z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  permit: '<path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z"/><path d="m9 12 2 2 4-4"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  warn: '<path d="M12 4 2 20h20z"/><path d="M12 10v4m0 3h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  essential:
    '<rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" stroke="none"/><path d="m8.5 12 2.5 2.5 4.5-5" stroke="var(--card, #fff)"/>',
  optional: '<rect x="4" y="4" width="16" height="16" rx="3" stroke-dasharray="3 2"/>',
  home: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>',
};

function sprite() {
  const symbols = Object.entries(ICONS)
    .map(
      ([id, body]) =>
        `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`
    )
    .join("");
  return `<svg hidden aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${symbols}</svg>`;
}

export function icon(name, cls = "") {
  if (!ICONS[name]) throw new Error(`Unknown icon "${name}"`);
  return `<svg class="ico${cls ? " " + cls : ""}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}

// ------------------------------------------------------------------ locale strings
export function makeTranslator(strings, fallback, { onMissing } = {}) {
  const lookup = (obj, path) =>
    path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  function t(path, vars) {
    let value = lookup(strings, path);
    if (value === undefined) {
      value = lookup(fallback, path);
      onMissing?.(path, value);
    }
    if (value === undefined) throw new Error(`Missing string "${path}"`);
    if (typeof value !== "string") return value;
    return vars
      ? value.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m))
      : value;
  }
  /** Optional text (a hint): empty when neither locale has it, never reported as missing. */
  t.opt = (path) => {
    const value = lookup(strings, path) ?? lookup(fallback, path);
    return typeof value === "string" ? value : "";
  };
  return t;
}

// ------------------------------------------------------------------ page scaffold
function head({ t, lang, dir, title, description, rel, canonical, alternates }) {
  const alt = alternates
    .map((a) => `<link rel="alternate" hreflang="${esc(a.lang)}" href="${esc(a.url)}" />`)
    .join("\n    ");
  return `<!doctype html>
<html lang="${esc(lang)}" dir="${esc(dir)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(title)} · ${esc(t("siteName"))}${esc(t("siteTld"))}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(canonical)}" />${alt ? `\n    ${alt}` : ""}
    <link rel="icon" href="${rel}favicon.ico" sizes="any" />
    <link rel="icon" href="${rel}images/camplist_logo.svg" type="image/svg+xml" />
    <meta name="google-adsense-account" content="ca-pub-4491650261060374" />
    <meta name="theme-color" content="#f7f5f0" />
    <!-- Analytics (Google Analytics 4 via gtag.js); configured in js/config.js -->
    <script type="module" src="${rel}js/analytics.js"></script>
    <link rel="stylesheet" href="${rel}css/camplist.css" />
    <link rel="stylesheet" href="${rel}guide/guide.css" />
    <link rel="stylesheet" href="https://use.typekit.net/xsc8giw.css" />
  </head>
  <body class="guide-body">
    ${sprite()}`;
}

function header({ t, rel, guideRel, current }) {
  const link = (href, label, key, primary = false) =>
    `<a href="${esc(href)}" class="button-link${primary ? " primary" : ""}"${current === key ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
  return `
    <header class="app-header guide-header">
      <a class="brand" href="${rel}">
        <img src="${rel}images/camplist_logo.svg" alt="" class="logo" width="52" height="68" />
        <span class="wordmark">${esc(t("siteName"))}<span class="tld">${esc(t("siteTld"))}</span></span>
      </a>
      <nav class="header-actions" aria-label="${esc(t("nav.guide"))}">
        ${link(`${guideRel}`, t("nav.guide"), "guide")}
        ${link(`${guideRel}templates.html`, t("nav.templates"), "templates")}
        ${link(rel, t("nav.app"), "app", true)}
      </nav>
    </header>`;
}

function footer({ t, rel }) {
  return `
    <footer class="guide-footer small">
      <a href="${rel}privacy.html">${esc(t("footer.privacy"))}</a> ·
      <a href="${rel}terms.html">${esc(t("footer.terms"))}</a> ·
      <a href="mailto:support@camplist.guide">${esc(t("footer.contact"))}</a>
    </footer>
  </body>
</html>
`;
}

// ------------------------------------------------------------------ pictures with callouts
const clamp = (v) => Math.max(0, Math.min(100, v));

/** One illustrated step: numbered boxes on the picture and a matching legend under it. */
export function renderStep({ t, textPath, step, shot, imgRel, number, link }) {
  if (!shot) throw new Error(`Step "${step.id}" refers to missing shot "${step.shot}"`);
  const callouts = [];
  for (const key of step.callouts || []) {
    const box = shot.anchors[key];
    if (!box) {
      console.warn(`  ! ${step.id}: no anchor "${key}" in shot "${step.shot}" (skipped)`);
      continue;
    }
    callouts.push({ key, box, label: t(`${textPath}.callouts.${key}`) });
  }
  const overlays = callouts
    .map(({ box }, i) => {
      const l = clamp(box.l);
      const tp = clamp(box.t);
      const w = Math.min(box.w, 100 - l);
      const h = Math.min(box.h, 100 - tp);
      return `<span class="hl" style="left:${l}%;top:${tp}%;width:${w}%;height:${h}%"></span><span class="num" style="left:${l}%;top:${tp}%">${i + 1}</span>`;
    })
    .join("");
  const legend = callouts.length
    ? `<ol class="legend">${callouts.map(({ label }, i) => `<li><span class="num">${i + 1}</span><span>${esc(label)}</span></li>`).join("")}</ol>`
    : "";
  const hint = t.opt(`${textPath}.hint`);
  const linkHtml = link
    ? `<p class="step-link"><a href="${esc(link.href)}">${esc(link.label)} ${icon("arrow", "inline")}</a></p>`
    : "";
  // Dialog- and panel-sized pictures sit beside their legend; page-wide ones stack.
  const narrow = shot.width / 2 <= 640;
  return `
        <article class="step${narrow ? " narrow" : ""}" id="${esc(step.id)}">
          <h3><span class="step-no">${number}</span>${esc(t(`${textPath}.title`))}</h3>
          <figure class="shot">
            <img src="${esc(imgRel + shot.file)}" width="${shot.width}" height="${shot.height}" alt="" loading="lazy" decoding="async" />
            ${overlays}
          </figure>
          ${legend}
          ${hint ? `<p class="hint">${esc(hint)}</p>` : ""}
          ${linkHtml}
        </article>`;
}

// ------------------------------------------------------------------ "How to use" page
export function renderSiteGuide(ctx) {
  const { t, structure, shots, rel, guideRel, imgRel } = ctx;
  const quick = structure.quick
    .map(
      (q, i) =>
        `<li class="quick-tile"><span class="quick-no">${i + 1}</span>${icon(q.icon, "big")}<span>${esc(t(`guide.quick.${q.id}`))}</span></li>`
    )
    .join("");
  const toc = structure.groups
    .map(
      (g) =>
        `<a href="#${esc(g.id)}">${icon(g.icon)}<span>${esc(t(`guide.groups.${g.id}`))}</span></a>`
    )
    .join("");
  let n = 0;
  const groups = structure.groups
    .map((g) => {
      const steps = g.steps
        .map((step) => {
          n++;
          const link = step.link
            ? { href: step.link, label: t(`guide.steps.${step.id}.link`) }
            : null;
          return renderStep({
            t,
            textPath: `guide.steps.${step.id}`,
            step,
            shot: shots[step.shot],
            imgRel,
            number: n,
            link,
          });
        })
        .join("");
      return `
      <section class="group" id="${esc(g.id)}">
        <h2>${icon(g.icon)}${esc(t(`guide.groups.${g.id}`))}</h2>
        <div class="steps">${steps}
        </div>
      </section>`;
    })
    .join("");
  return `${head({ ...ctx, title: t("guide.title"), description: t("guide.description"), canonical: ctx.urls.guide })}
    ${header({ t, rel, guideRel, current: "guide" })}
    <main class="guide-main">
      <section class="guide-hero">
        <h1>${esc(t("guide.title"))}</h1>
        <p class="lead">${esc(t("guide.lead"))}</p>
        <ol class="quick">${quick}</ol>
        <nav class="toc" aria-label="${esc(t("guide.title"))}">${toc}</nav>
      </section>
      ${groups}
      <p class="to-top"><a href="#top">${esc(t("nav.top"))}</a></p>
    </main>
    ${footer({ t, rel })}`;
}

// ------------------------------------------------------------------ templates
const countItems = (tpl) => tpl.sections.reduce((n, s) => n + s.items.length, 0);
const countEssential = (tpl) =>
  tpl.sections.reduce((n, s) => n + s.items.filter((i) => i.required).length, 0);

function facts(t, tpl, keys) {
  const all = {
    season: ["calendar", tpl.season],
    duration: ["moon", tpl.typicalDuration],
    sections: ["grid", tpl.sections.length],
    items: ["list", countItems(tpl)],
    essential: ["star", countEssential(tpl)],
    optional: ["optional", countItems(tpl) - countEssential(tpl)],
    reviewed: ["clock", tpl.reviewedOn],
    sources: ["link", tpl.sources.length],
  };
  return `<ul class="facts">${keys
    .map(
      (k) =>
        `<li class="fact">${icon(all[k][0])}<span class="fact-label">${esc(t(`templates.facts.${k}`))}</span><span class="fact-value">${esc(all[k][1])}</span></li>`
    )
    .join("")}</ul>`;
}

function templateCard({ t, tpl, categoryIcons, pagesRel, rel }) {
  return `
          <li class="tcard">
            <a class="tcard-main" href="${esc(`${pagesRel}${tpl.id}.html`)}">
              ${icon(categoryIcons[tpl.category] || "tent", "big")}
              <span class="tcard-title">${esc(tpl.name)}</span>
              <span class="tcard-tagline">${esc(tpl.tagline)}</span>
            </a>
            ${facts(t, tpl, ["season", "duration", "sections", "items"])}
            <p class="tcard-actions">
              <a class="button-link" href="${esc(`${pagesRel}${tpl.id}.html`)}">${esc(t("templates.actions.details"))}</a>
              <a class="button-link primary" href="${esc(`${rel}?template=${encodeURIComponent(tpl.id)}`)}">${esc(t("templates.actions.open"))}</a>
            </p>
          </li>`;
}

export function renderTemplatesGuide(ctx) {
  const { t, templatesStructure, shots, rel, guideRel, imgRel, templates, categories } =
    ctx;
  const steps = templatesStructure.steps
    .map((step, i) =>
      renderStep({
        t,
        textPath: `templates.steps.${step.id}`,
        step,
        shot: shots[step.shot],
        imgRel,
        number: i + 1,
      })
    )
    .join("");
  const groups = categories
    .map((cat) => {
      const list = templates.filter((tpl) => tpl.category === cat.id);
      if (!list.length) return "";
      return `
      <section class="group" id="${esc(cat.id)}">
        <h2>${icon(templatesStructure.categoryIcons[cat.id] || "tent")}${esc(t(`templates.categories.${cat.id}`))} <span class="count">${list.length}</span></h2>
        <ul class="tcards">${list
          .map((tpl) =>
            templateCard({
              t,
              tpl,
              categoryIcons: templatesStructure.categoryIcons,
              pagesRel: "templates/",
              rel,
            })
          )
          .join("")}
        </ul>
      </section>`;
    })
    .join("");
  const toc = categories
    .filter((cat) => templates.some((tpl) => tpl.category === cat.id))
    .map(
      (cat) =>
        `<a href="#${esc(cat.id)}">${icon(templatesStructure.categoryIcons[cat.id] || "tent")}<span>${esc(t(`templates.categories.${cat.id}`))}</span></a>`
    )
    .join("");
  return `${head({ ...ctx, title: t("templates.title"), description: t("templates.description"), canonical: ctx.urls.templates })}
    ${header({ t, rel, guideRel, current: "templates" })}
    <main class="guide-main">
      <section class="guide-hero">
        <h1>${esc(t("templates.title"))}</h1>
        <p class="lead">${esc(t("templates.lead"))}</p>
        <nav class="toc" aria-label="${esc(t("templates.catalogue.title"))}">${toc}</nav>
      </section>
      <section class="group" id="how">
        <div class="steps">${steps}
        </div>
      </section>
      <h2 class="catalogue-title" id="all">${esc(t("templates.catalogue.title"))} <span class="count">${templates.length}</span></h2>
      ${groups}
      <p class="to-top"><a href="#top">${esc(t("nav.top"))}</a></p>
    </main>
    ${footer({ t, rel })}`;
}

export function renderTemplatePage(ctx, tpl) {
  const { t, templatesStructure, rel, guideRel } = ctx;
  const catIcon = templatesStructure.categoryIcons[tpl.category] || "tent";
  const sections = tpl.sections
    .map((s) => {
      const essential = s.items.filter((i) => i.required).length;
      const items = s.items
        .map(
          (i) => `
              <li class="${i.required ? "item-essential" : "item-optional"}">
                ${icon(i.required ? "essential" : "optional", "mark")}
                <span class="item-text">${esc(i.text)}${i.permitRequired ? ` ${icon("permit", "inline permit")}` : ""}${i.note ? `<span class="item-note">${esc(i.note)}</span>` : ""}</span>
              </li>`
        )
        .join("");
      return `
          <section class="tsection card">
            <h3>${esc(s.title)} <span class="count">${essential}/${s.items.length}</span></h3>
            <ul class="titems">${items}
            </ul>
          </section>`;
    })
    .join("");
  const considerations = tpl.considerations.map((c) => `<li>${esc(c)}</li>`).join("");
  const sources = tpl.sources
    .map(
      (s) =>
        `<li><a href="${esc(s.url)}" rel="noopener noreferrer" target="_blank">${esc(s.title)}</a> <span class="muted">${esc(s.publisher)} · ${esc(s.accessed)}</span></li>`
    )
    .join("");
  const appLink = `${rel}?template=${encodeURIComponent(tpl.id)}`;
  return `${head({ ...ctx, title: tpl.name, description: tpl.tagline, canonical: `${ctx.urls.templatePages}${tpl.id}.html` })}
    ${header({ t, rel, guideRel, current: "templates" })}
    <main class="guide-main template-page">
      <nav class="crumbs small" aria-label="${esc(t("nav.templates"))}">
        <a href="${guideRel}">${esc(t("nav.guide"))}</a> › <a href="${guideRel}templates.html">${esc(t("nav.templates"))}</a> › <span>${esc(tpl.name)}</span>
      </nav>
      <section class="guide-hero template-hero">
        ${icon(catIcon, "hero")}
        <h1>${esc(tpl.name)}</h1>
        <p class="lead">${esc(tpl.tagline)}</p>
        ${facts(t, tpl, ["season", "duration", "sections", "items", "essential", "reviewed"])}
        <p class="cta">
          <a class="button-link primary big" href="${esc(appLink)}">${esc(t("templates.actions.use"))} ${icon("arrow", "inline")}</a>
          <a class="button-link" href="${guideRel}templates.html#all">${esc(t("templates.actions.all"))}</a>
        </p>
        <p class="description">${esc(tpl.description)}</p>
      </section>
      <section class="group check-first">
        <h2>${icon("flag")}${esc(t("templates.page.checkFirst"))}</h2>
        <ul class="considerations">${considerations}</ul>
      </section>
      <section class="group">
        <h2>${icon("list")}${esc(t("templates.page.inside"))}</h2>
        <ul class="legend-keys small">
          <li>${icon("essential", "mark")} ${esc(t("templates.page.legend.essential"))}</li>
          <li>${icon("optional", "mark")} ${esc(t("templates.page.legend.optional"))}</li>
          <li>${icon("permit", "inline permit")} ${esc(t("templates.page.legend.permit"))}</li>
        </ul>
        <div class="tsections">${sections}
        </div>
      </section>
      <section class="group sources">
        <h2>${icon("link")}${esc(t("templates.page.sources"))} <span class="count">${esc(tpl.reviewedOn)}</span></h2>
        <p class="small muted">${esc(t("templates.page.reviewedNote"))}</p>
        <ul class="small">${sources}</ul>
      </section>
      <p class="cta">
        <a class="button-link primary big" href="${esc(appLink)}">${esc(t("templates.actions.use"))} ${icon("arrow", "inline")}</a>
      </p>
    </main>
    ${footer({ t, rel })}`;
}

// ------------------------------------------------------------------ inputs
export function loadInputs() {
  const localesDir = join(root, "guides", "locales");
  const locales = {};
  for (const file of readdirSync(localesDir)
    .filter((f) => f.endsWith(".json"))
    .sort()) {
    const data = readJson(join(localesDir, file));
    locales[data.lang || file.replace(".json", "")] = data;
  }
  if (!locales[DEFAULT_LANG])
    throw new Error(`guides/locales/${DEFAULT_LANG}.json is required`);
  const shotsDir = join(root, "guides", "shots");
  const shots = {};
  for (const file of readdirSync(shotsDir).filter((f) => f.endsWith(".json"))) {
    const data = readJson(join(shotsDir, file));
    shots[data.lang || file.replace(".json", "")] = data.shots;
  }
  const tplDir = join(root, "public", "templates");
  const index = readJson(join(tplDir, "index.json"));
  const templates = index.templates.map((row) => readJson(join(tplDir, row.file)));
  return {
    locales,
    shots,
    structure: readJson(join(root, "guides", "site-guide.json")),
    templatesStructure: readJson(join(root, "guides", "templates-guide.json")),
    templates,
    categories: index.categories,
  };
}

/** Everything a page needs for one locale: strings, pictures, relative paths and canonical URLs. */
export function contextFor(inputs, lang, { depth = 0 } = {}) {
  const isDefault = lang === DEFAULT_LANG;
  const missing = [];
  const t = makeTranslator(inputs.locales[lang], inputs.locales[DEFAULT_LANG], {
    onMissing: (path) => missing.push(path),
  });
  // Pages for the default locale live in guide/, others in guide/<lang>/; template pages one
  // level deeper. `rel` points at the site root, `guideRel` at the locale's guide root.
  const localeDepth = isDefault ? 1 : 2;
  const rel = "../".repeat(localeDepth + depth);
  const guideRel = depth ? "../".repeat(depth) : "./";
  const imgRel = `${guideRel}${isDefault ? "" : "../"}img/${inputs.shots[lang] ? lang : DEFAULT_LANG}/`;
  const guideUrl = `${SITE_URL}/guide/${isDefault ? "" : lang + "/"}`;
  const alternates =
    Object.keys(inputs.locales).length > 1 ? Object.keys(inputs.locales) : [];
  const pageAlternates = (suffix) => [
    ...alternates.map((l) => ({
      lang: l,
      url: `${SITE_URL}/guide/${l === DEFAULT_LANG ? "" : l + "/"}${suffix}`,
    })),
    ...(alternates.length
      ? [{ lang: "x-default", url: `${SITE_URL}/guide/${suffix}` }]
      : []),
  ];
  return {
    lang,
    dir: inputs.locales[lang].dir || "ltr",
    t,
    missing,
    structure: inputs.structure,
    templatesStructure: inputs.templatesStructure,
    templates: inputs.templates,
    categories: inputs.categories,
    shots: inputs.shots[lang] || inputs.shots[DEFAULT_LANG],
    rel,
    guideRel,
    imgRel,
    urls: {
      guide: guideUrl,
      templates: `${guideUrl}templates.html`,
      templatePages: `${guideUrl}templates/`,
    },
    alternates: [],
    pageAlternates,
  };
}

export function renderAll(inputs) {
  const files = new Map();
  const urls = [`${SITE_URL}/`, `${SITE_URL}/privacy.html`, `${SITE_URL}/terms.html`];
  for (const lang of Object.keys(inputs.locales)) {
    const dir = lang === DEFAULT_LANG ? "guide" : `guide/${lang}`;
    const top = contextFor(inputs, lang);
    files.set(
      `${dir}/index.html`,
      renderSiteGuide({ ...top, alternates: top.pageAlternates("") })
    );
    files.set(
      `${dir}/templates.html`,
      renderTemplatesGuide({ ...top, alternates: top.pageAlternates("templates.html") })
    );
    urls.push(top.urls.guide, top.urls.templates);
    const deep = contextFor(inputs, lang, { depth: 1 });
    for (const tpl of inputs.templates) {
      files.set(
        `${dir}/templates/${tpl.id}.html`,
        renderTemplatePage(
          { ...deep, alternates: deep.pageAlternates(`templates/${tpl.id}.html`) },
          tpl
        )
      );
      urls.push(`${deep.urls.templatePages}${tpl.id}.html`);
    }
    if (top.missing.length)
      console.warn(
        `  ! ${lang}: ${top.missing.length} strings fall back to ${DEFAULT_LANG}`
      );
  }
  files.set(
    "sitemap.xml",
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${esc(u)}</loc></url>`)
      .join("\n")}\n</urlset>\n`
  );
  return files;
}

export function build() {
  const inputs = loadInputs();
  const files = renderAll(inputs);
  for (const [path, html] of files) {
    const out = join(root, "public", path);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, html);
  }
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!existsSync(join(root, "guides", "shots", `${DEFAULT_LANG}.json`)))
    throw new Error("No screenshots yet: run `npm run guides:shots` first.");
  const files = build();
  console.log(`Wrote ${files.size} files under public/ (guide pages + sitemap.xml).`);
}
