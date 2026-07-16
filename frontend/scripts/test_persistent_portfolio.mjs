#!/usr/bin/env node
// Unit tests for the Persistent Portfolio Mission's pure-function modules: field encryption
// (Phase 13), holding-change diffing + statement fingerprinting (Phase 6/7), and daily
// revaluation math (Phase 5). Plain Node, no server/database required — these are deliberately
// pure functions with no DB or Next.js dependency, so they run standalone.
//
// hasFieldKey/key-absent behavior is tested in a separate child process (see
// test_field_key_absent below) because fieldCrypto.js reads process.env.PORTFOLIO_FIELD_KEY once
// at module load time — this script needs the key present for its own encrypt/decrypt tests, so
// the "no key configured" path can't be exercised in the same process afterward.
//
// Does NOT yet exercise anything against the live database (portfolio_import/portfolio_folio/
// portfolio_holding/portfolio_holding_valuation) — that schema is designed
// (sql/neon/008_persistent_portfolio.sql) but not applied, per this session's own migration
// safety discipline. Flagged as the explicit next step, not silently skipped.
//
// Usage: PORTFOLIO_FIELD_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") node scripts/test_persistent_portfolio.mjs
import { execFileSync } from "child_process";
import crypto from "crypto";

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

if (!process.env.PORTFOLIO_FIELD_KEY) {
  process.env.PORTFOLIO_FIELD_KEY = crypto.randomBytes(32).toString("hex");
  console.log("(no PORTFOLIO_FIELD_KEY in env — generated a throwaway one for this test run)");
}

const { encryptField, decryptField, tokenizeField, lastFour, hasFieldKey } = await import("../app/lib/portfolioImport/fieldCrypto.js");
const { diffPortfolio, statementFingerprint } = await import("../app/lib/portfolioImport/portfolioDiff.js");
const { revalueHolding, revaluePortfolio } = await import("../app/lib/portfolioImport/revaluation.js");

// ================================================================================================
// fieldCrypto.js — encrypt/decrypt round trip, tokenization, display fragment. Folio number here
// is a synthetic test value ("9988776"), not any real investor's data.
// ================================================================================================
console.log("\n=== fieldCrypto.js ===");
const FAKE_FOLIO = "9988776";
assert(hasFieldKey === true, "hasFieldKey is true when PORTFOLIO_FIELD_KEY is set");

const { ciphertext, iv } = encryptField(FAKE_FOLIO);
assert(Buffer.isBuffer(ciphertext) && ciphertext.length > 0, "encryptField returns non-empty ciphertext");
assert(Buffer.isBuffer(iv) && iv.length === 12, "encryptField returns a 12-byte IV");
assert(ciphertext.toString("utf8") !== FAKE_FOLIO, "ciphertext does not contain the plaintext folio number");

const decrypted = decryptField(ciphertext, iv);
assert(decrypted === FAKE_FOLIO, `decryptField recovers the original plaintext (got "${decrypted}")`);

const { ciphertext: ciphertext2, iv: iv2 } = encryptField(FAKE_FOLIO);
assert(!ciphertext.equals(ciphertext2), "encrypting the same plaintext twice produces different ciphertext (fresh IV each time)");
assert(decryptField(ciphertext2, iv2) === FAKE_FOLIO, "second encryption also round-trips correctly");

let tamperThrew = false;
try {
  const tampered = Buffer.from(ciphertext);
  tampered[0] ^= 0xff;
  decryptField(tampered, iv);
} catch {
  tamperThrew = true;
}
assert(tamperThrew, "decrypting tampered ciphertext throws (GCM auth tag catches modification)");

const token1 = tokenizeField(FAKE_FOLIO);
const token2 = tokenizeField(FAKE_FOLIO);
const token3 = tokenizeField("1234567");
assert(token1 === token2, "tokenizeField is stable for the same input");
assert(token1 !== token3, "tokenizeField differs for different input");
assert(/^[0-9a-f]{64}$/.test(token1), "tokenizeField returns a 64-char hex HMAC");

assert(lastFour(FAKE_FOLIO) === "8776", `lastFour extracts the last 4 characters (got "${lastFour(FAKE_FOLIO)}")`);
assert(lastFour("12") === "12", "lastFour returns the whole string when shorter than 4 chars");

// ================================================================================================
// portfolioDiff.js — added/removed/increased/reduced/unchanged, and fingerprint stability.
// All scheme codes and folio tokens below are synthetic test identifiers.
// ================================================================================================
console.log("\n=== portfolioDiff.js ===");
const previous = [
  { folioToken: "tokA", schemeCode: "100033", units: 1000 },
  { folioToken: "tokA", schemeCode: "100034", units: 500 },
  { folioToken: "tokB", schemeCode: "100033", units: 200 }, // same scheme, different folio -- must stay distinct
];
const current = [
  { folioToken: "tokA", schemeCode: "100033", units: 1200 }, // increased
  { folioToken: "tokA", schemeCode: "100035", units: 300 },  // added
  { folioToken: "tokB", schemeCode: "100033", units: 200 },  // unchanged
  // tokA/100034 absent -> fully redeemed
];
const diff = diffPortfolio(previous, current);
assert(diff.added.length === 1 && diff.added[0].schemeCode === "100035", "detects one added holding");
assert(diff.increased.length === 1 && diff.increased[0].schemeCode === "100033" && diff.increased[0].delta === 200, `detects units increased by the correct delta (got ${diff.increased[0]?.delta})`);
assert(diff.unchanged.length === 1 && diff.unchanged[0].folioToken === "tokB", "same scheme under a different folio correctly left unchanged, not merged with tokA's position");
assert(diff.fullyRedeemed.length === 1 && diff.fullyRedeemed[0].schemeCode === "100034", "detects the fully redeemed holding");
assert(diff.removed.length === 1, "removed list matches fullyRedeemed for a simple redemption");
assert(diff.reduced.length === 0, "no false-positive reductions");

const reducedCase = diffPortfolio(
  [{ folioToken: "tokA", schemeCode: "100033", units: 1000 }],
  [{ folioToken: "tokA", schemeCode: "100033", units: 400 }]
);
assert(reducedCase.reduced.length === 1 && reducedCase.reduced[0].delta === -600, `detects a partial redemption (got delta ${reducedCase.reduced[0]?.delta})`);

const floatNoise = diffPortfolio(
  [{ folioToken: "tokA", schemeCode: "100033", units: 1000.00000001 }],
  [{ folioToken: "tokA", schemeCode: "100033", units: 1000.00000002 }]
);
assert(floatNoise.unchanged.length === 1 && floatNoise.increased.length === 0, "sub-epsilon float noise is not flagged as a real unit change");

const rowsA = [
  { folioToken: "tokA", schemeCode: "100033", units: 1000, navDate: "2026-07-15" },
  { folioToken: "tokB", schemeCode: "100034", units: 500, navDate: "2026-07-15" },
];
const rowsAReordered = [rowsA[1], rowsA[0]];
const rowsAChanged = [rowsA[0], { ...rowsA[1], units: 501 }];
assert(statementFingerprint(rowsA) === statementFingerprint(rowsAReordered), "statement fingerprint is order-independent");
assert(statementFingerprint(rowsA) !== statementFingerprint(rowsAChanged), "statement fingerprint changes when a unit balance changes");
assert(/^[0-9a-f]{64}$/.test(statementFingerprint(rowsA)), "statement fingerprint is a 64-char hex sha256");

// ================================================================================================
// revaluation.js — per-holding and aggregate valuation math against a fake fund lookup. No real
// scheme codes/NAVs; getFund below is a synthetic in-memory stub, not funds.json.
// ================================================================================================
console.log("\n=== revaluation.js ===");
const FAKE_FUNDS = {
  AAA111: { nav: 45.67, navDate: "2026-07-15", staleDays: 0 },
  BBB222: { nav: 234.56, navDate: "2026-07-15", staleDays: 5 }, // stale
};
const getFund = (code) => FAKE_FUNDS[code] || null;

const freshHolding = revalueHolding({ id: "h1", schemeCode: "AAA111", unitBalance: 2345.6789 }, getFund);
assert(freshHolding.marketValue === +(2345.6789 * 45.67).toFixed(2), `computes market value as units x nav (got ${freshHolding.marketValue})`);
assert(freshHolding.stale === false, "a holding whose fund refreshed today is not flagged stale");

const staleHolding = revalueHolding({ id: "h2", schemeCode: "BBB222", unitBalance: 100 }, getFund);
assert(staleHolding.stale === true, "a holding whose fund hasn't refreshed in >3 days is flagged stale, but still valued");
assert(staleHolding.marketValue != null, "a stale holding is still valued, not nulled out");

const missingHolding = revalueHolding({ id: "h3", schemeCode: "ZZZ999", unitBalance: 100 }, getFund);
assert(missingHolding.marketValue === null && missingHolding.stale === true, "a scheme code with no live fund match is reported missing, not silently dropped or valued at zero");

const portfolio = revaluePortfolio(
  [
    { id: "h1", schemeCode: "AAA111", unitBalance: 2345.6789, investedValue: 100000 },
    { id: "h2", schemeCode: "BBB222", unitBalance: 100, investedValue: 20000 },
    { id: "h3", schemeCode: "ZZZ999", unitBalance: 100, investedValue: 5000 },
  ],
  getFund,
  []
);
assert(portfolio.staleHoldingCount === 2, `counts both the stale-NAV holding and the missing-fund holding as stale (got ${portfolio.staleHoldingCount})`);
assert(portfolio.latestNavCoveragePct === +((2 / 3) * 100).toFixed(1), `coverage reflects 2 of 3 holdings successfully valued (got ${portfolio.latestNavCoveragePct})`);
assert(portfolio.totalInvestedValue === 125000, "total invested value sums correctly when every holding has cost data");
assert(portfolio.absoluteGain === +(portfolio.totalMarketValue - 125000).toFixed(2), "absolute gain is market value minus invested value");

const noCostPortfolio = revaluePortfolio([{ id: "h1", schemeCode: "AAA111", unitBalance: 100, investedValue: null }], getFund, []);
assert(noCostPortfolio.totalInvestedValue === null && noCostPortfolio.absoluteGain === null, "invested/gain stay null (never fabricated) when cost data is missing, matching a Summary-format import");

const xirrFlows = [
  { schemeCode: "AAA111", transactionType: "purchase", transactionDate: "2025-01-15", amount: 50000 },
  { schemeCode: "AAA111", transactionType: "purchase", transactionDate: "2025-07-15", amount: 50000 },
];
const xirrPortfolio = revaluePortfolio([{ id: "h1", schemeCode: "AAA111", unitBalance: 2000, investedValue: 100000 }], getFund, xirrFlows);
assert(xirrPortfolio.xirr !== null, `computes a real XIRR when transaction history exists (got ${xirrPortfolio.xirr})`);

const noTxnPortfolio = revaluePortfolio([{ id: "h1", schemeCode: "AAA111", unitBalance: 2000, investedValue: 100000 }], getFund, []);
assert(noTxnPortfolio.xirr === null, "xirr is null (never fabricated), not zero, when there are no transactions to compute it from");

// ================================================================================================
// fieldCrypto.js — key-absent behavior, in a fresh child process (module-level key is loaded once)
// ================================================================================================
console.log("\n=== fieldCrypto.js (key absent, child process) ===");
try {
  const out = execFileSync(
    process.execPath,
    ["--input-type=module", "-e", `
      import { hasFieldKey, encryptField } from "${new URL("../app/lib/portfolioImport/fieldCrypto.js", import.meta.url).pathname}";
      let threw = false;
      try { encryptField("x"); } catch { threw = true; }
      console.log(JSON.stringify({ hasFieldKey, threw }));
    `],
    { env: { ...process.env, PORTFOLIO_FIELD_KEY: "" }, encoding: "utf8" }
  );
  const result = JSON.parse(out.trim().split("\n").pop());
  assert(result.hasFieldKey === false, "hasFieldKey is false when PORTFOLIO_FIELD_KEY is unset");
  assert(result.threw === true, "encryptField throws a clear error rather than silently storing plaintext when no key is configured");
} catch (e) {
  failed++;
  failures.push(`child-process key-absent test errored: ${e.message}`);
  console.error(`  FAIL: child-process key-absent test errored: ${e.message}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("\nFailures:", failures);
  process.exit(1);
}
