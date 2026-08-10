const clamp = (value, low = 0, high = 100) => Math.max(low, Math.min(high, value));

const pct = (value, digits = 1) => value == null ? "unavailable" : `${value >= 0 ? "+" : ""}${Number(value).toFixed(digits)}%`;

function monthsSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, (Date.now() - date.getTime()) / (30.4375 * 86400000));
}

function historyStage(fund, meta) {
  const months = monthsSince(meta?.launch_date);
  if ((months != null && months < 3) || (fund.r3m == null && fund.r1y == null)) return { key: "observation", label: "Observation only", cap: 25 };
  if ((months != null && months < 12) || fund.r1y == null) return { key: "emerging", label: "Emerging evidence", cap: 45 };
  if ((months != null && months < 36) || (fund.r3y == null && fund.r5y == null)) return { key: "developing", label: "Developing track record", cap: 70 };
  return { key: "established", label: "Established track record", cap: 100 };
}

function frameworkFor(fund) {
  const text = `${fund.name || ""} ${fund.category || ""}`.toLowerCase();
  if (/index|etf|exchange traded|passive/.test(text)) return {
    key: "passive", label: "Passive / index framework",
    priorities: ["Tracking difference and tracking error", "Expense ratio", "Replication quality and liquidity", "Matched-index return"],
    unavailable: "A complete passive-fund judgment needs the official TRI series, tracking error, TER and portfolio replication evidence.",
  };
  if (fund.assetClass === "Debt") return {
    key: "debt", label: "Debt-fund framework",
    priorities: ["Yield to maturity", "Duration and interest-rate sensitivity", "Credit quality", "Liquidity, drawdown and cost"],
    unavailable: "NAV return alone is not enough for debt funds; duration, yield, credit quality and portfolio liquidity are required for a full ranking.",
  };
  if (fund.assetClass === "Hybrid") return {
    key: "hybrid", label: "Hybrid-fund framework",
    priorities: ["Equity/debt allocation stability", "Downside control", "Risk-adjusted return", "Cost and portfolio diversification"],
    unavailable: "A full hybrid judgment needs historical asset-allocation and portfolio evidence in addition to NAV behaviour.",
  };
  if (fund.assetClass === "Solution" || /retirement|children|solution/.test(text)) return {
    key: "solution", label: "Goal-based framework",
    priorities: ["Goal and lock-in fit", "Horizon-matched return", "Drawdown near the goal date", "Cost and glide-path consistency"],
    unavailable: "A goal-based scheme cannot be judged from recent return alone; lock-in, horizon and portfolio path matter.",
  };
  return {
    key: "equity", label: "Active-equity framework",
    priorities: ["Rolling and long-horizon peer return", "Benchmark excess return", "Drawdown and downside consistency", "Cost, concentration and manager process"],
    unavailable: "Current evidence is strongest on NAV return and recent risk; broader TER, holdings and manager-history coverage is still incomplete.",
  };
}

function confidenceFor(fund, meta, stage) {
  const performance = (fund.r3m != null ? 10 : 0) + (fund.r1y != null ? 10 : 0) + (fund.r3y != null || fund.r5y != null ? 10 : 0);
  const risk = fund.vol90 != null && fund.maxdd90 != null ? 20 : fund.vol90 != null ? 10 : 0;
  const peer = fund.catPct != null && fund.catSize >= 5 ? 15 : 0;
  const benchmark = fund.benchmark ? 10 : 0;
  const cost = meta?.expense_ratio != null || meta?.direct_expense_ratio != null || meta?.regular_expense_ratio != null ? 10 : 0;
  const portfolio = meta?.holdings?.length || meta?.sector_allocation?.length ? 10 : 0;
  const freshness = fund.quality?.status === "ok" ? 5 : 0;
  const raw = performance + risk + peer + benchmark + cost + portfolio + freshness;
  const score = Math.round(Math.min(raw, stage.cap));
  return {
    score,
    label: score >= 75 ? "High evidence" : score >= 50 ? "Medium evidence" : "Limited evidence",
    raw,
    cap: stage.cap,
    reason: stage.cap < raw
      ? `${stage.label} caps confidence at ${stage.cap}/100 even though ${raw}/100 of tracked fields are present.`
      : `${score}/100 evidence coverage across history, risk, peers, benchmark, cost, portfolio and freshness.`,
  };
}

function rankExplanation(fund, stage) {
  if (stage.key === "observation" || stage.key === "emerging") {
    return "Normal category rank is not decision-grade for this history stage. Use launch-date-matched benchmark and vintage peers instead.";
  }
  if (fund.catRank != null) {
    return `Recent rank #${fund.catRank} of ${fund.catSize} is based only on 1-month NAV return among ${fund.plan} ${fund.category} Equity Growth peers. It is a momentum rank, not a long-term quality rank.`;
  }
  return "No comparable recent category rank is available for this scheme. The platform does not force unlike funds into one leaderboard.";
}

export function buildFundEvidenceAnalysis(fund, meta = null, cohort = null) {
  const stage = historyStage(fund, meta);
  const framework = frameworkFor(fund);
  const confidence = confidenceFor(fund, meta, stage);
  const facts = [];

  if (fund.r1y != null) facts.push({
    title: "Observed one-year performance",
    value: pct(fund.r1y),
    logic: cohort?.winAvg?.r1y != null
      ? `${pct(fund.r1y)} versus the matched ${fund.plan} ${fund.category} peer average of ${pct(cohort.winAvg.r1y)}.`
      : "Point-to-point AMFI NAV return; matched peer evidence is unavailable.",
    confidence: "Observed",
  });
  else if (fund.r3m != null) facts.push({
    title: "Short history performance",
    value: pct(fund.r3m),
    logic: "Three-month point-to-point NAV return. Too short to support a long-term performance claim.",
    confidence: "Provisional",
  });

  if (fund.vol90 != null && fund.maxdd90 != null) facts.push({
    title: "Recent downside behaviour",
    value: `${fund.vol90}% volatility · ${fund.maxdd90}% drawdown`,
    logic: "Annualised volatility and worst peak-to-trough decline from the same recent NAV window. This describes the observed period, not every market cycle.",
    confidence: fund.quality?.obs >= 60 ? "Observed" : "Provisional",
  });

  if (fund.catPct != null) facts.push({
    title: "Recent peer position",
    value: `${fund.catPct}th percentile`,
    logic: rankExplanation(fund, stage),
    confidence: stage.key === "established" || stage.key === "developing" ? "Observed, narrow scope" : "Provisional",
  });

  const strengths = [];
  const weaknesses = [];
  if (fund.r1y != null && cohort?.winAvg?.r1y != null) {
    const gap = fund.r1y - cohort.winAvg.r1y;
    if (gap >= 1) strengths.push(`One-year return is ${gap.toFixed(1)} percentage points above its matched peer average.`);
    if (gap <= -1) weaknesses.push(`One-year return is ${Math.abs(gap).toFixed(1)} percentage points below its matched peer average.`);
  }
  if (fund.catPct >= 75) strengths.push(`Recent 1-month peer position is top quartile (${fund.catPct}th percentile).`);
  if (fund.catPct != null && fund.catPct <= 25) weaknesses.push(`Recent 1-month peer position is bottom quartile (${fund.catPct}th percentile).`);
  if (fund.vol90 != null && fund.vol90 >= 30) weaknesses.push(`Recent annualised volatility is very high at ${fund.vol90}%.`);
  if (fund.maxdd90 != null && fund.maxdd90 <= -10) weaknesses.push(`Recent maximum drawdown reached ${fund.maxdd90}%.`);
  if (fund.consistency != null && fund.consistency >= 55) strengths.push(`${fund.consistency}% of observed daily NAV moves were non-negative; this is steadiness evidence, not a return guarantee.`);
  if (stage.key !== "established") weaknesses.push(`${stage.label}: the available history cannot establish behaviour across a full market cycle.`);

  const limitations = [framework.unavailable];
  if (meta?.expense_ratio == null && meta?.direct_expense_ratio == null && meta?.regular_expense_ratio == null) limitations.push("Expense ratio is unavailable, so cost efficiency is not judged.");
  if (!meta?.holdings?.length && !meta?.sector_allocation?.length) limitations.push("Holdings and sector evidence are unavailable, so concentration and style consistency are not judged.");
  if (fund.benchmark && !/NIFTY 50 TRI|S&P BSE SENSEX TRI/i.test(fund.benchmark)) limitations.push("The named benchmark is known, but a matching daily benchmark series is not available for excess-return statistics.");

  return {
    stage,
    framework,
    confidence,
    facts,
    strengths,
    weaknesses,
    limitations: [...new Set(limitations)],
    rankExplanation: rankExplanation(fund, stage),
    conclusion: confidence.score < 50
      ? "Use this record to understand the scheme and identify questions, not to make a high-confidence performance judgment."
      : "The evidence supports a structured comparison, but suitability, cost and portfolio overlap still determine whether the fund fits an investor.",
  };
}

export function buildComparisonEvidence(funds) {
  const available = (key) => funds.filter((fund) => fund[key] != null).length;
  const categories = new Set(funds.map((fund) => fund.category).filter(Boolean));
  const plans = new Set(funds.map((fund) => fund.plan).filter(Boolean));
  const established = funds.filter((fund) => fund.r1y != null).length;
  const comparable = categories.size === 1 && plans.size === 1;
  const evidence = {
    returns: available("r1y"),
    risk: funds.filter((fund) => fund.vol90 != null && fund.maxdd90 != null).length,
    consistency: available("consistency"),
    health: available("_h"),
  };
  const measured = Object.values(evidence).reduce((sum, value) => sum + value, 0);
  const possible = funds.length * Object.keys(evidence).length;
  const score = possible ? Math.round((100 * measured) / possible) : 0;
  return {
    comparable,
    score,
    label: score >= 75 && established === funds.length ? "High evidence coverage" : score >= 50 ? "Medium evidence coverage" : "Limited evidence coverage",
    evidence,
    fairness: comparable
      ? `All selected funds share ${[...categories][0]} and ${[...plans][0]} plan context, so direct metric comparisons are structurally reasonable.`
      : "Selected funds cross categories or plan types. Metric leaders remain factual, but an overall winner is not a fair like-for-like conclusion.",
    method: "Return leaders use observed NAV returns; lower volatility wins risk; the less-negative drawdown wins downside control; consistency measures non-negative daily moves; Health Score is shown as a research indicator, not a forecast.",
  };
}

export function buildAmcEvidence(intel) {
  if (!intel) return null;
  const sample = intel.eligible1yCount || 0;
  const score = clamp(Math.round(0.6 * intel.completeness + 0.4 * Math.min(100, sample * 12.5)));
  const eligible = sample >= 3 && intel.completeness >= 50;
  return {
    score,
    label: score >= 75 ? "High evidence coverage" : score >= 50 ? "Medium evidence coverage" : "Limited evidence coverage",
    eligible,
    summary: eligible
      ? `AMC conclusions use ${sample} canonical funds with one-year evidence across ${intel.categories.length} categories.`
      : `Only ${sample} canonical funds have one-year evidence and score-input completeness is ${intel.completeness}%; an AMC-wide rank should be treated as provisional or withheld.`,
    logic: "AMC analysis first canonicalises Direct/Regular variants, then considers category-relative one-year beat rate, top-quartile recent positions, observed risk and evidence completeness. It does not infer governance, service quality or corporate creditworthiness.",
  };
}
