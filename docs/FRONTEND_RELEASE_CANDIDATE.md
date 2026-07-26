# Frontend release candidate

Release candidate review: 26 July 2026.

## RC1 verdict: CONDITIONALLY READY

No new critical or high-severity frontend defect was found in this pass. RC1 is suitable for
contract-backed staging verification, subject to the infrastructure and backend gates below.

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

Chromium and WebKit verification covered protected Investor routes and the public fund screener at
mobile and desktop widths with no horizontal overflow or console errors. Existing representative
evidence also covers 375px, 768px and 1440px Investor, Portfolio, Redemption, Notifications and
Advisor routes. Firefox was not claimed: the local Playwright session routed to an unrelated 404
application despite the MF Pulse dev server returning 200. Authenticated verification in Chrome,
Edge, Safari and Firefox at 375, 390, 414, 768, 1024, 1440 and 1920px remains a release gate.

## Accessibility

Semantic headings, native controls, visible focus styles, status/alert regions, labelled forms and
dialog semantics are present across live Investor workflows. Reduced-motion CSS is enabled globally.
Focus trapping and return focus for every dialog remains a P1 follow-up.

## Performance

The production build reports 97 routes and 87.4 kB shared JavaScript. Investor API reads use short
GET caching and in-flight deduplication. No unmeasured virtualization or memoization was added.
Production profiling remains required for large research tables and remote data waterfalls.

## Testing coverage

Lint passes and the production build passes. The current test run has 53 passing test files, 296
passing tests and 176 skipped tests; 17 database-backed files (34 tests) are blocked by the missing
`DATABASE_URL`. Representative Chromium/WebKit Playwright checks found no overflow or console errors.

## Known limitations and recommendation

The candidate is conditionally ready for contract-backed staging verification, not unconditional
public launch. Complete the isolated database/provider suite, authenticated browser matrix, Firefox
verification, dialog focus audit and remaining backend dependencies before broad customer traffic.
