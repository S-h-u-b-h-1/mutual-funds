import { describe, expect, it } from "vitest";
import { normalizeAdvisoryAnswers, normalizeChangeReason, normalizeResearchProfile, ProfilePolicyError } from "./profileGovernancePolicy";

const answers = { goal: "retirement", horizon: 4, reaction: 3, capacity: 3, experience: 2 };

describe("profile governance policy", () => {
  it("derives the stored profile and score from the signed questionnaire answers", () => {
    const profile = normalizeResearchProfile({ advisoryAnswers: answers, aumBand: "5l-25l" });
    expect(profile).toMatchObject({ role: "individual", primaryGoal: "portfolio", horizon: "5+", aumBand: "5l-25l" });
    expect(profile.advisoryAnswers).toEqual(answers);
    expect(profile.riskScore).toBeTypeOf("number");
    expect(["conservative", "balanced", "growth"]).toContain(profile.riskProfile);
  });

  it("rejects incomplete or out-of-range advisory answers", () => {
    expect(() => normalizeAdvisoryAnswers({ ...answers, reaction: 9 })).toThrow(ProfilePolicyError);
  });

  it("requires a meaningful reason for a governed profile change", () => {
    expect(() => normalizeChangeReason("changed")).toThrow(ProfilePolicyError);
    expect(normalizeChangeReason("My investment horizon has materially changed.")).toBe("My investment horizon has materially changed.");
  });
});
