# Frontend Contract Gaps

This file records requirements discovered during launch-critical frontend work. It is deliberately
separate from the live API contract so the frontend never invents provider behavior.

## Purchase journey — required before payment-enabled UI

Current supported backend: POST /api/v1/invest/orders with schemeCode, orderType,
amount|units, and optional draft; submit/detail/cancel/retry endpoints are available.

Still required from backend:

- endpoint: purchase metadata lookup
- method: GET
- request: schemeCode
- response: scheme name, AMC, plan/options, minimum/maximum amount, folio eligibility,
  available linked banks, mandate/payment methods, advisor/distributor/ARN/EUIN context
- permission: authenticated investor; advisor-assisted read only when permitted
- state impact: none
- error codes: scheme_unavailable, scheme_not_eligible, bank_unavailable,
  mandate_required, provider_unavailable
- idempotency: read-only
- notification/audit: none

- endpoint: payment and order lifecycle metadata
- method: provider-specific contract to be confirmed
- request: order reference and payment context
- response: payment_pending, payment_received, accepted, processing, units_pending,
  completed, money state, timestamps, provider-safe reference, next action and support reference
- permission: authenticated investor; no client-supplied user id
- state impact: order/payment timeline and notifications
- error codes: stable machine-readable code plus retryable, money_state, action_required
- idempotency: payment initiation and final submission must accept an idempotency key
- notification/audit: payment state event, order state event, audit correlation id

## Redemption and switch

The current order API accepts redemption, switch_in and switch_out, but no contract currently
exposes holdings/folios as an order-entry source, available units, exit load, tax context, linked
payout bank, destination scheme metadata, or redemption-specific validation. Do not enable those
flows until those fields and state transitions are published.

## SIP management

GET/POST /api/v1/invest/sips supports listing and creation. Pause, modify, cancel, failed
installment, installment history and mandate retry mutations are not yet published. The frontend
keeps those actions informational until each endpoint, permission, idempotency rule, notification
event and audit event is available.

## Dashboard notifications

The investor dashboard can show an unread-notification count only after the Journey 5 notification
read contract is published. No `GET /api/v1/invest/notifications` endpoint is currently live;
the dashboard renders this metric as unavailable rather than probing a missing route.

## Advisor workspace

The advisor workspace shell is ready, but no advisor-scoped client, household, task, note,
communication, meeting, or permission contract is live yet. Required backend additions are:

- authenticated advisor workspace summary and paginated client roster;
- server-side client search, household relationships and client-detail rollups;
- permission-scoped readiness, portfolio, SIP, transaction and document summaries;
- task, note, communication and meeting-history read/write endpoints with audit references;
- stable queue counts and health indicators for follow-up and operational exceptions.

Until these contracts land, the workspace must render “Awaiting backend data” states and must not
show fabricated client metrics or enable mutating controls.

## Operations and management consoles

No permission-scoped operations or management read contracts are live yet. Required additions
include paginated exception queues (KYC, mandates, payments, allotments, reconciliation,
documents and notifications), provider-health summaries, detail timelines, resolution commands,
and audited management KPI endpoints for AUM, flows, SIPs, investor growth, allocation, advisor
performance and operational health. The internal consoles render layouts and disabled states only
until those contracts are published.

## Timeline minimum

Every money-moving response should eventually include:

reference_id, provider_reference, correlation_id, status, status_reason, created_at, updated_at,
money_state, next_action, action_required, retryable, support_reference, and a chronological event
list.
