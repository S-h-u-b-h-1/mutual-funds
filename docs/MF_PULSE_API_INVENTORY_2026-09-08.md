# MF Pulse API inventory — 2026-09-08

This is the static inventory used by the deep production audit. It contains all 99 `route.js`/`route.ts` files under `frontend/app/api`: 67 explicit GET handlers, 39 POST, 10 PUT, and 8 DELETE handlers, plus the NextAuth catch-all. A route can expose more than one method. “Guarded” means a direct static call to `requireUser`, `requireRole`, or `auth` was found in the route; runtime negative tests remain the stronger evidence for authorization.

| Endpoint | Methods | Static access classification |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | NextAuth handlers | Framework-managed |
| `/api/auth/forgot-password` | POST | Public |
| `/api/auth/register` | POST | Public |
| `/api/auth/reset-password` | POST | Public |
| `/api/freshness` | GET | Public |
| `/api/internal/events/status` | GET | Public status |
| `/api/internal/jobs/status` | GET | Public status |
| `/api/internal/providers/status` | GET | Public status |
| `/api/internal/reconciliation/items/[id]/resolve` | POST | Guarded |
| `/api/internal/reconciliation/status` | GET | Public status |
| `/api/internal/webhooks/status` | GET | Public status |
| `/api/search` | GET | Public |
| `/api/v1/account` | DELETE | Guarded |
| `/api/v1/alerts` | GET, POST | Guarded |
| `/api/v1/commodities` | GET | Public |
| `/api/v1/internal/alerts/run` | POST | Guarded |
| `/api/v1/invest/account` | GET, POST | Guarded |
| `/api/v1/invest/compliance/items/[itemKey]` | POST | Guarded |
| `/api/v1/invest/compliance` | GET | Guarded |
| `/api/v1/invest/documents/[id]/archive` | POST | Guarded |
| `/api/v1/invest/documents/[id]/download` | POST | Guarded |
| `/api/v1/invest/documents/[id]` | GET | Guarded |
| `/api/v1/invest/documents/[id]/share` | POST | Guarded |
| `/api/v1/invest/documents` | GET | Guarded |
| `/api/v1/invest/documents/search` | GET | Guarded |
| `/api/v1/invest/documents/upload` | POST | Guarded |
| `/api/v1/invest/execution-readiness` | GET | Guarded |
| `/api/v1/invest/notifications/[id]/archive` | POST | Guarded |
| `/api/v1/invest/notifications/[id]/dismiss` | POST | Guarded |
| `/api/v1/invest/notifications/[id]/read` | POST | Guarded |
| `/api/v1/invest/notifications/[id]` | GET | Guarded |
| `/api/v1/invest/notifications/[id]/unread` | POST | Guarded |
| `/api/v1/invest/notifications/preferences` | GET, PUT | Guarded |
| `/api/v1/invest/notifications` | GET | Guarded |
| `/api/v1/invest/notifications/unread-count` | GET | Guarded |
| `/api/v1/invest/onboarding` | GET | Guarded |
| `/api/v1/invest/orders/[orderId]/cancel` | POST | Guarded |
| `/api/v1/invest/orders/[orderId]/retry` | POST | Guarded |
| `/api/v1/invest/orders/[orderId]` | GET | Guarded |
| `/api/v1/invest/orders/[orderId]/submit` | POST | Guarded |
| `/api/v1/invest/orders` | GET, POST | Guarded |
| `/api/v1/invest/portfolio/allocation` | GET | Guarded |
| `/api/v1/invest/portfolio/connect` | POST | Guarded |
| `/api/v1/invest/portfolio/data-quality` | GET | Guarded |
| `/api/v1/invest/portfolio/history` | GET | Guarded |
| `/api/v1/invest/portfolio/holdings` | GET | Guarded |
| `/api/v1/invest/portfolio/performance` | GET | Guarded |
| `/api/v1/invest/portfolio` | GET | Guarded |
| `/api/v1/invest/portfolio/summary` | GET | Guarded |
| `/api/v1/invest/preferences` | GET, PUT | Guarded |
| `/api/v1/invest/profile` | GET, PUT | Guarded |
| `/api/v1/invest/redemption/[schemeCode]/eligibility` | GET | Guarded |
| `/api/v1/invest/redemption` | POST | Guarded |
| `/api/v1/invest/risk-profile` | GET, PUT | Guarded |
| `/api/v1/invest/sips` | GET, POST | Guarded |
| `/api/v1/invest/switch/eligibility` | GET | Guarded |
| `/api/v1/invest/switch` | POST | Guarded |
| `/api/v1/portfolio/holdings` | GET | Guarded |
| `/api/v1/portfolio/intelligence` | GET | Guarded |
| `/api/v1/portfolio/upload` | POST | Guarded |
| `/api/v1/sectors/[id]` | GET | Public |
| `/api/v1/sectors` | GET | Public |
| `/api/v1/stock-portfolio` | GET | Guarded |
| `/api/v1/stock-portfolio/transactions` | GET, POST | Guarded |
| `/api/v1/stocks/[id]/alerts` | GET, POST | Guarded |
| `/api/v1/stocks/[id]/commodities` | GET | Public |
| `/api/v1/stocks/[id]/financials` | GET | Public |
| `/api/v1/stocks/[id]/metrics` | GET | Public |
| `/api/v1/stocks/[id]/peers` | GET | Public |
| `/api/v1/stocks/[id]/research-notes` | GET, PUT | Guarded |
| `/api/v1/stocks/[id]` | GET | Public |
| `/api/v1/stocks/[id]/timeline` | GET | Public |
| `/api/v1/stocks/[id]/valuation` | GET | Public |
| `/api/v1/stocks` | GET | Public |
| `/api/v1/stocks/screener` | GET, POST | Public |
| `/api/v1/stocks/search` | GET | Public |
| `/api/v1/stocks/universe` | GET | Public |
| `/api/v1/sync/alerts/[id]` | PUT, DELETE | Guarded |
| `/api/v1/sync/alerts/deliveries` | GET | Guarded |
| `/api/v1/sync/alerts` | GET, POST | Guarded |
| `/api/v1/sync/collections/[id]/items/[schemeCode]` | DELETE | Guarded |
| `/api/v1/sync/collections/[id]/items` | POST | Guarded |
| `/api/v1/sync/collections/[id]` | DELETE | Guarded |
| `/api/v1/sync/collections` | GET, POST | Guarded |
| `/api/v1/sync/comparisons/[id]` | DELETE | Guarded |
| `/api/v1/sync/comparisons` | GET, POST | Guarded |
| `/api/v1/sync/history` | GET, POST | Guarded |
| `/api/v1/sync/migrate` | POST | Guarded |
| `/api/v1/sync/notes/[id]` | PUT, DELETE | Guarded |
| `/api/v1/sync/notes` | GET, POST | Guarded |
| `/api/v1/sync/notification-settings` | GET, PUT | Guarded |
| `/api/v1/sync/preferences` | GET, PUT | Guarded |
| `/api/v1/sync/research-profile` | GET, PUT | Guarded |
| `/api/v1/sync/watchlist/[schemeCode]` | DELETE | Guarded |
| `/api/v1/sync/watchlist` | GET, POST | Guarded |
| `/api/v1/watchlists/[id]/items` | GET, POST, DELETE | Guarded |
| `/api/v1/watchlists` | GET, POST | Guarded |
| `/api/watchlist-intelligence` | GET | Public |
| `/api/webhooks/[provider]` | POST | Provider-authenticated by handler |

## Runtime sample results

| Endpoint/pattern | Result | Status |
| --- | --- | --- |
| `/api/freshness` | 200; current NAV summary | PASS |
| `/api/search?q=axis` | 200; fund results | PASS |
| `/api/search` malformed/short/script-like query | 200; safely empty | PASS WITH OBSERVATION |
| `/api/internal/{events,jobs,reconciliation,webhooks}/status` | 503/database unavailable | BROKEN |
| `/api/v1/commodities`, `/api/v1/sectors` | 200 but empty payloads | INCOMPLETE |
| `/api/v1/stocks`, `/search`, `/universe` | 200 and populated company shell | PARTIAL |
| `/api/v1/stocks/ADANIENT` and UUID-only child endpoints with symbol | 500 + correlation ID | BROKEN |
| Valid company UUID detail family | 200, but most detail/financial/metric/peer/timeline/valuation arrays or values empty | INCOMPLETE |
| 16 protected read/mutation samples | 401 before any write | PASS |
| `/api/auth/providers` | Credentials only | PASS WITH OBSERVATION |
| Register `{}` | 400 | PASS |
| Forgot password `{}` | 200 generic anti-enumeration response | PASS |
| Reset `{}` | 400 invalid link | PASS |
| Bogus webhook provider | 404 | PASS |
