# AMC Implementation Roadmap & Layout Catalog

Industry Coverage Expansion Mission 1 (roadmap) + Mission 3 (catalog) + Mission 8 (layout-family
evidence). Three real AMCs live as of 2026-07-19: SBI (152 schemes), HDFC (241), ICICI Prudential
(580) — 973 total, 6.84% of the ~14,224-scheme universe, up from 2.76% before this session.

## Mission 1 — Prioritized roadmap

Ranked by real, queried scheme count (`frontend/app/data/funds.json`, not estimated) — the
strongest available proxy for investor relevance and catalog complexity, since a verified
per-AMC AUM figure isn't in the product's own data yet (SEBI/AMFI's public monthly report has
no AMC-level AUM breakdown — see `docs/DATA_ACQUISITION_ROADMAP.md`). Ease-of-automation and
factsheet-quality columns are evidence-based only for the three AMCs actually attempted; every
other row is unverified until someone does the same discovery pass.

| Rank | AMC | Real scheme count | Status | Fetch mechanism | Notes |
|---|---|---:|---|---|---|
| 1 | ICICI Prudential | 2,491 | **Done** (580 matched, 23.3%) | Direct fetch works — listing page is JS-driven (WAF) per `playwright_fetch.py`, but the combined PDF itself is on an unprotected path, found via web search | Largest catalog by far; one page per scheme, 75 fund families found in the combined PDF (not all 2,491 schemes trace to a current fund — see "Real coverage math" below) |
| 2 | Nippon India | 1,865 | Not attempted | Unknown — `playwright_fetch.py` already flags this AMC as WAF-protected, same tier as HDFC/ICICI/Axis | Natural next candidate by scheme count |
| 3 | UTI | 1,362 | Not attempted | Unknown | |
| 4 | Kotak Mahindra | 910 | Not attempted | Unknown | |
| 5 | HDFC | 565 | **Done** (241 matched, 42.7%) | Direct fetch works, same WAF-listing-page/unprotected-file pattern as ICICI | Highest per-scheme match rate of the three so far |
| 6 | SBI | 525 | **Done** (152 matched, 29.0%) | Direct fetch works, no WAF on this AMC's factsheet pages at all | The only AMC using one-PDF-per-scheme instead of a combined document |
| 7 | Aditya Birla Sun Life | 461 | Not attempted | Unknown | |
| 8 | Bandhan | 431 | Not attempted | Unknown | |
| 9 | Axis | 410 | Not attempted | `playwright_fetch.py` already flags this AMC as WAF-protected | |
| 10 | Tata | 401 | Not attempted | Unknown | |
| — | DSP, Franklin Templeton, Mirae Asset, Canara Robeco, and 41 others | 3,824 combined | Not attempted | Unknown | Brief's remaining named candidates; no real evidence yet either way |

**Real coverage math, stated honestly:** 973/14,224 = 6.84% of all schemes, but this is not the
same as "6.84% of AMCs are done." It's 3 of 51 real AMCs, weighted toward the largest ones by
design (ICICI alone is 17.5% of the entire universe's scheme count) — the roadmap above
deliberately keeps optimizing for AUM/scheme-count leverage per new AMC, not AMC count.

## Mission 3 — Layout catalog

| | SBI | HDFC | ICICI Prudential |
|---|---|---|---|
| **Download mechanism** | Direct fetch, no protection | Listing page WAF-blocked; PDF file itself unprotected (found via web search) | Same as HDFC |
| **Document structure** | One PDF per scheme (41 curated URLs) | One combined PDF, every active scheme | One combined PDF, every active scheme |
| **Page organization** | N/A — one fetch, one scheme | Multi-page per scheme possible ("Contd from previous page" marker) | **One page = one scheme**, always — a third, distinct topology (verified: 75/75 real scheme pages self-contained, zero continuation cases found) |
| **Scheme identification anchor** | N/A (whole document is one scheme) | Section header + "CATEGORY OF SCHEME" marker | Sentence pattern: `"Returns of {name} - Growth Option as on {date}"` — not a labeled header at all |
| **Benchmark anchor** | Positional regex scan, no label (`(?:S&P BSE\|NIFTY\|CRISIL)...Index`) | Labeled: `"#BENCHMARK INDEX\n{value}"` | **Two distinct real anchors on the same AMC**: labeled `"Benchmark\n{value}"` on schemes with the sidebar layout, `"{value} (Benchmark)"` returns-table row label on schemes without it |
| **Fund manager anchor** | Anchor-free heuristic (`Mr./Ms. X & Mr./Ms. Y` line, requires `&` to avoid a known solo-name ambiguity) | Labeled table (`"FUND MANAGER ¥\nName Since Total Exp\n{rows}"`) | Name immediately followed by `"(Managing this fund since ...)"` — same line for multi-manager schemes, next line for single-manager (found by testing all 75 pages, not one sample) |
| **AUM** | One figure, positional (`"{amount} Crores"`, last match in block) | One figure, labeled (`"ASSETS UNDER MANAGEMENT... ₹{amount} Cr"`) | **Two figures**, both labeled: "Closing AUM" and "Monthly AAUM" — a real distinction neither SBI nor HDFC's document exposes |
| **Expense ratio** | Not extractable as text (confirmed) | Labeled, extractable (`"Regular: X% Direct: Y%"`) | **Not extractable as text** (confirmed via full-page regex scan) — only a footnote reference exists, the figure itself appears to render as a graphic |
| **Riskometer** | Extractable (`"at {level} risk"`) | **Not extractable** — cross-references an unlinked glossary section | Extractable (`"The risk of the scheme is {level}"`) — same real field, third distinct anchor phrasing |
| **Inception date format** | `DD/MM/YYYY` | `Month DD, YYYY` | **`DD-Mon-YY`, 2-digit year** — a genuinely new format found here, added to `extract.py`'s shared `DATE_FORMATS` |
| **Minimum investment** | Not found | Not found | **Found**: `"Application Amount for fresh Subscription : Rs. {amount}"` — the first AMC of three to expose this |
| **Minimum SIP** | Not found | Not found | Not found (checked specifically — no distinct labeled SIP-minimum figure separate from lumpsum) |

## Mission 8 — Evidence for layout families (not yet enough — 3 of the brief's minimum 5-8)

Per the brief's own instruction, no layout family is being proposed yet. What the evidence says
so far:

- **"Combined PDF, one page per scheme" is now confirmed across 2 of 3 AMCs (HDFC, ICICI)** —
  though even within that pair, HDFC needs continuation-page merging and ICICI never does. Not
  yet safe to call these the "same family" — the *topology* rhymes, the *page-to-scheme mapping*
  doesn't.
- **No two AMCs share an extraction anchor for any field.** Benchmark, AUM, manager, riskometer,
  expense ratio, and inception date each use a different label, position, or presence/absence
  pattern per AMC. Zero evidence yet that a shared *anchor* pattern exists beyond the
  already-extracted shared *value-parsing* primitives (percentage/currency/date conversion,
  wired in this same session's Mission 2 of the prior brief).
- **What's now shared across all 3, genuinely (not just structurally similar):** the
  `parse_date_string()`/`parse_numeric_string()` value converters in `extract.py`, the
  `_match_and_collect()` AMFI-matching step in `scripts/ingest_factsheets.py`, `normalize.py`'s
  `validate()`/`completeness()`, and `provenance.py`'s recording — all genuinely AMC-agnostic,
  proven by requiring zero changes across three real integrations.
- Recommendation unchanged from the prior audit: two or three more real AMCs (ideally including
  at least one non-equity-heavy AMC and one from the WAF-protected tier already flagged in
  `playwright_fetch.py`) would meaningfully test whether "combined PDF, one page per scheme" is a
  real family boundary or a coincidence of two data points.

## Mission 6 — Coverage improvement, before/after (this session)

| Field | Before (2 AMCs, 393 rows) | After (3 AMCs, 973 rows) |
|---|---:|---:|
| Scheme rows | 393 (2.76% of universe) | 973 (6.84% of universe) |
| AUM | 393/393 | 973/973 |
| Riskometer | 152/393 (SBI only) | 684/973 — ICICI adds 532 real new values |
| Fund Manager | 249/393 | 823/973 |
| Minimum Lumpsum | 0/393 | 494/973 — first AMC to expose this field at all |
| Exit Load | 241/393 | 726/973 |
| Benchmark | 375/393 | 750/973 |
| Expense Ratio | 241/393 (HDFC only) | 241/973 — unchanged; ICICI genuinely doesn't expose this as text |

## Mission 9 — Production verification

Same discipline as the prior HDFC integration: real 3-AMC pipeline run (393 network fetches
total across SBI/HDFC/ICICI), full test suite (113 passed, 2 pre-existing unrelated failures —
confirmed via `git stash` control, not caused by this work), coverage audit re-run, provenance
backfilled against Neon production and verified with direct row-count queries (not assumed),
deployed via `production-refresh.yml` and confirmed live via `/api/freshness`'s
`deployedCommitSha`. Full detail: `docs/FACTSHEET_PLATFORM_AUDIT.md`.
