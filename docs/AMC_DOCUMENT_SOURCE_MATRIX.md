# AMC Document Source Matrix

Provenance Mission Phase 2. Per-AMC, per-document-type source locations. The honest headline:
**only one cell in this entire matrix has ever been fetched and verified — SBI's factsheet PDF
column.** Every other cell is either a captured-but-unverified URL or genuinely not yet
researched. This document exists so that fact is visible and trackable, not hidden inside four
different scripts.

## Legend

- ✅ **[VERIFIED]** — fetched successfully in this codebase; URL/pattern recorded in
  `data/warehouse/source_files.jsonl` with a SHA-256 of the actual downloaded bytes.
- 🟡 **[CAPTURED, unverified]** — a specific URL or portal pattern exists in the codebase
  (`ingestion/factsheet/playwright_fetch.py`'s `PORTALS`, or `docs/AMC_FACTSHEET_AUDIT.md`'s
  landing-page column) but has not been confirmed to actually resolve/fetch in this environment.
- ⚪ **[not yet researched]** — no URL, pattern, or prior attempt exists in this codebase for
  this cell. Not the same as "doesn't exist" — it means nobody has looked yet.

## P1 tier (largest AUM — per `docs/AMC_FACTSHEET_AUDIT.md`)

| AMC | Factsheet PDF (per-scheme or consolidated) | Monthly portfolio disclosure (XLS/XLSX) | SID / KIM | Scheme HTML page |
|---|---|---|---|---|
| SBI Mutual Fund | ✅ Per-scheme, directly-fetchable: `sbimf.com/docs/default-source/scheme-factsheets/sbi-<slug>-factsheet-.pdf` — 37 URLs curated and fetched (`scripts/ingest_factsheets.py`'s `SBI_FUNDS` map), 12 more resolved via a suffixed contra-fund URL. Real SHA-256 + byte size recorded per file in `data/warehouse/source_files.jsonl`. | ⚪ | ⚪ | ⚪ |
| HDFC Mutual Fund | 🟡 Consolidated PDF landing page `hdfcfund.com/information/downloads` (`playwright_fetch.py`); a 136-page consolidated PDF was fetched once during a prior session (per `docs/FACTSHEET_INGESTION_REPORT.md`) but never successfully attributed per-scheme | ⚪ | ⚪ | ⚪ |
| ICICI Prudential Mutual Fund | 🟡 `icicipruamc.com/news-and-update/factsheet` (`playwright_fetch.py`) — JS-gated, never fetched in this environment | ⚪ | ⚪ | ⚪ |
| Nippon India Mutual Fund | 🟡 `mf.nipponindiaim.com/investor-service/downloads/factsheet` (`playwright_fetch.py`) — JS-gated, never fetched | ⚪ | ⚪ | ⚪ |

## P2 tier

| AMC | Factsheet PDF | Monthly portfolio disclosure | SID / KIM | Scheme HTML page |
|---|---|---|---|---|
| Kotak Mahindra | ⚪ (landing domain named in `AMC_FACTSHEET_AUDIT.md`: kotakmf.com — no specific URL captured) | ⚪ | ⚪ | ⚪ |
| Axis Mutual Fund | 🟡 `axismf.com/factsheet` (`playwright_fetch.py`) — never fetched | ⚪ | ⚪ | ⚪ |
| Mirae Asset | ⚪ (domain named only: miraeassetmf.co.in) | ⚪ | ⚪ | ⚪ |
| Motilal Oswal | ⚪ (domain named only: motilaloswalmf.com) | ⚪ | ⚪ | ⚪ |
| DSP | ⚪ (domain named only: dspim.com) | ⚪ | ⚪ | ⚪ |
| Aditya Birla Sun Life | ⚪ (domain named only: mutualfund.adityabirlacapital.com) | ⚪ | ⚪ | ⚪ |

## P3 tier

| AMC | Factsheet PDF | Monthly portfolio disclosure | SID / KIM | Scheme HTML page |
|---|---|---|---|---|
| UTI | ⚪ (utimf.com) | ⚪ | ⚪ | ⚪ |
| Franklin Templeton | ⚪ (franklintempletonindia.com) | ⚪ | ⚪ | ⚪ |
| Canara Robeco | ⚪ (canararobeco.com) | ⚪ | ⚪ | ⚪ |
| Tata | ⚪ (tatamutualfund.com) | ⚪ | ⚪ | ⚪ |
| HSBC | ⚪ (assetmanagement.hsbc.co.in) | ⚪ | ⚪ | ⚪ |
| Invesco | ⚪ (invescomutualfund.com) | ⚪ | ⚪ | ⚪ |

## What this matrix means for sequencing

The "Monthly portfolio disclosure," "SID/KIM," and "Scheme HTML page" columns are **entirely
empty across every AMC, including SBI** — this platform has never once ingested the *full*
monthly holdings disclosure (only the factsheet's abbreviated top-10), never ingested a SID/KIM
(the actual source-of-record for exit load, lock-in, and minimum investment amounts), and never
ingested an AMC scheme HTML page. This is a bigger gap than "3 more AMCs need adapters" — it's
that 3 of the 4 document types this register names as sources have never been attempted for any
AMC. Phase 5's pilot should deliberately exercise at least one non-factsheet document type (the
portfolio-disclosure spreadsheet, per the mission's own AMC-selection guidance), not just add a
second and third AMC through the same single document type already proven for SBI — otherwise
the platform would still not know whether its architecture can handle XLS/XLSX or HTML sources
at all.
