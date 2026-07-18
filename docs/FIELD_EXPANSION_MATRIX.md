# Field Expansion Matrix

Data Platform Mission 2. This is the brief's exact ask — Current Status / Schema Status / Official
Source / Refresh Frequency / Difficulty / Priority for every field the mission names — rendered
from `frontend/app/lib/fieldRegistry.js` (28 entries as of 2026-07-19, up from 21) rather than
re-derived by hand, so it can never silently drift from what the live dashboard actually shows.
Source policy detail (verification levels, why AMC-website beats AMFI for cost fields, etc.) stays
in `docs/DATA_SOURCE_REGISTER.md` — this doc doesn't repeat it, only cites it.

**Update 2026-07-19 (Data Platform Mission 5):** Expense Ratio and Exit Load moved off 0% for the
first time — a real second AMC (HDFC) is now live, see `docs/FACTSHEET_PIPELINE.md`. Current
universe-wide numbers: Expense Ratio 1.69% (241), Exit Load 1.69% (241), AUM 2.76% (393), Fund
Manager 1.75% (249, up from 0.08%), Launch Date 2.71% (385). The P2 priority calls below predate
this — re-read them as "P2, partially started" for those five fields, not "not yet begun."

**Current Status** definitions, mapped from `fieldRegistry.js`'s `status` + live coverage %:
- **Exists** — schema column present, coverage ≥90% of the 14,227-scheme universe.
- **Partially Populated** — schema column present, coverage >0% and <90%.
- **Missing** — schema column present but coverage is 0%, OR no schema column exists at all.
- **N/A** — the field has no true value to acquire (regulatory zero) or acquisition is blocked by
  licensing, not by engineering effort.

**Priority** framework (defined here since none existed before this mission — applied
consistently, not per-field judgment calls):
- **P0** — already high-coverage; priority is maintaining it, not acquiring anything new.
- **P1** — real investor-decision value, and the acquisition mechanism already exists (schema +
  pipeline + provenance all wired) but isn't producing data — a fix, not a build.
- **P2** — real value, clear official source, but needs new sourcing/parsing work not yet started.
- **P3** — real value but needs new infrastructure (a new table, a new document type, a narrower
  sub-universe) before any single scheme can be populated.
- **N/A** — not a prioritization candidate (see Current Status = N/A above).

Coverage figures below are universe-wide (14,227 schemes), captured 2026-07-19. Re-run
`scripts/market_coverage_audit.py` to refresh; do not hand-edit these numbers.

## Identity & Performance (context — already strong, not this mission's focus)

| Field | Current Status | Schema Status | Official Source | Refresh | Difficulty | Priority |
|---|---|---|---|---|---|---|
| Scheme Name | Exists (100%) | Existing column | AMFI NAVAll.txt | Daily | Low | P0 |
| AMC | Exists (100%) | Existing column | AMFI NAVAll.txt | Daily | Low | P0 |
| Category | Exists (100%) | Existing column | AMFI NAVAll.txt | Daily | Low | P0 — 54 raw category strings incl. known taxonomy defects, tracked separately as a repair task, not a coverage gap |
| NAV | Exists (98.3%) | Existing column | AMFI NAVAll.txt | Daily (×2) | Low | P0 |
| Benchmark (name) | Exists (85.9%) | Existing column | SID / AMC factsheet | Static | Medium | P0 — remaining ~2,000 schemes are the acquisition target, not a new field |

## The 26 fields named in the mission brief

| # | Field | Current Status | Schema Status | Official Source | Refresh | Difficulty | Priority |
|---|---|---|---|---|---|---|---|
| 1 | NAV | Exists (98.3%) | Existing column | AMFI NAVAll.txt | Daily ×2 | Low | P0 |
| 2 | AUM | Missing (1.07%) | Existing column | AMC factsheet PDF | Monthly | Low (per-scheme) / Medium (AMC-level, doesn't exist at all) | P2 |
| 3 | Expense Ratio | Missing (0.0%) | Existing column | AMC website TER page | Varies by AMC | High | P2 |
| 4 | Exit Load | Missing (0.0%) | Existing column | SID | Static (event-driven) | Medium | P2 |
| 5 | Entry Load | **N/A** | No schema column | N/A — SEBI banned entry loads industry-wide, 2009 | N/A | N/A | **N/A** |
| 6 | Lock-in | Missing | No schema column | SID (ELSS: statutory 3y, citable as law) | Static | Low for ELSS / do not infer elsewhere | P2 |
| 7 | Fund Objective | Missing (unverified) | No schema column | SID "Investment Objective" | Static | Medium | P2 |
| 8 | Benchmark | Exists (85.9%) | Existing column | SID / AMC factsheet | Static | Medium | P0 |
| 9 | Fund Manager (current) | Missing (0.08%) | Existing column | AMC factsheet | Monthly | Medium | P2 |
| 10 | Manager History (tenure) | Missing | No schema column (needs a table, not a column) | SAI | Static, append-only | High | P3 |
| 11 | Portfolio Holdings | Missing (0.18%) | Existing column | AMC monthly portfolio disclosure (full XLS) | Monthly | High | P2 |
| 12 | Sector Allocation | Missing (1.07%) | Existing column | AMC factsheet (summary) | Monthly | Medium | P2 — known contamination defect must be fixed alongside expansion |
| 13 | Asset Allocation (equity/debt/cash %) | Missing | No schema column | AMC factsheet (mandate) + portfolio disclosure (actual) | Monthly / static | Medium | P3 |
| 14 | Credit Quality | Missing | No schema column | AMC factsheet "rating profile" table | Monthly | High | P3 — debt/hybrid-only (~6,900 schemes) |
| 15 | Duration | Missing | No schema column | AMC factsheet "portfolio characteristics" | Monthly | Medium | P3 — debt/hybrid-only |
| 16 | Yield (YTM) | Missing | No schema column | AMC factsheet, same box | Monthly | Medium | P3 — debt/hybrid-only |
| 17 | Average Maturity | Missing | No schema column | AMC factsheet, same box | Monthly | Medium | P3 — debt/hybrid-only |
| 18 | Modified Duration | Missing | No schema column | AMC factsheet, same box | Monthly | Medium | P3 — debt/hybrid-only, not every AMC discloses distinctly from Macaulay duration |
| 19 | Portfolio Turnover | Missing | No schema column | AMC factsheet | Monthly | Medium | P3 |
| 20 | Minimum Investment (lumpsum) | Missing (0.0%, but pipeline exists) | Existing column | AMC factsheet | Static | Low | **P1** |
| 21 | Minimum SIP | Missing (0.0%, but pipeline exists) | Existing column | AMC factsheet | Static | Low | **P1** |
| 22 | Riskometer | Missing (1.07%) | Existing column | AMC factsheet | Monthly | Low | P2 |
| 23 | Category | Exists (100%) | Existing column | AMFI NAVAll.txt | Daily | Low | P0 |
| 24 | AMC | Exists (100%) | Existing column | AMFI NAVAll.txt | Daily | Low | P0 |
| 25 | Scheme Status (active/closed/merged) | Missing | No schema column — not extractable from a single snapshot at all | Derived (AMFI feed presence/absence, day over day) | Daily diff | Medium | P3 — same infrastructure as Mission 6 (Change Detection) |
| 26 | Launch Date | Missing (1.07%, but pipeline exists) | Existing column | AMC factsheet | Static | Low | **P1** |
| 27 | Fund Age | Missing | No schema column (pure arithmetic, not an acquisition target) | Computed from Launch Date | Continuous | Low | **P1** — free once Launch Date grows, do not roadmap as a sourcing task |

## What this table found that wasn't visible before this mission

1. **Three fields were already being computed and simply never surfaced.** `scripts/market_coverage_audit.py`'s `FIELDS` dict has measured `Metadata.Launch Date`, `Metadata.SIP Minimum`, and `Metadata.Lumpsum Minimum` for a while; `fieldRegistry.js` (what the dashboard actually reads) never had matching entries. Fixed in this mission — zero new ingestion, three new registry rows (see `frontend/app/lib/fieldRegistry.js`'s "Data Platform Mission 2" section).
2. **Minimum SIP and Minimum Investment are a pure extraction-logic bug, not a sourcing gap.** Both have a schema column (`SchemeMetadata.minimum_sip` / `.minimum_lumpsum`) and both are already in `ingestion/factsheet/provenance.py`'s `TRACKED_FIELDS`. Real measured coverage is 0/152 even within the SBI pilot — every other tracked field in that same pilot has *some* non-zero count. The SBI adapter's regex simply never matches these two labels in practice. This is the cheapest real fix available (P1, no new source, no new schema) and should be first in Mission 3's roadmap.
3. **Entry Load isn't a data gap at all.** SEBI abolished entry loads for every mutual fund scheme in 2009 (circular SEBI/IMD/CIR No.4/168230/09). The correct implementation is a static citation, not an ingestion pipeline — building one would be wasted effort chasing a value that's uniformly zero by law.
4. **Fund Age is arithmetic, not acquisition.** It shouldn't appear as its own line item in any ingestion roadmap; it rides on Launch Date's coverage for free.
5. **Six fields (11 in the brief's numbering: Manager History, Credit Quality, Duration, Yield, Average Maturity, Modified Duration, Portfolio Turnover, Asset Allocation, Scheme Status) have no schema column anywhere** — Mission 5 (factsheet pipeline) and Mission 6 (change detection) are prerequisites for most of these, not just Mission 3 (sourcing), since several need a new table shape (one-to-many for Manager History, a diff mechanism for Scheme Status) rather than a new column on the existing row.

See `docs/DATA_ACQUISITION_ROADMAP.md` (Mission 3) for the prioritized plan that follows from this table.
