// Investment Thesis (Phase 2) + Strengths/Weaknesses (Phase 3) + Investor Fit (Phase 4) of the
// Fund Research Engine mission. Composes existing, already-tested signal functions (fundAnalysis,
// riskMetrics) into higher-level, sentence-level research artifacts — no scoring math duplicated,
// no LLM, no fabrication. Every sentence traces to a real computed field; a claim with no
// supporting data is omitted, never guessed.
//
// Historical-delta note (applies to "Recent Improvements/Deterioration" and "Why Rank Changed"
// below): there is no per-fund historical score persisted anywhere server-side today — only
// market/category/AMC-level daily snapshots exist (scripts/build_snapshots.py), and the one
// place that looks like fund-level history (WatchlistIntelligence.jsx) is explicitly, honestly
// browser-local-only ("the server has no per-user history"). So these two sections are built
// from the one real recent-change signal that DOES exist: f.attentionScore/attentionReason,
// scripts/explain.py's 1-month-vs-3-month category rank movement, persisted only onto funds with
// a notable move. A fund without one correctly gets "no significant recent movement", not a
// fabricated flat trend.

import { fundSignals, riskInterpretation } from "./fundAnalysis";

const pct = (v, d = 1) => `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;

// Real peer-cohort risk averages (vol90/maxdd90) — cohorts.json (funds.js's cohortOf) only
// carries return aggregates (winAvg), not risk aggregates, so this computes them on demand from
// the already-loaded fund list every caller of this module already holds. Pure, cheap (one pass
// over a single category's funds), used by every claim below that needs "risk vs category"
// framing rather than just "returns vs category" (which cohort.winAvg already covers).
export function cohortRiskStats(allFundsList, cohortKey) {
  if (!cohortKey || !allFundsList?.length) return null;
  const peers = allFundsList.filter((x) => x.cohortKey === cohortKey && x.vol90 != null);
  if (peers.length < 5) return null; // too small a peer set for a meaningful average
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const dds = peers.filter((x) => x.maxdd90 != null).map((x) => x.maxdd90);
  return {
    avgVol90: +mean(peers.map((x) => x.vol90)).toFixed(1),
    avgMaxdd90: dds.length ? +mean(dds).toFixed(1) : null,
    n: peers.length,
  };
}

// Investment Thesis — a short, fully-traceable paragraph. Every sentence cites a real metric; a
// clause is dropped (never guessed) when its supporting data is missing.
export function investmentThesis(f, cohort, { rollingWinRate = null, cohortRisk = null } = {}) {
  const sentences = [];

  // Performance framing — prefer a real rolling-vs-index win rate when available (only funds
  // benchmarked exactly to NIFTY 50 TRI / S&P BSE SENSEX TRI with enough history via
  // riskMetrics.js's rollingBenchmarkWinRate), else fall back to today's return vs peer-cohort
  // average — real, but a snapshot rather than a rolling series; the wording never blurs the two.
  if (rollingWinRate != null && rollingWinRate.periods >= 6) {
    const { winPct, periods, months } = rollingWinRate;
    const years = months % 12 === 0 ? `${months / 12}-year` : `${months}-month`;
    // The comparison index is a PRICE series (no dividend reinvestment), not the TRI a fund is
    // actually benchmarked to (riskMetrics.js — no free real TRI series exists). A price index
    // mechanically understates the true benchmark's return, so a high win-rate here is expected
    // and inflated versus a true TRI comparison, not necessarily genuine outperformance — most
    // relevant for an index/passive fund, whose whole mandate is to track (not beat) its index.
    const proxyCaveat = " (measured against a price-only index proxy, not the fund's official TRI benchmark — see Risk tab for detail).";
    if (winPct >= 60) sentences.push(`This fund has beaten its benchmark index in ${winPct}% of rolling ${years} periods (${periods} periods measured) over its available history${proxyCaveat}`);
    else if (winPct <= 40) sentences.push(`This fund has trailed its benchmark index in ${100 - winPct}% of rolling ${years} periods (${periods} periods measured) over its available history${proxyCaveat}`);
    else sentences.push(`This fund's rolling ${years} performance against its benchmark index has been mixed — it led in ${winPct}% of the ${periods} periods measured${proxyCaveat}`);
  } else if (f.r1y != null && cohort?.winAvg?.r1y != null) {
    const ahead = f.r1y - cohort.winAvg.r1y;
    if (Math.abs(ahead) >= 1) sentences.push(`Over the past year it has ${ahead > 0 ? "outpaced" : "trailed"} its ${f.category} peer average by ${Math.abs(ahead).toFixed(1)} points (${pct(f.r1y)} vs ${pct(cohort.winAvg.r1y)}).`);
  }

  // Category standing
  if (f.catPct != null) {
    if (f.catPct >= 75) sentences.push(`It currently ranks in the top ${100 - f.catPct + 1}% of ${f.plan} ${f.category} peers (#${f.catRank} of ${f.catSize}).`);
    else if (f.catPct <= 25) sentences.push(`It currently ranks in the bottom ${f.catPct}% of ${f.plan} ${f.category} peers (#${f.catRank} of ${f.catSize}).`);
  }

  // Risk framing — relative to category when a real peer average exists, absolute otherwise.
  if (f.vol90 != null) {
    if (cohortRisk?.avgVol90 != null) {
      const rel = f.vol90 - cohortRisk.avgVol90;
      const cmp = Math.abs(rel) < 1.5 ? "in line with" : rel < 0 ? "below" : "above";
      // maxdd90 is <= 0 (more negative = deeper/worse) — "shallower" means f.maxdd90 is the
      // LARGER (less negative) of the two, i.e. >=, not <=.
      sentences.push(`Its volatility has run ${cmp} the ${f.category} category average (${f.vol90}% vs ${cohortRisk.avgVol90}% over 90 days)${f.maxdd90 != null && cohortRisk.avgMaxdd90 != null ? `, with drawdowns ${f.maxdd90 >= cohortRisk.avgMaxdd90 ? "shallower than" : "deeper than"} the category average (${f.maxdd90}% vs ${cohortRisk.avgMaxdd90}%)` : ""}.`);
    } else {
      const abs = riskInterpretation(f);
      if (abs && !abs.startsWith("Insufficient")) sentences.push(abs.split(". ")[0] + ".");
    }
  }

  // Momentum / trend
  if (f.trend != null) {
    if (f.trend >= 65) sentences.push(`Short-term momentum is accelerating — its 1-month pace is running ahead of its 3-month pace.`);
    else if (f.trend <= 35) sentences.push(`Short-term momentum is decelerating — its 1-month pace is running behind its 3-month pace.`);
  }

  // Suitability close — plain, non-recommendation framing keyed off volatility bucket.
  if (f.vol90 != null) {
    const bucket = f.vol90 < 12 ? "investors prioritising stability" : f.vol90 < 20 ? "investors comfortable with moderate volatility" : f.vol90 < 30 ? "investors comfortable with high volatility" : "investors with a high risk tolerance and a long time horizon";
    sentences.push(`Based on its risk profile, it appears more suited to ${bucket}.`);
  }

  if (!sentences.length) return null;
  return sentences.join(" ");
}

function parseRankMovement(reason) {
  if (!reason) return null;
  const nums = [...reason.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  if (nums.length !== 2) return null;
  const [rank3m, rank1m] = nums;
  return { rank3m, rank1m, improving: rank1m < rank3m, declining: rank1m > rank3m };
}

// Strengths & Weaknesses — restructures fundSignals() (positive/caution/warnings) into the
// mission's named taxonomy (Top Strengths, Top Risks, Watch Carefully), and adds two sections
// fundSignals() doesn't cover: Recent Improvements/Deterioration and Why Rank Changed, both
// honestly scoped to attentionScore/attentionReason (see module header).
export function strengthsAndWeaknesses(f, cohort, { cohortRisk = null } = {}) {
  const { positive, caution, warnings } = fundSignals(f, cohort);
  const strengths = [...positive];
  const risks = [...caution];

  // Relative gap, not a fixed +/-2 percentage points: a 2pp gap is meaningful for equity-scale
  // volatility (10-20%) but was silently unreachable for low-volatility categories like Arbitrage
  // or Liquid, where peer averages sit under 3% — found via a real Arbitrage fund that was 20.8%
  // less volatile than its peer average (a fund manager's real, meaningful edge) yet produced zero
  // strength/risk lines because the absolute gap was only 0.3pp. 15% relative, mirrors the
  // scale-relative style already used elsewhere in this file (catPct, momentum comparisons).
  if (cohortRisk?.avgVol90 != null && f.vol90 != null && cohortRisk.avgVol90 > 0) {
    const relGap = (f.vol90 - cohortRisk.avgVol90) / cohortRisk.avgVol90;
    if (relGap <= -0.15) strengths.push(`Lower volatility than its ${f.category} peer average (${f.vol90}% vs ${cohortRisk.avgVol90}%).`);
    else if (relGap >= 0.15) risks.push(`Higher volatility than its ${f.category} peer average (${f.vol90}% vs ${cohortRisk.avgVol90}%).`);
  }

  // fundSignals() flags a top-decile category rank as a strength but has no symmetric rule for
  // a bottom-quartile one — added here since Top Risks would otherwise stay silent on a fund's
  // single most visible weakness (e.g. "ranks #230 of 247, 7th percentile" showed no risk line).
  if (f.catPct != null && f.catPct <= 25) risks.push(`Bottom ${f.catPct === 0 ? "1" : f.catPct}% of ${f.plan} ${f.category} peers — rank #${f.catRank} of ${f.catSize}.`);

  // Recent Improvement/Deterioration are short signals (not the full sentence — that lives in
  // Why Rank Changed, below); showing the identical attentionReason text in two adjacent boxes
  // reads as a duplication bug to a reader, even though both facts are individually real.
  let recentImprovement = null, recentDeterioration = null, whyRankChanged = null;
  const mv = f.attentionScore != null && f.attentionReason ? parseRankMovement(f.attentionReason) : null;
  if (mv?.improving) recentImprovement = `Category rank improved from #${mv.rank3m} to #${mv.rank1m} over the last month — see "Why Rank Changed" for the full picture.`;
  else if (mv?.declining) recentDeterioration = `Category rank slipped from #${mv.rank3m} to #${mv.rank1m} over the last month — see "Why Rank Changed" for the full picture.`;
  if (f.attentionScore != null && f.attentionReason) whyRankChanged = f.attentionReason;

  return {
    strengths: strengths.slice(0, 6),
    risks: risks.slice(0, 6),
    watch: warnings,
    recentImprovement,
    recentDeterioration,
    whyRankChanged: whyRankChanged || "No significant recent category-rank movement detected — this fund hasn't crossed a decile or moved 15+ ranks against its 3-month position.",
  };
}

// Investor Fit — suitability across 11 common investor profiles, each with a real, traceable
// WHY. This is classification (what kind of fund this is, and what it structurally suits), never
// a recommendation to buy — compliance-safe by construction: every rule keys off structural facts
// (category, asset class, volatility bucket, payout type), never past-performance-implies-future.
const isCategory = (f, re) => re.test(f.category || "");

export function investorFit(f) {
  const cat = f.category || "this category";
  const vol = f.vol90;
  const equity = f.assetClass === "Equity";
  const debt = f.assetClass === "Debt";
  const hybrid = f.assetClass === "Hybrid";
  const elss = isCategory(f, /ELSS|tax sav/i);
  const liquidLike = isCategory(f, /liquid|overnight|money market/i);
  const largeOrIndex = isCategory(f, /large cap|index|nifty 50|sensex/i);
  const smallMid = isCategory(f, /small cap|mid cap/i);
  const sectoral = isCategory(f, /sectoral|thematic/i);
  const established = !!f.quality?.has1y;
  // assetClass carries values beyond Equity/Debt/Hybrid ("Other", "Solution" — e.g. index funds,
  // ETFs, retirement/children's funds are commonly tagged "Other" upstream). Rules below must
  // never assert "Debt category" or "Equity fund" from an assetClass that isn't actually that
  // value — equityLike instead uses the category name itself (unambiguous for index/large-cap/
  // sectoral/small-mid-cap) so an index fund tagged "Other" is still correctly read as equity-style.
  const equityLike = equity || largeOrIndex || sectoral || smallMid;
  const assetDesc = equity ? "Equity" : debt ? "Debt" : hybrid ? "Hybrid" : equityLike ? "equity-tracking" : (f.assetClass || "this");

  const fits = [];

  fits.push(elss
    ? { profile: "Tax Saving", suitable: true, why: "ELSS category — qualifies for a Section 123 tax deduction (Income-tax Act, 2025; the section formerly numbered 80C), with a mandatory 3-year lock-in." }
    : { profile: "Tax Saving", suitable: false, why: "Not an ELSS fund — no Section 123 (formerly 80C) tax benefit under this scheme." });

  fits.push(liquidLike
    ? { profile: "Emergency Corpus", suitable: true, why: `${cat} funds are built for short holding periods and capital preservation, a common choice for emergency funds.` }
    : { profile: "Emergency Corpus", suitable: false, why: equityLike ? "NAV can swing significantly short-term — not ideal for money that may be needed on short notice." : "Not a short-duration category — redemption value can vary more than a liquid/overnight fund." });

  if (f.isIdcw) fits.push({ profile: "Income Generation", suitable: true, why: "IDCW (payout) plan — distributes gains periodically rather than compounding them, suited to investors wanting periodic income." });
  else if (debt) fits.push({ profile: "Income Generation", suitable: true, why: `${cat} is a debt category typically used for regular-income objectives (this Growth plan compounds rather than pays out — the IDCW option of the same fund suits periodic income instead).` });
  else fits.push({ profile: "Income Generation", suitable: false, why: "Growth-plan fund — gains compound rather than pay out; not structured for periodic income." });

  if (largeOrIndex) fits.push({ profile: "Beginner", suitable: true, why: `${cat} tracks or mirrors well-known, broad market exposure — typically easier to follow than a concentrated or sectoral bet.` });
  else if (sectoral || smallMid) fits.push({ profile: "Beginner", suitable: false, why: `${cat} is a concentrated category with higher volatility — usually better suited to investors with prior market experience.` });
  else fits.push({ profile: "Beginner", suitable: vol != null ? vol < 15 : false, why: vol != null ? `90-day volatility of ${vol}% is ${vol < 15 ? "relatively moderate" : "on the higher side"} for a first-time investor.` : "Insufficient volatility history to assess." });

  fits.push({ profile: "Conservative", suitable: debt || (vol != null && vol < 10), why: debt ? `${f.assetClass} category — generally lower NAV volatility than equity.` : vol != null ? `90-day volatility ${vol}% is ${vol < 10 ? "low" : "not low"} enough to be considered conservative.` : "Insufficient volatility history to assess." });

  fits.push({ profile: "Moderate", suitable: hybrid || (vol != null && vol >= 10 && vol < 20), why: hybrid ? "Hybrid category — blends equity and debt, a common moderate-risk structure." : vol != null ? `90-day volatility ${vol}% ${vol >= 10 && vol < 20 ? "falls in a moderate range" : "is outside a typical moderate range"}.` : "Insufficient volatility history to assess." });

  fits.push({ profile: "Aggressive", suitable: sectoral || smallMid || (vol != null && vol >= 20), why: (sectoral || smallMid) ? `${cat} is a concentrated, higher-volatility category.` : vol != null ? `90-day volatility ${vol}% is ${vol >= 20 ? "elevated" : "not particularly high"}.` : "Insufficient volatility history to assess." });

  fits.push({ profile: "Long-term SIP", suitable: equityLike || hybrid, why: equityLike || hybrid ? `${assetDesc} exposure historically benefits from rupee-cost averaging over long SIP horizons — volatility along the way is smoothed by staggered entry.` : `${assetDesc} category — SIP timing matters less here since returns are less path-dependent than equity.` });

  fits.push({ profile: "Lump Sum", suitable: debt || (vol != null && vol < 15), why: debt ? "Lower NAV volatility reduces entry-timing risk for a one-time investment." : vol != null && vol < 15 ? `Moderate volatility (${vol}%) keeps entry-timing risk relatively contained.` : "Higher volatility means a lump-sum entry carries more timing risk — a staggered (SIP/STP) entry is more commonly used here." });

  fits.push({ profile: "Retirement", suitable: !established ? false : (equityLike || hybrid) && (vol == null || vol < 22), why: !established ? "Track record is too short to assess suitability for a long-horizon goal like retirement." : (equityLike || hybrid) ? `${assetDesc} exposure with an established track record and ${vol != null && vol < 22 ? "contained" : "meaningful"} volatility.` : `${assetDesc} category — typically a stabilising component of a retirement portfolio rather than its core growth engine.` });

  fits.push({ profile: "Wealth Creation", suitable: equityLike, why: equityLike ? `${assetDesc} exposure — historically associated with long-term capital growth.` : `${assetDesc} category — typically capital-preserving rather than growth-oriented.` });

  return fits;
}
