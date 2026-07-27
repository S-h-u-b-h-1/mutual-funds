// Redemption Contract tests — real Neon, no mocks. Uses real scheme codes from the live fund
// universe so category-driven tax/exit-load classification is exercised for real, not against a
// fixture that doesn't actually resolve through getFund(): 119551 (Banking and PSU -> debt),
// 100219 (Large Cap -> equity-oriented), 100175 (ELSS -> equity-oriented + lock-in).
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from "vitest";
import { query } from "../db.js";
import * as orderService from "./orderService.js";
import * as redemptionService from "./redemptionService.js";
import { makeInvestmentReadyUser, createTestUser, deleteTestUser } from "./testHelpers.js";

afterEach(() => vi.restoreAllMocks());

const DEBT_SCHEME = "119551";
const EQUITY_SCHEME = "100219";
const ELSS_SCHEME = "100175";

async function insertHolding(userId, schemeCode, { folioNumber, units, avgCost, source = "cas" }) {
  await query(
    `insert into portfolio_holdings (user_id, scheme_code, units, avg_cost, source, folio_number)
     values ($1, $2, $3, $4, $5, $6)`,
    [userId, schemeCode, units, avgCost, source, folioNumber]
  );
}
async function insertPurchaseTransaction(userId, schemeCode, { folioNumber, units, daysAgo, source = "cas" }) {
  // Anchored to today's LOCAL midnight, not the precise current instant — and rendered via local
  // getters, not toISOString(). redemptionService's daysBetween() re-parses this date-only column
  // through node-postgres's date parser (postgres-date), which — per that package's own comment,
  // "force YYYY-MM-DD dates to be parsed as local time" — reconstructs it at LOCAL midnight, not
  // UTC midnight, then diffs it against `new Date()` (the precise current instant) at query time.
  // Anchoring the write side to UTC (an earlier version of this fix) or rendering via
  // toISOString() (which is always UTC) creates a real skew between the two: on a UTC+5:30 host,
  // UTC-midnight-of-a-date is 5.5 hours EARLIER than that same date's local midnight, which is
  // enough to push Math.floor() across a whole extra day depending what local time of day the
  // suite happens to run (confirmed live: computed daysAgo+1 consistently in the early-morning-IST
  // window). Matching the write side to local midnight — the same anchor the read side actually
  // uses — means the two are always within [0, 1) local days of each other, so the floor is always
  // exactly daysAgo regardless of what time of day or which timezone the suite runs in.
  const todayLocalMidnight = new Date();
  todayLocalMidnight.setHours(0, 0, 0, 0);
  const target = new Date(todayLocalMidnight.getTime() - daysAgo * 86400000);
  const date = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
  await query(
    `insert into portfolio_transactions (user_id, scheme_code, transaction_type, units, transaction_date, source, folio_number)
     values ($1, $2, 'purchase', $3, $4, $5, $6)`,
    [userId, schemeCode, units, date, source, folioNumber]
  );
}

describe("getRedemptionEligibility", () => {
  let userId;
  beforeAll(async () => { userId = await makeInvestmentReadyUser("redemption-eligibility"); }, 120000);
  afterAll(async () => { await deleteTestUser(userId); });

  it("throws for an unknown scheme code", async () => {
    await expect(redemptionService.getRedemptionEligibility(userId, "not-a-real-code")).rejects.toThrow(/Unknown scheme code/);
  });

  it("reports no eligible folios and a clear blocker for a scheme the user has never held", async () => {
    const result = await redemptionService.getRedemptionEligibility(userId, DEBT_SCHEME);
    expect(result.folios).toEqual([]);
    expect(result.eligible).toBe(false);
    expect(result.blockers).toContain("No holdings found for this scheme.");
  });

  it("computes redeemable units, available amount, and debt tax treatment for a real debt-fund holding", async () => {
    await insertHolding(userId, DEBT_SCHEME, { folioNumber: "FOLIO-DEBT-1", units: 100, avgCost: 100 });
    const result = await redemptionService.getRedemptionEligibility(userId, DEBT_SCHEME);

    expect(result.taxTreatment.treatment).toBe("specifiedDebt");
    expect(result.taxTreatment.isElss).toBe(false);
    expect(result.payoutBank).not.toBeNull();
    expect(result.eligible).toBe(true);

    const folio = result.folios.find((f) => f.folioNumber === "FOLIO-DEBT-1");
    expect(folio.unitsHeld).toBe(100);
    expect(folio.unitsRedeemable).toBe(100);
    expect(folio.availableAmount).toBeCloseTo(100 * result.nav, 2);
    expect(folio.eligible).toBe(true);
    // Only equity-oriented gets a crisp estimate — see estimateExitLoad's own reasoning.
    expect(folio.exitLoad.estimatedPct).toBeNull();
  });

  it("estimates a 1% exit load for an equity-oriented fund held under 12 months, 0% past 12 months", async () => {
    await insertHolding(userId, EQUITY_SCHEME, { folioNumber: "FOLIO-EQ-RECENT", units: 10, avgCost: 100 });
    await insertPurchaseTransaction(userId, EQUITY_SCHEME, { folioNumber: "FOLIO-EQ-RECENT", units: 10, daysAgo: 30 });
    await insertHolding(userId, EQUITY_SCHEME, { folioNumber: "FOLIO-EQ-OLD", units: 10, avgCost: 100 });
    await insertPurchaseTransaction(userId, EQUITY_SCHEME, { folioNumber: "FOLIO-EQ-OLD", units: 10, daysAgo: 400 });

    const result = await redemptionService.getRedemptionEligibility(userId, EQUITY_SCHEME);
    expect(result.taxTreatment.treatment).toBe("equityOriented");

    const recent = result.folios.find((f) => f.folioNumber === "FOLIO-EQ-RECENT");
    expect(recent.taxContext.holdingPeriodDays).toBe(30);
    expect(recent.exitLoad.estimatedPct).toBe(1);
    expect(recent.exitLoad.isEstimate).toBe(true);

    const old = result.folios.find((f) => f.folioNumber === "FOLIO-EQ-OLD");
    expect(old.taxContext.holdingPeriodDays).toBe(400);
    expect(old.exitLoad.estimatedPct).toBe(0);
  });

  it("blocks redemption of ELSS units still inside the 3-year lock-in, with an unlock date", async () => {
    await insertHolding(userId, ELSS_SCHEME, { folioNumber: "FOLIO-ELSS-1", units: 5, avgCost: 300 });
    await insertPurchaseTransaction(userId, ELSS_SCHEME, { folioNumber: "FOLIO-ELSS-1", units: 5, daysAgo: 100 });

    const result = await redemptionService.getRedemptionEligibility(userId, ELSS_SCHEME);
    expect(result.taxTreatment.isElss).toBe(true);
    const folio = result.folios.find((f) => f.folioNumber === "FOLIO-ELSS-1");
    expect(folio.taxContext.elssLockIn.locked).toBe(true);
    expect(folio.taxContext.elssLockIn.unlockDate).toBeTruthy();
    expect(folio.eligible).toBe(false);
    expect(folio.blockers.some((b) => /lock-in/.test(b))).toBe(true);
  });

  it("reduces redeemable units by whatever is already pending in another non-terminal redemption order", async () => {
    await insertHolding(userId, DEBT_SCHEME, { folioNumber: "FOLIO-PENDING-1", units: 50, avgCost: 100 });
    await redemptionService.createRedemptionOrder(userId, { schemeCode: DEBT_SCHEME, folioNumber: "FOLIO-PENDING-1", units: 20, draft: true });

    const result = await redemptionService.getRedemptionEligibility(userId, DEBT_SCHEME);
    const folio = result.folios.find((f) => f.folioNumber === "FOLIO-PENDING-1");
    expect(folio.unitsHeld).toBe(50);
    expect(folio.unitsPendingRedemption).toBe(20);
    expect(folio.unitsRedeemable).toBe(30);
  });

  it("flags no verified payout bank as a portfolio-level blocker", async () => {
    const bareUserId = await makeInvestmentReadyUser("redemption-no-bank");
    try {
      await query(`update bank_accounts set verified = false where user_id = $1`, [bareUserId]);
      await insertHolding(bareUserId, DEBT_SCHEME, { folioNumber: "FOLIO-NOBANK-1", units: 10, avgCost: 100 });

      const result = await redemptionService.getRedemptionEligibility(bareUserId, DEBT_SCHEME);
      expect(result.payoutBank).toBeNull();
      expect(result.eligible).toBe(false);
      expect(result.blockers.some((b) => /verified payout bank/.test(b))).toBe(true);
    } finally {
      await deleteTestUser(bareUserId);
    }
  }, 120000);
});

describe("createRedemptionOrder", () => {
  let userId, freshUserId;
  beforeAll(async () => {
    userId = await makeInvestmentReadyUser("redemption-create");
    freshUserId = await createTestUser("redemption-fresh");
  }, 120000);
  afterAll(async () => {
    await deleteTestUser(userId);
    await deleteTestUser(freshUserId);
  });

  it("refuses redemption for a user who hasn't completed compliance", async () => {
    await expect(redemptionService.createRedemptionOrder(freshUserId, { schemeCode: DEBT_SCHEME, folioNumber: "X", units: 1 }))
      .rejects.toThrow(/Compliance must be fully completed/);
  });

  it("requires a folioNumber", async () => {
    await expect(redemptionService.createRedemptionOrder(userId, { schemeCode: DEBT_SCHEME, units: 1 }))
      .rejects.toThrow(/folioNumber is required/);
  });

  it("rejects a folio the user does not hold", async () => {
    await expect(redemptionService.createRedemptionOrder(userId, { schemeCode: DEBT_SCHEME, folioNumber: "does-not-exist", units: 1 }))
      .rejects.toThrow(/No holding found/);
  });

  // Backend Hardening (2026-07-24): a negative units value made the overdraw check
  // (`requestedUnits > unitsRedeemable`) always false — this now throws before that check ever runs.
  it("rejects a negative or zero amount/units before checking eligibility", async () => {
    await expect(redemptionService.createRedemptionOrder(userId, { schemeCode: DEBT_SCHEME, folioNumber: "does-not-exist", units: -1 }))
      .rejects.toThrow(/units must be greater than 0/);
    await expect(redemptionService.createRedemptionOrder(userId, { schemeCode: DEBT_SCHEME, folioNumber: "does-not-exist", amount: 0 }))
      .rejects.toThrow(/amount must be greater than 0/);
  });

  it("rejects a request for more units than are redeemable", async () => {
    await insertHolding(userId, DEBT_SCHEME, { folioNumber: "FOLIO-OVERDRAW", units: 5, avgCost: 100 });
    await expect(redemptionService.createRedemptionOrder(userId, { schemeCode: DEBT_SCHEME, folioNumber: "FOLIO-OVERDRAW", units: 999 }))
      .rejects.toThrow(/exceeds the redeemable balance/);
  });

  it("rejects a still-locked ELSS folio even when units/amount are otherwise valid", async () => {
    await insertHolding(userId, ELSS_SCHEME, { folioNumber: "FOLIO-ELSS-BLOCK", units: 5, avgCost: 300 });
    await insertPurchaseTransaction(userId, ELSS_SCHEME, { folioNumber: "FOLIO-ELSS-BLOCK", units: 5, daysAgo: 10 });
    await expect(redemptionService.createRedemptionOrder(userId, { schemeCode: ELSS_SCHEME, folioNumber: "FOLIO-ELSS-BLOCK", units: 1 }))
      .rejects.toThrow(/not eligible for redemption/);
  });

  it("bypassing this module — a bare orderType='redemption' through orderService.createOrder — is refused", async () => {
    await expect(orderService.createOrder(userId, { schemeCode: DEBT_SCHEME, orderType: "redemption", units: 1 }))
      .rejects.toThrow(/redemptionService.createRedemptionOrder/);
  });

  it("draft:true stamps a frozen exit-load quote and payout bank without submitting to the provider", async () => {
    await insertHolding(userId, EQUITY_SCHEME, { folioNumber: "FOLIO-DRAFT-1", units: 20, avgCost: 100 });
    await insertPurchaseTransaction(userId, EQUITY_SCHEME, { folioNumber: "FOLIO-DRAFT-1", units: 20, daysAgo: 5 });

    const order = await redemptionService.createRedemptionOrder(userId, { schemeCode: EQUITY_SCHEME, folioNumber: "FOLIO-DRAFT-1", units: 5, draft: true });
    expect(order.status).toBe("draft");
    expect(order.folio_number).toBe("FOLIO-DRAFT-1");
    expect(Number(order.exit_load_pct)).toBe(1); // < 12 months, equity-oriented
    expect(order.exit_load_amount).not.toBeNull();
    expect(order.net_settlement_amount).not.toBeNull();
    expect(order.payout_bank_account_id).toBeTruthy();
    expect(order.payout_status).toBe("pending");
    expect(order.provider_order_id).toBeNull();
  });

  it("creates and immediately submits by default, carrying distributor attribution", async () => {
    await insertHolding(userId, DEBT_SCHEME, { folioNumber: "FOLIO-SUBMIT-1", units: 30, avgCost: 100 });
    const order = await redemptionService.createRedemptionOrder(userId, { schemeCode: DEBT_SCHEME, folioNumber: "FOLIO-SUBMIT-1", units: 10 });
    expect(["submitted", "failed"]).toContain(order.status); // mock gateway rejects ~8% of the time by design
    expect(order.distributor_arn).toBe("289322");
    expect(order.distributor_euin).toBe("E544323");
  });

  // C2 (docs/BACKEND_AUDIT_REPORT.md, docs/BACKEND_TECHNICAL_DEBT.md) — races two REAL concurrent
  // requests with Promise.allSettled, not two sequential calls. A folio with 100 units and two
  // simultaneous 60-unit redemption requests: each individually looks valid against the
  // PRE-race balance (100 >= 60), so a sequential test could never expose the TOCTOU window this
  // is actually testing — only true concurrency can.
  it("two concurrent redemption requests on the same folio cannot both succeed past the held balance", async () => {
    await insertHolding(userId, DEBT_SCHEME, { folioNumber: "FOLIO-RACE-1", units: 100, avgCost: 100 });

    const results = await Promise.allSettled([
      redemptionService.createRedemptionOrder(userId, { schemeCode: DEBT_SCHEME, folioNumber: "FOLIO-RACE-1", units: 60, draft: true }),
      redemptionService.createRedemptionOrder(userId, { schemeCode: DEBT_SCHEME, folioNumber: "FOLIO-RACE-1", units: 60, draft: true }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toMatch(/exceeds the redeemable balance/);

    // The real financial claim: total units actually committed to a redemption order for this
    // folio never exceeds what was held, not just "the two calls disagreed with each other."
    const pending = await query(
      `select coalesce(sum(units), 0)::float as total from investment_orders where user_id = $1 and folio_number = $2 and order_type = 'redemption'`,
      [userId, "FOLIO-RACE-1"]
    );
    expect(Number(pending.rows[0].total)).toBe(60);
  });

  it("settlement lifecycle: a redemption reaching 'completed' initiates payout with a provider reference", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1); // keeps placeOrder accepted AND decideNextStatus on 'completed'
    await insertHolding(userId, DEBT_SCHEME, { folioNumber: "FOLIO-SETTLE-1", units: 40, avgCost: 100 });
    const order = await redemptionService.createRedemptionOrder(userId, { schemeCode: DEBT_SCHEME, folioNumber: "FOLIO-SETTLE-1", units: 15 });
    expect(order.status).toBe("submitted");
    expect(order.payout_status).toBe("pending");

    await query(`update investment_orders set submitted_at = now() - interval '30 seconds' where id = $1`, [order.id]);
    const completed = await orderService.refreshOrderStatus(userId, order.id);
    vi.restoreAllMocks();

    expect(completed.status).toBe("completed");
    expect(completed.payout_status).toBe("initiated");
    expect(completed.payout_reference).toMatch(/^payout_/);
    expect(completed.payout_initiated_at).toBeTruthy();

    const auditRow = await query(`select 1 from audit_log where user_id = $1 and action = 'redemption_payout_initiated'`, [userId]);
    expect(auditRow.rows.length).toBeGreaterThanOrEqual(1);
  }, 30000);
});
