# AMC Adapter Roadmap — MF Pulse

Prioritized plan to extend factsheet/portfolio metadata beyond SBI. Tiers are ranked by AUM /
investor reach. "Coverage" = expected metadata fields once the adapter is live.

## Status today
- **SBI**: live adapter, 152 schemes populated (AUM, riskometer, sector, launch, benchmark; manager/holdings partial; **TER not yet extracted**).
- HDFC / ICICI / Nippon: adapter scaffolds exist (`ingestion/factsheet/adapters/`), parsing **blocked** on `pdfplumber`/`camelot` (Py3.13 worker required).
- All other AMCs: backlog.

## Tier 1 — highest impact (largest AMCs)
| AMC | Acquisition method | Parser strategy | Validation rules | Expected fields | Automation |
|---|---|---|---|---|---|
| **HDFC** | Consolidated monthly factsheet PDF (site) | `pdfplumber` page-region + table extract per scheme | TER 0–3%, AUM>0, holdings sum≈100% | TER, AUM, manager, riskometer, holdings, sectors | 🔴 needs Py3.13 worker |
| **ICICI Prudential** | Consolidated factsheet PDF | `camelot` lattice tables + text regex | same | TER, AUM, manager, riskometer, holdings | 🔴 needs Py3.13 worker |
| **SBI** | Per-scheme factsheet PDF (clean) | `pypdf` text + regex (live) | TER 0–3%, AUM>0 | **+ TER, exit load** (parser fix) | 🟢 fixable now |
| **Nippon India** | Consolidated factsheet PDF | `pdfplumber` tables | same | TER, AUM, manager, holdings | 🔴 needs Py3.13 worker |

## Tier 2
| AMC | Method | Parser | Expected | Automation |
|---|---|---|---|---|
| Axis | Per-scheme + consolidated PDF | `pdfplumber` | TER, AUM, manager, holdings | 🟡 |
| Kotak | Consolidated PDF | `pdfplumber` | TER, AUM, manager | 🟡 |
| DSP | Consolidated PDF | `pdfplumber` | TER, AUM, holdings | 🟡 |
| Mirae Asset | Per-scheme PDF | `pypdf` text | TER, AUM, manager | 🟢 likely parseable now |

## Tier 3
Aditya Birla Sun Life · UTI · Franklin Templeton · Tata · HSBC · Canara Robeco — consolidated PDFs,
`pdfplumber`/`camelot`, scheduled after Tier 1/2 worker exists.

## Cross-cutting automation plan
1. **Stand up a Python 3.13 CI worker** (`pdfplumber`, `camelot-py`, `ghostscript`) — unblocks all
   consolidated-PDF AMCs. This single dependency unblocks Tier 1 HDFC/ICICI/Nippon (~40% of industry AUM).
2. **Fix the SBI TER regex** (data already in hand) — quickest win, no new infra.
3. **Add per-scheme adapters for Mirae/Axis** (per-scheme PDFs parse with `pypdf` on 3.14).
4. Every parsed value flows through the metadata quality engine (source, URL, date, parser version,
   checksum, confidence) — see Phase 4. Validation rules reject out-of-band values rather than store them.

## Feasibility summary
- **Now, no new infra:** SBI TER fix, Mirae/Axis per-scheme adapters → raises factsheet coverage
  from 152 toward ~600–900 schemes (the per-scheme-PDF AMCs).
- **Needs Py3.13 worker:** HDFC/ICICI/Nippon/Kotak/DSP/Tier-3 → the path to >60% metadata coverage.
- **No vendor data, no fabrication** — every field traces to an official AMC document.
