# Redemption Contract

Backend contract slice, 2026-07-24 priority brief ("eliminate the remaining backend contract
gaps that block the investor platform"). Before this slice, `orderType: 'redemption'` was a
valid enum value with **zero** redemption-specific behavior — no folio check, no redeemable-unit
cap, no exit-load estimate, no tax context, no payout bank, no distinct settlement step. This
slice closes that gap end to end: eligibility computation, order creation, provider payload,
settlement/payout lifecycle, audit trail.

Code: [frontend/app/lib/invest/redemptionService.js](../frontend/app/lib/invest/redemptionService.js)
· Schema: [sql/neon/018_redemption_contract.sql](../sql/neon/018_redemption_contract.sql)
· Routes: `GET /api/v1/invest/redemption/[schemeCode]/eligibility`, `POST /api/v1/invest/redemption`

## 1. Two entry points, one enforcement boundary

- **`getRedemptionEligibility(userId, schemeCode)`** — a stateless, live-computed preview. Never
  persisted: NAV, holding period, and pending-order counts all change by the minute, so a stored
  "quote" row would just be a second, staler source of truth. Safe to call as often as a UI wants
  (e.g. on every keystroke of a redemption amount field).
- **`createRedemptionOrder(userId, {schemeCode, folioNumber, amount|units, draft?})`** —
  re-computes the *exact same* eligibility server-side before writing anything, so a client can
  never submit against a stale quote it fetched a minute ago.

`orderService.createOrder()` (the generic path used by purchase/switch) explicitly **refuses**
`orderType: 'redemption'`:

```
Redemption orders must be created via redemptionService.createRedemptionOrder(), which validates
live folio eligibility — not orderService.createOrder().
```

This is a deliberate security/correctness boundary, not a style preference. `POST
/api/v1/invest/orders` forwards its request body straight into `createOrder()` — before this
guard existed, a client could `POST {orderType:'redemption', schemeCode, amount}` directly and
bypass every eligibility check (folio ownership, redeemable-balance cap, ELSS lock-in, payout
bank) entirely. `redemptionService.js` never calls `orderService.createOrder()`; it does its own
validated `insert`, then hands off to the already-generic `orderService.submitOrder()` for
provider submission and `transition()`-driven settlement — so redemption reuses every piece of
the order lifecycle that has no opinion about *how* the row was created, and only duplicates the
handful of lines that genuinely need redemption-specific fields.

## 2. What `getRedemptionEligibility` returns

```
{
  schemeCode, fundName, category, nav, navDate,
  taxTreatment: { treatment, treatmentDetail, isElss },   // fund-wide, from the category
  payoutBank: { id, accountNumberMasked, ifsc, accountHolderName } | null,
  eligible, blockers: string[],                            // portfolio-level
  folios: [{
    folioNumber, source, unitsHeld, unitsPendingRedemption, unitsRedeemable,
    avgCost, availableAmount, estimatedGainLoss,
    taxContext: { earliestPurchaseDate, holdingPeriodDays, elssLockIn, note },
    exitLoad: { estimatedPct, estimatedAmount, isEstimate, basis, note },
    eligible, blockers: string[],                          // folio-level
  }]
}
```

Every field maps directly onto the brief's checklist:

- **Eligible folios / redeemable units** — `portfolio_holdings` is queried per (scheme, folio),
  not the pre-aggregated view `getPortfolio()` uses, because a redemption acts on one specific
  folio/lot, not a portfolio-wide total. `unitsRedeemable` subtracts whatever is already
  `units`-committed to another **non-terminal** redemption order on the same folio — see §3 for
  why that's a deliberately different status set than `orderService`'s `TERMINAL_STATUSES`.
- **Available amount** — `unitsRedeemable × current NAV`.
- **Tax context** — reuses `portfolioIntelligence/taxEngine.js`'s `classifyFundTaxTreatment()`
  (the existing, already-shipped, SBI-Tax-Reckoner-verified category classifier) rather than a
  second copy. Per-folio `holdingPeriodDays` is the **earliest known purchase transaction** for
  that scheme+folio from `portfolio_transactions` — not a full FIFO lot ledger (this app doesn't
  track individual lots). A partial redemption's actual short/long-term split can differ from
  this estimate; the `note` field says so explicitly. **ELSS lock-in is enforced as a hard
  eligibility gate, not just informational text** — real ELSS units are legally locked for 3
  years from purchase, so a folio with no confirmed purchase-date record is treated as locked
  (conservative default) rather than guessed open.
- **Exit-load information** — deliberately does **not** invent fund-specific numbers. This app's
  factsheet data has no per-fund exit-load figure (see `taxEngine.js`'s own
  `EXIT_LOAD_GENERAL_GUIDANCE`, reused verbatim here, not duplicated). A numeric
  `estimatedPct` is computed **only** for the one case that general guidance already states as a
  single crisp figure — equity-oriented, 1% within 12 months, 0% after. Every other tax
  treatment (hybrid, debt, other) gets `estimatedPct: null` plus the same qualitative note,
  because the source guidance itself is a range ("nil to 1% within 6-12 months"), not a value —
  collapsing a range into a fake precise number would be worse than leaving it null.
- **Payout bank** — the user's verified, primary `bank_accounts` row. No verified bank on file is
  a **portfolio-level blocker**, not a soft warning: a real redemption cannot settle without one.

## 3. Order creation and the settlement lifecycle

`createRedemptionOrder` re-validates the requested folio/units against a fresh
`getRedemptionEligibility` call, then freezes `exit_load_pct` / `exit_load_amount` /
`net_settlement_amount` / `payout_bank_account_id` onto the order row at the moment of creation —
the same snapshot-not-live-reference principle already used for `distributor_arn`/`distributor_euin`
(`sql/neon/017`) and for the same reason: what the investor was quoted must not silently drift as
NAV/holding-period keep moving after they've acted.

**Why `unitsPendingRedemption` uses its own status set, not `orderService.TERMINAL_STATUSES`:**
`TERMINAL_STATUSES` includes `retry_required` (no further *auto*-advance), but a `retry_required`
redemption is still a live, user-retryable order — its units are still spoken for. Treating
`retry_required` as "resolved" here would let a second redemption request double-spend units
that are really just sitting in a retryable order. `redemptionService.js` defines its own
`RESOLVED_STATUSES = ['completed','failed','cancelled','reversed']` for this one purpose.

**Settlement lifecycle** reuses the existing generic order state machine
(`draft → submitted → processing → units_pending → completed | failed | ...`) — redemption gets
no new statuses there. What's genuinely new is a **separate payout dimension**, because in a real
redemption the units are redeemed and the payout is instructed as two different steps with two
different timings:

- `payout_status` starts `'pending'` at order creation.
- When the order reaches `'completed'`, `orderService.js`'s `transition()` calls the new
  `InvestmentProvider.initiatePayout(order)` method and stores the result:
  `payout_status → 'initiated'`, `payout_reference`, `payout_initiated_at`.
- **It stops there.** This app has no real banking rail and no visibility into actual credit
  timing (T+1/T+2/T+3, weekends, bank holidays are all real variables it doesn't track). A third
  `'credited'` state would assert money has arrived when this app has no way to confirm that —
  so it's deliberately not simulated. `MockInvestmentProvider.initiatePayout()`'s own comment
  says the same thing.

## 4. Provider payload and audit trail

`folioNumber`, `exitLoadPct`, `exitLoadAmount` are added to the object `orderService.submitOrder()`
passes into `InvestmentProvider.placeOrder()` — no interface change was needed for that part
(the mock already echoes back whatever it's given, same finding as the Distributor Identity
slice). `initiatePayout(order)` **is** a genuinely new interface method, added because a real RTA
redemption both redeems units and instructs the payout as part of processing the same request —
it lives on `InvestmentProvider`, not `PaymentProvider` (which stays scoped to *inbound* purchase
money movement).

Two dedicated audit actions: `redemption_order_created` (folio, exit-load figures, payout bank
id, distributor attribution) and `redemption_payout_initiated` (payout reference, payout bank
id) — following the same "dedicated action name, not a generic bucket" convention as
`order_created`/`sip_mandate_created`.

## 5. What was deliberately NOT done in this slice

- **No numeric exit-load figure for non-equity treatments** (§2) — the app's own data doesn't
  support one; see above.
- **No FIFO lot-level tax accounting** — holding period is the earliest known purchase date per
  scheme+folio, honestly caveated, not a per-lot ledger.
- **No `'credited'` payout state** — see §3.
- **No TDS / rupee tax liability computed** — this app has no visibility into an investor's slab
  rate, other capital gains for the year, or whether their ₹1.25L LTCG exemption is already used.
  `estimatedGainLoss` (current value minus cost) is a plain arithmetic fact from data already on
  the holding row; it is not a tax liability figure. Matches `taxEngine.js`'s own existing scope
  boundary.
- **STP/SWP** — not touched. This slice is redemption only, matching the brief's own numbered
  breakdown (Switch Contract is a separate, already-queued slice).
- **The Persistent Portfolio CAS mission's `portfolio_folio`/`portfolio_holding` (singular)
  tables** (`sql/neon/008`) were deliberately **not** used as this slice's foundation, even
  though "folio" is in both names. That schema belongs to a separate, still-in-progress mission
  (task tracker: Persistent Portfolio Phase 2) with its own richer, encrypted-at-rest folio
  model, not yet wired into any read/write path. Building the Redemption Contract against
  half-finished infrastructure from an unrelated mission would be a real coupling risk; the
  existing `portfolio_holdings` (plural) table — already the Invest platform's one live source of
  truth via `portfolioService.js`/`orderService.js` — is the correct foundation today. If/when
  the Persistent Portfolio mission ships and becomes the platform's canonical holdings source,
  this module's queries are the ones that would need to move, not the eligibility contract itself.

## 6. Verification record

- 16 tests in `redemptionService.test.js`, real Neon, real scheme codes from the live fund
  universe (not fixtures) so category-driven classification is genuinely exercised: `119551`
  (Banking and PSU → debt), `100219` (Large Cap → equity-oriented), `100175` (ELSS →
  equity-oriented + lock-in). Covers: unknown scheme, never-held scheme, redeemable-unit/available-
  amount computation, equity exit-load estimate at both sides of the 12-month threshold, ELSS
  lock-in blocking with unlock date, pending-redemption double-spend prevention, no-verified-bank
  blocking, the generic-path bypass refusal, draft vs. immediate-submit, distributor attribution,
  and the full settlement → payout-initiated lifecycle (asserting the real audit row).
- `orderService.test.js`'s existing 14 tests re-verified green against the `validateOrderInput`
  change (bare `orderType: 'redemption'` now throws; every other order type unaffected).
- Migration applied directly to production Neon and verified: all 7 new `investment_orders`
  columns present (`folio_number` already existed from migration 010, unused until now).
