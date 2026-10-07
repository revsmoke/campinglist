import { test, expect } from "@playwright/test";
import {
  blockGoogleMaps,
  mockGoogleIdentity,
  mockDriveApi,
  signInWithMock,
} from "./helpers.js";

async function connectDrive(page) {
  await page.click('#storagePanel [data-action="connect"][data-provider="google"]');
  await expect(page.locator("#storagePanel .storage-provider")).toBeVisible({
    timeout: 10000,
  });
}

test.describe("Google Drive storage (mocked APIs)", () => {
  let drive;
  test.beforeEach(async ({ page }) => {
    await blockGoogleMaps(page);
    await mockGoogleIdentity(page);
    drive = await mockDriveApi(page);
    await page.goto("/");
    await page.waitForSelector("body.app-ready");
  });

  test("storage requires sign-in and explains local-only storage", async ({ page }) => {
    await expect(page.locator("#storagePanel")).toContainText(
      "saved in this browser only"
    );
    await page.click("#btnStorageSignIn");
    await expect(page.locator("#signInDialog")).toBeVisible();
    await page.click("#signInCancel");
  });

  test("connects, creates the folder, saves, auto-saves edits and shows status", async ({
    page,
  }) => {
    await signInWithMock(page);
    await expect(page.locator("#storagePanel")).toContainText(
      "Lists stay in this browser until you connect storage"
    );
    await connectDrive(page);
    await expect(page.locator("#toastContainer")).toContainText("Google Drive connected");
    const folders = drive
      .files()
      .filter((f) => f.mimeType === "application/vnd.google-apps.folder");
    expect(folders.map((f) => f.name)).toEqual(["CampList"]);
    await expect(page.locator("#storagePanel .storage-status")).toContainText(
      /Saved to Google Drive/
    );
    expect(drive.listFiles().map((f) => f.name)).toEqual(["My CampList.camplist.json"]);
    const events = await page.evaluate(() => window.__gisMock.events);
    expect(events).toContain("token.request:consent");
    // No tokens persisted anywhere.
    const persisted = await page.evaluate(() => JSON.stringify(localStorage));
    expect(persisted).not.toContain("mock-token");
    // Edit → unsaved → auto-saved
    await page.fill("#newSectionTitle", "Synced section");
    await page.click("#addSectionForm button[type=submit]");
    await expect(page.locator("#storagePanel .storage-status")).toContainText(/Unsaved/);
    await expect(page.locator("#storagePanel .storage-status")).toContainText(
      /Saved to Google Drive/,
      { timeout: 10000 }
    );
    const saved = JSON.parse(drive.listFiles()[0].content);
    expect(saved.data.some((g) => g.title === "Synced section")).toBe(true);
    expect(saved.schema).toBe(2);
    await expect(page.locator("#storageStatus")).toContainText("Google Drive");
    // Connection survives reload; token does not, so the next save needs a click.
    await page.reload();
    await page.waitForSelector("body.app-ready");
    await expect(page.locator("#storagePanel .storage-provider")).toBeVisible();
    await page.fill("#newSectionTitle", "After reload");
    await page.click("#addSectionForm button[type=submit]");
    await expect(page.locator("#storagePanel .storage-status")).toContainText(
      /Unsaved changes\. Click Save/,
      { timeout: 10000 }
    );
    await page.click('#storagePanel [data-action="save"]');
    await expect(page.locator("#storagePanel .storage-status")).toContainText(
      /Saved to Google Drive/
    );
    const events2 = await page.evaluate(() => window.__gisMock.events);
    expect(events2).toContain("token.request:");
  });

  test("edits made during an upload are not reported as saved and get saved next", async ({
    page,
  }) => {
    await signInWithMock(page);
    await connectDrive(page);
    await expect(page.locator("#storagePanel .storage-status")).toContainText(/Saved/);
    drive.state.uploadDelayMs = 1500;
    await page.click('#storagePanel [data-action="save"]');
    await expect(page.locator("#storagePanel .storage-status")).toContainText(/Saving/);
    // Edit while the upload is in flight.
    await page.fill("#newSectionTitle", "Edited mid-upload");
    await page.click("#addSectionForm button[type=submit]");
    await page.waitForTimeout(1800);
    drive.state.uploadDelayMs = 0;
    // The first upload finished without the edit, so the status must not claim it is saved...
    const afterFirst = JSON.parse(drive.listFiles()[0].content);
    expect(afterFirst.data.some((g) => g.title === "Edited mid-upload")).toBe(false);
    // ...and a follow-up save must land automatically.
    await expect
      .poll(
        () =>
          JSON.parse(drive.listFiles()[0].content).data.some(
            (g) => g.title === "Edited mid-upload"
          ),
        {
          timeout: 15000,
        }
      )
      .toBe(true);
    await expect(page.locator("#storagePanel .storage-status")).toContainText(
      /Saved to Google Drive/
    );
  });

  test("detects remote changes and never overwrites silently", async ({ page }) => {
    await signInWithMock(page);
    await connectDrive(page);
    await expect(page.locator("#storagePanel .storage-status")).toContainText(/Saved/);
    // Simulate another device changing the Drive copy.
    const file = drive.listFiles()[0];
    const remote = JSON.parse(file.content);
    remote.data.push({ id: "other-device", title: "From the other device", items: [] });
    file.content = JSON.stringify(remote);
    file.modifiedTime = new Date(Date.now() + 60_000).toISOString();
    // Local edit → auto-save must stop with a conflict state.
    await page.fill("#newSectionTitle", "Local edit");
    await page.click("#addSectionForm button[type=submit]");
    await expect(page.locator("#storagePanel .storage-status")).toContainText(
      /changed since this device/,
      { timeout: 10000 }
    );
    expect(
      JSON.parse(drive.listFiles()[0].content).data.some((g) => g.title === "Local edit")
    ).toBe(false);
    // Manual save asks what to do; choose to load the Drive version.
    await page.click('#storagePanel [data-action="save"]');
    await expect(page.locator("#conflictTitle")).toBeVisible();
    await page.click('button[value="load"]');
    await expect(
      page.locator('.sectionTitle:text-is("From the other device")')
    ).toBeVisible();
    await expect(page.locator("#storagePanel .storage-status")).toContainText(/Saved/);
  });

  test("opens a list from Drive as a new local list", async ({ page }) => {
    await signInWithMock(page);
    await connectDrive(page);
    await expect(page.locator("#storagePanel .storage-status")).toContainText(/Saved/);
    const folder = drive
      .files()
      .find((f) => f.mimeType === "application/vnd.google-apps.folder");
    drive.state.files.set("file-x", {
      id: "file-x",
      name: "Boundary Waters.camplist.json",
      mimeType: "application/json",
      modifiedTime: new Date().toISOString(),
      parents: [folder.id],
      appProperties: { camplist: "list", listId: "remote-x" },
      content: JSON.stringify({
        schema: 2,
        name: "Boundary Waters",
        data: [
          {
            id: "p",
            title: "Paddling",
            items: [{ id: "pfd", text: "PFD", checked: false }],
          },
        ],
        meta: {},
      }),
    });
    await page.click('#storagePanel [data-action="open"]');
    await expect(page.locator("#pickTitle")).toBeVisible();
    await page.click('.pick-row[value="file-x"]');
    await expect(page.locator("#listSelect option")).toHaveCount(2);
    await expect(page.locator('.sectionTitle:text-is("Paddling")')).toBeVisible();
    await expect(page.locator("#storagePanel .storage-status")).toContainText(/Saved/);
  });

  test("uploads and lists trip files", async ({ page }) => {
    await signInWithMock(page);
    await connectDrive(page);
    await page.click('#storagePanel [data-action="files"]');
    await expect(page.locator("#filesList")).toContainText("No files yet");
    await page.locator("#filesInput").setInputFiles({
      name: "permit.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 fake"),
    });
    await expect(page.locator("#filesList")).toContainText("permit.pdf", {
      timeout: 10000,
    });
    if (process.env.DEBUG_DRIVE)
      console.log(
        drive.state.requests,
        await page.locator("#errorMessage").textContent()
      );
    expect(
      drive.files().some((f) => f.name === "permit.pdf" && f.pending === false)
    ).toBe(true);
    await page.click("#filesList button[data-trash]");
    await page.click("#appDialogConfirm");
    await expect(page.locator("#filesList")).toContainText("No files yet");
  });

  test("handles revoked access and disconnects cleanly", async ({ page }) => {
    await signInWithMock(page);
    await connectDrive(page);
    await expect(page.locator("#storagePanel .storage-status")).toContainText(/Saved/);
    // Next request fails with 403 (grant revoked); the app asks to reconnect rather than erroring.
    drive.failNextWith(403);
    await page.evaluate(() => {
      window.__gisMock.tokenError = "popup_closed";
    });
    await page.click('#storagePanel [data-action="save"]');
    await expect(page.locator("#storagePanel .storage-status")).toContainText(
      /expired or was revoked|Reconnect/,
      { timeout: 10000 }
    );
    await expect(page.locator('#storagePanel [data-action="reconnect"]')).toBeVisible();
    await page.evaluate(() => {
      window.__gisMock.tokenError = null;
    });
    await page.click('#storagePanel [data-action="reconnect"]');
    await expect(page.locator("#storagePanel .storage-status")).toContainText(/Saved/, {
      timeout: 10000,
    });
    await page.click('#storagePanel [data-action="disconnect"]');
    await page.click("#appDialogConfirm");
    await expect(page.locator('#storagePanel [data-action="connect"]')).toBeVisible();
    const events = await page.evaluate(() => window.__gisMock.events);
    expect(events.some((e) => e.startsWith("revoke:"))).toBe(true);
    expect(drive.listFiles()).toHaveLength(1); // files are never deleted on disconnect
  });

  test("a declined Drive consent is reported gently", async ({ page }) => {
    await signInWithMock(page);
    await page.evaluate(() => {
      window.__gisMock.tokenError = "access_denied";
    });
    await page.click('#storagePanel [data-action="connect"][data-provider="google"]');
    await expect(page.locator("#toastContainer")).toContainText("declined");
    await expect(page.locator('#storagePanel [data-action="connect"]')).toBeVisible();
  });
});
