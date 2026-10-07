import { describe, it, expect, beforeEach, vi } from "vitest";

async function loadAnalytics(config, { gpc = false } = {}) {
  vi.resetModules();
  document.head.innerHTML = "";
  delete window.dataLayer;
  delete window.gtag;
  window.CAMPLIST_CONFIG = { analytics: config };
  Object.defineProperty(navigator, "globalPrivacyControl", {
    value: gpc,
    configurable: true,
  });
  return import("../../public/js/analytics.js");
}

describe("analytics.js", () => {
  beforeEach(() => {
    delete window.CAMPLIST_CONFIG;
  });

  it("loads gtag.js with Google's dataLayer calls and consent defaults", async () => {
    await loadAnalytics({ gaMeasurementId: "G-TEST1234", plausibleDomain: "" });
    const script = document.querySelector('script[data-camplist="ga"]');
    expect(script.src).toBe("https://www.googletagmanager.com/gtag/js?id=G-TEST1234");
    expect(script.async).toBe(true);
    const calls = window.dataLayer.map((args) => Array.from(args));
    expect(calls[0][0]).toBe("consent");
    expect(calls[0][1]).toBe("default");
    expect(calls[0][2]).toMatchObject({
      analytics_storage: "denied",
      ad_storage: "denied",
    });
    expect(calls[0][2].region).toContain("DE");
    expect(calls[0][2].region).toContain("GB");
    expect(calls[1][0]).toBe("js");
    expect(calls[1][1]).toBeInstanceOf(Date);
    expect(calls[2]).toEqual(["config", "G-TEST1234"]);
    expect(document.querySelector('script[data-camplist="plausible"]')).toBeNull();
  });

  it("loads nothing without a measurement id", async () => {
    await loadAnalytics({ gaMeasurementId: "", plausibleDomain: "" });
    expect(document.querySelector("script")).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it("respects Global Privacy Control", async () => {
    await loadAnalytics(
      { gaMeasurementId: "G-TEST1234", plausibleDomain: "x.example" },
      {
        gpc: true,
      }
    );
    expect(document.querySelector("script")).toBeNull();
    expect(window.dataLayer).toBeUndefined();
  });

  it("loads Plausible only when a domain is configured", async () => {
    await loadAnalytics({ gaMeasurementId: "", plausibleDomain: "camplist.guide" });
    const script = document.querySelector('script[data-camplist="plausible"]');
    expect(script.dataset.domain).toBe("camplist.guide");
    expect(script.src).toBe("https://plausible.io/js/script.js");
  });
});
