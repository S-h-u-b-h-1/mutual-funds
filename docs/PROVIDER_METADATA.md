# Provider Metadata

Backend contract slice, 2026-07-24 priority brief, item 4/5. Before this slice,
`PaymentProvider`/`MockPaymentProvider` had existed since Phase 1 Module 4 — fully built,
registered in `providers/index.js` — but **no real code path ever called it**. Every purchase
order and SIP mandate skipped straight to `InvestmentProvider` with no payment step at all, and
the roadmap doc's own honesty ledger flagged `MockPaymentProvider` as "unconditionally successful
with zero failure-mode simulation... the weakest of the five mocks." This slice wires it into a
real path for the first time, adds the plan/option scheme snapshot, and adds standardized
provider error codes shared across every mock.

Code: [frontend/app/lib/invest/bankAccounts.js](../frontend/app/lib/invest/bankAccounts.js),
[frontend/app/lib/invest/orderService.js](../frontend/app/lib/invest/orderService.js) · Schema:
[sql/neon/021_provider_metadata.sql](../sql/neon/021_provider_metadata.sql) · No new routes —
the existing `POST /api/v1/invest/orders` (submit) and `POST /api/v1/invest/sip-mandates` paths
now populate these fields as a side effect of the same call.

## 1. What's new on `investment_orders` / `sip_mandates`

| Column | Meaning | Populated by |
|---|---|---|
| `plan`, `option` | Scheme snapshot at creation (e.g. `Direct` / `IDCW`) | `getFund(schemeCode)`, in `createOrder`/`createSipMandate` |
| `payment_reference` | The (mock) payment gateway's own reference for this attempt | `paymentProvider.initiatePayment()` / `.initiateMandate()` |
| `payment_status` | `success` \| `declined` (order) or the mandate's own status | Same |
| `payment_bank_account_id` | FK to the verified `bank_accounts` row money moved from | `getVerifiedBankAccount(userId)` |
| `provider_error_code` | One of `PROVIDER_ERROR_CODES` when a provider (payment or investment) declines/rejects | Whichever provider call actually failed |

All five are additive, nullable columns — see migration 021's own header comment for why this is
deliberately **not** the full "Payment Attempt entity" the roadmap's §5 Recommendation 1 already
tracks as a separate, bigger P0 item (§6 below).

## 2. Purchase payment, wired for the first time

`submitOrder()` now has a purchase-only branch that runs **before** `investmentProvider.placeOrder()`:
no verified bank account is a hard precondition failure (order goes straight to `'failed'`, no
provider call at all); a verified bank triggers `paymentProvider.initiatePayment()`, whose result
is persisted immediately — `payment_reference`/`payment_status`/`payment_bank_account_id`/
`provider_error_code` — regardless of outcome, before anything branches on it. A **declined**
payment is not thrown; it's a normal, probabilistic runtime outcome (same category as the
investment provider's own ~8% order-level rejection), so it's recorded as `payment_status:
'declined'` and the order transitions to `'failed'` with a reason. The investment provider is
never contacted for a purchase whose payment didn't succeed — there would be nothing to place.

Redemption and switch orders never enter this branch: `submitOrder()` only runs it for
`order_type === 'purchase'`. Their money movement is a payout-at-completion
(`InvestmentProvider.initiatePayout`, see `docs/REDEMPTION_CONTRACT.md` §3) or none at all (a
switch moves value internally), never a payment-in.

**Reuse, not reimplementation:** the verified-bank-account lookup already existed inline inside
`redemptionService.getRedemptionEligibility()` (for the payout bank). It's now extracted into
`bankAccounts.js`'s `getVerifiedBankAccount(userId)` — a small, pure DB-read helper — and both
`redemptionService.js` and `orderService.js` import the same function. `redemptionService.js`'s
behavior is unchanged; this is a pure refactor to avoid a second copy of the same query now that
a second real caller exists.

## 3. SIP mandate authorization — the same graceful-decline pattern

`createSipMandate()` follows the identical shape: no verified bank is a thrown precondition
failure (setting up a SIP with no funding source at all is a genuine input error, not a
probabilistic outcome); `paymentProvider.initiateMandate()` registers the NACH/UPI Autopay
authorization, and a **declined** mandate is persisted as `mandate_status: 'failed'` and returned
normally, not thrown. Critically, on a declined mandate `investmentProvider.createSIPMandate()`
is **never called** — there's no real authorization behind it — and no `"SIP set up"` notification
is sent, since none was. `payment_reference` (the mandate provider's own ref) and `plan`/`option`
are still stamped either way, since those aren't conditional on the authorization succeeding.

This mirrors §2's purchase-payment handling exactly, which is a deliberate consistency fix: the
first draft of this slice had `createSipMandate` *throw* on a declined mandate, which would have
introduced ~5% random flakiness into an existing test with no tolerance for that outcome. Once
purchase-payment decline was already non-throwing, treating a probabilistic mandate decline as an
exception instead — the only asymmetry between two structurally identical situations — had no
justification, so the SIP path was corrected to match before this slice was tested, not after.

## 4. Standardized provider error codes

`PROVIDER_ERROR_CODES` (`providers/types.js`) is a small, flat, frozen constant —
`SCHEME_NOT_OPEN`, `PAYMENT_DECLINED`, `MANDATE_DECLINED` — set alongside the existing free-text
`rejection_reason`/decline-message fields, never replacing them. The free-text stays for a human
reading an order's history; the code exists so a caller (a future retry policy, a support tool,
Codex) can branch on a stable value instead of pattern-matching prose. Deliberately small: it
grows only when a real decline path needs a new code, not speculatively ahead of need.

## 5. `plan`/`option` — a snapshot, not a live join

Same reasoning as `distributor_arn`/`distributor_euin` (`sql/neon/017`) and the redemption/switch
exit-load figures: `getFund(schemeCode)` is resolved once, at `createOrder`/`createSipMandate`
time, and the result is frozen onto the row. A scheme's plan/option doesn't change after an order
exists, but the principle is applied consistently regardless — every snapshot-shaped field in this
schema is computed once at creation, never re-derived live on read.

## 6. What was deliberately NOT done in this slice

- **No Payment Attempt entity or retry lifecycle** — the roadmap doc's §5 Recommendation 1 and §9
  P0 table already track this as a separate, larger piece of work (a new table, multi-attempt
  history per order, a distinct retry-vs-order-retry operation). This slice only adds
  metadata/snapshot fields to the *existing* order/mandate rows — one payment attempt per
  order/mandate, not a history of attempts.
- **No real payment gateway integration** — `MockPaymentProvider` is still a mock; it's now
  realistically weighted (95% success) instead of unconditionally successful, which is the
  specific gap the roadmap's honesty ledger flagged, but it never contacts a real UPI/NACH/bank
  rail.
- **No async mandate-verification state** — a real eNACH mandate can take days for bank approval;
  this mock is still synchronous (accept or decline immediately). The roadmap's §2.4 gap analysis
  already documents this as a distinct, unresolved structural gap; this slice does not close it.
- **No new reconciliation comparator** — `payment_reference` is now a real,
  reconciliation-shaped reference value, but wiring a `payment-vs-mandate` comparator into the
  existing M3 Reconciliation Engine (flagged as a small follow-on in roadmap §2.4) is separate
  work, not done here.
- **No idempotency-key on payment initiation** — the existing Job Platform idempotency mechanism
  (roadmap §2.4) is not yet threaded through `paymentProvider.initiatePayment()`/`.initiateMandate()`
  calls in this slice.

## 7. Verification record

- `orderService.test.js`: existing SIP-mandate test updated to tolerate the new
  ~5%-probabilistic decline outcome (mirroring the purchase-order tolerance pattern already in
  the same file); one new test asserting `plan`/`option`/`payment_reference`/`payment_status`/
  `payment_bank_account_id` are actually populated on both a purchase order and a SIP mandate,
  using real scheme `119551` (Aditya Birla Sun Life Banking & PSU Debt, Direct/IDCW).
- `redemptionService.test.js`/`switchService.test.js` re-run as regression, since both call the
  modified `submitOrder()` indirectly (neither reaches the new purchase-payment branch, as
  neither is `order_type === 'purchase'`).
- Migration applied directly to production Neon and verified via `information_schema.columns`:
  all 12 new columns present across `investment_orders`/`sip_mandates`.
