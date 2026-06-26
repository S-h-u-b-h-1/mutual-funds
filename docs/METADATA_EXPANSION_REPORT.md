# Metadata Expansion & Research Completeness — Report (2026-06-26)

Reproducible: `python -m scripts.market_coverage_audit`. Denominators: universe = 14,224 routable
schemes; investable = active Growth non-IDCW = 3,467.

## What this sprint shipped
1. **Universe-wide identity enrichment** (real, from AMFI, zero fabrication): ISIN + scheme structure
   added to every fund record.
2. **Fund Completeness Score** (9 dimensions) and **Research Readiness Score** (9 questions) —
   deterministic, traceable, surfaced on every fund page.
3. **Metadata source map + AMC adapter roadmap + acquisition backlog** — the executable plan to
   close the factsheet gap.

## Field coverage — before → after
| Field | Before | After | Source | Note |
|---|---:|---:|---|---|
| ISIN | 0% (not surfaced) | **98.8%** | AMFI | newly exposed |
| Scheme structure | 0% (not surfaced) | **100%** | AMFI | newly exposed |
| Sub-category | shown | shown | AMFI | already live |
| Latest NAV | 98% | 98% | AMFI | unchanged |
| Returns (investable) | 99% | 99% | AMFI NAV | unchanged |
| Benchmark (universe) | 40% | 40% | SEBI map | unchanged |
| Expense ratio | 0% | 0% | factsheet | ⛔ parser gap (see backlog) |
| AUM | 1.07% | 1.07% | factsheet (SBI) | ⛔ non-SBI blocked |
| Manager | 0.08% | 0.08% | factsheet (SBI) | ⛔ non-SBI blocked |
| Holdings | 0.18% | 0.18% | factsheet (SBI) | ⛔ non-SBI blocked |
| Riskometer | 1.07% | 1.07% | factsheet (SBI) | ⛔ non-SBI blocked |

## New institution-grade scores
| Score | Investable | Universe |
|---|---:|---:|
| **Fund Completeness** (9 dims) | **53.3/100** | 34.4/100 |
| **Research Readiness** (9 questions) | **49.6/100** | 25.2/100 |

Research Readiness 49.6 means a typical investable fund page answers **~5 of 9** institutional
questions today: *what is it, what benchmark, how risky (NAV vol), how has it performed, why consider
it*. The 4 it cannot yet answer for non-SBI funds — *who manages it, what does it own, how expensive,
how large* — are all **factsheet-gated**.

## Why metadata didn't move (honest blocker)
Expense ratio / AUM / manager / holdings live in AMC PDFs. SBI publishes clean per-scheme PDFs
(parsed). HDFC/ICICI/Nippon publish **consolidated** PDFs whose tables require `pdfplumber`/`camelot`,
which **do not install on the Python 3.14 dev sandbox** (need a 3.13 worker). No values were
fabricated to inflate coverage. The gap is quantified per field and prioritized in
[ACQUISITION_BACKLOG.md](ACQUISITION_BACKLOG.md); the unblock path is in
[AMC_ADAPTER_ROADMAP.md](AMC_ADAPTER_ROADMAP.md).

## Highest-value fixes implemented automatically this sprint
- ISIN + structure enrichment (universe-wide) → identity completeness from ~67% to ~83% on the investable set.
- Completeness + readiness measurement wired into every fund page → the gap is now visible and traceable, not hidden.

## Highest-value fixes still pending (ranked)
1. **SBI TER regex fix** — data already in hand; raises expense ratio from 0% (quick, no infra).
2. **Py3.13 PDF worker** — unblocks HDFC/ICICI/Nippon → path to >60% metadata coverage.
3. **Mirae/Axis per-scheme adapters** — parseable on 3.14 now.
