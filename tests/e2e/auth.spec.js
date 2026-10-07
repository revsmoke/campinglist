import { test, expect } from "@playwright/test";
import {
  blockGoogleMaps,
  mockGoogleIdentity,
  blockGoogleIdentity,
  signInWithMock,
} from "./helpers.js";

test.describe("Google sign-in (mocked identity library)", () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogleMaps(page);
  });

  test("signs in, keeps the session across reloads, and signs out", async ({ page }) => {
    await mockGoogleIdentity(page);
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await signInWithMock(page);
    await expect(page.locator("#btnAccountMenu")).toContainText("Casey");
    await expect(page.locator("#toastContainer")).toContainText(
      "Signed in as Casey Camper"
    );
    // Account namespace is separate from guest data.
    await page.fill("#newSectionTitle", "Account only");
    await page.click("#addSectionForm button[type=submit]");
    await page.reload();
    await page.waitForSelector("body.app-ready");
    await expect(page.locator("#btnAccountMenu")).toContainText("Casey");
    await expect(page.locator('.sectionTitle:text-is("Account only")')).toBeVisible();
    const session = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("campList.v2.auth.session"))
    );
    expect(session.accountId).toBe("google:100000000000000000001");
    // Sign out returns to guest lists.
    await page.click("#btnAccountMenu");
    await page.click("#btnSignOut");
    await expect(page.locator("#btnSignIn")).toBeVisible();
    await expect(page.locator('.sectionTitle:text-is("Account only")')).toHaveCount(0);
    // Signing in again restores the account's lists.
    await signInWithMock(page);
    await expect(page.locator('.sectionTitle:text-is("Account only")')).toBeVisible();
  });

  test("sign-out disables Google auto-select when the library is loaded", async ({
    page,
  }) => {
    await mockGoogleIdentity(page);
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await signInWithMock(page);
    await page.click("#btnAccountMenu");
    await page.click("#btnSignOut");
    await expect(page.locator("#btnSignIn")).toBeVisible();
    const events = await page.evaluate(() => window.__gisMock.events);
    expect(events).toContain("id.disableAutoSelect");
  });

  test("offers to copy guest lists into a new account", async ({ page }) => {
    await mockGoogleIdentity(page);
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await page.fill("#newSectionTitle", "Guest work");
    await page.click("#addSectionForm button[type=submit]");
    await page.click("#btnSignIn");
    await page.click("#mockGoogleButton");
    await expect(page.locator("#appDialogTitle")).toHaveText("Keep your current lists?");
    await page.click("#appDialogConfirm");
    await expect(page.locator("#btnAccountMenu")).toBeVisible();
    await expect(page.locator('.sectionTitle:text-is("Guest work")')).toBeVisible();
  });

  test("a cancelled sign-in changes nothing", async ({ page }) => {
    await mockGoogleIdentity(page, { cancelSignIn: true });
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await page.click("#btnSignIn");
    await page.click("#mockGoogleButton");
    await page.waitForTimeout(500);
    await expect(page.locator("#signInDialog")).toBeVisible();
    await page.click("#signInCancel");
    await expect(page.locator("#btnSignIn")).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("campList.v2.auth.session"))
    ).toBeNull();
  });

  test("explains when the Google library cannot load", async ({ page }) => {
    await blockGoogleIdentity(page);
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await page.click("#btnSignIn");
    await expect(page.locator("#signInStatus")).toContainText("could not load", {
      timeout: 20000,
    });
    await expect(page.locator("#signInCancel")).toBeVisible();
  });

  test("an expired session is explained and falls back to guest lists", async ({
    page,
  }) => {
    await mockGoogleIdentity(page);
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await signInWithMock(page);
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem("campList.v2.auth.session"));
      s.expiresAt = new Date(Date.now() - 1000).toISOString();
      localStorage.setItem("campList.v2.auth.session", JSON.stringify(s));
    });
    await page.reload();
    await page.waitForSelector("body.app-ready");
    await expect(page.locator("#btnSignIn")).toBeVisible();
    await expect(page.locator("#toastContainer")).toContainText("expired");
    expect(
      await page.evaluate(() => localStorage.getItem("campList.v2.auth.session"))
    ).toBeNull();
  });

  test("rejects an ID token issued for another app", async ({ page }) => {
    await mockGoogleIdentity(page, { aud: "some-other-app" });
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await page.click("#btnSignIn");
    await page.click("#mockGoogleButton");
    await expect(page.locator("#signInStatus")).toContainText("different app");
    await expect(page.locator("#btnAccountMenu")).toHaveCount(0);
    expect(
      await page.evaluate(() => localStorage.getItem("campList.v2.auth.session"))
    ).toBeNull();
  });
});
