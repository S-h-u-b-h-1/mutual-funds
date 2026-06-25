// Fund Health Score — 0..100 from real, available metrics only. No fabrication: when a
// component's data is missing it is dropped and the remaining weights are renormalised
// (e.g. expense ratio is not yet ingested → cost is omitted, never guessed). Pure JS so it
// is the single source of truth for both the fund page and the screener, and is unit-tested.

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

// Map a return % to 0..100 (0% → 50, ±25% → ~ saturated).
const retScore = (r) => clamp(50 + r * 2);

export function fundHealth(f) {
  const parts = [];

  // 1 · Performance (30%) — blend of 90d/30d return and category percentile.
  if (f.r1m != null || f.r3m != null) {
    const rPart = f.r3m != null ? 0.6 * retScore(f.r3m) + 0.4 * retScore(f.r1m ?? f.r3m) : retScore(f.r1m);
    const perf = f.catPct != null ? 0.5 * rPart + 0.5 * f.catPct : rPart;
    parts.push(["performance", 30, clamp(perf)]);
  }

  // 2 · Consistency (20%) — share of non-negative daily NAV days (real, from 90d series).
  if (f.consistency != null) parts.push(["consistency", 20, clamp(f.consistency)]);

  // 3 · Risk (20%) — lower volatility and shallower drawdown score higher.
  if (f.vol90 != null && f.maxdd90 != null)
    parts.push(["risk", 20, clamp(100 - f.vol90 * 2 - Math.abs(f.maxdd90) * 1.5)]);

  // 4 · Category rank (15%) — peer percentile (Direct/Regular kept separate upstream).
  if (f.catPct != null) parts.push(["categoryRank", 15, clamp(f.catPct)]);

  // 5 · Data quality (10%) — freshness + history depth + mapping.
  let dq = 100;
  if (f.quality?.status === "stale") dq -= 45;
  if (!f.quality?.has90d) dq -= 30;
  if (!f.quality?.has1y) dq -= 10;
  if (!f.quality?.hasCategory) dq -= 15;
  parts.push(["dataQuality", 10, clamp(dq)]);

  // 6 · Cost (5%) — expense ratio not yet ingested from factsheets → omitted, not faked.
  const costAvailable = f.expenseRatio != null;
  if (costAvailable) parts.push(["cost", 5, clamp(100 - f.expenseRatio * 25)]);

  // 7 · Factsheet (8%) — real metadata completeness + portfolio diversification. Only when
  // real factsheet data exists (manager/benchmark/holdings/sectors); never synthesised.
  if (f.metaComplete != null) {
    const bits = [f.metaComplete * 100];
    if (f.portfolioScore != null) bits.push(f.portfolioScore);
    parts.push(["factsheet", 8, clamp(bits.reduce((a, b) => a + b, 0) / bits.length)]);
  }

  if (!parts.length) return null;

  const totalW = parts.reduce((s, [, w]) => s + w, 0);
  const overall = Math.round(parts.reduce((s, [, w, v]) => s + (w / totalW) * v, 0));
  const breakdown = parts.map(([key, w, v]) => ({ key, weight: Math.round((w / totalW) * 100), score: Math.round(v) }));

  const confidence =
    f.quality?.has1y && f.quality?.has90d && f.quality?.status === "ok" ? "high"
      : f.quality?.has90d ? "medium" : "low";

  return { overall, grade: gradeOf(overall), confidence, costAvailable, breakdown, explanation: explain(f, overall, breakdown) };
}

export function gradeOf(s) {
  return s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : s >= 40 ? "D" : "E";
}

export function gradeTone(g) {
  return g === "A" || g === "B" ? "pos" : g === "C" ? "warn" : "neg";
}

function explain(f, overall, breakdown) {
  const pick = (k) => breakdown.find((b) => b.key === k)?.score;
  const bits = [`Overall health ${overall}/100 (grade ${gradeOf(overall)}).`];
  if (pick("performance") != null) bits.push(`Performance ${pick("performance")}/100${f.catPct != null ? ` (category percentile ${f.catPct})` : ""}.`);
  if (pick("risk") != null) bits.push(`Risk ${pick("risk")}/100 — 90-day volatility ${f.vol90}% , max drawdown ${f.maxdd90}%.`);
  if (pick("consistency") != null) bits.push(`Consistency ${pick("consistency")}/100 from ${f.quality?.obs || "—"} daily observations.`);
  if (!f.expenseRatio) bits.push(`Cost score unavailable (expense ratio not yet ingested).`);
  if (f.isIdcw) bits.push(`IDCW plan — NAV-return comparisons may be distorted by payouts.`);
  return bits.join(" ");
}

export const LABELS = {
  performance: "Performance", consistency: "Consistency", risk: "Risk",
  categoryRank: "Category rank", dataQuality: "Data quality", cost: "Cost", factsheet: "Factsheet",
};
