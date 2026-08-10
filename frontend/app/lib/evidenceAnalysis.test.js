import { describe, expect, it } from "vitest";
import { buildAmcEvidence, buildComparisonEvidence, buildFundEvidenceAnalysis } from "./evidenceAnalysis.js";

const baseFund = {
  name: "Example Equity Fund - Direct Growth",
  category: "Flexi Cap",
  assetClass: "Equity",
  plan: "Direct",
  r3m: 8,
  r1y: 18,
  r3y: 60,
  vol90: 17,
  maxdd90: -7,
  consistency: 56,
  catRank: 4,
  catSize: 40,
  catPct: 93,
  benchmark: "NIFTY 500 TRI",
  quality: { status: "ok", obs: 65 },
};

describe("evidence-aware fund analysis", () => {
  it("caps a new fund's confidence and rejects a normal long-term rank interpretation", () => {
    const result = buildFundEvidenceAnalysis(
      { ...baseFund, r1y: null, r3y: null },
      { launch_date: new Date(Date.now() - 120 * 86400000).toISOString() },
      null,
    );
    expect(result.stage.key).toBe("emerging");
    expect(result.confidence.score).toBeLessThanOrEqual(45);
    expect(result.rankExplanation).toContain("not decision-grade");
  });

  it("uses an asset-specific framework for debt funds", () => {
    const result = buildFundEvidenceAnalysis({ ...baseFund, assetClass: "Debt", category: "Corporate Bond" });
    expect(result.framework.key).toBe("debt");
    expect(result.framework.priorities).toContain("Credit quality");
  });

  it("marks cross-category comparisons as structurally unfair", () => {
    const result = buildComparisonEvidence([baseFund, { ...baseFund, category: "Small Cap", code: "2" }]);
    expect(result.comparable).toBe(false);
    expect(result.fairness).toContain("not a fair like-for-like conclusion");
  });

  it("withholds AMC confidence when too few canonical funds have one-year evidence", () => {
    const result = buildAmcEvidence({ eligible1yCount: 2, completeness: 80, categories: [{}, {}] });
    expect(result.eligible).toBe(false);
    expect(result.summary).toContain("provisional or withheld");
  });
});
