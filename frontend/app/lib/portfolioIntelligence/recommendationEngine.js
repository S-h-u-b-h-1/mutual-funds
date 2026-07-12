// Recommendation Engine (Investment Operating System mission, Phase 6) — deterministic,
// no AI. Composes buildHealthReport()'s already-computed missingCategories/concentration/
// diversification/allocations rather than recomputing anything. Category-level only, per this
// project's standing compliance rule (see marketImpact.js/exposureEngine.js precedent) — never a
// specific fund name, never "buy". riskTolerance/horizon are OPTIONAL, ephemeral inputs (passed
// in by the caller, never persisted here) — the persistent Investor Profile feature is explicitly
// deferred elsewhere in this project; this engine works fully without it and is honest about the
// confidence cost of doing so, rather than silently assuming a profile.

// Real, stable category traits — not fund-specific, not a live computation, but a documented,
// auditable classification (same spirit as portfolioIntelligence/healthReport.js's own
// CANONICAL_CATEGORIES keyword mapping, which this reuses the exact same bucket names from so a
// recommendation here always corresponds to a real "missing category" the health report found).
export const CATEGORY_PROFILE = {
  "Large Cap": { riskBand: "moderate", minHorizonYears: 3, note: "Broad, well-known market exposure — typically the most familiar starting point for equity allocation." },
  "Mid Cap": { riskBand: "high", minHorizonYears: 5, note: "Higher volatility than Large Cap in exchange for higher long-run growth potential — needs a longer horizon to ride out drawdowns." },
  "Small Cap": { riskBand: "very high", minHorizonYears: 7, note: "The most volatile equity category — historically the highest long-run return potential, but also the deepest drawdowns." },
  Debt: { riskBand: "low", minHorizonYears: 0, note: "Capital preservation and income, not growth — the stabilising component most portfolios missing it lean too heavily on equity alone." },
  Gold: { riskBand: "low", minHorizonYears: 0, note: "Historically low correlation with equity — a hedge, not a growth engine. Typically a small allocation (5-10%), not a core holding." },
  International: { riskBand: "moderate", minHorizonYears: 5, note: "Geographic and currency diversification — reduces concentration risk in the Indian market and rupee specifically." },
  Hybrid: { riskBand: "moderate", minHorizonYears: 3, note: "Blends equity and debt in one fund — a way to add balance without managing the equity/debt split yourself." },
  Index: { riskBand: "moderate", minHorizonYears: 3, note: "Low-cost, rules-based market tracking — removes fund-selection risk within the category it tracks." },
};

const RISK_RANK = { low: 0, moderate: 1, high: 2, "very high": 3 };
const TOLERANCE_MAX_BAND = { conservative: "low", moderate: "moderate", aggressive: "very high" };

// Why NOT a category — the flip side Phase 6 explicitly asks for, using the same real numbers.
function cautionFor(report) {
  const cautions = [];
  if (report.concentration?.score >= 40) {
    cautions.push({
      category: null,
      why: `Concentration score is ${report.concentration.score}/100 — adding more positions right now would deepen concentration, not fix it. Prioritise the categories below over adding to what you already hold.`,
      confidence: "high",
      dataCoverage: "full",
    });
  }
  const top = report.diversification?.topHolding;
  if (top != null && top >= 30) {
    cautions.push({
      category: null,
      why: `Your largest single holding is ${top.toFixed(1)}% of the portfolio — before researching new categories, consider whether this position itself should be trimmed.`,
      confidence: "high",
      dataCoverage: "full",
    });
  }
  return cautions;
}

export function generateRecommendations(report, { riskTolerance = null, horizonYears = null } = {}) {
  if (!report) return null;
  const missing = report.missingCategories || [];
  const maxBand = riskTolerance ? RISK_RANK[TOLERANCE_MAX_BAND[riskTolerance]] : null;

  const recommendations = missing.map((category) => {
    const profile = CATEGORY_PROFILE[category];
    if (!profile) return { category, why: `No exposure detected to ${category}.`, expectedBenefit: null, expectedRisk: null, confidence: "low", dataCoverage: "category traits not classified" };

    const suitableByRisk = maxBand == null ? null : RISK_RANK[profile.riskBand] <= maxBand;
    const suitableByHorizon = horizonYears == null ? null : horizonYears >= profile.minHorizonYears;
    const suitable = suitableByRisk !== false && suitableByHorizon !== false; // unknown (null) never disqualifies, only an explicit mismatch does

    const gaps = [];
    if (riskTolerance == null) gaps.push("risk tolerance");
    if (horizonYears == null) gaps.push("investment horizon");
    const confidence = gaps.length === 0 ? "high" : gaps.length === 1 ? "medium" : "limited";

    return {
      category,
      suitable,
      why: `No exposure to ${category} detected in your current holdings. ${profile.note}`,
      expectedBenefit: `Improves diversification away from your current ${(report.allocations?.category || []).slice(0, 2).map((a) => a.name).join(" / ") || "existing categories"} concentration.`,
      expectedRisk: `${category} carries ${profile.riskBand} risk` + (profile.minHorizonYears > 0 ? ` and is typically best suited to a ${profile.minHorizonYears}+ year horizon.` : "."),
      confidence,
      dataCoverage: gaps.length ? `Missing: ${gaps.join(", ")} — showing category-level guidance only, not tailored to you.` : "Full — risk tolerance and horizon both provided.",
    };
  });

  return {
    recommendations,
    cautions: cautionFor(report),
    methodology: "Category-level only, never a specific fund — reuses buildHealthReport()'s real missingCategories/concentration/diversification. Risk tolerance and horizon are optional and never stored; without them, guidance is generic to the category rather than tailored to you.",
    personalizationCoverage: riskTolerance != null && horizonYears != null ? "full" : riskTolerance != null || horizonYears != null ? "partial" : "none",
  };
}
