# Stock Intelligence Platform Status

Canonical, honest status for the Stock Research & Investor Intelligence domain — mutual funds'
sibling product line (research/discovery/portfolio/watchlist for individual stocks, explicitly
NOT trading execution). Kept as its own document, separate from
[`SUASION_PLATFORM_STATUS.md`](SUASION_PLATFORM_STATUS.md), per the governing directive's own
instruction not to conflate the two domains' certification.

Same taxonomy as the sibling doc: **PASS** = verified working end-to-end against real data today.
**PARTIAL** = real and working for part of the surface, real gaps remain. **MOCK** = works against
mock/sandbox providers only, no live integration exists or can exist yet. **BLOCKED** = correct
design/code exists but cannot proceed without something outside this session's authority
(credentials, a human decision, a commercial agreement). **FAIL** = does not work or actively
misleads. A subsystem is never marked PASS merely because code exists — each verdict states what
was actually run/checked and when.

**Snapshot date: 2026-08-01.** Written immediately after shipping the first real frontend page
(`/stocks/[id]`, commit `7908d1e`) and verifying it against the actual `mf-pulse.vercel.app`
production domain — not just a preview URL, per this project's own repeated history of that
distinction mattering. **Updated same day** after the user explicitly authorized applying
migration 035 to production (see §1) — every section below reflects the post-migration,
post-re-point state, confirmed against the live domain, not the mid-pass state this doc originally
described.

---

## 1. Database schema & migration

**Status: PASS — applied to production 2026-08-01, with explicit user authorization.**

`sql/neon/035_stock_intelligence_foundation.sql` defines all 26 tables this domain needs
(`companies` and its sector/industry/identifier-history/exchange-listing/profile satellites,
financial statements + line items, valuation snapshots, company events + results calendar,
operational metrics + sector templates, commodities + company exposure, stock holdings/
transactions, watchlists/watchlist items, alerts, research notes + versions). Already applied and
verified on the Neon **test** branch (see §2); was deliberately left unapplied to production
pending an explicit decision — production database schema changes are a different class of action
than a code push (not trivially reversible), and this project has consistently treated every prior
migration (033/034/035) the same way. Asked the user directly rather than deciding unilaterally;
**authorized to proceed**, applied the same day.

**Applied via the same two-step procedure already proven on the test branch**: (1) all 60
`CREATE TABLE`/`CREATE INDEX`/`COMMENT` statements in one `run_sql_transaction` call against the
production branch (`br-raspy-glitter-atut1ur7`) — confirmed by 60/60 empty successful result sets,
the expected signature for DDL; (2) a single `INSERT INTO schema_migrations` recording it
(`applied_by='claude-manual-mcp'`, real SHA-256 checksum, `on conflict (filename) do nothing`),
matching the exact ledger convention 033/034/035-on-test already use. One real bug caught and fixed
*before* touching production: a naive semicolon-based statement splitter broke the file's own
`comment on column companies.isin is '...available; nullable...'` in two, because that string
literal contains a semicolon — rewritten as a string-literal-aware splitter (tracks `'...'`
boundaries, treats `''` as an escaped quote) before it ever ran against real infrastructure.

**Verified end-to-end against the live domain, not just "the SQL didn't error"**:
```
GET https://mf-pulse.vercel.app/api/v1/stocks?limit=1  →  200  {"companies":[]}
GET https://mf-pulse.vercel.app/stocks/00000000-...     →  200, "This page could not be found"
```
An empty array, not an error — exactly the honest, zero-companies-seeded state this domain is
supposed to be in right now. (The not-found page returning HTTP 200 instead of 404 is a real,
separately-flagged issue — but confirmed pre-existing and site-wide, reproducing identically on
the long-established `/fund/[nonexistent]` route, not something this migration or this pass
introduced. Tracked separately, not blocking.)

Core MF pages spot-checked immediately after (homepage, `/funds`, `/api/freshness`) all still
`200`/green — this migration is additive-only and touched zero existing tables, but verified
anyway rather than assumed.

---

## 2. Backend service layer (`frontend/app/lib/stocks/`)

**Status: PASS — engineering complete, verified against real Neon (test branch) today.**

13 service modules: `companyService`, `companyProfile`, `financialStatements`, `metrics`,
`valuation`, `timeline`, `screener`, `sectors` (+ `sectorMetricSeeds`), `providers/` (commodity
provider interface + mock), `commodityService`, `portfolioService`, `watchlistService`,
`alertService`, `researchNoteService`, plus shared `testHelpers`. Re-run in full this pass:

```
Test Files  15 passed (15)
     Tests  116 passed (116)
  Duration  18.67s (transform), 86.84s (tests) — real Neon integration tests, zero mocked DB
```

Design properties verified by reading the code, not just by tests passing: canonical company
identity with rename-safe history (a rename UPDATEs and logs history, never inserts a duplicate
company); one centralized derived-metrics engine (`metrics.js`) with a load-time self-check that a
metric can only reference a field that actually exists in `financialStatements.js`'s
`LINE_ITEM_KEYS`; valuation medians computed via real `percentile_cont`, never an average; a
deterministic screener where a missing field always evaluates to non-matching, never silently
passes; per-sector operational-metric templates instead of one generic template; stock portfolio
with weighted-average cost accounting and **no fabricated `currentValue`** (no licensed price feed
exists — explicit and deliberate, not an oversight).

## 3. REST API surface (`frontend/app/api/v1/{stocks,sectors,watchlists,stock-portfolio,commodities,alerts}/`)

**Status: PASS — code and runtime, confirmed live in production (§1).**

19 route files: public research routes (`/stocks`, `/stocks/search`, `/stocks/[id]` + its
`financials`/`metrics`/`valuation`/`peers`/`timeline`/`commodities`/`research-notes` sub-routes,
`/stocks/screener`, `/sectors`, `/sectors/[id]`, `/commodities`) and auth-gated user-scoped routes
(`/watchlists` + item ownership checks, `/stock-portfolio` + transactions, `/alerts`). Thin
route/fat-service layering throughout, matching this codebase's established convention; every
handler wrapped in `withObservability`. Route-layer tests exist specifically where a route has
logic beyond "call the service and return JSON" (watchlist ownership verification) rather than
duplicating near-identical coverage the service layer's own tests already provide. Confirmed live:
`GET /api/v1/stocks` returns `200 {"companies":[]}` in production, not an error.

## 4. Frontend

**Status: PARTIAL — 1 of roughly 8 planned surfaces shipped.**

`/stocks/[id]` (commit `7908d1e`, this pass) is the only Stock Intelligence page that exists. It's
a real server component — `getCompanyPageContract`, `getStatementsForCompany`, `computeMetrics`,
`getLatestValuation`, `getPeerCompanies`, `getCompanyTimeline`, `getResultsCalendar` composed
directly, `revalidate: 0` (live DB-backed, not static) — rendering identity header, business
overview, an 8-metric grid, valuation with an explicit "never means cheap/expensive" disclaimer,
peer links, timeline + next-results banner, management, business segments, subsidiaries. Every
data section has a real `EmptyState` fallback rather than hiding or faking absent data. Verified
locally (dev server against a clearly-labeled, since-deleted seed company in the test branch):
every displayed metric hand-checked against the raw seeded inputs, empty states behaving exactly as
designed (e.g. an honest "no industry_id — cannot determine a peer set without guessing" reason
rather than a guessed peer list).

**Not started**: screener UI, peer-comparison UI, sector pages (`/sectors`, `/sectors/[id]`),
commodity/company-exposure UI, watchlist UI, stock-portfolio UI, `/markets`, stocks topics in
`/learn`, an AI-assistant grounding layer, document ingestion. None of these have even a stub page.

## 5. Production domain routing

**Status: PASS — two real bugs found and fixed this pass, both confirmed against the live domain,
not a preview URL.**

**Bug 1 (code, fixed in `7908d1e`)**: `AuthGate.jsx`'s `PUBLIC_PATH_PREFIXES` allowlist did not
include `/stocks`, `/sectors`, `/markets`, `/commodities` — every visit to the new page
client-side-redirected to `/login`, silently gating what's supposed to be public research content
(the exact same reasoning that already makes `/funds` public). Fixed by extending the array.
Verified locally before commit: `/portfolio` (should stay gated) still redirects, `/funds` (should
stay public) still loads directly — the fix's blast radius checked in both directions given
`AuthGate` wraps every page in the app.

**Bug 2 (infrastructure, not caused by this pass, caught by verifying against the real domain)**:
`mf-pulse.vercel.app` does not auto-follow new production deployments on this Vercel project — a
previously-documented characteristic of this specific project (see `production-refresh.yml`'s own
step 6 comment and the 2026-07-04..06 and 2026-07-19 incidents it was written to fix). The domain
was still serving commit `1b6439b` (yesterday's data-refresh commit) when this pass began —
**four commits behind HEAD**, predating not just this pass's page but the entire Stock API surface
and today's earlier auth/compliance work. This is not something a `git push` alone fixes on this
project; re-pointing only happens inside `production-refresh.yml`'s step 6, on its schedule or a
manual dispatch. Confirmed directly: the deployed JS bundle fetched straight from
`mf-pulse.vercel.app` didn't contain the `/stocks` string; `/api/v1/stocks` 404'd even though that
route has existed in the codebase since an earlier commit today. Fixed by dispatching
`production-refresh.yml` via `gh workflow run` (the same mechanism this project already built for
exactly this problem, run with its own properly-scoped credentials) rather than improvising a raw
Vercel API alias call — see the run for confirmation it completed and re-pointed the domain.

## 6. External data sources

**Status: BLOCKED — genuine external blocker, not internally solvable.**

No live external data source is wired in anywhere in this domain; every one of the 26 tables is
empty by design. `docs/STOCK_DATA_SOURCE_MATRIX.md` and `docs/BIGMINT_DATA_INTEGRATION.md` both
conclude the same thing: scraping is off the table, and the only sanctioned next step for
commodity/price/financial-statement data is a commercial/licensing conversation, not engineering.
Highest-ROI first candidate identified but not yet built: RBI/MOSPI macro series (public government
data, plausibly clear licensing posture without a commercial negotiation).

## 7. Navigation & discoverability

**Status: IN PROGRESS — by a concurrent session, not this one.** At the time this pass started,
`Nav.jsx` had no link to `/stocks` and the only way to reach `/stocks/[id]` was a direct URL — this
pass deliberately left that gap for later (the directive's own "Phase 31/32" sequences nav/homepage
integration after more surfaces exist). While this pass was mid-flight, another session's
uncommitted working-tree changes appeared for `Nav.jsx`, `lib/navLinks.js`, and further extensions
to `stocks/[id]/page.js` (commodity exposure, sector context, a sticky section nav, research
action buttons) and `lib/stocks/screener.js` — a full nav restructure into Mutual Funds/Stocks/
Portfolio/Markets/Learn, with links already anticipating `/stocks/screener`, `/stocks/sectors`,
`/markets`, `/learn/stocks` pages that don't exist yet. This pass did not touch, commit, or build
on top of any of those four files, specifically to avoid colliding with work that isn't this
session's to finish or discard — see this repo's established shared-working-tree precedent with a
concurrent frontend session (memory: `mfpulse-invest-phase3-gate`). Check `git status`/`git diff`
for the real, current state of those files before assuming either this doc's original "not
started" framing or the specifics described here still hold — this section will go stale fast.

---

## Summary

| Area | Status |
|---|---|
| Database schema | PASS — applied to production 2026-08-01, user-authorized |
| Backend service layer | PASS — 15/15 files, 116/116 tests, real Neon |
| REST API surface | PASS — confirmed live, `200 {"companies":[]}` |
| Frontend | PARTIAL — 1 of ~8 surfaces |
| Production domain routing | PASS — 2 real bugs found and fixed this pass |
| External data sources | BLOCKED — commercial/licensing, not engineering |
| Navigation | FAIL — not started, small and deliberately deferred |

**No open decisions remain from this pass.** Database, backend, API surface, and production
routing are all PASS and confirmed live. What's left is entirely forward work: the ~7 remaining
frontend surfaces (§4), nav/homepage integration (§7), and external data licensing (§6, genuinely
blocked on something outside engineering). Next natural slice per the governing directive's own
execution order: screener UI + comparison UI.
