# MF Pulse — Market Universe & Analytical Readiness Audit

_As of 2026-06-23. Computed from AMFI NAVAll, funds.json (analytical layer), metadata.json, and MFAPI._

## Phase 1 — Market universe
| Source | Schemes |
|---|---|
| AMFI (NAVAll) | **14,224** |
| MFAPI | 37,647 |
| AMC factsheets ingested | 25 funds |
| MF Pulse analytical store | 8,671 |

- Active (NAV ≤7d): **8,611** · AMCs 51 · categories 47
- Active Direct Growth: **1,716** · Active Regular Growth: 1,780 · Active IDCW: 4,595
- ETF: 564 · Fund-of-Funds: 669 · Direct plans: 6,589 · Growth: 5,112 · IDCW: 7,524

## Phase 2 — Analytical readiness (of active universe)
| Class | Count | % of active |
|---|---|---|
| FULLY ANALYZABLE (1Y + risk + benchmark) | 2,329 | 27.0% |
| PARTIALLY (90D + risk) | 6,067 | 70.5% |
| MINIMALLY (latest NAV only) | 215 | 2.5% |
| UNANALYZABLE | 0 | 0.0% |

## Phase 3 — Coverage score
| Dimension | % of active |
|---|---|
| Universe (active/total) | 60.5% |
| NAV | 100.0% |
| Performance (90D) | 97.5% |
| Trend-ready (90D+) | 97.5% |
| Risk-ready (vol/drawdown) | 98.3% |
| Research-ready (1Y) | 90.1% |
| Institutional-ready (3Y) | 72.9% |
| Benchmark | 29.5% |
| Metadata (factsheet) | 0.6% |
| Portfolio (holdings/sectors) | 0.6% |

### **MF Pulse Coverage Score: 77.3/100**

## Phase 4 — Top gaps
**Missing metadata — top AMCs (active Growth schemes without factsheet data):**
| AMC | schemes |
|---|---|
| ICICI Prudential | 195 |
| Kotak Mahindra | 190 |
| Aditya Birla Sun Life | 186 |
| SBI | 182 |
| Nippon India | 180 |
| HDFC | 179 |
| Axis | 157 |
| Bandhan | 146 |
| UTI | 139 |
| DSP | 132 |

**Missing 1Y history — by category:**
| Category | schemes |
|---|---|
| Indexs | 192 |
| FoF Domestic | 132 |
| Sectoral/ Thematic | 131 |
| Other  ETFs | 67 |
| Credit Risk | 43 |
| Multi Asset Allocation | 28 |
| Liquid | 26 |
| Overnight | 24 |

## Phase 5 — AMC integration ROI
Ranked by active Growth schemes currently lacking metadata (largest coverage lift per integration):
ICICI Prudential (195), Kotak Mahindra (190), Aditya Birla Sun Life (186), SBI (182), Nippon India (180), HDFC (179)

## Phase 6 — Remediation
- **Automatable now:** activate the daily NAV cron → accrues history so 3Y/5Y coverage rises over time; factsheet pipeline (monthly cron) expands metadata as per-AMC parsers land.
- **Blocked:** Tier-1 (HDFC/ICICI/Nippon) metadata needs positional PDF parsing on a Py3.13 worker (consolidated layouts) — see AMC_EXPANSION_PLAN.md. Real monthly flows remain SEBI-PDF-only.