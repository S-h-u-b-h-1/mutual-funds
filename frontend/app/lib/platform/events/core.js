// Event Bus core (Phase 4 M4). A domain event is durably logged (domain_events — that write IS
// the audit trail, not a side effect of one), then fanned out two ways: to registered internal
// listeners via M1 jobs (retries/DLQ are the job platform's, not a second mechanism here), and
// to subscribed M2 outbound webhooks — the first real trigger source that dormant mechanism has
// had since it shipped. See docs/EVENT_BUS.md.
//
// emitEvent() NEVER throws to its caller. It is sprinkled into existing, already-tested
// business-logic functions (order transitions, compliance completion, ...) as an ADDITIVE
// signal alongside — never instead of — what those functions already do directly (notifyUser,
// reconcileCompletedOrder, generateDocument all stay exactly as they were). A bug or transient
// failure in the event bus must never be able to break order submission or compliance
// completion. Any failure is caught, logged, and reflected in the returned {ok:false} — callers
// don't check the result (this is a side channel, not the primary operation), so they simply
// proceed unaffected either way.
import { query } from "../../db.js";
import { enqueueJob } from "../jobs/core.js";
import { registerHandler } from "../jobs/registry.js";
import { emitOutboundEvent } from "../webhooks/core.js";
import { getListenerNames, getListenerHandler, registeredListenerSummary } from "./registry.js";

export const EVENT_TYPES = {
  InvestorCreated: "An investor opened their investment account (identityService.ensureAccount).",
  ComplianceCompleted: "A single compliance item reached 'completed' — excludes the derived investment_ready gate itself (see InvestmentReady).",
  InvestmentReady: "The derived investment_ready gate auto-completed — the investor may now transact.",
  OrderSubmitted: "An order left draft and was submitted to the investment provider.",
  OrderCompleted: "An order reached the terminal 'completed' status.",
  PortfolioUpdated: "Holdings changed — an order settled or a demo portfolio was connected.",
  DocumentGenerated: "A document was generated into the vault.",
  NotificationSent: "An in-app notification was written for a user.",
  AdvisorAssigned:
    "An investor was assigned to an advisor. NOT YET WIRED — no assignment flow exists until " +
    "Journey 5 (CRM). Registered in the catalog now so the day that flow ships, it only needs " +
    "an emitEvent() call, not a new event type or a new outbound-webhook/listener plumbing pass.",
};

export async function emitEvent(type, payload = {}, { correlationId = null, source = null } = {}) {
  if (!(type in EVENT_TYPES)) {
    console.error(`emitEvent: unknown event type '${type}' — not in the registered catalog, dropped.`);
    return { ok: false, reason: "unknown_type" };
  }
  try {
    const r = await query(
      `insert into domain_events (event_type, payload, correlation_id, source) values ($1, $2, $3, $4) returning id`,
      [type, JSON.stringify(payload), correlationId, source]
    );
    const eventId = r.rows[0].id;

    const listenerNames = getListenerNames(type);
    for (const listenerName of listenerNames) {
      await enqueueJob(
        "event-dispatch",
        { eventId, eventType: type, listenerName },
        { idempotencyKey: `event-dispatch:${eventId}:${listenerName}`, priority: 4, correlationId }
      );
    }

    // Isolated from the outer try/catch's meaning: a webhook fan-out failure must not undo the
    // fact that the event WAS durably recorded and internal listeners WERE dispatched above.
    await emitOutboundEvent(type, payload).catch((err) => {
      console.error(`emitEvent(${type}): outbound webhook fan-out failed (event still recorded, listeners still dispatched):`, err);
    });

    return { ok: true, eventId, listenersDispatched: listenerNames.length };
  } catch (err) {
    console.error(`emitEvent(${type}) failed:`, err);
    return { ok: false, reason: "internal_error", error: String(err?.message ?? err) };
  }
}

export async function getRecentEvents({ type = null, limit = 50 } = {}) {
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const r = type
    ? await query(`select * from domain_events where event_type = $1 order by created_at desc limit $2`, [type, clampedLimit])
    : await query(`select * from domain_events order by created_at desc limit $1`, [clampedLimit]);
  return r.rows;
}

/** Aggregate event-bus metrics — counts by type, listener registrations, never payloads. */
export async function getEventMetrics() {
  const [last24h, last7d] = await Promise.all([
    query(`select event_type, count(*)::int as count from domain_events where created_at > now() - interval '24 hours' group by event_type order by count desc`),
    query(`select event_type, count(*)::int as count from domain_events where created_at > now() - interval '7 days' group by event_type order by count desc`),
  ]);
  return {
    last24h: last24h.rows,
    last7d: last7d.rows,
    catalog: Object.keys(EVENT_TYPES),
    registeredListeners: registeredListenerSummary(),
  };
}

// The single job type every dispatched listener call uses.
registerHandler("event-dispatch", async ({ eventId, eventType, listenerName }) => {
  const eventRow = await query(`select * from domain_events where id = $1`, [eventId]);
  const event = eventRow.rows[0];
  if (!event) throw new Error(`event-dispatch: domain event ${eventId} not found.`);
  const handler = getListenerHandler(eventType, listenerName);
  if (!handler) throw new Error(`event-dispatch: no listener '${listenerName}' registered for '${eventType}'.`);
  return await handler(event.payload, { event });
});
