import { getMetadata } from "../metadata";

// Underlying-stock exposure: for each holding, pulls its fund's real equity holdings from
// metadata.json (factsheet-sourced, partial coverage — same honesty convention as
// allocations.js's sectorAllocation) and weights each stock's contribution by
// (this holding's portfolio weight × the stock's weight within that fund), then aggregates by
// stock name across every fund the user owns. This is the single computation shared by Phase A's
// "stock overlap"/"duplicate exposure" metrics and Phase B's full "duplicate stocks" detail —
// built once here, not twice.
export function underlyingStockExposure(holdings) {
  const byStock = {};
  let coveredValue = 0;
  const totalValue = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);

  for (const h of holdings) {
    const meta = getMetadata(h.schemeCode);
    const stockHoldings = (meta?.holdings || []).filter((s) => s.holding_type === "equity" && s.name && (s.weight || 0) > 0);
    if (!stockHoldings.length) continue;
    coveredValue += h.currentValue || 0;
    for (const s of stockHoldings) {
      const contributionPct = (h.weight || 0) * ((s.weight || 0) / 100); // % of total portfolio
      const key = s.name.trim();
      const entry = (byStock[key] ||= { name: key, totalWeight: 0, funds: [] });
      entry.totalWeight += contributionPct;
      entry.funds.push({ schemeCode: h.schemeCode, schemeName: h.schemeName, stockWeightInFund: s.weight, contributionToPortfolioPct: +contributionPct.toFixed(3) });
    }
  }

  const stocks = Object.values(byStock)
    .map((e) => ({ name: e.name, totalWeight: +e.totalWeight.toFixed(2), fundCount: e.funds.length, funds: e.funds }))
    .sort((a, b) => b.totalWeight - a.totalWeight);
  const duplicated = stocks.filter((s) => s.fundCount > 1);
  const duplicateExposurePct = +duplicated.reduce((s, x) => s + x.totalWeight, 0).toFixed(2);

  return {
    stocks,
    duplicated,
    duplicateExposurePct,
    coveragePct: totalValue > 0 ? +((coveredValue / totalValue) * 100).toFixed(1) : 0,
    methodology: "Weighted by each fund's own factsheet equity holdings × this holding's portfolio weight. 'Duplicated' stocks appear in more than one of your funds — duplicateExposurePct is the total portfolio % redundantly exposed to those stocks through multiple funds.",
  };
}
