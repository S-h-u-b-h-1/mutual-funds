// Commodity data provider abstraction (Stock Intelligence, Section 13). Plain JS base class, not
// a TypeScript interface — same reasoning as frontend/app/lib/invest/providers/types.js: this
// codebase has no TS tooling anywhere, so an unimplemented method throws immediately rather than
// silently type-checking against a definition nobody enforces at runtime.
//
// No concrete provider here ever contacts BigMint or any other real commodity-data vendor. Only
// MockCommodityProvider (./mock/) exists right now — see docs/BIGMINT_DATA_INTEGRATION.md for why:
// BigMint's actual price data is subscription-gated, and scraping it is explicitly out of scope.
// Wiring a real provider is a licensing/commercial step, not an engineering one; when that
// happens, it becomes a second subclass of this same interface, and nothing else in the codebase
// (commodityService.js, any future screener/exposure UI) needs to change.
export class CommodityDataProvider {
  /** @param {{commodityName: string, grade?: string, location?: string}} query */
  async getLatestPrice(query) { throw new Error("CommodityDataProvider.getLatestPrice not implemented"); }
  /** @param {{commodityName: string, grade?: string, location?: string, from: string, to: string}} query */
  async getPriceHistory(query) { throw new Error("CommodityDataProvider.getPriceHistory not implemented"); }
  /** @returns {Promise<Array<{name: string, category: string, defaultUnit: string}>>} */
  async listAvailableCommodities() { throw new Error("CommodityDataProvider.listAvailableCommodities not implemented"); }
}
