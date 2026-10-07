// sponsors.js — sponsor / affiliate / house cards and optional AdSense slots.
// Rules: every paid placement is labelled ("Sponsored by …", "Paid link", "Advertisement"),
// at most one card per slot, two slots on the page, fixed-height containers (no layout shift),
// no pop-ups, no third-party scripts unless configured in config.js.
import { CONFIG } from "./config.js";
import { escapeText } from "./ui.js";

const SLOTS = ["sidebar", "footer"];

function isActive(card, now = Date.now()) {
  if (!card || typeof card !== "object") return false;
  if (card.start && Date.parse(card.start) > now) return false;
  if (card.end && Date.parse(card.end) < now) return false;
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
  const safeUrl = /^https?:\/\//i.test(card.url) ? card.url : "#";
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

function renderAdsense(container, slotId) {
  container.innerHTML = `<span class="sponsor-label">Advertisement</span>
    <ins class="adsbygoogle" style="display:block" data-ad-client="${escapeText(CONFIG.ads.adsenseClient)}" data-ad-slot="${escapeText(slotId)}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
  try {
    (window.adsbygoogle = window.adsbygoogle || []).push({});
  } catch (error) {
    console.warn("AdSense push failed:", error);
  }
}

function loadAdsense() {
  if (document.querySelector('script[data-camplist="adsense"]')) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(CONFIG.ads.adsenseClient)}`;
  script.crossOrigin = "anonymous";
  script.dataset.camplist = "adsense";
  document.head.appendChild(script);
}

export async function setupSponsors() {
  let cards = [];
  try {
    const response = await fetch(CONFIG.sponsors.url, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      cards = Array.isArray(data?.cards) ? data.cards : [];
    }
  } catch (error) {
    console.warn("Sponsor cards unavailable:", error.message);
  }
  const adsenseReady = Boolean(CONFIG.ads.adsenseClient);
  if (adsenseReady) loadAdsense();
  for (const slot of SLOTS) {
    const container = document.querySelector(`.ad-slot[data-slot="${slot}"]`);
    if (!container) continue;
    const slotId = CONFIG.ads.slots?.[slot];
    if (adsenseReady && slotId) {
      renderAdsense(container, slotId);
      continue;
    }
    const card = pickCard(cards, slot);
    if (card) renderCard(container, card);
    else container.hidden = true;
  }
}

export function setupAnalytics() {
  const domain = CONFIG.analytics.plausibleDomain;
  if (!domain) return;
  const script = document.createElement("script");
  script.defer = true;
  script.dataset.domain = domain;
  script.src = "https://plausible.io/js/script.js";
  document.head.appendChild(script);
}
