#!/usr/bin/env node
// Unit tests for the Portfolio Accounting and Daily Valuation Mission's pure-function modules:
// decimal-safe summation (Phase 7), financial reconciliation (Phase 5), and best/poorest
// performer selection (Phase 9) -- plus the casParser.js extraction additions from Phase 2
// (plan/option/demat derivation, statement date, statement declared totals).
//
// Reconciliation's tolerance values were chosen from real evidence, not guessed: verified this
// session against one real CAMS Consolidated Account Summary (never committed, never retained,
// figures never logged per the standing privacy rules for that document) -- cost reconciled
// exactly, and the market-value total reconciled to a few paise on a lakhs-scale base, both
// consistent with per-row rounding, not a parsing error. See
// docs/PORTFOLIO_ACCOUNTING_AND_VALUATION_AUDIT.md for the methodology.
//
// Plain Node, no server/database required.
// Usage: node scripts/test_portfolio_accounting.mjs
import { sumCurrency, safePercent, toPaise, fromPaise } from "../app/lib/portfolioImport/decimalMath.js";
import { reconcileHolding, reconcilePortfolioTotals, overallReconciliationStatus } from "../app/lib/portfolioImport/reconciliation.js";
import { computePerformanceLeaders } from "../app/lib/portfolioImport/performanceLeaders.js";
import { parseCasText } from "../app/lib/portfolioImport/casParser.js";

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(label);
    console.error(`  FAIL: ${label}`);
  }
}

// ================================================================================================
// decimalMath.js
// ================================================================================================
console.log("\n=== decimalMath.js ===");
assert(toPaise(100.1) === 10010, `toPaise converts rupees to integer paise (got ${toPaise(100.1)})`);
assert(fromPaise(10010) === 100.1, `fromPaise converts back (got ${fromPaise(10010)})`);

// The classic float trap: 0.1 + 0.2 !== 0.3 in plain JS addition. sumCurrency must not exhibit it.
const floatTrap = 0.1 + 0.2;
assert(floatTrap !== 0.3, "sanity: plain float addition does exhibit the classic rounding trap (0.1+0.2 !== 0.3)");
assert(sumCurrency([0.1, 0.2]) === 0.3, `sumCurrency avoids the float trap (got ${sumCurrency([0.1, 0.2])})`);

const manyValues = Array.from({ length: 47 }, () => 33.33);
const naiveSum = manyValues.reduce((s, v) => s + v, 0);
assert(sumCurrency(manyValues) === +naiveSum.toFixed(2), "sumCurrency matches naive sum within display rounding for a realistic holding count");
assert(sumCurrency([100, null, undefined, NaN, 50]) === 150, "sumCurrency skips null/undefined/NaN rather than coercing them to 0-that-corrupts-the-sum");

assert(safePercent(50, 200) === 25, `safePercent computes a plain percentage (got ${safePercent(50, 200)})`);
assert(safePercent(50, 0) === null, "safePercent returns null (never Infinity/NaN) for a zero denominator");
assert(safePercent(50, null) === null, "safePercent returns null for a missing denominator");

// ================================================================================================
// reconciliation.js
// ================================================================================================
console.log("\n=== reconciliation.js ===");
const exactHolding = reconcileHolding({ units: 100, nav: 45.6789, marketValueReported: 4567.89 });
assert(exactHolding.status === "exact", `units x NAV matching statement market value exactly is classified 'exact' (got ${exactHolding.status})`);

const roundingHolding = reconcileHolding({ units: 100, nav: 45.6789, marketValueReported: 4567.90 });
assert(roundingHolding.status === "rounding", `a few paise off is classified 'rounding' (got ${roundingHolding.status}, delta ${roundingHolding.delta})`);

const discrepancyHolding = reconcileHolding({ units: 100, nav: 45.6789, marketValueReported: 5000.00 });
assert(discrepancyHolding.status === "discrepancy", `a large mismatch is classified 'discrepancy' (got ${discrepancyHolding.status})`);

const naHolding = reconcileHolding({ units: 100, nav: 45.6789, marketValueReported: null });
assert(naHolding.status === "not_applicable", "a Summary-format row with no statement market value is 'not_applicable', never forced into a comparison");

const rows = [
  { units: 1000, nav: 45.67, purchaseValue: 45000 },
  { units: 500, nav: 234.56, purchaseValue: 115000 },
];
const exactTotals = reconcilePortfolioTotals(rows, { costValueTotal: 160000, marketValueTotal: sumCurrency(rows.map((r) => r.units * r.nav)) });
assert(exactTotals.cost.status === "exact", `portfolio-level cost total reconciles exactly against a matching declared total (got ${exactTotals.cost.status})`);
assert(exactTotals.marketValue.status === "exact", `portfolio-level market-value total reconciles exactly (got ${exactTotals.marketValue.status})`);

const noDeclaredTotals = reconcilePortfolioTotals(rows, { costValueTotal: null, marketValueTotal: null });
assert(noDeclaredTotals.cost.status === "not_applicable" && noDeclaredTotals.marketValue.status === "not_applicable", "when a statement declares no grand total at all, both checks report not_applicable rather than fabricating a comparison");

assert(overallReconciliationStatus(exactTotals) === "matched", `overall status is 'matched' when both totals reconcile (got ${overallReconciliationStatus(exactTotals)})`);
assert(overallReconciliationStatus(noDeclaredTotals) === "not_applicable", "overall status is not_applicable when the statement declares no totals to check against");
const withDiscrepancy = { cost: { status: "exact" }, marketValue: { status: "discrepancy" } };
assert(overallReconciliationStatus(withDiscrepancy) === "discrepancy", "overall status is discrepancy if either check fails, even if the other is exact -- this is what should block auto-approval");

// ================================================================================================
// performanceLeaders.js -- synthetic holdings, fake scheme codes, not real fund data
// ================================================================================================
console.log("\n=== performanceLeaders.js ===");
const holdings = [
  { schemeCode: "F1", schemeName: "Fund One", investedValue: 100000, marketValue: 130000, staleDays: 0, matchConfidence: "confirmed" }, // +30%
  { schemeCode: "F2", schemeName: "Fund Two", investedValue: 100000, marketValue: 90000, staleDays: 0, matchConfidence: "confirmed" },  // -10%
  { schemeCode: "F3", schemeName: "Fund Three", investedValue: 50000, marketValue: 200000, staleDays: 0, matchConfidence: "confirmed" }, // +300%, largest rupee contributor
  { schemeCode: "F4", schemeName: "No Cost Data", investedValue: null, marketValue: 50000, staleDays: 0, matchConfidence: "confirmed" },
  { schemeCode: "F5", schemeName: "Unresolved", investedValue: 20000, marketValue: 21000, staleDays: 0, matchConfidence: "low" },
  { schemeCode: "F6", schemeName: "Stale", investedValue: 20000, marketValue: 21000, staleDays: 30, matchConfidence: "confirmed" },
  { schemeCode: "F7", schemeName: "Failed Recon", investedValue: 20000, marketValue: 21000, staleDays: 0, matchConfidence: "confirmed", reconciliationStatus: "discrepancy" },
];
const leaders = computePerformanceLeaders(holdings);
assert(leaders.bestByReturnPct.schemeCode === "F3", `best performer by return% is F3 (got ${leaders.bestByReturnPct?.schemeCode})`);
assert(leaders.poorestByReturnPct.schemeCode === "F2", `poorest performer by return% is F2 (got ${leaders.poorestByReturnPct?.schemeCode})`);
assert(leaders.largestContributor.schemeCode === "F3", `largest rupee contributor is F3, +150000 (got ${leaders.largestContributor?.schemeCode})`);
assert(leaders.largestDetractor.schemeCode === "F2", `largest rupee detractor is F2, -10000 (got ${leaders.largestDetractor?.schemeCode})`);
assert(leaders.excludedCount === 4, `4 holdings excluded: missing cost, unresolved match, stale NAV, failed reconciliation (got ${leaders.excludedCount})`);
assert(leaders.exclusions.find((e) => e.schemeCode === "F4")?.reason === "missing cost value", "F4 excluded for missing cost value, with a stated reason");
assert(leaders.exclusions.find((e) => e.schemeCode === "F5")?.reason === "unresolved scheme match", "F5 excluded for unresolved scheme match");
assert(leaders.exclusions.find((e) => e.schemeCode === "F6")?.reason === "stale NAV beyond policy", "F6 excluded for stale NAV beyond policy");
assert(leaders.exclusions.find((e) => e.schemeCode === "F7")?.reason === "failed reconciliation", "F7 excluded for failed reconciliation");
assert(leaders.bestDailyContributor === null, "daily-contributor rankings are null (never fabricated), not zero, when no daily-change data is supplied");

const dailyChanges = [{ schemeCode: "F1", dailyChangeValue: 500 }, { schemeCode: "F2", dailyChangeValue: -200 }, { schemeCode: "F3", dailyChangeValue: 1200 }];
const leadersWithDaily = computePerformanceLeaders(holdings, dailyChanges);
assert(leadersWithDaily.bestDailyContributor.schemeCode === "F3", `best daily contributor is F3 (got ${leadersWithDaily.bestDailyContributor?.schemeCode})`);
assert(leadersWithDaily.worstDailyContributor.schemeCode === "F2", `worst daily contributor is F2 (got ${leadersWithDaily.worstDailyContributor?.schemeCode})`);

// ================================================================================================
// casParser.js extensions -- plan/option/demat derivation, statement date, declared totals.
// Anonymized derivative fixture: fake identity/values, real structural pattern.
// ================================================================================================
console.log("\n=== casParser.js Phase 2 extensions ===");
const FAKE_FOLIO_2 = "5544332";
const SUMMARY_TEXT_2 = `CAMS Consolidated Account Summary
Computer Age Management Services Limited
www.camsonline.com
Consolidated Account Summary As on 10-Jul-2026

JOHN TEST SMITH
99 Fictional Road Sample Town
Email Id: john.test.smith@example.com
Mobile: +919988776655
Market ValueFolio No. (INR)
Scheme NameUnit Balance
NAV DateNAVRegistrar (INR) ISINCost Value (INR)
${FAKE_FOLIO_2}/0
Aditya Birla Sun Life Banking & PSU Debt
Fund- Direct Plan-Growth (Non-Demat)
2,345.678910-Jul-202645.6700CAMSINF209K01YN01,07,123.45
${FAKE_FOLIO_2}/0
Axis Banking & PSU Debt Fund - Regular Plan - IDCW Option (Demat)
876.543210-Jul-2026234.5600CAMSINF846K01CR62,05,632.10
Total312755.55312755.55`;
const parsed2 = parseCasText(SUMMARY_TEXT_2);
assert(parsed2.statementDate === "2026-07-10", `statement date extracted from the "As on" header (got "${parsed2.statementDate}")`);
assert(parsed2.statementDeclaredTotal.marketValueTotal === 312755.55, `declared market value total extracted (got ${parsed2.statementDeclaredTotal.marketValueTotal})`);
assert(parsed2.statementDeclaredTotal.costValueTotal === 312755.55, `declared cost value total extracted (got ${parsed2.statementDeclaredTotal.costValueTotal})`);

const abslRow = parsed2.rows.find((r) => r.isin === "INF209K01YN0");
assert(abslRow?.plan === "Direct", `plan derived as Direct from scheme name text (got "${abslRow?.plan}")`);
assert(abslRow?.option === "Growth", `option derived as Growth (got "${abslRow?.option}")`);
assert(abslRow?.demat === false, `demat derived as false from "(Non-Demat)" (got ${abslRow?.demat})`);

const axisRow = parsed2.rows.find((r) => r.isin === "INF846K01CR6");
assert(axisRow?.plan === "Regular", `plan derived as Regular (got "${axisRow?.plan}")`);
assert(axisRow?.option === "IDCW", `option derived as IDCW (got "${axisRow?.option}")`);
assert(axisRow?.demat === true, `demat derived as true from "(Demat)" (got ${axisRow?.demat})`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:", failures);
  process.exit(1);
}
