# Frontend audit report

Audit date: 24 July 2026  
Scope: public, Investor, Advisor, Operations, Management and internal routes in `frontend/app`.

## Findings and fixes

| Severity | Finding | Fix / disposition |
|---|---|---|
| P0 | The production build prerendered `/internal/neon-status` and failed when Supabase/Neon DNS was unavailable. | Added `dynamic = "force-dynamic"`; the diagnostic remains live-only and no longer blocks release builds. |
| P1 | `/invest/transactions` showed an error but offered no recovery action. | Added a shared-style refresh control, explicit loading semantics and a “Try again” action. |
| P1 | Full database-backed test suites cannot start without `DATABASE_URL`. | Documented as an environment gate; no product workaround or fake data was introduced. |
| P2 | Internal health/data routes call external services during build or request rendering. | Build now succeeds with graceful service warnings; production must provide service DNS and credentials. |
| P2 | Advisor, Operations and Management investor workspace routes are permission-aware shells while their scoped read/write contracts remain incomplete. | Kept data unavailable states truthful and recorded the dependencies in `FRONTEND_CONTRACT_GAPS.md`. |
| P2 | Browser automation could not be repeated in this sandbox through the CLI wrapper. | Existing representative Playwright evidence remains valid; release still requires the full browser/device matrix. |
| P3 | Dialogs expose semantic `role="dialog"` and close controls, but a formal focus trap and focus return are not standardized across every modal. | Recorded as technical debt; do not block staging, but complete before broad public launch. |

## Route coverage

All 97 App Router pages were inventoried. Investor routes have dedicated loading, empty and error
states for the live journeys (readiness, purchase/orders, portfolio, SIPs, redemption, switch,
documents, notifications and transactions). Internal and public data pages retain their existing
server-side fallback behavior. Advisor, Operations and Management layouts correctly render
permission-aware “awaiting backend data” states rather than fabricated metrics.

## Interaction review

- Deep links are represented by route-local pages and stable `/invest/*` paths.
- Investor navigation uses native links, so browser back/forward and refresh retain normal browser
  semantics.
- API reads are centralized through `investApi`, `portfolioApi`, `documentsApi`, `notificationsApi`,
  `redemptionApi`, `switchApi` and `sipApi`, with retry, caching and normalized error messages.
- Financial workflows show server status, reference IDs, provider metadata when supplied, next-step
  guidance and support links through `TransactionTimeline`.

## Remaining risks

The remaining risks are environment or backend readiness risks: production service DNS/credentials,
database-backed integration execution, scoped internal-workspace contracts, payment-attempt history,
SIP management mutations, and complete browser-matrix verification. No remaining risk requires
inventing frontend business logic.
