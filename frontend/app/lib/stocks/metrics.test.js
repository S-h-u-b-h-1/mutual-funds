import { describe, it, expect } from "vitest";
import { METRIC_DEFINITIONS, computeMetrics } from "./metrics.js";
import { LINE_ITEM_KEYS } from "./financialStatements.js";

describe("metrics", () => {
  it("every field a metric reads is a real LINE_ITEM_KEYS entry (the module's own load-time self-check already ran on import; this re-asserts the vocabulary is non-empty and importable)", () => {
    expect(LINE_ITEM_KEYS.pnl).toContain("revenue");
    expect(Object.keys(METRIC_DEFINITIONS).length).toBeGreaterThan(10);
  });

  it("computes hand-verifiable margin/return ratios from simple fixture numbers", () => {
    const input = {
      pnl: { revenue: 1000, ebitda: 250, depreciation_amortization: 50, net_profit: 100, profit_before_tax: 150, finance_costs: 30, eps_basic: 12.5 },
      balanceSheet: { total_equity: 500, total_assets: 1200, current_liabilities: 200, total_debt: 250, current_assets: 400 },
      cashFlow: { cfo: 180, capex: 60 },
    };
    const result = computeMetrics(input);

    expect(result.ebitdaMargin.value).toBe(25); // 250/1000 * 100
    expect(result.operatingMargin.value).toBe(20); // (250-50)/1000 * 100
    expect(result.netProfitMargin.value).toBe(10); // 100/1000 * 100
    expect(result.roe.value).toBe(20); // 100/500 * 100
    expect(result.roce.value).toBe(18); // (150+30)/(1200-200) * 100
    expect(result.debtToEquity.value).toBe(0.5); // 250/500
    expect(result.interestCoverage.value).toBeCloseTo(8.333, 2); // 250/30
    expect(result.freeCashFlow.value).toBe(120); // 180-60
    expect(result.cfoToPat.value).toBe(1.8); // 180/100
    expect(result.workingCapital.value).toBe(200); // 400-200
    expect(result.epsBasic.value).toBe(12.5);
  });

  it("revenueGrowth needs previousPeriod.pnl.revenue and computes a real YoY percentage", () => {
    const grown = computeMetrics({ pnl: { revenue: 1150 }, previousPeriod: { pnl: { revenue: 1000 } } });
    expect(grown.revenueGrowth.value).toBe(15);

    const noPrior = computeMetrics({ pnl: { revenue: 1150 } });
    expect(noPrior.revenueGrowth.value).toBeNull();
  });

  it("every metric returns null (never 0, never a fabricated number) when its required inputs are entirely missing", () => {
    const result = computeMetrics({});
    for (const [key, entry] of Object.entries(result)) {
      expect(entry.value, `expected ${key} to be null for empty input`).toBeNull();
      expect(entry.label).toBe(METRIC_DEFINITIONS[key].label);
      expect(entry.unit).toBe(METRIC_DEFINITIONS[key].unit);
    }
  });

  it("computeMetrics tolerates undefined/null input and explicitly-null sections without throwing", () => {
    expect(() => computeMetrics(undefined)).not.toThrow();
    expect(() => computeMetrics(null)).not.toThrow();
    expect(() => computeMetrics({ pnl: null, balanceSheet: null, cashFlow: null })).not.toThrow();
    expect(computeMetrics(null).roe.value).toBeNull();
  });

  it("never divides by zero into Infinity/NaN — a zero denominator is null, not a fabricated ratio", () => {
    const result = computeMetrics({ pnl: { revenue: 1000, ebitda: 100 }, balanceSheet: { total_equity: 0 } });
    expect(result.roe.value).toBeNull(); // net_profit missing too, but total_equity=0 alone must not produce Infinity
    const result2 = computeMetrics({ pnl: { net_profit: 100 }, balanceSheet: { total_equity: 0 } });
    expect(result2.roe.value).toBeNull();
    expect(Number.isFinite(result2.roe.value) || result2.roe.value === null).toBe(true);
  });

  it("bookValuePerShare divides total_equity by the sharesOutstanding param, not a financial-statement field", () => {
    const result = computeMetrics({ balanceSheet: { total_equity: 5000 }, sharesOutstanding: 1000 });
    expect(result.bookValuePerShare.value).toBe(5);
    const noShares = computeMetrics({ balanceSheet: { total_equity: 5000 } });
    expect(noShares.bookValuePerShare.value).toBeNull();
  });

  it("assetTurnover computes revenue / total_assets", () => {
    const result = computeMetrics({ pnl: { revenue: 900 }, balanceSheet: { total_assets: 300 } });
    expect(result.assetTurnover.value).toBe(3);
  });
});
