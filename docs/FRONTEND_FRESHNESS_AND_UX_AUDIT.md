# Frontend freshness and UX audit

Audit date: 27 July 2026

Verdict: **CONDITIONALLY READY**

The frontend now makes source dates and stale states visible where the current contracts provide
them. It must not be called `RC READY` while the production pipeline is serving materially stale
financial data or while authenticated provider-backed journeys remain unverified.

## Freshness matrix

| Surface | Primary source | Data date available | Freshness treatment | Remaining risk |
|---|---|---|---|---|
| Home `/` | Bundled AMFI/daily snapshot and live headline/flow reads | `asOf`, flow month, article fetched time | Shared market-status tone and explicit NAV as-of; no hardcoded fallback date | Static daily bundle can lag the pipeline until Claude’s refresh investigation completes |
| `/funds` | Bundled AMFI universe | Fund `navDate`, bundle `asOf` | NAV badge, stale filter and provenance disclosure | Bundle freshness depends on successful ingestion/build |
| `/fund/[scheme_code]` | AMFI NAV history plus factsheet metadata | NAV date and factsheet source date | Fund-level stale label; fields keep separate factsheet provenance | Some optional metadata is unavailable rather than date-stamped |
| `/data-status` | Live warehouse health, runs, flow and news reads | Latest NAV, run finish, fetched time, flow month | Current/degraded/stale/down states with source labels | External service/DNS and production pipeline availability |
| `/data-quality` | Warehouse coverage audit and source registry | Audit date and field last-updated date | Field-level dated evidence and refresh policy | Audit date is not a live pipeline timestamp |
| `/invest/portfolio` | Portfolio API | Holding NAV date, valuation date, computed time, coverage | Stale holding count, NAV date and unavailable metrics | Full provider refresh/partial valuation contract remains backend-dependent |
| `/portfolio` import workspace | Authenticated CAS upload and portfolio engine | Statement date, NAV date, import/valuation timestamps | Import state and source/provenance cards | Current endpoint persists immediately; no import draft/status polling |
| Purchase/SIP/Redemption/Switch | Investment APIs | Eligibility/plan metadata where returned; execution NAV is provider-determined | Copy avoids implying latest NAV is execution NAV; timelines show processing | Payment-attempt and provider settlement metadata remain incomplete |
| Transactions/Documents/Notifications | Authenticated APIs | Event/document timestamps where supplied | Server timestamps shown; unavailable values remain labelled | Authenticated fixture and provider callback coverage pending |
| Advisor/Operations/Management | Permission-scoped APIs | Not live for most scoped views | Awaiting-data states; no fabricated freshness | Backend contracts still incomplete |

## Corrections made

- Removed hardcoded homepage NAV fallback dates and misleading “Yesterday” language.
- Replaced the homepage “15m cron” claim with neutral “Scheduled pipeline” wording because the UI
  does not own the ingestion schedule.
- Replaced “active portfolios synced” with “schemes in the research universe.”
- Homepage freshness now uses the shared `marketStatus` contract and shows Current, Delayed or Stale
  / unavailable using the actual daily snapshot date.
- Existing fund, portfolio and data-status surfaces continue to preserve source dates instead of page
  load time.
- Purchase, SIP, redemption and switch now use name-first scheme selection. Redemption is constrained
  to schemes returned by the investor holdings endpoint; switch source selection is similarly
  holdings-first, while destination eligibility remains server-authoritative.

## Layout and routing review

- Invest routes have contextual back navigation and a shared shell offset.
- Mobile Invest navigation reserves bottom space; protected routes redirect to login without loops.
- Public fund discovery was checked at 375px with no horizontal overflow.
- Existing representative evidence covers 375px, 768px and 1440px Investor routes. Full 320–1920px
  authenticated coverage remains a release gate.

## Accessibility and performance

- Loading, alert and status regions exist on the audited Investor flows.
- Native controls, visible focus styles and reduced-motion rules remain in use.
- No new client-side data universe was added; scheme selection calls the existing server search route.
- No measured bundle regression was introduced. Production profiling and authenticated network-waterfall
  evidence remain required.

## Remaining blockers

- Claude’s production stale-data pipeline investigation and a production-like refresh verification.
- Isolated database/provider fixtures and authenticated cross-browser E2E.
- Firefox verification must be repeated in a working Playwright session; earlier local routing produced
  an unrelated application and is not certification evidence.
- Payment-attempt history, SIP management mutations, import drafts/status, provider authorization,
  cross-provider reconciliation and scoped internal workspace APIs.

## Screens not launch-ready

Investor financial screens are conditionally ready for contract-backed staging, but not unconditional
public launch until freshness is verified against production data and authenticated journeys complete.
The remaining UX risk is authenticated coverage of the holdings-first redemption/switch selectors
with production-like portfolio fixtures; no scheme-code entry is required as the primary action.
Advisor, Operations and Management remain shells by design until their permission-scoped contracts
land. Automatic PAN-based portfolio discovery remains intentionally unavailable.
