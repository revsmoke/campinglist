// Rebuilds public/templates/index.json from the template files. Run after adding or editing a template.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTemplate, summarizeTemplate, CATEGORIES } from "./template-schema.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public", "templates");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".json") && f !== "index.json")
  .sort();

const templates = [];
let failed = 0;
for (const file of files) {
  const doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
  const errors = validateTemplate(doc, { expectedId: basename(file, ".json") });
  if (errors.length) {
    failed++;
    console.error(`✖ ${file}: ${errors.join("; ")}`);
    continue;
  }
  templates.push(summarizeTemplate(doc, file));
}
if (failed) process.exit(1);

// Classic/general first, then by category order, then name.
templates.sort((a, b) => {
  const ca = CATEGORIES.indexOf(a.category);
  const cb = CATEGORIES.indexOf(b.category);
  if (ca !== cb) return ca - cb;
  return a.name.localeCompare(b.name);
});

const index = {
  schema: 1,
  generatedAt: new Date().toISOString().slice(0, 10),
  categories: [
    { id: "general", name: "General" },
    { id: "style", name: "Camping styles" },
    { id: "destination", name: "Destinations" },
    { id: "event", name: "Events" },
  ],
  templates,
};
writeFileSync(join(dir, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`Wrote index.json with ${templates.length} templates.`);
