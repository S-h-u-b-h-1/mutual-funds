import { getMetadata } from "../metadata";

// portfolio_holdings allows the same scheme_code to appear as multiple rows (different
// source/folio — e.g. the same fund held via both Groww and a Coin folio). Allocation math must
// treat those as ONE position; overlapEngine.js deliberately uses the pre-consolidation rows to
// detect exactly this as "duplicate funds". This is the one place consolidation happens, so both
// callers stay consistent with each other.
export function consolidateByScheme(holdings) {
  const byScheme = {};
  for (const h of holdings) {
    const entry = (byScheme[h.schemeCode] ||= { ...h, units: 0, purchaseValue: 0, currentValue: 0, sources: [] });
    entry.units += h.units || 0;
    entry.purchaseValue = (entry.purchaseValue || 0) + (h.purchaseValue || 0);
    entry.currentValue = (entry.currentValue || 0) + (h.currentValue || 0);
    entry.sources.push({ source: h.source, folioNumber: h.folioNumber, units: h.units, currentValue: h.currentValue });
  }
  const consolidated = Object.values(byScheme);
  const totalValue = consolidated.reduce((s, h) => s + (h.currentValue || 0), 0);
  for (const h of consolidated) {
    h.weight = totalValue > 0 && h.currentValue != null ? +((h.currentValue / totalValue) * 100).toFixed(2) : null;
    h.avgCost = h.units > 0 ? +(h.purchaseValue / h.units).toFixed(4) : null;
  }
  return consolidated.sort((a, b) => (b.weight || 0) - (a.weight || 0));
}

export function totalPortfolioValue(holdings) {
  return +holdings.reduce((s, h) => s + (h.currentValue || 0), 0).toFixed(2);
}

// Groups already-consolidated holdings by an arbitrary key (AMC name, category, benchmark, ...)
// and returns each group's value + weight, sorted descending. Every allocation metric in Phase A
// that isn't sector-level (which needs sub-fund weighting, see sectorAllocation below) is this
// same function applied to a different key.
export function groupAllocation(holdings, keyFn) {
  const groups = {};
  for (const h of holdings) {
    const key = keyFn(h) || "Unknown";
    groups[key] = (groups[key] || 0) + (h.currentValue || 0);
  }
  const total = Object.values(groups).reduce((s, v) => s + v, 0);
  return Object.entries(groups)
    .map(([name, value]) => ({ name, value: +value.toFixed(2), weight: total > 0 ? +((value / total) * 100).toFixed(2) : 0 }))
    .sort((a, b) => b.value - a.value);
}

// Sector allocation needs sub-fund weighting (one fund can span many sectors), unlike
// AMC/category/benchmark which are 1:1 per holding — so it can't reuse groupAllocation directly.
// Only ~152 funds (of the full universe) have factsheet-sourced sector_allocation as of this
// build (same honesty convention as marketImpact.js's sectorExposure) — coveragePct discloses
// what fraction of portfolio value the breakdown actually accounts for, rather than silently
// presenting a partial breakdown as if it were complete.
export function sectorAllocation(holdings) {
  const bySector = {};
  const totalValue = holdings.reduce((s, h) => s + (h.currentValue || 0), 0);
  let coveredValue = 0;
  const contributionsBySector = {}; // kept for overlapEngine.js's sector-overlap detection

  for (const h of holdings) {
    const meta = getMetadata(h.schemeCode);
    const allocs = (meta?.sector_allocation || []).filter((s) => s.sector && (s.allocation_pct || 0) > 0);
    if (!allocs.length) continue;
    coveredValue += h.currentValue || 0;
    for (const a of allocs) {
      const contribution = (h.currentValue || 0) * ((a.allocation_pct || 0) / 100);
      bySector[a.sector] = (bySector[a.sector] || 0) + contribution;
      (contributionsBySector[a.sector] ||= []).push({ schemeCode: h.schemeCode, schemeName: h.schemeName, contributionValue: +contribution.toFixed(2) });
    }
  }

  const sectorTotal = Object.values(bySector).reduce((s, v) => s + v, 0);
  const breakdown = Object.entries(bySector)
    .map(([name, value]) => ({ name, value: +value.toFixed(2), weight: sectorTotal > 0 ? +((value / sectorTotal) * 100).toFixed(2) : 0 }))
    .sort((a, b) => b.value - a.value);

  return {
    breakdown,
    coveragePct: totalValue > 0 ? +((coveredValue / totalValue) * 100).toFixed(1) : 0,
    methodology: "Weighted by each fund's own factsheet sector_allocation × this holding's portfolio weight. Only funds with factsheet-sourced sector data are included — coveragePct is the portfolio value fraction that represents.",
    contributionsBySector, // internal — overlapEngine.js reuses this rather than recomputing it
  };
}

export function topHoldings(holdings, limit = 10) {
  return holdings
    .slice(0, limit)
    .map((h) => ({ schemeCode: h.schemeCode, schemeName: h.schemeName, amc: h.amc, category: h.category, weight: h.weight, currentValue: h.currentValue }));
}

// Effective N (inverse Herfindahl): how many EQUALLY-weighted positions this allocation is
// equivalent to. A portfolio of 10 funds where one is 70% of the value has an effective N well
// below 10 — this is the standard portfolio-theory way to make concentration comparable across
// portfolios with different raw counts.
export function effectiveN(weightsPct) {
  const hhi = weightsPct.reduce((s, w) => s + Math.pow((w || 0) / 100, 2), 0);
  return hhi > 0 ? +(1 / hhi).toFixed(2) : 0;
}
