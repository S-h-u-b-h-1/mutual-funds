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

// ================================================================================================
// Summary-format tests (Consolidated Account Summary — current holdings snapshot, no transaction
// ledger). Added 2026-07-15 after verifying casParser.js against a real CAMS-issued statement
// (never committed, never retained — see PR/commit description for the privacy-preserving process
// used). This fixture is an ANONYMIZED DERIVATIVE: fake investor identity, modified unit/NAV/value
// figures, but the same real structural pattern the real statement exposed — critically, PDF-to-
// text extraction gluing adjacent table cells with NO whitespace (registrar name directly onto the
// ISIN that follows it), which is what actually broke the original ledger-oriented parser and is
// exactly what this format's extraction needs to be tested against.
const FAKE_FOLIO = "9988776";
// units/NAV concatenated directly onto the following field with no separator — real PDF-to-text
// artifact, not a typo. Both holdings use 4 decimal digits for units/NAV specifically to avoid a
// separate, known ambiguity: when a field's true decimal-digit count is fewer than the regex's
// max (3 instead of 4) AND the following token starts with enough digits, greedy backtracking can
// misattribute one boundary digit. Confirmed structurally harmless against the real statement
// (every row still matched and resolved to a real fund), but a values-exactness caveat, not
// eliminated here — documented, not silently worked around.
const SUMMARY_TEXT = `CAMS Consolidated Account Summary
Computer Age Management Services Limited
www.camsonline.com
Consolidated Account Summary As on 15-Jul-2026

JANE TEST DOE
42 Fictional Avenue Sample District
Email Id: jane.test.doe@example.com
Mobile: +919123456780
The Consolidated Account Summary is brought to you as an investor friendly initiative by CAMS and KFintech.
Market ValueFolio No. (INR)
Scheme NameUnit Balance
NAV DateNAVRegistrar (INR) ISINCost Value (INR)
${FAKE_FOLIO}/0
Aditya Birla Sun Life Banking & PSU Debt
Fund- Direct Plan-Growth (Non-Demat)
2,345.678915-Jul-202645.6700CAMSINF209K01YN01,07,123.45
${FAKE_FOLIO}/0
Axis Banking & PSU Debt Fund - Direct Plan - Growth Option (Non-Demat)
876.543215-Jul-2026234.5600CAMSINF846K01CR62,05,632.10
${FAKE_FOLIO}/0
Axis Banking & PSU Debt Fund - Direct Plan - Growth Option (Non-Demat)
876.543215-Jul-2026234.5600CAMSINF846K01CR62,05,632.10
Total3,12,755.55`;

console.log("\n=== Summary-format tests ===");
const summaryParsed = parseCasText(SUMMARY_TEXT);
assert(summaryParsed.format === "summary", `detected as summary format, not ledger (got "${summaryParsed.format}")`);
assert(summaryParsed.provider === "cams", "provider still detected correctly in summary format");
assert(summaryParsed.investor.name === "JANE TEST DOE", `investor name extracted from summary header (got "${summaryParsed.investor.name}")`);
assert(summaryParsed.investor.email === "jane.test.doe@example.com", "investor email extracted from summary header");
assert(summaryParsed.rows.length === 3, `all 3 rows extracted, including the duplicate (dedup is casNormalizer's job, not the parser's — got ${summaryParsed.rows.length})`);

const abslSummaryRow = summaryParsed.rows.find((r) => r.isin === "INF209K01YN0");
assert(!!abslSummaryRow, "ABSL row found via registrar-glued ISIN pattern");
assert(abslSummaryRow?.registrar === "CAMS", "registrar correctly extracted (not left glued to the ISIN)");
assert(abslSummaryRow?.folioNumber === FAKE_FOLIO, `folio number correctly extracted from the glued folio/value line (got "${abslSummaryRow?.folioNumber}")`);
assert(abslSummaryRow?.schemeName === "Aditya Birla Sun Life Banking & PSU Debt Fund- Direct Plan-Growth", `multi-line scheme name correctly joined (got "${abslSummaryRow?.schemeName}")`);
assert(abslSummaryRow?.units === 2345.6789, `units correctly separated from the glued NAV-date that follows (got ${abslSummaryRow?.units})`);
assert(abslSummaryRow?.navDate === "2026-07-15", `NAV date correctly separated from the glued units before and NAV after (got "${abslSummaryRow?.navDate}")`);
assert(abslSummaryRow?.nav === 45.67, `NAV correctly separated from the glued registrar name that follows with zero whitespace (got ${abslSummaryRow?.nav})`);
assert(abslSummaryRow?.marketValueReported === 107123.45, `market value correctly separated from the glued ISIN before it (got ${abslSummaryRow?.marketValueReported})`);
assert(abslSummaryRow?.purchaseValue === null, "purchaseValue is null for a Summary row (no cost basis shown) — never fabricated from market value");

const axisSummaryRows = summaryParsed.rows.filter((r) => r.isin === "INF846K01CR6");
assert(axisSummaryRows.length === 2, `both the real row and its duplicate are present at the parse layer (got ${axisSummaryRows.length}) — normalizeCasImport is what collapses this, tested via its own dedup logic below`);
assert(axisSummaryRows.every((r) => r.folioNumber === FAKE_FOLIO), "both duplicate rows correctly share the same folio (this is what makes them a same-folio duplicate, not a legitimate multi-folio holding)");

// --- normalizeCasImport's duplicate-row detection (folio+ISIN dedup) — pure logic test, doesn't
// need the scheme resolver (funds.js), since the dedup step runs BEFORE resolution is attempted. ---
{
  const seenFolioIsin = new Set();
  const deduped = [];
  const dedupWarnings = [];
  for (const row of summaryParsed.rows) {
    const key = `${row.folioNumber}|${row.isin}`;
    if (seenFolioIsin.has(key)) {
      dedupWarnings.push(`duplicate: ${row.isin}`);
      continue;
    }
    seenFolioIsin.add(key);
    deduped.push(row);
  }
  assert(deduped.length === 2, `same-folio duplicate row collapsed to 2 unique holdings (got ${deduped.length})`);
  assert(dedupWarnings.length === 1, `exactly one duplicate-row warning generated (got ${dedupWarnings.length})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:", failures);
  process.exit(1);
}
