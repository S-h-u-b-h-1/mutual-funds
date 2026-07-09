import { consolidateByScheme, totalPortfolioValue, groupAllocation, sectorAllocation, topHoldings, effectiveN } from "./allocations";
import { underlyingStockExposure } from "./stockOverlap";
import { qualityScore, diversificationConcentrationScores, riskApproximation, healthScore } from "./scores";

// Phase A orchestrator — takes raw (pre-consolidation) holdings from holdingsRead.js, computes
// every deterministic metric in one pass, and hands back both the consolidated holdings (used by
// overlapEngine.js/exposureEngine.js so nothing downstream recomputes it) and the full metrics
// object. No AI, no estimation — every field here traces to a real portfolio_holdings row and the
// same live fund data every other page reads.
export function computeAnalytics(rawHoldings) {
  const holdings = consolidateByScheme(rawHoldings);
  const totalValue = totalPortfolioValue(holdings);

  const amcAllocation = groupAllocation(holdings, (h) => h.amc);
  const categoryAllocation = groupAllocation(holdings, (h) => h.category);
  const benchmarkAllocation = groupAllocation(holdings, (h) => h.benchmark);
  const sectors = sectorAllocation(holdings);
  const stockExposure = underlyingStockExposure(holdings);
  const quality = qualityScore(holdings);
  const diversification = diversificationConcentrationScores(holdings, amcAllocation, categoryAllocation);
  const risk = riskApproximation(holdings);
  const health = healthScore({
    quality: quality.score,
    diversificationScore: diversification.diversificationScore,
    concentrationScore: diversification.concentrationScore,
    duplicateExposurePct: stockExposure.duplicateExposurePct,
  });

  return {
    holdings, // consolidated — reuse this, don't re-consolidate downstream
    totalValue,
    holdingsCount: holdings.length,
    amcAllocation,
    categoryAllocation,
    benchmarkAllocation,
    sectorAllocation: sectors,
    topHoldings: topHoldings(holdings),
    stockOverlap: { duplicateExposurePct: stockExposure.duplicateExposurePct, duplicatedStockCount: stockExposure.duplicated.length, coveragePct: stockExposure.coveragePct },
    effectiveHoldings: effectiveN(holdings.map((h) => h.weight)),
    effectiveAmcs: effectiveN(amcAllocation.map((a) => a.weight)),
    effectiveCategories: effectiveN(categoryAllocation.map((a) => a.weight)),
    diversificationScore: diversification.diversificationScore,
    concentrationScore: diversification.concentrationScore,
    qualityScore: quality.score,
    healthScore: health?.overall ?? null,
    healthScoreBreakdown: health?.breakdown ?? [],
    volatility: risk.volatility,
    expectedDrawdown: risk.expectedDrawdown,
    _internal: { stockExposure, sectorContributions: sectors.contributionsBySector, diversificationDetail: diversification, qualityDetail: quality, riskDetail: risk },
  };
}
