# Product Audit & PMF Backlog — 2026-07-01

Phase 1 audit: 12 pages read end-to-end (homepage, fund page, AMC page, AMC Intelligence,
signals list, Morning Brief, research hub, compare, analytics, categories, screener, search),
each scored against: why open it, what decisions it enables, what's missing/duplicated,
what to remove/promote. Full raw findings: workflow run `wf_9af4f3ad-de6`.

## Shipped this sprint (implemented, tested, built)

| Item | Where | Why |
|---|---|---|
| Sitewide real-time freshness/market-status strip | `lib/marketStatus.js` + `Nav.jsx`, every page | Phase 3 — never appear static; honest weekend/staleness copy, zero extra network cost |
| Genuine data refresh (asOf 06-23 → 06-30) | `data/NAVAll.txt` + rebuild | The bundle was 8 days stale in production; refreshed against the live AMFI feed |
| **Data-quality bug fix**: long-window returns (r6m/r1y/r3y/r5y) computed against a stale "now" NAV for 19 dormant funds | `scripts/build_performance.py` | Found via the fresh refresh — a mislabeled-window bug, not a display bug. Permanent regression test added |
| `gradeTone` duplication → correctness risk | `amcIntel.js` now owns AMC-scale grading (A/B+/B/C/D/E), fund page owns fund-scale (A/B/C/D/E) | The audit flagged this as "duplicate" but the two scales differ — blindly merging would have misclassified AMC grade B+ as negative. Fixed by giving each scale one owner instead |
| Fund page: Executive Summary promoted above the fold | `fund/[scheme_code]/page.js` | Was "Research summary", buried at the bottom; now first thing after the header |
| Fund page: Completeness moved to the end | same | Matches the explicit Phase-5 order (Documents → Completeness → Freshness last) |
| Fund page: Documents section (real factsheet link when acquired) | same | Previously only a tiny footnote; now a real section, honestly empty when no document exists |
| Fund page: duplicate freshness badge removed | same | Two identical badges said the same thing twice |
| Real rolling-30d-volatility chart | `components/VolatilityChart.jsx` | Genuine new Phase-6 chart computed from the same daily NAV series already fetched — not fabricated, not a single-point "trend" |
| Homepage: Category Rotation panel | `page.js` | Real data (`daily.categoryRotation`) computed since an earlier sprint but never surfaced |
| Homepage: TrustBar removed | `page.js` | Now redundant with the sitewide Nav freshness strip |
| Homepage: sample flow visuals collapsed by default | `page.js` | Clearly-labelled sample data shouldn't compete with real intelligence above the fold |

## Explicitly rejected (audit suggestion checked and found wrong or unnecessary)
- **Search "14,000+ schemes" copy** — audit called this an overclaim citing `limit=300`. Verified: `limit=300` caps *results per query*, not the searchable universe, which genuinely is 14,224 (proven in the coverage sprint). Copy is accurate; left unchanged.
- **IDCW returns gating on the fund page** — audit suggested adding a gate. Verified: `build_performance.py` already nulls all IDCW returns at the source, so `visibleReturns()` already renders "Insufficient history" for IDCW funds. Already correct.

## Deferred (real, but out of scope for this pass — schema changes or blocked on data)
| Item | Why deferred |
|---|---|
| Analytics: `v_top_funds_viewed`/`v_top_categories_viewed` sections | Requires new Supabase SQL views — schema change, needs separate review |
| Compare page: multi-year returns, flow signals row, health score column | Real, valuable; moderate effort — next sprint |
| AMC page ↔ AMC Intelligence page consolidation | Genuine overlap flagged by 3 auditors; resolving cleanly (merge vs. cross-link) is a design decision, not a mechanical fix — flagged for product review rather than an autonomous merge/delete of a shipped page |
| `short()` fund-name-truncation helper deduped across 4 files | Real but low-risk/low-value style duplication; not touched this pass |
| Per-AMC expense-ratio comparison, manager-tenure, category AUM totals | Blocked on factsheet metadata (SBI-only today) — see `AMC_ADAPTER_ROADMAP.md` |
| Score-trend charts (Health/Attention/Rank history) | **Deliberately not built.** Only ONE historical snapshot date exists in the warehouse — a "trend" chart with one data point would be empty or misleading. Will populate honestly as the daily snapshot cron accumulates history |
| Benchmark-index return comparison (tracking error/alpha vs. actual index NAV) | Needs an index NAV series we don't ingest yet — documented, not fabricated |

## Cross-page duplication still present (lower severity, catalogued not fixed)
- Sample-flow-data disclosure text repeated verbatim across brief/signals/research/data-quality pages.
- Signal cards rendered near-identically on homepage, `/signals`, and Morning Brief.
- Category leaderboard table structure repeated on `/categories` and `/performance`.

None of these are misleading or incorrect — they're maintenance duplication, not trust bugs, so they were deprioritized behind the freshness/correctness fixes above.
