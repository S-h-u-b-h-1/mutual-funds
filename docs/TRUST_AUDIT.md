# Trust Audit (Phase 11) — historical snapshot, undated in the original

**⚠️ Superseded — do not read "100/100" as a current trust score.** This file had no date when
written and predates the rigorous coverage work in `docs/DATA_COVERAGE_AUDIT.md` and
`docs/DATA_SOURCE_REGISTER.md` (2026-07-13+), which found real, material gaps this doc says
nothing about: expense ratio 0% populated platform-wide, factsheet metadata (AUM/manager/
holdings/riskometer) covering 1.07% of schemes from 1 of 51 AMCs, category rank 0% for Debt/
Hybrid/Gold/International/Solution-Oriented (56% of the scheme universe by count).

**What "100/100" actually measured, and still may be true today:** the checks below are data
*validity* checks (is anything impossible/corrupt among the data that exists), not data
*completeness* checks. A fund with an unpopulated expense ratio correctly shows "Not available"
rather than a fabricated number — that's why these specific counts can legitimately be zero. The
problem is the headline "100/100" implies total trustworthiness without that completeness
context anywhere in this file. For the real, current, honest picture — coverage, freshness,
confidence per field — see `docs/DATA_COVERAGE_AUDIT.md` and `docs/DATA_SOURCE_REGISTER.md`.

## Validation (must be zero) — the specific checks below, not a completeness measure
| Check | Count |
|---|---|
| Duplicate scheme codes | 0 |
| Scores out of 0–100 range | 0 |
| Impossible returns | 0 |
| Impossible volatility | 0 |
| Impossible expense ratios | 0 |
| Negative AUM | 0 |
| Sector allocations >105% | 0 |

## Reproducibility
- Every displayed number traces to AMFI NAV (returns/risk), the SEBI category map (benchmark) or a checksummed factsheet PDF (metadata).
- Scores are pure functions (`lib/fundHealth.js`, `scripts/explain.py`) with documented weights — re-runnable by any engineer.
- The CI suites `tests/test_data_quality.py` and `tests/test_scores.py` fail the build if any of the above counts is non-zero.