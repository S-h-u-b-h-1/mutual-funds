# Portfolio Metadata

Backend contract slice, 2026-07-24 priority brief, item 5/5 — the final item in this priority
brief. Before this slice, `revaluePortfolio()` already computed per-holding NAV freshness
(`navDate`, `stale`) internally, but discarded it: only the aggregate `staleHoldingCount`/
`latestNavCoveragePct` survived into `portfolioService.getPortfolio()`'s response, and even those
were scattered flat fields on `summary` rather than a coherent concept. Nothing anywhere told a
caller *when* a portfolio valuation was computed, *when* a user's holdings data was last
refreshed, or *which* specific NAV date a given holding's value reflects.

Code: [frontend/app/lib/invest/portfolioService.js](../frontend/app/lib/invest/portfolioService.js),
[frontend/app/lib/portfolioImport/normalizer.js](../frontend/app/lib/portfolioImport/normalizer.js)
· No schema migration — see §1 · Route: `GET /api/v1/invest/portfolio/data-quality` (new); also
folded into the existing `GET /api/v1/invest/portfolio` combined response.

## 1. Why no migration was needed

Every fact this slice surfaces already existed, computed or stored, before this slice — the gap
was entirely that it never reached an API response:

- **Per-scheme `nav`/`navDate`/`staleDays`** already live in `funds.json` (the same AMFI-derived
  dataset every fund-research page reads) and were already being read a SECOND time, internally,
  by `revaluation.js`'s own `revalueHolding()` — just never attached to the holding object itself.
- **`portfolio_holdings.imported_at`** already exists and is already selected by
  `holdingsRead.js`'s `getUserHoldings()` — just never aggregated into a "when was this user's
  data last refreshed" fact.
- **`funds.js`'s exported `asOf`** (the whole dataset's own last-refresh date) already exists as a
  module-level constant.

This slice is a "stop discarding data that's already being computed" fix, not new infrastructure
— consistent with how Provider Metadata's `plan`/`option` reused an existing `getFund()` lookup
rather than adding a new data source.

## 2. `navDate`/`staleDays` on every holding

`buildHolding()` in `normalizer.js` is the ONE shared enrichment point used by both the CAS-import
path and the read path (`holdingsRead.js`) — its own header comment already says so. Adding
`navDate: fund.navDate || null` and `staleDays: fund.staleDays ?? null` there was the only change
needed: it flows automatically through `consolidateByScheme()` (which spreads the first
holding's fields per scheme — safe here, since `nav`/`navDate`/`staleDays` are fund-level facts,
identical across every lot of the same scheme) into `computeAnalytics()`'s `holdings` array, and
from there into every existing consumer (`getPortfolio()`, `getPortfolioHoldings()`) with zero
other code changes. No test anywhere asserted an exact/closed shape on `buildHolding()`'s output
(confirmed by search before making this change), so this was a safe additive change.

## 3. `dataQuality` — a new top-level key, not merged into `summary`

`buildDataQuality(rawHoldings, unresolved, valuation)` returns:

```
{
  calculatedAt,          // ISO timestamp — when THIS response was computed
  datasetAsOf,            // funds.js's own asOf — the whole pipeline's last refresh, system-wide
  lastImportedAt,          // max(imported_at) across this user's holdings — their own data's recency
  navDateRange: { oldest, newest },  // the NAV-date span across this user's actual holdings
  staleHoldingCount,       // reused from revaluation.js's valuation.staleHoldingCount, not recomputed
  latestNavCoveragePct,    // reused from valuation.latestNavCoveragePct, not recomputed
  unresolvedCount,         // count of holdings whose scheme_code no longer resolves
}
```

Deliberately a **new top-level `dataQuality` key** on `getPortfolio()`'s response, not merged into
`summary` — `summary`'s shape is asserted with an exact-match (`toEqual`) test against the fixed
`EMPTY_SUMMARY` constant for the empty-portfolio case; folding freshness fields into it would have
forced a change to that existing, working contract for no real benefit, since freshness and
valuation are conceptually different things a UI would likely render in different places anyway
(a small "prices as of" badge vs. the headline numbers). `getPortfolioSummary()`'s own contract
(wrapped as `{ summary }` by its route) is completely untouched by this slice.

`unresolvedCount`/`staleHoldingCount`/`latestNavCoveragePct` are **reused, not recomputed** — they
come from the exact same `unresolved` array and `valuation` object `getPortfolio()` already
had in scope. Recomputing them a second way here would risk the two silently diverging later.

`dataQuality` is always a fully-shaped object, even for an empty portfolio (`calculatedAt`/
`datasetAsOf` are always present; the rest are `null`/`0`) — same reasoning as `EMPTY_SUMMARY`
being a real, present, zeroed object rather than `summary: null`.

## 4. Standalone endpoint

`getPortfolioDataQuality(userId)` + `GET /api/v1/invest/portfolio/data-quality` — for a UI that
wants a lightweight freshness check (e.g. a "prices as of" chip) without pulling the entire
combined `getPortfolio()` payload just to read one small object. Same pattern already used by
`getPortfolioAllocation`/`getPortfolioHoldings`: each portfolio concept has both a dedicated
getter and a place in the combined view.

## 5. What was deliberately NOT done in this slice

- **No historical freshness trend** — `dataQuality` describes the CURRENT instant only; no time
  series of "how fresh was my portfolio on past dates" is stored or exposed.
- **No per-user configurable staleness threshold** — `staleHoldingCount`'s definition
  (`staleDays > 3`) is `revaluation.js`'s own existing, fixed threshold; this slice doesn't add a
  way to change it per user or per fund category.
- **No push/alert on stale data** — surfacing the fact is in scope; deciding to notify a user
  because their portfolio is stale is not (would be new Notification Platform wiring, not a
  metadata contract).
- **No NAV-freshness SLA enforcement** — this slice reports staleness; it does not block, warn on,
  or refuse any action (an order, a redemption) because underlying data is stale.
- **"Day change" (today's value vs. yesterday's) was NOT added** — that needs a stored prior-day
  valuation to diff against, a genuinely different capability from *freshness of the current*
  valuation. See the roadmap doc's §2.6 "Day change" row for the explicit distinction.

## 6. Verification record

- `portfolioService.test.js`: the existing empty-state test extended to assert `dataQuality`'s
  honest empty shape (`calculatedAt`/`datasetAsOf` present, everything else `null`/`0`); one new
  test on a connected mock portfolio asserting every holding carries a real `navDate`/`staleDays`,
  `dataQuality.navDateRange` is a valid, ordered date range, and the standalone
  `getPortfolioDataQuality()` call matches the value folded into `getPortfolio()`.
- New `data-quality/route.test.js` (401 + wrapped-shape pass-through, same pattern as every other
  portfolio route test).
- Full regression suite re-run clean.
