import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from "vitest";
import * as complianceService from "./complianceService.js";
import * as identityService from "./identityService.js";
import { query } from "../db.js";
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

  it("ensureApplication creates all 10 items pending, overall_status pending", async () => {
    const { application, items } = await complianceService.getApplication(userId);
    expect(application.overall_status).toBe("pending");
    expect(items).toHaveLength(10);
    expect(items.every((i) => i.status === "pending")).toBe(true);
    expect(items.map((i) => i.item_key).sort()).toEqual([...complianceService.ITEM_KEYS].sort());
  });

  it("refuses to directly submit the derived investment_ready item", async () => {
    await expect(complianceService.submitItem(userId, "investment_ready", {})).rejects.toThrow(/derived automatically/);
  });

  it("rejects an unknown item key", async () => {
    await expect(complianceService.submitItem(userId, "not_a_real_item", {})).rejects.toThrow(/Unknown compliance item/);
  });

  it("mobile: missing/implausible phone number is rejected before the OTP is even checked", async () => {
    const noNumber = await complianceService.submitItem(userId, "mobile", { otp: "123456" });
    expect(noNumber.item.status).toBe("rejected");
    expect(noNumber.item.rejection_reason).toMatch(/phone number/i);

    const badNumber = await complianceService.submitItem(userId, "mobile", { otp: "123456", phoneNumber: "abc" });
    expect(badNumber.item.status).toBe("rejected");
  });

  it("mobile: wrong OTP is rejected, correct OTP completes and persists the number", async () => {
    const wrong = await complianceService.submitItem(userId, "mobile", { otp: "000000", phoneNumber: "9876543210" });
    expect(wrong.item.status).toBe("rejected");
    expect(wrong.item.rejection_reason).toMatch(/Invalid OTP/);

    const right = await complianceService.submitItem(userId, "mobile", { otp: "123456", phoneNumber: "9876543210" });
    expect(right.item.status).toBe("completed");

    const profile = await identityService.getProfile(userId);
    expect(profile.phone_number).toBe("9876543210");
  });

  it("email: same OTP contract as mobile", async () => {
    const result = await complianceService.submitItem(userId, "email", { otp: "123456" });
    expect(result.item.status).toBe("completed");
  });

  it("pan: verified when the mock KYC provider returns 'verified', and persists pan_masked", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1); // MockKYCProvider's weighted 'verified' bucket
    const result = await complianceService.submitItem(userId, "pan", { pan: "ABCDE1234F" });
    expect(result.item.status).toBe("verified");
    expect(result.item.provider).toBe("mock-kyc");

    const profile = await identityService.getProfile(userId);
    expect(profile.pan_masked).toBe("******234F");
  });

  it("identity: requires a consent token before any document fetch", async () => {
    await expect(complianceService.submitItem(userId, "identity", { pan: "ABCDE1234F" })).rejects.toThrow(/consentToken/);
  });

  it("identity: verified when CKYC status is kyc_compliant, and records the consent used", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const result = await complianceService.submitItem(userId, "identity", { pan: "ABCDE1234F", consentToken: "consent_test_1" });
    expect(result.item.status).toBe("verified");

    const consent = await query(
      `select consent_type, correlation_id from consent_records where user_id = $1 and consent_type = 'investment_declaration'`,
      [userId]
    );
    expect(consent.rows).toHaveLength(1);
    expect(consent.rows[0].correlation_id).toBe("consent_test_1");
  });

  it("nominee: rejects incomplete payload, completes a valid one and persists a real row", async () => {
    const incomplete = await complianceService.submitItem(userId, "nominee", { name: "Only Name" });
    expect(incomplete.item.status).toBe("rejected");

    const valid = await complianceService.submitItem(userId, "nominee", {
      name: "Test Nominee", relationship: "Spouse", allocationPct: 100,
    });
    expect(valid.item.status).toBe("completed");
  });

  it("nominee: resubmitting the same slot replaces it (fixes a real duplicate-row bug), a different slot adds a second nominee", async () => {
    await complianceService.submitItem(userId, "nominee", { name: "Typo Namee", relationship: "Spouse", allocationPct: 100 });
    await complianceService.submitItem(userId, "nominee", { name: "Corrected Name", relationship: "Spouse", allocationPct: 100 });

    const slotOne = await query(`select name from nominees where user_id = $1 and sequence = 1`, [userId]);
    expect(slotOne.rows).toHaveLength(1); // still one row for slot 1, not two
    expect(slotOne.rows[0].name).toBe("Corrected Name"); // the resubmission won, not a stale duplicate

    await complianceService.submitItem(userId, "nominee", { name: "Second Nominee", relationship: "Child", allocationPct: 50, sequence: 2 });
    const both = await query(`select sequence, name from nominees where user_id = $1 order by sequence`, [userId]);
    expect(both.rows).toEqual([
      { sequence: 1, name: "Corrected Name" },
      { sequence: 2, name: "Second Nominee" },
    ]);

    const consent = await query(`select 1 from consent_records where user_id = $1 and consent_type = 'nominee_declaration'`, [userId]);
    expect(consent.rows.length).toBeGreaterThan(0);
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

  it("fatca: requires explicit true AND a tax residency country, persists a structured declaration", async () => {
    const undeclared = await complianceService.submitItem(userId, "fatca", { declared: false, taxResidencyCountry: "IN" });
    expect(undeclared.item.status).toBe("rejected");

    const noCountry = await complianceService.submitItem(userId, "fatca", { declared: true });
    expect(noCountry.item.status).toBe("rejected");
    expect(noCountry.item.rejection_reason).toMatch(/tax residence/i);

    const declared = await complianceService.submitItem(userId, "fatca", { declared: true, taxResidencyCountry: "in" });
    expect(declared.item.status).toBe("completed");

    const row = await query(`select tax_residency_country, is_us_person, status, version from fatca_declarations where user_id = $1`, [userId]);
    expect(row.rows[0]).toMatchObject({ tax_residency_country: "IN", is_us_person: false, status: "completed" });

    const consent = await query(`select 1 from consent_records where user_id = $1 and consent_type = 'fatca_declaration'`, [userId]);
    expect(consent.rows.length).toBeGreaterThan(0);
  });

  it("fatca: a US-person declaration routes to needs_review rather than auto-completing", async () => {
    const usPerson = await complianceService.submitItem(userId, "fatca", { declared: true, taxResidencyCountry: "US", isUsPerson: true });
    expect(usPerson.item.status).toBe("needs_review");
    expect(usPerson.item.rejection_reason).toMatch(/manual review/i);

    // Restore to a non-US declaration so the later "everything completes" test isn't blocked by this one.
    await complianceService.submitItem(userId, "fatca", { declared: true, taxResidencyCountry: "IN" });
  });

  it("pep: requires an explicit boolean; 'no' completes immediately, 'yes' always needs review", async () => {
    const missing = await complianceService.submitItem(userId, "pep", {});
    expect(missing.item.status).toBe("rejected");

    const yes = await complianceService.submitItem(userId, "pep", { declared: true });
    expect(yes.item.status).toBe("needs_review");
    const yesRow = await query(`select status from pep_declarations where user_id = $1`, [userId]);
    expect(yesRow.rows[0].status).toBe("needs_review");

    const no = await complianceService.submitItem(userId, "pep", { declared: false });
    expect(no.item.status).toBe("completed");
    const noRow = await query(`select status from pep_declarations where user_id = $1`, [userId]);
    expect(noRow.rows[0].status).toBe("not_applicable"); // domain status, distinct from the compliance_items workflow status above

    const consent = await query(`select 1 from consent_records where user_id = $1 and consent_type = 'pep_declaration'`, [userId]);
    expect(consent.rows.length).toBeGreaterThan(0);
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
