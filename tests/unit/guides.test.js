import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_LANG,
  contextFor,
  esc,
  loadInputs,
  makeTranslator,
  renderAll,
  renderSiteGuide,
  renderTemplatePage,
  renderTemplatesGuide,
  root,
} from "../../scripts/build-guides.mjs";

const inputs = loadInputs();
const en = inputs.locales[DEFAULT_LANG];

describe("guide strings and structure", () => {
  it("the default locale has every string the structure needs (no fallbacks)", () => {
    const ctx = contextFor(inputs, DEFAULT_LANG);
    renderSiteGuide({ ...ctx, alternates: [] });
    renderTemplatesGuide({ ...ctx, alternates: [] });
    const deep = contextFor(inputs, DEFAULT_LANG, { depth: 1 });
    for (const tpl of inputs.templates)
      renderTemplatePage({ ...deep, alternates: [] }, tpl);
    expect(ctx.missing).toEqual([]);
    expect(deep.missing).toEqual([]);
  });

  it("every step points at an existing shot with every callout anchor", () => {
    const shots = inputs.shots[DEFAULT_LANG];
    const steps = [
      ...inputs.structure.groups.flatMap((g) => g.steps),
      ...inputs.templatesStructure.steps,
    ];
    for (const step of steps) {
      const shot = shots[step.shot];
      expect(shot, `shot ${step.shot} for step ${step.id}`).toBeDefined();
      expect(
        existsSync(join(root, "public", "guide", "img", DEFAULT_LANG, shot.file))
      ).toBe(true);
      for (const key of step.callouts) {
        expect(shot.anchors[key], `anchor ${key} in ${step.shot}`).toBeDefined();
      }
    }
  });

  it("falls back to the default locale and interpolates", () => {
    const missing = [];
    const t = makeTranslator(
      { lang: "fr", guide: { title: "Mode d'emploi" } },
      { guide: { title: "How to", lead: "Lead {n}" } },
      { onMissing: (p) => missing.push(p) }
    );
    expect(t("guide.title")).toBe("Mode d'emploi");
    expect(t("guide.lead", { n: 3 })).toBe("Lead 3");
    expect(missing).toEqual(["guide.lead"]);
    expect(t.opt("guide.nope")).toBe("");
    expect(() => t("guide.nope")).toThrow(/Missing string/);
    expect(esc('<a href="x">&\'')).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("locale files share the default locale's keys", () => {
    const keys = (obj, prefix = "") =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]
      );
    const expected = new Set(keys(en));
    for (const [lang, strings] of Object.entries(inputs.locales)) {
      for (const key of keys(strings))
        expect(expected.has(key), `${lang}: ${key}`).toBe(true);
    }
  });
});

describe("generated guide pages", () => {
  const files = renderAll(inputs);

  it("are up to date on disk (run `npm run guides:build` after changing inputs)", () => {
    for (const [path, html] of files) {
      const onDisk = readFileSync(join(root, "public", path), "utf8");
      expect(onDisk === html, `public/${path} is stale`).toBe(true);
    }
  });

  it("include a page for every template and a sitemap entry for each page", () => {
    const templateFiles = readdirSync(join(root, "public", "templates")).filter(
      (f) => f.endsWith(".json") && f !== "index.json"
    );
    for (const file of templateFiles) {
      expect(files.has(`guide/templates/${file.replace(".json", ".html")}`)).toBe(true);
    }
    const sitemap = files.get("sitemap.xml");
    for (const path of files.keys()) {
      if (path.endsWith(".html"))
        expect(sitemap).toContain(
          `https://camplist.guide/${path.replace(/index\.html$/, "")}`
        );
    }
  });

  it("show the template's data and link into the app", () => {
    const tpl = inputs.templates.find((t) => t.id === "bikepacking");
    const html = files.get("guide/templates/bikepacking.html");
    expect(html).toContain(`<html lang="en" dir="ltr">`);
    expect(html).toContain(esc(tpl.name));
    expect(html).toContain(esc(tpl.tagline));
    expect(html).toContain(`href="../../?template=bikepacking"`);
    for (const section of tpl.sections) expect(html).toContain(esc(section.title));
    for (const source of tpl.sources) expect(html).toContain(`href="${esc(source.url)}"`);
    expect(html).toContain(
      '<link rel="canonical" href="https://camplist.guide/guide/templates/bikepacking.html" />'
    );
    // The only script is the analytics module; everything else is static markup.
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).toContain('src="../../js/analytics.js"');
  });

  it("number the callouts on every illustrated step and legend", () => {
    const html = files.get("guide/index.html");
    const steps = inputs.structure.groups.flatMap((g) => g.steps);
    for (const step of steps) {
      expect(html).toContain(`id="${step.id}"`);
      expect(html).toContain(`img/en/${step.shot}.webp`);
    }
    const legends = html.match(/<ol class="legend">/g) || [];
    expect(legends.length).toBe(steps.filter((s) => s.callouts.length).length);
    expect(html).toContain('class="num" style="left:');
    expect(html).toContain("templates.html");
  });
});
