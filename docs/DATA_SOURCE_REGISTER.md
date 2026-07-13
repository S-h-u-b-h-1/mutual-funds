# Data Source Register

Provenance Mission Phase 2. This register names, for each of the 26 required fields, the
official source(s) MF Pulse should extract it from, how often that source publishes, and what
should happen when the field can't be verified. It supersedes nothing — it is the specification
the Phase 4 ingestion framework and Phase 3 provenance schema are built against.

## Verification levels used in this document

Three different kinds of claim appear below, marked so they're never confused:

- **[VERIFIED]** — confirmed directly against this codebase's own working code or a real fetch
  already recorded in `data/warehouse/source_files.jsonl` (e.g. SBI's factsheet URLs, which the
  pipeline has actually downloaded and SHA-256'd).
- **[REGULATORY, general]** — a widely-established requirement from India's mutual fund
  disclosure framework (SEBI's Mutual Fund Regulations and related circulars, AMFI industry
  practice), stated at the level of general practice, not tied to a specific circular number or
  date I have independently re-checked this session. **Before any of these is cited on a
  user-facing methodology page, re-verify the specific circular/date against sebi.gov.in — do
  not repeat it from this document as if this document were the primary source.**
- **[UNVERIFIED — pilot target]** — a plausible, named location (e.g. a specific AMC portal URL
  captured in `ingestion/factsheet/playwright_fetch.py`) that has not been confirmed to work in
  this environment. Phase 5's pilot exists specifically to convert these to VERIFIED or replace
  them.

Never treat [REGULATORY, general] or [UNVERIFIED] as equivalent to [VERIFIED] when deciding
whether a field is safe to publish. Only [VERIFIED] sourcing, flowing through the Phase 3
provenance schema, justifies showing a value as "sourced" rather than "not yet available."

---

## Standard policy (applies to every field below unless a field-specific exception is noted)

Repeating these six columns 26 times would just be the same paragraph 26 times — they're a
platform-wide policy, not a per-field decision. Deviations are called out explicitly in the
per-field tables.

| Policy | Standard rule |
|---|---|
| **Validation method** | `ingestion/factsheet/normalize.validate()` range/sanity check at parse time (reject, don't clamp) + `scripts/validate_metadata.py` post-ingest QC pass (flag, don't silently drop) + Phase 6's holdings/sector contamination checks (new). A field that fails validation is stored as absent, never as a corrected guess. |
| **Storage model** | Phase 3's `fund_metadata_values` (current value) + `fund_metadata_history` (every superseded value retained, never overwritten) + `source_extractions` (the exact document/page/table each value came from). See `docs/METADATA_ACQUISITION_PLAN.md` for why the existing `factsheet_archive` table doesn't yet give this. |
| **Confidence policy** | `high` — exact labeled field match, single unambiguous value, current-period source. `medium` — matched via a secondary pattern, or the source document is >1 reporting period old. `low` — matched but the extraction method has a known failure mode for this field (e.g. SBI's solo fund-manager line, ambiguous per `docs/FACTSHEET_INGESTION_REPORT.md`). Never `high` on an inferred/derived value. |
| **Stale-data threshold** | Monthly-cadence fields (everything sourced from a factsheet or portfolio disclosure): flagged stale at **>45 days** past the source document's own stated date (allows one normal monthly cycle + processing slack). `scripts/validate_metadata.py` currently uses 120 days — that threshold is too loose for a "trustworthy platform" bar and should tighten to 45 as part of Phase 6. |
| **Fallback state** | Never a number. Field renders as **"Not available from source"** (existing pattern in `lib/metadata.js` / fund page) with the reason (`not yet ingested` / `not disclosed in this AMC's factsheet layout` / `quarantined — see provenance`). Never 0, never a category average, never a prior-period value silently carried forward without a "last known, dated" label. |
| **Extraction difficulty scale** | `low` = single labeled line, consistent position. `medium` = labeled but position/wording varies by AMC or requires light regex. `high` = requires table extraction (holdings/sector/credit-quality tables) or cross-page attribution. `blocked` = source format not yet acquirable at all (JS-gated portal, no direct PDF link, positional-PDF-layout not yet handled). |

---

## Identity & operational fields

| Field | Preferred source | Alternate source | AMC publication location | Frequency | Expected delay | Format | Historical files? | Licensing | Extraction difficulty |
|---|---|---|---|---|---|---|---|---|---|
| Fund manager | AMC factsheet | SAI (Statement of Additional Information) — has full manager tenure history, factsheet usually only current | AMC website → downloads/factsheets | Monthly | [REGULATORY, general] within days of month-end | PDF | SID/SAI amendments occasionally archived; factsheets rarely archived by AMC itself | Public, official document | medium — SBI's solo-manager line is ambiguous (see below), multi-manager "&" line is reliable [VERIFIED] |
| Manager tenure | SAI | AMC "fund manager" bio page (if present) | AMC website → statutory disclosures | Updated on manager change | Not time-boxed — event-driven | PDF | SAI historically amended, not always archived with version history | Public, official document | high — requires diffing manager-name history across archived factsheets (Phase 3's `fund_metadata_history`), not a single-document read |
| Launch date (date of allotment) | SID | AMC factsheet ("inception date" / "date of allotment") | AMC website → SID/KIM | Fixed at launch, never changes | N/A (static fact) | PDF | Static — captured once | Public, official document | low [VERIFIED — SBI: 152/152 populated] |
| Riskometer | AMC factsheet | AMC scheme page | AMC website → factsheets, scheme pages | Monthly | [REGULATORY, general] | PDF / HTML | Not typically archived by AMC | Public, official document | low [VERIFIED — SBI: 152/152] |
| Benchmark | SID | AMC factsheet | AMC website → SID, factsheet | Fixed at launch (rare mandate changes) | N/A / event-driven | PDF | SID amendments on benchmark change | Public, official document | medium — regex must accept `Index`, `TRI`, and combined forms [VERIFIED — broadened to 92% of SBI's implemented cases] |
| Lock-in | SID | — (statutory, e.g. ELSS's 3-year lock-in is law, not AMC discretion) | AMC website → SID | Fixed at launch | N/A | PDF | Static | Public, official document / statutory | low for ELSS (statutory 3y, safe to hardcode as a rule with the SID as the citation) — **do not infer for any other category** |
| Portfolio disclosure date | The disclosure document's own stated "as of" line | — | Same document as holdings/sector/debt fields | Monthly | [REGULATORY, general] | PDF / XLS | N/A — this IS the dating field | Public, official document | low — but must be extracted and stored per-field, not assumed equal to fetch date (see Phase 4 finding below) |

## Cost & minimum-investment fields

| Field | Preferred source | Alternate source | AMC publication location | Frequency | Expected delay | Format | Historical files? | Licensing | Extraction difficulty |
|---|---|---|---|---|---|---|---|---|---|
| Expense ratio (TER) | AMC website TER disclosure page | AMC factsheet | AMC website → dedicated TER page (separate from factsheet on most AMC sites) | [REGULATORY, general] — AMCs are required to disclose scheme-wise TER on their own websites; several AMCs update this on a shorter cycle than the monthly factsheet. **Exact cadence must be verified per-AMC in Phase 5, not assumed uniform.** | Varies by AMC | HTML table (varies by AMC) / PDF | Rarely archived by AMC | Public, official document | high — **[VERIFIED] SBI's per-scheme factsheet PDF does not expose TER at all** (0/152 despite 100% coverage on every other structured field); the dedicated AMC website TER page is a materially different source and has not yet been attempted by any adapter in this codebase |
| Exit load | SID | AMC factsheet | AMC website → SID, factsheet | Fixed at launch (rare changes) | N/A / event-driven | PDF | SID amendments | Public, official document | medium — free-text clause, not a single number ("1% if redeemed within 1 year, nil thereafter") — needs structured parsing, not just presence/absence |
| Minimum SIP | SID / KIM | AMC factsheet | AMC website → SID/KIM | Fixed at launch | N/A | PDF | Static | Public, official document | low once the source document is acquired — **[VERIFIED] currently 0/152 even for SBI**, because the factsheet layout used doesn't carry it; SID is untried |
| Minimum lump sum | SID / KIM | AMC factsheet | AMC website → SID/KIM | Fixed at launch | N/A | PDF | Static | Public, official document | low once acquired — same **[VERIFIED] 0/152** gap as above |
| Minimum additional investment | SID / KIM | AMC factsheet | AMC website → SID/KIM | Fixed at launch | N/A | PDF | Static | Public, official document | low once acquired — not currently attempted by any adapter (field doesn't exist in `normalize.SchemeMetadata` today — a genuine schema gap, not just a coverage gap) |

## Portfolio composition fields

| Field | Preferred source | Alternate source | AMC publication location | Frequency | Expected delay | Format | Historical files? | Licensing | Extraction difficulty |
|---|---|---|---|---|---|---|---|---|---|
| Holdings (full) | AMC monthly portfolio disclosure (complete list) | AMC factsheet (top-10 only — a strictly smaller, summary view) | AMC website → "portfolio disclosure" / "monthly portfolio" section, usually XLS/XLSX, separate from the factsheet PDF | [REGULATORY, general] monthly | Within days of month-end per SEBI's disclosure mandate | **XLS/XLSX** (full disclosure) vs PDF table (factsheet top-10) | AMCs commonly keep a rolling archive (6–12 months) of past monthly disclosure files | Public, official document | high for the full disclosure (spreadsheet parsing, ISIN-level rows, needs the new `PortfolioDisclosureParser`) — **[VERIFIED] the current pipeline only ever attempts the factsheet's abbreviated top-10 PDF table (17% coverage even within SBI's 152), never the full XLS disclosure** |
| Sector allocation | AMC factsheet (summary) | Derived from full monthly portfolio disclosure (sum holdings by sector) | Same as holdings | Monthly | Same as holdings | PDF (factsheet) / derivable from XLS | Same as holdings | Public, official document | medium — **[VERIFIED] a real contamination defect exists today**: at least one SBI record's `sector_allocation` contains a `"Total"` subtotal row and a stock name (`"NETFlix Inc"`) instead of a sector — see Phase 1 audit (`docs/DATA_COVERAGE_AUDIT.md` §C) and Phase 6 |
| Market-cap allocation | AMC factsheet (equity schemes: large/mid/small-cap split) | AMC monthly commentary (if factsheet omits it) | AMC website → factsheet | Monthly | Same as holdings | PDF | Not typically archived separately | Public, official document | medium — not currently extracted by any adapter (schema gap, same as minimum-additional-investment above) |
| Asset allocation (equity/debt/cash mandate split) | AMC factsheet (stated allocation range) for the *mandate*; monthly portfolio disclosure for the *actual current* split | — | AMC website → factsheet (mandate) + portfolio disclosure (actual) | Monthly for actual; static for mandate | Same as holdings | PDF / XLS | Same as holdings | Public, official document | medium — two different things share this name (SID-stated mandate range vs. actually-held split this month) and must not be conflated; Phase 3's schema should carry both as distinct fields |
| Cash position | Derived: 100% − (sum of equity + debt + other holding types) from the full monthly portfolio disclosure | AMC factsheet, if it states cash/cash-equivalent separately | Same as holdings | Monthly | Same as holdings | Derived from XLS | Same as holdings | Public, official document (derived) | medium — a **derived metric**, not a directly-sourced field; Phase 3's schema must tag it `derived`, with the holdings snapshot it was computed from as its provenance, not a document page reference |

## Debt-fund-specific fields

**None of these six fields exist anywhere in the current pipeline** — confirmed by direct key-presence scan in Phase 1 (`docs/DATA_COVERAGE_AUDIT.md` §D). This is the register's most consequential gap given Debt is 56% of the scheme universe by count.

| Field | Preferred source | Alternate source | AMC publication location | Frequency | Expected delay | Format | Historical files? | Licensing | Extraction difficulty |
|---|---|---|---|---|---|---|---|---|---|
| Average / portfolio maturity | AMC factsheet (debt schemes carry a dedicated "portfolio characteristics" or "quantitative data" box) | Derivable from full monthly portfolio disclosure (weighted by security maturity) | AMC website → debt-scheme factsheet | Monthly | Same as holdings | PDF | Same as holdings | Public, official document | medium — labeled field, same extraction pattern as expense ratio/AUM, just never attempted (no debt-fund adapter target exists yet) |
| Modified duration | AMC factsheet, same box as above | — | Same | Monthly | Same as holdings | PDF | Same as holdings | Public, official document | medium |
| Macaulay duration | AMC factsheet, same box — **not every AMC discloses this distinctly from modified duration; verify per-AMC in Phase 5** | — | Same | Monthly | Same as holdings | PDF | Same as holdings | Public, official document | medium, with a real chance of **structural absence at some AMCs** (must be recorded as "not disclosed by this AMC," not treated as an extraction failure) |
| YTM (yield to maturity) | AMC factsheet, same box | — | Same | Monthly | Same as holdings | PDF | Same as holdings | Public, official document | medium |
| Credit-quality allocation (sovereign / AAA / AA / below-AA / unrated %) | AMC factsheet ("rating profile" / "asset quality" table) | Derivable from full monthly portfolio disclosure (each debt holding's disclosed rating, aggregated) | Same | Monthly | Same as holdings | PDF table / derivable from XLS | Same as holdings | Public, official document | high — table extraction, and rating-agency-name normalization (CRISIL AAA vs ICRA AAA vs CARE AAA must map to one canonical grade — see Phase 6's canonical rating-grade taxonomy) |
| Issuer / credit concentration | Derived from full monthly portfolio disclosure (sum weights by issuer) | — | Same as holdings | Monthly | Same as holdings | Derived from XLS | Same as holdings | Public, official document (derived) | high — derived metric, same provenance-tagging requirement as cash position above |

## External rating

| Field | Preferred source | Alternate source | AMC publication location | Frequency | Expected delay | Format | Historical files? | Licensing | Extraction difficulty |
|---|---|---|---|---|---|---|---|---|---|
| External rating (CRISIL / ICRA / Value Research / Morningstar star ratings) | **A licensed data feed or API from the rating agency itself** | None acceptable — **explicitly do not scrape rating agency websites or consumer finance sites carrying their ratings** | N/A until a license exists | Varies by provider (typically monthly/quarterly) | N/A | Varies (API/feed if licensed) | Depends on license terms | **Licensing required — status unresolved, see Phase 9 / `docs/CRISIL_INTEGRATION_STUDY.md`** | N/A until licensed — this field's only "extraction difficulty" today is that it must not be attempted at all |

---

## Why "AMC website" and "AMC factsheet" are listed ahead of AMFI/SEBI for most fields

The mission's preferred-source ordering ranks AMC factsheets/disclosures (1–3) ahead of AMFI (5)
and SEBI (6) for a concrete reason, not just deference to the list order: **AMFI's own data feed
(`NAVAll.txt`, which this platform's core `funds.json` is built from) carries scheme identity and
NAV only** — it has no expense ratio, AUM, holdings, or any of the 26 fields in this register.
AMFI is the right source for the fields it already powers (scheme code, ISIN, NAV, category) —
none of which are in this register because Phase 1 already found them well-covered. SEBI is the
regulator that *mandates* AMC disclosure (the right citation for *why* a field should exist and
*how often*) but is not itself a per-scheme data repository. So for every field in this register,
the AMC's own factsheet or monthly portfolio disclosure is correctly the primary source — this
register's ordering matches the mission's, not by default deference but because it's actually
where the data lives.

## What Phase 2 did not do

This register does not (yet) contain empirically re-verified publication URLs for AMCs beyond
SBI — that is deliberately Phase 5's job, not this document's. Where a URL or portal is named
above, it is marked with its verification level; none of it should be treated as ready-to-ingest
without that pilot pass. See `docs/METADATA_ACQUISITION_PLAN.md` for the AMC-by-AMC rollout order
and `docs/AMC_DOCUMENT_SOURCE_MATRIX.md` for the per-AMC, per-document-type matrix.
