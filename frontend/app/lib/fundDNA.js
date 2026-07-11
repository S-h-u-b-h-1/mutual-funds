// Fund DNA (Phase 5 of the Fund Research Engine mission) — 10 named dimensions, each a
// score + plain-language label + one-line explanation, all traced to real, already-computed
// fields (fund record, cohortRiskStats from investorAnalyst.js, betaAlphaFor from riskMetrics.js).
// No LLM, no fabrication: a dimension whose supporting data doesn't exist for a given fund
// returns { available: false } rather than a guessed score — never silently omitted, so a caller
// can render "not available for this fund" instead of a gap that looks like a zero.

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const isCategory = (f, re) => re.test(f.category || "");

function dim(key, label, score, explanation, extra = {}) {
  return { key, label, available: score != null, score: score != null ? Math.round(clamp(score)) : null, explanation, ...extra };
}

function unavailable(key, label, reason) {
  return { key, label, available: false, score: null, explanation: reason };
}

export function fundDNA(f, { cohortRisk = null, betaAlpha = null } = {}) {
  const dims = [];

  // 1 · Risk Style — where the fund sits on a conservative<->aggressive spectrum, from real
  // 90-day annualised volatility.
  if (f.vol90 != null) {
    const score = clamp(f.vol90 * 2.5);
    const label = score < 20 ? "Conservative" : score < 45 ? "Balanced" : score < 70 ? "Growth-oriented" : "Aggressive";
    dims.push(dim("riskStyle", "Risk Style", score, `${label} — 90-day annualised volatility of ${f.vol90}%.`, { styleLabel: label }));
  } else dims.push(unavailable("riskStyle", "Risk Style", "Insufficient NAV history to compute volatility."));

  // 2 · Return Style — trailing-return intensity (same 0%→50 midpoint mapping fundHealth.js
  // uses for its performance component, so the two stay consistent when read side by side).
  if (f.r1y != null) {
    const score = clamp(50 + f.r1y * 2);
    const label = f.r1y >= 15 ? "High-growth" : f.r1y >= 5 ? "Steady growth" : f.r1y >= 0 ? "Modest" : "Negative";
    dims.push(dim("returnStyle", "Return Style", score, `${label} — 1-year NAV return of ${f.r1y >= 0 ? "+" : ""}${f.r1y.toFixed(1)}%.`, { styleLabel: label }));
  } else dims.push(unavailable("returnStyle", "Return Style", "1-year return not yet available for this fund."));

  // 3 · Consistency — direct reuse of f.consistency (share of non-negative NAV days, real).
  if (f.consistency != null) {
    dims.push(dim("consistency", "Consistency", f.consistency, `${f.consistency}% of observed daily NAV moves were non-negative, from ${f.quality?.obs || "—"} trading days.`));
  } else dims.push(unavailable("consistency", "Consistency", "Insufficient daily NAV observations."));

  // 4 · Recovery Speed — how far the fund has clawed back from its worst 90-day drawdown,
  // vs how far below its recent high it still sits. Real ratio, not a fabricated "days to
  // recover" (that would need intraday drawdown-trough dating this bundle doesn't carry).
  if (f.maxdd90 != null && f.ddFromHigh != null && f.maxdd90 < 0) {
    const recovered = clamp((1 - f.ddFromHigh / f.maxdd90) * 100);
    const label = recovered >= 80 ? "Fully recovered" : recovered >= 40 ? "Partially recovered" : "Near its worst point";
    dims.push(dim("recoverySpeed", "Recovery Speed", recovered, `${label} — currently ${f.ddFromHigh}% off its recent high, vs a worst 90-day drawdown of ${f.maxdd90}%.`, { styleLabel: label }));
  } else dims.push(unavailable("recoverySpeed", "Recovery Speed", "No drawdown recorded in the observed window, or insufficient history."));

  // 5 · Volatility — the raw number as its own dimension (distinct from Risk Style's investor-
  // facing bucket): inverted so a higher score reads as "more stable", consistent with every
  // other dimension's "higher = more of the named good thing" convention.
  if (f.vol90 != null) {
    const score = clamp(100 - f.vol90 * 2.2);
    dims.push(dim("volatility", "Volatility", score, `90-day annualised volatility ${f.vol90}%${cohortRisk?.avgVol90 != null ? ` vs a ${f.category} category average of ${cohortRisk.avgVol90}%` : ""}.`));
  } else dims.push(unavailable("volatility", "Volatility", "Insufficient NAV history to compute volatility."));

  // 6 · Category Leadership — direct reuse of f.catPct (category percentile, real).
  if (f.catPct != null) {
    dims.push(dim("categoryLeadership", "Category Leadership", f.catPct, `Ranks #${f.catRank} of ${f.catSize} ${f.plan} ${f.category} peers (${f.catPct}th percentile) on 1-month return.`));
  } else dims.push(unavailable("categoryLeadership", "Category Leadership", "Category cohort too small, or peer ranking unavailable."));

  // 7 · Downside Protection — drawdown severity relative to the category average when a real
  // peer average exists (cohortRiskStats, investorAnalyst.js); absolute severity otherwise.
  if (f.maxdd90 != null) {
    if (cohortRisk?.avgMaxdd90 != null) {
      const score = clamp(50 + (cohortRisk.avgMaxdd90 - f.maxdd90) * 3);
      const label = score >= 65 ? "Better than category" : score >= 35 ? "In line with category" : "Weaker than category";
      dims.push(dim("downsideProtection", "Downside Protection", score, `${label} — max drawdown ${f.maxdd90}% vs category average ${cohortRisk.avgMaxdd90}%.`, { styleLabel: label }));
    } else {
      const score = clamp(100 + f.maxdd90 * 4); // maxdd90 is <= 0; -25% or worse saturates to 0
      dims.push(dim("downsideProtection", "Downside Protection", score, `Max 90-day drawdown of ${f.maxdd90}% (no category peer average available for comparison).`));
    }
  } else dims.push(unavailable("downsideProtection", "Downside Protection", "No drawdown data available."));

  // 8 · Momentum — direct reuse of f.trend (1-month pace vs 3-month pace, real), corroborated
  // by attentionScore's category-rank-movement signal when present.
  if (f.trend != null) {
    const label = f.trend >= 65 ? "Accelerating" : f.trend >= 35 ? "Steady" : "Decelerating";
    let expl = `Trend score ${f.trend}/100 — 1-month pace is ${f.trend >= 55 ? "ahead of" : f.trend <= 45 ? "behind" : "in line with"} its 3-month pace.`;
    if (f.attentionScore != null && f.attentionReason) expl += ` ${f.attentionReason}`;
    dims.push(dim("momentum", "Momentum", f.trend, expl, { styleLabel: label }));
  } else dims.push(unavailable("momentum", "Momentum", "Insufficient 1-month/3-month return history."));

  // 9 · Drawdown Behaviour — absolute severity + frequency pattern (distinct from Downside
  // Protection, which is relative-to-category): a fund with frequent small dips reads
  // differently to an investor than one with a single sharp fall, even at the same maxdd90.
  if (f.maxdd90 != null && f.negDays != null && f.quality?.obs) {
    const negFrac = f.negDays / f.quality.obs;
    const score = clamp(100 + f.maxdd90 * 3 - negFrac * 40);
    const pattern = negFrac >= 0.45 ? "frequent small dips" : "occasional dips";
    const severity = f.maxdd90 <= -12 ? "with one sharp fall" : "without a severe single fall";
    dims.push(dim("drawdownBehaviour", "Drawdown Behaviour", score, `Shows ${pattern} (${f.negDays} of ${f.quality.obs} days negative) ${severity} — worst 90-day drawdown ${f.maxdd90}%.`));
  } else dims.push(unavailable("drawdownBehaviour", "Drawdown Behaviour", "Insufficient daily observation data."));

  // 10 · Benchmark Dependence — real beta when available (exact NIFTY 50 TRI / SENSEX TRI
  // benchmark match with enough overlapping history, riskMetrics.js's betaAlphaFor); otherwise
  // left unavailable rather than inferred from category name, to avoid implying a measured
  // precision that doesn't exist for that fund.
  if (betaAlpha?.beta != null) {
    const score = clamp(100 - Math.abs(betaAlpha.beta - 1) * 100);
    const label = Math.abs(betaAlpha.beta - 1) < 0.15 ? "Closely tracks benchmark" : betaAlpha.beta > 1 ? "More volatile than benchmark" : "Less volatile than benchmark";
    dims.push(dim("benchmarkDependence", "Benchmark Dependence", score, `${label} — beta ${betaAlpha.beta} vs ${betaAlpha.indexUsed} over ${betaAlpha.overlapDays} overlapping trading days.`, { styleLabel: label }));
  } else dims.push(unavailable("benchmarkDependence", "Benchmark Dependence", isCategory(f, /index|nifty 50|sensex/i)
    ? "This is an index-category fund (high dependence by structure), but no real beta could be computed against a matching index series."
    : "Beta requires an exact NIFTY 50 TRI / S&P BSE SENSEX TRI benchmark match with enough overlapping NAV/index history — not available for this fund's benchmark."));

  const availableCount = dims.filter((d) => d.available).length;
  return { dimensions: dims, availableCount, totalCount: dims.length };
}
