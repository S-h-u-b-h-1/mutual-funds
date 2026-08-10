import { describe, expect, it } from "vitest";
import { computePortfolioProjection } from "./projectionModel";
import { healthScore } from "./scores";

const holdings = [
  { schemeCode: "100218", schemeName: "JM Large Cap", category: "Large Cap", weight: 60, currentValue: 600000 },
  { schemeCode: "100046", schemeName: "ABSL Liquid", category: "Liquid", weight: 40, currentValue: 400000 },
];

describe("portfolio projection model", () => {
  it("returns bounded, widening planning ranges and explicit confidence", () => {
    const model = computePortfolioProjection(holdings);
    expect(model.ranges.map((item) => item.years)).toEqual([1, 3, 5]);
    expect(model.confidence.score).toBeGreaterThanOrEqual(0);
    expect(model.confidence.score).toBeLessThanOrEqual(82);
    expect(model.ranges[0].lowValue).toBeLessThan(model.ranges[0].centralValue);
    expect(model.ranges[0].centralValue).toBeLessThan(model.ranges[0].highValue);
    expect(model.ranges[2].highReturnPct - model.ranges[2].lowReturnPct).toBeGreaterThan(model.ranges[0].highReturnPct - model.ranges[0].lowReturnPct);
    expect(model.stressTests.every((item) => item.probability === "Not assigned")).toBe(true);
  });

  it("keeps an unknown new fund on its prior with zero evidence credibility", () => {
    const model = computePortfolioProjection([{ schemeCode: "new-fund", schemeName: "New Fund", category: "", weight: 100, currentValue: 100000 }]);
    expect(model.holdingAssumptions[0].bucket).toBe("Unknown");
    expect(model.holdingAssumptions[0].credibilityPct).toBe(0);
    expect(model.holdingAssumptions[0].expectedReturnPct).toBe(model.holdingAssumptions[0].priorReturnPct);
    expect(model.confidence.label).toBe("Low");
  });

  it("separates evidence confidence from the merit-based health score", () => {
    const result = healthScore({ quality: 75, diversificationScore: 70, concentrationScore: 20, duplicateExposurePct: 5, downsideResilienceScore: 65, balanceScore: 60 });
    expect(result.overall).toBeGreaterThan(0);
    expect(result.breakdown.map((item) => item.key)).toEqual(["quality", "diversification", "concentration", "overlapPenalty", "downsideResilience", "assetBalance"]);
    expect(result.breakdown.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
  });
});
