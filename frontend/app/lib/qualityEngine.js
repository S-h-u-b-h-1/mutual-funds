// Quality Engine (Phase 6 of the Fund Research Engine mission) — evolves fundHealth.js's 7-part
// breakdown into the mission's 9 named dimensions: Performance, Risk, Consistency,
// Diversification, Momentum, Reliability, Transparency, Data Completeness, Confidence. This
// wraps fundHealth() + fundCompleteness() + portfolioRisk() and relabels/recomposes their
// already-real numbers — it does not recompute any of their math, so a change here can never
// drift from what the fund page's existing Health Score already shows. Confidence is reported
// alongside the composite, not blended into it (same pattern fundHealth.js uses): it describes
// how much to trust the other 8 scores, not an input to their weighted average. No fabrication:
// a dimension is dropped and the rest reweighted (drop-and-renormalise) when its data is missing.
import { fundHealth, gradeOf } from "./fundHealth";
import { fundCompleteness } from "./completeness";
import { portfolioRisk } from "./portfolio";
import { insightConfidence } from "./decisionEngine";

export function qualityEngine(f, meta) {
  const health = fundHealth(f);
  if (!health) return null;
  const pick = (k) => health.breakdown.find((b) => b.key === k)?.score ?? null;
  const pRisk = portfolioRisk(meta);
  const completeness = fundCompleteness(f, meta);

  const parts = [];

  const performance = pick("performance");
  if (performance != null) parts.push(["performance", 25, performance, `Blend of trailing return and category rank: ${performance}/100.`]);

  const risk = pick("risk");
  if (risk != null) parts.push(["risk", 15, risk, `90-day volatility ${f.vol90}%, max drawdown ${f.maxdd90}%: ${risk}/100.`]);

  const consistency = pick("consistency");
  if (consistency != null) parts.push(["consistency", 15, consistency, `${f.consistency}% of daily NAV moves were non-negative, from ${f.quality?.obs || "—"} trading days: ${consistency}/100.`]);

  if (pRisk != null) parts.push(["diversification", 10, pRisk.score, `${pRisk.level} — top holding ${pRisk.topHolding?.toFixed(1)}%, top 10 holdings ${pRisk.top10}% (real factsheet holdings).`]);

  if (f.trend != null) parts.push(["momentum", 10, f.trend, `1-month pace vs 3-month pace: ${f.trend}/100 (${f.trend >= 55 ? "accelerating" : f.trend <= 45 ? "decelerating" : "steady"}).`]);

  const dataQuality = pick("dataQuality");
  if (dataQuality != null) parts.push(["reliability", 10, dataQuality, `NAV freshness + history depth + category mapping: ${dataQuality}/100${f.quality?.status === "stale" ? ` (stale — ${f.staleDays}d old)` : ""}.`]);

  if (completeness) {
    const transparencyDims = [completeness.dims.metadata, completeness.dims.manager, completeness.dims.portfolio, completeness.dims.documents].filter((v) => v != null);
    if (transparencyDims.length) {
      const transparency = Math.round(transparencyDims.reduce((a, b) => a + b, 0) / transparencyDims.length);
      parts.push(["transparency", 5, transparency, `How much this fund discloses about itself — manager, holdings, sector allocation, factsheet: ${transparency}/100.`]);
    }
    parts.push(["dataCompleteness", 5, completeness.score, `Research data completeness across identity, performance, risk, benchmark, metadata, lineage: ${completeness.score}/100.`]);
  }

  if (!parts.length) return null;
  const totalW = parts.reduce((s, [, w]) => s + w, 0);
  const overall = Math.round(parts.reduce((s, [, w, v]) => s + (w / totalW) * v, 0));
  const grade = gradeOf(overall);
  const breakdown = parts.map(([key, w, v, explanation]) => ({ key, weight: Math.round((w / totalW) * 100), score: Math.round(v), explanation }));

  const confidence = insightConfidence({
    availableCount: parts.length,
    totalPossible: 8,
    obs: f.quality?.obs,
    hasCategory: f.quality?.hasCategory,
  });

  return {
    overall, grade, confidence, breakdown, coverage: parts.length, totalPossible: 8,
    summary: `Overall quality ${overall}/100 (grade ${grade}), from ${parts.length} of 8 possible dimensions.`,
  };
}

export const QUALITY_LABELS = {
  performance: "Performance", risk: "Risk", consistency: "Consistency", diversification: "Diversification",
  momentum: "Momentum", reliability: "Reliability", transparency: "Transparency", dataCompleteness: "Data Completeness",
};
