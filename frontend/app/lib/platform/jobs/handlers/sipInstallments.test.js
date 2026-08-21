import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { query } from "../../../db.js";
import { makeInvestmentReadyUser, deleteTestUser } from "../../../invest/testHelpers.js";
import * as orderService from "../../../invest/orderService.js";
import { sipInstallmentRun } from "./sipInstallments.js";

// H4 (docs/LAUNCH_BLOCKER_REPORT.md): sipInstallmentRun() is the daily job that actually places
// a SIP installment. Real Neon, a disposable investment-ready user — same pattern as
// orderService.test.js's own SIP tests.
describe("sipInstallmentRun (integration, real Neon)", () => {
  let userId;
  const today = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    userId = await makeInvestmentReadyUser("sip-installments");
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  // createSipMandate()'s mock payment authorization has a real ~5% decline rate (Provider
  // Metadata) — forced deterministic here the same way makeInvestmentReadyUser forces its own
  // compliance submissions, so a due-today test doesn't flake on an unlucky decline.
  async function createActiveMandate(startDate, frequency = "monthly", endDate = null) {
    const originalRandom = Math.random;
    Math.random = () => 0.1;
    try {
      const mandate = await orderService.createSipMandate(userId, { schemeCode: "100033", amount: 1000, frequency, startDate, endDate });
      expect(mandate.mandate_status).toBe("active");
      return mandate;
    } finally {
      Math.random = originalRandom;
    }
  }

  it("creates exactly one purchase order for a mandate due today, and re-running the same day is idempotent", async () => {
    const mandate = await createActiveMandate(today);
    const key = `sip:${mandate.id}:${today}`;

    await sipInstallmentRun();
    const firstPass = await query(`select * from investment_orders where user_id = $1 and idempotency_key = $2`, [userId, key]);
    expect(firstPass.rows).toHaveLength(1);
    expect(firstPass.rows[0].order_type).toBe("purchase");
    expect(firstPass.rows[0].scheme_code).toBe("100033");
    expect(Number(firstPass.rows[0].amount)).toBe(1000);

    await sipInstallmentRun();
    const secondPass = await query(`select * from investment_orders where user_id = $1 and idempotency_key = $2`, [userId, key]);
    expect(secondPass.rows).toHaveLength(1); // still exactly one — no duplicate installment from the re-run
  });

  it("does not create an order for a mandate whose start_date is in the future", async () => {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 10);
    const futureStart = future.toISOString().slice(0, 10);
    const mandate = await createActiveMandate(futureStart);

    await sipInstallmentRun();
    const orders = await query(`select * from investment_orders where user_id = $1 and idempotency_key = $2`, [userId, `sip:${mandate.id}:${today}`]);
    expect(orders.rows).toHaveLength(0);
  });

  it("does not create an order for a mandate already past its end_date", async () => {
    const past = new Date();
    past.setUTCDate(past.getUTCDate() - 40);
    const pastEnd = new Date();
    pastEnd.setUTCDate(pastEnd.getUTCDate() - 10);
    const mandate = await createActiveMandate(past.toISOString().slice(0, 10), "weekly", pastEnd.toISOString().slice(0, 10));

    await sipInstallmentRun();
    const orders = await query(`select * from investment_orders where user_id = $1 and idempotency_key = $2`, [userId, `sip:${mandate.id}:${today}`]);
    expect(orders.rows).toHaveLength(0);
  });

  it("processes multiple distinct mandates due the same day independently", async () => {
    const mandateA = await createActiveMandate(today, "monthly");
    const mandateB = await createActiveMandate(today, "weekly");

    await sipInstallmentRun();
    const ordersA = await query(`select * from investment_orders where user_id = $1 and idempotency_key = $2`, [userId, `sip:${mandateA.id}:${today}`]);
    const ordersB = await query(`select * from investment_orders where user_id = $1 and idempotency_key = $2`, [userId, `sip:${mandateB.id}:${today}`]);
    expect(ordersA.rows).toHaveLength(1);
    expect(ordersB.rows).toHaveLength(1);
    expect(ordersA.rows[0].id).not.toBe(ordersB.rows[0].id);
  });
});
