// Portfolio Risk Score from real factsheet holdings + sector allocation (Phase 6).
// Higher score = better diversified / lower concentration risk. Computed only when real
// holdings/sectors exist; returns null otherwise (never estimated).

export function portfolioRisk(meta) {
  if (!meta) return null;
  const sectors = (meta.sector_allocation || []).filter((s) => s.sector && !/cash|sovereign|others|derivative/i.test(s.sector));
  const holdings = meta.holdings || [];
  if (!sectors.length && !holdings.length) return null;

  const sectorTop3 = sectors.slice().sort((a, b) => (b.allocation_pct || 0) - (a.allocation_pct || 0)).slice(0, 3)
    .reduce((s, x) => s + (x.allocation_pct || 0), 0);
  const top10 = holdings.slice(0, 10).reduce((s, h) => s + (h.weight || 0), 0);
  const topHolding = holdings.reduce((m, h) => Math.max(m, h.weight || 0), 0);
  // Herfindahl on sectors (0..1; lower = more diversified)
  const hhi = sectors.reduce((s, x) => s + Math.pow((x.allocation_pct || 0) / 100, 2), 0);

  // Diversification score: penalise high sector-top3, top-holding and HHI.
  const score = Math.max(0, Math.min(100, Math.round(
    100 - Math.max(0, sectorTop3 - 45) * 1.1 - Math.max(0, topHolding - 8) * 1.5 - hhi * 60
  )));
  const level = score >= 70 ? "Well diversified" : score >= 50 ? "Moderately concentrated" : "Concentrated";

  const insights = [];
  if (sectorTop3) insights.push(`Top 3 sectors are ${sectorTop3.toFixed(0)}% of the portfolio.`);
  if (topHolding) insights.push(`Largest single holding is ${topHolding.toFixed(1)}%.`);
  if (top10) insights.push(`Top 10 holdings make up ${top10.toFixed(0)}%.`);

  return { score, level, sectorTop3: Math.round(sectorTop3), top10: Math.round(top10), topHolding, insights };
}
