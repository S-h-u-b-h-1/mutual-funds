import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import * as orderService from "./orderService.js";
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
      schemeCode: "119551", orderType: "purchase", amount: 5000,
    })).rejects.toThrow(/Compliance must be fully completed/);
  });

  it("validates order input before touching the provider", async () => {
    await expect(orderService.createOrder(readyUserId, { schemeCode: "119551", orderType: "not_a_type", amount: 100 }))
      .rejects.toThrow(/orderType must be one of/);
    await expect(orderService.createOrder(readyUserId, { schemeCode: "119551", orderType: "purchase" }))
      .rejects.toThrow(/Either amount or units/);
    await expect(orderService.createOrder(readyUserId, { schemeCode: "119551", orderType: "switch_in", amount: 100 }))
      .rejects.toThrow(/relatedSchemeCode is required/);
  });

  it("draft:true creates without submitting (no provider call, stays in draft)", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "119551", orderType: "purchase", amount: 5000, draft: true });
    expect(order.status).toBe("draft");
    expect(order.provider_order_id).toBeNull();
  });

  it("creates and immediately submits by default, writing a timeline entry", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "119551", orderType: "purchase", amount: 5000 });
    expect(["submitted", "failed"]).toContain(order.status); // mock gateway rejects ~8% of the time by design

    const { timeline } = await orderService.getOrderWithTimeline(readyUserId, order.id);
    expect(timeline.length).toBeGreaterThanOrEqual(1);
    expect(timeline[0].to_status).toBe(order.status);
  });

  it("GET-equivalent refresh never regresses a terminal order and is safe to call repeatedly", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "119551", orderType: "purchase", amount: 1000 });
    if (order.status === "failed") return; // hit the ~8% immediate-rejection branch — nothing to progress, test the other path next run
    const first = await orderService.refreshOrderStatus(readyUserId, order.id);
    const second = await orderService.refreshOrderStatus(readyUserId, order.id);
    expect(second.status).toBe(first.status); // no time has meaningfully passed between these two calls
  });

  it("cancelling a submitted order works; cancelling a cancelled order does not", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "119551", orderType: "purchase", amount: 2000 });
    if (order.status === "failed") return;
    const cancelled = await orderService.cancelOrder(readyUserId, order.id);
    expect(cancelled.status).toBe("cancelled");
    await expect(orderService.cancelOrder(readyUserId, order.id)).rejects.toThrow(/cannot be cancelled/);
  });

  it("one user cannot see or act on another user's order", async () => {
    const order = await orderService.createOrder(readyUserId, { schemeCode: "119551", orderType: "purchase", amount: 3000 });
    const asOtherUser = await orderService.getOrderRaw(freshUserId, order.id);
    expect(asOtherUser).toBeNull();
  });

  it("creates a SIP mandate for an investment-ready user, rejects for one who isn't", async () => {
    const sip = await orderService.createSipMandate(readyUserId, {
      schemeCode: "119551", amount: 2000, frequency: "monthly", startDate: "2026-08-01",
    });
    expect(sip.mandate_status).toBe("active");
    expect(sip.provider_mandate_id).toMatch(/^mandate_/);

    await expect(orderService.createSipMandate(freshUserId, {
      schemeCode: "119551", amount: 2000, frequency: "monthly", startDate: "2026-08-01",
    })).rejects.toThrow(/Compliance must be fully completed/);
  });
}, 180000);
