// Phase B — Overlap Engine. Every percentage here is an exact sum over real currentValue figures
// (never a sampled or estimated figure) — reuses analytics.js's consolidated holdings and
// sectorContributions/stockOverlap internals rather than recomputing them, and rawHoldings (the
// pre-consolidation rows) specifically to detect the one thing consolidation intentionally
// erases: the same fund imported more than once.
export function computeOverlap(rawHoldings, analytics) {
  const { holdings, totalValue, _internal } = analytics;

  const byScheme = {};
  for (const h of rawHoldings) (byScheme[h.schemeCode] ||= []).push(h);
  const duplicateFunds = Object.values(byScheme)
    .filter((rows) => rows.length > 1)
    .map((rows) => {
      const value = rows.reduce((s, r) => s + (r.currentValue || 0), 0);
      return {
        schemeCode: rows[0].schemeCode,
        schemeName: rows[0].schemeName,
        occurrences: rows.map((r) => ({ source: r.source, folioNumber: r.folioNumber, units: r.units, currentValue: r.currentValue })),
        totalValue: +value.toFixed(2),
        totalWeightPct: totalValue > 0 ? +((value / totalValue) * 100).toFixed(2) : 0,
      };
    })
    .sort((a, b) => b.totalWeightPct - a.totalWeightPct);

  const duplicateSectors = Object.entries(_internal.sectorContributions || {})
    .map(([sector, contributions]) => {
      const distinctFunds = [...new Map(contributions.map((c) => [c.schemeCode, c])).values()];
      const value = contributions.reduce((s, c) => s + c.contributionValue, 0);
      return { sector, fundsInvolved: distinctFunds.length, funds: distinctFunds, totalExposureValue: +value.toFixed(2), totalExposurePct: totalValue > 0 ? +((value / totalValue) * 100).toFixed(2) : 0 };
    })
    .filter((s) => s.fundsInvolved > 1)
    .sort((a, b) => b.totalExposurePct - a.totalExposurePct);

  const duplicateStocks = _internal.stockExposure.duplicated.map((s) => ({ name: s.name, fundCount: s.fundCount, totalExposurePct: s.totalWeight, funds: s.funds }));

  const groupDuplicates = (keyFn) =>
    Object.values(
      holdings.reduce((acc, h) => {
        const key = keyFn(h) || "Unknown";
        (acc[key] ||= { key, holdings: [], totalValue: 0 }).holdings.push({ schemeCode: h.schemeCode, schemeName: h.schemeName, weight: h.weight });
        acc[key].totalValue += h.currentValue || 0;
        return acc;
      }, {})
    )
      .filter((g) => g.holdings.length > 1)
      .map((g) => ({ ...g, totalValue: +g.totalValue.toFixed(2), totalWeightPct: totalValue > 0 ? +((g.totalValue / totalValue) * 100).toFixed(2) : 0 }))
      .sort((a, b) => b.totalWeightPct - a.totalWeightPct);

  return {
    duplicateFunds,
    duplicateSectors,
    duplicateStocks,
    duplicateBenchmarks: groupDuplicates((h) => h.benchmark).map((g) => ({ benchmark: g.key, funds: g.holdings, totalValue: g.totalValue, totalWeightPct: g.totalWeightPct })),
    duplicateAmcs: groupDuplicates((h) => h.amc).map((g) => ({ amc: g.key, funds: g.holdings, totalValue: g.totalValue, totalWeightPct: g.totalWeightPct })),
    methodology: "Every percentage is an exact sum of real currentValue figures over the portfolio's real totalValue — no sampling or estimation. 'Duplicate' means the same fund/sector/stock/benchmark/AMC is reachable through more than one distinct holding.",
  };
}
