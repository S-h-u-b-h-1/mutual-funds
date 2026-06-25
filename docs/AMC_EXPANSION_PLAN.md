# MF Pulse — AMC Expansion Plan (Phase 1)

Prioritising factsheet ingestion by industry relevance and **parse feasibility** (the real
constraint). Acquisition is necessary but not sufficient — the PDF layout determines whether
data can be attributed to a scheme without mis-attribution.

## Tier 1 (largest AUM, ~40% of industry)
| AMC | ~AUM | Equity schemes | Acquisition | Layout | Parse feasibility |
|---|---|---|---|---|---|
| **SBI** | ~₹11L cr | ~30 | ✅ direct CDN, per-scheme PDFs | **clean single-scheme** | **DONE — 52 codes** |
| ICICI Prudential | ~₹9L cr | ~35 | CDN PDF likely | consolidated | medium-hard |
| HDFC | ~₹8L cr | ~30 | ✅ direct CDN (`files.hdfcfund.com`) | **consolidated, data split across pages** | hard (needs positional extraction) |
| Nippon India | ~₹6L cr | ~30 | CDN PDF likely | consolidated | medium-hard |

## Tier 2
| AMC | ~AUM | Acquisition | Parse |
|---|---|---|---|
| Axis | ~₹3L cr | Playwright | per-AMC adapter |
| Kotak | ~₹4L cr | partial direct | per-AMC adapter |
| DSP | ~₹2L cr | partial direct | per-AMC adapter |
| Mirae Asset | ~₹2L cr | Playwright | per-AMC adapter |

## Tier 3
Aditya Birla SL, UTI, Franklin Templeton, Canara Robeco, Tata, HSBC — smaller AUM share;
Playwright acquisition + per-AMC adapter each.

## The real bottleneck (verified this cycle)
- **SBI is solved** because it publishes **clean single-scheme PDFs** — one scheme per
  document, label/value columns that targeted regex extracts reliably. 52 codes ingested.
- **HDFC's consolidated PDF was fetched** (current Jan-2026, 136 pages) but its per-scheme
  data is **split across cover + portfolio + performance pages** with heavy boilerplate;
  pypdf's flattened text cannot attribute benchmark/AUM/TER/manager to a scheme confidently.
  Parsing it would require **positional extraction** (pdfplumber/camelot with coordinates),
  which does not install on Python 3.14 — or per-AMC heuristics that risk mis-attribution.
- Decision: **acquisition proven for Tier-1; reliable parsing of consolidated layouts is the
  gated next step.** We will not ship mis-attributed Tier-1 data (the same discipline that
  rejected SBI's foreign co-manager as "the manager").

## Highest-ROI path forward
1. **Find clean per-scheme PDFs** for ICICI/Nippon (as SBI has) — if they exist, they parse
   like SBI with a thin adapter.
2. Otherwise, run on a **Python 3.13 worker** (the GitHub Actions cron already targets 3.13)
   where `pdfplumber`/`camelot` install, and write positional per-AMC parsers for the
   consolidated layouts.
3. Each new AMC reuses the shared framework (normalize, validate, lineage, ingest) — only the
   extraction layer is per-AMC.

## Metadata potential
At ~30 equity schemes × ~4 plans per Tier-1 AMC, each AMC ≈ 120 scheme codes. Four Tier-1
AMCs ≈ 480 codes ≈ ~6% of active schemes — concentrated in the funds investors actually
research (highest-AUM). Tiers 2–3 add the long tail.
