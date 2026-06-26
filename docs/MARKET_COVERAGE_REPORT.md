# Market Coverage Report — 2026-06-23

**Reproducible:** `.venv/bin/python -m scripts.market_coverage_audit` (diffs MF Pulse vs the LIVE AMFI feed).

## Industry coverage (the headline)
| | Count |
|---|---:|
| **Live AMFI universe** (fetched today, https://portal.amfiindia.com/spages/NAVAll.txt) | **14,208** |
| **MF Pulse universe** | **14,224** |
| **Covered (intersection)** | **14,208** |
| **Coverage %** | **100.0%** |
| Missing (in AMFI, not in us) | 0 |
| Delisted retained (in us, AMFI removed) | 16 |

MF Pulse's universe is a **verified superset** of the live AMFI universe: every scheme AMFI lists
today is present (missing = 0), plus 16 recently-delisted schemes
retained as dormant for research lookup.

### How many schemes exist / do we have / are missing / why
- **Exist (live AMFI):** 14,208 scheme-plan-option codes.
- **We have:** 14,224 (100% of live + 16 delisted).
- **Missing:** 0. **Why:** none — we ingest the full AMFI NAV file daily (cron).
- The 16 delisted are matured/merged schemes AMFI dropped after our snapshot; kept as dormant.

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
| Active/Other | 11929 |
| Index Fund | 1274 |
| Fund of Fund | 669 |
| ETF | 336 |

International (name-derived): 177 · Commodity (gold/silver): 209

## Delisted-since-snapshot (retained as dormant, sample)
| Code | Scheme | AMC |
|---|---|---|
| 100042 | Aditya Birla Sun Life Liquid Fund-Retail (Growth) | Aditya Birla Sun Life Mutual Fund |
| 100043 | Aditya Birla Sun Life Liquid Fund-Institutional (Growth) | Aditya Birla Sun Life Mutual Fund |
| 101316 | Aditya Birla Sun Life Savings Fund-Retail Growth | Aditya Birla Sun Life Mutual Fund |
| 101970 | Aditya Birla Sun Life Money Manager Fund - RETAIL - WEEKLY I | Aditya Birla Sun Life Mutual Fund |
| 101971 | Aditya Birla Sun Life Money Manager Fund - Retail Growth | Aditya Birla Sun Life Mutual Fund |
| 103176 | Aditya Birla Sun Life Banking & PSU Debt Fund - Retail Plan- | Aditya Birla Sun Life Mutual Fund |
| 103191 | Aditya Birla Sun Life Low Duration Fund -INSTITUTIONAL - DAI | Aditya Birla Sun Life Mutual Fund |
| 103195 | Aditya Birla Sun Life Low Duration Fund - Institutional Plan | Aditya Birla Sun Life Mutual Fund |
| 105881 | Aditya Birla Sun Life Savings Fund-Weekly - retail IDCW | Aditya Birla Sun Life Mutual Fund |
| 106157 | Aditya Birla Sun Life Banking & PSU Debt Fund  - retail - qu | Aditya Birla Sun Life Mutual Fund |
| 109108 | Aditya Birla Sun Life Savings Fund-Retail - Daily IDCW | Aditya Birla Sun Life Mutual Fund |
| 110490 | Aditya Birla Sun Life Banking & PSU Debt Fund  - retail - mo | Aditya Birla Sun Life Mutual Fund |
| 111848 | Aditya Birla Sun Life Dynamic Bond Fund-Discipline Advantage | Aditya Birla Sun Life Mutual Fund |
| 112014 | Aditya Birla Sun Life Liquid Fund- Discipline Advantage Plan | Aditya Birla Sun Life Mutual Fund |
| 122649 | Aditya Birla Sun Life Floating Rate Fund-RETAIL - WEEKLY IDC | Aditya Birla Sun Life Mutual Fund |
| 122650 | Aditya Birla Sun Life Floating Rate Fund-Retail Plan-Growth | Aditya Birla Sun Life Mutual Fund |

**Source:** AMFI NAVAll (official daily NAV file). Distinct *funds* (canonical, variants collapsed) ≈ 5,600.
Counts are scheme-plan-option codes — AMFI's own unit of listing.
