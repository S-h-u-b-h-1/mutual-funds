// Daily NAV revaluation math (Persistent Portfolio Mission, Phase 5). Pure function: given
// holdings + a fund lookup, compute each holding's current market value and the portfolio
// aggregate. Deliberately has NO knowledge of how it's called — the same function must produce
// an identical result whether invoked from an authenticated API request or from the
// production-refresh pipeline after AMFI NAV ingestion, so there is only one implementation of
// "what is this portfolio worth today" to keep correct.
//
// Never mutates units — revaluation changes price, not position size (see the mission's own
// Phase 6: units change only through a new import, a verified transaction, or an explicit
// correction). A holding whose scheme_code no longer resolves against the live fund universe is
// reported as stale/missing, not silently dropped or valued at its last-known price.
import { computeXirr } from "./xirr.js";

/**
 * @param {{id: string, schemeCode: string, unitBalance: number}} holding
 * @param {(schemeCode: string) => ({nav: number, navDate: string}|null)} getFund
 * @returns {{holdingId: string, navDate: string|null, nav: number|null, unitBalance: number, marketValue: number|null, stale: boolean}}
 */
export function revalueHolding(holding, getFund) {
  const fund = getFund(holding.schemeCode);
  if (!fund || fund.nav == null) {
    return { holdingId: holding.id, navDate: null, nav: null, unitBalance: holding.unitBalance, marketValue: null, stale: true };
  }
  return {
    holdingId: holding.id,
    navDate: fund.navDate || null,
    nav: fund.nav,
    unitBalance: holding.unitBalance,
    marketValue: +(holding.unitBalance * fund.nav).toFixed(2),
    stale: (fund.staleDays || 0) > 3, // a fund whose NAV hasn't refreshed in >3 trading days is still valued, just flagged
  };
}

/**
 * @param {{id: string, schemeCode: string, unitBalance: number, investedValue: number|null}[]} holdings
 * @param {(schemeCode: string) => ({nav: number, navDate: string, staleDays: number}|null)} getFund
 * @param {{schemeCode: string, transactionType: string, transactionDate: string, amount: number}[]} transactions
 * @returns {{
 *   holdingValuations: object[],
 *   totalMarketValue: number,
 *   totalInvestedValue: number|null,
 *   absoluteGain: number|null,
 *   absoluteReturnPct: number|null,
 *   latestNavCoveragePct: number,
 *   staleHoldingCount: number,
 *   xirr: number|null,
 * }}
 */
export function revaluePortfolio(holdings, getFund, transactions = []) {
  const holdingValuations = holdings.map((h) => revalueHolding(h, getFund));

  const totalMarketValue = +holdingValuations.reduce((s, v) => s + (v.marketValue || 0), 0).toFixed(2);
  const coveredCount = holdingValuations.filter((v) => v.marketValue != null).length;
  const staleHoldingCount = holdingValuations.filter((v) => v.stale).length;

  const hasFullInvestedData = holdings.every((h) => h.investedValue != null);
  const totalInvestedValue = hasFullInvestedData ? +holdings.reduce((s, h) => s + h.investedValue, 0).toFixed(2) : null;
  const absoluteGain = totalInvestedValue != null ? +(totalMarketValue - totalInvestedValue).toFixed(2) : null;
  const absoluteReturnPct = absoluteGain != null && totalInvestedValue > 0 ? +((absoluteGain / totalInvestedValue) * 100).toFixed(2) : null;

  const OUTFLOW = new Set(["purchase", "switch_in"]);
  const INFLOW = new Set(["redemption", "switch_out", "dividend_payout"]);
  const flows = transactions
    .filter((t) => OUTFLOW.has(t.transactionType) || INFLOW.has(t.transactionType))
    .map((t) => ({ date: t.transactionDate, amount: OUTFLOW.has(t.transactionType) ? -Math.abs(t.amount) : Math.abs(t.amount) }));
  if (totalMarketValue > 0) flows.push({ date: new Date().toISOString().slice(0, 10), amount: totalMarketValue });

  return {
    holdingValuations,
    totalMarketValue,
    totalInvestedValue,
    absoluteGain,
    absoluteReturnPct,
    latestNavCoveragePct: holdings.length > 0 ? +((coveredCount / holdings.length) * 100).toFixed(1) : 0,
    staleHoldingCount,
    xirr: computeXirr(flows),
  };
}
