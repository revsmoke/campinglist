import { test, expect } from "@playwright/test";
import { blockGoogleMaps, enableGoogleFeatures } from "./helpers.js";

test.describe("core checklist", () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogleMaps(page);
    await enableGoogleFeatures(page);
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
  });

  test("loads the default template and shows no console errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.reload();
    await page.waitForSelector("body.app-ready");
    await expect(page.locator("#checklistContainer section.card")).toHaveCount(11);
    await expect(page.locator("#checklistContainer li.item")).toHaveCount(85);
    await expect(page.locator("#listSelect option")).toHaveCount(1);
    await expect(page).toHaveTitle(/My CampList/);
    await expect(page.locator("#storageStatus")).toHaveText(/Stored in this browser/);
    expect(errors).toEqual([]);
  });

  test("adds, checks, renames and deletes items and sections with undo", async ({
    page,
  }) => {
    await page.fill("#newSectionTitle", "Fishing");
    await page.click("#addSectionForm button[type=submit]");
    const section = page.locator('section.card:has(.sectionTitle:text-is("Fishing"))');
    await expect(section).toBeVisible();
    await section.locator("form.addItem input").fill("Rod and reel");
    await section.locator("form.addItem button").click();
    const item = section.locator("li.item").first();
    await expect(item.locator("label")).toHaveText("Rod and reel");
    await expect(section.locator(".section-count")).toHaveText("0/1");

    await item.locator('input[type="checkbox"]').check();
    await expect(item).toHaveClass(/checked/);
    await expect(section.locator(".section-count")).toHaveText("1/1");

    await item.locator(".btnEdit").click();
    await expect(page.locator("#appDialog")).toBeVisible();
    await page.fill("#appDialogInput", "Rod, reel and tackle");
    await page.click("#appDialogConfirm");
    await expect(section.locator("li.item label").first()).toHaveText(
      "Rod, reel and tackle"
    );

    await section.locator("li.item .btnDel").first().click();
    await expect(page.locator("#appDialogTitle")).toHaveText("Delete item");
    await page.click("#appDialogConfirm");
    await expect(section.locator("li.item")).toHaveCount(0);

    await page.click("#btnUndo");
    await expect(section.locator("li.item")).toHaveCount(1);
    await page.click("#btnRedo");
    await expect(section.locator("li.item")).toHaveCount(0);

    await section.locator("h2").hover();
    await section.locator(".btnDeleteSection").click();
    await page.click("#appDialogConfirm");
    await expect(
      page.locator('section.card:has(.sectionTitle:text-is("Fishing"))')
    ).toHaveCount(0);

    // Persisted across reload (legacy mirror keys and v2 keys).
    await page.reload();
    await page.waitForSelector("body.app-ready");
    await expect(
      page.locator('section.card:has(.sectionTitle:text-is("Fishing"))')
    ).toHaveCount(0);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain("campChecklist_data");
    expect(keys.some((k) => k.startsWith("campList.v2.guest.list."))).toBe(true);
  });

  test("migrates legacy single-list data", async ({ page }) => {
    await page.evaluate(() => {
      localStorage.clear();
      localStorage.setItem(
        "campChecklist_data",
        JSON.stringify([
          {
            id: "g1",
            title: "Legacy section",
            items: [{ id: "i1", text: "Legacy item", checked: true, note: "" }],
          },
        ])
      );
      localStorage.setItem(
        "campChecklist_meta",
        JSON.stringify({
          destination: "Lake Tahoe",
          startDate: "2026-07-04",
          endDate: "2026-07-06",
        })
      );
    });
    await page.reload();
    await page.waitForSelector("body.app-ready");
    await expect(page.locator(".sectionTitle")).toHaveText(["Legacy section"]);
    await expect(page.locator("li.item").first()).toHaveClass(/checked/);
    await expect(page.locator("#metaContainer")).toContainText("Lake Tahoe");
    await expect(page.locator("#metaContainer")).toContainText("2 nights");
  });

  test("item details update weight, cost, optional and permit panels", async ({
    page,
  }) => {
    const item = page.locator("li.item").first();
    await item.locator(".btnWeight").click();
    await page.fill("#itemWeight", "1200");
    await page.fill("#itemCost", "49.5");
    await page.check("#itemOptional");
    await page.check("#itemPermitRequired");
    await page.fill("#itemRegulationNotes", "Check the quota");
    await page.click("#weightForm button[type=submit]");
    await expect(page.locator("#totalWeight")).toHaveText("1200 g");
    await page.selectOption("#weightUnit", "kg");
    await expect(page.locator("#totalWeight")).toHaveText("1.20 kg");
    await expect(page.locator("#totalCost")).toHaveText("$49.50");
    await expect(page.locator("li.item").first().locator(".tag-optional")).toBeVisible();
    await expect(page.locator("#permitItemsList")).toContainText("Check the quota");
  });

  test("filters items and sections", async ({ page }) => {
    await page.fill("#filterInput", "tent");
    await expect(page.locator("#filterMessage")).toBeHidden();
    const visible = page.locator("li.item:not(.filtered-out)");
    const count = await visible.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(10);
    for (const text of await visible.allInnerTexts())
      expect(text.toLowerCase()).toContain("tent");
    const visibleSections = await page
      .locator("#checklistContainer section.card:not(.filtered-out)")
      .count();
    expect(visibleSections).toBeLessThan(11);
    await expect(page.locator("mark").first()).toBeVisible();
    await page.fill("#filterInput", "zzzz-nothing");
    await expect(page.locator("#filterMessage")).toBeVisible();
    await page.click("#btnClearFilter");
    await expect(page.locator("li.item:not(.filtered-out)")).toHaveCount(85);
  });

  test("trip info validates dates and permit links, works without Google Maps", async ({
    page,
  }) => {
    await page.click("#editMetaBtn");
    await expect(page.locator("#destinationSearchStatus")).toContainText(
      /unavailable|Type the destination/
    );
    await page.fill("#destinationInput", "Joshua Tree");
    await page.fill('#metaForm input[name="startDate"]', "2026-10-10");
    await page.fill('#metaForm input[name="endDate"]', "2026-10-08");
    await page.click('#metaForm button[type="submit"]');
    await expect(page.locator("#errorDialog")).toBeVisible();
    await page.click("#errorDialog button");
    await page.fill('#metaForm input[name="endDate"]', "2026-10-12");
    await page.fill(
      '#metaForm input[name="permitUrl"]',
      "https://www.recreation.gov/permits/1"
    );
    await page.click('#metaForm button[type="submit"]');
    await expect(page.locator("#metaContainer")).toContainText("Joshua Tree");
    await expect(page.locator("#permitUrlLink")).toHaveAttribute(
      "href",
      "https://www.recreation.gov/permits/1"
    );
  });

  test("exports and imports JSON as a new list", async ({ page }) => {
    const downloadPromise = page.waitForEvent("download");
    await page.click("#btnExport");
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/My-CampList-.*\.camplist\.json$/);
    const path = await download.path();
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click("#btnImport");
    const chooser = await fileChooserPromise;
    await chooser.setFiles(path);
    await expect(page.locator("#listSelect option")).toHaveCount(2);
    await expect(page.locator("#toastContainer")).toContainText("Imported");
  });

  test("rejects malformed imports safely", async ({ page }) => {
    const fileChooserPromise = page.waitForEvent("filechooser");
    await page.click("#btnImport");
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"nope": true}'),
    });
    await expect(page.locator("#errorDialog")).toBeVisible();
    await expect(page.locator("#errorMessage")).toContainText("CampList export");
    await expect(page.locator("#listSelect option")).toHaveCount(1);
  });

  test("manages multiple lists and reset", async ({ page }) => {
    await page.click("#btnNewList");
    await page.fill("#appDialogInput", "Zion 2027");
    await page.click("#appDialogConfirm");
    await expect(page.locator("#listSelect")).toHaveValue(/list-/);
    await expect(page.locator(".empty-state")).toBeVisible();
    await page.selectOption("#listSelect", { label: "My CampList" });
    await expect(page.locator("#checklistContainer section.card")).toHaveCount(11);
    await page.click("#btnDeleteList");
    await page.click("#appDialogConfirm");
    await expect(page.locator("#listSelect option")).toHaveCount(1);
    await expect(page.locator("#listSelect option")).toHaveText(["Zion 2027"]);
    await page.click("#btnReset");
    await page.click("#appDialogConfirm");
    await expect(page.locator("#checklistContainer section.card")).toHaveCount(11);
  });

  test("theme toggle cycles and persists", async ({ page }) => {
    await page.click("#btnTheme");
    await expect(page.locator("html")).toHaveClass(/light/);
    await page.click("#btnTheme");
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await page.waitForSelector("body.app-ready");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });

  test("keyboard: section chevron is a focusable button", async ({ page }) => {
    const chevron = page.locator("section.card .chevron").first();
    await chevron.focus();
    await page.keyboard.press("Enter");
    await expect(chevron).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("section.card ul.checklist").first()).toHaveClass(
      /collapsed/
    );
  });

  test("mobile layout keeps controls reachable @mobile", async ({ page }) => {
    await expect(page.locator("#btnTemplates")).toBeVisible();
    await expect(page.locator("#btnSignIn")).toBeVisible();
    const hasHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(hasHorizontalScroll).toBe(false);
    await page.locator("#btnReset").scrollIntoViewIfNeeded();
    await expect(page.locator("#btnReset")).toBeVisible();
  });
});

test.describe("AdSense account", () => {
  test("declares the account on the page, loads the script, and keeps the labelled house cards", async ({
    page,
  }) => {
    await blockGoogleMaps(page);
    const requested = [];
    await page.route("https://pagead2.googlesyndication.com/**", (route) => {
      requested.push(route.request().url());
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await expect(page.locator('meta[name="google-adsense-account"]')).toHaveAttribute(
      "content",
      "ca-pub-4491650261060374"
    );
    expect(requested).toEqual([
      "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4491650261060374",
    ]);
    // No slot IDs configured: both placements keep their labelled house cards, no ad units.
    await expect(page.locator('.ad-slot[data-slot="sidebar"]')).toContainText(
      "From CampList"
    );
    await expect(page.locator("ins.adsbygoogle")).toHaveCount(0);
    const adsTxt = await page.request.get("/ads.txt");
    expect(adsTxt.status()).toBe(200);
    expect((await adsTxt.text()).trim()).toBe(
      "google.com, pub-4491650261060374, DIRECT, f08c47fec0942fa0"
    );
  });
});

test.describe("analytics tag", () => {
  test("loads Google Analytics with consent defaults, and not under Global Privacy Control", async ({
    page,
  }) => {
    const requested = [];
    await page.route("https://www.googletagmanager.com/**", (route) => {
      requested.push(route.request().url());
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
    });
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    expect(requested).toEqual([
      "https://www.googletagmanager.com/gtag/js?id=G-YBTYHE8TK0",
    ]);
    const calls = await page.evaluate(() => window.dataLayer.map((a) => Array.from(a)));
    expect(calls[0].slice(0, 2)).toEqual(["consent", "default"]);
    expect(calls[0][2].analytics_storage).toBe("denied");
    expect(calls[2]).toEqual(["config", "G-YBTYHE8TK0"]);
    // A browser that sends Global Privacy Control gets no tag at all.
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "globalPrivacyControl", { get: () => true });
    });
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    expect(requested).toHaveLength(1);
    expect(await page.evaluate(() => typeof window.dataLayer)).toBe("undefined");
  });
});

test.describe("sign-in providers disabled (feature flags off)", () => {
  test("shows no sign-in button and explains local-only storage", async ({ page }) => {
    await blockGoogleMaps(page);
    await page.addInitScript(() => {
      window.CAMPLIST_CONFIG = Object.assign({}, window.CAMPLIST_CONFIG, {
        features: Object.assign({}, window.CAMPLIST_CONFIG?.features, {
          googleSignIn: false,
          googleDrive: false,
        }),
      });
    });
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await expect(page.locator("#btnSignIn")).toHaveCount(0);
    await expect(page.locator("#storagePanel")).toContainText(
      "not available on this site yet"
    );
    await expect(page.locator("#storagePanel button")).toHaveCount(0);
    await expect(page.locator("#checklistContainer li.item")).toHaveCount(85);
  });
});
