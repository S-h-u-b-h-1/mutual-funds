// Journey 2 — Order Management. Order lifecycle: draft -> submitted -> processing ->
// units_pending -> completed | failed | retry_required, plus cancelled (from any non-terminal
// state) and reversed (an explicit action on a completed order). Backs
// docs/INVEST_PLATFORM_ARCHITECTURE.md §7 and the Phase 1 brief's Module 6 lifecycle.
import { query, withTransaction } from "../db.js";
import { investmentProvider, paymentProvider } from "./providers/index.js";
import { callProvider, isProviderUnavailable, investmentProviderUnavailableOutcome, paymentProviderUnavailableOutcome } from "./providers/resilience.js";
import { logAudit } from "./audit.js";
import { notifyUser } from "./notifications.js";
import { emitEvent } from "../platform/events/core.js";
import { evaluateInvestmentReadiness } from "./identityService.js";
import { reconcileCompletedOrder } from "./portfolioService.js";
import { generateDocument } from "./documentService.js";
import { getDefaultDistributorAttribution } from "../platform/distributor/core.js";
import { getVerifiedBankAccount } from "./bankAccounts.js";
import { getFund } from "../funds.js";

export const ORDER_TYPES = ["purchase", "redemption", "switch_in", "switch_out"];
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "reversed", "retry_required"]);
const ADVANCING_STATUSES = new Set(["submitted", "processing", "units_pending"]);

// Elapsed seconds since submission at which the mock order progresses to the next stage. Real
// values (not milliseconds) so a demo/dev session actually sees an order move through states
// within a UI polling loop, without needing a background worker (none exists — see
// docs/INVEST_PLATFORM_ARCHITECTURE.md §3's "no queue infrastructure" note).
const PROGRESSION_SECONDS = { processing: 4, unitsPending: 10, resolve: 18 };

// Pure and exported for direct unit testing — no DB, no Date.now(), elapsed time is a parameter.
// Never regresses: checked from the furthest-along threshold down, so it always lands on the
// stage the elapsed time justifies regardless of the status passed in.
export function decideNextStatus(currentStatus, elapsedSeconds) {
  if (!ADVANCING_STATUSES.has(currentStatus)) return currentStatus; // terminal or retry_required: no auto-advance
  if (elapsedSeconds >= PROGRESSION_SECONDS.resolve) {
    const roll = Math.random();
    if (roll < 0.8) return "completed";
    if (roll < 0.9) return "retry_required";
    return "failed";
  }
  if (elapsedSeconds >= PROGRESSION_SECONDS.unitsPending) return "units_pending";
  if (elapsedSeconds >= PROGRESSION_SECONDS.processing) return "processing";
  return "submitted";
}

const NOTIFICATION_COPY = {
  submitted: { type: "order_submitted", title: "Order submitted" },
  processing: { type: "order_processing", title: "Order is being processed" },
  units_pending: { type: "order_units_pending", title: "Units allotment pending" },
  completed: { type: "order_completed", title: "Order completed" },
  failed: { type: "order_failed", title: "Order failed" },
  retry_required: { type: "order_retry_required", title: "Order needs to be retried" },
  cancelled: { type: "order_cancelled", title: "Order cancelled" },
  reversed: { type: "order_reversed", title: "Order reversed" },
};

async function transition(order, toStatus, reason = null) {
  const fromStatus = order.status;
  // C1 (order idempotency): compare-and-swap, not an unconditional UPDATE — the WHERE clause
  // requires the row to still be in the status this caller believes it's in. Without this, two
  // concurrent callers computing a transition from the same stale `order` snapshot (two
  // overlapping refreshOrderStatus() polls, or a poll racing a real provider-driven update) could
  // both succeed, both write a history row, and — worst case — both run 'completed''s settlement
  // side effects (reconciliation, document generation, payout) for the same order.
  // submission_claimed_at is cleared here too — it's submitOrder()/retryOrder()'s internal claim
  // marker (see claimForSubmission below), always stale by the time any transition lands.
  const r = await query(
    `update investment_orders set status = $3, rejection_reason = coalesce($4, rejection_reason), submission_claimed_at = null, updated_at = now()
     where id = $1 and status = $2 returning *`,
    [order.id, fromStatus, toStatus, reason]
  );
  if (r.rows.length === 0) {
    // Lost the race — someone else already moved this order out of fromStatus. Their call owns
    // the side effects below (history row, notification, settlement); return the order's actual
    // current state rather than acting as if our transition happened.
    const current = await query(`select * from investment_orders where id = $1`, [order.id]);
    return current.rows[0];
  }
  await query(
    `insert into order_status_history (order_id, from_status, to_status, reason) values ($1, $2, $3, $4)`,
    [order.id, fromStatus, toStatus, reason]
  );
  const copy = NOTIFICATION_COPY[toStatus];
  if (copy) {
    await notifyUser(order.user_id, copy.type, {
      title: copy.title,
      body: `${order.order_type} order for ${order.scheme_code}${reason ? ` — ${reason}` : ""}`,
      relatedEntityType: "order",
      relatedEntityId: order.id,
    });
  }
  await logAudit(order.user_id, "order_status_changed", { orderId: order.id, fromStatus, toStatus, reason });
  if (toStatus === "submitted") {
    await emitEvent("OrderSubmitted", { orderId: order.id, userId: order.user_id, orderType: order.order_type, schemeCode: order.scheme_code }, { correlationId: order.id, source: "orderService" });
  }
  // Journey 3: a completed order is real, genuine investor intent (they submitted it, compliance
  // gated it) that settled — reconcile it into the SAME portfolio_holdings/portfolio_transactions
  // tables CAS import uses, so the portfolio view never needs to know an order was involved.
  let completedOrder = r.rows[0];
  if (toStatus === "completed") {
    await reconcileCompletedOrder(completedOrder);
    // Journey 4: a real brokerage issues a contract note on settlement — same idea here, into
    // the same document vault a CAS upload or a KYC PDF would land in.
    await generateDocument(order.user_id, {
      docType: "investment_confirmation",
      title: `Investment Confirmation — ${order.order_type} ${order.scheme_code}`,
      relatedEntityType: "order",
      relatedEntityId: order.id,
      metadata: { distributorArn: order.distributor_arn, distributorEuin: order.distributor_euin },
    });
    // Redemption Contract, settlement lifecycle: units are redeemed (above) and the payout is
    // instructed as a SEPARATE step, matching how a real RTA redemption actually works — see
    // InvestmentProvider.initiatePayout's own comment for why this is 'initiated', not a fake
    // 'credited' state this app has no way to actually confirm.
    if (completedOrder.order_type === "redemption") {
      // Not retryable (real payout initiation) and not caught on failure — same M17-tracked
      // accepted gap as reconcileCompletedOrder/generateDocument above (docs/BACKEND_TECHNICAL_DEBT.md):
      // a mid-flow provider failure here already had no compensating logic before this change.
      // Timeout + circuit breaker still bound how long a failure takes to surface.
      const payoutAck = await callProvider("mock-investment", "initiatePayout", () => investmentProvider.initiatePayout(completedOrder));
      const payoutUpdate = await query(
        `update investment_orders set payout_status = $2, payout_reference = $3, payout_initiated_at = now(), updated_at = now()
         where id = $1 returning *`,
        [completedOrder.id, payoutAck.status, payoutAck.payoutReference]
      );
      completedOrder = payoutUpdate.rows[0];
      await logAudit(order.user_id, "redemption_payout_initiated", {
        orderId: order.id, payoutReference: payoutAck.payoutReference, payoutBankAccountId: completedOrder.payout_bank_account_id,
      });
    }
    await emitEvent("OrderCompleted", { orderId: order.id, userId: order.user_id, orderType: order.order_type, schemeCode: order.scheme_code }, { correlationId: order.id, source: "orderService" });
  }
  return completedOrder;
}

// Auth+onboarding truth audit, Phase 12: throws using evaluateInvestmentReadiness
// (identityService.js) rather than re-deriving compliance/account checks itself — that function
// is now the ONE place "is this investor ready" is decided; every read-only surface (the
// onboarding contract, a future dashboard) reports the same thing this throws on, by construction,
// not by two implementations happening to agree.
const ACCOUNT_BLOCKER_CODES = new Set(["investment_account_missing", "investment_account_pending"]);

export async function assertInvestmentReady(userId) {
  const readiness = await evaluateInvestmentReadiness(userId);
  if (readiness.ready) return;
  // Compliance takes priority in the thrown message, matching this function's pre-refactor
  // behavior (and the tests that pin it) — a brand-new user is missing both compliance AND an
  // account, and "finish compliance first" is the more useful, earlier-in-the-journey message
  // than "open an account" for that case. The account-specific message only surfaces once
  // compliance is otherwise fully done and the account is the sole remaining blocker.
  const hasComplianceBlocker = readiness.blockers.some((b) => !ACCOUNT_BLOCKER_CODES.has(b.code));
  if (hasComplianceBlocker) throw new Error("Compliance must be fully completed before placing an order.");
  throw new Error("An active investment account is required before placing an order.");
}

function validateOrderInput({ schemeCode, orderType, amount, units, relatedSchemeCode }) {
  if (!schemeCode) throw new Error("schemeCode is required.");
  if (!ORDER_TYPES.includes(orderType)) throw new Error(`orderType must be one of: ${ORDER_TYPES.join(", ")}`);
  if (amount == null && units == null) throw new Error("Either amount or units is required.");
  // Backend Hardening (2026-07-24): amount/units were only null-checked — a negative or zero
  // value passed the check above and reached the provider/DB layer unvalidated. Same `!(x > 0)`
  // idiom already used by createSipMandate below (rejects NaN, negative, and zero alike).
  if (amount != null && !(amount > 0)) throw new Error("amount must be greater than 0.");
  if (units != null && !(units > 0)) throw new Error("units must be greater than 0.");
  if ((orderType === "switch_in" || orderType === "switch_out") && !relatedSchemeCode) {
    throw new Error("relatedSchemeCode is required for switch orders.");
  }
  // Redemption Contract: a bare orderType='redemption' through the generic path has no folio,
  // no redeemable-balance check, no ELSS lock-in check, and no payout bank — createOrder has no
  // way to enforce those generically. redemptionService.createRedemptionOrder() is the only safe
  // entry point; it re-validates live eligibility, then writes the order row directly (it does
  // not call createOrder), so this guard cannot block a legitimate redemption.
  if (orderType === "redemption") {
    throw new Error("Redemption orders must be created via redemptionService.createRedemptionOrder(), which validates live folio eligibility — not orderService.createOrder().");
  }
  // Switch Contract: same reasoning as redemption above — a switch_out leg needs the exact same
  // folio/eligibility/exit-load enforcement as a redemption (it IS a redemption of the source,
  // tax- and eligibility-wise), and a switch_in leg only makes sense as one half of a linked
  // pair created together — a standalone switch_in has no source of funds. Both must go through
  // switchService.createSwitchOrder(), which writes both linked rows directly (never calls
  // createOrder), so this guard cannot block a legitimate switch.
  if (orderType === "switch_in" || orderType === "switch_out") {
    throw new Error("Switch orders must be created via switchService.createSwitchOrder(), which validates live eligibility for both legs together — not orderService.createOrder().");
  }
}

export async function createOrder(userId, input) {
  validateOrderInput(input);
  await assertInvestmentReady(userId);
  const { schemeCode, relatedSchemeCode = null, orderType, amount = null, units = null, draft = false, idempotencyKey = null } = input;

  // Distributor attribution is stamped once, here, at creation — not re-derived later. It's a
  // snapshot of who gets commission/audit credit for this specific order, so it must freeze at
  // the moment the order comes into existence, matching every other provider_reference-style
  // column in this schema (see sql/neon/017_distributor_identity.sql). No advisor context is
  // passed into createOrder today, so this always resolves to the default distributor EUIN.
  const distributor = await getDefaultDistributorAttribution();
  // Provider Metadata: a snapshot of the scheme's plan/option at order time — same reasoning as
  // distributor attribution above. getFund() already resolved successfully for any schemeCode
  // reaching this point (compliance/eligibility gates upstream never call createOrder with an
  // unresolvable code), so a missing fund here is not a case this needs to guard against.
  const fund = getFund(schemeCode);

  // C1 (order idempotency, sql/neon/022_order_idempotency.sql): a double-click submit or a
  // client retry after a timed-out request must not create two separate orders. Two independent
  // guards, both inside one advisory-locked transaction so the check-then-insert is atomic:
  //   1. idempotencyKey, if the caller sends one — an exact-match dedupe on (user_id, key).
  //   2. A short content-based window, regardless of whether a key was sent — "do not rely
  //      solely on frontend button disabling." A genuine "place the exact same order again a few
  //      seconds later" is not a real mutual-fund-purchase workflow, so this only ever catches an
  //      accidental duplicate, never a deliberate new order.
  const { order, isNew } = await withTransaction(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`order-create:${userId}:${schemeCode}:${orderType}`]);

    if (idempotencyKey) {
      const byKey = await client.query(
        `select * from investment_orders where user_id = $1 and idempotency_key = $2`,
        [userId, idempotencyKey]
      );
      if (byKey.rows.length > 0) return { order: byKey.rows[0], isNew: false };
    }
    // Scoped to status='draft' specifically, not "any recent order": once an order has moved
    // past draft (submitted, failed, ...) it is a resolved, distinct action, and a later create
    // call — however similar in shape — must never merge into it, no matter how recent. This
    // keeps the guard narrow enough that it cannot misfire against two genuinely separate,
    // sequential actions that merely happen to share scheme/amount — only a request that's still
    // sitting unclaimed in draft looks like an actual duplicate.
    const recent = await client.query(
      `select * from investment_orders
       where user_id = $1 and scheme_code = $2 and order_type = $3
         and amount is not distinct from $4 and units is not distinct from $5
         and status = 'draft'
         and created_at > now() - interval '5 seconds'
       order by created_at desc limit 1`,
      [userId, schemeCode, orderType, amount, units]
    );
    if (recent.rows.length > 0) return { order: recent.rows[0], isNew: false };

    const inserted = await client.query(
      `insert into investment_orders (user_id, scheme_code, related_scheme_code, order_type, amount, units, status, distributor_arn, distributor_euin, plan, option, idempotency_key)
       values ($1, $2, $3, $4, $5, $6, 'draft', $7, $8, $9, $10, $11)
       returning *`,
      [userId, schemeCode, relatedSchemeCode, orderType, amount, units, distributor.arn, distributor.euin, fund?.plan ?? null, fund?.option ?? null, idempotencyKey]
    );
    return { order: inserted.rows[0], isNew: true };
  });

  if (!isNew) return order; // deduped — return the existing order as-is, never re-run creation side effects or re-submit
  await logAudit(userId, "order_created", { orderId: order.id, orderType, schemeCode, distributorArn: distributor.arn, distributorEuin: distributor.euin });
  if (draft) return order;
  return submitOrder(userId, order.id);
}

export async function getOrderRaw(userId, orderId) {
  const r = await query(`select * from investment_orders where id = $1 and user_id = $2`, [orderId, userId]);
  return r.rows[0] ?? null;
}

// C1 (order idempotency): atomic claim for a call about to contact a payment/investment
// provider — the actual compare-and-swap, not just the read-then-compare status checks in
// submitOrder()/retryOrder() (which two concurrent or retried calls — two browser tabs, a client
// retry after a timed-out request — could both pass before either writes anything). Only the
// caller whose UPDATE actually matches a row gets to proceed to the provider. Treated as
// stale/reclaimable after 30s — generous for these mock, near-instant providers, but this is a
// soft lease, not a hard fence: a slower real provider would need this tuned, and the window
// exists so a mid-flight crash's claim self-heals on the next retry rather than wedging the order
// forever with no background sweep to recover it (unlike the job platform's lease recovery, H2).
async function claimForSubmission(order, fromStatus) {
  const r = await query(
    `update investment_orders set submission_claimed_at = now(), updated_at = now()
     where id = $1 and status = $2
       and (submission_claimed_at is null or submission_claimed_at < now() - interval '30 seconds')
     returning *`,
    [order.id, fromStatus]
  );
  return r.rows[0] ?? null;
}

export async function submitOrder(userId, orderId) {
  const existing = await getOrderRaw(userId, orderId);
  if (!existing) throw new Error("Order not found.");
  if (existing.status !== "draft") throw new Error(`Only a draft order can be submitted (current status: ${existing.status}).`);
  // Auth+onboarding truth audit, Phase 1/12: createOrder() checks readiness once, at draft
  // creation — but a draft can sit unsubmitted for an arbitrary amount of time before this runs,
  // and nothing re-verified readiness at the actual moment money/units are about to move. Cheap
  // relative to the payment/provider calls below, and closes a real (if currently unreachable,
  // since nothing today revokes compliance/deactivates an account after the fact) gap between
  // "was ready when the draft was made" and "is still ready right now."
  await assertInvestmentReady(userId);
  // C1: claim the order before contacting any provider — a concurrent/retried second call that
  // loses this race must never reach the payment/investment provider at all, not just disagree
  // about the final status.
  const order = await claimForSubmission(existing, "draft");
  if (!order) throw new Error("This order has already been submitted.");

  // Provider Metadata: a purchase needs money to move before the investment provider is even
  // asked to place it — paymentProvider.initiatePayment() has been fully built and registered
  // since Phase 1 but never actually called from any real path until this slice. A declined
  // payment means there is nothing to submit; the investment provider is never contacted.
  // Redemption/switch never reach this branch: their money movement is payout-at-completion
  // (initiatePayout) or none at all (a switch's value moves internally), not a payment-in.
  let paymentReference = null, paymentStatus = null, paymentBankAccountId = null;
  if (order.order_type === "purchase") {
    const bank = await getVerifiedBankAccount(userId);
    if (!bank) {
      await query(`update investment_orders set payment_status = 'failed', updated_at = now() where id = $1`, [order.id]);
      return transition(order, "failed", "No verified payment bank account on file.");
    }
    // Not retryable — a retried payment call without an idempotency key reaching the provider
    // risks a real duplicate charge (C1, still unmerged, is what adds that key). A timeout/open
    // circuit is treated as a decline, not rethrown — the order still resolves cleanly to
    // 'failed' via the existing decline path below, instead of 500ing the whole submit.
    let paymentAck;
    try {
      paymentAck = await callProvider("mock-payment", "initiatePayment", () => paymentProvider.initiatePayment({ amount: order.amount, bankAccountId: bank.id, schemeCode: order.scheme_code, idempotencyKey: order.id }));
    } catch (err) {
      if (!isProviderUnavailable(err)) throw err;
      paymentAck = paymentProviderUnavailableOutcome();
    }
    paymentReference = paymentAck.paymentRef;
    paymentStatus = paymentAck.status;
    paymentBankAccountId = bank.id;
    await query(
      `update investment_orders set payment_reference = $2, payment_status = $3, payment_bank_account_id = $4, provider_error_code = $5, updated_at = now()
       where id = $1`,
      [order.id, paymentReference, paymentStatus, paymentBankAccountId, paymentAck.errorCode ?? null]
    );
    if (paymentStatus !== "success") {
      return transition(order, "failed", `Payment ${paymentReference} was declined.`);
    }
  }

  // Not retryable, same reasoning as initiatePayment above — no idempotency key reaches the
  // provider on this path today. A timeout/open circuit resolves to 'failed' via the existing
  // rejection path rather than throwing.
  let ack;
  try {
    ack = await callProvider("mock-investment", "placeOrder", () => investmentProvider.placeOrder({
      schemeCode: order.scheme_code, orderType: order.order_type, amount: order.amount, units: order.units,
      distributorArn: order.distributor_arn, distributorEuin: order.distributor_euin,
      folioNumber: order.folio_number, exitLoadPct: order.exit_load_pct, exitLoadAmount: order.exit_load_amount,
      relatedSchemeCode: order.related_scheme_code, switchOrderId: order.switch_order_id,
      paymentReference, idempotencyKey: order.id,
    }));
  } catch (err) {
    if (!isProviderUnavailable(err)) throw err;
    ack = investmentProviderUnavailableOutcome(err);
  }
  await query(
    `update investment_orders set provider = $2, provider_order_id = $3, provider_error_code = coalesce($4, provider_error_code), submitted_at = now(), updated_at = now()
     where id = $1`,
    [order.id, ack.provider, ack.providerOrderId, ack.rejectionCode ?? null]
  );
  const refreshed = { ...order, provider: ack.provider, provider_order_id: ack.providerOrderId, payment_reference: paymentReference, payment_status: paymentStatus, payment_bank_account_id: paymentBankAccountId };
  return transition(refreshed, ack.status === "accepted" ? "submitted" : "failed", ack.rejectionReason);
}

// The polling entry point — call on every GET so status is always as fresh as the mock timeline
// allows, without a background worker. Idempotent: calling it repeatedly on an already-terminal
// order is a safe no-op (decideNextStatus returns the same status unchanged).
export async function refreshOrderStatus(userId, orderId) {
  const order = await getOrderRaw(userId, orderId);
  if (!order) return null;
  if (order.status === "draft" || TERMINAL_STATUSES.has(order.status)) return order;

  const elapsedSeconds = (Date.now() - new Date(order.submitted_at).getTime()) / 1000;
  const next = decideNextStatus(order.status, elapsedSeconds);
  if (next === order.status) return order;
  return transition(order, next);
}

export async function listOrders(userId) {
  const r = await query(`select * from investment_orders where user_id = $1 order by created_at desc`, [userId]);
  return r.rows;
}

export async function getOrderWithTimeline(userId, orderId) {
  const order = await refreshOrderStatus(userId, orderId);
  if (!order) return null;
  const history = await query(
    `select from_status, to_status, reason, created_at from order_status_history where order_id = $1 order by created_at`,
    [orderId]
  );
  return { order, timeline: history.rows };
}

export async function cancelOrder(userId, orderId) {
  const order = await getOrderRaw(userId, orderId);
  if (!order) throw new Error("Order not found.");
  if (TERMINAL_STATUSES.has(order.status) || order.status === "units_pending") {
    throw new Error(`Order cannot be cancelled from status: ${order.status}.`);
  }
  // Cancellation is naturally idempotent (cancelling an already-cancelled order is the same end
  // state), so this is one of the few writes safe to retry automatically.
  if (order.provider_order_id) {
    await callProvider("mock-investment", "cancelOrder", () => investmentProvider.cancelOrder(order.provider_order_id), { retryable: true });
  }
  return transition(order, "cancelled");
}

export async function retryOrder(userId, orderId) {
  const existing = await getOrderRaw(userId, orderId);
  if (!existing) throw new Error("Order not found.");
  if (existing.status !== "retry_required") throw new Error(`Only an order in retry_required can be retried (current status: ${existing.status}).`);
  // C1: same claim as submitOrder — a concurrent/retried second retryOrder() call must lose this
  // race before touching the provider, not just disagree about the final status afterward.
  const order = await claimForSubmission(existing, "retry_required");
  if (!order) throw new Error("This order is already being retried.");
  // Not retryable at THIS layer for the same reason as submitOrder's placeOrder call — this IS
  // already the user-initiated retry action, so a further automatic retry-of-the-retry would only
  // compound the risk. A timeout/open circuit resolves to the existing 'failed' rejection path.
  let ack;
  try {
    ack = await callProvider("mock-investment", "placeOrder", () => investmentProvider.placeOrder({
      schemeCode: order.scheme_code, orderType: order.order_type, amount: order.amount, units: order.units,
      distributorArn: order.distributor_arn, distributorEuin: order.distributor_euin,
      idempotencyKey: order.id,
    }));
  } catch (err) {
    if (!isProviderUnavailable(err)) throw err;
    ack = investmentProviderUnavailableOutcome(err);
  }
  await query(`update investment_orders set provider_order_id = $2, submitted_at = now(), updated_at = now() where id = $1`, [order.id, ack.providerOrderId]);
  return transition(order, ack.status === "accepted" ? "submitted" : "failed", ack.rejectionReason);
}

// Explicit action only — never auto-triggered. A completed order being reversed (e.g. a bounced
// payment discovered after allotment) is rare and consequential enough to require its own call,
// not a side effect of a status poll.
export async function reverseOrder(userId, orderId, reason) {
  const order = await getOrderRaw(userId, orderId);
  if (!order) throw new Error("Order not found.");
  if (order.status !== "completed") throw new Error(`Only a completed order can be reversed (current status: ${order.status}).`);
  return transition(order, "reversed", reason ?? "Reversed.");
}

export async function createSipMandate(userId, { schemeCode, amount, frequency, startDate, endDate = null, idempotencyKey = null }) {
  await assertInvestmentReady(userId);
  if (!schemeCode || !(amount > 0) || !["monthly", "weekly", "quarterly"].includes(frequency) || !startDate) {
    throw new Error("schemeCode, amount (>0), frequency (monthly|weekly|quarterly), and startDate are required.");
  }
  // Same freeze-at-creation reasoning as createOrder — see sql/neon/017_distributor_identity.sql.
  const distributor = await getDefaultDistributorAttribution();
  const fund = getFund(schemeCode);

  // Provider Metadata: a SIP mandate is a standing NACH/UPI Autopay authorization, not itself a
  // fund movement — paymentProvider.initiateMandate() (not .initiatePayment(), which is for a
  // one-time purchase) registers that authorization. No verified bank on file is a genuine
  // precondition failure (like the field-required checks above), so that still throws. A
  // *declined* authorization is a normal, probabilistic outcome instead — same reasoning as a
  // purchase's payment decline — so it is recorded as mandate_status='failed' and returned, not
  // thrown; the investment provider is never asked to register a mandate with no real
  // authorization behind it.
  const bank = await getVerifiedBankAccount(userId);
  if (!bank) throw new Error("No verified payment bank account on file — required before setting up a SIP mandate.");

  // C1 (order idempotency): a SIP mandate has no separate draft-then-claim stage the way an
  // order does — everything (dedupe check, both provider calls, the insert) happens in this one
  // call, so the advisory lock is held across the provider calls themselves, not just around the
  // insert. Safe today because these are in-process mock providers with no real network latency;
  // revisit (adopt createOrder's draft/claim split instead) if a real, slower provider ever
  // replaces them, since holding a DB lock across a slow external call is an anti-pattern.
  const { mandate, isNew } = await withTransaction(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`sip-create:${userId}:${schemeCode}`]);

    if (idempotencyKey) {
      const byKey = await client.query(`select * from sip_mandates where user_id = $1 and idempotency_key = $2`, [userId, idempotencyKey]);
      if (byKey.rows.length > 0) return { mandate: byKey.rows[0], isNew: false };
    }
    const recent = await client.query(
      `select * from sip_mandates
       where user_id = $1 and scheme_code = $2 and amount = $3 and frequency = $4
         and created_at > now() - interval '5 seconds'
       order by created_at desc limit 1`,
      [userId, schemeCode, amount, frequency]
    );
    if (recent.rows.length > 0) return { mandate: recent.rows[0], isNew: false };

    // Not retryable — registers a new standing authorization each call. A timeout/open circuit
    // resolves to a decline, same as initiatePayment above: the mandate is recorded as
    // mandate_status='failed' via the existing decline path below, never thrown.
    let mandateAck;
    try {
      mandateAck = await callProvider("mock-payment", "initiateMandate", () => paymentProvider.initiateMandate({ amount, frequency, bankAccountId: bank.id, schemeCode, idempotencyKey }));
    } catch (err) {
      if (!isProviderUnavailable(err)) throw err;
      mandateAck = paymentProviderUnavailableOutcome();
    }

    let providerAck = { status: "failed", providerMandateId: null, provider: mandateAck.provider };
    if (mandateAck.status === "active") {
      // Not retryable/not caught: this only runs once the payment-side authorization already
      // succeeded, so a failure here is the genuine partial-failure gap M17 already tracks
      // (docs/BACKEND_TECHNICAL_DEBT.md) — not something to newly invent handling for.
      providerAck = await callProvider("mock-investment", "createSIPMandate", () => investmentProvider.createSIPMandate({
        schemeCode, amount, frequency, startDate,
        distributorArn: distributor.arn, distributorEuin: distributor.euin,
        paymentReference: mandateAck.mandateRef, idempotencyKey,
      }));
    }

    const inserted = await client.query(
      `insert into sip_mandates (
         user_id, scheme_code, amount, frequency, start_date, end_date, mandate_status,
         provider_mandate_id, provider, distributor_arn, distributor_euin,
         plan, option, payment_reference, payment_status, payment_bank_account_id, provider_error_code, idempotency_key
       )
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       returning *`,
      [
        userId, schemeCode, amount, frequency, startDate, endDate, providerAck.status, providerAck.providerMandateId, providerAck.provider, distributor.arn, distributor.euin,
        fund?.plan ?? null, fund?.option ?? null, mandateAck.mandateRef, mandateAck.status, bank.id, mandateAck.errorCode ?? null, idempotencyKey,
      ]
    );
    return { mandate: inserted.rows[0], isNew: true };
  });

  if (!isNew) return mandate; // deduped — return the existing mandate as-is, never re-run creation side effects or re-call providers
  await logAudit(userId, "sip_mandate_created", {
    schemeCode, amount, frequency, distributorArn: distributor.arn, distributorEuin: distributor.euin,
    paymentReference: mandate.payment_reference, paymentStatus: mandate.payment_status, paymentBankAccountId: bank.id,
  });
  if (mandate.mandate_status === "active") {
    await notifyUser(userId, "sip_mandate_created", { title: "SIP set up", body: `${frequency} SIP of ₹${amount} in ${schemeCode}`, relatedEntityType: "sip_mandate", relatedEntityId: mandate.id });
  }
  return mandate;
}

export async function listSipMandates(userId) {
  const r = await query(`select * from sip_mandates where user_id = $1 order by created_at desc`, [userId]);
  return r.rows;
}
