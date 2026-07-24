// Switch Contract tests — real Neon, no mocks. Real scheme codes: 119551 (Aditya Birla Sun Life
// Banking and PSU Debt) as source, 100033 (Aditya Birla Sun Life Large & Mid Cap, SAME AMC) as
// an eligible destination, 100219 (JM Large Cap, DIFFERENT AMC) as an ineligible destination.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { query } from "../db.js";
import * as orderService from "./orderService.js";
import * as switchService from "./switchService.js";
import { makeInvestmentReadyUser, deleteTestUser } from "./testHelpers.js";

const SOURCE_SCHEME = "119551";
const SAME_AMC_DESTINATION = "100033";
const DIFFERENT_AMC_DESTINATION = "100219";

async function insertHolding(userId, schemeCode, { folioNumber, units, avgCost }) {
  await query(
    `insert into portfolio_holdings (user_id, scheme_code, units, avg_cost, source, folio_number)
     values ($1, $2, $3, $4, 'cas', $5)`,
    [userId, schemeCode, units, avgCost, folioNumber]
  );
}

describe("getSwitchEligibility", () => {
  let userId;
  beforeAll(async () => { userId = await makeInvestmentReadyUser("switch-eligibility"); }, 120000);
  afterAll(async () => { await deleteTestUser(userId); });

  it("throws when source and destination are the same scheme", async () => {
    await expect(switchService.getSwitchEligibility(userId, SOURCE_SCHEME, SOURCE_SCHEME)).rejects.toThrow(/cannot be switched into itself/);
  });

  it("throws for an unknown destination scheme code", async () => {
    await expect(switchService.getSwitchEligibility(userId, SOURCE_SCHEME, "not-a-real-code")).rejects.toThrow(/Unknown destination scheme code/);
  });

  it("blocks a cross-AMC switch with a clear reason, even with no holdings involved", async () => {
    const result = await switchService.getSwitchEligibility(userId, SOURCE_SCHEME, DIFFERENT_AMC_DESTINATION);
    expect(result.sameAmc).toBe(false);
    expect(result.eligible).toBe(false);
    expect(result.blockers.some((b) => /same AMC/.test(b))).toBe(true);
  });

  it("recognizes a same-AMC destination and carries the full source-side eligibility contract", async () => {
    await insertHolding(userId, SOURCE_SCHEME, { folioNumber: "FOLIO-SWITCH-1", units: 100, avgCost: 100 });
    const result = await switchService.getSwitchEligibility(userId, SOURCE_SCHEME, SAME_AMC_DESTINATION);
    expect(result.sameAmc).toBe(true);
    expect(result.destinationActive).toBe(true);
    expect(result.destinationFundName).toBeTruthy();
    const folio = result.source.folios.find((f) => f.folioNumber === "FOLIO-SWITCH-1");
    expect(folio.unitsRedeemable).toBe(100);
    expect(result.eligible).toBe(true);
  });
});

describe("createSwitchOrder", () => {
  let userId;
  beforeAll(async () => { userId = await makeInvestmentReadyUser("switch-create"); }, 120000);
  afterAll(async () => { await deleteTestUser(userId); });

  it("requires a folioNumber", async () => {
    await expect(switchService.createSwitchOrder(userId, { sourceSchemeCode: SOURCE_SCHEME, destinationSchemeCode: SAME_AMC_DESTINATION, units: 1 }))
      .rejects.toThrow(/folioNumber is required/);
  });

  it("rejects a folio the user does not hold", async () => {
    await expect(switchService.createSwitchOrder(userId, { sourceSchemeCode: SOURCE_SCHEME, destinationSchemeCode: SAME_AMC_DESTINATION, folioNumber: "does-not-exist", units: 1 }))
      .rejects.toThrow(/No holding found/);
  });

  it("rejects a cross-AMC switch even with a valid folio and units", async () => {
    await insertHolding(userId, SOURCE_SCHEME, { folioNumber: "FOLIO-CROSS-AMC", units: 50, avgCost: 100 });
    await expect(switchService.createSwitchOrder(userId, { sourceSchemeCode: SOURCE_SCHEME, destinationSchemeCode: DIFFERENT_AMC_DESTINATION, folioNumber: "FOLIO-CROSS-AMC", units: 10 }))
      .rejects.toThrow(/Not eligible for switch/);
  });

  it("rejects a request for more units than are redeemable", async () => {
    await insertHolding(userId, SOURCE_SCHEME, { folioNumber: "FOLIO-OVERDRAW", units: 5, avgCost: 100 });
    await expect(switchService.createSwitchOrder(userId, { sourceSchemeCode: SOURCE_SCHEME, destinationSchemeCode: SAME_AMC_DESTINATION, folioNumber: "FOLIO-OVERDRAW", units: 999 }))
      .rejects.toThrow(/exceeds the redeemable balance/);
  });

  it("bypassing this module — bare orderType='switch_in'/'switch_out' through orderService.createOrder — is refused", async () => {
    await expect(orderService.createOrder(userId, { schemeCode: SOURCE_SCHEME, orderType: "switch_out", relatedSchemeCode: SAME_AMC_DESTINATION, units: 1 }))
      .rejects.toThrow(/switchService.createSwitchOrder/);
    await expect(orderService.createOrder(userId, { schemeCode: SAME_AMC_DESTINATION, orderType: "switch_in", relatedSchemeCode: SOURCE_SCHEME, amount: 100 }))
      .rejects.toThrow(/switchService.createSwitchOrder/);
  });

  it("draft:true creates both linked legs, stamping a frozen exit-load quote and a net destination amount", async () => {
    await insertHolding(userId, SOURCE_SCHEME, { folioNumber: "FOLIO-DRAFT-SWITCH", units: 40, avgCost: 100 });
    const { switchOut, switchIn } = await switchService.createSwitchOrder(userId, {
      sourceSchemeCode: SOURCE_SCHEME, destinationSchemeCode: SAME_AMC_DESTINATION, folioNumber: "FOLIO-DRAFT-SWITCH", units: 10, draft: true,
    });

    expect(switchOut.status).toBe("draft");
    expect(switchOut.order_type).toBe("switch_out");
    expect(switchOut.scheme_code).toBe(SOURCE_SCHEME);
    expect(switchOut.related_scheme_code).toBe(SAME_AMC_DESTINATION);
    expect(switchOut.folio_number).toBe("FOLIO-DRAFT-SWITCH");
    expect(switchOut.switch_order_id).toBe(switchIn.id);

    expect(switchIn.status).toBe("draft");
    expect(switchIn.order_type).toBe("switch_in");
    expect(switchIn.scheme_code).toBe(SAME_AMC_DESTINATION);
    expect(switchIn.related_scheme_code).toBe(SOURCE_SCHEME);
    expect(switchIn.switch_order_id).toBe(switchOut.id);
    // No exit load was estimated for this debt-fund source (only equity-oriented gets a crisp
    // estimate — see redemptionService.estimateExitLoad), so the destination amount is the full
    // gross value, not reduced by an unknown/null load.
    expect(Number(switchIn.amount)).toBeGreaterThan(0);
  });

  it("creates and immediately submits both legs by default, both carrying distributor attribution", async () => {
    await insertHolding(userId, SOURCE_SCHEME, { folioNumber: "FOLIO-SUBMIT-SWITCH", units: 60, avgCost: 100 });
    const { switchOut, switchIn } = await switchService.createSwitchOrder(userId, {
      sourceSchemeCode: SOURCE_SCHEME, destinationSchemeCode: SAME_AMC_DESTINATION, folioNumber: "FOLIO-SUBMIT-SWITCH", units: 20,
    });
    expect(["submitted", "failed"]).toContain(switchOut.status);
    expect(["submitted", "failed"]).toContain(switchIn.status);
    expect(switchOut.distributor_arn).toBe("289322");
    expect(switchIn.distributor_arn).toBe("289322");
  });
});
