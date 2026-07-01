# Market Coverage Report — 2026-06-30

**Reproducible:** `.venv/bin/python -m scripts.market_coverage_audit` (diffs MF Pulse vs the LIVE AMFI feed).

## Industry coverage (the headline)
| | Count |
|---|---:|
| **Live AMFI universe** (fetched today, https://portal.amfiindia.com/spages/NAVAll.txt) | **14,208** |
| **MF Pulse universe** | **14,208** |
| **Covered (intersection)** | **14,208** |
| **Coverage %** | **100.0%** |
| Missing (in AMFI, not in us) | 0 |
| Delisted retained (in us, AMFI removed) | 0 |

MF Pulse's universe is a **verified superset** of the live AMFI universe: every scheme AMFI lists
today is present (missing = 0), plus 0 recently-delisted schemes
retained as dormant for research lookup.

### How many schemes exist / do we have / are missing / why
- **Exist (live AMFI):** 14,208 scheme-plan-option codes.
- **We have:** 14,208 (100% of live + 0 delisted).
- **Missing:** 0. **Why:** none — we ingest the full AMFI NAV file daily (cron).
- The 0 delisted are matured/merged schemes AMFI dropped after our snapshot; kept as dormant.

## Universe breakdown (live AMFI, classified reproducibly from the feed)
**By asset class**
| Asset class | Schemes |
|---|---:|
| Debt | 7982 |
| Equity | 2886 |
| Other | 2373 |
| Hybrid | 822 |
| Solution | 145 |

**By scheme structure (Open/Close/Interval)**
| Structure | Schemes |
|---|---:|
| Open Ended Schemes | 9404 |
| Close Ended Schemes | 4763 |
| Interval Fund Schemes | 41 |

**By fund type** *(name-derived, heuristic)*
| Fund type | Schemes |
|---|---:|
| Active/Other | 11926 |
| Index Fund | 1274 |
| Fund of Fund | 671 |
| ETF | 337 |

International (name-derived): 177 · Commodity (gold/silver): 209

## Delisted-since-snapshot (retained as dormant, sample)
| Code | Scheme | AMC |
|---|---|---|


**Source:** AMFI NAVAll (official daily NAV file). Distinct *funds* (canonical, variants collapsed) ≈ 5,600.
Counts are scheme-plan-option codes — AMFI's own unit of listing.
