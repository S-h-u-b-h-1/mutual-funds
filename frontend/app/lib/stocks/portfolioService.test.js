import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { recordTransaction, getHoldings, getHolding, getTransactions, getPortfolioSummary } from "./portfolioService.js";
import { createTestCompany, deleteTestCompany } from "./testHelpers.js";
import { createTestUser, deleteTestUser } from "../invest/testHelpers.js";
import { query } from "../db.js";

describe("portfolioService (integration, real Neon, disposable user + company)", () => {
  let userId, companyId;

  beforeAll(async () => {
    userId = await createTestUser("stock-portfolio");
    companyId = await createTestCompany({ label: "portfolio" });
  });

  afterAll(async () => {
    await query(`delete from stock_transactions where user_id = $1`, [userId]);
    await query(`delete from stock_holdings where user_id = $1`, [userId]);
    await deleteTestCompany(companyId);
    await deleteTestUser(userId);
  });

  it("rejects an invalid transactionType/source and non-positive quantity", async () => {
    await expect(recordTransaction({ userId, companyId, transactionType: "hold", quantity: 1, price: 100, transactionDate: "2026-01-01" })).rejects.toThrow(/invalid transactionType/);
    await expect(recordTransaction({ userId, companyId, transactionType: "buy", quantity: 0, price: 100, transactionDate: "2026-01-01" })).rejects.toThrow(/requires quantity > 0/);
  });

  it("computes a weighted-average cost across two buys at different prices", async () => {
    const first = await recordTransaction({ userId, companyId, transactionType: "buy", quantity: 10, price: 100, transactionDate: "2026-01-01" });
    expect(first.holding.quantity).toBe(10);
    expect(first.holding.avgCost).toBe(100);

    const second = await recordTransaction({ userId, companyId, transactionType: "buy", quantity: 10, price: 200, transactionDate: "2026-02-01" });
    expect(second.holding.quantity).toBe(20);
    expect(second.holding.avgCost).toBe(150); // (10*100 + 10*200) / 20

    const holding = await getHolding(userId, companyId);
    expect(holding.avgCost).toBe(150);
    expect(holding.investedValue).toBe(3000);
  });

  it("leaves avg_cost unchanged on a partial sell, and rejects selling more than held", async () => {
    const sell = await recordTransaction({ userId, companyId, transactionType: "sell", quantity: 5, price: 250, transactionDate: "2026-03-01" });
    expect(sell.holding.quantity).toBe(15);
    expect(sell.holding.avgCost).toBe(150); // unchanged by the sell

    await expect(recordTransaction({ userId, companyId, transactionType: "sell", quantity: 1000, price: 250, transactionDate: "2026-03-02" })).rejects.toThrow(/cannot sell/);
  });

  it("dedupes an exact-fingerprint-duplicate transaction instead of double-applying it", async () => {
    const before = await getHolding(userId, companyId);
    const dup = await recordTransaction({ userId, companyId, transactionType: "sell", quantity: 5, price: 250, transactionDate: "2026-03-01" }); // identical to the sell above
    expect(dup.deduped).toBe(true);
    const after = await getHolding(userId, companyId);
    expect(after.quantity).toBe(before.quantity); // not reduced a second time
  });

  it("lists holdings and transaction history, and summarizes invested value + sector allocation without fabricating current value", async () => {
    const holdings = await getHoldings(userId);
    expect(holdings.some((h) => h.companyId === companyId)).toBe(true);

    const txns = await getTransactions(userId, { companyId });
    expect(txns.length).toBeGreaterThanOrEqual(3);

    const summary = await getPortfolioSummary(userId);
    expect(summary.holdingsCount).toBeGreaterThan(0);
    expect(summary.totalInvestedValue).toBeGreaterThan(0);
    expect(summary.currentValue).toBeNull();
    expect(summary.unavailableReason).toBe("no_live_price_feed");
  });
});
