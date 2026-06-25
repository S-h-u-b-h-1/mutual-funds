# MF Pulse — AMC Factsheet Acquisition Strategy (Phase 1)

How to legitimately acquire each AMC's monthly factsheet for parsing. Two acquisition tiers:
**(A) direct URL** (curl/requests — fast, no browser) and **(B) Playwright** (headless
browser for JS-generated links). Verified June 2026.

| AMC | Factsheet host | Direct PDF? | Pattern / mechanism | Tier | Anti-bot |
|---|---|---|---|---|---|
| **SBI** | sbimf.com/docs/default-source/scheme-factsheets/ | ✅ **yes** | `sbi-<slug>-factsheet-.pdf` (per-scheme) + dated consolidated | **A — done (52 codes)** | none on CDN |
| HDFC | hdfcfund.com/information/downloads | ❌ | JS-rendered link list | B | moderate |
| ICICI Prudential | icicipruamc.com/news-and-update/factsheet | ❌ | JS list; CDN deep links | B | moderate |
| Nippon India | mf.nipponindiaim.com/.../factsheet | ❌ | JS list | B | moderate |
| Axis | axismf.com/factsheet | ❌ | JS list | B | moderate |
| Kotak | kotakmf.com | partial | dated PDF on CDN | A/B | low |
| DSP | dspim.com | partial | dated PDF | A/B | low |
| Mirae Asset | miraeassetmf.co.in/.../factsheet | ❌ (HTML on direct) | JS list | B | low |
| Motilal Oswal | motilaloswalmf.com | partial | dated PDF | A/B | low |
| Aditya Birla SL | mutualfund.adityabirlacapital.com | ❌ | JS list | B | moderate |
| UTI | utimf.com | partial | dated PDF | A/B | low |
| Franklin Templeton | franklintempletonindia.com | ❌ | JS list | B | moderate |
| Canara Robeco | canararobeco.com | ❌ (HTML on direct) | JS list | B | low |
| Tata | tatamutualfund.com | ❌ | JS list | B | moderate |
| HSBC | assetmanagement.hsbc.co.in | ❌ | JS list | B | moderate |

## What's proven
- **SBI is fully solved via Tier A** — `sbimf.com` serves per-scheme factsheet PDFs at a
  predictable slug pattern with no anti-bot; 19 equity-fund URLs verified, 52 scheme codes
  ingested with real metadata.
- The **consolidated** SBI PDF is current (March 2026) but **multi-scheme tabular** — pypdf
  flattens columns, so values cannot be attributed to a scheme confidently. Not used (would
  risk mis-attribution = fabrication). Per-scheme PDFs are the reliable SBI source.

## Tier-B plan (other AMCs)
- `ingestion/factsheet/playwright_fetch.py` implements the headless acquisition (launch,
  navigate, locate factsheet link, download, validate `%PDF`, save, record source URL) with
  retries, throttling, UA rotation, timeouts. Requires `pip install playwright` +
  `playwright install chromium` — runs in CI, not in this sandbox.
- Once a Tier-B AMC's PDF is acquired, it needs a **per-AMC parser** tuned to that AMC's
  layout (as the SBI adapter is) — the framework + normalizer + validation are shared.

## robots / legal
Factsheets are public investor disclosures; acquisition is polite (throttled, UA set,
single monthly fetch). No login/paywall is bypassed. Source URL + date stored per row.
