# Metadata Source Map — MF Pulse

Where every metadata field legitimately comes from, how hard it is to acquire, and how we parse it.
This is the acquisition blueprint. Status reflects what is **live in MF Pulse today**.

Legend — Difficulty: 🟢 easy (structured feed) · 🟡 medium (PDF text) · 🔴 hard (PDF tables / per-AMC layout).
Status: ✅ live · 🟡 partial (SBI only) · ⛔ blocked (infra) · ◻️ backlog.

| Field | Primary source | Secondary source | Update freq | Difficulty | Parsing strategy | Status |
|---|---|---|---|---|---|---|
| Scheme name / AMC / category | AMFI NAVAll | mfapi.in `meta` | Daily | 🟢 | `;`-delimited parse | ✅ 100% |
| Asset class / sub-category | AMFI NAVAll (scheme-type headers) | SEBI categorization | Daily | 🟢 | header-state parse | ✅ 100% |
| Scheme structure (Open/Close/Interval) | AMFI NAVAll headers | — | Daily | 🟢 | header-state parse | ✅ 100% |
| **ISIN** | AMFI NAVAll (ISIN cols) | NSE/BSE listing | Daily | 🟢 | column parse | ✅ 98.8% |
| Latest NAV / NAV history | AMFI NAVAll + mfapi.in | AMC site | Daily | 🟢 | feed + API | ✅ 100% / 99% |
| Returns / risk / drawdown | Computed from NAV history | — | Daily | 🟢 | in-house engine | ✅ (investable) |
| Benchmark (category standard) | SEBI category map | AMC factsheet | Rare | 🟢 | static map | ✅ 40% univ. |
| Benchmark (fund-specific) | AMC factsheet / SID | KIM | Monthly | 🟡 | PDF text | 🟡 SBI |
| **Expense ratio (TER)** | AMC factsheet / AMC TER page | AMFI TER disclosure | Monthly | 🟡 | PDF text regex | ⛔ parser gap |
| **AUM** | AMC factsheet | AMFI monthly AAUM | Monthly | 🟡 | PDF text | 🟡 SBI (152) |
| **Fund manager / tenure** | AMC factsheet / SID | AMC website | On change | 🟡 | PDF text | 🟡 SBI sparse |
| Riskometer | AMC factsheet / SID | AMC website | Monthly | 🟡 | PDF text | 🟡 SBI (152) |
| Exit load / min SIP / min lumpsum | SID / KIM | AMC factsheet | On change | 🟡 | PDF text | ◻️ backlog |
| Investment objective | SID / KIM | AMC factsheet | Rare | 🟡 | PDF text | ◻️ backlog |
| Launch date | SID | mfapi.in first-NAV proxy | Once | 🟡 | PDF / first NAV | 🟡 SBI (152) |
| **Holdings** | Monthly portfolio disclosure | AMC factsheet | Monthly | 🔴 | PDF tables (camelot) | 🟡 SBI (26) |
| Sector / asset / market-cap allocation | Monthly portfolio disclosure | Factsheet | Monthly | 🔴 | PDF tables | 🟡 SBI sector only |
| Documents (Factsheet/SID/KIM/Annual) | AMC website | SEBI/AMFI | Monthly | 🟡 | fetch + checksum | 🟡 SBI links |

## Key constraints (honest)
- **Structured feeds (AMFI/mfapi) give identity + price + ISIN + structure for 100% of the universe** — already live.
- **Everything investor-grade beyond price (expense, AUM, manager, holdings, riskometer) lives in AMC PDFs.**
  SBI publishes clean per-scheme factsheets (parsed with `pypdf`). HDFC/ICICI/Nippon publish
  **consolidated** PDFs whose tables need `pdfplumber`/`camelot`, which do not install on the
  Python 3.14 dev sandbox (need a 3.13 worker). This is the single rate-limiter on universe-wide
  metadata, and it is infrastructure, not data availability.
- **Expense ratio is 0% even for SBI** — the data is in the SBI PDFs but the current parser regex
  doesn't capture the TER table. This is the highest-ROI parser fix (see ACQUISITION_BACKLOG).
- No field is ever estimated. A missing field is labelled "not yet acquired", never filled.
