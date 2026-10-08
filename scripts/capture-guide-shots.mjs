// Captures the screenshots used by the visual guides (public/guide/) from a local copy of the app.
//
//   node scripts/capture-guide-shots.mjs [--lang en] [--port 8080] [--base URL] [--real-base URL]
//
// Every shot comes from a real, scripted session: the script clicks through the app the way a
// visitor would, measures the elements a guide step points at, and writes
//   public/guide/img/<lang>/<shot>.webp         the picture
//   guides/shots/<lang>.json                     picture sizes + callout boxes in % of the picture
// scripts/build-guides.mjs turns those into pages. Re-run this after UI changes, or with --lang
// once the app itself is localized, so the pictures match what visitors see.
//
// Google Identity and Drive are served from the end-to-end mocks (tests/e2e/mocks), so no real
// account is needed. Two dialogs need Google's real libraries (the sign-in button, the Places
// destination search): they are shot online from --real-base (default: the local server) and
// fall back to the mocked versions when offline.
/* global window, document, Image */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  blockGoogleMaps,
  mockDriveApi,
  mockGoogleIdentity,
} from "../tests/e2e/helpers.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const lang = opt("lang", "en");
const PORT = Number(opt("port", "8080"));
let base = opt("base", "");
// Behind a corporate proxy point this at the live site (--real-base https://camplist.guide).
const realBase = opt("real-base", "");
const imgDir = join(root, "public", "guide", "img", lang);
const shotsFile = join(root, "guides", "shots", `${lang}.json`);
mkdirSync(imgDir, { recursive: true });
mkdirSync(dirname(shotsFile), { recursive: true });

const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 412, height: 915 };
const SCALE = 2;
const WEBP_QUALITY = 0.86;
const shots = {};
const log = (...m) => console.log(...m);

// Sample data. The trip dates are the next 10 April at least two months away, so the permit
// deadline never shows as past due and re-runs within a year produce the same pictures.
const iso = (d) => d.toISOString().slice(0, 10);
const plusDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const tripStart = (() => {
  const now = new Date();
  let d = new Date(Date.UTC(now.getUTCFullYear(), 3, 10));
  if (d.getTime() - now.getTime() < 60 * 86_400_000)
    d = new Date(Date.UTC(now.getUTCFullYear() + 1, 3, 10));
  return d;
})();
const SAMPLE = {
  account: { name: "Alex", email: "alex@example.com" },
  trip: {
    destination: "Joshua Tree National Park",
    startDate: iso(tripStart),
    endDate: iso(plusDays(tripStart, 3)),
    notes: "Meet at Jumbo Rocks, site 42.",
    permitUrl: "https://www.recreation.gov/camping/campgrounds/232470",
    permitDeadline: iso(plusDays(tripStart, -21)),
    fireRules: "Fires only in provided fire rings. Bring your own firewood.",
  },
  newList: "Weekend trip",
  newSection: "Kitchen",
  newItems: ["Stove", "Fuel canister", "Lighter"],
  nextSection: "Sleep",
  search: "tent",
  templateId: "yosemite-wilderness-backpacking",
};

// ---------------------------------------------------------------- plumbing
async function startServer() {
  if (base) return null;
  base = `http://127.0.0.1:${PORT}`;
  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["http-server", "public", "-p", String(PORT), "-c-1", "-s"],
    { cwd: root, stdio: "ignore" }
  );
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${base}/index.html`);
      if (r.ok) return child;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  child.kill();
  throw new Error(`Local server did not start on ${base}`);
}

const proxyServer = () => process.env.HTTPS_PROXY || process.env.https_proxy || "";

async function newContext(browser, { mobile = false, ...rest } = {}) {
  const context = await browser.newContext({
    ...rest,
    viewport: mobile ? PHONE : DESKTOP,
    deviceScaleFactor: SCALE,
    isMobile: mobile,
    hasTouch: mobile,
    locale: lang,
    timezoneId: "UTC",
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  // Nothing captured here should hit analytics or ad servers.
  await context.route(
    /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|googlesyndication\.com|doubleclick\.net|adtrafficquality\.google|googletagservices\.com/,
    (route) => route.abort("failed")
  );
  return context;
}

async function openApp(page, origin = base) {
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForSelector("body.app-ready");
  await page.waitForTimeout(300);
}

const asLocator = (page, sel) =>
  typeof sel === "string" ? page.locator(sel).first() : sel;

async function boxOf(page, sel, what) {
  const box = await asLocator(page, sel).boundingBox();
  if (!box) throw new Error(`"${what}" is not visible`);
  return box;
}

function unionBox(boxes, pad) {
  const l = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const t = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const r = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const btm = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  return { x: l, y: t, width: r - l, height: btm - t };
}

/** PNG -> WebP with the browser's own encoder, so no native image tool is needed. */
async function toWebp(context, png) {
  const page = await context.newPage();
  try {
    const dataUrl = await page.evaluate(
      async ([b64, quality]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        return canvas.toDataURL("image/webp", quality);
      },
      [png.toString("base64"), WEBP_QUALITY]
    );
    return Buffer.from(dataUrl.split(",")[1], "base64");
  } finally {
    await page.close();
  }
}

const pngSize = (png) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) });

/**
 * Takes one shot of `targets` (locators; none = the viewport) with `pad` around them, and stores
 * the callout `anchors` (selectors or locators) in % of the picture. If the targets run past the
 * bottom of the viewport the viewport is made taller first, so nothing is cut off.
 */
async function shoot(
  page,
  name,
  {
    targets = [],
    anchors = {},
    pad = 12,
    maxHeight = Infinity,
    viewportHeight = Infinity,
  } = {}
) {
  // No focus rings or carets in the pictures.
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.waitForTimeout(150);
  const original = page.viewportSize();
  const clipFor = async () => {
    if (!targets.length) {
      const vp = page.viewportSize();
      return { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, viewportHeight) };
    }
    const boxes = [];
    for (const [i, sel] of targets.entries())
      boxes.push(await boxOf(page, sel, `${name} target ${i}`));
    const box = unionBox(boxes, pad);
    box.height = Math.min(box.height, maxHeight);
    return box;
  };
  // Content a target scrolls internally (a dialog capped at 90vh) counts as cut off too.
  const hiddenOverflow = async () => {
    let extra = 0;
    for (const sel of targets) {
      const o = await asLocator(page, sel).evaluate(
        (el) => el.scrollHeight - el.clientHeight
      );
      if (o > 2) extra = Math.max(extra, o);
    }
    return extra;
  };
  let area = await clipFor();
  for (let i = 0; i < 4 && targets.length; i++) {
    const vp = page.viewportSize();
    const overflow = await hiddenOverflow();
    const bottom = area.y + area.height;
    if (bottom <= vp.height && !overflow) break;
    await page.setViewportSize({
      width: original.width,
      height: Math.ceil(Math.max(vp.height, bottom) + overflow + pad + 40),
    });
    await page.waitForTimeout(200);
    area = await clipFor();
  }
  const boxes = {};
  for (const [key, sel] of Object.entries(anchors))
    boxes[key] = await boxOf(page, sel, `${name}.${key}`);
  const png = await page.screenshot({
    clip: area,
    animations: "disabled",
    caret: "hide",
  });
  if (page.viewportSize().height !== original.height)
    await page.setViewportSize(original);
  const webp = await toWebp(page.context(), png);
  const file = `${name}.webp`;
  writeFileSync(join(imgDir, file), webp);
  const size = pngSize(png);
  const pct = (v, total) => Math.round((v / total) * 1000) / 10;
  const calloutBoxes = {};
  for (const [key, b] of Object.entries(boxes)) {
    calloutBoxes[key] = {
      l: pct(b.x - area.x, area.width),
      t: pct(b.y - area.y, area.height),
      w: pct(b.width, area.width),
      h: pct(b.height, area.height),
    };
  }
  shots[name] = { file, width: size.width, height: size.height, anchors: calloutBoxes };
  log(`  ✓ ${file} ${size.width}×${size.height} (${Math.round(webp.length / 1024)} KB)`);
}

/** Signs in with the mocked Google button and keeps the guest lists when asked. */
async function signIn(page) {
  await page.click("#btnSignIn");
  await page.waitForSelector("#mockGoogleButton");
  await page.click("#mockGoogleButton");
  const outcome = await Promise.race([
    page.waitForSelector("#btnAccountMenu").then(() => "done"),
    page.waitForSelector("#appDialogConfirm:visible").then(() => "confirm"),
  ]);
  if (outcome === "confirm") {
    await page.click("#appDialogConfirm");
    await page.waitForSelector("#btnAccountMenu");
  }
  await page.waitForTimeout(300);
}

async function promptAnswer(page, value) {
  await page.waitForSelector("#appDialogInput:visible");
  await page.fill("#appDialogInput", value);
  await page.click("#appDialogConfirm");
}

async function closeDialog(page, id) {
  await page.waitForSelector(`#${id}[open]`, { state: "hidden" });
}

async function setItemDetails(
  page,
  item,
  { weight, cost, packed, optional, permit } = {}
) {
  await item.hover();
  await item.locator(".btnWeight").click();
  await page.waitForSelector("#weightDialog[open]");
  if (weight !== undefined) await page.fill("#itemWeight", String(weight));
  if (cost !== undefined) await page.fill("#itemCost", String(cost));
  if (packed !== undefined) await page.setChecked("#itemPacked", packed);
  if (optional !== undefined) await page.setChecked("#itemOptional", optional);
  if (permit !== undefined) await page.setChecked("#itemPermitRequired", permit);
  await page.click("#weightDialog button[type=submit]");
  await closeDialog(page, "weightDialog");
}

async function fillTripInfo(page, trip) {
  await page.click("#editMetaBtn");
  await page.waitForSelector("#metaDialog[open]");
  await page.waitForTimeout(400);
  await page.fill("#destinationInput", trip.destination);
  await page.fill("#metaDialog input[name=startDate]", trip.startDate);
  await page.fill("#metaDialog input[name=endDate]", trip.endDate);
  await page.fill("#metaDialog textarea[name=notes]", trip.notes);
  await page.fill("#metaDialog input[name=permitUrl]", trip.permitUrl);
  await page.fill("#metaDialog input[name=permitDeadline]", trip.permitDeadline);
  await page.fill("#metaDialog textarea[name=fireRules]", trip.fireRules);
}

const TRIP_ANCHORS = {
  destination: "#destinationInput",
  dates: "#metaDialog input[name=startDate]",
  notes: "#metaDialog textarea[name=notes]",
  permit: "#metaDialog input[name=permitUrl]",
  deadline: "#metaDialog input[name=permitDeadline]",
  fire: "#metaDialog textarea[name=fireRules]",
  save: "#metaDialog button[value=save]",
};

// ---------------------------------------------------------------- desktop, mocked Google
async function desktopShots(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await blockGoogleMaps(page);
  await mockGoogleIdentity(page, SAMPLE.account);
  const drive = await mockDriveApi(page, { userEmail: SAMPLE.account.email });
  await openApp(page);
  // Action buttons only appear on hover on desktop; show them for the item shots.
  await page.addStyleTag({ content: ".actions{opacity:1 !important}" });

  log("overview");
  await shoot(page, "overview", {
    anchors: {
      lists: ".list-bar",
      trip: "#metaContainer .trip-info",
      checklist: "#checklistContainer section.card",
      tools: "#weightSidebar",
      templates: "#btnTemplates",
      signin: "#btnSignIn",
    },
  });

  log("check-off");
  const first = page.locator("#checklistContainer section.card").first();
  const checks = first.locator("li.item input[type=checkbox]");
  for (let i = 0; i < 3; i++) await checks.nth(i).check();
  await page.waitForTimeout(200);
  const optionalTag = first.locator("li.item .tag-optional").first();
  await shoot(page, "check-off", {
    targets: [first],
    anchors: {
      check: checks.nth(3),
      progress: first.locator(".section-count"),
      collapse: first.locator(".chevron"),
      optional: (await optionalTag.count())
        ? optionalTag
        : first.locator(".sectionTitle"),
    },
  });

  log("item-actions");
  const row = first.locator("li.item").nth(4);
  await row.hover();
  await shoot(page, "item-actions", {
    targets: [row],
    pad: 10,
    anchors: {
      drag: row.locator(".handle"),
      note: row.locator(".btnNote"),
      details: row.locator(".btnWeight"),
      rename: row.locator(".btnEdit"),
      delete: row.locator(".btnDel"),
    },
  });

  log("item-details");
  await row.locator(".btnWeight").click();
  await page.waitForSelector("#weightDialog[open]");
  await page.fill("#itemWeight", "1250");
  await page.fill("#itemCost", "89.00");
  await shoot(page, "item-details", {
    targets: ["#weightDialog"],
    pad: 0,
    anchors: {
      weight: "#itemWeight",
      cost: "#itemCost",
      packed: "#itemPacked",
      optional: "#itemOptional",
      permit: "#itemPermitRequired",
      save: "#weightDialog button[type=submit]",
    },
  });
  await page.click("#weightDialog button[type=submit]");
  await closeDialog(page, "weightDialog");

  log("search");
  await page.fill("#filterInput", SAMPLE.search);
  await page.waitForFunction((q) => {
    const kept = [
      ...document.querySelectorAll("#checklistContainer li.item:not(.filtered-out)"),
    ];
    return (
      kept.length > 0 && kept.every((li) => li.textContent.toLowerCase().includes(q))
    );
  }, SAMPLE.search);
  await page.waitForTimeout(300);
  await shoot(page, "search", {
    targets: [
      ".filter-container",
      page.locator("#checklistContainer section.card:not(.filtered-out)").first(),
    ],
    maxHeight: 420,
    anchors: { type: "#filterInput", clear: "#btnClearFilter" },
  });
  await page.click("#btnClearFilter");

  log("trip-info");
  await fillTripInfo(page, SAMPLE.trip);
  // Destination search needs Google Maps; this context runs offline, so the local picture
  // leaves it out. realShots() replaces it with the live dialog when the network allows.
  await page.addStyleTag({ content: ".destination-block{display:none !important}" });
  await shoot(page, "trip-info-dialog", {
    targets: ["#metaDialog"],
    pad: 0,
    anchors: TRIP_ANCHORS,
  });
  await page.click("#metaDialog button[value=save]");
  await closeDialog(page, "metaDialog");
  await page.waitForTimeout(200);
  await shoot(page, "trip-info-panel", {
    targets: ["#metaContainer .trip-info"],
    anchors: { edit: "#editMetaBtn" },
  });

  log("weight-cost");
  const items = first.locator("li.item");
  await setItemDetails(page, items.nth(5), { weight: 2100, cost: 249, packed: true });
  await setItemDetails(page, items.nth(6), { weight: 800, cost: 35 });
  const permitItem = first.locator("li.item", { hasText: /permit|reserv/i }).first();
  await setItemDetails(page, (await permitItem.count()) ? permitItem : items.nth(0), {
    permit: true,
  });
  await page.selectOption("#weightUnit", "kg");
  await page.waitForTimeout(200);
  await page.locator("#weightSidebar").scrollIntoViewIfNeeded();
  await shoot(page, "weight-cost", {
    targets: ["#weightSidebar", ".cost-summary"],
    anchors: {
      unit: "#weightUnit",
      total: "#totalWeight",
      packed: "#packedWeight",
      cost: "#totalCost",
    },
  });

  log("permits");
  await page.locator(".permits-section").scrollIntoViewIfNeeded();
  await shoot(page, "permits", {
    targets: [".permits-section"],
    anchors: {
      link: "#permitUrlLink",
      deadline: "#permitDeadlineText",
      fire: "#fireRulesText",
      items: "#permitItemsList",
    },
  });

  log("controls");
  await page.locator(".controls").scrollIntoViewIfNeeded();
  await shoot(page, "controls", {
    targets: [".controls"],
    anchors: {
      undo: "#btnUndo",
      theme: "#btnTheme",
      print: "#btnPrint",
      export: "#btnExport",
      import: "#btnImport",
      reset: "#btnReset",
    },
  });

  log("lists + add");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click("#btnNewList");
  await promptAnswer(page, SAMPLE.newList);
  await page.waitForSelector("#checklistContainer .empty-state");
  await shoot(page, "empty-list", {
    targets: ["#checklistContainer .empty-state"],
    anchors: { templates: "#btnEmptyTemplates" },
  });
  await page.fill("#newSectionTitle", SAMPLE.newSection);
  await page.click("#addSectionForm button[type=submit]");
  await page.waitForSelector("#checklistContainer section.card");
  const section = page.locator("#checklistContainer section.card").first();
  const addInput = section.locator("form.addItem input");
  for (const text of SAMPLE.newItems) {
    await addInput.fill(text);
    await addInput.press("Enter");
    await page.waitForTimeout(100);
  }
  await page.fill("#newSectionTitle", SAMPLE.nextSection);
  await shoot(page, "add-items", {
    targets: [section, "#addSectionForm"],
    anchors: {
      item: section.locator("form.addItem input"),
      add: section.locator("form.addItem button"),
      section: "#newSectionTitle",
      addSection: "#addSectionForm button[type=submit]",
    },
  });
  await page.fill("#newSectionTitle", "");
  await shoot(page, "lists", {
    targets: [".list-bar"],
    anchors: {
      select: "#listSelect",
      new: "#btnNewList",
      rename: "#btnRenameList",
      delete: "#btnDeleteList",
      status: "#storageStatus",
    },
  });

  log("sign-in + storage");
  await signIn(page);
  await page.waitForSelector('#storagePanel [data-action="connect"]');
  await shoot(page, "header-account", {
    targets: [".app-header"],
    pad: 8,
    anchors: { account: "#btnAccountMenu", templates: "#btnTemplates" },
  });
  await shoot(page, "storage-not-connected", {
    targets: ["#storagePanel"],
    anchors: {
      badge: "#storagePanel .storage-badge-off",
      connect: '#storagePanel [data-action="connect"]',
    },
  });
  await page.click('#storagePanel [data-action="connect"]');
  await page.waitForSelector("#storagePanel .storage-badge:not(.storage-badge-off)");
  await page.click('#storagePanel [data-action="save"]');
  await page.waitForSelector("#storagePanel .status-saved", { timeout: 10_000 });
  await page.waitForTimeout(200);
  await shoot(page, "storage-connected", {
    targets: ["#storagePanel"],
    anchors: {
      badge: "#storagePanel .storage-badge",
      status: "#storagePanel .storage-status",
      save: '#storagePanel [data-action="save"]',
      open: '#storagePanel [data-action="open"]',
      files: '#storagePanel [data-action="files"]',
      disconnect: '#storagePanel [data-action="disconnect"]',
      autosave: '#storagePanel [data-action="autosync"]',
    },
  });
  log(`  (mock Drive now holds ${drive.listFiles().length} list file)`);

  log("templates");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click("#btnTemplates");
  await page.waitForSelector("#templatesDialog[open] .template-card");
  await page.waitForTimeout(200);
  await shoot(page, "templates-browse", {
    targets: ["#templatesDialog"],
    pad: 0,
    maxHeight: 700,
    anchors: {
      tabs: "#templateTabs",
      search: "#templateSearch",
      card: "#templateList .template-card",
      close: "#templatesClose",
    },
  });
  await page.click("#templateTabs button[data-category=destination]");
  await page.click(`#templateList .template-card[data-id="${SAMPLE.templateId}"]`);
  await page.waitForSelector("#templateDetail:not([hidden]) #templateCreate");
  await page.waitForTimeout(200);
  await shoot(page, "templates-detail", {
    targets: ["#templatesDialog"],
    pad: 0,
    anchors: {
      back: "#templateBack",
      sections: "#templateDetail .template-sections",
      sources: "#templateDetail details summary",
      append: "#templateAppend",
      create: "#templateCreate",
    },
  });
  await page.click("#templateCreate");
  await page.waitForSelector("#appDialogInput:visible");
  await page.click("#appDialogConfirm");
  await closeDialog(page, "templatesDialog");
  await page.waitForSelector("#toastContainer .toast.show");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const created = page.locator("#checklistContainer section.card").first();
  await shoot(page, "templates-created", {
    targets: [".list-bar", created],
    maxHeight: 640,
    anchors: { list: "#listSelect", section: created.locator(".sectionTitle") },
  });

  log("dark theme");
  await page.click("#btnTheme");
  await page.waitForTimeout(300);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "dark-theme", {
    viewportHeight: 620,
    anchors: { theme: "#btnTheme" },
  });
  await page.click("#btnTheme");

  log("print layout");
  await page.evaluate(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
  });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await shoot(page, "print", { viewportHeight: 760 });
  await page.emulateMedia({ media: null });
  await context.close();
}

// ---------------------------------------------------------------- real Google libraries
async function realShots(browser, realBrowser) {
  const origin = realBase || base;
  const context = await newContext(realBrowser, {
    ignoreHTTPSErrors: Boolean(realBase && proxyServer()),
  });
  const page = await context.newPage();
  try {
    await openApp(page, origin);
    await fillTripInfo(page, SAMPLE.trip);
    await page.waitForSelector(
      "#destinationContainer input, #destinationContainer gmp-place-autocomplete",
      { timeout: 15_000 }
    );
    await page.waitForTimeout(800);
    await shoot(page, "trip-info-dialog", {
      targets: ["#metaDialog"],
      pad: 0,
      anchors: { search: "#destinationContainer", ...TRIP_ANCHORS },
    });
    await page.click("#metaCancelBtn");
    await closeDialog(page, "metaDialog");
    await page.click("#btnSignIn");
    await page.waitForSelector("#googleSignInSlot iframe", { timeout: 15_000 });
    await page.waitForTimeout(1200);
    // Only configured providers are offered; keep an older deployment honest about that.
    await page.addStyleTag({ content: "[hidden]{display:none !important}" });
    await shoot(page, "sign-in", {
      targets: ["#signInDialog"],
      pad: 0,
      anchors: { google: "#googleSignInSlot", later: "#signInCancel" },
    });
    log("  (online shots: Google's real sign-in button and destination search)");
  } catch (error) {
    log(`  (online shots unavailable: ${error.message.split("\n")[0]}; using the mocks)`);
    await context.close();
    const ctx2 = await newContext(browser);
    const p2 = await ctx2.newPage();
    await blockGoogleMaps(p2);
    await mockGoogleIdentity(p2, SAMPLE.account);
    await openApp(p2);
    await p2.click("#btnSignIn");
    await p2.waitForSelector("#mockGoogleButton");
    await shoot(p2, "sign-in", {
      targets: ["#signInDialog"],
      pad: 0,
      anchors: { google: "#googleSignInSlot", later: "#signInCancel" },
    });
    await ctx2.close();
    return;
  }
  await context.close();
}

// ---------------------------------------------------------------- trip wizard
async function wizardShots(browser) {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto(`${base}/plan/`, { waitUntil: "load" });
  await page.waitForSelector("body.wizard-ready");
  await page.fill("#whereInput", "half dome in july");
  await page.waitForSelector('[data-reading="where"]');
  await shoot(page, "plan-where", {
    targets: ["#wizard"],
    anchors: {
      input: "#whereInput",
      reading: '[data-reading="where"]',
      chips: "#wizard .field .chips",
      next: '#wizard [data-action="next"]',
    },
  });
  await context.close();
}

// ---------------------------------------------------------------- phone
async function mobileShots(browser) {
  const context = await newContext(browser, { mobile: true });
  const page = await context.newPage();
  await blockGoogleMaps(page);
  await mockGoogleIdentity(page, SAMPLE.account);
  await openApp(page);
  const first = page.locator("#checklistContainer section.card").first();
  const checks = first.locator("li.item input[type=checkbox]");
  await checks.nth(0).check();
  await checks.nth(1).check();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, "mobile", {
    anchors: { templates: "#btnTemplates", check: checks.nth(2) },
  });
  await context.close();
}

const server = await startServer();
// The local server is reached directly; a second browser goes through the proxy (if any) for
// the shots that load Google's real libraries from --real-base.
const browser = await chromium.launch({ headless: true });
const realBrowser =
  realBase && proxyServer()
    ? await chromium.launch({ headless: true, proxy: { server: proxyServer() } })
    : browser;
try {
  log(`Capturing guide screenshots from ${base} (lang=${lang})`);
  await desktopShots(browser);
  await realShots(browser, realBrowser);
  await wizardShots(browser);
  await mobileShots(browser);
  const ordered = Object.fromEntries(
    Object.entries(shots).sort(([a], [b]) => a.localeCompare(b))
  );
  writeFileSync(
    shotsFile,
    JSON.stringify({ lang, scale: SCALE, viewport: DESKTOP, shots: ordered }, null, 2) +
      "\n"
  );
  log(`Wrote ${Object.keys(shots).length} shots to ${shotsFile}`);
} finally {
  await browser.close();
  if (realBrowser !== browser) await realBrowser.close();
  server?.kill();
}
