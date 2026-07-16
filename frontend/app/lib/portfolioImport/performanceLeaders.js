// Best/poorest performer selection (Portfolio Accounting Mission, Phase 9). Pure function over
// already-revalued holdings (see revaluation.js) — never recomputes value itself, only ranks it.
//
// Every ranking excludes holdings the mission explicitly disqualifies: missing cost value (can't
// compute a return %), unresolved scheme match, stale/missing NAV beyond policy, or a failed
// reconciliation. Exclusions are counted and reported, never silently dropped, so a leaderboard
// with 3 of 8 holdings never reads as "these are the only 3 holdings."
import { safePercent } from "./decimalMath.js";

const STALE_DAYS_POLICY = 7; // beyond this, a holding's NAV is too old to trust for a performance ranking specifically (looser than revaluation's own 3-day "flag as stale" threshold, which still values the holding; this threshold excludes it from leaderboards)

/**
 * @param {object} holding - { schemeCode, schemeName, folioNumber, investedValue, marketValue, staleDays, matchConfidence, reconciliationStatus }
 * @returns {string|null} exclusion reason, or null if eligible
 */
function exclusionReason(holding) {
  if (holding.investedValue == null) return "missing cost value";
  if (holding.matchConfidence && !["confirmed", "high_confidence"].includes(holding.matchConfidence)) return "unresolved scheme match";
  if (holding.marketValue == null) return "missing NAV";
  if ((holding.staleDays || 0) > STALE_DAYS_POLICY) return "stale NAV beyond policy";
  if (holding.reconciliationStatus === "discrepancy") return "failed reconciliation";
  return null;
}

function withReturn(holding) {
  const gain = holding.marketValue - holding.investedValue;
  return { ...holding, gain: +gain.toFixed(2), returnPct: safePercent(gain, holding.investedValue) };
}

/**
 * @param {object[]} holdings
 * @param {object[]} [dailyChanges] - optional { schemeCode, dailyChangeValue } for the daily-contributor rankings; omitted rankings are returned null, never fabricated
 * @returns {{
 *   bestByReturnPct: object|null, poorestByReturnPct: object|null,
 *   largestContributor: object|null, largestDetractor: object|null,
 *   bestDailyContributor: object|null, worstDailyContributor: object|null,
 *   excludedCount: number, exclusions: {schemeCode: string, reason: string}[],
 * }}
 */
export function computePerformanceLeaders(holdings, dailyChanges = null) {
  const exclusions = [];
  const eligible = [];
  for (const h of holdings) {
    const reason = exclusionReason(h);
    if (reason) exclusions.push({ schemeCode: h.schemeCode, folioNumber: h.folioNumber ?? null, reason });
    else eligible.push(withReturn(h));
  }

  const byReturn = [...eligible].sort((a, b) => b.returnPct - a.returnPct);
  const byGain = [...eligible].sort((a, b) => b.gain - a.gain);

  let bestDailyContributor = null;
  let worstDailyContributor = null;
  if (dailyChanges) {
    const dailyMap = new Map(dailyChanges.map((d) => [d.schemeCode, d.dailyChangeValue]));
    const withDaily = eligible
      .map((h) => ({ ...h, dailyChangeValue: dailyMap.has(h.schemeCode) ? dailyMap.get(h.schemeCode) : null }))
      .filter((h) => h.dailyChangeValue != null);
    if (withDaily.length > 0) {
      const byDaily = [...withDaily].sort((a, b) => b.dailyChangeValue - a.dailyChangeValue);
      bestDailyContributor = byDaily[0];
      worstDailyContributor = byDaily[byDaily.length - 1];
    }
  }

  return {
    bestByReturnPct: byReturn[0] || null,
    poorestByReturnPct: byReturn[byReturn.length - 1] || null,
    largestContributor: byGain[0] || null,
    largestDetractor: byGain[byGain.length - 1] || null,
    bestDailyContributor,
    worstDailyContributor,
    excludedCount: exclusions.length,
    exclusions,
  };
}
