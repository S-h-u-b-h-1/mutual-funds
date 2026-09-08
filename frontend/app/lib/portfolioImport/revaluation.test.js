import { describe, it, expect } from "vitest";
import { revaluePortfolio } from "./revaluation";

const holding = { id: "a", schemeCode: "a", unitBalance: 100, investedValue: 1000 };
describe("single-date portfolio valuation", () => {
  it.each(["2026-09-04", "2026-09-07", "2026-08-14"])("dates terminal value at source NAV %s regardless of wall clock", (navDate) => {
    const prior = new Date(navDate); prior.setUTCDate(prior.getUTCDate() - 365);
    const result = revaluePortfolio([holding], () => ({ nav: 11, navDate }), [{ transactionType: "purchase", transactionDate: prior.toISOString().slice(0, 10), amount: 1000 }]);
    expect(result.valuationDate).toBe(navDate);
    expect(result.totalMarketValue).toBe(1100);
    expect(result.absoluteGain).toBe(100);
    expect(result.xirr).toBe(10);
    expect(result.holdingValuations.reduce((sum, row) => sum + row.marketValue, 0)).toBe(result.totalMarketValue);
  });
  it("does not publish mixed-date totals or XIRR", () => {
    const result = revaluePortfolio([holding, { ...holding, id: "b", schemeCode: "b" }], code => ({ nav: 11, navDate: code === "a" ? "2026-09-07" : "2026-09-04" }));
    expect(result.totalMarketValue).toBeNull();
    expect(result.xirr).toBeNull();
    expect(result.valuationDate).toBeNull();
    expect(result.unavailableReason).toBe("mixed_nav_dates");
    expect(result.coveredMarketValue).toBe(2200);
  });
  it("does not turn missing NAV into a zero-valued investment", () => {
    const result = revaluePortfolio([holding], () => null);
    expect(result.totalMarketValue).toBeNull();
    expect(result.absoluteGain).toBeNull();
  });
  it("suppresses XIRR when transactions postdate the available valuation", () => {
    const result = revaluePortfolio([holding], () => ({ nav: 11, navDate: "2026-09-04" }), [{ transactionType: "purchase", transactionDate: "2026-09-07", amount: 1000 }]);
    expect(result.xirr).toBeNull();
  });
});
