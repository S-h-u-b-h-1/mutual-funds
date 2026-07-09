#!/usr/bin/env node
// Integration test suite for the Portfolio Import Engine (Mission B, Phase 1). Plain Node +
// fetch, same convention as test_backend_sync.mjs — run against a live dev server. Creates its
// own throwaway users (randomUUID-suffixed emails) and deletes them via DELETE /api/v1/account
// when done, so it's safe to run repeatedly against a real database.
//
// Usage: node scripts/test_portfolio_import.mjs [--base-url http://localhost:3001]
import { randomUUID } from "node:crypto";

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]
  : process.env.BASE_URL || "http://localhost:3000";

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

function makeSession() {
  const jar = new Map();
  const req = async (path, options = {}) => {
    const cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    const isFormData = options.body instanceof FormData;
    const headers = {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    };
    const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
    for (const raw of res.headers.getSetCookie()) {
      const [pair] = raw.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* fine */
    }
    return { status: res.status, body };
  };
  return {
    async register(email, password, name = "Test User") {
      return req("/api/auth/register", { method: "POST", body: JSON.stringify({ name, email, password }) });
    },
    async login(email, password) {
      const csrf = await req("/api/auth/csrf");
      return req("/api/auth/callback/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
        body: new URLSearchParams({ email, password, csrfToken: csrf.body.csrfToken, callbackUrl: BASE_URL }).toString(),
      });
    },
    get: (path) => req(path),
    post: (path, body) => req(path, { method: "POST", body: JSON.stringify(body) }),
    postForm: (path, formData) => req(path, { method: "POST", body: formData }),
    del: (path, body) => req(path, { method: "DELETE", ...(body ? { body: JSON.stringify(body) } : {}) }),
  };
}

// Real, live fixtures (funds.json, checked at the time this suite was written) — using real
// scheme data, not synthetic codes, so scheme resolution (ISIN + name matching) exercises the
// same lookup real uploads will use.
const FUND_A = { code: "100033", name: "Aditya Birla Sun Life Large & Mid Cap Fund - Regular Growth", isin: "INF209K01165" };
const FUND_B = { code: "100034", name: "Aditya Birla Sun Life Large & Mid Cap Fund -Regular - IDCW", isin: "INF209K01157" };
const FUND_C = { code: "100037", name: "Aditya Birla Sun Life Income Fund - Regular - Quarterly IDCW", isin: "INF209K01587" };

async function main() {
  console.log(`Testing portfolio import at ${BASE_URL}\n`);

  const emailA = `test-portfolio-a-${randomUUID()}@example.com`;
  const emailB = `test-portfolio-b-${randomUUID()}@example.com`;
  const password = "integration-test-pw-1";
  const a = makeSession();
  const b = makeSession();
  // Printed immediately, before any request that could throw — if this run crashes partway,
  // these are still recoverable for manual cleanup instead of becoming untraceable orphans.
  console.log(`Test users for this run (cleaned up in finally{} below, or manually if this crashes): ${emailA}, ${emailB}\n`);

  try {
  console.log("Setup: register two users");
  assert((await a.register(emailA, password, "Portfolio Test A")).status === 201, "register user A");
  assert((await a.login(emailA, password)).status === 200, "login user A");
  assert((await b.register(emailB, password, "Portfolio Test B")).status === 201, "register user B");
  assert((await b.login(emailB, password)).status === 200, "login user B");

  console.log("Manual import: mixed valid rows (isin-only, purchaseValue-derives-avgCost, avgCost-derives-purchaseValue) + one bad row");
  const manualUpload = await a.post("/api/v1/portfolio/upload", {
    source: "manual",
    entries: [
      { isin: FUND_A.isin, units: 10, purchaseValue: 8000 },
      { schemeName: FUND_B.name, units: 5, avgCost: 100 },
      { isin: FUND_C.isin, units: 20, purchaseValue: 5000, folioNumber: "FOLIO-1" },
      { isin: "INF000X00000", units: 5 }, // no such ISIN — must error, not crash the batch
      { isin: FUND_A.isin, units: 0 }, // invalid units — must error
    ],
  });
  assert(manualUpload.status === 201, "manual upload: 201");
  assert(manualUpload.body?.imported === 3, `manual upload: 3 of 5 rows imported (got ${manualUpload.body?.imported})`);
  assert(manualUpload.body?.errors?.length === 2, `manual upload: 2 errors reported, not silently dropped (got ${manualUpload.body?.errors?.length})`);
  assert(manualUpload.body?.upload?.status === "partial", "manual upload: upload row status is 'partial' (some succeeded, some failed)");

  const holdingA = manualUpload.body.holdings.find((h) => h.schemeCode === FUND_A.code);
  assert(holdingA?.amc === "Aditya Birla Sun Life", "enrichment: AMC populated from funds.js, not the source");
  assert(holdingA?.category != null, "enrichment: category populated");
  assert(holdingA?.nav > 0, "enrichment: live NAV populated");
  assert(holdingA?.currentValue === +(10 * holdingA.nav).toFixed(2), "enrichment: currentValue = units * live NAV, not a source-reported figure");
  assert(Math.abs(holdingA.avgCost - 800) < 0.01, "derivation: avgCost derived from purchaseValue/units (8000/10=800)");

  const holdingB = manualUpload.body.holdings.find((h) => h.schemeCode === FUND_B.code);
  assert(Math.abs(holdingB.purchaseValue - 500) < 0.01, "derivation: purchaseValue derived from avgCost*units (100*5=500)");

  const totalWeight = manualUpload.body.holdings.reduce((s, h) => s + (h.weight || 0), 0);
  assert(Math.abs(totalWeight - 100) < 0.5, `weights: sum to ~100% across the batch (got ${totalWeight})`);

  console.log("Read-back: GET holdings reflects what was persisted, re-enriched fresh");
  const readBack = await a.get("/api/v1/portfolio/holdings");
  assert(readBack.status === 200, "GET holdings: 200");
  assert(readBack.body?.items?.length === 3, `GET holdings: 3 persisted holdings (got ${readBack.body?.items?.length})`);
  const readBackWeight = readBack.body.items.reduce((s, h) => s + (h.weight || 0), 0);
  assert(Math.abs(readBackWeight - 100) < 0.5, "GET holdings: weights recomputed correctly across the full persisted set");

  console.log("Re-upload: same user+scheme+source+folio upserts in place, does not duplicate");
  const reupload = await a.post("/api/v1/portfolio/upload", {
    source: "manual",
    entries: [{ isin: FUND_A.isin, units: 15 }], // same fund, no folio (both times default to ''), different units
  });
  assert(reupload.status === 201 && reupload.body?.imported === 1, "re-upload: succeeds");
  const afterReupload = await a.get("/api/v1/portfolio/holdings");
  assert(afterReupload.body?.items?.length === 3, `re-upload: still 3 holdings, not 4 (upsert, not duplicate) (got ${afterReupload.body?.items?.length})`);
  const updatedHoldingA = afterReupload.body.items.find((h) => h.schemeCode === FUND_A.code);
  assert(updatedHoldingA?.units === 15, `re-upload: units updated to the new value (got ${updatedHoldingA?.units})`);

  console.log("CSV import (groww source): header row after a preamble line, aliased column names");
  const csvText = [
    "Portfolio Statement — Generated for testing",
    "Scheme Name,ISIN,Units,Invested Value,Folio No",
    `"${FUND_C.name}",${FUND_C.isin},8,2000,FOLIO-CSV-1`,
  ].join("\n");
  const form = new FormData();
  form.set("source", "groww");
  form.set("file", new Blob([csvText], { type: "text/csv" }), "holdings.csv");
  const csvUpload = await a.postForm("/api/v1/portfolio/upload", form);
  assert(csvUpload.status === 201, "csv upload: 201");
  assert(csvUpload.body?.imported === 1, `csv upload: 1 row imported despite the preamble line (got ${csvUpload.body?.imported}, warnings: ${JSON.stringify(csvUpload.body?.warnings)})`);
  assert(csvUpload.body?.holdings?.[0]?.schemeCode === FUND_C.code, "csv upload: resolved to the correct scheme via ISIN");
  assert(csvUpload.body?.holdings?.[0]?.folioNumber === "FOLIO-CSV-1", "csv upload: folio number carried through");

  console.log("CSV import: unrecognized headers fail loud, not silent");
  const badCsv = "Column1,Column2,Column3\nfoo,bar,baz";
  const badForm = new FormData();
  badForm.set("source", "kuvera");
  badForm.set("file", new Blob([badCsv], { type: "text/csv" }), "bad.csv");
  const badCsvUpload = await a.postForm("/api/v1/portfolio/upload", badForm);
  assert(badCsvUpload.status === 201, "bad csv: still 201 (upload attempt recorded)");
  assert(badCsvUpload.body?.imported === 0, "bad csv: 0 imported");
  assert(badCsvUpload.body?.upload?.status === "failed", "bad csv: upload row status is 'failed'");
  assert(badCsvUpload.body?.warnings?.some((w) => w.includes("header row")), "bad csv: warning explains why, doesn't just silently return nothing");

  console.log("Input validation");
  assert((await a.post("/api/v1/portfolio/upload", { source: "not-a-real-source", entries: [] })).status === 400, "unknown source: 400");
  assert((await a.post("/api/v1/portfolio/upload", { source: "manual" })).status === 400, "manual with no entries: 400");
  const noFileForm = new FormData();
  noFileForm.set("source", "groww");
  assert((await a.postForm("/api/v1/portfolio/upload", noFileForm)).status === 400, "csv source with no file: 400");

  console.log("Cross-user isolation");
  const bHoldings = await b.get("/api/v1/portfolio/holdings");
  assert(bHoldings.body?.items?.length === 0, "isolation: user B sees zero of user A's holdings");

  console.log("Auth");
  const noAuth = makeSession();
  assert((await noAuth.get("/api/v1/portfolio/holdings")).status === 401, "unauthenticated GET holdings: 401");
  assert((await noAuth.post("/api/v1/portfolio/upload", { source: "manual", entries: [] })).status === 401, "unauthenticated upload: 401");

  } finally {
    // Always runs, even if an assertion above threw (e.g. a .find() on an unexpectedly-shaped
    // response) — a crash mid-run must never leave orphaned test accounts in a real database.
    console.log("Cleanup");
    const delA = await a.del("/api/v1/account", { confirmEmail: emailA }).catch((e) => ({ status: "threw", e }));
    const delB = await b.del("/api/v1/account", { confirmEmail: emailB }).catch((e) => ({ status: "threw", e }));
    assert(delA.status === 204, `cleanup: delete user A (got ${delA.status})`);
    assert(delB.status === 204, `cleanup: delete user B (got ${delB.status})`);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error("\nFailures:");
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Test suite crashed:", e);
  process.exit(1);
});
