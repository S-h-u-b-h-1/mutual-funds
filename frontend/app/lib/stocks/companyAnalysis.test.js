import { describe, expect, it } from "vitest";
import { buildCompanyAnalysis } from "./companyAnalysis";

const metric = (value) => ({ value });

describe("company evidence analysis", () => {
  it("separates supportive evidence, caution flags and open questions", () => {
    const result = buildCompanyAnalysis({
      pnlStatements: [
        { fiscalYear: 2022, fields: { revenue: 100, net_profit: 10 } },
        { fiscalYear: 2025, fields: { revenue: 150, net_profit: 18 } },
      ],
      metrics: { roce: metric(18), cfoToPat: metric(1.05), debtToEquity: metric(0.3) },
      valuation: { pe: 24 },
      peers: [{ valuation: { pe: 18 } }, { valuation: { pe: 20 } }, { valuation: { pe: 22 } }],
    });

    expect(result.strengths.some((item) => item.includes("Revenue compounded"))).toBe(true);
    expect(result.strengths.some((item) => item.includes("ROCE"))).toBe(true);
    expect(result.questions.some((item) => item.includes("same-industry peers"))).toBe(true);
  });

  it("does not turn missing evidence into a favourable statement", () => {
    const result = buildCompanyAnalysis({ pnlStatements: [], metrics: null, valuation: null, peers: [] });
    expect(result.strengths).toEqual([]);
    expect(result.questions.length).toBeGreaterThan(0);
  });
});
