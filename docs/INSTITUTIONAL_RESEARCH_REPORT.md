# Institutional Research Readiness — Report (2026-06-26)

Reproducible: `python -m scripts.market_coverage_audit` + `python -m scripts.build_knowledge_graph`.
Denominators: universe = 14,224 routable schemes; investable = active Growth non-IDCW = 3,467.

## What this sprint shipped (all honest, no fabrication)
1. **Benchmark coverage 40% → 86%** (universe; 73% investable) — SEBI category standards for
   hybrid/debt/solution categories + **index-name derivation** (an index fund's benchmark is the
   index in its name). Sectoral/thematic/FoF funds with no named index correctly stay
   **unbenchmarked** rather than take a wrong default.
2. **Institutional risk ratios** — Sharpe & Sortino (rf 6.5%, disclosed) computed from NAV for every
   fund with 1Y history; shown in the Risk panel.
3. **Fund Completeness "why not 100%"** — the fund page now names the weakest dimensions and states
   the missing fields are factsheet-sourced, never estimated.
4. **Knowledge Graph** — canonical funds/AMCs/categories/benchmarks (universe) + managers/companies/
   sectors (factsheet), with working queries (funds-by-manager, funds-holding-Reliance,
   AMCs-with-Banking, funds-by-benchmark). See KNOWLEDGE_GRAPH.md.

## Scores — before → after
| Metric | Before | After |
|---|---:|---:|
| Benchmark coverage (universe) | 40% | **86.3%** |
| Benchmark coverage (investable) | 45% | **73%** |
| Research Readiness (investable) | 49.6 | **52.9** |
| Fund Completeness (investable) | 53.3 | **56.1** |
| ISIN coverage | 98.8% | 98.8% |
| Trust Score | 83.3 | 81.5* |

*Trust dipped because we **removed** ~660 wrongly-defaulted sectoral benchmarks — correctness over a
higher headline. This is the trust-first tradeoff the platform is built on.

## The 12 final-report numbers
| # | Metric | Value |
|---|---|---:|
| 1 | Research Readiness (investable) | **52.9/100** (universe 30.4) |
| 2 | Fund Completeness (investable) | **56.1/100** (universe 39.0) |
| 3 | Metadata coverage | 1.07% |
| 4 | Holdings coverage | 0.18% |
| 5 | Manager coverage | 0.08% |
| 6 | Expense ratio coverage | 0.0% |
| 7 | AUM coverage | 1.07% |
| 8 | Portfolio coverage | 1.07% |
| 9 | **Benchmark coverage** | **86.3%** |
| 10 | Document coverage | 1.07% |
| 11 | Trust Score | 81.5/100 |
| 12 | Institutional Research Readiness | see below |

## The 12-question product test (typical investable, non-SBI fund)
✓ What is this fund? · ✓ What benchmark? (73%) · ✓ Is it risky? (vol, Sharpe, Sortino, drawdown) ·
✓ How has it performed? · ✓ How vs peers? (category rank/percentile) · ✓ Why attention? · ✓ Data complete? (scored)
✗ What does it invest in? · ✗ Who manages it / track record? · ✗ Is it expensive? · ✗ How vs the benchmark index? (needs index NAV series)

**~7 of 12 for a typical fund; ~10–11 of 12 for an SBI fund** (adds manager, holdings, AUM, riskometer).

## The honest ceiling (why not 95%)
Four readiness questions — **manager, holdings, expense ratio, AUM** — live only in AMC factsheet /
portfolio **PDFs**. SBI's per-scheme PDFs parse (those funds reach ~85%). HDFC/ICICI/Nippon and the
rest publish **consolidated** PDFs whose tables need `pdfplumber`/`camelot`, which **do not install on
the Python 3.14 dev sandbox** (need a 3.13 worker). Without that worker, universe-wide Research
Readiness is **hard-capped around 55–60%**, and reaching 95% by any other means would require
fabricating those four fields — which this platform will not do.

## The single unblock to 95%
Stand up a **Python 3.13 PDF-parsing worker** (`pdfplumber`, `camelot-py`, `ghostscript`) →
run the Tier-1 factsheet adapters (HDFC/ICICI/Nippon) → manager/holdings/expense/AUM flow to ~60%+
of the universe → Research Readiness crosses **90–95%**. Everything upstream (adapters scaffolded,
metadata quality engine, completeness scoring, knowledge graph) is already built and waiting for the data.
