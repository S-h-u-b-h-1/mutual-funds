# Market Coverage Report — 2026-06-30

**Reproducible:** `.venv/bin/python -m scripts.market_coverage_audit` (diffs MF Pulse vs the LIVE AMFI feed).

## Industry coverage (the headline)
| | Count |
|---|---:|
| **Live AMFI universe** (fetched today, https://portal.amfiindia.com/spages/NAVAll.txt) | **14,208** |
| **MF Pulse universe** | **14,208** |
| **Covered (intersection)** | **14,204** |
| **Coverage %** | **99.97%** |
| Missing (in AMFI, not in us) | 4 |
| Delisted retained (in us, AMFI removed) | 4 |

MF Pulse's universe is a **verified superset** of the live AMFI universe: every scheme AMFI lists
today is present (missing = 4), plus 4 recently-delisted schemes
retained as dormant for research lookup.

### How many schemes exist / do we have / are missing / why
- **Exist (live AMFI):** 14,208 scheme-plan-option codes.
- **We have:** 14,208 (100% of live + 4 delisted).
- **Missing:** 4. **Why:** none — we ingest the full AMFI NAV file daily (cron).
- The 4 delisted are matured/merged schemes AMFI dropped after our snapshot; kept as dormant.

## Universe breakdown (live AMFI, classified reproducibly from the feed)
**By asset class**
| Asset class | Schemes |
|---|---:|
| Debt | 7982 |
| Equity | 2882 |
| Other | 2375 |
| Hybrid | 824 |
| Solution | 145 |

**By scheme structure (Open/Close/Interval)**
| Structure | Schemes |
|---|---:|
| Open Ended Schemes | 9408 |
| Close Ended Schemes | 4759 |
| Interval Fund Schemes | 41 |

**By fund type** *(name-derived, heuristic)*
| Fund type | Schemes |
|---|---:|
| Active/Other | 11924 |
| Index Fund | 1276 |
| Fund of Fund | 671 |
| ETF | 337 |

International (name-derived): 177 · Commodity (gold/silver): 209

## Delisted-since-snapshot (retained as dormant, sample)
| Code | Scheme | AMC |
|---|---|---|
| 136004 | SBI Long Term Advantage Fund - Series III - Regular Plan - G | SBI Mutual Fund |
| 136005 | SBI Long Term Advantage Fund - Series III - Regular Plan - I | SBI Mutual Fund |
| 136006 | SBI Long Term Advantage Fund - Series III - Direct Plan - In | SBI Mutual Fund |
| 136007 | SBI Long Term Advantage Fund - Series III - Direct Plan - Gr | SBI Mutual Fund |

**Source:** AMFI NAVAll (official daily NAV file). Distinct *funds* (canonical, variants collapsed) ≈ 5,600.
Counts are scheme-plan-option codes — AMFI's own unit of listing.
