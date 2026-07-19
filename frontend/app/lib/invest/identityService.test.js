import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as identityService from "./identityService.js";
import { createTestUser, deleteTestUser } from "./testHelpers.js";

describe("scoreRiskAnswers (pure logic, no DB)", () => {
  it("scores the lowest inputs as conservative", () => {
    const { score, category } = identityService.scoreRiskAnswers({
      horizonScore: 1, lossToleranceScore: 1, incomeStabilityScore: 1, experienceScore: 1,
    });
    expect(score).toBe(0);
    expect(category).toBe("conservative");
  });

  it("scores the highest inputs as aggressive", () => {
    const { score, category } = identityService.scoreRiskAnswers({
      horizonScore: 5, lossToleranceScore: 5, incomeStabilityScore: 5, experienceScore: 5,
    });
    expect(score).toBe(100);
    expect(category).toBe("aggressive");
  });

  it("scores mid-range inputs as moderate", () => {
    const { category } = identityService.scoreRiskAnswers({
      horizonScore: 3, lossToleranceScore: 3, incomeStabilityScore: 3, experienceScore: 3,
    });
    expect(category).toBe("moderate");
  });

  it("rejects an incomplete questionnaire rather than silently scoring a partial answer", () => {
    expect(() => identityService.scoreRiskAnswers({ horizonScore: 3 })).toThrow(/requires all of/);
  });
});

describe("identityService (integration, real Neon, disposable test user)", () => {
  let userId;

  beforeAll(async () => {
    userId = await createTestUser("identity");
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  it("getProfile returns null before any profile is created", async () => {
    expect(await identityService.getProfile(userId)).toBeNull();
  });

  it("upsertProfile creates, then a second call updates in place (no duplicate row)", async () => {
    const created = await identityService.upsertProfile(userId, { occupation: "Engineer", city: "Bengaluru" });
    expect(created.occupation).toBe("Engineer");
    expect(created.city).toBe("Bengaluru");

    const updated = await identityService.upsertProfile(userId, { city: "Mumbai" });
    expect(updated.city).toBe("Mumbai");
    expect(updated.occupation).toBe("Engineer"); // untouched field survives the partial update
  });

  it("ensureAccount opens an account once and is idempotent on repeat calls", async () => {
    expect(await identityService.getAccount(userId)).toBeNull();

    const first = await identityService.ensureAccount(userId);
    expect(first.account_number).toMatch(/^MFPMOCK\d{8}$/);
    expect(first.status).toBe("active");

    const second = await identityService.ensureAccount(userId);
    expect(second.id).toBe(first.id); // same row, not a second account opened
    expect(second.account_number).toBe(first.account_number);
  });

  it("upsertRiskProfile persists the derived category and raw answers", async () => {
    const answers = { horizonScore: 4, lossToleranceScore: 4, incomeStabilityScore: 3, experienceScore: 3 };
    const saved = await identityService.upsertRiskProfile(userId, answers);
    expect(saved.risk_category).toBe("moderate");
    expect(saved.answers).toEqual(answers);

    const fetched = await identityService.getRiskProfile(userId);
    expect(fetched.risk_category).toBe("moderate");
  });

  it("upsertPreferences persists categories, plan, and SIP day", async () => {
    const saved = await identityService.upsertPreferences(userId, {
      preferredCategories: ["Large Cap", "ELSS"],
      preferredPlan: "direct",
      sipDay: 5,
    });
    expect(saved.preferred_categories).toEqual(["Large Cap", "ELSS"]);
    expect(saved.sip_day).toBe(5);
  });

  it("getOnboardingProgress returns a valid compliance-backed progress shape", async () => {
    const progress = await identityService.getOnboardingProgress(userId);
    expect(progress.total).toBe(9); // ITEM_KEYS.length in complianceService
    expect(progress.percent).toBeGreaterThanOrEqual(0);
    expect(progress.percent).toBeLessThanOrEqual(100);
  });
});
