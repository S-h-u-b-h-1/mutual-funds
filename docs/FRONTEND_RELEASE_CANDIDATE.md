# Frontend release candidate

Release candidate review: 24 July 2026.

## Implemented

- Investment readiness and onboarding.
- Purchase draft/review/submit/cancel/retry lifecycle.
- Portfolio summary, holdings, allocation, performance, history and connect.
- SIP creation/listing with provider-backed mandate and payment metadata.
- Redemption by amount or units with live eligibility and payout context.
- Same-AMC switch with linked source/destination legs and truthful timelines.
- Documents, notifications, orders and transaction history.
- Shared Investor design primitives and internal Advisor, Operations and Management shells.

## Backend dependencies

Payment-attempt history, SIP management mutations, scoped Advisor APIs, Operations queue/resolution
APIs and Management KPI/drill-down APIs remain documented in `FRONTEND_CONTRACT_GAPS.md`.

## Browser and device support

Responsive layouts have representative verification at 375px, 768px and 1440px with no horizontal
overflow on the audited Investor, Portfolio, Redemption, Notifications and Advisor routes. Native
links and controls support refresh, deep links and browser history. The release gate still requires
authenticated verification in Chrome, Edge, Safari and Firefox at 375, 390, 414, 768, 1024, 1440
and 1920px.

## Accessibility

Semantic headings, native controls, visible focus styles, status/alert regions, labelled forms and
dialog semantics are present across live Investor workflows. Reduced-motion CSS is enabled globally.
Focus trapping and return focus for every dialog remains a P1 follow-up.

## Performance

The production build reports 97 routes and 87.4 kB shared JavaScript. Investor API reads use short
GET caching and in-flight deduplication. No unmeasured virtualization or memoization was added.
Production profiling remains required for large research tables and remote data waterfalls.

## Testing coverage

Lint passes. Production build passes after the internal Neon route was made dynamic. Route tests and
unit tests that do not require a database pass; database-backed suites are blocked by missing
`DATABASE_URL`, and some external-health reads are blocked by sandbox DNS. Representative Playwright
checks found no overflow or console errors in mocked Investor flows.

## Known limitations and recommendation

The candidate is suitable for contract-backed staging verification, not unconditional public launch.
Complete the environment-backed integration suite, browser matrix, dialog focus audit and remaining
backend dependencies before enabling broad customer traffic.
