import { test, expect } from "@playwright/test";
import { blockGoogleMaps } from "./helpers.js";

const JUDGE_ANSWER = {
  answers: {
    tripType: {
      type: "choice",
      choice: "overlanding",
      probabilities: { overlanding: 0.82, campground: 0.1, backpacking: 0.08 },
      confidence: 0.79,
    },
  },
};

test.describe("trip wizard", () => {
  test.beforeEach(async ({ page }) => {
    await blockGoogleMaps(page);
  });

  test("builds a list from chip answers and the app opens it", async ({ page }) => {
    await page.goto("/plan/");
    await page.waitForSelector("body.wizard-ready");
    await expect(page.locator("h1")).toHaveText("Plan a trip");
    // One labelled placement, nothing more.
    await expect(page.locator(".ad-slot")).toHaveCount(1);
    await expect(page.locator(".ad-slot .sponsor-label")).toHaveText("From CampList");

    // 1. where: a typed place is recognised
    await page.fill("#whereInput", "half dome in july with the kids");
    await expect(page.locator('[data-reading="where"]')).toContainText("Yosemite");
    await page.click('[data-action="next"]');

    // 2. trip type
    await expect(page.locator("#wizardHeading")).toHaveText("What kind of trip?");
    await page.click('[data-action="next"]');
    await expect(page.locator(".wizard-error")).toContainText("Pick the closest option");
    await page.click('.opt[data-opt="backpacking"]');
    await page.click('[data-action="next"]');

    // 3. when
    await expect(page.locator("#wizardHeading")).toHaveText("When, and for how long?");
    await page.fill("#startDate", "2027-07-10");
    await page.fill("#endDate", "2027-07-13");
    await expect(page.locator(".wizard")).toContainText("3 nights");
    await page.click('[data-action="next"]');

    // 4. group
    await page.click('[data-group="size"] .chip[data-chip="3-5"]');
    await page.click('[data-group="flags"] .chip[data-chip="kids"]');
    await expect(page.locator('.chip[data-chip="kids"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.click('[data-action="next"]');

    // 5. shelter, 6. food, 7. extras
    await page.click('.opt[data-opt="tent"]');
    await page.click('[data-action="next"]');
    await page.click('.opt[data-opt="stove"][data-group="cooking"]');
    await page.click('.opt[data-opt="filter"][data-group="water"]');
    await page.click('[data-action="next"]');
    await page.click('.chip[data-chip="hiking"]');
    await page.fill("#extrasInput", "we might fish and it is bear country");
    await expect(page.locator('.chip[data-chip="fishing"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.locator('.chip[data-chip="bear"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.click('[data-action="next"]');

    // review
    await expect(page.locator("#wizardHeading")).toHaveText("Your list, ready to build");
    await expect(page.locator(".plan-base-name")).toHaveText(
      "Yosemite Wilderness Backpacking"
    );
    await expect(
      page.locator('[data-group="modules"] .chip[data-chip="kids"]')
    ).toBeVisible();
    await expect(
      page.locator('[data-group="modules"] .chip[data-chip="fishing"]')
    ).toBeVisible();
    await expect(page.locator("#listNameInput")).toHaveValue("Yosemite, Jul 2027");
    const before = await page.locator(".fact-value").nth(3).innerText();
    await page.click('[data-group="modules"] .chip[data-chip="kids"]'); // leave kids out
    await expect(
      page.locator('[data-group="modules"] .chip[data-chip="kids"]')
    ).toContainText("left out");
    const after = await page.locator(".fact-value").nth(3).innerText();
    expect(after).not.toBe(before);
    await page.fill("#listNameInput", "Yosemite with the crew");
    await page.click('[data-action="create"]');
    await expect(page.locator(".done")).toContainText("Yosemite with the crew");

    // the app opens on the new list, with trip info filled
    await page.click('.done a[href="../"]');
    await page.waitForSelector("body.app-ready");
    await expect(page.locator("#listSelect")).toContainText("Yosemite with the crew");
    await expect(page.locator("#metaContainer")).toContainText("Yosemite");
    await expect(page.locator("#metaContainer")).toContainText("07/10/2027");
    await expect(page.locator(".sectionTitle", { hasText: "Fishing" })).toBeVisible();
    await expect(page.locator(".sectionTitle", { hasText: "Kids" })).toHaveCount(0);
    await expect(
      page.locator(".sectionTitle", { hasText: "Bear country" })
    ).toBeVisible();
  });

  test("reads a typed trip type locally and keeps the draft across a reload", async ({
    page,
  }) => {
    await page.goto("/plan/");
    await page.waitForSelector("body.wizard-ready");
    await page.click('[data-action="skip"]');
    await page.fill("#tripTypeInput", "canoe trip, portaging between lakes");
    await expect(page.locator('[data-reading="tripType"]')).toContainText("Paddling");
    await page.reload();
    await page.waitForSelector("body.wizard-ready");
    await expect(page.locator("#wizardHeading")).toHaveText("What kind of trip?");
    await expect(page.locator('.opt[data-opt="paddling"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await page.click('[data-action="next"]');
    await expect(page.locator("#wizardHeading")).toHaveText("When, and for how long?");
  });

  test("asks the judge endpoint when configured and the keywords cannot tell", async ({
    page,
  }) => {
    const calls = [];
    await page.addInitScript(() => {
      window.CAMPLIST_CONFIG = Object.assign({}, window.CAMPLIST_CONFIG, {
        wizard: { judgeUrl: "/api/judge" },
      });
    });
    await page.route("**/api/judge", async (route) => {
      calls.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(JUDGE_ANSWER),
      });
    });
    await page.goto("/plan/");
    await page.waitForSelector("body.wizard-ready");
    await page.click('[data-action="skip"]');
    await page.fill(
      "#tripTypeInput",
      "we'll be self-sufficient on the dirt roads for a few days"
    );
    await expect(page.locator('[data-reading="tripType"]')).toContainText("Overlanding");
    expect(calls).toHaveLength(1);
    expect(calls[0].questions.tripType.type).toBe("choice");
    expect(calls[0].questions.tripType.criteria.overlanding).toMatch(/vehicle/i);
    expect(calls[0].state.answer).toMatch(/dirt roads/);
    // the person can still overrule the reading
    await page.click('[data-reading="tripType"] .chip[data-chip="campground"]');
    await expect(page.locator('.opt[data-opt="campground"]')).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  test("falls back to asking when the judge endpoint is down", async ({ page }) => {
    await page.addInitScript(() => {
      window.CAMPLIST_CONFIG = Object.assign({}, window.CAMPLIST_CONFIG, {
        wizard: { judgeUrl: "/api/judge" },
      });
    });
    await page.route("**/api/judge", (route) =>
      route.fulfill({ status: 503, body: "{}" })
    );
    await page.goto("/plan/");
    await page.waitForSelector("body.wizard-ready");
    await page.click('[data-action="skip"]');
    await page.fill("#tripTypeInput", "the usual");
    await expect(page.locator('[data-reading="tripType"]')).toContainText(
      "Which is closest?"
    );
    await page.click('[data-reading="tripType"] .chip[data-chip="festival"]');
    await page.click('[data-action="next"]');
    await expect(page.locator("#wizardHeading")).toHaveText("When, and for how long?");
  });
});
