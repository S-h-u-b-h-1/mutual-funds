// Advisor Summary (Investment Operating System mission, Phase 10) — a structured report object
// for the future PDF/export engine. Pure composition: every field is a direct read from the
// already-computed engines this mission built (buildHealthReport, generateRecommendations,
// generateRebalanceActions, planGoal, buildTaxProfile) — nothing here recalculates anything.
// The point is a single object an advisor (or the investor, before a real advisor conversation)
// can scan in one pass, not a new set of numbers to reconcile against the page they came from.
export function buildAdvisorSummary({ report, recommendations = null, rebalance = null, goalPlan = null, taxProfile = null }) {
  if (!report) return null;

  const headline = [];
  if (report.portfolioSummary.healthScore != null) headline.push(`Portfolio health ${report.portfolioSummary.healthScore}/100.`);
  if (report.concentration.score >= 40) headline.push(`Concentration risk is elevated (${report.concentration.score}/100) — reducing existing positions matters more than adding new ones right now.`);
  if (report.diversification.score < 50) headline.push(`Diversification is low (${report.diversification.score}/100) across ${report.portfolioSummary.effectiveHoldings} effective holdings.`);
  if (report.missingCategories?.length) headline.push(`${report.missingCategories.length} category bucket(s) have zero exposure: ${report.missingCategories.join(", ")}.`);
  if (!headline.length) headline.push("No high-severity portfolio-level flags detected from the current holdings.");

  const priorityActions = [
    ...(rebalance?.reduce || []).filter((a) => a.severity === "high").map((a) => ({ priority: "high", action: "reduce", detail: a.why })),
    ...(rebalance?.reduce || []).filter((a) => a.severity === "medium").map((a) => ({ priority: "medium", action: "reduce", detail: a.why })),
    ...(rebalance?.consolidate || []).map((a) => ({ priority: "low", action: "consolidate", detail: a.why })),
  ];

  return {
    portfolioOverview: {
      totalValue: report.portfolioSummary.totalValue,
      holdingsCount: report.portfolioSummary.holdingsCount,
      healthScore: report.portfolioSummary.healthScore,
      qualityScore: report.portfolioSummary.qualityScore,
      diversificationScore: report.diversification.score,
      concentrationScore: report.concentration.score,
      expectedVolatility: report.risk.volatility,
      expectedDrawdown: report.risk.expectedDrawdown,
    },
    headline,
    strengths: report.strengths || [],
    weaknesses: report.weaknesses || [],
    priorityActions,
    missingCategories: report.missingCategories || [],
    recommendations: recommendations
      ? { items: recommendations.recommendations, cautions: recommendations.cautions, personalizationCoverage: recommendations.personalizationCoverage }
      : { items: [], cautions: [], personalizationCoverage: "none", note: "Not generated for this summary — run Recommendations on the portfolio page first." },
    rebalancing: rebalance
      ? { reduce: rebalance.reduce, increase: rebalance.increase, consolidate: rebalance.consolidate }
      : { reduce: [], increase: [], consolidate: [], note: "Not generated for this summary." },
    goalAlignment: goalPlan
      ? { goal: goalPlan.goal, gapVsCurrent: goalPlan.gapVsCurrent, rationale: goalPlan.rationale }
      : { note: "No goal selected for this summary — gap-vs-target not available." },
    taxProfile: taxProfile
      ? { rollup: taxProfile.rollup, elss: taxProfile.elss, unclassifiedPct: taxProfile.unclassifiedPct }
      : { note: "Tax profile not generated for this summary." },
    methodology: "Every field is a direct read from this app's already-computed engines (Portfolio Health Report, Recommendation Engine, Rebalancing Engine, Goal Planning, Tax Intelligence) — nothing is recalculated for this summary. Not a substitute for a licensed advisor conversation; this is a structured starting point for one.",
  };
}
