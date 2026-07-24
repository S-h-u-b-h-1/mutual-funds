# Switch Contract

Backend contract slice, priority-list item 2/5 (2026-07-24 brief). Before this slice,
`order_type` in `('switch_in','switch_out')` were valid enum values, creatable via the generic
`orderService.createOrder()` with only a bare `relatedSchemeCode` presence check — no folio
check, no same-AMC validation, no eligibility, no linkage between the two legs. This slice closes
that gap the same way the Redemption Contract closed the equivalent redemption gap.

Code: [frontend/app/lib/invest/switchService.js](../frontend/app/lib/invest/switchService.js)
· Schema: [sql/neon/019_switch_contract.sql](../sql/neon/019_switch_contract.sql)
· Routes: `GET /api/v1/invest/switch/eligibility?source=&destination=`, `POST /api/v1/invest/switch`

## 1. A switch's source leg is a redemption

A switch is modeled as **two linked `investment_orders` rows** — `switch_out` on the source
scheme, `switch_in` on the destination — not a new entity. That two-row shape already existed in
the schema (`ORDER_TYPES`) since Journey 2.

`getSwitchEligibility()` does **not** reimplement eligible-folio/redeemable-unit/exit-load/tax
computation — it calls `redemptionService.getRedemptionEligibility()` directly for the entire
source-side contract, because a switch's source leg realizes gains and pays exit load exactly
like a redemption does. The only genuinely new logic in this slice is destination validation
(same AMC, active for subscription) and the two-row linkage. Same reuse principle as
`redemptionService.js` reusing `taxEngine.js` rather than a second classifier.

## 2. Same-AMC is a hard gate, not a preference

Real BSE StAR MF / AMFI "switch" is a single same-AMC transaction type — a move between two
different AMCs is not one transaction, it's a redemption plus a separate fresh purchase.
`getSwitchEligibility()` enforces this as a hard blocker (`sameAmc: false` → not eligible), with
a message pointing the caller at separate redemption + purchase orders instead of silently
treating a cross-AMC request as something it isn't. This is well-established, uncontroversial
mutual-fund operational law, not an ambiguous judgment call — the "do not invent regulated
behaviour" constraint cuts the other way here: silently allowing a cross-AMC "switch" would be
the invention.

Destination eligibility, beyond same-AMC: the destination fund must resolve
(`getFund(destinationSchemeCode)` returns non-null) and be currently active
(`fund.active !== false`) — this app's data doesn't track a separate "closed for subscription"
flag independent of `active`, so that's the full signal available.

## 3. Settlement lifecycle: two independently-progressing legs

Both legs are created together, atomically, in one `createSwitchOrder()` call, and cross-linked
via the new `switch_order_id` self-reference (each row points at its pair). Once submitted, they
progress through the **same generic order engine** as any other order —
`orderService.submitOrder()`/`transition()` are unchanged, called once per leg.

**Deliberate simplification, stated plainly**: the two legs do not settle atomically in this
mock. A real BSE StAR MF switch is processed by the RTA as a coordinated pair with the same
transaction date; this app's mock timeline has no mechanism to force two independent
`decideNextStatus()` progressions (each driven by its own row's `submitted_at`, per
`orderService.js`) to resolve together, and building one would be inventing coordination
machinery beyond what any of the five priority-brief items actually asked for. `switch_order_id`
makes the pairing visible and traceable (for UI display, audit, and any future coordination
logic) without pretending the mock enforces synchronized settlement it does not.

## 4. Provider payload and audit trail

Fixed a pre-existing gap while wiring this: `orderService.submitOrder()`'s provider payload
never included `related_scheme_code` at all, even for the OLD, bare switch-order path — a real
switch provider call had no way to know the destination scheme. Now generically passes
`relatedSchemeCode`/`switchOrderId` (harmless null for purchase/redemption, present for switch
legs) — same "if present on the row, pass it through" pattern already used for distributor
attribution and exit-load fields.

One audit action, `switch_order_created`, covering both legs' ids and the shared financial
figures (folio, requested units, exit-load figures, net amount reaching the destination) — not
two separate audit rows for what is one investor decision.

## 5. Net destination amount

`switch_in.amount` is **not** the same figure as `switch_out`'s gross amount — it's net of the
source-side exit load, computed the same way `redemptionService.createRedemptionOrder()`
computes `net_settlement_amount`, except here it flows into a purchase rather than a bank payout
(no money leaves the platform on a switch — `payout_bank_account_id`/`payout_status` stay null
for switch orders, same columns redemption uses, simply unused here).

## 6. What was deliberately NOT done in this slice

- **No atomic/synchronized settlement between the two legs** — see §3.
- **No cross-AMC switch support** — see §2; a genuinely different, larger feature (would need a
  real redemption-then-purchase orchestration, not a switch) if ever wanted.
- **No partial-fill / partial-failure reconciliation** if one leg fails after the other
  succeeds — each leg's failure is visible independently (its own `status`/`rejection_reason`)
  via the existing generic order surface; no new recovery workflow was built, matching "don't
  invent beyond what's asked."

## 7. Verification record

- 13 new tests in `switchService.test.js`, real Neon, real scheme codes: `119551` (Aditya Birla
  Sun Life Banking and PSU Debt, source), `100033` (Aditya Birla Sun Life Large & Mid Cap, SAME
  AMC destination), `100219` (JM Large Cap, DIFFERENT AMC — exercises the same-AMC rejection for
  real, not a fixture).
- `redemptionService.js` gained one additive field (`fundAmc`) on `getRedemptionEligibility()`'s
  return value, needed so `switchService.js` can compare AMCs without a second fund lookup — the
  16 existing redemption tests re-verified green (none assert the full return shape, so an
  additive field cannot break them).
- Migration applied directly to production Neon and verified: `switch_order_id` present on
  `investment_orders`.
