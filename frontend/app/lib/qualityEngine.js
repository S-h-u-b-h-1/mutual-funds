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

// Decision Support (Phase 7) — turns the breakdown into a narrative: what's driving the score
// today, what's holding it back, and what to watch next.
//
// Deliberately NOT a "score improved from X to Y" delta: no per-fund historical score is
// persisted anywhere server-side today. The one real candidate found for this — a per-fund
// rank_snapshots.jsonl written by scripts/build_daily.py — turned out to be frozen since
// 2026-07-04 (the production-refresh workflow computes it fresh every run but its commit step
// never stages data/warehouse/, so 11+ days of real accrual were silently discarded each run).
// That's a genuine, fixable pipeline gap, but fixing the workflow file is CI/CD, out of scope for
// this product mission — flagged in the final report instead. So this composes what IS real and
// current: today's breakdown (drivers/detractors) plus the one live "recent change" signal that
// exists independent of any snapshot file — attentionScore/attentionReason's 1-month-vs-3-month
// category rank movement (scripts/explain.py), surfaced as its own labeled item, never blended
// into a fabricated score delta.
// Investment-merit dimensions only — reliability/transparency/dataCompleteness describe how much
// (and how trustworthy) the underlying DATA is, not how good the FUND is; spotlighting "Reliability
// 100/100" as a "driver" of the score is technically true but not what an investor means by "why
// is this a good fund" (they still appear in the full breakdown grid, just not cherry-picked here).
const MERIT_KEYS = new Set(["performance", "risk", "consistency", "diversification", "momentum"]);

export function explainQuality(quality, f) {
  if (!quality) return null;
  const merit = quality.breakdown.filter((b) => MERIT_KEYS.has(b.key));
  const sorted = [...merit].sort((a, b) => b.score - a.score);
  const drivers = sorted.filter((b) => b.score >= 65).slice(0, 3);
  const detractors = sorted.filter((b) => b.score <= 45).slice(-3).reverse();
  const weakest = sorted[sorted.length - 1];

  let monitor = null;
  if (weakest && weakest.score <= 55) {
    monitor = `${QUALITY_LABELS[weakest.key] || weakest.key} is this fund's weakest scored dimension at ${weakest.score}/100 — ${weakest.explanation}`;
  } else if (f.trend != null && f.trend <= 45) {
    monitor = `Momentum is decelerating (trend ${f.trend}/100) — its 1-month pace is running behind its 3-month pace; watch for continued softening.`;
  } else if (f.quality?.status === "stale") {
    monitor = `NAV data is ${f.staleDays} day(s) old — scores here may not reflect the most recent market moves.`;
  }

  const transparency = quality.breakdown.find((b) => b.key === "transparency");
  if (!monitor && transparency != null && transparency.score <= 30) {
    monitor = `Limited factsheet disclosure (Transparency ${transparency.score}/100) — manager, holdings, and sector data aren't yet available for independent verification.`;
  }

  return {
    drivers,
    detractors,
    monitor,
    rankMovement: f.attentionScore != null && f.attentionReason ? f.attentionReason : null,
  };
}
