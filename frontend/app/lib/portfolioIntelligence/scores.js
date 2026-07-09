import { getFund } from "../funds";
import { fundHealth } from "../fundHealth";

// Quality score: weighted average of each holding's own fundHealth().overall (the SAME 0-100
// score already shown on every fund page — not a new scoring system). fundHealth needs the full
// fund record (returns/volatility/quality flags), not just the Holding shape, so it re-fetches
// via getFund. Coverage is disclosed, never silently assumed complete (fundHealth itself already
// returns null when a fund has too little data to score).
export function qualityScore(holdings) {
  const scored = holdings.map((h) => {
    const fund = getFund(h.schemeCode);
    const health = fund ? fundHealth(fund) : null;
    return { schemeCode: h.schemeCode, schemeName: h.schemeName, weight: h.weight || 0, health: health?.overall ?? null, grade: health?.grade ?? null };
  });
  const withHealth = scored.filter((s) => s.health != null);
  const coveredWeight = withHealth.reduce((s, x) => s + x.weight, 0);
  const score = coveredWeight > 0 ? Math.round(withHealth.reduce((s, x) => s + x.weight * x.health, 0) / coveredWeight) : null;
  return { score, coveragePct: +coveredWeight.toFixed(1), breakdown: scored };
}

// Same HHI-penalty shape as app/lib/portfolio.js's existing single-fund portfolioRisk() score
// (penalize high top-3 concentration, a large top position, and overall Herfindahl), applied at
// the whole-portfolio level instead of one fund's sector mix. concentrationScore blends holding-
// level, AMC-level, and category-level HHI (0-100, higher = MORE concentrated); diversification
// is the inverse-flavored score in the same units the rest of the app already uses (0-100, higher
// = better), not a raw 1-HHI figure, so it reads consistently against fund-level scores.
export function diversificationConcentrationScores(holdings, amcAllocation, categoryAllocation) {
  const weights = holdings.map((h) => h.weight || 0);
  const hhiHoldings = weights.reduce((s, w) => s + Math.pow(w / 100, 2), 0);
  const hhiAmc = amcAllocation.reduce((s, a) => s + Math.pow(a.weight / 100, 2), 0);
  const hhiCategory = categoryAllocation.reduce((s, a) => s + Math.pow(a.weight / 100, 2), 0);
  const topHolding = Math.max(0, ...weights);
  const top3Holdings = weights.slice().sort((a, b) => b - a).slice(0, 3).reduce((s, w) => s + w, 0);

  const concentrationScore = Math.round(Math.min(100, (hhiHoldings * 0.5 + hhiAmc * 0.25 + hhiCategory * 0.25) * 100));
  const diversificationScore = Math.max(
    0,
    Math.min(100, Math.round(100 - Math.max(0, top3Holdings - 45) * 1.1 - Math.max(0, topHolding - 15) * 1.2 - hhiHoldings * 50))
  );

  return {
    diversificationScore,
    concentrationScore,
    topHolding: +topHolding.toFixed(2),
    top3Holdings: +top3Holdings.toFixed(2),
    hhiHoldings: +hhiHoldings.toFixed(4),
    hhiAmc: +hhiAmc.toFixed(4),
    hhiCategory: +hhiCategory.toFixed(4),
    methodology: "Herfindahl-Hirschman Index across holdings/AMCs/categories, penalizing a large top-3 concentration and any single position over 15% — same penalty shape as the existing single-fund sector concentration score (app/lib/portfolio.js), applied at the whole-portfolio level.",
  };
}

// Volatility/drawdown: weighted average of each holding's own 90-day vol/max-drawdown (already
// computed by the ingestion pipeline for every fund — see scripts/build_performance.py). This is
// an explicit UPPER-BOUND APPROXIMATION: it ignores the diversification benefit from imperfect
// correlation between holdings, so true portfolio volatility is likely somewhat lower. Computing
// the mathematically exact figure would require reconstructing a combined daily value series from
// fact_nav_daily across every holding and is out of scope for this pass — this is disclosed via
// `methodology`, never presented as more precise than it is.
export function riskApproximation(holdings) {
  const withVol = holdings.map((h) => ({ h, fund: getFund(h.schemeCode) })).filter((x) => x.fund?.vol90 != null);
  const volCoveredWeight = withVol.reduce((s, x) => s + (x.h.weight || 0), 0);
  const volatility = volCoveredWeight > 0 ? +(withVol.reduce((s, x) => s + (x.h.weight || 0) * x.fund.vol90, 0) / volCoveredWeight).toFixed(2) : null;

  const withDd = holdings.map((h) => ({ h, fund: getFund(h.schemeCode) })).filter((x) => x.fund?.maxdd90 != null);
  const ddCoveredWeight = withDd.reduce((s, x) => s + (x.h.weight || 0), 0);
  const expectedDrawdown = ddCoveredWeight > 0 ? +(withDd.reduce((s, x) => s + (x.h.weight || 0) * x.fund.maxdd90, 0) / ddCoveredWeight).toFixed(2) : null;

  return {
    volatility,
    expectedDrawdown,
    volCoveragePct: +volCoveredWeight.toFixed(1),
    drawdownCoveragePct: +ddCoveredWeight.toFixed(1),
    methodology: "Weighted average of each holding's own 90-day volatility/max-drawdown, weighted by portfolio weight — an upper-bound approximation that does not account for diversification benefit from imperfect correlation between holdings, so true portfolio risk is likely somewhat lower than this figure.",
  };
}

// Portfolio Health Score: same "weighted parts, drop and renormalize on missing data" shape as
// app/lib/fundHealth.js's per-fund score — quality (are the funds themselves good), diversification,
// concentration (inverted: less concentrated scores higher), and an overlap penalty (redundant
// stock exposure across funds pulls the score down).
export function healthScore({ quality, diversificationScore, concentrationScore, duplicateExposurePct }) {
  const parts = [];
  if (quality != null) parts.push(["quality", 40, quality]);
  if (diversificationScore != null) parts.push(["diversification", 30, diversificationScore]);
  if (concentrationScore != null) parts.push(["concentration", 20, 100 - concentrationScore]);
  if (duplicateExposurePct != null) parts.push(["overlapPenalty", 10, Math.max(0, 100 - duplicateExposurePct * 2)]);
  if (!parts.length) return null;

  const totalW = parts.reduce((s, [, w]) => s + w, 0);
  const overall = Math.round(parts.reduce((s, [, w, v]) => s + (w / totalW) * v, 0));
  return { overall, breakdown: parts.map(([key, w, v]) => ({ key, weight: Math.round((w / totalW) * 100), score: Math.round(v) })) };
}
