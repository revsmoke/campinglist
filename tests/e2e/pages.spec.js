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
