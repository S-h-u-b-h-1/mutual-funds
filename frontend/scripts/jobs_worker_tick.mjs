#!/usr/bin/env node
// One worker tick against the production queue — the entry point .github/workflows/jobs-worker.yml
// runs on cron. Requires DATABASE_URL. Prints a JSON summary (parsed by the workflow log) and
// exits non-zero only on infrastructure failure (can't reach the DB / tick itself threw) — jobs
// that fail are NOT an infrastructure failure; they retry via backoff and eventually dead-letter,
// which is queue-visible state, not a worker crash.
//
// Overlap with another tick (e.g. a manually dispatched run alongside cron) is safe:
// claiming is FOR UPDATE SKIP LOCKED and crash recovery is lease-based (core.js).
import "../app/lib/platform/jobs/handlers/index.js";
import { runWorkerTick } from "../app/lib/platform/jobs/core.js";

const summary = await runWorkerTick({
  workerId: `gh-${process.env.GITHUB_RUN_ID ?? "local"}`,
  maxJobs: Number(process.env.JOBS_MAX_PER_TICK ?? 50),
  timeBudgetMs: Number(process.env.JOBS_TICK_BUDGET_MS ?? 240_000),
});

console.log(JSON.stringify(summary));
if (summary.deadLettered > 0) {
  console.error(`::warning::${summary.deadLettered} job(s) dead-lettered this tick — inspect the DLQ via /api/internal/jobs/status.`);
}
process.exit(0);
