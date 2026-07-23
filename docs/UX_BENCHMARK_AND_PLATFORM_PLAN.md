# MF Pulse × Suasion Securities
# Mutual Fund UX Benchmark and Platform Plan

**Prepared:** 23 July 2026  
**Scope:** Investor, advisor and operations journeys  
**Method:** Review of official public CAMS/myCAMS, KFintech/KFinKart, MFCentral and Groww material, compared with the current MF Pulse Invest routes and the live Invest API contract.

## Executive summary

The strongest shared pattern is not visual polish. It is operational clarity:

1. establish identity and eligibility before allowing money movement;
2. reuse verified investor data instead of asking for it again;
3. make every transaction state explicit and traceable;
4. keep portfolio, statements, service requests and support in one account view;
5. explain delays and failures without implying that a successful request is a completed investment.

MF Pulse already has a strong source-aware foundation, a compliance state machine, order timelines, portfolio provenance and a document contract. The largest product gaps are now breadth and contract alignment: SIPs are documented but not surfaced, redemption/switch journeys are not implemented, the dashboard does not yet expose all decision-critical metrics, advisor/admin routes are placeholders, and the Document Vault UI needs to consume the canonical Journey 4 fields and mutation semantics.

## 1. Benchmark findings

### Account creation and compliance

| Reference | Observable workflow pattern | Suasion implication |
| --- | --- | --- |
| myCAMS | Existing investors can use a single account across participating funds; KYC is a prerequisite; Aadhaar-based eKYC is offered for eligible users; transaction flows include OTP and explicit declarations. | Treat readiness as a gate with a clear reason, but offer assisted recovery and provider-specific remediation instead of a generic failure. |
| MFCentral | Sign-up uses PAN/PEKRN plus registered mobile and email; it groups service requests, portfolio/CAS and transaction actions in one authenticated hub. | Keep one investor identity and one request history; do not scatter compliance actions across unrelated pages. |
| Groww | The journey asks for identity and bank information progressively and keeps the user inside a short, guided investment flow. | Keep each step focused, preserve progress, and disclose the next commitment before the user submits. |

### Purchase, SIP and redemption

| Reference | Observable workflow pattern | Suasion implication |
| --- | --- | --- |
| myCAMS | Supports purchase, additional purchase, redemption, switch, SIP, STP, SWP and mandates; confirmation includes reference details and communications. | A single order model should support one-time, recurring and exit transactions with shared lifecycle components. |
| KFinKart | Distributor tooling includes subscriptions, redemption, switch, STP/SWP, SIP pause/cancel and reports. | Advisor operations need the same action vocabulary as the investor surface, with permission and audit boundaries. |
| MFCentral | Purchase/SIP, switch, redemption, mandate and service-request flows are consolidated; prefilled fields and track-status are explicit. | Make prefill, request status, rejection reason and service escalation first-class states. |
| Groww | Redemption supports amount or units, shows linked-bank destination, requires confirmation, and exposes order status/ticket support. SIP modification shows the changed amount/date and a confirmation timeframe. | Always show what is being redeemed, destination, expected processing window only when contract-backed, and the next action. |

### Portfolio and service

MFCentral emphasizes a single portfolio across folios, slicing by asset class, fund house, returns, scheme holdings and performance. myCAMS emphasizes consolidated views, statements, capital gains, transaction history, scheduled transactions and mandates. The product lesson is to make the portfolio a decision surface, not only a valuation surface: pending activity, tax documents, SIP health and service requests must be adjacent to holdings.

### Trust and recovery

The benchmark platforms consistently expose eligibility, linked-bank constraints, OTP/security steps, reference numbers, delayed settlement caveats and support paths. The Suasion standard should be:

status + evidence + next expected step + investor action + safe support path

## 2. Current MF Pulse gap analysis

### Strengths already present

- API-driven Invest shell with session-scoped caching.
- Compliance items and derived investment-readiness state.
- Draft → submitted → processing → units pending → completed/failed/retry/cancelled/reversed order model.
- Portfolio summary, holdings, allocation, performance and history contract.
- Source-aware holdings and unresolved-fund handling.
- Canonical Document Vault backend contract with list, search, upload metadata, archive, download-event and share mutations.
- Responsive mobile navigation, reduced-motion CSS and shared status components.

### Priority gaps

| Priority | Gap | Evidence in current product | Required direction |
| --- | --- | --- | --- |
| P0 | Document Vault contract mismatch | UI expects downloadUrl/GET-style download and uses ad hoc categories; contract uses title, category, doc_type, status, visibility, storage_ref and POST download/archive/share. | Align adapter and UI to the canonical Journey 4 contract; never claim a binary download exists in mock phase. |
| P0 | SIP journey absent from UI | /api/v1/invest/sips is documented, but no Invest SIP route/component exists. | First independently deployable slice should be SIP list + setup + details + pause/modify/cancel states once backend mutation contracts are confirmed. |
| P0 | Dashboard under-represents decisions | Dashboard now reads summary, but does not yet show pending investment amount, SIP book/next SIP, pending transactions, documents or service requests. | Add only fields available in the contract; use explicit unavailable states for the rest. |
| P1 | Redemption/switch flows absent | Order UI currently presents purchase-oriented fields and a generic order lifecycle. | Extend only after backend request/validation/status metadata is published. |
| P1 | Advisor route is a placeholder | /invest/advisor uses an awaiting-API module. | Replace with client list/profile/tasks/timeline only after Journey 5 role and permission contracts land. |
| P1 | Operations dashboard absent | No role-scoped AUM/exception route exists. | Backend must publish role-scoped aggregates and drill-down identifiers before UI implementation. |
| P1 | Error taxonomy is incomplete | API errors are human-readable but lack stable codes for compliance-gate routing and provider recovery. | Request stable error_code, retryable, money_state, next_action and support_reference fields. |
| P2 | Benchmark-level testing is incomplete | Browser QA covers current Invest routes and mobile overflow; live-account E2E and role-based advisor/admin tests are unavailable. | Add fixture-driven Playwright journeys for each state and viewport, then authenticated environment tests when credentials exist. |

## 3. Ideal onboarding information architecture

Use a resumable stepper with one primary action per screen:

1. Contact verification — mobile/email, OTP expiry and resend.
2. PAN/KYC check — registered, validated, on-hold, mismatch remediation.
3. Personal details — prefilled fields with edit provenance.
4. Address and tax residency.
5. Occupation, income and source of funds.
6. Bank account and penny-drop status.
7. Nominee and allocation.
8. FATCA/CRS, PEP and declarations.
9. Risk questionnaire — server-derived category.
10. Mandate setup.
11. Review — immutable summary of submitted information.
12. Consent and completion — account/reference number, what happens next.

Every step needs: progress, why it is needed, inline validation, save/resume, back navigation without loss, help/escalation, and a distinct remediation state.

## 4. Transaction information architecture

### Shared lifecycle

Draft → Submitted → Payment pending → Payment received → Processing → Units pending → Completed → Portfolio updated

The backend may not expose every intermediate state for every provider. The UI must render only contract-backed states and use “provider update pending” when a transition is not yet known.

### Purchase

Scheme → plan/option → amount → linked bank/payment → review → consent/OTP → reference → lifecycle tracking.

### SIP

Scheme → amount → frequency → instalment date → mandate → review → OTP/consent → active/pending/failed → next debit.

### Redemption

Holding/folio → amount or units → linked bank → exit-load/tax evidence if supplied → review → OTP → submitted/processing/payout/rejected.

### Recovery

Every failure surface must answer: what happened, whether money moved, what will happen next, whether the user must act, retry availability, reference number and support route.

## 5. Information architecture

### Investor

Overview: value, invested, gain/loss, XIRR, pending money, active SIP, next SIP, readiness and next action.

Portfolio: holdings, allocation, performance, history, unresolved data, sources and freshness.

Activity: orders, transactions, SIPs and service requests with filters and status timelines.

Vault: documents, search/filter, preview/download event, archive/share permission, timeline.

Support: advisor, notifications, tickets and communication history.

### Suasion management

Role-protected overview: AUM, net inflows, purchases, redemptions, SIP book, investor counts and provider health.

Exception queues: onboarding/KYC, bank, mandates, payment, rejected orders, reconciliation, redemption and documents.

Every metric must drill down to a filtered client/household/order list with permission-aware actions and an audit trail.

### Advisor

Client list → household → profile/compliance → portfolio/SIPs/activity → tasks/notes → communication timeline → next action.

The first viewport should answer readiness, failed mandates/SIPs, idle balances, recent redemption, pending intervention and total/net AUM.

## 6. Unified status language

Use one label per state:

Not started · In progress · Action required · Under verification · Ready · Scheduled · Payment pending · Submitted · Processing · Units pending · Completed · Failed · Cancelled · Reversed

Map provider-specific statuses in the API adapter. Do not expose raw provider labels in UI copy.

## 7. Contract requests to Claude

Before implementing SIP, redemption, advisor or operations UI, request:

- stable error_code, retryable, money_state, next_action, support_reference;
- timestamps and reference IDs for every lifecycle transition;
- expected timeline only when provider-backed;
- SIP pause/modify/cancel and mandate failure response shapes;
- redemption exit-load/tax/linked-bank fields;
- role/permission matrix and drill-down IDs for advisor/admin;
- dashboard aggregate freshness/source metadata;
- document mutation response shapes, including visibility, status, timeline and storage reference semantics.

## 8. Prioritized implementation plan

### Slice 1 — Journey 4 contract-aligned Document Vault

Align the frontend adapter to list/search/upload/archive/download/share, expose canonical status/category/source/visibility, and add document timeline/details. This is independently deployable because the backend contract already exists.

### Slice 2 — SIP center

Add list, setup, details, mandate state, next debit, pause/modify/cancel and failed-installment recovery after Claude confirms mutation contracts.

### Slice 3 — Transaction truth layer

Unify purchase, SIP, redemption and switch timelines with references, timestamps, money-state and support escalation.

### Slice 4 — Decision dashboard

Add pending money, SIP health, recent activity, documents, readiness and explicit stale/empty states using only live aggregates.

### Slice 5 — Advisor and operations

Implement role-protected client/household workflows and exception queues once Journey 5 contracts and permissions land.

## Sources

- CAMS/myCAMS features and FAQ: https://newmycams.camsonline.com/help/faq
- CAMS myCAMS official product page: https://www.camsonline.com/Investors/Transactions/Transact-online/myCAMS
- CAMS myCAMS user guide: https://newmycams.camsonline.com/myCAMSUserGuide
- KFinKart distributor FAQ: https://mfs.kfintech.com/mfs/generalpages/kfinkartdist_faqs.aspx
- MFCentral official overview: https://www.mfcentral.com/
- MFCentral official FAQ: https://app.mfcentral.com/links/faq
- MFCentral sign-up flow: https://app.mfcentral.com/investor/signup
- Groww order status help: https://groww.in/help/mutual-funds/order/what-is-my-current-order-status
- Groww redemption guide: https://groww.in/blog/redeem-money-mutual-funds-groww
- Groww SIP modification guide: https://groww.in/help/mutual-funds/mf-sip/how-to-change-sip-date-or-amount
