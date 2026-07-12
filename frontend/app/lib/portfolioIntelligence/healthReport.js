import { computeAnalytics } from "./analytics";
import { computeOverlap } from "./overlapEngine";
import { computeExposure } from "./exposureEngine";

// Canonical research-category buckets, keyword-matched against real AMFI category strings
// (case-insensitive substring — same explainable-matching approach as exposureEngine.js). A
// bucket with zero matching holdings is a genuine gap, not an estimate. Exported so other
// deterministic modules (goalPlanning.js) can bucket a raw category allocation into the same
// canonical set rather than re-deriving a second, possibly-inconsistent mapping.
export const CANONICAL_CATEGORIES = {
  "Large Cap": ["large cap"],
  "Mid Cap": ["mid cap"],
  "Small Cap": ["small cap"],
  Debt: ["debt", "gilt", "liquid", "corporate bond", "money market", "banking and psu", "credit risk", "overnight"],
  Gold: ["gold"],
  International: ["international", "overseas", "global", "fund of funds"],
  Hybrid: ["hybrid", "balanced advantage", "multi asset"],
  // "index" alone (not just "index fund"/"etf") — the real AMFI-derived category string for
  // index funds in this dataset is "Indexs" (a known upstream taxonomy artifact, not a typo to
  // fix here), which "index fund" does not match as a substring. Confirmed live: without the
  // bare "index" keyword, index funds were being reported as a *missing* category even when
  // held, silently wrong-footing missingCategories(), the Recommendation Engine, and the
  // Rebalancing Engine all at once.
  Index: ["index", "etf"],
};

export function categoryToCanonicalBucket(category) {
  const cat = (category || "").toLowerCase();
  for (const [bucket, keywords] of Object.entries(CANONICAL_CATEGORIES)) {
    if (keywords.some((k) => cat.includes(k))) return bucket;
  }
  return null;
}

function missingCategories(holdings) {
  const present = new Set();
  for (const h of holdings) {
    const bucket = categoryToCanonicalBucket(h.category);
    if (bucket) present.add(bucket);
  }
  return Object.keys(CANONICAL_CATEGORIES).filter((bucket) => !present.has(bucket));
}

// Category-level only, per this mission's standing compliance rule — never a specific fund name,
// never "buy"/"best fund". A gap in coverage is framed as something to research, not a
// recommendation.
function researchOpportunities(missing) {
  return missing.map((category) => ({ category, note: `No exposure to ${category} detected in this portfolio — a category worth researching for diversification.` }));
}

// Pure threshold rules over already-computed numbers — every string cites the exact figure that
// triggered it, so "why does this say that" always has a one-line answer. No AI, no free text.
function strengthsAndWeaknesses(analytics, overlap, exposure) {
  const strengths = [];
  const weaknesses = [];

  if (analytics.diversificationScore >= 70) strengths.push(`Well diversified — diversification score ${analytics.diversificationScore}/100.`);
  else if (analytics.diversificationScore < 50) weaknesses.push(`Concentrated portfolio — diversification score only ${analytics.diversificationScore}/100.`);

  if (analytics.concentrationScore < 20) strengths.push(`Low concentration risk — concentration score ${analytics.concentrationScore}/100.`);
  else if (analytics.concentrationScore >= 40) weaknesses.push(`High concentration risk — concentration score ${analytics.concentrationScore}/100.`);

  if (analytics.qualityScore != null) {
    if (analytics.qualityScore >= 70) strengths.push(`Strong average fund quality — weighted quality score ${analytics.qualityScore}/100.`);
    else if (analytics.qualityScore < 50) weaknesses.push(`Below-average fund quality — weighted quality score ${analytics.qualityScore}/100.`);
  }

  if (overlap.duplicateStocks.length === 0) strengths.push("No redundant stock exposure detected across your funds.");
  else if (analytics.stockOverlap.duplicateExposurePct >= 10)
    weaknesses.push(`${analytics.stockOverlap.duplicateExposurePct}% of your portfolio is redundantly exposed to the same stocks through multiple funds.`);

  if (overlap.duplicateFunds.length > 0) weaknesses.push(`${overlap.duplicateFunds.length} fund(s) are held via more than one source/folio — consider consolidating.`);

  const topHolding = analytics._internal.diversificationDetail.topHolding;
  if (topHolding >= 25) weaknesses.push(`Your largest single holding is ${topHolding}% of the portfolio.`);

  for (const [theme, t] of Object.entries(exposure.themes)) {
    if (t.available && t.exposurePct >= 40) weaknesses.push(`High concentration risk to ${theme} — ${t.exposurePct}% of your portfolio.`);
  }

  return { strengths, weaknesses };
}

// Investment Operating System mission, Phase 2 — one synthesized sentence ahead of the report's
// stat tiles and detail sections, so "what does this portfolio need" doesn't require reading
// every card first ("show conclusions before numbers" / understand-in-under-30-seconds). Priority
// order is the most actionable risk first, not just the first thing computed — concentration and
// diversification are things you'd change your NEXT action for; missing categories are lower
// urgency; a clean bill of health is only said when nothing above it fired.
function bottomLine(analytics, missing) {
  if (analytics.concentrationScore >= 40) {
    return `The biggest thing to address first: concentration risk is elevated (${analytics.concentrationScore}/100) — your largest holding is ${analytics._internal.diversificationDetail.topHolding.toFixed(1)}% of the portfolio. Reducing existing positions matters more right now than adding new ones.`;
  }
  if (analytics.diversificationScore < 50) {
    return `The biggest thing to address first: diversification is low (${analytics.diversificationScore}/100) across ${analytics.effectiveHoldings} effective holdings. Spreading across more categories or AMCs would do more for this portfolio than any single new position.`;
  }
  if (missing.length >= 4) {
    return `This portfolio has no exposure at all to ${missing.length} category buckets (${missing.slice(0, 3).join(", ")}${missing.length > 3 ? ", …" : ""}) — worth reviewing before adding more to what you already hold.`;
  }
  if (analytics.healthScore != null && analytics.healthScore >= 70) {
    return `No high-severity flags — health score ${analytics.healthScore}/100 with diversification (${analytics.diversificationScore}/100) and concentration (${analytics.concentrationScore}/100) both in a reasonable range.`;
  }
  return `Health score ${analytics.healthScore ?? "not available"}/100 — no single dominant risk detected, but no strong margin either. See the sections below for specifics.`;
}

// Phase D — assembles Phase A/B/C into one deterministic JSON object. No AI anywhere in this
// file or anything it calls; every field traces to a real computed number.
export function buildHealthReport(rawHoldings) {
  const analytics = computeAnalytics(rawHoldings);
  const overlap = computeOverlap(rawHoldings, analytics);
  const exposure = computeExposure(analytics.holdings);
  const missing = missingCategories(analytics.holdings);
  const { strengths, weaknesses } = strengthsAndWeaknesses(analytics, overlap, exposure);

  return {
    bottomLine: bottomLine(analytics, missing),
    portfolioSummary: {
      totalValue: analytics.totalValue,
      holdingsCount: analytics.holdingsCount,
      effectiveHoldings: analytics.effectiveHoldings,
      effectiveAmcs: analytics.effectiveAmcs,
      effectiveCategories: analytics.effectiveCategories,
      healthScore: analytics.healthScore,
      qualityScore: analytics.qualityScore,
    },
    strengths,
    weaknesses,
    diversification: {
      score: analytics.diversificationScore,
      effectiveHoldings: analytics.effectiveHoldings,
      effectiveAmcs: analytics.effectiveAmcs,
      effectiveCategories: analytics.effectiveCategories,
      topHolding: analytics._internal.diversificationDetail.topHolding,
      top3Holdings: analytics._internal.diversificationDetail.top3Holdings,
    },
    concentration: {
      score: analytics.concentrationScore,
      hhiHoldings: analytics._internal.diversificationDetail.hhiHoldings,
      hhiAmc: analytics._internal.diversificationDetail.hhiAmc,
      hhiCategory: analytics._internal.diversificationDetail.hhiCategory,
    },
    risk: {
      volatility: analytics.volatility,
      expectedDrawdown: analytics.expectedDrawdown,
      methodology: analytics._internal.riskDetail.methodology,
    },
    exposure: exposure.themes,
    overlap: {
      duplicateFunds: overlap.duplicateFunds,
      duplicateSectors: overlap.duplicateSectors,
      duplicateStocks: overlap.duplicateStocks,
      duplicateBenchmarks: overlap.duplicateBenchmarks,
      duplicateAmcs: overlap.duplicateAmcs,
    },
    missingCategories: missing,
    researchOpportunities: researchOpportunities(missing),
    allocations: {
      amc: analytics.amcAllocation,
      category: analytics.categoryAllocation,
      benchmark: analytics.benchmarkAllocation,
      sector: analytics.sectorAllocation,
    },
    topHoldings: analytics.topHoldings,
    _analytics: analytics, // internal — the API route persists numeric fields from this into portfolio_metrics
  };
}
