# MF Pulse frontend launch readiness

Updated 24 July 2026. This checklist records the current frontend state and the backend
dependencies that still prevent a full production launch.

## Implemented workflows

- Investor onboarding and Investment Readiness, including server-backed compliance progress.
- Purchase order draft, review, submit, cancel, retry and truthful lifecycle tracking.
- Portfolio summary, holdings, allocation, performance, history and connect flows.
- SIP creation/listing with provider-backed plan, payment and mandate metadata.
- Redemption by amount or units, live eligibility, payout-bank context, exit-load/tax guidance,
  and transaction timeline.
- Same-AMC switch by amount or units, source-folio validation, linked redemption/purchase legs,
  and separate timelines for both legs.
- Document Vault loading, empty, search/filter, permission and error states.
- Notification inbox with unread count, filtering, pagination, detail timeline, read/unread and
  archive actions.
- Advisor, Operations and Management workspace shells with permission-aware awaiting-data states.

## Remaining backend dependencies

- First-class payment-attempt resource with retry history, idempotency, money state, next action,
  support reference and payment notifications.
- SIP pause, modify, cancel, failed-installment history and mandate retry contracts.
- Advisor-scoped client, household, tasks, notes, communications, meetings and permission APIs.
- Operations queue, detail, resolution and audit APIs.
- Management KPI and drill-down APIs.

## Known limitations

- Switch legs progress independently because the current backend contract does not promise atomic
  settlement; both references and statuses are shown explicitly.
- Local database-backed service tests require `DATABASE_URL`; route and frontend tests run without
  a local database.
- Real provider settlement, payment and document-storage confirmation require production provider
  credentials and backend contracts; the UI does not fabricate these values.

## Quality evidence

- Production build completed successfully with 97 routes, including the switch and notification
  API surfaces.
- ESLint passed with no warnings. The Transactions route includes a visible retry path for failed
  loads and a refresh control.
- Focused transaction, notification and redemption route tests passed. Switch service coverage is
  present in `switchService.test.js`; execution requires the configured Neon database.
- Representative Playwright checks at 375px, 768px and 1440px found no horizontal overflow on
  Investor, Portfolio, Redemption, Notifications and Advisor routes. Mocked flows reported zero
  console errors. The broader browser matrix remains a release-candidate validation task.
- Native form controls, semantic headings, status roles, alert regions, dialog roles and visible
  focus styles are used across the implemented journeys. Full account-based manual coverage still
  depends on production test credentials.

## Launch gate

The frontend is ready for contract-backed staging verification. Before public launch, run the
authenticated end-to-end suite against production-like provider sandboxes, verify real payment and
document callbacks, complete a browser matrix (Chromium, Safari and Firefox), and close the
backend dependencies listed above.
