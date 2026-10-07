// Copies pinned third-party browser libraries from node_modules into public/vendor.
// Run after `npm install` when bumping a dependency: `npm run vendor`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDir = join(root, "public", "vendor");
mkdirSync(vendorDir, { recursive: true });

const files = [
  ["node_modules/dompurify/dist/purify.min.js", "purify.min.js"],
  ["node_modules/dompurify/LICENSE", "DOMPURIFY-LICENSE"],
  ["node_modules/@azure/msal-browser/lib/msal-browser.min.js", "msal-browser.min.js"],
  [
    "node_modules/@azure/msal-browser/lib/redirect-bridge/msal-redirect-bridge.min.js",
    "msal-redirect-bridge.min.js",
  ],
  ["node_modules/@azure/msal-browser/LICENSE", "MSAL-LICENSE"],
];
const versions = {};
for (const [src, dest] of files) {
  copyFileSync(join(root, src), join(vendorDir, dest));
  console.log(`copied ${src} -> public/vendor/${dest}`);
}
versions.dompurify = JSON.parse(
  readFileSync(join(root, "node_modules/dompurify/package.json"), "utf8")
).version;
versions["@azure/msal-browser"] = JSON.parse(
  readFileSync(join(root, "node_modules/@azure/msal-browser/package.json"), "utf8")
).version;
writeFileSync(join(vendorDir, "VERSIONS.json"), JSON.stringify(versions, null, 2) + "\n");
console.log("versions:", versions);
