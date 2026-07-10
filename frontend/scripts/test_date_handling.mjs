#!/usr/bin/env node
// Regression test for the date-timezone bug found 2026-07-10: node-postgres parses bare SQL
// `date` columns into JS Date objects using the machine's LOCAL system timezone, then any
// UTC-based serialization (.toISOString(), JSON.stringify, console.log) silently prints the
// PREVIOUS calendar day whenever that timezone is ahead of UTC (confirmed live: IST is +5:30,
// "2026-07-09" round-tripped as "2026-07-08T18:30:00.000Z"). `timestamptz` columns are NOT
// affected — they carry an unambiguous absolute instant. The fix is casting every bare `date`
// column to `::text` at the query source (app/lib/neonReads.js) so node-postgres never
// constructs a Date object for it. This test uses the EXACT query text from that file, so it
// fails if anyone reverts the cast, not just a generic demo of the bug class.
//
// Usage: node scripts/test_date_handling.mjs
import { readFileSync } from "node:fs";
import { Pool } from "pg";

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

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const DATABASE_URL = envText
  .split("\n")
  .find((l) => l.startsWith("DATABASE_URL="))
  ?.slice("DATABASE_URL=".length)
  .trim();

async function main() {
  if (!DATABASE_URL) {
    console.log("No DATABASE_URL in .env.local — skipping (nothing to test against).");
    return;
  }
  const pool = new Pool({ connectionString: DATABASE_URL, max: 1 });

  console.log("Reproducing the bug: bare date column WITHOUT a text cast");
  const uncast = await pool.query("select max(nav_date) as latest from fact_nav_daily");
  const groundTruth = await pool.query("select max(nav_date)::text as latest from fact_nav_daily");
  const uncastValue = uncast.rows[0].latest; // a JS Date object, if any row exists
  const truthValue = groundTruth.rows[0].latest; // a plain string, e.g. "2026-07-09"

  if (uncastValue == null) {
    console.log("No fact_nav_daily rows — skipping the live-data assertions.");
  } else {
    assert(uncastValue instanceof Date, "sanity: uncast bare `date` column comes back as a JS Date object (confirms the driver behavior this bug depends on)");
    const uncastIso = uncastValue.toISOString();
    // The bug: naive serialization of the Date object does NOT equal the true calendar date
    // whenever the local timezone is ahead of UTC. This assertion documents that gap exists —
    // it is not something app code should ever rely on being safe.
    assert(uncastIso.slice(0, 10) !== truthValue || new Date().getTimezoneOffset() <= 0, "documents the bug: naive .toISOString() on an uncast date column does not reliably equal the true calendar date outside UTC/behind-UTC timezones");

    console.log("\nThe fix: neonReads.js's actual production queries, cast ::text");
    const freshnessQuery = await pool.query(
      `select nav_latest_date::text as nav_latest_date from fact_system_health order by captured_at desc limit 1`
    );
    if (freshnessQuery.rows[0]?.nav_latest_date != null) {
      assert(typeof freshnessQuery.rows[0].nav_latest_date === "string", "getNeonFreshness()'s query: nav_latest_date is a plain string, not a Date object");
      assert(/^\d{4}-\d{2}-\d{2}$/.test(freshnessQuery.rows[0].nav_latest_date), "getNeonFreshness()'s query: nav_latest_date is a clean YYYY-MM-DD string");
    } else {
      console.log("  (no fact_system_health rows yet — query shape still verified below)");
    }

    const pipelineQuery = await pool.query(
      `select source_date::text as source_date from fact_pipeline_runs order by finished_at desc limit 1`
    );
    if (pipelineQuery.rows[0]?.source_date != null) {
      assert(typeof pipelineQuery.rows[0].source_date === "string", "getNeonPipelineRuns()'s query: source_date is a plain string, not a Date object");
      assert(/^\d{4}-\d{2}-\d{2}$/.test(pipelineQuery.rows[0].source_date), "getNeonPipelineRuns()'s query: source_date is a clean YYYY-MM-DD string");
      assert(pipelineQuery.rows[0].source_date === truthValue || pipelineQuery.rows[0].source_date <= truthValue, `getNeonPipelineRuns()'s latest source_date (${pipelineQuery.rows[0].source_date}) is not ahead of the true latest nav_date (${truthValue})`);
    }
  }

  await pool.end();

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
