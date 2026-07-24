// Event Bus tests (Phase 4 M4) — real Neon. Two halves: core mechanism tests (using real
// catalog event types + temporary test-named listeners, since emitEvent validates against a
// FIXED catalog — unlike jobs/reconciliation, event TYPES aren't free-form, only listener
// NAMES are), and wiring-regression tests that exercise the real identityService/
// complianceService/orderService/portfolioService/documentService/notifications call sites
// this milestone added emitEvent() to, proving the additive wiring didn't break anything and
// genuinely fires the right events.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import http from "node:http";
import { query } from "../../db.js";
import { emitEvent, getRecentEvents, getEventMetrics, EVENT_TYPES } from "./core.js";
import { registerEventListener } from "./registry.js";
import { runWorkerTick } from "../jobs/core.js";
import "../jobs/handlers/index.js"; // full production handler + listener set
import { acquireClaimTestLock, releaseClaimTestLock } from "../jobs/testClaimLock.js";
import { createTestUser, deleteTestUser, makeInvestmentReadyUser } from "../../invest/testHelpers.js";
import * as orderService from "../../invest/orderService.js";
import * as portfolioService from "../../invest/portfolioService.js";
import * as documentService from "../../invest/documentService.js";
import { notifyUser } from "../../invest/notifications.js";

const RUN = crypto.randomBytes(3).toString("hex");
const testUserIds = [];

// This file calls runWorkerTick() (draining the SHARED jobs table) in several tests — see
// jobs/testClaimLock.js for why that races jobPlatform.test.js/webhookPlatform.test.js under
// Vitest's file parallelism without this same lock, and why it must be the direct (non-pooled)
// connection.
beforeAll(async () => {
  await acquireClaimTestLock();
});

afterAll(async () => {
  // Wiring tests above call real service functions (makeInvestmentReadyUser, orderService, ...)
  // which emit real events. Every registerEventListener() call in this file (test-listener-*)
  // stays attached to its event type for the rest of the file's run — including later wiring
  // tests unrelated to the sub-test that registered it — so emissions after that point enqueue
  // extra event-dispatch jobs this file never explicitly drains. Flush everything due before
  // releasing the lock, while this process still has the full production handler set imported
  // (line 15): the shared `jobs` table jobPlatform.test.js ticks next must not inherit stray
  // rows it has no handler for. Never let a drain failure orphan the advisory lock.
  try {
    await runWorkerTick({ workerId: `test-events-${RUN}-final-drain`, maxJobs: 200, timeBudgetMs: 30000 });
  } catch (err) {
    console.error("eventBus.test.js final drain failed (non-fatal, releasing lock anyway):", err);
  }
  await releaseClaimTestLock();
});

afterAll(async () => {
  await query(`delete from domain_events where correlation_id = any($1)`, [testUserIds]);
  for (const id of testUserIds) await query(`delete from users where id = $1`, [id]);
});

describe("EVENT_TYPES catalog", () => {
  it("documents exactly the 9 events from the brief, including the not-yet-wired one", () => {
    expect(Object.keys(EVENT_TYPES).sort()).toEqual(
      [
        "AdvisorAssigned", "ComplianceCompleted", "DocumentGenerated", "InvestmentReady",
        "InvestorCreated", "NotificationSent", "OrderCompleted", "OrderSubmitted", "PortfolioUpdated",
      ].sort()
    );
    expect(EVENT_TYPES.AdvisorAssigned).toMatch(/NOT YET WIRED/);
  });
});

describe("emitEvent core mechanics (integration, real Neon)", () => {
  it("an unknown event type is rejected without throwing and without writing a row", async () => {
    // Scoped to a marker unique to this test run, not a whole-table count: dozens of other
    // files in the full suite emit real events concurrently (that's the whole point of M4's
    // wiring), so a global count(*) before/after comparison races against every one of them.
    const marker = `evt-${RUN}-unknown-type-check`;
    const result = await emitEvent("NotARealEvent", {}, { correlationId: marker });
    expect(result).toEqual({ ok: false, reason: "unknown_type" });
    const after = await query(`select count(*)::int as c from domain_events where correlation_id = $1`, [marker]);
    expect(after.rows[0].c).toBe(0);
  });

  it("never throws even on a genuine internal error (unserializable payload) — returns {ok:false} instead", async () => {
    const circular = {};
    circular.self = circular;
    const result = await emitEvent("NotificationSent", circular);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("internal_error");
  });

  it("persists type/payload/correlationId/source and dispatches to every registered listener as a job", async () => {
    const marker = `evt-${RUN}-basic`;
    let received = null;
    registerEventListener("NotificationSent", `test-listener-${RUN}-a`, async (payload) => {
      if (payload.marker === marker) received = payload;
      return { ok: true };
    });

    const result = await emitEvent("NotificationSent", { marker, userId: "u1" }, { correlationId: marker, source: "test" });
    expect(result.ok).toBe(true);
    expect(result.listenersDispatched).toBeGreaterThanOrEqual(1);

    const row = await query(`select * from domain_events where id = $1`, [result.eventId]);
    expect(row.rows[0]).toMatchObject({ event_type: "NotificationSent", correlation_id: marker, source: "test" });
    expect(row.rows[0].payload).toEqual({ marker, userId: "u1" });

    const job = await query(`select * from jobs where idempotency_key = $1`, [`event-dispatch:${result.eventId}:test-listener-${RUN}-a`]);
    expect(job.rows.length).toBe(1);
    expect(job.rows[0].type).toBe("event-dispatch");
    // Backend Hardening (2026-07-24): emitEvent() previously omitted correlationId from its own
    // enqueueJob() call, so every event-dispatch job's correlation_id was NULL even though the
    // domain_events row it came from had one — silently breaking cross-table trace lookups.
    expect(job.rows[0].correlation_id).toBe(marker);

    await runWorkerTick({ workerId: `test-events-${RUN}`, maxJobs: 50 });
    expect(received).toEqual({ marker, userId: "u1" });

    await query(`delete from domain_events where id = $1`, [result.eventId]);
  });

  it("a listener registered for a DIFFERENT event type is never dispatched", async () => {
    const marker = `evt-${RUN}-isolation`;
    let wronglyCalled = false;
    registerEventListener("DocumentGenerated", `test-listener-${RUN}-b`, async () => {
      wronglyCalled = true;
    });
    const { eventId } = await emitEvent("NotificationSent", { marker });
    const job = await query(
      `select count(*)::int as c from jobs where idempotency_key = $1`,
      [`event-dispatch:${eventId}:test-listener-${RUN}-b`]
    );
    expect(job.rows[0].c).toBe(0);
    await runWorkerTick({ workerId: `test-events-${RUN}`, maxJobs: 50 });
    expect(wronglyCalled).toBe(false);
    await query(`delete from domain_events where id = $1`, [eventId]);
  });

  it("fans out to a subscribed M2 outbound webhook — the first real trigger source that mechanism has had", async () => {
    const received = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push(JSON.parse(body));
        res.writeHead(200).end("ok");
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    try {
      const listener = await query(
        `insert into webhook_outbound (name, url, event_types) values ($1, $2, $3) returning id`,
        [`test-${RUN}-events-outbound`, `http://127.0.0.1:${port}/hook`, JSON.stringify(["DocumentGenerated"])]
      );
      const marker = `evt-${RUN}-outbound`;
      await emitEvent("DocumentGenerated", { marker }, { source: "test" });
      await runWorkerTick({ workerId: `test-events-${RUN}`, maxJobs: 50 });
      expect(received.some((r) => r.payload?.marker === marker)).toBe(true);
      expect(received.find((r) => r.payload?.marker === marker).event).toBe("DocumentGenerated");
      await query(`delete from webhook_outbound where id = $1`, [listener.rows[0].id]);
    } finally {
      server.close();
    }
  });
});

describe("getRecentEvents / getEventMetrics", () => {
  it("getRecentEvents filters by type and respects limit", async () => {
    const marker = `evt-${RUN}-recent`;
    const { eventId } = await emitEvent("NotificationSent", { marker });
    const rows = await getRecentEvents({ type: "NotificationSent", limit: 5 });
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(rows.some((r) => r.id === eventId)).toBe(true);
    await query(`delete from domain_events where id = $1`, [eventId]);
  });

  it("getEventMetrics aggregates by type over 24h/7d and lists the catalog + registered listeners, without leaking payloads", async () => {
    const marker = `evt-${RUN}-metrics-${crypto.randomBytes(2).toString("hex")}`;
    const { eventId } = await emitEvent("NotificationSent", { marker });
    const metrics = await getEventMetrics();
    expect(metrics.catalog).toContain("NotificationSent");
    expect(metrics.last24h.some((r) => r.event_type === "NotificationSent")).toBe(true);
    expect(metrics.registeredListeners.InvestmentReady).toContain("notify-investor");
    expect(JSON.stringify(metrics)).not.toMatch(marker);
    await query(`delete from domain_events where id = $1`, [eventId]);
  });
});

describe("real wiring (integration, real Neon) — the additive emitEvent() calls in existing services", () => {
  it("ensureAccount emits InvestorCreated; the full compliance flow emits ComplianceCompleted per item and InvestmentReady once", async () => {
    // makeInvestmentReadyUser drives 8 real compliance-item submissions (each with its own
    // OTP/verification round-trips, now each also carrying an emitEvent() round-trip) —
    // orderService.test.js's own use of this same helper needs a 120s beforeAll timeout for
    // the base flow alone; measured at 120s+ here with the added event-emission overhead, so
    // matching orderService.test.js's describe-level 180s precedent instead of its 120s one.
    const userId = await makeInvestmentReadyUser(`events-${RUN}`);
    testUserIds.push(userId);

    const events = await query(`select event_type, payload from domain_events where correlation_id = $1 order by created_at`, [userId]);
    const byType = events.rows.reduce((acc, r) => {
      (acc[r.event_type] ??= []).push(r.payload);
      return acc;
    }, {});

    expect(byType.InvestorCreated?.length).toBe(1);
    expect(byType.InvestorCreated[0]).toMatchObject({ userId });

    // 8 submitItem calls in makeInvestmentReadyUser, all forced onto their success branch —
    // every one of them lands on a DONE_STATUSES status, so all 8 fire ComplianceCompleted.
    expect(byType.ComplianceCompleted?.length).toBe(8);
    expect(byType.ComplianceCompleted.map((p) => p.itemKey).sort()).toEqual(
      ["bank", "email", "fatca", "identity", "mobile", "nominee", "pan", "risk_profile"].sort()
    );

    expect(byType.InvestmentReady?.length).toBe(1);

    // NotificationSent fires on every notifyUser call this flow makes (order-adjacent
    // notifications aren't part of this flow, but the InvestmentReady listener's own
    // notifyUser call lands async via the job platform — drain it, then check).
    await runWorkerTick({ workerId: `test-events-${RUN}`, maxJobs: 50 });
    const notif = await query(
      `select 1 from notifications where user_id = $1 and type = 'investment_ready'`,
      [userId]
    );
    expect(notif.rows.length).toBe(1); // the decoupled listener's real, new behavior
  }, 180000);

  it("order transition to submitted/completed emits OrderSubmitted/OrderCompleted; settlement emits PortfolioUpdated; confirmation emits DocumentGenerated", async () => {
    const userId = await makeInvestmentReadyUser(`events-order-${RUN}`);
    testUserIds.push(userId);

    // createOrder returns the order row directly and submits immediately unless draft:true —
    // ~8% of the time the mock gateway rejects at submission (order lands on 'failed', never
    // 'submitted'; see MockInvestmentProvider), so OrderSubmitted only fires for the attempt
    // that actually reached 'submitted'. Reaching 'completed' from there needs real elapsed
    // wall-clock time (refreshOrderStatus's clock is submitted_at, not a counter) AND only
    // lands there ~80% of the time (vs retry_required/failed) — waiting for both would make
    // this test slow AND flaky. Backdate submitted_at past the resolve threshold so ONE
    // refreshOrderStatus call resolves immediately, and loop fresh orders (bounded, cheap)
    // until one clears BOTH branches, asserting only against the attempt that succeeded.
    let order;
    for (let attempt = 0; attempt < 10; attempt++) {
      order = await orderService.createOrder(userId, { schemeCode: "120465", orderType: "purchase", amount: 5000 });
      if (order.status !== "submitted") continue; // hit the ~8% immediate-rejection branch — try again
      await query(`update investment_orders set submitted_at = now() - interval '30 seconds' where id = $1`, [order.id]);
      order = await orderService.refreshOrderStatus(userId, order.id);
      if (order.status === "completed") break;
    }
    expect(order.status).toBe("completed");

    const submittedEvents = await query(`select payload from domain_events where event_type = 'OrderSubmitted' and correlation_id = $1`, [order.id]);
    expect(submittedEvents.rows.length).toBe(1);

    const completedEvents = await query(`select payload from domain_events where event_type = 'OrderCompleted' and correlation_id = $1`, [order.id]);
    expect(completedEvents.rows.length).toBe(1);
    expect(completedEvents.rows[0].payload).toMatchObject({ orderId: order.id, userId });

    const portfolioEvents = await query(
      `select payload from domain_events where event_type = 'PortfolioUpdated' and correlation_id = $1 and payload->>'reason' = 'order_settled'`,
      [userId]
    );
    expect(portfolioEvents.rows.length).toBe(1);

    const docEvents = await query(`select payload from domain_events where event_type = 'DocumentGenerated' and correlation_id = $1`, [userId]);
    expect(docEvents.rows.some((r) => r.payload.relatedEntityId === order.id)).toBe(true);
  }, 180000);

  it("connectMockPortfolio emits PortfolioUpdated with reason mock_connected", async () => {
    const userId = await makeInvestmentReadyUser(`events-portfolio-${RUN}`);
    testUserIds.push(userId);
    await portfolioService.connectMockPortfolio(userId);
    const events = await query(
      `select payload from domain_events where event_type = 'PortfolioUpdated' and correlation_id = $1 and payload->>'reason' = 'mock_connected'`,
      [userId]
    );
    expect(events.rows.length).toBe(1);
    expect(events.rows[0].payload.holdingsInserted).toBeGreaterThan(0);
  }, 120000);

  it("generateDocument emits DocumentGenerated directly (not just via order settlement)", async () => {
    const userId = await createTestUser(`events-doc-${RUN}`);
    testUserIds.push(userId);
    const doc = await documentService.generateDocument(userId, { docType: "tax_statement" });
    const events = await query(
      `select payload from domain_events where event_type = 'DocumentGenerated' and correlation_id = $1`,
      [userId]
    );
    expect(events.rows.length).toBe(1);
    expect(events.rows[0].payload).toMatchObject({ userId, documentId: doc.id, docType: "tax_statement" });
  });

  it("notifyUser emits NotificationSent for every call, including from within this same test suite's own paths", async () => {
    const userId = await createTestUser(`events-notif-${RUN}`);
    testUserIds.push(userId);
    await notifyUser(userId, "test_notification", { title: "Hello" });
    const events = await query(
      `select payload from domain_events where event_type = 'NotificationSent' and correlation_id = $1`,
      [userId]
    );
    expect(events.rows.length).toBe(1);
    expect(events.rows[0].payload).toMatchObject({ userId, type: "test_notification", title: "Hello" });
  });
});
