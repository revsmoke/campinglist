# Monetization: research, decisions and the storage-tier model

Research date: 2026-10-07 (full notes with sources: `docs/research/monetization-research.md`).

## 1. What is built

* **Two placements, clearly labelled, no scripts by default.** `public/js/sponsors.js` renders
  one card in the sidebar slot and one below the checklist from `public/sponsors.json`.
  Each card is labelled "Sponsored by <brand>", "Paid link" or "From CampList"; paid links
  carry `rel="sponsored"`. Cards have start/end dates, rotate deterministically per day, and
  the slots are fixed-height so nothing jumps. No pop-ups, interstitials, sticky units or
  tracking.
* **AdSense account connected** (publisher `ca-pub-4491650261060374`): `public/ads.txt`, the
  `google-adsense-account` meta tag on every page and the AdSense script on the app page and
  the guide pages are live (the console shows `ads.txt` as authorised). `ads.slots` holds the
  two display units (Sidebar `2930956606`, Footer `7181192800`), each rendered as a labelled
  "Advertisement" unit inside its placement. Every page carries at most the same two
  placements: in the app they sit in the sidebar and under the list; on the guide pages
  (`/guide/`, the templates guide and each template page) they sit between content sections
  and above the footer, loaded by `public/js/guide.js`; the trip wizard page (`/plan/`) has a
  single placement under the wizard card so the questions stay clear. A unit AdSense reports as unfilled (site not approved yet, no
  matching ad) or a blocked ad script swaps the sponsor/house card back in, so a placement is
  never an empty box. If `ads.slots` are emptied, the loader sets
  `adsbygoogle.pauseAdRequests = 1`, so the script stays present for verification but requests
  no ads. Auto ads is **off** for camplist.guide (it would add anchors and vignettes outside
  the two placements) and the GDPR and US-state consent messages are published in Privacy &
  messaging; the site itself is still "Getting ready" (awaiting AdSense's review). Setting `ads.adsenseClient` and slot IDs in
  `public/js/config.js` switches a placement to a labelled AdSense unit. An `ads.txt` must be
  added to `public/` at that point (`google.com, pub-XXXX, DIRECT, f08c47fec0942fa0`).
  Consent for EEA/UK/CH visitors is handled by AdSense's own certified "Privacy & messaging"
  CMP (TCF v2.3), and US visitors should get restricted data processing enabled in AdSense.
* **Google Analytics 4 is on** (`analytics.gaMeasurementId` in `public/js/config.js`, loaded by
  `public/js/analytics.js` on the app page and both legal pages). The tag is not loaded for
  browsers that send Global Privacy Control, and visitors in the EEA, UK and Switzerland get
  Consent Mode defaults of "denied" (cookieless pings) until a consent tool grants storage.
  The privacy policy §3 discloses it. Set the id to `""` to switch it off.
* **Plausible remains available as an alternative.** `analytics.plausibleDomain` enables Plausible
  (cookieless, no banner). Nothing is loaded otherwise.
* **Disclosures.** The privacy policy explains sponsorships, affiliate links and that the app
  stores nothing server-side.

## 2. Findings that drive the recommendation

| Option | 2026 status | Fit for CampList now |
| --- | --- | --- |
| Google AdSense | No traffic minimum, but reviewers reject "insufficient content"; a tool-style single page with little text is unlikely to be approved. ~$3–15 page RPM for travel. | Not yet. Add a few text-rich guide pages (one per template) before applying. |
| Journey by Mediavine | 1,000 Tier-1 sessions / 30 days; ~70% share; $8–49 RPM. | First premium step once traffic exists. |
| Raptive | 25k pageviews/month. | Later. |
| Ezoic | 250k monthly users for new sites (Feb 2026). | Out of reach. |
| Carbon / EthicalAds | Developer audiences only. | Wrong audience. |
| Affiliates (Amazon 3% outdoors, Backcountry 4–12%, REI ~5% via AvantLink, The Dyrt, Public Lands 4%) | Require "original content with commentary" (Amazon, Apr 2026) and per-link "Paid link" disclosure. | **Best early fit**: gear links inside templates with a sentence of commentary. |
| Direct sponsorships (gear brands, campgrounds, Hipcamp-style marketplaces) | "Sponsored by <brand>" label at the top of a sponsored template and in the card. | Good fit; the sponsor card format is ready. |
| Rewarded ads | Only via Google Ad Manager (needs AdSense first); strict reward rules. | Skip for now. |
| Incentivised reviews | FTC Consumer Review Rule (2024) bans sentiment-conditioned incentives; disclosed, neutral incentives are allowed. | Only unincentivised feedback links; never pay for ratings. |

At launch traffic (< 1,000 visits/month) display ads are worth roughly $5–15/month; the
realistic early revenue is sponsorships and affiliate links.

## 3. Recommended sequence

1. Now: house cards (done), affiliate links with "Paid link" labels inside guide content,
   Plausible or Umami analytics, direct sponsorship outreach using the sponsor card format.
2. Before applying to AdSense: publish 5–10 crawlable guide pages (template explainers), keep
   ads off the app screen itself, add `ads.txt`, enable AdSense's GDPR message and US restricted
   data processing.
3. At ~1,000 US sessions/month apply to Journey; at 25k pageviews consider Raptive.

## 4. App-managed storage tier (evaluated, not built)

Needs a backend: user records, Stripe webhooks, object storage, export/deletion endpoints.
Recommended stack when the time comes: Cloudflare Workers ($5/month) + R2 ($0.015/GB-month,
free egress) + Stripe Checkout/Billing (2.9% + 30¢ + 0.7%), or Replit Autoscale ($1–2/month
base + usage) + Replit Object Storage ($0.015/GiB-month, $0.05/GiB egress).

Per paying user with 1 GB stored and ~1 GB downloaded per month:

| Price | Stripe fees | Net on R2 | Margin |
| --- | --- | --- | --- |
| $1.99/month | $0.37 (18.7%) | ≈ $1.60/month | 81% |
| $2.99/month | $0.41 (13.6%) | ≈ $2.57/month | 86% |
| **$24/year** | $1.16/year (4.9%) | ≈ $1.89/month | 94% |

Fixed hosting (~$5/month) is covered by roughly four subscribers. Recommendation: **$24/year
(or $2.99/month) for 1 GB**, Stripe Checkout + Customer Portal for billing and cancellation,
export always available (the JSON export already exists), deletion within 30 days of
cancellation with a 14-day grace period, and a free ad-supported allowance of 50 MB only if an
ad network is approved (otherwise the "allowance" is just the free local/own-cloud tier). A PWA
installed from the browser is outside Apple/Google store billing rules.

## 5. Sponsor card format

```json
{
  "id": "brand-2026-10",
  "kind": "sponsor",
  "sponsor": "Brand name",
  "title": "Headline (link text)",
  "text": "One or two sentences. No tracking parameters beyond a campaign tag.",
  "url": "https://example.com/?utm_source=camplist",
  "cta": "See the offer",
  "slots": ["sidebar"],
  "start": "2026-11-01",
  "end": "2026-11-30"
}
```

`kind` is `house`, `sponsor` or `affiliate`. Affiliate cards are labelled "Paid link".
