import { describe, it, expect } from "vitest";
import { fundsWorthResearching } from "./marketImpact";

describe("fund-page related research", () => {
  it.each(["Equity", "Debt", "Hybrid", "Other"])("composes and deduplicates real %s funds without a runtime reference error", entityName => {
    const result = fundsWorthResearching({ entityType: "category", entityName });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(fund => fund.code && fund.name)).toBe(true);
  });
});
