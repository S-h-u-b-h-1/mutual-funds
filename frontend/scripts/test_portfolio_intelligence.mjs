#!/usr/bin/env node
// Regression suite for the Portfolio Intelligence Engine (Phases A-D). Same convention as
// test_backend_sync.mjs / test_portfolio_import.mjs — plain Node + fetch, self-cleaning via
// DELETE /api/v1/account, crash-safe (cleanup runs in finally{} even if an assertion throws).
//
// Usage: node scripts/test_portfolio_intelligence.mjs [--base-url http://localhost:3001]
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
    const headers = { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}), ...(cookieHeader ? { Cookie: cookieHeader } : {}) };
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
    del: (path, body) => req(path, { method: "DELETE", ...(body ? { body: JSON.stringify(body) } : {}) }),
  };
}

// Real, live fixtures (checked at the time this suite was written). SBI_GROWTH and SBI_IDCW are
// two plan-options of the literal same underlying index portfolio — a natural, realistic overlap
// case (someone who holds both the Growth and IDCW variant of the same fund) that should surface
// in duplicateAmcs, duplicateSectors, and duplicateStocks.
const SBI_GROWTH = { code: "102272", isin: "INF200K01537", amc: "SBI", category: "Indexs" };
const SBI_IDCW = { code: "102273", isin: "INF200K01545", amc: "SBI", category: "Indexs" };
const JM_LARGECAP = { code: "100218", isin: "INF192K01585", amc: "JM Financial", category: "Large Cap" };
const ABSL_LIQUID = { code: "100046", isin: "INF209K01KQ2", amc: "Aditya Birla Sun Life", category: "Liquid" };

async function main() {
  console.log(`Testing portfolio intelligence at ${BASE_URL}\n`);

  const emailA = `test-intel-a-${randomUUID()}@example.com`;
  const emailB = `test-intel-b-${randomUUID()}@example.com`;
  const password = "integration-test-pw-1";
  const a = makeSession();
  const b = makeSession();
  console.log(`Test users for this run (cleaned up in finally{} below, or manually if this crashes): ${emailA}, ${emailB}\n`);

  try {
    console.log("Setup: register + login, upload a realistic 4-fund portfolio with intentional overlap");
    assert((await a.register(emailA, password)).status === 201, "register user A");
    assert((await a.login(emailA, password)).status === 200, "login user A");
    assert((await b.register(emailB, password)).status === 201, "register user B");
    assert((await b.login(emailB, password)).status === 200, "login user B");

    const upload = await a.post("/api/v1/portfolio/upload", {
      source: "manual",
      entries: [
        { isin: SBI_GROWTH.isin, units: 100 },
        { isin: SBI_IDCW.isin, units: 40 },
        { isin: JM_LARGECAP.isin, units: 300 },
        { isin: ABSL_LIQUID.isin, units: 80 },
      ],
    });
    assert(upload.status === 201 && upload.body?.imported === 4, `upload: all 4 fixtures imported (got ${upload.body?.imported})`);

    console.log("GET /api/v1/portfolio/intelligence — first computation");
    const r1 = await a.get("/api/v1/portfolio/intelligence");
    assert(r1.status === 200, `intelligence: 200 (got ${r1.status}, body: ${JSON.stringify(r1.body)})`);
    const report = r1.body?.report;

    console.log("Phase A: Portfolio Analytics");
    assert(report?.portfolioSummary?.totalValue > 0, "totalValue is positive");
    assert(report?.portfolioSummary?.holdingsCount === 4, `holdingsCount is 4 (got ${report?.portfolioSummary?.holdingsCount})`);

    const amcSum = report.allocations.amc.reduce((s, x) => s + x.weight, 0);
    assert(Math.abs(amcSum - 100) < 0.5, `AMC allocation weights sum to ~100 (got ${amcSum})`);
    const sbiAmc = report.allocations.amc.find((x) => x.name === "SBI");
    const sbiIndividualWeights = [
      report.topHoldings.find((h) => h.schemeCode === SBI_GROWTH.code)?.weight || 0,
      report.topHoldings.find((h) => h.schemeCode === SBI_IDCW.code)?.weight || 0,
    ];
    assert(Math.abs(sbiAmc.weight - (sbiIndividualWeights[0] + sbiIndividualWeights[1])) < 0.1, "SBI AMC allocation equals the sum of its two individual fund weights");

    const catSum = report.allocations.category.reduce((s, x) => s + x.weight, 0);
    assert(Math.abs(catSum - 100) < 0.5, `category allocation weights sum to ~100 (got ${catSum})`);

    assert(report.diversification.score >= 0 && report.diversification.score <= 100, "diversification score in [0,100]");
    assert(report.concentration.score >= 0 && report.concentration.score <= 100, "concentration score in [0,100]");
    assert(report.diversification.effectiveHoldings > 1 && report.diversification.effectiveHoldings <= 4, `effective holdings is between 1 and 4 (got ${report.diversification.effectiveHoldings})`);
    assert(report.diversification.effectiveAmcs > 1 && report.diversification.effectiveAmcs <= 3, `effective AMCs is between 1 and 3, reflecting the SBI concentration (got ${report.diversification.effectiveAmcs})`);
    assert(report.portfolioSummary.healthScore == null || (report.portfolioSummary.healthScore >= 0 && report.portfolioSummary.healthScore <= 100), "health score in [0,100] or null");

    console.log("Phase B: Overlap Engine — SBI Growth/IDCW should surface as real overlap");
    const dupAmc = report.overlap.duplicateAmcs.find((x) => x.amc === "SBI");
    assert(dupAmc && dupAmc.funds.length === 2, `duplicateAmcs contains SBI with 2 funds (got ${JSON.stringify(dupAmc)})`);
    const totalAllocatedPct = [...report.overlap.duplicateAmcs, ...report.overlap.duplicateSectors, ...report.overlap.duplicateStocks].every((x) => typeof (x.totalWeightPct ?? x.totalExposurePct) === "number");
    assert(totalAllocatedPct, "every overlap entry reports a real numeric percentage (never estimated/missing)");
    assert(report.overlap.duplicateFunds.length === 0, "no duplicate-funds (same scheme via 2 sources) in this upload — expected, none were re-uploaded");

    console.log("Phase C: Exposure Engine — 12 themes, 9 available (real rule_id mapping) + 3 honestly unavailable");
    const themeNames = Object.keys(report.exposure);
    assert(themeNames.length === 12, `exactly 12 themes reported (got ${themeNames.length})`);
    const available = themeNames.filter((t) => report.exposure[t].available);
    const unavailable = themeNames.filter((t) => !report.exposure[t].available);
    assert(available.length === 9, `9 themes available (got ${available.length}: ${available.join(", ")})`);
    assert(unavailable.length === 3 && ["PSU", "Budget", "Elections"].every((t) => unavailable.includes(t)), `PSU/Budget/Elections are the 3 honestly-unavailable themes (got ${unavailable.join(", ")})`);
    for (const t of available) {
      assert(Array.isArray(report.exposure[t].ruleIds) && report.exposure[t].ruleIds.length > 0, `theme "${t}" cites real rule_ids`);
      assert(report.exposure[t].exposurePct >= 0 && report.exposure[t].exposurePct <= 100, `theme "${t}" exposurePct is in [0,100] (got ${report.exposure[t].exposurePct})`);
    }
    assert(report.exposure.RBI.exposurePct > 0, `RBI theme picks up the Liquid fund's category match (got ${report.exposure.RBI.exposurePct})`);

    console.log("Phase D: Health Report — missing categories + compliance-safe research opportunities");
    assert(Array.isArray(report.missingCategories) && report.missingCategories.length > 0, "missingCategories is non-empty (this 4-fund portfolio has real gaps: no Gold, Mid Cap, Small Cap, International, Hybrid)");
    assert(!report.missingCategories.includes("Large Cap"), "Large Cap correctly NOT in missingCategories (JM fixture covers it)");
    assert(!report.missingCategories.includes("Debt"), "Debt correctly NOT in missingCategories (Liquid category maps into the Debt bucket)");
    assert(report.researchOpportunities.length === report.missingCategories.length, "one research opportunity per missing category");
    const fixtureNames = ["SBI NIFTY INDEX", "JM Large Cap", "Aditya Birla Sun Life Liquid"];
    const oppText = JSON.stringify(report.researchOpportunities);
    assert(fixtureNames.every((n) => !oppText.includes(n)), "compliance: research opportunities never name a specific fund");
    assert(Array.isArray(report.strengths) && Array.isArray(report.weaknesses), "strengths/weaknesses are both present as arrays");

    console.log("Append-only: a second computation creates new rows, doesn't overwrite");
    const r2 = await a.get("/api/v1/portfolio/intelligence");
    assert(r2.status === 200, "second intelligence call: 200");
    assert(r2.body?.metricsId !== r1.body?.metricsId, "second call creates a distinct portfolio_metrics row (append-only, not upsert)");
    assert(r2.body?.reportId !== r1.body?.reportId, "second call creates a distinct portfolio_reports row (append-only, not upsert)");

    console.log("Cross-user isolation + empty-portfolio handling");
    const bIntelligence = await b.get("/api/v1/portfolio/intelligence");
    assert(bIntelligence.status === 400, `user B (no holdings): 400, not user A's data (got ${bIntelligence.status})`);

    console.log("Auth");
    const noAuth = makeSession();
    assert((await noAuth.get("/api/v1/portfolio/intelligence")).status === 401, "unauthenticated: 401");
  } finally {
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
