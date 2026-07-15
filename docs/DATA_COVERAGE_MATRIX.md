# Data Coverage Matrix

Trust Sprint Mission 1. Computed by `scripts/market_coverage_audit.py` — a real, pre-existing
engine found orphaned (no caller anywhere in the codebase) with stale outputs (last run ~June 30).
Fixed and re-run for this mission rather than building a parallel computation: found and fixed one
genuine bug in the process (see below), refreshed the local AMFI snapshot, and re-ran it live.
Reproducible: `.venv/bin/python -m scripts.market_coverage_audit`.

**asOf: 2026-07-14** (funds.json) / **live AMFI checked: 2026-07-15**. Universe: 14,224 schemes.

## Format

Each field below in the exact structure requested: Coverage %, Missing %, Freshness, Official
source, Last updated, Validation status, Confidence. Confidence methodology (stated once, applied
identically to every row): **High** = coverage ≥90% AND validated AND primary official source.
**Medium** = coverage ≥40% AND (validated OR primary source). **Low** = below both thresholds.
**N/A** = 0% populated, nothing to be confident about yet.

---

### Scheme identity (code, name, AMC, category, asset class)
Coverage **100%** · Missing 0% · Freshness 1 day · Source **AMFI NAVAll.txt** (official daily feed)
· Last updated 2026-07-14 · Validation **validated at ingest** · Confidence **High**

### ISIN
Coverage **98.79%** · Missing 1.21% · Freshness 1 day · Source **AMFI NAVAll.txt** · Last updated
2026-07-14 · Validation validated at ingest · Confidence **High**

### NAV (latest)
Coverage **98.29%** · Missing 1.71% · Freshness 1 day · Source **AMFI daily NAV feed** · Last
updated 2026-07-14 · Validation validated at ingest · Confidence **High**

### Category
Coverage **100%** · Missing 0% · Freshness 1 day · Source **AMFI category classification** · Last
updated 2026-07-14 · Validation validated at ingest · Confidence **High**

### Benchmark
Coverage **86.11%** · Missing 13.89% · Freshness 1 day · Source **SEBI category framework / AMC
mandate** · Last updated 2026-07-14 · Validation validated at ingest · Confidence **Medium** —
**correction found this mission:** previously reported as 100% in an earlier audit; that check
tested key-presence, not value-truthiness. 1,975 schemes (1,907 of them active — including
Franklin India Technology Fund, ICICI Prudential Technology Fund, Tata Ethical Fund) have
`benchmark: null`.

### Returns (1M/3M/6M/1Y/3Y/5Y)
Coverage **99.54%** (investable set) · Missing 0.46% · Freshness 1 day · Source **AMFI NAV,
point-to-point calculation** · Last updated 2026-07-14 · Validation validated at ingest ·
Confidence **High**

### Risk metrics (volatility, drawdown, consistency)
Coverage **99.62%** (investable set) / 28% (full universe) · Freshness 1 day · Source **derived
from AMFI 90-day NAV history** · Last updated 2026-07-14 · Validation validated at ingest (gated
on ≥90 trading days of real history — never estimated from less) · Confidence **High** for the
investable cohort, **Low** for the full universe (the gap is almost entirely inactive/matured
schemes that legitimately can't compute a trailing volatility — see `docs/DATA_COVERAGE_AUDIT.md`
§B for the active/inactive breakdown).

### Category rank
Coverage **8.4%** (full universe) · Missing 91.6% · Freshness 1 day · Source **derived,
`scripts/explain.py`** · Last updated 2026-07-14 · Validation validated at ingest · Confidence
**Low** — this is an engine-scope gap, not a data gap: category rank is computed for Equity
schemes only. 0% for Debt, Hybrid, Other (Gold/International), and Solution-Oriented — 56% of the
universe by scheme count.

### Fund manager
Coverage **0.08%** · Missing 99.92% · Freshness **22 days** · Source **AMC Factsheet PDF (SBI
only)** · Last updated 2026-06-23 · Validation validated at ingest, conservative (ambiguous
solo-manager lines dropped rather than mis-attributed) · Confidence **N/A**

### AUM
Coverage **1.07%** · Missing 98.93% · Freshness 22 days · Source **AMC Factsheet PDF (SBI only)**
· Last updated 2026-06-23 · Validation validated at ingest · Confidence **N/A**

### Sector allocation
Coverage **1.07%** · Missing 98.93% · Freshness 22 days · Source **AMC Factsheet PDF (SBI only)**
· Last updated 2026-06-23 · Validation **incomplete** — a real contamination defect was found this
sprint (stock names and subtotal rows bleeding into the sector list for at least one record) that
the current validator does not yet catch · Confidence **N/A**

### Holdings
Coverage **0.18%** · Missing 99.82% · Freshness 22 days · Source **AMC Factsheet PDF (SBI only)**
· Last updated 2026-06-23 · Validation validated at ingest · Confidence **N/A**

### Expense ratio
Coverage **0%** · Missing 100% · Freshness N/A (never populated) · Source **AMC Factsheet PDF
(attempted, SBI)** · Last updated — never · Validation N/A · Confidence **N/A** — not a single
scheme on the platform has a real expense ratio; the SBI per-scheme PDF layout used doesn't expose
the field at all (verified, not a parser bug).

### Riskometer, exit load, minimum SIP, minimum lumpsum
Coverage **0%** each within the SBI pilot itself · Missing 100% · Source AMC Factsheet PDF ·
Confidence **N/A** — same as expense ratio: the field exists in the schema, extraction has simply
never succeeded for these specific fields against the one AMC attempted so far.

### Lock-in, asset allocation split, turnover ratio, minimum additional investment, debt metrics
(average maturity, modified/Macaulay duration, YTM, credit-quality allocation), external rating
Coverage **0%** · Source **none — the field does not exist in any pipeline yet**, structurally
absent rather than merely unpopulated · Confidence **N/A**

---

## Headline scores (from the same engine, same run)

| Score | Value | What it measures |
|---|---|---|
| Scheme coverage | 100.0% | MF Pulse universe vs. live AMFI universe, fetched fresh this run |
| Production validation | **88.89%** (8/9 checks) | See below — the one failing check is real and small |
| Overall trust score | **84.7/100** | Weighted: coverage 22%, routability 13%, validation 15%, freshness 12%, historical depth 8%, lineage 10%, completeness 10%, metadata 10% — see `scripts/market_coverage_audit.py` for the exact formula, nothing hidden |

**The one failing production check, explained precisely, not just reported as a number:**
`funds.json` (14,218 schemes) is 6 schemes behind the live AMFI feed checked at the moment this
ran (14,224). This is the expected, small lag of a once-daily batch pipeline against newly-listed
schemes — not a stuck or broken pipeline (the daily refresh cron is confirmed real and scheduled,
see the fix below). Explainable, bounded, and will close on the next scheduled refresh.

## Two real bugs found and fixed while producing this matrix

1. **A false "no automated refresh" finding.** The production-readiness check tested for a
   hardcoded `.github/workflows/daily-nav.yml` filename that no longer exists — the actual daily
   refresh was consolidated into `production-refresh.yml` at some point and this one check was
   never updated, so a real, cron-scheduled, working pipeline was being reported as unscheduled.
   Fixed by pointing the check at the real filename and confirming its two real cron triggers.
2. **A stale local dev snapshot masquerading as a coverage gap.** Before refreshing, this same
   run reported "8 missing schemes" and 44.44% production-readiness — both were artifacts of this
   sandbox's local `data/NAVAll.txt` being 5 days behind the live feed, not a real production gap.
   Refreshing it (the same live AMFI URL production already fetches daily) resolved 4 of 5 failing
   checks immediately. Reported here so the corrected 88.89%/84.7 numbers above aren't mistaken
   for the platform having just "gotten better" — they're the same platform, measured correctly.

## What this fixes going forward

This engine (`scripts/market_coverage_audit.py`) was orphaned — sophisticated, correct, and never
wired into the pipeline, so its outputs silently went stale for ~2 weeks. Wiring it into
`scripts/factsheet_pipeline.py` (which already calls `trust_audit.main()` in the same slot) is the
direct fix, tracked as follow-up work rather than rushed into this same pass, since it changes
what the monthly cron runs — a Provenance Mission "no orphaned bundle" fix, not a Trust Sprint one.
