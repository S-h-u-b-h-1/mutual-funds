// Real Beta / Alpha / Information Ratio / Treynor (Phase 5 — institutional data-depth sprint).
// Computed only against frontend/app/data/index_history.json's real Yahoo Finance daily closes
// for Nifty 50 / Sensex — and ONLY for funds whose benchmark is EXACTLY "NIFTY 50 TRI" or
// "S&P BSE SENSEX TRI" (not "NIFTY 500 TRI", "NIFTY 50 Arbitrage Index", etc. — those are
// different indices; computing beta against the wrong one would be actively misleading).
//
// IMPORTANT, disclosed everywhere this is shown: the index series used is the PRICE index
// (no dividend reinvestment), not the TRI a fund is actually benchmarked to — no free real TRI
// series exists. This is a genuine, honestly-disclosed approximation, not the fund's official
// factsheet alpha/beta.
import indexData from "../data/index_history.json";

const MIN_OVERLAP_DAYS = 180; // ~9 months of overlapping trading days — shorter windows produce unstable beta estimates
const EXACT_BENCHMARKS = new Set(["NIFTY 50 TRI", "S&P BSE SENSEX TRI"]);

export function indexSeriesFor(benchmark) {
  const key = (benchmark || "").trim().toUpperCase();
  if (!EXACT_BENCHMARKS.has(key)) return null;
  return indexData.indices[key] || null;
}

function dailyReturns(points) {
  const byDate = new Map(points.map((p) => [p.t, p.v]));
  const dates = [...byDate.keys()].sort();
  const rets = new Map();
  for (let i = 1; i < dates.length; i++) {
    const prev = byDate.get(dates[i - 1]);
    const cur = byDate.get(dates[i]);
    if (prev > 0 && cur > 0) rets.set(dates[i], cur / prev - 1);
  }
  return rets;
}

// Real Beta/Alpha/Information Ratio/Treynor from date-aligned daily returns — every input is a
// real price series, nothing here is estimated. Returns null (never a fabricated number) when
// there isn't enough real overlapping history for a statistically meaningful estimate.
export function betaAlphaFor(fundNavPoints, benchmark, { riskFreeAnnualPct = 6.5 } = {}) {
  const idx = indexSeriesFor(benchmark);
  if (!idx || !fundNavPoints?.length) return null;

  const fundRets = dailyReturns(fundNavPoints);
  const idxRets = dailyReturns(idx.points);
  const commonDates = [...fundRets.keys()].filter((d) => idxRets.has(d)).sort();
  if (commonDates.length < MIN_OVERLAP_DAYS) return null;

  const fr = commonDates.map((d) => fundRets.get(d));
  const ir = commonDates.map((d) => idxRets.get(d));
  const n = fr.length;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const frMean = mean(fr), irMean = mean(ir);
  let cov = 0, varIdx = 0;
  for (let i = 0; i < n; i++) {
    cov += (fr[i] - frMean) * (ir[i] - irMean);
    varIdx += (ir[i] - irMean) ** 2;
  }
  cov /= n - 1;
  varIdx /= n - 1;
  if (varIdx === 0) return null;
  const beta = cov / varIdx;

  const TRADING_DAYS = 252;
  const fundAnnualRet = frMean * TRADING_DAYS;
  const idxAnnualRet = irMean * TRADING_DAYS;
  const rf = riskFreeAnnualPct / 100;
  const alpha = fundAnnualRet - (rf + beta * (idxAnnualRet - rf));

  const diffs = commonDates.map((d, i) => fr[i] - ir[i]);
  const diffMean = mean(diffs);
  const trackingError = Math.sqrt(diffs.reduce((s, v) => s + (v - diffMean) ** 2, 0) / (n - 1)) * Math.sqrt(TRADING_DAYS);
  const informationRatio = trackingError > 0 ? (fundAnnualRet - idxAnnualRet) / trackingError : null;
  const treynor = beta !== 0 ? (fundAnnualRet - rf) / beta : null;

  return {
    beta: +beta.toFixed(2),
    alpha: +(alpha * 100).toFixed(2), // as annualised %
    informationRatio: informationRatio != null ? +informationRatio.toFixed(2) : null,
    treynor: treynor != null ? +(treynor * 100).toFixed(2) : null,
    overlapDays: n,
    indexUsed: idx.actual_series,
  };
}
