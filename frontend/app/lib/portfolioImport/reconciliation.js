// Financial reconciliation (Portfolio Accounting Mission, Phase 5). Pure function: validates a
// parsed statement's own internal arithmetic before a portfolio is allowed to be created from it.
//
// Tolerance is intentionally two-tier, not one number, because the two things being reconciled
// have genuinely different expected error sources:
// - Per-holding (units x statement NAV vs statement market value, when both are present): the
//   source document itself rounds each row's value to 2dp before summing, so a few paise of drift
//   per holding is normal roundtrip rounding, not a parsing bug.
// - Portfolio-level totals (sum of holdings vs the statement's own declared grand total): verified
//   against one real CAMS Consolidated Account Summary this session (figures never logged or
//   committed, per the standing privacy rules for that document) — cost reconciled exactly, and
//   the market-value total reconciled to a few paise on a lakhs-scale base, a relative difference
//   far inside this file's own rounding threshold below — exactly rounding-class drift, not a
//   parsing failure. See docs/PORTFOLIO_ACCOUNTING_AND_VALUATION_AUDIT.md for the methodology.
import { sumCurrency } from "./decimalMath.js";

const ROUNDING_ABS_TOLERANCE = 1; // rupees — a handful of paise across many holdings is rounding, not a bug
const ROUNDING_PCT_TOLERANCE = 0.05; // percent of the base value

/**
 * @param {number} computed
 * @param {number|null} declared
 * @returns {{status: 'exact'|'rounding'|'discrepancy'|'unresolved', delta: number|null, deltaPct: number|null}}
 */
function classify(computed, declared) {
  if (declared == null || computed == null) return { status: "unresolved", delta: null, deltaPct: null };
  const delta = +(computed - declared).toFixed(2);
  const deltaPct = declared !== 0 ? +((Math.abs(delta) / Math.abs(declared)) * 100).toFixed(4) : null;
  if (delta === 0) return { status: "exact", delta, deltaPct };
  if (Math.abs(delta) <= ROUNDING_ABS_TOLERANCE || (deltaPct != null && deltaPct <= ROUNDING_PCT_TOLERANCE)) {
    return { status: "rounding", delta, deltaPct };
  }
  return { status: "discrepancy", delta, deltaPct };
}

/**
 * Per-holding reconciliation: does units x statement NAV match the statement's own reported
 * market value for that row? Only meaningful for the ledger CAS sub-format, which reports a
 * per-row market value — the Summary sub-format never does (see casParser.js's own comment on
 * why), so this correctly returns 'not_applicable' there rather than fabricating a comparison the
 * source document doesn't support.
 * @param {{units: number, nav: number|null, marketValueReported: number|null}} row
 */
export function reconcileHolding(row) {
  if (row.marketValueReported == null || row.nav == null) {
    return { status: "not_applicable", computed: null, declared: row.marketValueReported ?? null, delta: null, deltaPct: null };
  }
  const computed = +(row.units * row.nav).toFixed(2);
  return { computed, declared: row.marketValueReported, ...classify(computed, row.marketValueReported) };
}

/**
 * Portfolio-level reconciliation: do the extracted rows' own totals match the statement's own
 * declared grand totals (casParser.js's statementDeclaredTotal)? Two independent checks — cost
 * and market value — since a Summary statement may only declare one of the two.
 * @param {object[]} rows - parsed rows (units, nav, purchaseValue)
 * @param {{marketValueTotal: number|null, costValueTotal: number|null}} declaredTotal
 */
export function reconcilePortfolioTotals(rows, declaredTotal) {
  const computedCost = sumCurrency(rows.map((r) => r.purchaseValue));
  const computedMarketAtStatementNav = sumCurrency(rows.filter((r) => r.nav != null).map((r) => r.units * r.nav));

  const cost = declaredTotal?.costValueTotal != null
    ? { computed: computedCost, declared: declaredTotal.costValueTotal, ...classify(computedCost, declaredTotal.costValueTotal) }
    : { status: "not_applicable", computed: computedCost, declared: null, delta: null, deltaPct: null };

  const marketValue = declaredTotal?.marketValueTotal != null
    ? { computed: computedMarketAtStatementNav, declared: declaredTotal.marketValueTotal, ...classify(computedMarketAtStatementNav, declaredTotal.marketValueTotal) }
    : { status: "not_applicable", computed: computedMarketAtStatementNav, declared: null, delta: null, deltaPct: null };

  return { cost, marketValue };
}

// Overall status a portfolio_import row should carry, derived from the totals check — the one
// the mission says must gate automatic approval ("Do not approve final import automatically when
// reconciliation fails beyond the accepted tolerance"). A per-holding 'not_applicable' (Summary
// format's expected case) never blocks approval on its own; only a 'discrepancy' at the portfolio
// level does.
export function overallReconciliationStatus(totalsResult) {
  const statuses = [totalsResult.cost.status, totalsResult.marketValue.status];
  if (statuses.includes("discrepancy")) return "discrepancy";
  if (statuses.every((s) => s === "not_applicable")) return "not_applicable";
  if (statuses.includes("rounding")) return "rounding";
  if (statuses.includes("unresolved") && !statuses.includes("exact")) return "unresolved";
  return "matched";
}
