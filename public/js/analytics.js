// analytics.js — loads the analytics tags named in config.js. Every page includes this module,
// so the app page's Content Security Policy needs no inline script. Nothing loads unless
// config.js names a Google Analytics measurement id or a Plausible domain.
import { CONFIG } from "./config.js";

// Visitors in these countries get Google's Consent Mode defaults of "denied": the tag then
// works without cookies (no _ga cookies, no stored identifiers) unless consent is granted later.
export const CONSENT_REGIONS = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IS",
  "IT",
  "LI",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "NO",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "GB",
  "CH",
];

/** True when the browser asks not to be tracked via the Global Privacy Control signal. */
export function privacySignal() {
  return navigator.globalPrivacyControl === true;
}

/**
 * Google Analytics 4 (gtag.js). Mirrors Google's snippet: a dataLayer, a gtag() that pushes its
 * arguments object, gtag('js', …) and gtag('config', id), plus Consent Mode defaults. Returns
 * true when the tag was (or already is) loaded.
 */
export function setupGoogleAnalytics(id = CONFIG.analytics.gaMeasurementId) {
  if (!id || privacySignal()) return false;
  if (document.querySelector('script[data-camplist="ga"]')) return true;
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag() {
      // gtag.js expects the arguments object itself, not an array.
      window.dataLayer.push(arguments);
    };
  }
  window.gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    region: CONSENT_REGIONS,
  });
  window.gtag("js", new Date());
  window.gtag("config", id);
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.dataset.camplist = "ga";
  document.head.appendChild(script);
  return true;
}

/** Plausible (cookieless) — kept as an alternative; off unless a domain is configured. */
export function setupPlausible(domain = CONFIG.analytics.plausibleDomain) {
  if (!domain || privacySignal()) return false;
  if (document.querySelector('script[data-camplist="plausible"]')) return true;
  const script = document.createElement("script");
  script.defer = true;
  script.dataset.domain = domain;
  script.dataset.camplist = "plausible";
  script.src = "https://plausible.io/js/script.js";
  document.head.appendChild(script);
  return true;
}

setupGoogleAnalytics();
setupPlausible();
