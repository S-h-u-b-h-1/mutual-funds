# Portfolio Intelligence Engine

Deterministic analytics on top of the Portfolio Import Engine (`FRONTEND_INTEGRATION_REPORT.md`
covers the auth/sync integration this builds on; `sql/neon/003_investor_intelligence.sql` is the
schema). No AI anywhere in this engine — every number traces to a real `portfolio_holdings` row
and the same live fund data every other page reads (`funds.js`, `metadata.json`).

## Architecture

`app/lib/portfolioIntelligence/`:

- **`allocations.js`** — `consolidateByScheme` (merges multi-source rows for the same fund into
  one position — the single place this happens, so overlap detection and allocation math stay
  consistent with each other), `groupAllocation` (AMC/category/benchmark), `sectorAllocation`
  (sub-fund weighted, factsheet-sourced, partial coverage disclosed), `topHoldings`, `effectiveN`
  (inverse-Herfindahl).
- **`stockOverlap.js`** — underlying-stock exposure aggregated across funds via factsheet
  holdings data; shared by Phase A's "stock overlap" metric and Phase B's "duplicate stocks".
- **`scores.js`** — `qualityScore` (weighted average of each holding's existing `fundHealth()`
  score — not a new scoring system), `diversificationConcentrationScores` (same HHI-penalty shape
  as the existing single-fund `portfolio.js` score, applied portfolio-wide), `riskApproximation`
  (weighted-average volatility/drawdown — see Known Limitations), `healthScore` (composite, same
  weighted-parts-with-renormalization shape as `fundHealth.js`).
- **`analytics.js`** — Phase A orchestrator.
- **`overlapEngine.js`** — Phase B: duplicate funds/sectors/stocks/benchmarks/AMCs, exact
  percentages from real currentValue sums.
- **`exposureEngine.js`** — Phase C: maps 9 themes to the news engine's own `RULE_META` rule_ids
  and `SECTOR_MAP` (`marketImpact.js`) — not a parallel taxonomy. 3 requested themes (PSU, Budget,
  Elections) have no corresponding rule_id today and are honestly reported unavailable rather than
  estimated.
- **`healthReport.js`** — Phase D: assembles A+B+C into one deterministic JSON object, plus
  category-gap analysis (`missingCategories`/`researchOpportunities` — category-level only, never
  a specific fund name, per this project's standing compliance rule).

**API**: `GET /api/v1/portfolio/intelligence` — computes fresh from live holdings + live fund
data, persists an append-only `portfolio_metrics` row, one `portfolio_events` row per available
exposure theme, and a `portfolio_reports` row (`report_type: 'portfolio_health'`), then returns
the full report. Same `requireUser`/`unauthorized` auth convention as every other `/api/v1/*`
route.

## Known limitations

- **Volatility/expected drawdown are weighted-average approximations**, not a true portfolio
  figure — they don't account for the diversification benefit of imperfect correlation between
  holdings, so real portfolio risk is likely somewhat lower than reported. Computing the exact
  figure would require reconstructing a combined daily value series from `fact_nav_daily` across
  every holding; out of scope for this pass, clearly labeled via each response's `methodology`
  field rather than presented as more precise than it is.
- **Sector/stock-level metrics have partial coverage** — only funds with factsheet-sourced data in
  `metadata.json` (~152 of the full universe as of this build) contribute to `sectorAllocation`
  and `stockOverlap`. Every response using this data reports a `coveragePct` so a partial
  breakdown is never presented as complete.
- **3 of 12 requested exposure themes are unavailable** (PSU, Budget, Elections) — no rule_id in
  the news engine covers them yet. Adding coverage means extending `marketImpact.js`'s
  `RULE_META`/the Python ingestion rules first; this engine intentionally does not invent a
  parallel classification to fill the gap.
- **CSV parser column-name aliases are still best-effort** (carried over from the Portfolio Import
  Engine) — no verified real Groww/Coin/Kuvera/ET Money export was available while building
  either engine.

## Verification

137 automated checks across three suites, all passing against a live Neon database:
`scripts/test_portfolio_import.mjs` (37), `scripts/test_backend_sync.mjs` (46, full auth/sync/
alerts regression — confirms this work didn't break anything upstream), `scripts/test_portfolio_intelligence.mjs`
(54, covering Phase A analytics, Phase B overlap/duplicate detection, Phase C exposure mapping,
Phase D health report assembly, append-only persistence, and cross-user isolation). Full
production build (`npm run build`) clean.

## Ready for Antigravity UI integration?

The API contract (`GET /api/v1/portfolio/intelligence`) is stable and tested. No UI has been
built against it — that's explicitly out of scope for this engine (per this mission's "connect,
don't redesign" boundary from the earlier frontend integration). Antigravity can build against
this endpoint directly; the response shape is documented above and in `healthReport.js`'s
assembly of the final object.
