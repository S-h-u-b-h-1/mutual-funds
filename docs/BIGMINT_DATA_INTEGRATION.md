# BigMint Data Integration Readiness — Commodity/Raw-Material Data for MF Pulse

**Research date**: 2026-07-31. **Purpose**: MF Pulse's mutual-fund business already explains
category- and sector-level exposure to investors; a future Stocks domain (and the existing funds
business) would both benefit from being able to say, concretely, "this fund/stock is exposed to
steel/crude/copper price moves, and here's the current trend" — the same connective idea Tijori
Finance's "Raw Materials" feature and Screener.in's "Commodity Prices" tool both point at (see
`docs/STOCK_INTELLIGENCE_COMPETITIVE_STUDY.md`). BigMint is the most India-focused, most
commodity-specialized candidate data source identified in that research. This document evaluates
integration readiness from BigMint's own public pages only — no login, no scraping, no data-table
access. **This document is research, not an integration plan; no code or scraper exists or should be
written from it.**

## Tagging convention

Same as the companion competitive study: **OBSERVED** (seen directly on a public page, URL cited),
**INFERRED** (reasoned from context/industry knowledge, basis stated), **UNKNOWN** (not
determinable from public pages, not guessed).

---

## 1. What MF Pulse would want, field by field

This is the wishlist a commodity-data integration would need to satisfy to be useful for explaining
fund/stock sector exposure — evaluated against what BigMint's own public pages show, not against
what MF Pulse can currently obtain (that's Section 4 below).

| Field | Why MF Pulse would want it | Evidence BigMint's data model has it | Confidence |
|---|---|---|---|
| **Commodity** | The basic unit of analysis — steel, iron ore, coal, aluminium, etc. | OBSERVED (`/faqs`, `/steel`, homepage): named top-level categories match closely — Ferrous (iron ore, coal, scrap & metallics, steel, ferroalloy, stainless steel, ship breaking, graphite electrode), Non-Ferrous (aluminium, copper, zinc, lead, nickel, tin), Energy & Coal (non-coking coal, coking coal, metallurgical coke, petroleum coke), plus scrap recycling, polymers (feedstock/virgin/recycled), agriculture (grains, oilseeds, cotton, spices), logistics, cement | High — this is the best-confirmed field |
| **Grade/specification** | "Steel" alone isn't enough — a fund's exposure depends on which grade/product a portfolio company actually buys or sells | OBSERVED (`/prices/ferrous/steel/billetbloomingot`, `/steel`): a "Size/Grade" column exists structurally (example seen: "150×150mm, 3SP"); the `/steel` page separately names specific standards (IS 513, IS 2062, IS 1786 Fe 500D/Fe 550D, BS EN 10142:2000) | High for structure; the actual grade VALUES behind login were not seen beyond these examples |
| **Location** | Domestic (India) vs. import/export price gaps matter for margin analysis, and MF Pulse's own investor base is India-first | OBSERVED: a "Region" dimension exists; specific cities/countries named on the `/steel` page (China: Rizhao, Tianjin, Tangshan, Donghua, Hegang; India: Mumbai, Delhi, Chennai, Kolkata, Bangalore, Faridabad, Hyderabad, Ahmedabad, Ludhiana, Raipur, Durgapur; Belgium: Antwerp; unnamed Middle East/SE Asia destinations) | High |
| **Unit of measure** | Price is meaningless without knowing per-tonne, per-kg, per-unit, etc. | UNKNOWN — no page fetched during this research showed an explicit, separately labeled "unit" column; prices were seen described only as appearing in multiple currencies (USD, INR, RMB, EUR, GBP per `/steel`), not with a confirmed unit-of-measure label | Not confirmed — do not assume a specific unit convention without direct confirmation |
| **Price (value)** | The actual number — the entire point of the dataset | OBSERVED, and OBSERVED-gated: a "Price" column exists structurally on every price page checked (`/prices/ferrous/steel/billetbloomingot`, `/steel`), but the numeric values themselves were blurred/hidden behind a login wall on **every page checked, independently confirmed twice** | High confidence the field exists; zero visibility into actual current values without an account |
| **Assessment date** | Freshness matters — a stale commodity price is worse than none | OBSERVED: explicit timestamps shown even to a logged-out visitor, e.g. "31, Jul 2026 11:55 IST" | High |
| **Methodology** | MF Pulse would need to be able to explain to its own users how a number was derived, especially given MF Pulse's own stated discipline around not overstating data quality (see `SUASION_PLATFORM_STATUS.md`'s terminology-audit sections) | OBSERVED: a dedicated public `/methodology` page exists, stating the process is "periodically audited by an external auditor" against IOSCO principles, referencing an external auditor's report dated March 30, 2024, and a "Pricing Standards Manual" PDF (the PDF itself was not opened/read during this research — its existence and link were observed, its contents were not) | Medium-high — the page exists and makes specific, checkable claims, but the underlying manual wasn't reviewed |
| **Source/panel** | Understanding whether a price is a real transaction, a survey estimate, or a modeled figure changes how much weight MF Pulse should put on it | PARTIALLY OBSERVED: BigMint's own FAQ states prices are sourced from "verified market participants, industry reports, and live market trends" and separately (search-derived, secondary source, not independently fetched) describes tracking "real-time trades, confirmed transactions, and market-verified deals" — no named panel list or per-price sourcing disclosure was found | Low-medium — a general sourcing philosophy is stated; no line-item provenance was seen |

---

## 2. What's public vs. what's gated

**Publicly visible without any account** (OBSERVED across `/`, `/aboutUs`, `/faqs`, `/methodology`,
`/steel`, `/prices/ferrous/steel/billetbloomingot`, `/terms-and-conditions`, `/signup`, 2026-07-31):

- The full commodity taxonomy and category navigation (Iron Ore, Coal, Scrap & Metallics, Steel,
  Ferro Alloy, Stainless Steel, Logistics, Ship Breaking, Graphite Electrode, Grains, and more)
- The company's own description of its methodology, IOSCO audit status, and scale claims
  ("4,000+ clients," "800+ price assessments," "40+ countries," "1,500+ global datasets")
- On individual commodity pages: the row/column *structure* of the price tables (commodity, grade,
  region, delivery period, market sentiment) and the assessment **timestamp** — but not the price
  **value** itself. This exact split (metadata visible, numeric value gated) was independently
  confirmed on two different product pages, which is enough repetition to treat it as BigMint's
  general public-page pattern, not a one-off.
- A general subscription-tier structure (see below) and a lead-generation demo-request form
- Named leadership, named example clients, a stated company history (SteelMint → BigMint)

**Requires an account / gated** (OBSERVED): every actual numeric price figure seen during this
research; presumably the full Data Dashboard, Forecasting tools, Reports, Tenders listings, and
Historical Data download referenced in navigation (these nav items were seen to exist, but their
content was not — logging in to check was correctly out of scope for this research).

**Subscription structure** (OBSERVED, `/faqs`): BigMint sells tiered packages — **Silver, Gold,
Platinum, Platinum+** for the website, and a parallel **Price Only, Standard, Professional** set for
the mobile app — billed monthly or yearly, no free trial (a month-to-month plan is offered instead
of a trial), no auto-renewal (FAQ states subscriptions require manual renewal with reminders sent
by email/SMS a month before expiry). Exact prices for any tier are **UNKNOWN** — not published on
any page reached during this research; the FAQ itself directs a prospective customer to a "Buy Now"
flow or to contact support directly rather than stating figures.

---

## 3. Contact / onboarding path BigMint publicizes

OBSERVED, multiple pages:

- **Email**: `info@bigmint.co` (general contact, per FAQ and homepage); the FAQ's own support-contact
  answer separately lists `info@steelmint.com` for support — both addresses are BigMint's own stated
  contacts, not independently verified as active mailboxes by this research (no email was sent).
- **Phone**: +91-9770056666 (repeated consistently across `/faqs` and the homepage).
- **Demo request flow** (`/signup`, OBSERVED): a structured lead-generation form collecting industry
  category, industry type, which markets (Ferrous / Non-ferrous / Coal & energy / Agriculture /
  Logistics / Cement) and specific commodities the prospect cares about, and which product features
  (Prices & indices, News & insights, Data & statistics, Historical data, Reports, Tenders, Data
  dashboard, Forecasting) they want — i.e., BigMint's own onboarding path is explicitly built around
  first understanding a prospect's specific commodity/feature needs before quoting a plan, not a
  self-serve checkout.
- A separate **"Download brochure"** option and a **"Book a demo"** call-to-action appear throughout
  the marketing pages.
- A **"Data Licensing"** link/feature was referenced in the site footer (seen via search indexing),
  but its actual content page could not be located or fetched during this research — **UNKNOWN**
  what specific licensing terms it describes. This is the single most relevant unanswered question
  for MF Pulse's purposes and is exactly the kind of thing that should be asked directly, not
  inferred.

**Recommended concrete next step, if MF Pulse wants to pursue this**: use the `/signup` demo-request
form or the published email/phone to start a conversation, and explicitly ask about (a) API access
and its terms, (b) redistribution/display rights for a paid product (see Section 4), and (c)
historical depth by commodity. This is a business-development action for a human at MF Pulse to
take, not something this research can do or simulate.

---

## 4. Redistribution / use rights — open question, not answerable from the public site

This is the single most important open item in this document, and it genuinely cannot be resolved
from BigMint's public pages alone — stating that plainly rather than guessing.

**What IS observable** (`/terms-and-conditions`, OBSERVED, 2026-07-31): the public Terms and
Conditions page — which governs *browsing BigMint's own website*, not any paid data relationship —
restricts use of the site's content to personal and non-commercial purposes, and separately
prohibits reproduction, republication, redistribution, systematic downloading/database-building,
scraping, and creation of derivative works from the site's content without permission. The page also
states BigMint retains ownership of all content/IP on the site. These are standard consumer-facing
website terms, similar in shape to what almost any commercial data publisher puts on its public
marketing site.

**What is NOT observable, and matters more**: whether a **paid subscription or API agreement**
carries different — necessarily different, since a paid data product has to permit *some* use beyond
personal browsing — terms that would allow MF Pulse to (a) ingest BigMint data into MF Pulse's own
systems, and (b) display BigMint-derived figures or charts to MF Pulse's own end users, with what
attribution requirements, exclusivity restrictions, or per-seat/per-display pricing. **None of this
is stated anywhere on the public site.** This is exactly the kind of term that lives in a negotiated
commercial/API agreement, not a public webpage — which is itself a normal, expected pattern for a
licensed data business (INFERRED from general industry structure: IOSCO-audited price reporting
agencies, the category BigMint places itself in via its own methodology page, typically license
redistribution rights separately and explicitly, precisely because uncontrolled redistribution would
undermine their own subscription business).

**Conclusion**: MF Pulse cannot determine today whether showing BigMint-sourced commodity prices to
MF Pulse's own users (even MF Pulse's paying users, even with attribution) would be permitted under
any commercial agreement BigMint would offer. This has to be confirmed directly with BigMint as an
explicit contract term before any product surface is designed around their data, not assumed
favorably or unfavorably.

---

## 5. Freshness, coverage, and historical depth — what's statable

- **Freshness**: OBSERVED (`/faqs`): "Prices are updated daily or as soon as new market data becomes
  available" — BigMint's own stated cadence. Individual assessment timestamps seen on product pages
  (e.g. "31, Jul 2026 11:55 IST") are consistent with same-day updates.
- **Coverage breadth**: OBSERVED as broad and closely matching MF Pulse's likely needs — see the
  commodity list in Section 1. Explicitly confirmed present: steel (multiple grades/products),
  iron ore, coal (both coking and non-coking, named separately), aluminium, copper, zinc, polymers,
  cement. **Partially confirmed**: agricultural inputs (OBSERVED as "grains, oilseeds, cotton,
  spices" — narrower than a full agri-input basket, no fertilizer-specific mention seen).
  **UNKNOWN/not specifically confirmed**: a dedicated "freight index" product by that name — "logistics"
  appears as both a top-level coverage category and a navigation item, which is suggestive but not
  the same as confirming a specific freight index product exists; this would need direct
  confirmation rather than assumption.
- **Historical depth**: OBSERVED (`/faqs`): historical data is described as available "via commodity
  pages with charts and downloadable reports," but the FAQ itself qualifies this as available "for
  select commodities" — i.e., not stated as universal across all 800+ assessments. **UNKNOWN**: how
  many years of history are actually retained for any given series; no page reached during this
  research stated a specific depth (e.g., "5 years" or "since 2015").
- **Audit/credibility signal**: OBSERVED (`/methodology`): IOSCO-principles audit claimed, with a
  specific external auditor's report referenced as dated March 30, 2024 — this is a checkable,
  falsifiable claim (a real report either exists at that date or doesn't), which is a meaningfully
  stronger credibility signal than an unaudited "trust us" claim, though this research did not open
  the referenced report itself.

---

## 6. Bottom line

**Do not build a scraper against BigMint, or against any other commodity data source, for this or
any other MF Pulse initiative.** This is stated as the explicit, non-negotiable conclusion of this
research, not a soft preference:

- BigMint's own public Terms and Conditions explicitly prohibit scraping, systematic downloading,
  and redistribution of their content — building a scraper would mean knowingly violating a
  publicly posted legal restriction, not operating in a gray area.
- Even where prices are visible, all figures gated behind BigMint's login wall are, by definition,
  not intended for public/anonymous access — there is no "public API" loophole to exploit here,
  and this research did not attempt to find one.
- The genuinely useful commodity data MF Pulse would want (actual current and historical prices) is
  precisely the part BigMint gates and monetizes — there is no meaningful version of this
  integration that doesn't involve paying for and formally licensing the data.
- The redistribution-rights question in Section 4 is a real, unresolved, contract-level question
  that only BigMint can answer — it is not this document's place, and was not possible from public
  pages, to resolve it either way.

**The only sanctioned next step is a direct commercial conversation with BigMint** — via the
`/signup` demo-request flow, `info@bigmint.co`, or +91-9770056666 (all OBSERVED, Section 3) — to ask
specifically about API access terms, subscription pricing, historical depth, and, most importantly,
redistribution/display rights for MF Pulse's own end users. Until that conversation happens and
produces a written agreement, no commodity-price feature that depends on BigMint (or an equivalent
licensed provider) should be designed as if the data were already available, and no code that
fetches data from BigMint's site should be written.
