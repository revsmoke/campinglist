// Validates every template in public/templates and the index file. Exit code 1 on any error.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTemplate } from "./template-schema.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public", "templates");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "index.json");

let failed = 0;
const ids = new Set();
for (const file of files.sort()) {
  let doc;
  try {
    doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch (error) {
    console.error(`✖ ${file}: invalid JSON (${error.message})`);
    failed++;
    continue;
  }
  const errors = validateTemplate(doc, { expectedId: basename(file, ".json") });
  if (ids.has(doc.id)) errors.push(`duplicate template id ${doc.id}`);
  ids.add(doc.id);
  if (errors.length) {
    failed++;
    console.error(`✖ ${file}`);
    for (const e of errors) console.error(`   - ${e}`);
  } else {
    const items = doc.sections.reduce((n, s) => n + s.items.length, 0);
    console.log(`✔ ${file} (${doc.sections.length} sections, ${items} items)`);
  }
}

const indexPath = join(dir, "index.json");
if (!existsSync(indexPath)) {
  console.error("✖ templates/index.json is missing — run `npm run templates:index`");
  failed++;
} else {
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  const indexed = new Set(index.templates.map((t) => t.id));
  for (const id of ids)
    if (!indexed.has(id)) {
      console.error(`✖ index.json is missing ${id} — run \`npm run templates:index\``);
      failed++;
    }
  for (const id of indexed)
    if (!ids.has(id)) {
      console.error(`✖ index.json lists unknown template ${id}`);
      failed++;
    }
}

if (failed) {
  console.error(`\n${failed} problem(s) found.`);
  process.exit(1);
}
console.log(`\nAll ${files.length} templates valid.`);
