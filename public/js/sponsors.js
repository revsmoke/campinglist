// sponsors.js — sponsor / affiliate / house cards and optional AdSense slots.
// Rules: every paid placement is labelled ("Sponsored by …", "Paid link", "Advertisement"),
// at most one card per slot, two slots on the page, fixed-height containers (no layout shift),
// no pop-ups, no third-party scripts unless configured in config.js.
import { CONFIG } from "./config.js";
import { escapeText } from "./escape.js";

const SLOTS = ["sidebar", "footer"];

function isActive(card, now = Date.now()) {
  if (!card || typeof card !== "object") return false;
  if (card.start && Date.parse(card.start) > now) return false;
  // `end` is inclusive: the card stays up through the end of that UTC day.
  if (card.end && Date.parse(card.end) + 86_400_000 <= now) return false;
  return Boolean(card.title && card.url);
}

function labelFor(card) {
  if (card.kind === "sponsor") return `Sponsored by ${card.sponsor || card.title}`;
  if (card.kind === "affiliate") return "Paid link";
  return "From CampList";
}

export function pickCard(cards, slot, now = Date.now()) {
  const eligible = (Array.isArray(cards) ? cards : []).filter(
    (c) => isActive(c, now) && (!c.slots || c.slots.includes(slot))
  );
  if (eligible.length === 0) return null;
  const paid = eligible.filter((c) => c.kind === "sponsor" || c.kind === "affiliate");
  const pool = paid.length ? paid : eligible;
  // Deterministic rotation per day so each visitor sees a stable card.
  const day = Math.floor(now / 86_400_000);
  return pool[day % pool.length];
}

function renderCard(container, card) {
  const safeUrl = /^(https?:\/\/|mailto:)/i.test(card.url) ? card.url : "#";
  const rel =
    card.kind === "sponsor" || card.kind === "affiliate"
      ? "sponsored noopener noreferrer"
      : "noopener noreferrer";
  container.innerHTML = `<div class="sponsor-card kind-${escapeText(card.kind || "house")}">
    <span class="sponsor-label">${escapeText(labelFor(card))}</span>
    <a class="sponsor-title" href="${escapeText(safeUrl)}" target="_blank" rel="${rel}">${escapeText(card.title)}</a>
    ${card.text ? `<p class="sponsor-text">${escapeText(card.text)}</p>` : ""}
    ${card.cta ? `<a class="sponsor-cta" href="${escapeText(safeUrl)}" target="_blank" rel="${rel}">${escapeText(card.cta)} →</a>` : ""}
  </div>`;
}

// Sponsor/house card per slot, shown when that slot's ad unit is unfilled or the ad script is
// blocked, so a labelled placement is never an empty box.
const fallbacks = {};

function showFallback(slot) {
  const container = document.querySelector(`.ad-slot[data-slot="${slot}"]`);
  if (!container) return;
  const card = fallbacks[slot];
  if (card) {
    container.hidden = false;
    renderCard(container, card);
  } else {
    container.innerHTML = "";
    container.hidden = true;
  }
}

function renderAdsense(container, slot, slotId) {
  container.hidden = false;
  container.innerHTML = `<span class="sponsor-label">Advertisement</span>
    <ins class="adsbygoogle" style="display:block" data-ad-client="${escapeText(CONFIG.ads.adsenseClient)}" data-ad-slot="${escapeText(slotId)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
  const ins = container.querySelector("ins.adsbygoogle");
  // AdSense marks a unit it could not fill (site not approved yet, no matching ad): swap in
  // the sponsor/house card instead of leaving an empty "Advertisement" box.
  const observer = new MutationObserver(() => {
    if (ins.dataset.adStatus === "unfilled") {
      observer.disconnect();
      showFallback(slot);
    }
  });
  observer.observe(ins, { attributes: true, attributeFilter: ["data-ad-status"] });
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (error) {
    console.warn("AdSense push failed:", error);
    observer.disconnect();
    showFallback(slot);
  }
}

function configuredSlots() {
  return SLOTS.filter((slot) => Boolean(CONFIG.ads.slots?.[slot]));
}

function loadAdsense({ onError } = {}) {
  if (document.querySelector('script[data-camplist="adsense"]')) return;
  // Without ad-unit ids the script is here only so AdSense can verify the site: pause all ad
  // requests, otherwise Auto ads (when switched on in the AdSense console) would insert units
  // outside the two labelled placements.
  window.adsbygoogle = window.adsbygoogle || [];
  if (configuredSlots().length === 0) window.adsbygoogle.pauseAdRequests = 1;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CONFIG.ads.adsenseClient)}`;
  script.crossOrigin = "anonymous";
  script.dataset.camplist = "adsense";
  // Blocked or unreachable (content blockers, offline): show the cards instead.
  script.onerror = () => onError?.();
  document.head.appendChild(script);
}

/** The sponsor file lives at the site root; guide pages sit in subfolders. */
function sponsorsUrl() {
  const url = CONFIG.sponsors.url;
  return /^https?:\/\//i.test(url) ? url : new URL(`../${url}`, import.meta.url).href;
}

export async function setupSponsors() {
  let cards = [];
  try {
    const response = await fetch(sponsorsUrl(), { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      cards = Array.isArray(data?.cards) ? data.cards : [];
    }
  } catch (error) {
    console.warn("Sponsor cards unavailable:", error.message);
  }
  const adsenseReady = Boolean(CONFIG.ads.adsenseClient);
  for (const slot of SLOTS) fallbacks[slot] = pickCard(cards, slot);
  if (adsenseReady) {
    loadAdsense({
      onError: () => {
        for (const slot of configuredSlots()) showFallback(slot);
      },
    });
  }
  for (const slot of SLOTS) {
    const container = document.querySelector(`.ad-slot[data-slot="${slot}"]`);
    if (!container) continue;
    const slotId = CONFIG.ads.slots?.[slot];
    if (adsenseReady && slotId) {
      renderAdsense(container, slot, slotId);
      continue;
    }
    showFallback(slot);
  }
}
