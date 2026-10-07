import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateTemplate, summarizeTemplate } from "../../scripts/template-schema.mjs";
import { pickCard } from "../../public/js/sponsors.js";

const dir = join(process.cwd(), "public", "templates");

describe("template library", () => {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json");

  it("has at least 20 templates and every one validates", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
    for (const file of files) {
      const doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
      expect(
        validateTemplate(doc, { expectedId: file.replace(".json", "") }),
        file
      ).toEqual([]);
      expect(doc.sources.length, `${file} sources`).toBeGreaterThan(0);
      expect(doc.reviewedOn).toMatch(/^2026-/);
    }
  });

  it("index.json matches the files", () => {
    const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
    expect(index.templates.map((t) => t.file).sort()).toEqual(files.sort());
    for (const row of index.templates) {
      const doc = JSON.parse(readFileSync(join(dir, row.file), "utf8"));
      expect(row).toEqual(summarizeTemplate(doc, row.file));
    }
  });

  it("rejects broken templates", () => {
    expect(validateTemplate({})).not.toEqual([]);
    const errors = validateTemplate({
      id: "Bad Id",
      name: "x",
      category: "nope",
      tagline: "t",
      description: "d",
      season: "s",
      typicalDuration: "d",
      considerations: [],
      reviewedOn: "yesterday",
      sources: [{ title: "", publisher: "", url: "ftp://x", accessed: "2026-01-01" }],
      sections: [{ title: "A", items: [{ text: "x", required: "yes", extra: 1 }] }],
    });
    expect(errors.join("\n")).toMatch(/kebab-case/);
    expect(errors.join("\n")).toMatch(/category/);
    expect(errors.join("\n")).toMatch(/reviewedOn/);
    expect(errors.join("\n")).toMatch(/required must be a boolean/);
    expect(errors.join("\n")).toMatch(/unknown key/);
  });
});

describe("sponsor cards", () => {
  const day = Date.parse("2026-10-07T12:00:00Z");
  const cards = [
    {
      id: "h",
      kind: "house",
      title: "House",
      url: "https://camplist.guide/",
      slots: ["sidebar", "footer"],
    },
    {
      id: "s",
      kind: "sponsor",
      sponsor: "Brand",
      title: "Brand tent",
      url: "https://brand.example/",
      slots: ["sidebar"],
      start: "2026-10-01",
      end: "2026-10-31",
    },
    {
      id: "old",
      kind: "sponsor",
      title: "Expired",
      url: "https://old.example/",
      end: "2026-01-01",
    },
    { id: "bad", kind: "sponsor", title: "", url: "https://x.example/" },
  ];

  it("prefers active paid cards in their slots and falls back to house cards", () => {
    expect(pickCard(cards, "sidebar", day).id).toBe("s");
    expect(pickCard(cards, "footer", day).id).toBe("h");
    expect(pickCard(cards, "sidebar", Date.parse("2026-10-31T23:00:00Z")).id).toBe("s");
    expect(pickCard(cards, "sidebar", Date.parse("2026-11-01T00:00:00Z")).id).toBe("h");
    expect(pickCard(cards, "sidebar", Date.parse("2026-12-01")).id).toBe("h");
    expect(pickCard([], "sidebar", day)).toBeNull();
    expect(
      pickCard(
        cards.filter((c) => c.id === "bad"),
        "sidebar",
        day
      )
    ).toBeNull();
  });
});
