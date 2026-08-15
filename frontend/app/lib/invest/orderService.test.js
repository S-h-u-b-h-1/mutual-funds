import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import * as orderService from "./orderService.js";
import { query } from "../db.js";
import { makeInvestmentReadyUser, createTestUser, deleteTestUser } from "./testHelpers.js";

afterEach(() => vi.restoreAllMocks());

describe("decideNextStatus (pure logic, no DB)", () => {
  it("stays submitted before the processing threshold", () => {
    expect(orderService.decideNextStatus("submitted", 0)).toBe("submitted");
    expect(orderService.decideNextStatus("submitted", 3.9)).toBe("submitted");
  });

  it("advances to processing, then units_pending, as elapsed time crosses each threshold", () => {
    expect(orderService.decideNextStatus("submitted", 4)).toBe("processing");
    expect(orderService.decideNextStatus("processing", 9.9)).toBe("processing");
    expect(orderService.decideNextStatus("processing", 10)).toBe("units_pending");
  });

  it("never regresses even if called with an earlier status than the elapsed time justifies", () => {
    // e.g. a stale in-memory read racing a concurrent update — decideNextStatus always computes
    // from elapsed time, so it can only move forward, never back to an earlier stage.
    expect(orderService.decideNextStatus("submitted", 25)).not.toBe("submitted");
  });

  it("resolves to a terminal-ish outcome past the resolve threshold, weighted toward completed", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(orderService.decideNextStatus("units_pending", 18)).toBe("completed");

    vi.spyOn(Math, "random").mockReturnValue(0.85);
    expect(orderService.decideNextStatus("units_pending", 18)).toBe("retry_required");

    vi.spyOn(Math, "random").mockReturnValue(0.95);
    expect(orderService.decideNextStatus("units_pending", 18)).toBe("failed");
  });

  it("never auto-advances a terminal or retry_required order, regardless of elapsed time", () => {
    for (const terminal of ["completed", "failed", "cancelled", "reversed", "retry_required"]) {
      expect(orderService.decideNextStatus(terminal, 999)).toBe(terminal);
    }
  });
});

describe("orderService (integration, real Neon, disposable investment-ready user)", () => {
  let readyUserId;
  let freshUserId;

  beforeAll(async () => {
    readyUserId = await makeInvestmentReadyUser("order-ready");
    freshUserId = await createTestUser("order-fresh");
  }, 120000);

  afterAll(async () => {
    await deleteTestUser(readyUserId);
    await deleteTestUser(freshUserId);
  });

  it("refuses to place an order for a user who hasn't completed compliance", async () => {
    await expect(orderService.createOrder(freshUserId, {
      schemeCode: "108273", orderType: "purchase", amount: 5000,
    })).rejects.toThrow(/Compliance must be fully completed/);
  });

  it("validates order input before touching the provider", async () => {
    await expect(orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "not_a_type", amount: 100 }))
      .rejects.toThrow(/orderType must be one of/);
    await expect(orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase" }))
      .rejects.toThrow(/Either amount or units/);
    await expect(orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "switch_in", amount: 100 }))
      .rejects.toThrow(/relatedSchemeCode is required/);
  });

  // Backend Hardening (2026-07-24): amount/units were only null-checked before this — a
  // negative or zero value reached the provider/DB layer unvalidated.
  it("rejects a negative or zero amount/units before touching the provider", async () => {
    await expect(orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 0 }))
      .rejects.toThrow(/amount must be greater than 0/);
    await expect(orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: -500 }))
      .rejects.toThrow(/amount must be greater than 0/);
    await expect(orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", units: -1 }))
      .rejects.toThrow(/units must be greater than 0/);
  });

  it("draft:true creates without submitting (no provider call, stays in draft)", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 5000, draft: true });
    expect(order.status).toBe("draft");
    expect(order.provider_order_id).toBeNull();
  });

  it("submitOrder re-checks readiness at submit time, not just at draft creation (Auth+onboarding truth audit, Phase 1/12)", async () => {
    // A dedicated user, not readyUserId — this test destructively removes the investment account
    // to simulate a readiness regression between draft creation and submission, so it must not
    // share state with any other test in this file.
    const regressUserId = await makeInvestmentReadyUser("order-readiness-regress");
    try {
      const draft = await orderService.createOrder(regressUserId, { schemeCode: "108273", orderType: "purchase", amount: 5000, draft: true });
      expect(draft.status).toBe("draft");

      // Simulates the account becoming unavailable after the draft was created (nothing in
      // today's product actually does this yet — see assertInvestmentReady's own comment — but
      // submitOrder must not blindly trust "was ready when the draft was made" regardless).
      await query(`delete from investment_accounts where user_id = $1`, [regressUserId]);

      await expect(orderService.submitOrder(regressUserId, draft.id)).rejects.toThrow(/investment account is required/);

      // The order itself must stay in draft, not silently transition — a rejected readiness
      // check is not the same thing as a provider decline.
      const stillDraft = await orderService.getOrderRaw(regressUserId, draft.id);
      expect(stillDraft.status).toBe("draft");
    } finally {
      await deleteTestUser(regressUserId);
    }
  });

  it("creates and immediately submits by default, writing a timeline entry", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 5000 });
    expect(["submitted", "failed"]).toContain(order.status); // mock gateway rejects ~8% of the time by design

    const { timeline } = await orderService.getOrderWithTimeline(readyUserId, order.id);
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline[0].to_status).toBe(order.status);
  });

  it("C1: two concurrent createOrder calls with the same idempotencyKey create exactly one order", async () => {
    const idempotencyKey = `concurrency-key-${Date.now()}-${Math.random()}`;
    const [a, b] = await Promise.all([
      orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 6001, idempotencyKey }),
      orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 6001, idempotencyKey }),
    ]);
    expect(a.id).toBe(b.id);
    const orders = await orderService.listOrders(readyUserId);
    expect(orders.filter((o) => o.idempotency_key === idempotencyKey)).toHaveLength(1);
  });

  it("C1: two concurrent createOrder calls with identical content and NO idempotencyKey are still deduped to one order", async () => {
    // The backend-native backstop — proves duplicate-submit protection does not depend on the
    // caller ever sending an idempotencyKey ("do not rely solely on frontend button disabling").
    const [a, b] = await Promise.all([
      orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 6002 }),
      orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 6002 }),
    ]);
    expect(a.id).toBe(b.id);
    const orders = await orderService.listOrders(readyUserId);
    const matching = orders.filter((o) => o.scheme_code === "108273" && o.order_type === "purchase" && Number(o.amount) === 6002);
    expect(matching).toHaveLength(1);
  });

  it("C1: two concurrent submitOrder calls on the same draft order — only one reaches the provider, the other is refused", async () => {
    const draft = await orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 6003, draft: true });
    const results = await Promise.allSettled([
      orderService.submitOrder(readyUserId, draft.id),
      orderService.submitOrder(readyUserId, draft.id),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(["submitted", "failed"]).toContain(fulfilled[0].value.status);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toMatch(/already been submitted/);

    // Exactly one payment attempt actually happened — not two — which is the real financial
    // claim this test exists to verify, not just "the two calls disagreed."
    const { timeline } = await orderService.getOrderWithTimeline(readyUserId, draft.id);
    expect(timeline.filter((t) => t.to_status === "submitted" || t.to_status === "failed")).toHaveLength(1);
  });

  it("GET-equivalent refresh never regresses a terminal order and is safe to call repeatedly", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 1000 });
    if (order.status === "failed") return; // hit the ~8% immediate-rejection branch — nothing to progress, test the other path next run
    const first = await orderService.refreshOrderStatus(readyUserId, order.id);
    const second = await orderService.refreshOrderStatus(readyUserId, order.id);
    expect(second.status).toBe(first.status); // no time has meaningfully passed between these two calls
  });

  it("cancelling a submitted order works; cancelling a cancelled order does not", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 2000 });
    if (order.status === "failed") return;
    const cancelled = await orderService.cancelOrder(readyUserId, order.id);
    expect(cancelled.status).toBe("cancelled");
    await expect(orderService.cancelOrder(readyUserId, order.id)).rejects.toThrow(/cannot be cancelled/);
  });

  it("one user cannot see or act on another user's order", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 3000 });
    const asOtherUser = await orderService.getOrderRaw(freshUserId, order.id);
    expect(asOtherUser).toBeNull();
  });

  it("creates a SIP mandate for an investment-ready user, rejects for one who isn't", async () => {
    const sip = await orderService.createSipMandate(readyUserId, {
      schemeCode: "108273", amount: 2000, frequency: "monthly", startDate: "2026-08-01",
    });
    // Provider Metadata: mandate_status now reflects a real (mock) payment-authorization
    // outcome — paymentProvider.initiateMandate() rejects ~5% of the time by design, same
    // weighted-outcome pattern as the investment provider's own ~8% order-rejection rate.
    expect(["active", "failed"]).toContain(sip.mandate_status);
    if (sip.mandate_status === "active") expect(sip.provider_mandate_id).toMatch(/^mandate_/);
    expect(sip.payment_reference).toMatch(/^mandate_/);

    await expect(orderService.createSipMandate(freshUserId, {
      schemeCode: "108273", amount: 2000, frequency: "monthly", startDate: "2026-08-01",
    })).rejects.toThrow(/Compliance must be fully completed/);
  });

  // Provider Metadata (sql/neon/021_provider_metadata.sql) — plan/option are a scheme snapshot
  // (populated regardless of payment/provider outcome); the payment_* fields are only meaningful
  // for a purchase order/SIP mandate, since redemption/switch never go through submitOrder's
  // purchase-payment branch (see submitOrder's own comment on why).
  it("stamps Provider Metadata fields (plan/option/payment) on a purchase order and a SIP mandate", async () => {
    const draft = await orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 1200, draft: true });
    expect(draft.plan).toBeTruthy();
    expect(draft.option).toBeTruthy();

    const submitted = await orderService.submitOrder(readyUserId, draft.id);
    expect(submitted.payment_reference).toMatch(/^pay_/);
    expect(["success", "declined"]).toContain(submitted.payment_status);
    expect(submitted.payment_bank_account_id).toBeTruthy();

    const sip = await orderService.createSipMandate(readyUserId, {
      schemeCode: "108273", amount: 1500, frequency: "monthly", startDate: "2026-08-01",
    });
    expect(sip.plan).toBeTruthy();
    expect(sip.option).toBeTruthy();
    expect(sip.payment_bank_account_id).toBeTruthy();
  });

  // Real production values (sql/neon/017_distributor_identity.sql) — not fixtures. An order or
  // mandate placed with no distributor attribution at all would be a genuine data-integrity gap,
  // not just a missing-nice-to-have field, so this asserts the real values, not just "truthy".
  it("stamps the real Suasion Securities distributor attribution on every order and SIP mandate at creation", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "108273", orderType: "purchase", amount: 1500, draft: true });
    expect(order.distributor_arn).toBe("289322");
    expect(order.distributor_euin).toBe("E544323");

    const sip = await orderService.createSipMandate(readyUserId, {
      schemeCode: "108273", amount: 1000, frequency: "monthly", startDate: "2026-09-01",
    });
    expect(sip.distributor_arn).toBe("289322");
    expect(sip.distributor_euin).toBe("E544323");
  });
}, 180000);
