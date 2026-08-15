import { describe, expect, it } from "vitest";
import { assertDistributorPlanAllowed, buildDistributionReadiness } from "./distributionCompliance.js";

const identity = { arn: "289322", euin: "E544323", distributor_name: "Suasion Securities", arn_valid_until: "2027-12-31" };
const productionProviders = { investment: { mode: "production" }, payment: { mode: "production" }, kyc: { mode: "production" } };
const verifiedEnvironment = {
  executionEnabled: true, arnVerified: true, euinVerified: true, dscCurrent: true,
  amcEmpanelmentVerified: true, orderRailAgreementVerified: true, kycRailVerified: true,
  paymentRailVerified: true, transaction2faVerified: true, regularPlanControlsVerified: true,
  disclosuresVerified: true, governanceVerified: true,
};

describe("distribution compliance readiness", () => {
  it("blocks live execution when providers are mocks or ARN validity is unknown", () => {
    const result = buildDistributionReadiness({ identity: { ...identity, arn_valid_until: null }, providers: { investment: { mode: "sandbox" }, payment: { mode: "sandbox" }, kyc: { mode: "sandbox" } }, environment: verifiedEnvironment });
    expect(result.liveExecutionReady).toBe(false);
    expect(result.mode).toBe("blocked");
    expect(result.controls.find((item) => item.id === "arn-current").status).toBe("action_required");
    expect(result.controls.find((item) => item.id === "order-rail").status).toBe("action_required");
  });

  it("only unlocks when every regulatory attestation and production provider is present", () => {
    const result = buildDistributionReadiness({ identity, providers: productionProviders, environment: verifiedEnvironment, now: new Date("2026-08-15T00:00:00Z") });
    expect(result.liveExecutionReady).toBe(true);
    expect(result.completed).toBe(result.total);
    expect(result.planRoute).toBe("regular_only");
  });

  it("rejects Direct plans from ARN-routed orders", () => {
    expect(() => assertDistributorPlanAllowed({ isDirect: true, plan: "Direct" })).toThrow(/Regular plan/);
    expect(() => assertDistributorPlanAllowed(null)).toThrow(/could not be verified/);
    expect(() => assertDistributorPlanAllowed({ isDirect: false, plan: null, name: "Unclassified scheme" })).toThrow(/Regular-plan status/);
    expect(() => assertDistributorPlanAllowed({ isDirect: false, plan: "Regular" })).not.toThrow();
  });
});
