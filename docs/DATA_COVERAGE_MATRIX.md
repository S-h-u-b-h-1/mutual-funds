# Data Coverage Matrix

Originally Trust Sprint Mission 1; extended for the Product Completion Mission's Phase 1 (Data
Completeness) against its exact required-field list and 7-column format. Computed by
`scripts/market_coverage_audit.py` — reused and extended in place (added SIP/Lumpsum Minimum
checks), not duplicated. Reproducible: `.venv/bin/python -m scripts.market_coverage_audit`.

**asOf: 2026-07-14** (funds.json) / **live AMFI + this audit run: 2026-07-15**. Universe: 14,218
schemes (14,224 on live AMFI at check time — see Headline scores below for the gap explanation).

## Format

Coverage %, Freshness, Source, Confidence, Validation, Lineage, Missing Count — the exact 7 fields
the Product Completion Mission requests, for every field it names. Confidence methodology
(unchanged from Trust Sprint Mission 1, applied identically to every row): **High** = coverage
≥90% AND validated AND primary official source. **Medium** = coverage ≥40% AND (validated OR
primary source). **Low** = below both thresholds but non-zero. **N/A** = 0% populated, nothing to
be confident about yet.

**Lineage**, added this pass: the traceable chain from raw source to displayed value. For
AMFI-sourced fields this is `AMFI NAVAll.txt → scripts/cloud_pipeline.py → Supabase/Neon →
scripts/build_performance.py / build_daily.py → frontend/app/data/*.json`. For factsheet-sourced
fields it is `AMC PDF → scripts/factsheet_pipeline.py → frontend/app/data/metadata.json` today,
moving to the full provenance chain (`source_documents → source_document_versions →
source_extractions → fund_metadata_values`, live on Neon production as of 2026-07-15) once
Provenance Mission Phase 4 re-points the factsheet pipeline at it — see `docs/DATA_SOURCE_REGISTER.md`.

---

## Identity fields

### Scheme Name, Scheme Code, AMC, Category, Asset Class
Coverage **100%** · Freshness 1 day · Source **AMFI NAVAll.txt** (official daily feed) · Confidence
**High** · Validation validated at ingest · Lineage AMFI → cloud_pipeline.py → funds.json ·
Missing count **0**

### Subcategory
Coverage **0% — field does not exist.** `category` (e.g. "Banking and PSU", "Ultra Short
Duration") is often already subcategory-grained for debt/hybrid funds, but there is no separate,
consistently-structured Subcategory field, and `category` itself has known taxonomy defects that
would propagate into any subcategory built on top of it uncorrected: 54 distinct raw category
strings exist today, including a literal typo ("Indexs", 1,285 schemes) and a vague placeholder
("Income", 4,656 schemes — AMFI's own bucket name, not a defect MF Pulse introduced, but not
useful as a subcategory either). Source **none** · Confidence **N/A** · Lineage **none** · Missing
count **14,218** (100%). This is exactly the gap Scheme Matching Sprint Phase 5 / Completion Sprint
Phase 3 (tasks #192, #245, both pending) already exist to fix — building a Subcategory field before
that taxonomy repair would mean building on a known-defective base.

### ISIN
Coverage **98.79%** · Freshness 1 day · Source **AMFI NAVAll.txt** · Confidence **High** ·
Validation validated at ingest · Lineage AMFI → cloud_pipeline.py → funds.json · Missing count
**~172**

---

## NAV and performance

### NAV / Daily NAV
Coverage **98.29%** · Freshness 1 day · Source **AMFI daily NAV feed** · Confidence **High** ·
Validation validated at ingest · Lineage AMFI NAVAll.txt (refreshed twice daily, 14:30 UTC +
05:00 UTC per `production-refresh.yml`) → funds.json · Missing count **243**. Treated as one field:
"Daily NAV" is this same official value, refreshed on the same schedule — there is no separate
lower-frequency "NAV" and higher-frequency "Daily NAV" in this pipeline.

### Historical NAV
Coverage **28.03%** (full universe, ≥90 trading days) / **99.62%** (investable growth-plan cohort)
· Freshness 1 day · Source **derived from accumulated AMFI daily feeds** · Confidence **High**
(investable) / **Low** (full universe) · Validation gated on ≥90 real trading days, never estimated
from fewer · Lineage AMFI (daily) → fact_nav_daily (Supabase/Neon) → funds.json `quality.obs` ·
Missing count **10,232** (full universe) / **13** (investable). The full-universe gap is almost
entirely inactive/matured schemes that legitimately stopped accumulating history, not a pipeline
failure — see `docs/DATA_COVERAGE_AUDIT.md` §B.

### Returns (1M/3M/6M/1Y/3Y/5Y) and Benchmark Returns
Fund returns: Coverage **99.54%** (investable) · Source **AMFI NAV, point-to-point calculation** ·
Confidence **High** · Lineage funds.json NAV history → `scripts/build_performance.py` →
performance.json · Missing count (investable) **16**.

Benchmark Returns is a genuinely different, narrower thing, and a new finding this pass:
`scripts/fetch_index_history.py` fetches a real daily Nifty 50 / Sensex series (Yahoo Finance) and
stores it at `frontend/app/data/index_history.json`, used for Alpha/Beta/Treynor on the **227
schemes** (1.60% of universe) whose benchmark is exactly "NIFTY 50 TRI" or "S&P BSE SENSEX TRI".
Two real problems found: (1) **the file is 12 days stale** (`fetchedAt: 2026-07-03`) — this script
is not wired into any GitHub Actions workflow, an orphaned-script pattern identical to what
`market_coverage_audit.py` had before this session revived it; (2) **the series is a price index,
not the TRI variant funds are actually benchmarked against** — already disclosed honestly in the
script's own header and (per source review) everywhere the resulting Alpha/Beta is shown, not a
new problem, but worth restating here since it directly bears on this field's Confidence rating.
Coverage **1.60%** · Freshness **12 days (stale)** · Source **Yahoo Finance ^NSEI/^BSESN (price
index proxy)** · Confidence **Low** (narrow coverage + known TRI/price-index gap + stale) ·
Validation methodology caveat disclosed at point of use · Lineage Yahoo Finance →
fetch_index_history.py (manual/orphaned) → index_history.json → risk-ratio calculations · Missing
count **13,991** (schemes whose benchmark isn't exactly Nifty 50 or Sensex have no index-return
comparison at all). **Action item for Phase 9/Completion Sprint Phase 2:** wire
`fetch_index_history.py` into `production-refresh.yml` alongside `market_coverage_audit.py`.

### Risk metrics (volatility, drawdown, consistency)
Coverage **99.62%** (investable) / **28.03%** (full universe) — same gating as Historical NAV, for
the same reason · Source **derived from AMFI 90-day NAV history** · Confidence **High**
(investable) / **Low** (universe) · Lineage same chain as Historical NAV → `scripts/explain.py` ·
Missing count (investable) **13**.

---

## Cost and structural terms

### Expense Ratio, Exit Load, SIP Minimum, Lumpsum Minimum
Coverage **0.0%** for all four, universe-wide — **newly and precisely measured this pass** (SIP
Minimum and Lumpsum Minimum were schema slots in `metadata.json` that no prior audit had actually
checked; `market_coverage_audit.py` now checks them). Source **AMC Factsheet PDF (SBI pilot
only)** · Confidence **N/A** · Validation N/A (nothing to validate — zero populated) · Lineage AMC
PDF → factsheet_pipeline.py parser → metadata.json (field present, always null) · Missing count
**14,218 / 14,218** for each. Not a parser bug: the SBI per-scheme PDF layout used doesn't expose
these fields in a form the current parser extracts (confirmed in the prior Trust Sprint audit for
Expense Ratio specifically; SIP/Lumpsum Minimum now confirmed to have the identical failure mode).

### Lock-in
Coverage **0% — field does not exist** in any schema, pipeline, or database table. Most open-ended
schemes have no lock-in regardless (only ELSS/close-ended funds do), so a populated version of this
field would need to distinguish "not applicable" from "unknown," which the current schema has no
way to express. Source **none** · Missing count **14,218** (100%, though the true addressable
denominator — ELSS + close-ended schemes only — is materially smaller).

---

## Portfolio and AUM

### AUM, Riskometer, Launch Date
Coverage **1.07%** (152 schemes) · Freshness **22 days** · Source **AMC Factsheet PDF (SBI only)**
· Confidence **N/A** · Validation validated at ingest · Lineage AMC PDF → factsheet_pipeline.py →
metadata.json · Missing count **14,066**

### Fund Manager
Coverage **0.08%** (12 schemes) · Freshness 22 days · Source **AMC Factsheet PDF (SBI only)** ·
Confidence **N/A** · Validation validated at ingest, conservative (ambiguous solo-manager lines
dropped rather than mis-attributed) · Lineage same as above · Missing count **14,206**

### Holdings, Sector Allocation
Holdings: Coverage **0.18%** (26 schemes) · Missing count **14,192**. Sector Allocation: Coverage
**1.07%** (152 schemes) · Missing count **14,066**. Both: Freshness 22 days · Source AMC Factsheet
PDF (SBI only) · Confidence **N/A** · Lineage same chain · Validation for Sector Allocation:
**incomplete** — a real contamination defect (stock names and subtotal rows bleeding into the
sector list for at least one record) that the current validator does not yet catch, found in a
prior Trust Sprint pass and not yet fixed.

### Asset Allocation (equity/debt/cash split), Portfolio Turnover, Cash Allocation
Coverage **0% — field does not exist** in any schema, pipeline, or database table. `assetClass` in
funds.json (Equity/Debt/Hybrid/Other) is a *category-level* classification, not a per-scheme
percentage breakdown, and is a different field from what's being asked here. Source **none** ·
Missing count **14,218** (100%) each.

---

## Debt metrics

### Duration, Yield (YTM), Maturity, Credit Rating Mix
Coverage **0% — none exist** in any schema, pipeline, or database table, for any of the four.
Source **none** · Confidence **N/A** · Missing count **14,218** (100%) each. Addressable denominator
is debt + hybrid schemes only (~6,900 of 14,218), still 0% of that narrower base too. Tracked as
Provenance Mission Phase 8 (task #212, pending) — a real, scoped, not-yet-started engine.

---

## Ratings

### CRISIL Rating
**Unavailable — licensed data source required.** MF Pulse has no CRISIL license and does not
scrape, copy, or infer CRISIL ratings from any source (confirmed via full-frontend grep this pass —
zero matches for "CRISIL" outside of "unavailable"/"licensed" context strings). Coverage **0%,
by design, not a gap.** Tracked as Provenance Mission Phase 9 (task #207, pending): licensing-status
research + integration adapter, so that IF a license is ever secured, the schema/adapter is ready —
but the public product must keep saying "unavailable" until that's real.

### Star Rating
**Omitted — no licensed or publicly usable source exists.** No Morningstar, Value Research, or
other third-party star rating is displayed, implied, or computed anywhere (same grep, zero
matches). Correctly omitted per the brief's own instruction, not a gap to close.

### MF Pulse Rating
This is `qualityEngine.js`'s output (8 dimensions today: performance, risk, consistency,
diversification, momentum, reliability, transparency, dataCompleteness — drop-and-renormalized
when a dimension's inputs are missing, confidence reported alongside, never blended in). Coverage
of *some* score: **not directly measured this pass** — `market_coverage_audit.py` is Python and
doesn't execute this JS engine, so this number is reasoned from code, not run: `fundHealth()`
(qualityEngine's gate) returns null only when zero dimensions are computable, and Latest NAV alone
(98.29% universe) is sufficient for at least one dimension, so a non-null score almost certainly
exists for close to that same ~98% — but this is an **inference, explicitly labeled as such, not a
measurement**, and is itself a finding: **the audit engine has no rating-coverage metric.** Depth of
that score (how many of 8 dimensions populate, not just whether one does) is gated by the same
90-day-history requirement as risk metrics: full-depth ratings are effectively bounded to the same
~28% universe / ~99.6% investable split. Action item: add real (not inferred) MF Pulse Rating
coverage + average-dimension-depth to `market_coverage_audit.py` — small, concrete, queued for the
next audit-engine touch (Completion Sprint Phase 2, task #244).

---

## Headline scores (same engine, same run, 2026-07-15)

| Score | Value | What it measures |
|---|---|---|
| Scheme coverage | 100.0% | MF Pulse universe vs. live AMFI universe, fetched fresh this run |
| Production validation | **88.89%** (8/9 checks) | funds.json (14,218) is 6 schemes behind live AMFI (14,224) at check time — normal once-daily batch lag on newly-listed schemes, not a stuck pipeline |
| Overall trust score | **84.7/100** | Weighted: coverage 22%, routability 13%, validation 15%, freshness 12%, historical depth 8%, lineage 10%, completeness 10%, metadata 10% — see `scripts/market_coverage_audit.py` for the exact formula |

## What changed this pass vs. the prior (2026-07-14) matrix

1. Reformatted to the Product Completion Mission's exact 7-column structure (added explicit
   Lineage and raw Missing Count to every row, not just percentages).
2. Extended the audit engine (additively, `scripts/market_coverage_audit.py`) to actually measure
   SIP Minimum and Lumpsum Minimum — previously asserted as "0%, unmeasured schema slot," now a
   real, engine-computed 0.0% (14,218/14,218 missing) each.
3. **New finding:** Benchmark Returns exists in a real, narrow, honestly-caveated form (227
   schemes, Nifty50/Sensex price-index proxy) that no prior audit pass had surfaced as its own
   line item — and its backing script (`fetch_index_history.py`) is stale (12 days) and unwired
   from any scheduled workflow, the same orphaned-script pattern already found and partly fixed
   for `market_coverage_audit.py` itself.
4. Explicitly separated "structurally absent" fields (Subcategory, Lock-in, Asset Allocation,
   Portfolio Turnover, Cash Allocation, all four Debt Metrics) from "schema exists but unpopulated"
   fields (Expense Ratio, Exit Load, SIP/Lumpsum Minimum) — these are different kinds of gaps with
   different fixes (schema design vs. parser coverage), and the brief's per-field Lineage column
   makes that distinction visible instead of collapsing everything into one "0%, N/A" bucket.
5. Confirmed by direct grep, not assumption: the product displays zero fabricated or implied
   CRISIL/Morningstar/Value Research ratings anywhere today.
