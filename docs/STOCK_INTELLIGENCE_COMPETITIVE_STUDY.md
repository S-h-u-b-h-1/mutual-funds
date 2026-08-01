# Stock Intelligence Competitive Study — Tijori Finance, Screener.in, ValuePickr, BigMint

**Research date**: 2026-07-31. **Scope**: public-facing functionality only, for four products
relevant to MF Pulse's planned "Stock Research & Investor Intelligence" domain — a new product
surface separate from MF Pulse's existing mutual-fund business. **Method**: direct fetches of each
product's own public pages (WebFetch) plus targeted web search where a direct fetch 404'd or hit a
login wall (WebSearch, used only to locate the correct public URL or to corroborate a claim already
suspected from a direct fetch — never as a substitute for it). No login, no paywall bypass, no
scraping of data tables, no verbatim reproduction of forum posts. This document does not know and
does not claim to know any of these four companies' private architecture, database schema, data
contracts, or business internals — only what is visible on their own public pages on the date above.

## Tagging convention (applies to the whole document)

Every factual claim in the prose is tagged one of:

- **OBSERVED** — seen directly on a public page during this research session; the URL is cited.
- **INFERRED** — not directly observed; reasoned from context, adjacent evidence, or general
  industry knowledge. The basis for the inference is stated.
- **UNKNOWN** — could not be determined from public pages; not guessed.

The capability tables use a narrower convention, stated once here rather than repeated in every
cell: the **Observed capability** and **Customer value** columns describe what was seen and what the
product itself claims about its own value — these are OBSERVED by construction, sourced from the
URL cited in that product's prose section. The **Likely data required**, **Freshness requirement**
(except where a page explicitly states a freshness fact, which is called out inline),
**MF Pulse equivalent**, **Priority**, and **Legal/data dependency** columns are this document's own
reasoning about MF Pulse's roadmap — i.e. INFERRED/judgment by definition, not observed fact about
the competitor. Table cells that are genuinely UNKNOWN rather than reasoned are marked inline.

## Pages that were not accessible, stated explicitly rather than guessed around

| URL attempted | Result | What was done instead |
|---|---|---|
| `tijorifinance.com/about/` | 404 | Used `/plans/`, `/features/`, `/dashboard/`, `/raw-materials`, homepage instead — all live and public |
| `tijorifinance.com/blog/` | Resolved but returned dashboard-shell content, not a distinguishable blog post list — likely a client-rendered SPA route WebFetch could not distinguish from the app shell | No blog content claimed anywhere below; marked UNKNOWN where relevant |
| `screener.in/commodity/` | 404 | Found correct path (`/hs/`) via WebSearch |
| `screener.in/hs/`, `/announcements/`, `/people/` | Resolved but each redirected to (or rendered as) a login/registration wall with no functional preview | Described as login-gated; no data claimed from these pages beyond the marketing copy visible on the wall itself |
| `bigmint.co/pricing`, `bigmint.co/contact-us` | 404 | Used `/faqs`, `/signup`, `/terms-and-conditions`, `/aboutUs`, `/methodology`, and product pages (`/steel`, `/prices/ferrous/steel/billetbloomingot`) instead |
| A dedicated BigMint API/developer-docs page | Not found via search or navigation | Marked UNKNOWN below; only the FAQ's and homepage's brief mentions of "API mode" are cited, not a full API description |

---

## 1. Tijori Finance

**OBSERVED** (`tijorifinance.com/dashboard/`, `/features/`, `/plans/`, `/raw-materials`, homepage,
2026-07-31): Tijori is a subscription equity-research platform for Indian stocks, organized around
two pillars — "Tracking Tools" (Timeline, Portfolio, Watchlist, Alerts, Results) and "Research Tools"
(Ideas Dashboard, Company & Sector Research, Stock Screener, Market Monitor, Macro Indicators, Raw
Materials). The homepage/dashboard is publicly viewable without login and itself carries live
widgets (a market-events counter reading "168" upcoming results/concalls, niche-index performance,
category-tagged investment ideas) rather than being a pure marketing page. Pricing is directly
published at `/plans/`: a **Free** tier (₹0, 1 portfolio account, 1 watchlist, 5 alerts, 10-year
financials, latest-only operational/market-share data, unlimited "Popular and Public" screener
queries) and a paid tier at **₹330/month or ₹3,500/year** (marked "MOST POPULAR", ~₹292/month
effective) unlocking 5 portfolio accounts, 10 watchlists, unlimited alerts, Reverse DCF, historic
(not just latest) operational/market-share/raw-material/macro data across 6,000+ metrics, and
unlimited screener queries. **INFERRED**: third-party review sites (findmymoat.com,
aayushbhaskar.com, insider.finology.in) cite partially conflicting numbers (a $43/year international
price, a quarterly ₹950/₹1,950 split) — these are not used as facts here since they conflict with
each other and with the number seen directly on Tijori's own `/plans/` page; the ₹330/₹3,500 figures
above are the ones OBSERVED directly from the source.

**OBSERVED** (`/raw-materials`, 2026-07-31) — directly relevant to MF Pulse's own commodity question
(see companion doc `docs/BIGMINT_DATA_INTEGRATION.md`): the Raw Materials page lists ~60 chemicals
(acetone, caustic soda, benzene, styrene, PVC, polypropylene, etc.), 15 commodity "spreads" (e.g.
"Benzene − Toluene"), and 8 metals (met coke, ferro chrome, steel flat/long, sponge iron, scrap).
For each, the page shows Last Traded Price vs. 52-week high (as a percentage) and 1W/1M/3M/6M/1Y
performance without requiring login, timestamped "31 Jul, 09:00 am IST" — but the underlying chart
and the "View Producers"/"View Consumers" company-linkage buttons are explicitly locked
("Login Required — You need to be signed in to access this feature"). This confirms Tijori treats
raw-material-to-company linkage as a premium, not free, capability — a useful signal for MF Pulse's
own prioritization below.

### Capability table

| Observed capability | Customer value | Likely data required | Freshness requirement | MF Pulse equivalent | Priority | Legal/data dependency |
|---|---|---|---|---|---|---|
| Personalized Timeline (feed of updates for followed/held stocks) | Reduces "what changed since I last looked" search cost | Per-company event feed (filings, results, news) + per-user follow graph | Near-real-time to daily | Direct structural match to MF Pulse's existing event-bus work for funds (`docs/SUASION_PLATFORM_STATUS.md`, event bus in Multibagg study) — same pattern for stocks | High | Needs a stock-level filings/news feed MF Pulse does not currently ingest (equities are a new domain) |
| Portfolio tracker (multi-account, exposure/risk) | One screen for "what do I own and how risky is it" | Holdings + live/EOD price join + sector/factor classification | Intraday for equities (a materially different freshness bar than MF Pulse's once-daily NAV model) | MF Pulse already has portfolio import/valuation for funds; a stocks leg would need to plug into the same `portfolio_holdings`/`portfolio_transactions` tables per-`source`, not a parallel system | High | Needs a live/EOD equity price feed MF Pulse doesn't have today |
| Watchlist (multi-list) | Low-commitment way to track candidate ideas | User-scoped list + join to live instrument data | Matches underlying instrument | Direct product parity is easy; MF Pulse's own watchlist patterns (funds) generalize | Medium | None beyond the price feed already required above |
| Price/volume Alerts, incl. WhatsApp delivery | Timely nudges without manual checking | Rule engine over live price/volume + delivery channel integration | Real-time for trigger evaluation | MF Pulse's notification platform (Phase 4.5/M5, per `MULTIBAGG_BACKEND_PRODUCT_STUDY.md` §8) already has exactly-once delivery infrastructure; this is a new trigger catalog on existing rails, not new architecture | Medium | WhatsApp Business API is a separate commercial integration, not a data license |
| Results/concalls tracker | Calendar view of upcoming catalysts | Corporate-actions calendar per company | Days-ahead scheduling data, updated as companies announce | No MF Pulse fund equivalent exists (AMCs don't hold quarterly concalls per scheme — same conclusion the Multibagg study reached) | Medium | Needs an exchange corporate-actions calendar feed |
| Ideas Dashboard (thematic buckets: promoter buying, whale buying, mergers, capex, trending) | Pre-filtered discovery instead of a blank screener | Curated/derived views over ownership-change and corporate-action data | Daily/weekly batch | Directly analogous to MF Pulse's own `/discover` category leaderboard for funds — same curation-over-existing-data pattern | Medium | Depends on the same ownership/corporate-action feed as above, plus bulk/block-deal data specifically |
| Stock Screener (natural-language filtering) | Self-serve discovery without learning a query syntax | Standardized fundamentals + ratios database, all listed companies | Quarterly (fundamentals) / daily (price-derived ratios) | Direct equivalent to MF Pulse's fund-matrix-screener ambitions (flagged as a "Stock Screeners → Mutual Fund Matrix Screener" translation in `MULTIBAGG_COMPETITIVE_STUDY.md` §5) | High | Needs a standardized equity-fundamentals dataset — see Screener.in section below for the more concrete version of this same dependency |
| Company & Sector Research pages + niche sector indices ("TJI Indexes") | Contextualizes one stock against its sector | Sector taxonomy + constituent-weighted index computation | Daily | New capability class for MF Pulse; conceptually similar to category-level benchmarking MF Pulse already does for funds | Medium | Needs a sector/industry classification taxonomy for listed equities |
| Raw Materials tracker (commodity price + producer/consumer linkage) | Explains margin pressure/relief before it shows up in results | Commodity price series + a maintained company↔input-material mapping | Daily (OBSERVED timestamp granularity: "09:00 am IST") | This is the direct MF Pulse Stocks parallel to the BigMint question — see `docs/BIGMINT_DATA_INTEGRATION.md` | High | Commodity price data is normally a licensed vendor relationship (see BigMint doc); the company↔material mapping is a separate, non-trivial curation effort regardless of price-data source |
| Reverse DCF + deep operational-metrics history (6,000+ metrics) | Lets an investor back out the market's implied growth assumption; deep comparability across time | Cash-flow model inputs + a large, standardized historical operational-metrics database | Quarterly | Advanced/differentiated analytics layer — later-stage, not a launch requirement | Low | Same standardized-fundamentals dependency as the screener row, at higher depth |
| Tiered freemium pricing itself (₹0 / ₹330 mo / ₹3,500 yr, usage-quota-gated) | Lets a casual user get real value free while monetizing power users | N/A (business model, not data) | N/A | MF Pulse Stocks should decide its own monetization shape deliberately rather than by default; noted for product/business planning, not backend design | Medium | None — a pricing/packaging decision, not a data dependency |

---

## 2. Screener.in

**OBSERVED** (`screener.in`, `/premium/`, `/company/TCS/consolidated/`, 2026-07-31): Screener is a
stock analysis and screening tool for Indian investors, run by Mittal Analytics Private Ltd
(copyright footer: "© 2009-2026"), with financial data attributed in the footer to a named third-party
data provider, "C-MOTS Internet Technologies Pvt Ltd." Its core public surface is unusually deep for
a logged-out visitor: a fetch of a real company page (TCS, consolidated view) with no login showed
live price/market-cap/P-E/ROE/ROCE/dividend-yield headline figures, 13 quarters of quarterly results,
annual Profit & Loss from March 2015 through March 2026 plus TTM (with compounded growth-rate
figures), a full Balance Sheet (2015–2026), Cash Flow statement (operating/investing/financing +
free cash flow), a Ratios section, and a Shareholding Pattern table (promoter/FII/DII/public,
quarterly) — all rendered with no paywall. The same page explicitly gates a narrower "Insights"
section ("Log in to view insights" for employee count, client metrics, revenue mix) and separately
marks some fields "Requires Premium" (AI services and R&D data specifically). This split — deep
historical fundamentals free, narrow enrichment fields behind login/premium — is a materially
different gating strategy than Tijori's (which gates *historical* depth broadly across many features)
or BigMint's (which gates the *numeric values* themselves, see below).

**OBSERVED** (`/premium/`, 2026-07-31): pricing is published directly with two named tiers —
**"Hobby Investor" (Free, ₹0/year)**: follow up to 50 companies, Excel automation, fundamental
charts, 10 stock alerts, 20 "Key Insights"/month, 5 "Insights table"/month, 10 concall notes/month,
18 quick ratios, 15 comparison columns, 2 screen alerts, 2 phrase alerts, 2 followed people, delayed
email delivery; **"Active Investor" (Premium, ₹4,999/year)**: unlimited follows, 800 stock alerts,
unlimited key insights/insights tables/concall notes, 60 quick ratios, 75 screen alerts, 55
comparison columns, 300 followed people, "Trends of 10,000+ products" (this is the commodity-price
feature — see below), download results, industry filter, prioritized email delivery, ₹500 of free
"Screener AI" credits, and priority support. This is a genuinely granular, quota-based freemium
model — a useful concrete reference point (see synthesis).

**OBSERVED** (attempted `/hs/` — the commodity-prices tool, linked from the homepage as "Commodity
Prices — Analyze price trends for 10,000+ commodities over the past 10 years" — 2026-07-31): this
page resolved to a login/registration wall with no data preview at all; no commodity names, prices,
or chart is visible to a logged-out visitor. The only thing OBSERVED about this feature is its own
marketing description and its restatement inside the Premium tier's feature list ("Trends of
10,000+ products"). **UNKNOWN**: what commodities are covered, at what granularity, or whether the
underlying source is licensed or self-collected — Screener's own public pages do not say, and this
document does not guess.

**OBSERVED**: `/announcements/` and `/people/` (Search shareholders) both also resolved to
login/registration walls with no functional preview — only their one-line marketing descriptions
("Stay updated. Search, filter and set alerts for the newest disclosures and developments"; "Find
all companies where a person owns more than 1% of shares") were visible.

### Capability table

| Observed capability | Customer value | Likely data required | Freshness requirement | MF Pulse equivalent | Priority | Legal/data dependency |
|---|---|---|---|---|---|---|
| Deep per-company fundamentals page (10-yr P&L/balance sheet/cash flow/ratios, 13 quarters, shareholding pattern) — free, no login | This is the credibility foundation of the whole product; a visitor can verify depth before ever registering | Standardized, structured financial-statement data per listed company, sourced (per footer) from a named third-party financial-data vendor | Quarterly (results), likely daily-ish for price-derived header figures | The single highest-priority foundational asset for MF Pulse Stocks — MF Pulse already builds exactly this kind of deep, correct, dated fund detail page; the equity version needs the same rigor | **High** | Needs a licensed structured-fundamentals vendor (**INFERRED**: Screener's own footer names one, "C-MOTS Internet Technologies Pvt Ltd" — the fact that an established player pays for/attributes a named data vendor rather than self-sourcing from raw filings is itself a signal that scraping BSE/NSE/MCA filings directly is not how this is normally done at scale) |
| Custom stock screener (formula/query language over 10 years of financial data) | Lets sophisticated users build repeatable, precise filters, not just canned lists | Same standardized fundamentals database as above, indexed for fast querying | Matches underlying fundamentals cadence | Same translation the repo's own Multibagg study already identified: "Stock Screeners → Mutual Fund Matrix Screener" | High | Same vendor dependency as row 1 |
| Screener AI (LLM Q&A grounded in company documents — annual reports, concall transcripts — credit-metered) | Turns dense filings into an answerable question instead of a document to read cover to cover | Document corpus (filings/transcripts) + RAG/grounding pipeline + per-user credit metering | Matches document-ingestion cadence, likely hours-to-days after a filing | Same capability class as Multibagg's "Ask Iris," already studied in `MULTIBAGG_BACKEND_PRODUCT_STUDY.md` §9 — that study's conclusion (grounded context API before any AI layer) applies unchanged here | Medium | Needs the same document corpus as any concall/filing feature, plus an LLM integration; MF Pulse's own stated ethos (never hallucinate a financial value) applies directly |
| Commodity/raw-material price trends ("10,000+ products," 10-year history) — premium only, page itself is login-gated even for a preview | Same margin-context value proposition as Tijori's Raw Materials | Commodity price time series at scale | UNKNOWN (not stated on any accessible public page) | Same MF Pulse Stocks parallel as Tijori's Raw Materials — see `docs/BIGMINT_DATA_INTEGRATION.md` | High | UNKNOWN sourcing — cannot be inferred from what's public; likely a licensed vendor given the scale claimed ("10,000+ products"), but this is INFERRED from general market structure, not confirmed |
| Search shareholders (>1% ownership lookup) | Fast due-diligence tool for tracking known operators/institutions | Shareholding-pattern data, name-indexed across all companies | Quarterly (shareholding disclosures are a quarterly regulatory filing) | No current MF Pulse equivalent; lower priority for a Stocks v1 | Low | Same fundamentals-vendor dependency, at higher granularity (name-level, not just percentage buckets) |
| Company announcements search + alerts | "Tell me the moment something happens" for a followed company | Exchange filings/announcements feed, indexed and searchable | Same-day to real-time | Direct parallel to MF Pulse's own event-bus/notification pattern already built for funds | High | Needs an exchange announcements feed (BSE/NSE) |
| Peer comparison + custom ratios + comparison columns | Lets an investor build their own comparative view instead of accepting a fixed one | Same fundamentals database, pivoted for cross-company comparison | Matches fundamentals cadence | Directly matches MF Pulse's existing `/compare` pattern for funds | Medium | Same vendor dependency as row 1 |
| Export to Excel ("Excel Automation") | Power users take data into their own models | Structured export of whatever's on-screen | N/A | Low-effort, high-goodwill feature once the underlying data exists | Low | None beyond the underlying data dependency |
| Granular quota-based freemium tiering (₹0 vs ₹4,999/year, with specific per-feature numeric caps rather than a blunt feature/no-feature split) | Free tier is genuinely useful (50 followed companies, working screener), which builds trust before ever asking for payment | N/A (business model) | N/A | A more sophisticated packaging pattern than Tijori's — worth studying deliberately for MF Pulse Stocks' own monetization design | Medium | None — packaging decision |

---

## 3. ValuePickr Forum

**OBSERVED** (`forum.valuepickr.com`, `/categories`, `/about`, 2026-07-31): ValuePickr is a public
discussion forum for Indian mid- and small-cap equity investing, running on Discourse software. It
describes itself as "a forum for discussions on Indian mid and small cap companies." The `/about`
page names four admins (including Satish V and Donald Francis) and six moderators (including Satish
V and Abhishek Basumallick) with visible real names and avatars, and states recent activity of "403
sign-ups in the past week" and "5,777 active monthly users" at the time of this fetch. **OBSERVED**:
no membership fee, premium tier, or paid feature was found anywhere on the `/about` page or the
category listing — the page is silent on monetization entirely. This document does not claim
ValuePickr is definitely free of any monetization (e.g. sponsorships, donations, or a paid layer not
surfaced on these two pages) — that would be an overreach from silence — but no such thing was
observed, and this is stated as an absence-of-evidence, not evidence-of-absence.

**OBSERVED** (`/categories`, 2026-07-31): the forum organizes into roughly 47 categories with visible
topic counts. The largest and most clearly investment-research-relevant are **Stock Opportunities**
(1,121 topics — individual company investment theses, per category naming convention and this
document's own inference from the name, not verified by reading thread content), **Q&A: Questions &
Answers** (497 topics), **Investing Strategies** (236 topics), **Investment Learning** (193 topics),
**Investor Toolkits** (109 topics, described on-page as a place to "share here anything that you have
developed and find it useful in your own investing regimen"), **Stock Analysis & Valuation** (52
topics), **Knowledge Series** (37 topics, webinars/podcasts), and **Stock Screening** (27 topics).
A smaller set of categories gate posting (not reading) by community trust level: **Collaborators
Corner** and **TopContributors Corner** are both explicitly marked restricted-posting. Per the task's
own instruction, no thread or post content was opened or reproduced — everything above is structural
(category names, topic counts, one-line category blurbs) only.

### Capability table

Note: ValuePickr is a community/UGC product, not a SaaS analytics tool, so "Observed capability"
below describes interaction-model features, not data features — the "Likely data required" column is
consequently about *moderation and community infrastructure*, not a data feed.

| Observed capability | Customer value | Likely data required | Freshness requirement | MF Pulse equivalent | Priority | Legal/data dependency |
|---|---|---|---|---|---|---|
| Category-organized, long-form stock investment theses (Stock Opportunities, 1,121 topics) | Deep, opinionated, community-vetted research MF Pulse itself will never publish as house content (no buy recommendations — matches MF Pulse's own compliance stance, per `SUASION_PLATFORM_STATUS.md` and prior Trust Sprint findings) | None from a licensing standpoint — this would be user-generated content on MF Pulse's own platform, not third-party data | Community-paced, not a freshness SLA | A genuinely different pattern from anything MF Pulse has: user-generated long-form research, not platform-authored analytics | Low for v1 (needs critical mass MF Pulse doesn't have and can't buy) | **None required to build the feature itself** — but ValuePickr's own existing content is not reproducible; any MF Pulse community feature must be built from scratch, not seeded from ValuePickr |
| Structured Q&A category | Lowers the barrier to asking a "dumb question" separately from thesis-grade posts | Same UGC infrastructure | Community-paced | Same as above | Low for v1 | None required; same caveat as above |
| Investment education categories (Investment Learning, Investing Strategies, Accelerated Learning) | Builds investor literacy, which the repo's own docs already treat as a first-class concern for MF Pulse (the "knowledge/education model" gap identified in `MULTIBAGG_BACKEND_PRODUCT_STUDY.md` §6) | Structured content authored/curated by MF Pulse or licensed experts, not scraped | Rarely changes, versioned | Directly matches the already-identified `knowledge_facts` gap in the Multibagg study — this is independent confirmation from a second competitor that a structured knowledge layer is a real, recurring pattern worth building | Medium | None if authored in-house; a licensing question only if MF Pulse wanted to license existing third-party course content |
| Investor Toolkits (member-built tools/templates shared with the community) | Peer-distributed utility beyond what any single platform ships | UGC infrastructure + file/template hosting | Community-paced | No current MF Pulse equivalent; interesting but not core | Low | None |
| Trust-level-gated posting (Collaborators Corner, TopContributors Corner restricted to vetted members) | Keeps the highest-signal areas spam-free without closing off reading access | A reputation/trust-level system | N/A | Directly relevant if MF Pulse ever builds its own community feature — worth designing trust levels in from day one rather than retrofitting | Low (only relevant once/if a community feature is greenlit) | None |
| Community-maintained company summaries (Stock Story category) | A single, evolving, crowd-maintained reference page per company — distinct from a static data page | UGC infrastructure + a wiki-style edit/revision model | Community-paced | Interesting hybrid between MF Pulse's authoritative data pages and pure UGC; not a near-term priority | Low | None |
| Regional in-person meetups (VP City Meets) | Builds offline trust/community MF Pulse doesn't currently invest in at all | Event logistics, not data | N/A | Out of scope for a backend/data study — a marketing/community-team capability, not engineering | Low | None |
| Regulatory-awareness categories (SEBI Regulations, SEBI SCORES: Online Investor Complaints, Stocks marred in Controversies) | Investor-protection-oriented content adjacent to compliance | Curated/UGC content | Rarely changes except SCORES-style complaint tracking | Loosely relevant to MF Pulse's existing compliance-first posture; low engineering lift if ever pursued | Low | None |

---

## 4. BigMint

**OBSERVED** (`bigmint.co`, `/aboutUs`, `/faqs`, `/methodology`, `/terms-and-conditions`, `/steel`,
`/prices/ferrous/steel/billetbloomingot`, `/signup`, 2026-07-31): BigMint is a commodity price
reporting, data, and consulting platform ("your trusted platform for price reporting, data and
consulting"), the direct rebrand/successor of SteelMint — its own Terms and Conditions page states a
"business transfer from SteelMint Info Services LLP effective March 31, 2021" to BigMint Technologies
Private Limited, and one search result's page title still literally read "SteelMint" for a
BigMint-branded URL, consistent with an incomplete rebrand rather than two separate companies.
Leadership named on `/aboutUs`: Dhruv Goel (Founder + CEO), Tarun Goel (CTO), Manisha Keshari (CHRO),
Sumit Agrawal (Director), among 16+ listed leadership profiles. Stated scale: "4,000+ clients,"
"800+ price assessments," "40+ countries," "1,500+ global datasets." Named example clients: BHP,
Adani Group, Aditya Birla Group, CRISIL, Hyundai, Vale.

This product is the subject of its own dedicated companion document,
**`docs/BIGMINT_DATA_INTEGRATION.md`**, which covers the commodity-data question (methodology,
freshness, redistribution rights, onboarding path, and — most importantly — the explicit
no-scraping recommendation) in full depth. The table below is the competitive-positioning summary
only; do not treat this section as the complete picture on BigMint — read the companion doc for that.

### Capability table

| Observed capability | Customer value | Likely data required | Freshness requirement | MF Pulse equivalent | Priority | Legal/data dependency |
|---|---|---|---|---|---|---|
| 800+ commodity price assessments across 40+ countries (ferrous, non-ferrous, energy/coal, scrap, polymers, agri, logistics, cement) | Single source for the input-cost side of sector/stock/fund exposure analysis | Verified transactional price data at scale, per BigMint's own FAQ sourced from "verified market participants, industry reports, and live market trends" | OBSERVED (`/faqs`): "Prices are updated daily or as soon as new market data becomes available" | This is precisely the missing ingredient for explaining MF Pulse's own sector/fund commodity exposure — see companion doc | High | **Licensed/commercial relationship required — see companion doc; do not scrape** |
| Real-time spot pricing + historical price archive | Supports both "what's happening now" and trend analysis | Same as above, retained over time | Daily; historical depth UNKNOWN (FAQ says historical data is available "for select commodities," not stated as universal) | Same as above | High | Same as above |
| Futures data overlay (SHFE, LME, DCE contracts) | Connects spot assessments to forward-looking exchange-traded pricing | Exchange futures feed, likely itself a separate licensed input for BigMint | Real-time to end-of-day, typical of exchange data | Lower near-term priority than spot/assessment data for MF Pulse's stated use case (explaining sector exposure, not trading) | Low | Same licensing caveat, likely a second layer of dependency (exchange data has its own separate licensing regime) |
| News & Insights (market commentary) | Qualitative context alongside quantitative prices | Editorial/analyst content | Daily/as published | MF Pulse already has a financial-news ingestion pipeline (per `SUASION_PLATFORM_STATUS.md` cross-references) — commodity-specific news would be additive to that, not a new system | Medium | Editorial content licensing, separate from price-data licensing |
| Data & Statistics (production/trade/inventory) | Deeper fundamentals behind price moves (supply-demand context) | Trade/customs/production statistics | Likely monthly/periodic (typical for trade statistics; UNKNOWN exact cadence from public pages) | Valuable but secondary to price assessments themselves for a v1 | Low | Same licensing question, likely third-party government/customs-data sourcing on BigMint's own side (INFERRED from the general nature of trade statistics, not stated) |
| Data Dashboard (customizable analytics) | Lets a subscriber build their own view instead of BigMint's fixed pages | Same underlying price/stats data, exposed via a queryable layer | Matches underlying data | Directly analogous to what MF Pulse would want to build on TOP of licensed commodity data, once licensed — a UX pattern to borrow, not data to acquire | Medium (UX pattern only) | None for the pattern itself; full dependency on the underlying licensed data |
| Consulting (via named partner "Quesrow") | Bespoke strategic advisory beyond self-serve data | Human expertise, not a data feed | N/A | Out of scope for MF Pulse's backend/data question entirely | Low | N/A |
| Multi-channel delivery: website, mobile app, email, WhatsApp, "API mode," Excel plugins | Meets analysts where they already work | Same underlying data, multiple delivery adapters | Matches underlying data | If/when a commercial relationship exists, API delivery is obviously the right integration point for MF Pulse rather than manual Excel/email — but no API documentation is publicly visible (UNKNOWN) to say more than that it's mentioned | Medium | Same underlying licensing dependency; API terms specifically are UNKNOWN pending direct contact |
| IOSCO-audited methodology, publicly disclosed audit history | Credibility/trust signal — a "Pricing Standards Manual" and a named external-auditor report (dated March 30, 2024, per `/methodology`) are referenced as available | N/A (a trust signal, not a data type MF Pulse would ingest) | Audit is periodic, not continuous (OBSERVED: "periodically audited by an external auditor") | If MF Pulse ever surfaces BigMint-sourced figures, citing this same methodology/audit lineage to end users would be the honest, credible pattern to follow — worth remembering for the attribution UX, not just the data pipe | Medium | N/A directly, but reinforces that this is a serious, licensable data product, not something to informally scrape |

---

## Synthesis — highest-value capabilities for MF Pulse Stocks, ranked

Across all four products, these are the 5–8 capabilities this research judges highest-value for MF
Pulse's Stocks roadmap, in priority order. This ranking is this document's own INFERRED judgment,
weighing customer value against how directly each capability reuses infrastructure MF Pulse already
has (per `SUASION_PLATFORM_STATUS.md` and `MULTIBAGG_BACKEND_PRODUCT_STUDY.md`) versus how much new,
possibly license-gated, data acquisition it requires.

1. **A deep, correct, dated per-company fundamentals page (Screener.in's core pattern).** This is
   table stakes, not a differentiator, but it's the credibility foundation everything else sits on —
   Screener's own free tier proves a product can give this away and still build a large, monetizable
   audience on top of it. MF Pulse already has the institutional discipline for this kind of
   dated-and-verified data presentation (its whole NAV-freshness and fund-data-completeness work is
   the same discipline applied to a different asset class). The blocker is a licensed
   structured-fundamentals vendor, not backend design.

2. **A stock screener over that same fundamentals data (Tijori + Screener.in, both).** Both
   competitors treat this as core, and MF Pulse's own prior competitive study
   (`MULTIBAGG_COMPETITIVE_STUDY.md` §5) already flagged the fund-side translation of this exact
   idea. Building the equity screener and the long-planned mutual-fund matrix screener on a shared
   internal query engine would avoid building two one-off systems.

3. **Commodity/raw-material price context tied to company- and fund-level exposure (Tijori's Raw
   Materials feature + BigMint's entire business).** This is the single most MF-Pulse-differentiated
   idea in this whole study — a platform that already explains mutual-fund *category* exposure could
   extend the same idea to "which of your holdings are exposed to steel/crude/copper price moves,"
   which neither a pure-equity tool (Tijori, Screener) nor a pure-commodity tool (BigMint) currently
   connects to a retail investor's actual portfolio. It is also the most legally encumbered item on
   this list — see `docs/BIGMINT_DATA_INTEGRATION.md` for why this cannot start with a scraper.

4. **A personalized event Timeline (filings, results, price/volume triggers), reusing MF Pulse's
   existing event bus and notification platform rather than building new infrastructure.** Both
   Tijori and Screener organize significant value around "tell me what changed." MF Pulse's own prior
   study already concluded its event bus and notification platform are production-solid but have a
   narrow catalog (`MULTIBAGG_BACKEND_PRODUCT_STUDY.md` §7–8) — extending that catalog to cover
   equities is a bounded, low-architectural-risk piece of work, not a new system.

5. **Company announcements search + alerting (Screener.in's pattern).** A more specific, more
   immediately buildable version of #4 — exchange filings are a well-understood, licensable data
   category, and "search + alert on a followed company's filings" is a self-contained slice that
   doesn't require the full Timeline vision to ship first.

6. **Grounded document Q&A over filings/concalls (Screener AI; same pattern as Multibagg's "Ask
   Iris," already studied in this repo).** High customer-engagement pattern, appearing independently
   in two of the four products studied here plus the earlier Multibagg study — but MF Pulse's own
   prior conclusion (`MULTIBAGG_BACKEND_PRODUCT_STUDY.md` §9: build the grounded data contract before
   any AI layer, never hallucinate a financial value) applies unchanged. Sequence this after #1–#2
   give it something real to ground against, not before.

7. **A structured knowledge/education layer (fact/definition/interpretation/source, not just
   inline copy).** ValuePickr's entire education-category cluster (Investment Learning, Investing
   Strategies, Accelerated Learning, Knowledge Series) is independent, second-source confirmation of
   a gap MF Pulse's own Multibagg study already identified for mutual funds
   (`MULTIBAGG_BACKEND_PRODUCT_STUDY.md` §6). Worth building once, generically, for both funds and
   stocks rather than twice.

8. **Deliberate, quota-based freemium packaging (Screener.in's "Hobby Investor"/"Active Investor"
   split in particular).** Not a data or engineering capability, but a pattern worth adopting
   deliberately: give away enough real value (deep fundamentals, a working screener with caps on
   volume rather than on depth) to build trust before ever asking for payment, rather than gating
   core correctness behind a paywall. This is a product/business decision, flagged here because it
   shapes which of the above should be free vs. paid in MF Pulse Stocks — not this document's call
   to make, but worth surfacing for whoever does make it.

**Explicitly deprioritized for a v1**, based on this research: gamified onboarding/community features
(ValuePickr's meetups, badge-gated posting — real community-building value, but not buildable by
acquiring data, only by growing an actual community MF Pulse doesn't yet have); consulting/advisory
services (BigMint's Quesrow partnership — out of scope for a data platform); futures/derivatives data
overlays (lower priority than spot data for MF Pulse's stated "explain exposure" use case, and a
separate licensing regime from spot commodity data per the table above).
