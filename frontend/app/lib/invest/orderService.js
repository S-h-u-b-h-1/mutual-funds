// Journey 2 — Order Management. Order lifecycle: draft -> submitted -> processing ->
// units_pending -> completed | failed | retry_required, plus cancelled (from any non-terminal
// state) and reversed (an explicit action on a completed order). Backs
// docs/INVEST_PLATFORM_ARCHITECTURE.md §7 and the Phase 1 brief's Module 6 lifecycle.
import { query } from "../db.js";
import { investmentProvider } from "./providers/index.js";
import { logAudit } from "./audit.js";
import { notifyUser } from "./notifications.js";
import { emitEvent } from "../platform/events/core.js";
import { getComplianceProgress } from "./complianceService.js";
import { getAccount } from "./identityService.js";
import { reconcileCompletedOrder } from "./portfolioService.js";
import { generateDocument } from "./documentService.js";
import { getDefaultDistributorAttribution } from "../platform/distributor/core.js";

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
  const r = await query(
    `update investment_orders set status = $2, rejection_reason = coalesce($3, rejection_reason), updated_at = now()
     where id = $1 returning *`,
    [order.id, toStatus, reason]
  );
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
  if (toStatus === "completed") {
    await reconcileCompletedOrder(r.rows[0]);
    // Journey 4: a real brokerage issues a contract note on settlement — same idea here, into
    // the same document vault a CAS upload or a KYC PDF would land in.
    await generateDocument(order.user_id, {
      docType: "investment_confirmation",
      title: `Investment Confirmation — ${order.order_type} ${order.scheme_code}`,
      relatedEntityType: "order",
      relatedEntityId: order.id,
      metadata: { distributorArn: order.distributor_arn, distributorEuin: order.distributor_euin },
    });
    await emitEvent("OrderCompleted", { orderId: order.id, userId: order.user_id, orderType: order.order_type, schemeCode: order.scheme_code }, { correlationId: order.id, source: "orderService" });
  }
  return r.rows[0];
}

async function assertInvestmentReady(userId) {
  const [progress, account] = await Promise.all([getComplianceProgress(userId), getAccount(userId)]);
  if (progress.overallStatus !== "completed") {
    throw new Error("Compliance must be fully completed before placing an order.");
  }
  if (!account || account.status !== "active") {
    throw new Error("An active investment account is required before placing an order.");
  }
}

function validateOrderInput({ schemeCode, orderType, amount, units, relatedSchemeCode }) {
  if (!schemeCode) throw new Error("schemeCode is required.");
  if (!ORDER_TYPES.includes(orderType)) throw new Error(`orderType must be one of: ${ORDER_TYPES.join(", ")}`);
  if (amount == null && units == null) throw new Error("Either amount or units is required.");
  if ((orderType === "switch_in" || orderType === "switch_out") && !relatedSchemeCode) {
    throw new Error("relatedSchemeCode is required for switch orders.");
  }
}

export async function createOrder(userId, input) {
  validateOrderInput(input);
  await assertInvestmentReady(userId);
  const { schemeCode, relatedSchemeCode = null, orderType, amount = null, units = null, draft = false } = input;

  // Distributor attribution is stamped once, here, at creation — not re-derived later. It's a
  // snapshot of who gets commission/audit credit for this specific order, so it must freeze at
  // the moment the order comes into existence, matching every other provider_reference-style
  // column in this schema (see sql/neon/017_distributor_identity.sql). No advisor context is
  // passed into createOrder today, so this always resolves to the default distributor EUIN.
  const distributor = await getDefaultDistributorAttribution();

  const r = await query(
    `insert into investment_orders (user_id, scheme_code, related_scheme_code, order_type, amount, units, status, distributor_arn, distributor_euin)
     values ($1, $2, $3, $4, $5, $6, 'draft', $7, $8)
     returning *`,
    [userId, schemeCode, relatedSchemeCode, orderType, amount, units, distributor.arn, distributor.euin]
  );
  const order = r.rows[0];
  await logAudit(userId, "order_created", { orderId: order.id, orderType, schemeCode, distributorArn: distributor.arn, distributorEuin: distributor.euin });
  if (draft) return order;
  return submitOrder(userId, order.id);
}

export async function getOrderRaw(userId, orderId) {
  const r = await query(`select * from investment_orders where id = $1 and user_id = $2`, [orderId, userId]);
  return r.rows[0] ?? null;
}

export async function submitOrder(userId, orderId) {
  const order = await getOrderRaw(userId, orderId);
  if (!order) throw new Error("Order not found.");
  if (order.status !== "draft") throw new Error(`Only a draft order can be submitted (current status: ${order.status}).`);

  const ack = await investmentProvider.placeOrder({
    schemeCode: order.scheme_code, orderType: order.order_type, amount: order.amount, units: order.units,
    distributorArn: order.distributor_arn, distributorEuin: order.distributor_euin,
  });
  await query(
    `update investment_orders set provider = $2, provider_order_id = $3, submitted_at = now(), updated_at = now()
     where id = $1`,
    [order.id, ack.provider, ack.providerOrderId]
  );
  const refreshed = { ...order, provider: ack.provider, provider_order_id: ack.providerOrderId };
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
  if (order.provider_order_id) await investmentProvider.cancelOrder(order.provider_order_id);
  return transition(order, "cancelled");
}

export async function retryOrder(userId, orderId) {
  const order = await getOrderRaw(userId, orderId);
  if (!order) throw new Error("Order not found.");
  if (order.status !== "retry_required") throw new Error(`Only an order in retry_required can be retried (current status: ${order.status}).`);
  const ack = await investmentProvider.placeOrder({
    schemeCode: order.scheme_code, orderType: order.order_type, amount: order.amount, units: order.units,
    distributorArn: order.distributor_arn, distributorEuin: order.distributor_euin,
  });
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

export async function createSipMandate(userId, { schemeCode, amount, frequency, startDate, endDate = null }) {
  await assertInvestmentReady(userId);
  if (!schemeCode || !(amount > 0) || !["monthly", "weekly", "quarterly"].includes(frequency) || !startDate) {
    throw new Error("schemeCode, amount (>0), frequency (monthly|weekly|quarterly), and startDate are required.");
  }
  // Same freeze-at-creation reasoning as createOrder — see sql/neon/017_distributor_identity.sql.
  const distributor = await getDefaultDistributorAttribution();
  const ack = await investmentProvider.createSIPMandate({
    schemeCode, amount, frequency, startDate,
    distributorArn: distributor.arn, distributorEuin: distributor.euin,
  });
  const r = await query(
    `insert into sip_mandates (user_id, scheme_code, amount, frequency, start_date, end_date, mandate_status, provider_mandate_id, provider, distributor_arn, distributor_euin)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning *`,
    [userId, schemeCode, amount, frequency, startDate, endDate, ack.status, ack.providerMandateId, ack.provider, distributor.arn, distributor.euin]
  );
  await logAudit(userId, "sip_mandate_created", { schemeCode, amount, frequency, distributorArn: distributor.arn, distributorEuin: distributor.euin });
  await notifyUser(userId, "sip_mandate_created", { title: "SIP set up", body: `${frequency} SIP of ₹${amount} in ${schemeCode}`, relatedEntityType: "sip_mandate", relatedEntityId: r.rows[0].id });
  return r.rows[0];
}

export async function listSipMandates(userId) {
  const r = await query(`select * from sip_mandates where user_id = $1 order by created_at desc`, [userId]);
  return r.rows;
}
