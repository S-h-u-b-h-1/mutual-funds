// Mock portfolio-sync provider (Invest Platform Phase 1, Module 4). A no-op placeholder until
// Module 6/7 (Order Engine, Portfolio Engine) give it real settled orders to reconcile — kept
// here now only so the InvestmentProvider-adjacent interface set is complete per Module 3/4's
// scope, not because anything calls it yet.
import { PortfolioProvider } from "../types.js";

export class MockPortfolioProvider extends PortfolioProvider {
  async syncHoldings(userId) {
    return { userId, synced: true, provider: "mock-portfolio", holdingsUpdated: 0 };
  }
}
