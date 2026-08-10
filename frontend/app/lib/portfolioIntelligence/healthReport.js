import { computeAnalytics } from "./analytics";
import { computeOverlap } from "./overlapEngine";
import { computeExposure } from "./exposureEngine";
import { CANONICAL_CATEGORIES, categoryToCanonicalBucket } from "./categoryBuckets";

// Canonical research-category buckets, keyword-matched against real AMFI category strings
// (case-insensitive substring — same explainable-matching approach as exposureEngine.js). A
// bucket with zero matching holdings is a genuine gap, not an estimate. Exported so other
// deterministic modules (goalPlanning.js) can bucket a raw category allocation into the same
// canonical set rather than re-deriving a second, possibly-inconsistent mapping.
export { CANONICAL_CATEGORIES, categoryToCanonicalBucket } from "./categoryBuckets";

function missingCategories(holdings) {
  const present = new Set();
  for (const h of holdings) {
    const bucket = categoryToCanonicalBucket(h.category);
    if (Object.prototype.hasOwnProperty.call(CANONICAL_CATEGORIES, bucket)) present.add(bucket);
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
function insight({ title, observation, whyItMatters, evidence, confidence, nextStep, severity = "medium" }) {
  return { title, observation, whyItMatters, evidence, confidence, nextStep, severity, summary: `${title} — ${observation}` };
}

function strengthsAndWeaknesses(analytics, overlap, exposure) {
  const strengthDetails = [];
  const weaknessDetails = [];
  const modelConfidence = analytics.projection.confidence;
  const confidence = `${modelConfidence.label} (${modelConfidence.score}/100 input confidence)`;
  const topHolding = analytics._internal.diversificationDetail.topHolding;

  if (analytics.diversificationScore >= 70) strengthDetails.push(insight({
    title: "Diversification is doing useful work",
    observation: `Diversification scores ${analytics.diversificationScore}/100 across ${analytics.effectiveHoldings} effective holdings, ${analytics.effectiveAmcs} effective AMCs and ${analytics.effectiveCategories} effective categories.`,
    whyItMatters: "Risk is less dependent on one fund house or one category than the raw holding count alone suggests.",
    evidence: "Effective-number and HHI calculations using current portfolio weights.", confidence,
    nextStep: "Preserve the benefit only where fund mandates are genuinely different; an extra fund is not automatically extra diversification.", severity: "positive",
  }));
  else if (analytics.diversificationScore < 55) weaknessDetails.push(insight({
    title: "Diversification is thinner than the fund count suggests",
    observation: `Diversification scores ${analytics.diversificationScore}/100 and the portfolio behaves like ${analytics.effectiveHoldings} equally weighted holdings.`,
    whyItMatters: "A few large positions can dominate outcomes even when many schemes appear in the statement.",
    evidence: "Holding-weight HHI plus top-position and top-three concentration penalties.", confidence,
    nextStep: "Research whether the largest positions and repeated categories are intentional for the investor's horizon and risk capacity.", severity: analytics.diversificationScore < 40 ? "high" : "medium",
  }));

  if (analytics.concentrationScore < 20) strengthDetails.push(insight({
    title: "Concentration is controlled",
    observation: `The blended holding, AMC and category concentration score is ${analytics.concentrationScore}/100; the largest position is ${topHolding}%.`,
    whyItMatters: "No single allocation layer currently dominates the score enough to erase most diversification benefits.",
    evidence: "HHI measured separately across holdings, AMCs and categories.", confidence,
    nextStep: "Monitor weight drift after large NAV moves; concentration can rise without a new purchase.", severity: "positive",
  }));
  else if (analytics.concentrationScore >= 30 || topHolding >= 20) weaknessDetails.push(insight({
    title: "One or more allocations can dominate outcomes",
    observation: `Concentration scores ${analytics.concentrationScore}/100 and the largest fund is ${topHolding}% of current value.`,
    whyItMatters: "A fund-specific or category-specific disappointment would have an outsized effect on the whole portfolio.",
    evidence: `Top-three weights and HHI across holdings, AMCs and categories; threshold triggered at a 20% single-fund weight or 30/100 concentration.`, confidence,
    nextStep: "Test the portfolio with a smaller weight for the dominant position and compare risk, overlap and goal fit before considering any action.", severity: topHolding >= 30 || analytics.concentrationScore >= 45 ? "high" : "medium",
  }));

  if (analytics.qualityScore != null) {
    const qualityCoverage = analytics._internal.qualityDetail.coveragePct;
    if (analytics.qualityScore >= 70) strengthDetails.push(insight({
      title: "Underlying fund evidence is broadly strong",
      observation: `The value-weighted fund-quality score is ${analytics.qualityScore}/100 across ${qualityCoverage}% of portfolio value.`,
      whyItMatters: "The portfolio is not relying only on allocation shape; the scored funds also carry reasonably strong performance, risk and data-quality evidence.",
      evidence: "The same fund-health framework used on individual fund pages, weighted by portfolio value.", confidence: qualityCoverage >= 80 ? confidence : `Limited (${qualityCoverage}% quality coverage)`,
      nextStep: "Review any unscored or below-average holdings separately rather than treating the portfolio average as proof that every scheme is strong.", severity: "positive",
    }));
    else if (analytics.qualityScore < 55) weaknessDetails.push(insight({
      title: "Fund selection quality is not supporting the allocation",
      observation: `The value-weighted fund-quality score is ${analytics.qualityScore}/100 across ${qualityCoverage}% of portfolio value.`,
      whyItMatters: "Good diversification cannot fully compensate for weak or poorly evidenced underlying schemes.",
      evidence: "Per-fund health evidence weighted by current value; missing fund scores are excluded and coverage is disclosed.", confidence: qualityCoverage >= 80 ? confidence : `Limited (${qualityCoverage}% quality coverage)`,
      nextStep: "Research which large holdings pull the weighted quality score down and whether their mandate still serves a distinct portfolio role.", severity: analytics.qualityScore < 40 ? "high" : "medium",
    }));
  }

  if (analytics.stockOverlap.coveragePct >= 70 && overlap.duplicateStocks.length === 0) strengthDetails.push(insight({
    title: "No material stock duplication is visible",
    observation: `No repeated underlying stock exposure cleared the overlap rule across ${analytics.stockOverlap.coveragePct}% of portfolio value with look-through data.`,
    whyItMatters: "Multiple fund labels are less likely to be disguising the same underlying equity bets in the covered portion.",
    evidence: "Factsheet holding-level look-through; uncovered portfolio value is explicitly excluded.", confidence: analytics.stockOverlap.coveragePct >= 90 ? "High for covered holdings" : "Moderate for covered holdings",
    nextStep: "Recheck when factsheet coverage changes; this conclusion does not apply to the uncovered portion.", severity: "positive",
  }));
  else if (analytics.stockOverlap.duplicateExposurePct >= 10) weaknessDetails.push(insight({
    title: "Different funds repeat some of the same stocks",
    observation: `${analytics.stockOverlap.duplicateExposurePct}% duplicate stock exposure is detected, with look-through coverage of ${analytics.stockOverlap.coveragePct}%.`,
    whyItMatters: "The portfolio may be less diversified than its number of schemes suggests and may react similarly to company-specific events.",
    evidence: "Weighted factsheet holdings appearing in more than one fund; uncovered funds are not guessed.", confidence: analytics.stockOverlap.coveragePct >= 70 ? "Moderate" : "Low due to partial look-through coverage",
    nextStep: "Inspect the repeated companies and decide whether the duplication is intentional exposure or accidental fund overlap.", severity: analytics.stockOverlap.duplicateExposurePct >= 20 ? "high" : "medium",
  }));

  if (overlap.duplicateFunds.length > 0) weaknessDetails.push(insight({
    title: "The same scheme appears in multiple folios or sources",
    observation: `${overlap.duplicateFunds.length} scheme${overlap.duplicateFunds.length === 1 ? " is" : "s are"} duplicated across stored sources or folios.`,
    whyItMatters: "Operational duplication can make allocation intent, cost basis and rebalancing harder to understand even when investment exposure is unchanged.",
    evidence: "Exact scheme-code matches before analytics consolidation.", confidence: "High",
    nextStep: "Verify that every folio is genuine, then consider operational consolidation only after checking tax, exit-load and transaction consequences.", severity: "low",
  }));

  for (const [themeName, theme] of Object.entries(exposure.themes)) {
    if (theme.available && theme.exposurePct >= 40) weaknessDetails.push(insight({
      title: `Macro sensitivity to ${themeName} is elevated`,
      observation: `${theme.exposurePct}% of portfolio value matches the ${themeName} exposure rules.`,
      whyItMatters: "Several funds may respond to the same policy or market driver despite having different scheme names.",
      evidence: `Deterministic category, benchmark, sector and holding rules${theme.ruleIds?.length ? ` (${theme.ruleIds.length} cited rules)` : ""}.`, confidence: "Rule-based; coverage varies by source",
      nextStep: `Review the cited ${themeName} contributions and test whether this shared sensitivity is intentional.`, severity: theme.exposurePct >= 60 ? "high" : "medium",
    }));
  }

  if (analytics.projection.resilience.downsideScore >= 65) strengthDetails.push(insight({
    title: "The portfolio has a reasonable downside buffer",
    observation: `Downside resilience scores ${analytics.projection.resilience.downsideScore}/100 with ${analytics.projection.resilience.defensiveWeightPct}% in debt, gold or hybrid buckets.`,
    whyItMatters: "Correlation and defensive allocation reduce modelled volatility relative to simply adding each fund's standalone risk.",
    evidence: `Covariance-aware risk model with ${modelConfidence.riskCoveragePct}% observed volatility coverage.`, confidence,
    nextStep: "Treat this as a relative buffer, not loss protection; use the stress tests to judge whether the remaining drawdown is tolerable.", severity: "positive",
  }));
  else if (analytics.projection.resilience.downsideScore < 50) weaknessDetails.push(insight({
    title: "Downside resilience is weak",
    observation: `Downside resilience scores ${analytics.projection.resilience.downsideScore}/100 and the planning drawdown allowance is ${analytics.projection.planningDrawdownPct}%.`,
    whyItMatters: "The portfolio may experience losses that are difficult to recover from within a short goal horizon.",
    evidence: `Modelled covariance, concentration and defensive-bucket weight; ${modelConfidence.riskCoveragePct}% observed volatility coverage.`, confidence,
    nextStep: "Compare the stress loss and recovery time with the actual goal date and liquidity needs before changing allocation.", severity: analytics.projection.resilience.downsideScore < 35 ? "high" : "medium",
  }));

  const worstStress = analytics.projection.stressTests.reduce((worst, scenario) => scenario.impactPct < worst.impactPct ? scenario : worst, analytics.projection.stressTests[0]);
  if (worstStress?.impactPct <= -25) weaknessDetails.push(insight({
    title: "A severe but plausible stress would be material",
    observation: `The ${worstStress.name.toLowerCase()} scenario produces a ${Math.abs(worstStress.impactPct)}% modelled decline, or about ₹${Math.abs(worstStress.valueImpact).toLocaleString("en-IN")}.`,
    whyItMatters: "The investor may need enough time and liquidity to avoid selling during a deep drawdown.",
    evidence: "Deterministic category shocks with concentration and duplicate-exposure amplification; no probability is assigned.", confidence: "Scenario, not forecast",
    nextStep: "Compare this loss with emergency-fund coverage, goal deadlines and personal loss tolerance; do not interpret it as the maximum possible loss.", severity: worstStress.impactPct <= -40 ? "high" : "medium",
  }));

  return {
    strengths: strengthDetails.map((item) => item.summary),
    weaknesses: weaknessDetails.map((item) => item.summary),
    strengthDetails,
    weaknessDetails,
  };
}

function evaluationStrategy(analytics) {
  const projection = analytics.projection;
  const worstStress = projection.stressTests.reduce((worst, scenario) => scenario.impactPct < worst.impactPct ? scenario : worst, projection.stressTests[0]);
  return {
    version: "3.1",
    objective: "Judge whether the portfolio's holdings, structure and downside behavior form a coherent plan for further research—not whether one headline return looks attractive.",
    principles: ["Evidence before opinion", "Like-for-like fund judgment", "Portfolio interactions before standalone metrics", "Ranges instead of point promises", "Confidence separate from merit"],
    steps: [
      { number: "01", title: "Validate the evidence", question: "Can the inputs support a conclusion?", method: "Check NAV freshness, scheme resolution, return/risk history, factsheet coverage and unresolved holdings.", result: `${projection.confidence.score}/100 model-input confidence (${projection.confidence.label.toLowerCase()}).` },
      { number: "02", title: "Map the portfolio", question: "What does the investor actually own?", method: "Consolidate duplicate scheme rows, then measure fund, AMC, category, sector and underlying-stock allocations.", result: `${analytics.holdingsCount} consolidated funds; ${analytics.effectiveHoldings} effective holdings.` },
      { number: "03", title: "Judge fund quality", question: "Are the building blocks well evidenced?", method: "Weight each scheme's fund-health evidence by current portfolio value; disclose score coverage.", result: analytics.qualityScore == null ? "Fund-quality evidence is unavailable." : `${analytics.qualityScore}/100 weighted quality across ${analytics._internal.qualityDetail.coveragePct}% of value.` },
      { number: "04", title: "Measure diversification", question: "Are different labels creating genuinely different exposures?", method: "Use effective-number and HHI measures across holdings, AMCs and categories, then inspect stock overlap where factsheets permit.", result: `${analytics.diversificationScore}/100 diversification; ${analytics.concentrationScore}/100 concentration.` },
      { number: "05", title: "Model downside interaction", question: "How could holdings behave together?", method: "Combine weights, holding volatility and category correlations; add concentration and defensive-allocation effects.", result: `${projection.modelledAnnualVolatilityPct}% modelled volatility; ${projection.resilience.downsideScore}/100 downside resilience.` },
      { number: "06", title: "Build return ranges", question: "What range is reasonable without pretending certainty?", method: "Shrink capped observed returns toward versioned category priors, then calculate 1Y, 3Y and 5Y probability bands.", result: `${projection.expectedAnnualReturnPct}% annual planning centre; confidence remains ${projection.confidence.label.toLowerCase()}.` },
      { number: "07", title: "Stress and interpret", question: "Which risk deserves attention first?", method: "Apply named shocks, explain strengths and weaknesses, and connect each conclusion to evidence, importance and a review action.", result: `${worstStress.name}: ${worstStress.impactPct}% modelled impact; no probability assigned.` },
    ],
    decisionRule: "A strong portfolio must score reasonably on structure, underlying quality and downside resilience. High returns alone cannot offset weak evidence or an intolerable stress loss.",
  };
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
  const { strengths, weaknesses, strengthDetails, weaknessDetails } = strengthsAndWeaknesses(analytics, overlap, exposure);

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
      evidenceConfidence: analytics.projection.confidence,
      healthScoreBreakdown: analytics.healthScoreBreakdown,
    },
    strengths,
    weaknesses,
    strengthDetails,
    weaknessDetails,
    evaluationStrategy: evaluationStrategy(analytics),
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
    projection: analytics.projection,
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
