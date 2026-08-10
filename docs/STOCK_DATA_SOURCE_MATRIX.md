# Stock Intelligence — Data Source Matrix

## Verified source baseline — 10 August 2026

The stock source centre at `/stocks/sources` is now the product-facing registry for the first
collection phase. The following were re-checked against their publishers before being added:

- NSE Indices publishes the current NIFTY 50 universe as an official CSV containing company
  name, industry, symbol, series and ISIN. This is the first machine-readable universe feed to
  connect; membership must be stored with an effective/retrieval date rather than overwritten.
- BSE Indices publishes the official BSE 100 constituent universe on its index page. This is the
  universe meant by the working phrase “Sensex 100”; the product calls it **BSE 100** to avoid
  confusing it with the 30-stock SENSEX. It remains a direct-reference source until a stable,
  approved bulk-access method and reuse terms are documented.
- NSE and BSE publish investor-facing corporate filing directories. They are primary evidence
  links, but public browsing is not treated as automatic permission for an undocumented scraper.
- The existing SEBI/RBI and publisher RSS channels remain the only automated stock-relevant news
  feeds. MF Pulse stores the supplied headline/summary/timestamp/link, not publisher full text.
- Each covered company will have one separately verified investor-relations root. Annual reports,
  presentations, transcripts and releases will retain the company URL and reporting period;
  full copyrighted documents will not be republished by default.

Implementation status labels now mean: **Active feed** (collected today), **Ready to connect**
(source and handling contract defined), **Direct reference** (linked for investors, automation
pending access review), and **Licence required** (intentionally unavailable until contracted).

Every external data category the Stock Research & Investor Intelligence domain (Sections 1-31 of
the standing directive) needs, with what's actually confirmed available, what requires a
commercial relationship, and what remains genuinely unknown. Same discipline as
`docs/STOCK_INTELLIGENCE_COMPETITIVE_STUDY.md` and `docs/BIGMINT_DATA_INTEGRATION.md`: claims are
tagged **OBSERVED** / **INFERRED** / **UNKNOWN**, and this document does not authorize scraping
anything — see the Status column and the closing note.

| Data | Source | Access | Licence | Redistribution right | API availability | Refresh frequency | Status |
|---|---|---|---|---|---|---|---|
| Index constituent lists (NIFTY 50, BSE 100) — company identity (legal/display name, industry, ISIN, NSE symbol, BSE code) for index members only | NSE Indices' own official constituent CSV (`nsearchives.nseindia.com/content/indices/ind_nifty50list.csv`) and BSE Indices' own Asia Index API (`bseindices.com/AsiaIndexAPI/api/Codewise_Indices/w?code=22`) | Public, unauthenticated, directly `curl`-able — both verified working live, not paywalled or scrape-gated | Each index provider's own published constituent list, analogous to AMFI's own scheme master this codebase already treats as authoritative for mutual funds | Citing/ingesting each index's own official constituent list (not reproducing NSE/BSE's proprietary index *methodology* or *branding*) matches this project's existing AMFI/factsheet posture | No bulk historical-membership API found; each fetch is a point-in-time snapshot of TODAY's constituents | As-needed re-run of `scripts/collect_stock_universe.py` + `frontend/scripts/sync_stock_index_membership.mjs`; not yet on a schedule | ✅ Integrated 2026-08-10. Real, live in production: 100 companies (50 NIFTY 50 + 100 BSE 100, 50 overlap), 150 effective-dated memberships (`sql/neon/037_stock_index_membership.sql`). Identity resolution merges NIFTY's full legal names against BSE's fixed-width-truncated `SCRIPNAME` field via ISIN → NSE symbol → BSE code → normalized name → unambiguous name-prefix match, in that order — see `indexMembership.js`'s header comments. **Known gap**: 6 of the 100 companies (BSE-100-only, no NIFTY counterpart to merge a full name from) carry BSE's truncated ~30-char name as their `legal_name`/`display_name` until a full-equity-master source (the row below) is integrated. |
| Company identity for the FULL listed universe (name, ISIN, NSE symbol, BSE code, listing status) beyond just NIFTY 50/BSE 100 members | NSE/BSE own public equity-master listings pages | Public web pages (NSE `nseindia.com`, BSE `bseindia.com`) | **UNKNOWN** — neither exchange's public ToS for this specific dataset was reviewed as part of this pass | **UNKNOWN** | **UNKNOWN** — NSE/BSE offer paid market-data licensing programs (**INFERRED** from general market-data industry practice, not verified against their current commercial terms) | Real-time on the exchange's own site; daily-ish would be a reasonable ingestion cadence | 🔴 Not integrated. No scraper, no licence. Would also resolve the truncated-name gap noted above. |
| Corporate filings / exchange announcements (results, board meetings, credit ratings, capacity/order announcements, promoter transactions) | NSE/BSE corporate-announcements feeds | Public web pages, individually browsable | **UNKNOWN** | **UNKNOWN** | NSE and BSE both publish some announcement data via public pages; whether a structured/bulk feed exists without a commercial agreement is **UNKNOWN** | Event-driven, published same-day by the exchanges | 🔴 Not integrated |
| Annual reports, investor presentations, concall transcripts | Individual company investor-relations pages; exchange filing archives | Public documents, typically PDF | Standard copyright applies to the document itself (**INFERRED** — annual reports are copyrighted works like any other company publication); *reading and summarizing* facts from a public filing for research purposes is standard practice this codebase already follows for mutual-fund factsheets (see `docs/PROVENANCE_MISSION` docs) | Reproducing/redistributing the full document is **not** the same as citing facts from it — this line needs the same discipline the MF factsheet pipeline already applies (parse facts, cite source, never republish the document itself) | No structured API; would be document-by-document ingestion, same shape as `factsheet_archive`'s existing pattern | Event-driven (annual reports yearly, presentations/concalls quarterly) | 🔴 Not integrated — `company_documents`/ingestion table intentionally not built this pass (see status doc) |
| Financial statements (P&L, balance sheet, cash flow — normalized) | Derived from the filings above, or a licensed financial-data vendor (e.g., a Screener.in/Tijori-style aggregator, or a data vendor like Refinitiv/Capital IQ/Trendlyne) | Vendor-dependent | Vendor-dependent — a licensed feed would include redistribution rights as part of the commercial terms; self-extracting from filings inherits the filings' own copyright posture above | Vendor-dependent | Vendor-dependent | Vendor-dependent (typically quarterly, matching results) | 🔴 Not sourced. `company_financial_statements`/`company_financial_line_items` schema exists (migration 035) and is ready to receive real data the moment a source is confirmed — no fabricated or estimated figures populate it in the meantime |
| Live/delayed stock prices, index levels (Nifty/Sensex/sector indices) | A licensed market-data vendor, or NSE/BSE's own data-vendor program | Commercial licence required for any redistribution to end users (**INFERRED** — standard for Indian exchange market data, not verified against current NSE/BSE commercial terms this pass) | Requires licence | Requires licence | Vendor-dependent | Real-time/delayed per licence tier | 🔴 Not sourced. This is why `stock_holdings`/`company_valuation_snapshots` never compute `currentValue`/`gainLoss` — see `portfolioService.js`'s header comment |
| Commodity prices (steel, iron ore, coal, base metals, polymers, freight, etc.) | BigMint (commercial), or LME/exchange-published benchmark prices for globally-traded metals | See `docs/BIGMINT_DATA_INTEGRATION.md` in full — public pages show structure/timestamps only, all prices are subscription-gated | Subscription required; BigMint's public ToS explicitly prohibits scraping/redistribution (**OBSERVED**, see that doc) | Requires a confirmed commercial agreement — **UNKNOWN** whether MF Pulse could redistribute BigMint-sourced prices to its own users even with a subscription; this is an open question for the commercial conversation, not something inferable from public pages | BigMint's public pages did not surface API documentation (**UNKNOWN**, see that doc) | Provider-dependent | 🔴 Not sourced. `CommodityDataProvider` interface + `MockCommodityProvider` exist and are fully tested; zero real vendor wired in (Sections 13-14) |
| Macro series (GDP, CPI, WPI, IIP, repo rate, bond yields, INR/USD, credit growth) | RBI (Database on Indian Economy, `dbie.rbi.org.in`), MOSPI (`mospi.gov.in`), NSDL/CCIL for some market-linked series | Public government statistical releases | Government data of this kind is generally free to use and cite (**INFERRED** — standard for RBI/MOSPI published statistical releases; the exact reuse terms of each specific RBI/MOSPI portal were not individually reviewed this pass) | **INFERRED** as low-risk relative to every other row in this table, given the public-data nature of the source, but not formally confirmed | RBI's DBIE has historically offered structured data downloads (**INFERRED** from general familiarity with the portal's existence, not verified fresh this pass) | Per each series' own release calendar (monthly/quarterly) | 🔴 Not integrated this pass — genuinely the lowest-friction row in this table and the most promising near-term real-data win, but out of scope for this foundation-schema pass (see status doc) |
| PMI | IHS Markit / S&P Global (licensed), sometimes reported second-hand by RBI/press | Licence required for the primary series | Requires licence | Requires licence | Vendor-dependent | Monthly | 🔴 Not integrated, licence-gated |
| CRISIL or other external credit ratings | CRISIL (commercial), or as reported within a company's own exchange filings (secondary, not the primary rating source) | Filings mention ratings as text; CRISIL's own rating database/API is commercial | Requires licence for the primary source; citing a rating AS REPORTED in a company's own public filing is a fact citation, not a redistribution of CRISIL's own product (**INFERRED** distinction, not legally reviewed) | N/A for the filing-citation path; requires licence for the primary CRISIL product | Commercial | Event-driven | 🔴 Not integrated |
| Peer/community research model (ValuePickr) | `forum.valuepickr.com` — public discussion forum | Public forum, browsable without login | Forum posts are user-generated content; reproducing them is a separate question from studying the *interaction model* | Do not reproduce forum content — see `docs/STOCK_INTELLIGENCE_COMPETITIVE_STUDY.md`'s explicit instruction on this | N/A — not a data source, a UX-pattern reference | N/A | ✅ Studied as a UX/interaction-model reference only (Section 22's "Research Notes" feature draws on this, with no content ingestion) |

## Bottom line

**One row is live: index constituent identity (NIFTY 50 + BSE 100).** Every other table in
`sql/neon/035_stock_intelligence_foundation.sql` — financial statements, valuations, prices,
commodities, filings/documents, macro series — starts empty and stays empty until a specific 🔴 row
above moves to a confirmed, licensed, or verifiably-public source. Do not deploy a scraper against
any 🔴 row as a substitute for the licensing/access step that row is actually blocked on — this
matches the explicit instruction in both this document's governing spec (Section 29: "Do not
deploy questionable scraped datasets") and `docs/BIGMINT_DATA_INTEGRATION.md`'s own closing
recommendation. The one ✅ row above was a genuine public, unauthenticated, directly-verified
official source — not an exception to this rule, an instance of it working as intended.

**Highest-ROI first real-data candidate**: RBI/MOSPI macro series. It is the only row in this table
whose access, licence, and redistribution posture are all plausibly already clear from public
government data norms, without a commercial negotiation — a good candidate to revisit first, once
this foundation phase is done and real-data acquisition becomes the next priority.
