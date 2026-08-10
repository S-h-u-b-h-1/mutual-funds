import snapshot from "../../data/stock_universe.json";

export const STOCK_INDEX_KEYS = ["NIFTY50", "BSE100"];

export function getStockUniverseSnapshot() {
  return snapshot;
}

export function getIndexUniverse(indexKey = "NIFTY50") {
  const safeKey = STOCK_INDEX_KEYS.includes(indexKey) ? indexKey : "NIFTY50";
  return { key: safeKey, ...snapshot.indices[safeKey] };
}

export function searchIndexUniverse({ indexKey = "NIFTY50", query = "" } = {}) {
  const index = getIndexUniverse(indexKey);
  const needle = String(query).trim().toLowerCase();
  if (!needle) return index.constituents;
  return index.constituents.filter((company) =>
    [company.name, company.industry, company.nseSymbol, company.bseCode, company.isin]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle))
  );
}

export function getStockUniverseSummary() {
  const indices = STOCK_INDEX_KEYS.map(getIndexUniverse);
  return {
    retrievedAt: snapshot.retrievedAt,
    records: indices.reduce((total, index) => total + index.constituentCount, 0),
    indices: indices.length,
    identifiers: indices.reduce(
      (total, index) => total + Object.values(index.identifierCoverage).reduce((sum, count) => sum + count, 0),
      0
    ),
  };
}

