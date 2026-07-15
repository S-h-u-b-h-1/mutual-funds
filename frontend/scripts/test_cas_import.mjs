#!/usr/bin/env node
// Unit tests for the CAS PDF Import Engine's text-parsing layer (Institutional Portfolio Import
// Engine mission). Plain Node, no server or database required — casParser.js and xirr.js have no
// external dependencies, so this runs the actual parsing/financial-math logic directly against a
// synthetic (clearly fabricated) CAMS-format fixture. Two real active funds' real names/ISINs are
// used (public fund identity, not anyone's holdings); investor name/PAN/email/mobile are
// fabricated test data, not a real person's.
//
// Deliberately does NOT exercise casNormalizer.js's resolveSchemeIdentity() integration or the
// PDF-binary extraction layer (casPdf.js) here: the former needs funds.js's JSON import, which
// only resolves under Next.js's bundler, not plain Node's ESM loader; the latter is exercised
// against pdf-parse's own bundled real test PDF during development (see commit history) rather
// than a hand-built one, since a hand-rolled minimal PDF's own xref-table correctness isn't the
// thing worth testing here. Full end-to-end coverage (register -> upload -> resolve -> persist)
// belongs in a live-server integration test alongside test_portfolio_import.mjs, not yet written —
// flagged as the concrete next step, not silently skipped.
//
// Usage: node scripts/test_cas_import.mjs
import { parseCasText, detectProvider } from "../app/lib/portfolioImport/casParser.js";
import { computeXirr } from "../app/lib/portfolioImport/xirr.js";

const CAS_TEXT = `CAMS Consolidated Account Statement
Computer Age Management Services Limited
www.camsonline.com

TEST INVESTOR ONE
123 Sample Street, Test City 400001
Email Id: test.investor@example.com
Mobile: 9876543210
PAN: ABCDE1234F

Folio No: 11223344 / 0
PAN: ABCDE1234F                          KYC: OK
ADITYA BIRLA SUN LIFE MUTUAL FUND
Registrar : CAMS

Aditya Birla Sun Life Banking & PSU Debt Fund- Direct Plan-Growth (ISIN: INF209K01YN0)
Advisor: DIRECT                            NAV on 30-Jun-2026 : INR 320.5000
Opening Unit Balance: 0.000

01-Apr-2024 Purchase                        50000.00      156.045   320.4500   156.045
01-May-2024 Purchase                        50000.00      154.882   322.8100   310.927

Closing Unit Balance: 310.927   Total Cost Value: 100000.00   Market Value on 30-Jun-2026: 99680.15

Folio No: 55667788 / 0
PAN: ABCDE1234F                          KYC: OK
AXIS MUTUAL FUND
Registrar : CAMS

Axis Banking & PSU Debt Fund - Direct Plan - Growth Option (ISIN: INF846K01CR6)
Advisor: DIRECT                            NAV on 30-Jun-2026 : INR 2450.1200
Opening Unit Balance: 0.000

15-Jan-2023 Purchase                        200000.00     87.234    2292.1500  87.234
15-Jan-2024 Redemption                      -60000.00     -24.891   2410.0500  62.343

Closing Unit Balance: 62.343   Total Cost Value: 143000.00   Market Value on 30-Jun-2026: 152747.36`;

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

// --- Provider detection ---
assert(detectProvider(CAS_TEXT) === "cams", "detects CAMS from signature text");
assert(detectProvider("KFin Technologies Limited statement") === "kfin", "detects KFin");
assert(detectProvider("MF Central Portfolio Summary") === "mfcentral", "detects MF Central");
assert(detectProvider("some random unrelated text") === null, "returns null for unrecognized text, never guesses");

// --- Full parse: investor identity, holdings, transactions ---
const parsed = parseCasText(CAS_TEXT);
assert(parsed.warnings.length === 0, `no warnings on a well-formed statement (got ${JSON.stringify(parsed.warnings)})`);
assert(parsed.investor.name === "TEST INVESTOR ONE", `investor name extracted correctly (got "${parsed.investor.name}")`);
assert(parsed.investor.email === "test.investor@example.com", `investor email extracted (got "${parsed.investor.email}")`);
assert(parsed.investor.mobile === "9876543210", `investor mobile extracted (got "${parsed.investor.mobile}")`);
assert(parsed.investor.pan === "ABCDE1234F", `investor PAN extracted (got "${parsed.investor.pan}")`);
assert(parsed.rows.length === 2, `extracted exactly 2 holdings (got ${parsed.rows.length})`);

const abslRow = parsed.rows.find((r) => r.isin === "INF209K01YN0");
assert(!!abslRow, "found the ABSL Banking & PSU Debt Fund row by ISIN");
assert(abslRow?.schemeName?.includes("Banking & PSU Debt Fund"), `scheme name extracted correctly (got "${abslRow?.schemeName}")`);
assert(abslRow?.folioNumber === "11223344", `folio number extracted (got "${abslRow?.folioNumber}")`);
assert(abslRow?.units === 310.927, `closing units correct (got ${abslRow?.units})`);
assert(abslRow?.purchaseValue === 100000, `total cost value correct (got ${abslRow?.purchaseValue})`);
assert(abslRow?.marketValueReported === 99680.15, `reported market value correct (got ${abslRow?.marketValueReported})`);

const axisRow = parsed.rows.find((r) => r.isin === "INF846K01CR6");
assert(!!axisRow, "found the Axis Banking & PSU Debt Fund row by ISIN");
assert(axisRow?.units === 62.343, `Axis closing units correct after redemption (got ${axisRow?.units})`);

assert(parsed.transactions.length === 4, `extracted all 4 transactions across both folios (got ${parsed.transactions.length})`);
const purchases = parsed.transactions.filter((t) => t.transactionType === "purchase");
const redemptions = parsed.transactions.filter((t) => t.transactionType === "redemption");
assert(purchases.length === 3, `classified 3 purchases correctly (got ${purchases.length})`);
assert(redemptions.length === 1, `classified 1 redemption correctly (got ${redemptions.length})`);
assert(redemptions[0]?.amount === -60000, `redemption amount sign preserved (got ${redemptions[0]?.amount})`);
assert(purchases[0]?.transactionDate === "2024-04-01", `DD-Mon-YYYY date parsed to ISO correctly (got "${purchases[0]?.transactionDate}")`);

// --- XIRR: sanity checks + a real cash-flow series extracted from the fixture above ---
const simpleReturn = computeXirr([
  { date: "2025-01-01", amount: -10000 },
  { date: "2026-01-01", amount: 11000 },
]);
assert(simpleReturn !== null && Math.abs(simpleReturn - 10) < 0.5, `simple 1-year 10% return computes correctly (got ${simpleReturn})`);
assert(computeXirr([]) === null, "empty cashflow list returns null, not a fabricated number");
assert(computeXirr([{ date: "2025-01-01", amount: -1000 }]) === null, "single cashflow (no return to measure) returns null");
assert(computeXirr([{ date: "2025-01-01", amount: 1000 }, { date: "2025-06-01", amount: 500 }]) === null, "two same-sign flows (no real investment/return pair) returns null");

const abslFlows = parsed.transactions
  .filter((t) => t.isin === "INF209K01YN0")
  .map((t) => ({ date: t.transactionDate, amount: -Math.abs(t.amount) }));
abslFlows.push({ date: "2026-06-30", amount: 99680.15 });
const abslXirr = computeXirr(abslFlows);
assert(abslXirr !== null && abslXirr > -20 && abslXirr < 20, `real ABSL cashflow series (2 purchases + terminal value, near-flat NAV) computes a plausible XIRR (got ${abslXirr})`);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:", failures);
  process.exit(1);
}
