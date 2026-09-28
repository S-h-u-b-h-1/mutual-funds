import { describe, it, expect } from "vitest";
import { revaluePortfolio } from "./revaluation";

const end = "2026-01-01";
const purchase = { transactionType: "purchase", transactionDate: "2025-01-01", amount: 1000 };
const value = (units, nav, cost, flows) => revaluePortfolio([{ id: "a", schemeCode: "a", unitBalance: units, investedValue: cost }], () => ({ nav, navDate: end }), flows);
describe("portfolio golden examples — independently specified cash-flow outcomes", () => {
  it.each([20, -20, -80])("one-year investment has exactly %s percent XIRR", rate => {
    const result = value(100, 10 * (1 + rate / 100), 1000, [purchase]);
    expect(result.xirr).toBeCloseTo(rate, 2);
    expect(result.absoluteGain).toBeCloseTo(rate * 10, 2);
  });
  it("monthly SIP cash flows constructed at 12% reconcile to 12%", () => {
    const flows = Array.from({ length: 12 }, (_, i) => ({ transactionType: "sip", transactionDate: `2025-${String(i + 1).padStart(2, "0")}-01`, amount: 1000 }));
    const terminal = flows.reduce((sum, flow) => sum + flow.amount * 1.12 ** ((Date.parse(end) - Date.parse(flow.transactionDate)) / 86400000 / 365), 0);
    const result = value(100, terminal / 100, 12000, flows);
    expect(result.xirr).toBeCloseTo(12, 2);
    expect(result.totalMarketValue).toBe(Math.round(terminal * 100) / 100);
  });
  it("partial redemption includes proceeds and the remaining position once", () => {
    const result = value(50, 11, 500, [purchase, { transactionType: "redemption", transactionDate: end, amount: 550 }]);
    expect(result.totalMarketValue).toBe(550);
    expect(result.absoluteGain).toBe(50);
    expect(result.xirr).toBe(10);
  });
  it("fully redeemed position closes with proceeds, not an invented terminal value", () => {
    const result = value(0, 11, 0, [purchase, { transactionType: "redemption", transactionDate: end, amount: 1100 }]);
    expect(result.totalMarketValue).toBe(0);
    expect(result.xirr).toBe(10);
  });
  it("dividend payout is external cash, reinvestment is not counted twice", () => {
    const dividend = { transactionType: "dividend_payout", transactionDate: end, amount: 100 };
    expect(value(100, 10, 1000, [purchase, dividend]).xirr).toBe(10);
    expect(value(110, 10, 1000, [purchase, { ...dividend, transactionType: "dividend_reinvestment" }]).xirr).toBe(10);
  });
  it("same-day internal switch legs cancel at portfolio level", () => {
    const legs = [{ transactionType: "switch_out", transactionDate: "2025-07-01", amount: 500 }, { transactionType: "switch_in", transactionDate: "2025-07-01", amount: 500 }];
    expect(value(100, 11, 1000, [purchase, ...legs]).xirr).toBe(10);
  });
});
