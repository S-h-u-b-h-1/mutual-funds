# Frontend RC1 end-to-end journey matrix

Updated 26 July 2026. This is a journey-level verification plan, not a list of isolated page
smoke checks. Destructive transaction cases must use an isolated backend test database/provider
sandbox; never run them against production Neon.

## Investor journeys

| Journey | Prerequisite | Routes / APIs | Happy path | Failure path | Refresh/deep-link/history/mobile | Persisted-state assertion |
|---|---|---|---|---|---|---|
| Registration / login | Logged-out browser; isolated auth fixture | `/register`, `/login`, auth routes | Register, sign in, land on intended route | 409 duplicate, invalid credentials, 429 throttling, offline | Refresh keeps auth outcome; back/forward do not resubmit; 375px form remains usable | Session/account exists only after backend success |
| Onboarding | Authenticated investor | `/invest/onboarding`, profile/compliance/account APIs | Complete steps and return later | 401/403, validation error, account-open failure | `?step=` deep link opens the requested step; refresh reloads server state | Compliance item status and account status match backend |
| Investment readiness | Authenticated investor | `/invest/compliance`, compliance APIs | Review requirements and submit supported items | Missing data, provider failure, expired session | Retry re-reads state; no completion copy on failed response | Readiness percentage/status is server-derived |
| Purchase | Investment-ready account, eligible scheme | `/invest/orders`, order APIs | Save draft, review, submit once | Negative/zero amount, provider decline, timeout, 409 conflict, 429 | Refresh shows persisted draft/order; back does not resubmit; mobile fields/buttons remain reachable | One backend order reference; status remains truthful |
| Order lifecycle | Submitted order fixture | `/invest/orders`, `/invest/transactions`, order detail APIs | Submitted → processing → units pending → completed | Failed, retry required, cancelled, reversed, unknown status | Poll/refresh reflects server; deep-link detail does not duplicate mutation | Timeline/reference/payment metadata match backend |
| Portfolio | Connected portfolio or completed order fixture | `/invest/portfolio`, portfolio APIs | Summary, holdings, allocation, performance and history render | Partial optional panel failure, stale/missing NAV, 401/404 | Refresh rehydrates server values; mobile cards do not overflow | Holdings and data-quality facts match backend snapshot |
| SIP setup/status | Investment-ready account | `/invest/sips`, SIP APIs | Submit SIP and show mandate/payment status | Validation, mandate failure, provider timeout, 429 | Refresh shows persisted SIP; unsupported pause/modify/cancel remain unavailable | One SIP/mandate record; no false “active” state |
| Redemption | Eligible folio, verified bank | `/invest/redeem`, redemption APIs | Check eligibility, review amount/units, submit and track | Insufficient units, missing NAV/bank, provider decline, timeout | Refresh resumes from order truth; back does not resubmit | One redemption reference and truthful payout status |
| Switch | Same-AMC eligible source/destination and folio | `/invest/switch`, switch APIs | Validate, review, submit linked legs, track both timelines | Ineligible destination, cross-AMC, insufficient units, timeout | Refresh retains only persisted server result; no duplicate pair | Linked switch-out/in orders and independent statuses persist |
| Documents | Authenticated account | `/invest/documents`, document APIs | List, search/filter, details, download, archive | 401/403/404/500, missing optional metadata | Refresh and deep links preserve route; dialog closes safely on mobile | Document status/event history comes from service |
| Notifications | Authenticated account | `/invest/notifications`, notification APIs | Filter, paginate, detail, read/unread, archive | 401/403/404/429/500 | Refresh keeps server read state; no duplicate mutation | Notification state and timeline persist server-side |
| Profile / account lifecycle | Authenticated account | `/profile`, `/invest/onboarding`, profile/account APIs | Edit profile and continue readiness | 401/403/validation/account race | Refresh/back/forward safe; no destructive deletion UI exposed | Profile/account response is source of truth |

## Error-state matrix

Every money-changing action must be exercised with: provider decline, provider timeout, backend
timeout, payment failed, validation conflict, duplicate submission, stale/missing NAV, readiness
blocker, mandate failure, reconciliation pending, and reversal where supported. The expected UI
result is an alert with recovery guidance, no success state, no second local transaction, and no
white screen. Unknown states use the neutral `Provider update` mapping.

## Authorization journeys

Use isolated identities for Investor, Advisor, Operations and Management. Direct navigation to an
unpermitted workspace must return the backend permission state without leaking queue/KPI/client
data or entering a redirect loop. Advisor, Operations and Management currently render explicit
awaiting-contract states where scoped APIs are not live; they must not be promoted to “live” by
fixture data.

## Browser/device evidence

Existing representative checks cover Chromium-style Playwright runs at 375px, 768px and 1440px for
Investor, Portfolio, Redemption, Notifications and Advisor, including no horizontal overflow and
zero console errors in mocked flows. RC1 completion requires the same journey set in Chromium,
Firefox and WebKit at a key mobile viewport and desktop viewport. WebKit evidence must be labelled
as Safari-equivalent automation, not native Safari.

## RC1 execution status

Route tests and non-database unit tests are runnable locally. Database-backed journeys remain
blocked until Claude’s isolated test database strategy is available; missing `DATABASE_URL` must not
be replaced with a production connection. The matrix should be checked off with test-run links and
fixture identifiers when that environment is ready.
