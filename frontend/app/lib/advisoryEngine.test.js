import { describe, expect, it } from "vitest";
import { answerAdvisoryQuestion, buildRiskProfile, buildShortlist, categoryFamily, researchProfileFromAdvisoryAnswers } from "./advisoryEngine";

const candidates = [
  { code: "a", name: "Liquid A", family: "stability", vol90: 0.2, maxdd90: -0.1, r1y: 6, r3y: 6, consistency: 96, catPct: 80, obs: 90 },
  { code: "d", name: "Bond D", family: "income", vol90: 2, maxdd90: -1, r1y: 7, r3y: 7, consistency: 88, catPct: 72, obs: 90 },
  { code: "b", name: "Hybrid B", family: "balanced", vol90: 7, maxdd90: -3, r1y: 9, r3y: 10, consistency: 72, catPct: 70, obs: 90 },
  { code: "c", name: "Equity C", family: "diversified", vol90: 14, maxdd90: -8, r1y: 12, r3y: 14, consistency: 66, catPct: 75, obs: 90 },
];

describe("wealth advisory engine", () => {
  it("caps near-term goals at a cautious profile", () => {
    expect(buildRiskProfile({ goal: "emergency", horizon: 1, reaction: 4, capacity: 4, experience: 4 }).key).toBe("conservative");
  });

  it("classifies common mutual-fund categories", () => {
    expect(categoryFamily("Dynamic Asset Allocation or Balanced Advantage")).toBe("balanced");
    expect(categoryFamily("ELSS- Tax Saver")).toBe("tax");
    expect(categoryFamily("Flexi Cap")).toBe("diversified");
  });

  it("builds a diversified shortlist for a balanced investor", () => {
    const profile = buildRiskProfile({ goal: "wealth", horizon: 3, reaction: 3, capacity: 3, experience: 2 });
    const result = buildShortlist(candidates, profile, 3);
    expect(new Set(result.map((fund) => fund.family)).size).toBe(3);
  });

  it("answers risk questions with observed evidence and a limitation", () => {
    const profile = buildRiskProfile({ goal: "wealth", horizon: 3, reaction: 3, capacity: 3, experience: 2 });
    expect(answerAdvisoryQuestion("Which option is steadier?", { profile, funds: candidates })).toMatch(/lowest observed.*not a guarantee/i);
  });

  it("maps landing answers into a complete account research profile", () => {
    expect(researchProfileFromAdvisoryAnswers({ goal: "retirement", horizon: 4, reaction: 3, capacity: 3, experience: 2 })).toMatchObject({
      role: "individual",
      primaryGoal: "portfolio",
      experience: "intermediate",
      riskComfort: "aggressive",
      horizon: "5+",
    });
  });
});
