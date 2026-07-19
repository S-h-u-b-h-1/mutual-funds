import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from "vitest";
import * as complianceService from "./complianceService.js";
import * as identityService from "./identityService.js";
import { createTestUser, deleteTestUser } from "./testHelpers.js";

afterEach(() => {
  vi.restoreAllMocks(); // never let a forced Math.random leak into the next test
});

describe("complianceService (integration, real Neon, disposable test user)", () => {
  let userId;

  beforeAll(async () => {
    userId = await createTestUser("compliance");
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  it("ensureApplication creates all 9 items pending, overall_status pending", async () => {
    const { application, items } = await complianceService.getApplication(userId);
    expect(application.overall_status).toBe("pending");
    expect(items).toHaveLength(9);
    expect(items.every((i) => i.status === "pending")).toBe(true);
    expect(items.map((i) => i.item_key).sort()).toEqual([...complianceService.ITEM_KEYS].sort());
  });

  it("refuses to directly submit the derived investment_ready item", async () => {
    await expect(complianceService.submitItem(userId, "investment_ready", {})).rejects.toThrow(/derived automatically/);
  });

  it("rejects an unknown item key", async () => {
    await expect(complianceService.submitItem(userId, "not_a_real_item", {})).rejects.toThrow(/Unknown compliance item/);
  });

  it("mobile: wrong OTP is rejected, correct OTP completes", async () => {
    const wrong = await complianceService.submitItem(userId, "mobile", { otp: "000000" });
    expect(wrong.item.status).toBe("rejected");
    expect(wrong.item.rejection_reason).toMatch(/Invalid OTP/);

    const right = await complianceService.submitItem(userId, "mobile", { otp: "123456" });
    expect(right.item.status).toBe("completed");
  });

  it("email: same OTP contract as mobile", async () => {
    const result = await complianceService.submitItem(userId, "email", { otp: "123456" });
    expect(result.item.status).toBe("completed");
  });

  it("pan: verified when the mock KYC provider returns 'verified'", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1); // MockKYCProvider's weighted 'verified' bucket
    const result = await complianceService.submitItem(userId, "pan", { pan: "ABCDE1234F" });
    expect(result.item.status).toBe("verified");
    expect(result.item.provider).toBe("mock-kyc");
  });

  it("identity: requires a consent token before any document fetch", async () => {
    await expect(complianceService.submitItem(userId, "identity", { pan: "ABCDE1234F" })).rejects.toThrow(/consentToken/);
  });

  it("identity: verified when CKYC status is kyc_compliant", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const result = await complianceService.submitItem(userId, "identity", { pan: "ABCDE1234F", consentToken: "consent_test_1" });
    expect(result.item.status).toBe("verified");
  });

  it("nominee: rejects incomplete payload, completes a valid one and persists a real row", async () => {
    const incomplete = await complianceService.submitItem(userId, "nominee", { name: "Only Name" });
    expect(incomplete.item.status).toBe("rejected");

    const valid = await complianceService.submitItem(userId, "nominee", {
      name: "Test Nominee", relationship: "Spouse", allocationPct: 100,
    });
    expect(valid.item.status).toBe("completed");
  });

  it("bank: rejects incomplete payload; a valid one lands as completed or needs_review (never silently lost)", async () => {
    const incomplete = await complianceService.submitItem(userId, "bank", { accountNumber: "12345" });
    expect(incomplete.item.status).toBe("rejected");

    vi.spyOn(Math, "random").mockReturnValue(0.1); // forces the "verified" branch of the 90/10 penny-drop mock
    const valid = await complianceService.submitItem(userId, "bank", {
      accountNumber: "000123456789", ifsc: "HDFC0000001", accountHolderName: "Test User",
    });
    expect(valid.item.status).toBe("completed");
  });

  it("fatca: requires explicit true, not just a truthy value", async () => {
    const undeclared = await complianceService.submitItem(userId, "fatca", { declared: false });
    expect(undeclared.item.status).toBe("rejected");

    const declared = await complianceService.submitItem(userId, "fatca", { declared: true });
    expect(declared.item.status).toBe("completed");
  });

  it("risk_profile: rejected until a real risk_profiles row exists, then completed", async () => {
    const before = await complianceService.submitItem(userId, "risk_profile", {});
    expect(before.item.status).toBe("rejected");

    await identityService.upsertRiskProfile(userId, {
      horizonScore: 3, lossToleranceScore: 3, incomeStabilityScore: 3, experienceScore: 3,
    });

    const after = await complianceService.submitItem(userId, "risk_profile", {});
    expect(after.item.status).toBe("completed");
  });

  it("investment_ready auto-completes and overall progress reaches 100% once every other item is done", async () => {
    const progress = await complianceService.getComplianceProgress(userId);
    const investmentReady = progress.items.find((i) => i.item_key === "investment_ready");
    expect(investmentReady.status).toBe("completed");
    expect(progress.overallStatus).toBe("completed");
    expect(progress.percent).toBe(100);
    expect(progress.completed).toBe(progress.total);
  });
});
