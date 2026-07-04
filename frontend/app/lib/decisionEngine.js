// Research Priority Score — Decision Engine (Decision Support sprint). Deterministic,
// self-explaining, answers "what should I investigate next", never "what should I buy".
//
// This EXTENDS the existing rank-movement engine (scripts/explain.py's attention_score(),
// persisted onto every fund as f.attentionScore/attentionTier/attentionReason by
// scripts/build_daily.py) rather than recomputing it — that engine already correctly measures
// novelty + magnitude + persistence + category deviation from real 1M-vs-3M rank movement. This
// file adds the OTHER real signals the Decision Support mission also asks for that the Python
// engine doesn't cover: AMC standing, linked news impact, and a stale-data penalty — then
// produces one coherent, coverage-aware score plus a confidence label.
//
// No fabrication: a component is used only when its underlying data is real (same
// drop-and-renormalise pattern as fundHealth.js). Coverage across the ~14,200-fund universe is
// real and uneven — only funds with an existing attentionScore, AMC data, or linked news
// contribute at all; a fund with none of these correctly returns null, never a forced score.

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
// Distance from neutral (50), rescaled to 0..100 — a value pinned at either extreme (0 or 100)
// is exactly as "notable" as the other; only distance from the midpoint matters, not direction.
const extremity = (pct) => (pct == null ? null : clamp(Math.abs(pct - 50) * 2));

/**
 * @param {object} f - a fund record from allFunds() (needs attentionScore, quality; catPct/trend
 *   optional extras folded in as light-weight bonuses when present)
 * @param {object} ctx - resolved, caller-supplied context (kept out of this pure function so it
 *   never does its own I/O):
 *   - newsImpact: 0..100 impact score for the most relevant recent article touching this fund's
 *     category/AMC/sector (marketImpact.js's impactScoreFor), or null if none recent.
 *   - amcPercentile: 0..100 peer rank of this fund's AMC within its asset class (amcIntel.js),
 *     or null if not computed for this call.
 */
export function researchPriority(f, ctx = {}) {
  const { newsImpact = null, amcPercentile = null } = ctx;
  const parts = [];

  // 1 · Category rank movement (45%) — the existing, authoritative attention_score() from
  // scripts/explain.py: novelty (decile crossing) + magnitude (rank jump) + persistence +
  // category deviation, real 1M-vs-3M rank movement within the fund's own category. Not
  // recomputed here — this is the single source of truth for that signal.
  if (f.attentionScore != null) parts.push(["categoryMovement", 45, clamp(f.attentionScore)]);

  // 2 · AMC standing extremity (20%) — real peer rank among AMCs in the same asset class
  // (amcIntel.js's percentile). Both a top-ranked and a bottom-ranked AMC are equally notable.
  if (amcPercentile != null) parts.push(["amcStanding", 20, extremity(amcPercentile)]);

  // 3 · Linked news impact (25%) — real, rule-based impact score for news genuinely linked to
  // this fund's category/AMC/sector via news_market_links (marketImpact.js), not keyword-matched.
  if (newsImpact != null) parts.push(["newsImpact", 25, clamp(newsImpact)]);

  // 4 · Own-return-pace extremity (10%) — real, from AMFI's 1M-vs-3M pace (build_performance.py's
  // trend field), a fund-level signal independent of category peers. A light-weight addition,
  // not a replacement for #1 (which is peer-relative; this is the fund's own pace only).
  if (f.trend != null) parts.push(["ownPace", 10, extremity(f.trend)]);

  if (!parts.length) return null;

  // Staleness suppresses priority outright — a "notable" signal computed from stale NAV data is
  // not trustworthy enough to call urgent; halve it rather than hide it (still visible, honestly discounted).
  const stale = f.quality?.status === "stale";
  const totalW = parts.reduce((s, [, w]) => s + w, 0);
  const raw = parts.reduce((s, [, w, v]) => s + (w / totalW) * v, 0);
  const score = Math.round(clamp(raw * (stale ? 0.5 : 1)));

  const breakdown = parts.map(([key, w, v]) => ({ key, weight: Math.round((w / totalW) * 100), score: Math.round(v) }));
  const confidence = insightConfidence({
    availableCount: parts.length,
    totalPossible: 4,
    obs: f.quality?.obs,
    hasCategory: f.quality?.hasCategory,
  });

  return {
    score,
    tier: tierOf(score, confidence),
    confidence,
    breakdown,
    coverage: parts.length,
    stale,
    explanation: explainPriority(f, score, breakdown, stale),
  };
}

function tierOf(score, confidence) {
  if (confidence === "limited") return "Limited Data";
  if (score >= 65) return "High Research Priority";
  if (score >= 35) return "Medium Research Priority";
  return "Low Research Priority";
}

export const TIER_TONE = {
  "High Research Priority": "neg", // reuses the app's existing warm-alert tone, not a "bad" judgment
  "Medium Research Priority": "warn",
  "Low Research Priority": "pos",
  "Limited Data": null,
};

// Shared across the Decision Engine and any generated insight (Phase 7) — confidence is a
// function of how much real data backed the claim, never of how confident the copy sounds.
export function insightConfidence({ availableCount, totalPossible, obs, hasCategory }) {
  if (!obs) return "limited";
  if (availableCount >= Math.ceil(totalPossible * 0.6) && hasCategory) return "high";
  if (availableCount >= 2) return "medium";
  return "limited";
}

export const CONFIDENCE_LABEL = { high: "High Confidence", medium: "Medium Confidence", limited: "Limited Data" };
export const CONFIDENCE_TONE = { high: "pos", medium: "warn", limited: null };

function explainPriority(f, score, breakdown, stale) {
  const bits = [`Research priority ${score}/100.`];
  const pick = (k) => breakdown.find((b) => b.key === k);
  const cm = pick("categoryMovement");
  if (cm) bits.push(`Category rank movement ${cm.score}/100 — ${(f.attentionReason || "see category rank history").replace(/\.$/, "")}.`);
  const a = pick("amcStanding");
  if (a) bits.push(`AMC standing ${a.score}/100.`);
  const n = pick("newsImpact");
  if (n) bits.push(`Recent linked news impact ${n.score}/100.`);
  const p = pick("ownPace");
  if (p) bits.push(`Own return pace ${p.score}/100 (trend=${f.trend}, ${f.trend > 50 ? "accelerating" : f.trend < 50 ? "decelerating" : "flat"} vs its own trailing pace).`);
  if (stale) bits.push(`NAV data is stale — priority halved until fresh data confirms this signal.`);
  return bits.join(" ");
}
