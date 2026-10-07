import { test, expect } from "@playwright/test";
import { blockGoogleMaps } from "./helpers.js";

test.describe("templates", () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogleMaps(page);
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
  });

  test("browses, filters and inspects a template with sources", async ({ page }) => {
    await page.click("#btnTemplates");
    await expect(page.locator("#templateList .template-card")).toHaveCount(23);
    await page.click('#templateTabs button[data-category="event"]');
    await expect(page.locator("#templateList .template-card")).toHaveCount(4);
    await page.fill("#templateSearch", "burning");
    await expect(page.locator("#templateList .template-card")).toHaveCount(1);
    await page.click("#templateList .template-card");
    await expect(page.locator("#templateDetail .template-title")).toContainText(
      "Burning Man"
    );
    await expect(page.locator("#templateDetail details summary")).toContainText(
      "Sources and review date"
    );
    await page.locator("#templateDetail details summary").click();
    await expect(page.locator("#templateDetail details a").first()).toHaveAttribute(
      "href",
      /^https:\/\//
    );
    await expect(page.locator("#templateDetail")).toContainText(/Reviewed .*2026/);
    await page.click("#templateBack");
    await expect(page.locator("#templateBrowser")).toBeVisible();
  });

  test("creates a new list from a template with optional tags", async ({ page }) => {
    await page.click("#btnTemplates");
    await page.click('#templateTabs button[data-category="style"]');
    await page.fill("#templateSearch", "winter");
    await page.click("#templateList .template-card");
    await page.click("#templateCreate");
    await expect(page.locator("#appDialogInput")).toHaveValue(/Winter/);
    await page.click("#appDialogConfirm");
    await expect(page.locator("#listSelect option")).toHaveCount(2);
    await expect(page).toHaveTitle(/Winter/);
    const items = await page.locator("#checklistContainer li.item").count();
    expect(items).toBeGreaterThan(40);
    expect(
      await page.locator("#checklistContainer .tag-optional").count()
    ).toBeGreaterThan(5);
    // Persisted and switchable
    await page.selectOption("#listSelect", { label: "My CampList" });
    await expect(page.locator("#checklistContainer section.card")).toHaveCount(11);
  });

  test("appends template sections to the current list", async ({ page }) => {
    await page.click("#btnTemplates");
    await page.fill("#templateSearch", "hammock");
    await page.click("#templateList .template-card");
    await page.click("#templateAppend");
    const sections = await page.locator("#checklistContainer section.card").count();
    expect(sections).toBeGreaterThan(11);
    await expect(page.locator("#toastContainer")).toContainText("Added");
    await page.click("#btnUndo");
    await expect(page.locator("#checklistContainer section.card")).toHaveCount(11);
  });
});
