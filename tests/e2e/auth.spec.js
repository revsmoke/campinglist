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

  async function seedOtherAccount(page, { id, primaryProvider, identities, listTitle }) {
    await page.evaluate(
      ({ id, primaryProvider, identities, listTitle }) => {
        const stamp = new Date().toISOString();
        const accounts = JSON.parse(localStorage.getItem("campList.v2.auth.accounts"));
        accounts.push({
          id,
          primaryProvider,
          lastProvider: primaryProvider,
          email: "casey@example.com",
          name: "Casey Elsewhere",
          givenName: "Casey",
          picture: "",
          createdAt: stamp,
          lastSignInAt: stamp,
          identities: identities.map((i) => ({
            ...i,
            name: "Casey Elsewhere",
            linkedAt: stamp,
          })),
          storage: {},
        });
        localStorage.setItem("campList.v2.auth.accounts", JSON.stringify(accounts));
        const ns = id.replace(/[^a-zA-Z0-9]/g, "_");
        localStorage.setItem(
          `campList.v2.${ns}.index`,
          JSON.stringify({
            active: "list-other",
            lists: [
              {
                id: "list-other",
                name: "Other trip",
                createdAt: stamp,
                updatedAt: stamp,
                pristine: false,
                sync: {},
              },
            ],
          })
        );
        localStorage.setItem(
          `campList.v2.${ns}.list.list-other`,
          JSON.stringify({
            data: [{ id: "sec-other", title: listTitle, items: [] }],
            meta: {},
            collapsed: [],
            updatedAt: stamp,
          })
        );
      },
      { id, primaryProvider, identities, listTitle }
    );
  }

  test("links a same-email account and shows its lists without a reload", async ({
    page,
  }) => {
    await mockGoogleIdentity(page);
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await signInWithMock(page);
    await seedOtherAccount(page, {
      id: "google:200000000000000000002",
      primaryProvider: "google",
      identities: [
        {
          provider: "google",
          providerId: "200000000000000000002",
          email: "casey@example.com",
          emailVerified: true,
        },
      ],
      listTitle: "Packed elsewhere",
    });
    await page.click("#btnAccountMenu");
    await page.click("#btnLinkSameEmail");
    await expect(page.locator("#appDialogTitle")).toHaveText("Link accounts");
    await page.click("#appDialogConfirm");
    await expect(page.locator("#toastContainer")).toContainText("Accounts linked");
    await page.selectOption("#listSelect", { label: "Other trip" });
    await expect(page.locator('.sectionTitle:text-is("Packed elsewhere")')).toBeVisible();
    const accounts = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("campList.v2.auth.accounts"))
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0].identities.map((i) => i.providerId).sort()).toEqual([
      "100000000000000000001",
      "200000000000000000002",
    ]);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("campList.v2.google_200000000000000000002.index")
      )
    ).toBeNull();
    // The moved list survives a reload (it was written to the account's index).
    await page.reload();
    await page.waitForSelector("body.app-ready");
    await expect(page.locator("#listSelect option")).toHaveCount(2);
  });

  test("refuses to absorb an account whose sign-in method cannot be linked", async ({
    page,
  }) => {
    await mockGoogleIdentity(page);
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
    await signInWithMock(page);
    const msId = "microsoft:11111111-2222-3333-4444-555555555555";
    await seedOtherAccount(page, {
      id: msId,
      primaryProvider: "microsoft",
      identities: [
        {
          provider: "microsoft",
          providerId: "11111111-2222-3333-4444-555555555555",
          email: "casey@example.com",
          emailVerified: false,
        },
        {
          provider: "google",
          providerId: "200000000000000000002",
          email: "casey@example.com",
          emailVerified: true,
        },
      ],
      listTitle: "Work laptop list",
    });
    await page.click("#btnAccountMenu");
    await page.click("#btnLinkSameEmail");
    await expect(page.locator("#errorMessage")).toContainText("not verified");
    await expect(page.locator("#errorMessage")).toContainText("Microsoft");
    // Nothing changed: both accounts and the other account's lists are still there.
    const accounts = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("campList.v2.auth.accounts"))
    );
    expect(accounts).toHaveLength(2);
    expect(
      await page.evaluate(() =>
        localStorage.getItem(
          "campList.v2.microsoft_11111111_2222_3333_4444_555555555555.index"
        )
      )
    ).not.toBeNull();
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
