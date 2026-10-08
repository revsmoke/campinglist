import { test, expect } from "@playwright/test";
import { blockGoogleMaps } from "./helpers.js";

test.describe("static pages", () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogleMaps(page);
  });
  for (const [path, heading] of [
    ["/privacy.html", "Privacy Policy"],
    ["/terms.html", "Terms of Service"],
  ]) {
    test(`${path} renders with a visible heading and update date`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("h1")).toHaveText(heading);
      await expect(page.locator("body")).toContainText("Last updated: 7 October 2026");
      await expect(page.locator('meta[name="google-adsense-account"]')).toHaveAttribute(
        "content",
        "ca-pub-4491650261060374"
      );
      const text = await page.locator("body").innerText();
      expect(text.length).toBeGreaterThan(1500);
    });
  }

  test("/auth/redirect.html is served (MSAL bridge page)", async ({ page }) => {
    const response = await page.goto("/auth/redirect.html");
    expect(response.status()).toBe(200);
    await expect(page.locator("body")).toContainText(
      /Microsoft sign-in|could not be completed/
    );
  });
});

test.describe("guide pages", () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogleMaps(page);
  });

  test("/guide/ shows the picture guide with numbered callouts and no broken images", async ({
    page,
  }) => {
    const failed = [];
    page.on("response", (r) => {
      if (r.status() >= 400 && r.url().includes("127.0.0.1")) failed.push(r.url());
    });
    await page.goto("/guide/");
    await expect(page.locator("h1")).toHaveText("How to use CampList");
    await expect(page.locator(".step").first()).toBeVisible();
    expect(await page.locator(".step").count()).toBeGreaterThan(15);
    expect(await page.locator(".shot .num").count()).toBeGreaterThan(40);
    // Every picture loads (lazy ones too) and keeps its real size.
    const broken = await page.evaluate(async () => {
      const imgs = [...document.querySelectorAll(".shot img")];
      for (const img of imgs) img.loading = "eager";
      await Promise.all(
        imgs.map((img) =>
          img.complete ? null : new Promise((r) => (img.onload = img.onerror = r))
        )
      );
      return imgs
        .filter((img) => !img.naturalWidth)
        .map((img) => img.getAttribute("src"));
    });
    expect(broken).toEqual([]);
    expect(failed).toEqual([]);
    await expect(page.locator('a[href="../"]').first()).toBeVisible();
  });

  test("/guide/templates.html lists every template with a page and an app link", async ({
    page,
  }) => {
    await page.goto("/guide/templates.html");
    await expect(page.locator("h1")).toHaveText("Templates");
    const cards = page.locator(".tcard");
    expect(await cards.count()).toBe(23);
    await cards.first().locator("a.tcard-main").click();
    await expect(page).toHaveURL(/\/guide\/templates\/[a-z0-9-]+\.html$/);
    await expect(page.locator("h1")).not.toBeEmpty();
    await expect(page.locator(".tsection").first()).toBeVisible();
    const use = page.locator('a.button-link.primary[href*="?template="]').first();
    await expect(use).toHaveText(/Use this template/);
  });

  test("a template page's app link opens that template in CampList", async ({ page }) => {
    await page.goto("/guide/templates/bikepacking.html");
    await page.locator('a.button-link.primary[href*="?template="]').first().click();
    await page.waitForSelector("body.app-ready");
    await expect(page.locator("#templateDetail .template-title")).toHaveText(
      "Bikepacking"
    );
    await expect(page).toHaveURL(/\/$/); // the parameter is consumed
    await page.click("#templateCreate");
    await page.click("#appDialogConfirm");
    await expect(page.locator("#listSelect")).toContainText("Bikepacking");
  });

  test("guide pages carry the two labelled placements with the house-card fallback", async ({
    page,
  }) => {
    // AdSense script blocked (blockGoogleMaps aborts it): both placements show house cards.
    await page.goto("/guide/");
    const slots = page.locator(".ad-slot");
    await expect(slots).toHaveCount(2);
    await expect(slots.nth(0)).toHaveAttribute("data-slot", "sidebar");
    await expect(slots.nth(1)).toHaveAttribute("data-slot", "footer");
    await expect(slots.nth(0).locator(".sponsor-label")).toHaveText("From CampList");
    await expect(slots.nth(1).locator(".sponsor-label")).toHaveText("From CampList");
    expect(await page.locator(".ad-slot .sponsor-card").count()).toBe(2);
  });

  test("a template page renders the AdSense units when the script loads", async ({
    page,
  }) => {
    await page.unroute(/googlesyndication\.com/);
    await page.route("https://pagead2.googlesyndication.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "application/javascript", body: "" })
    );
    await page.goto("/guide/templates/bikepacking.html");
    const units = page.locator(".ad-slot ins.adsbygoogle");
    await expect(units).toHaveCount(2);
    await expect(units.nth(0)).toHaveAttribute("data-ad-slot", "2930956606");
    await expect(units.nth(1)).toHaveAttribute("data-ad-slot", "7181192800");
    await expect(page.locator(".ad-slot .sponsor-label").first()).toHaveText(
      "Advertisement"
    );
    // A unit AdSense cannot fill falls back to the house card, as on the app page.
    await page.evaluate(() => {
      document.querySelector('.ad-slot[data-slot="footer"] ins').dataset.adStatus =
        "unfilled";
    });
    await expect(page.locator('.ad-slot[data-slot="footer"]')).toContainText(
      "From CampList"
    );
  });

  test("/sitemap.xml and /robots.txt are served", async ({ page }) => {
    const sitemap = await page.goto("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain(
      "https://camplist.guide/guide/templates/bikepacking.html"
    );
    const robots = await page.goto("/robots.txt");
    expect(await robots.text()).toContain("Sitemap: https://camplist.guide/sitemap.xml");
  });
});
