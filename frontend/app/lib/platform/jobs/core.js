// Background Job Platform core (Phase 4 M1) — a durable Postgres-backed queue on Neon.
// See sql/neon/012_job_platform.sql for the schema/status model and docs/JOB_PLATFORM.md for
// architecture, failure modes, and the handler-authoring guide.
//
// Execution semantics are AT-LEAST-ONCE: a job whose worker dies after the side effect but
// before completeJob() will run again once its lease expires. Every handler must therefore be
// idempotent — enforced by convention and by the conformance tests, not by this module.
import crypto from "node:crypto";
import { query } from "../../db.js";
import { getHandler } from "./registry.js";
import { computeBackoff } from "../retry/core.js";

const TERMINAL = new Set(["succeeded", "dead", "cancelled"]);

async function recordEvent(jobId, event, detail = {}) {
  await query(`insert into job_events (job_id, event, detail) values ($1, $2, $3)`, [
    jobId,
    event,
    JSON.stringify(detail),
  ]);
}

/**
 * Enqueue a job. Options:
 *   priority (1 most urgent … 9, default 5), delaySeconds | runAt (delayed jobs),
 *   maxAttempts, backoffBaseSeconds, backoffMaxSeconds, idempotencyKey, correlationId,
 *   scheduleId (set by runDueSchedules).
 * Returns { job, deduplicated } — with an idempotencyKey that already exists, the existing
 * job row is returned and nothing new is inserted (idempotent enqueue).
 */
export async function enqueueJob(type, payload = {}, opts = {}) {
  if (!type || typeof type !== "string") throw new Error("Job type is required.");
  const runAt = opts.runAt
    ? new Date(opts.runAt)
    : opts.delaySeconds
      ? new Date(Date.now() + opts.delaySeconds * 1000)
      : new Date();
  const r = await query(
    `insert into jobs (type, payload, priority, run_at, max_attempts,
                       backoff_base_seconds, backoff_max_seconds,
                       idempotency_key, correlation_id, schedule_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (idempotency_key) where idempotency_key is not null do nothing
     returning *`,
    [
      type,
      JSON.stringify(payload),
      opts.priority ?? 5,
      runAt.toISOString(),
      opts.maxAttempts ?? 5,
      opts.backoffBaseSeconds ?? 30,
      opts.backoffMaxSeconds ?? 3600,
      opts.idempotencyKey ?? null,
      opts.correlationId ?? null,
      opts.scheduleId ?? null,
    ]
  );
  if (r.rows[0]) {
    await recordEvent(r.rows[0].id, "enqueued", { type, priority: r.rows[0].priority, run_at: r.rows[0].run_at });
    return { job: r.rows[0], deduplicated: false };
  }
  const existing = await query(`select * from jobs where idempotency_key = $1`, [opts.idempotencyKey]);
  await recordEvent(existing.rows[0].id, "deduplicated", { attempted_type: type });
  return { job: existing.rows[0], deduplicated: true };
}

/**
 * Atomically claim up to `limit` due jobs for this worker. Safe under any number of
 * concurrent workers: FOR UPDATE SKIP LOCKED means two claimers can never take the same row,
 * and the status flip to 'running' happens in the same statement. attempts increments at
 * claim time — an attempt is "a worker started executing", whatever happens afterwards.
 */
export async function claimJobs(workerId, { limit = 5, leaseSeconds = 120 } = {}) {
  // The outer SELECT re-orders because UPDATE ... RETURNING has no guaranteed row order —
  // callers get the batch in true execution-priority order.
  const r = await query(
    `with due as (
       select id from jobs
       where status = 'queued' and run_at <= now()
       order by priority asc, run_at asc
       for update skip locked
       limit $2
     ),
     claimed as (
       update jobs j
       set status = 'running', locked_by = $1,
           lease_expires_at = now() + make_interval(secs => $3),
           started_at = coalesce(j.started_at, now()),
           attempts = j.attempts + 1, updated_at = now()
       from due where j.id = due.id
       returning j.*
     )
     select * from claimed order by priority asc, run_at asc`,
    [workerId, limit, leaseSeconds]
  );
  for (const job of r.rows) {
    await recordEvent(job.id, "claimed", { worker: workerId, attempt: job.attempts });
  }
  return r.rows;
}

/**
 * workerId must be the SAME id the caller claimed this job with (claimJobs' first arg) — see
 * the module header's at-least-once note: reclaimExpiredLeases can hand a job to a second
 * worker while a first, slow-but-still-alive worker is mid-execution. Without this fencing
 * check, the first worker's eventual completeJob()/failJob() call would silently steal the
 * second worker's claim (double-completing, or a stale result overwriting a fresher one).
 */
export async function completeJob(jobId, workerId, result = null) {
  const r = await query(
    `update jobs set status = 'succeeded', result = $3, finished_at = now(),
        locked_by = null, lease_expires_at = null, updated_at = now()
     where id = $1 and status = 'running' and locked_by = $2 returning *`,
    [jobId, workerId, result == null ? null : JSON.stringify(result)]
  );
  if (!r.rows[0]) {
    const cur = await query(`select status from jobs where id = $1`, [jobId]);
    if (!cur.rows[0] || cur.rows[0].status !== "running") {
      throw new Error(`completeJob: job ${jobId} is not running.`);
    }
    // Status IS running, but locked_by no longer matches workerId — a different worker now
    // owns this claim (a lease-reclaim race, not an error on this caller's part). No-op rather
    // than throw: this worker lost the race, it didn't do anything wrong.
    return { fenced: true, jobId };
  }
  await recordEvent(jobId, "succeeded", { result });
  return r.rows[0];
}

// Exponential backoff with ±25% jitter so a burst of same-time failures doesn't retry as a
// synchronized thundering herd. attempt is 1-based (the attempt that just failed). Delegates to
// the Phase 4.5 Retry Framework (see docs/RETRY_FRAMEWORK.md) — kept as its own named export
// here, unchanged, since job scheduling wants seconds (a future `run_at` row) while the shared
// module's other consumers (withRetry) want milliseconds; this is just the seconds-flavored call.
export function computeBackoffSeconds(attempt, baseSeconds, maxSeconds, random = Math.random) {
  return computeBackoff(attempt, { strategy: "exponential", base: baseSeconds, max: maxSeconds, random });
}

/**
 * Record a failed execution. Below max_attempts the job goes back to 'queued' with an
 * exponentially backed-off run_at (that IS the retry mechanism — there is no separate retry
 * table); at max_attempts it dead-letters ('dead', kept for inspection and manual requeue).
 */
/** See completeJob's own comment — workerId fences this against a lease-reclaim race the same way. */
export async function failJob(jobId, workerId, error) {
  const message = String(error?.message ?? error).slice(0, 2000);
  const cur = await query(`select * from jobs where id = $1`, [jobId]);
  const job = cur.rows[0];
  if (!job || job.status !== "running") throw new Error(`failJob: job ${jobId} is not running.`);
  if (job.attempts >= job.max_attempts) {
    const r = await query(
      `update jobs set status = 'dead', last_error = $2, finished_at = now(),
          locked_by = null, lease_expires_at = null, updated_at = now()
       where id = $1 and locked_by = $3 returning id`,
      [jobId, message, workerId]
    );
    if (!r.rows[0]) return { fenced: true, jobId };
    await recordEvent(jobId, "dead_lettered", { error: message, attempts: job.attempts });
    return { status: "dead" };
  }
  const delay = computeBackoffSeconds(job.attempts, job.backoff_base_seconds, job.backoff_max_seconds);
  const r = await query(
    `update jobs set status = 'queued', last_error = $2,
        run_at = now() + make_interval(secs => $3),
        locked_by = null, lease_expires_at = null, updated_at = now()
     where id = $1 and locked_by = $4 returning id`,
    [jobId, message, delay, workerId]
  );
  if (!r.rows[0]) return { fenced: true, jobId };
  await recordEvent(jobId, "retry_scheduled", { error: message, attempt: job.attempts, retry_in_seconds: delay });
  return { status: "queued", retryInSeconds: delay };
}

/**
 * Cancel a queued (incl. delayed) job. Running jobs are deliberately not cancellable — the
 * worker holding the lease may be mid-side-effect, and yanking the row out from under it
 * would turn "at least once" into "maybe half". Terminal jobs can't change either.
 */
export async function cancelJob(jobId) {
  const r = await query(
    `update jobs set status = 'cancelled', finished_at = now(), updated_at = now()
     where id = $1 and status = 'queued' returning *`,
    [jobId]
  );
  if (!r.rows[0]) {
    const cur = await query(`select status from jobs where id = $1`, [jobId]);
    const status = cur.rows[0]?.status ?? "missing";
    throw new Error(`Job cannot be cancelled from status '${status}' — only queued jobs can.`);
  }
  await recordEvent(jobId, "cancelled", {});
  return r.rows[0];
}

/**
 * Crash recovery: any 'running' job whose lease expired is presumed orphaned (its worker
 * died or was killed). Requeue it immediately — unless its attempts are already exhausted,
 * in which case it dead-letters with an explicit lease-expiry error.
 */
export async function reclaimExpiredLeases() {
  const requeued = await query(
    `update jobs set status = 'queued', locked_by = null, lease_expires_at = null,
        run_at = now(), updated_at = now()
     where status = 'running' and lease_expires_at < now() and attempts < max_attempts
     returning id, attempts`
  );
  for (const row of requeued.rows) {
    await recordEvent(row.id, "lease_reclaimed", { requeued: true, attempts: row.attempts });
  }
  const deadened = await query(
    `update jobs set status = 'dead', locked_by = null, lease_expires_at = null,
        last_error = 'Lease expired with attempts exhausted (worker died mid-execution).',
        finished_at = now(), updated_at = now()
     where status = 'running' and lease_expires_at < now() and attempts >= max_attempts
     returning id, attempts`
  );
  for (const row of deadened.rows) {
    await recordEvent(row.id, "dead_lettered", { via: "lease_reclaim", attempts: row.attempts });
  }
  return { requeued: requeued.rows.length, deadLettered: deadened.rows.length };
}

/** Requeue a dead-lettered job for a fresh round of attempts (operator action). */
export async function requeueDeadJob(jobId) {
  const r = await query(
    `update jobs set status = 'queued', attempts = 0, last_error = null, run_at = now(),
        finished_at = null, updated_at = now()
     where id = $1 and status = 'dead' returning *`,
    [jobId]
  );
  if (!r.rows[0]) throw new Error(`requeueDeadJob: job ${jobId} is not dead.`);
  await recordEvent(jobId, "enqueued", { via: "requeue_dead" });
  return r.rows[0];
}

// next occurrence of a 'HH:MM:SS' UTC time strictly after `from`
export function nextDailyOccurrence(dailyAt, from = new Date()) {
  const [h, m, s = "0"] = String(dailyAt).split(":");
  const next = new Date(from);
  next.setUTCHours(Number(h), Number(m), Number(s), 0);
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/**
 * Enqueue every due enabled schedule and advance its next_run_at. Double-enqueue safe two
 * ways: the row is claimed FOR UPDATE SKIP LOCKED (concurrent tickers skip it), and the job
 * carries idempotency_key `sched:<name>:<due next_run_at>` so even a crash between enqueue
 * and advance can't produce a second job for the same slot after restart.
 */
export async function runDueSchedules() {
  const due = await query(
    `select * from job_schedules where enabled and next_run_at <= now()
     order by next_run_at for update skip locked`
  );
  let enqueued = 0;
  for (const sched of due.rows) {
    const slot = new Date(sched.next_run_at).toISOString();
    const { deduplicated } = await enqueueJob(sched.job_type, sched.payload, {
      priority: sched.priority,
      maxAttempts: sched.max_attempts,
      idempotencyKey: `sched:${sched.name}:${slot}`,
      scheduleId: sched.id,
    });
    const nextRun = sched.interval_seconds
      ? new Date(Date.now() + sched.interval_seconds * 1000)
      : nextDailyOccurrence(sched.daily_at);
    await query(
      `update job_schedules set last_enqueued_at = now(), next_run_at = $2, updated_at = now()
       where id = $1`,
      [sched.id, nextRun.toISOString()]
    );
    if (!deduplicated) enqueued += 1;
  }
  return { due: due.rows.length, enqueued };
}

/**
 * One worker tick: recover orphans → enqueue due schedules → claim and execute jobs until
 * the queue is drained or the time budget is spent. This is the only function the GitHub
 * Actions worker (frontend/scripts/jobs_worker_tick.mjs) calls; API routes may also call it
 * for an on-demand drain. Overlapping ticks are safe by construction (SKIP LOCKED + leases).
 */
export async function runWorkerTick({
  workerId = `worker-${crypto.randomBytes(4).toString("hex")}`,
  maxJobs = 25,
  batchSize = 5,
  timeBudgetMs = 240_000,
  leaseSeconds = 300,
} = {}) {
  const startedAt = Date.now();
  const summary = { workerId, claimed: 0, succeeded: 0, retried: 0, deadLettered: 0 };
  const recovered = await reclaimExpiredLeases();
  summary.leasesRequeued = recovered.requeued;
  summary.leasesDeadLettered = recovered.deadLettered;
  const schedules = await runDueSchedules();
  summary.schedulesEnqueued = schedules.enqueued;

  while (summary.claimed < maxJobs && Date.now() - startedAt < timeBudgetMs) {
    const batch = await claimJobs(workerId, {
      limit: Math.min(batchSize, maxJobs - summary.claimed),
      leaseSeconds,
    });
    if (batch.length === 0) break;
    summary.claimed += batch.length;
    for (const job of batch) {
      const handler = getHandler(job.type);
      try {
        if (!handler) throw new Error(`No handler registered for job type '${job.type}'.`);
        const result = await handler(job.payload ?? {}, { job });
        const outcome = await completeJob(job.id, workerId, result ?? null);
        if (!outcome.fenced) summary.succeeded += 1;
      } catch (err) {
        const outcome = await failJob(job.id, workerId, err);
        if (outcome.fenced) {
          // lost the lease to a second worker mid-execution — not this worker's outcome to count
        } else if (outcome.status === "dead") summary.deadLettered += 1;
        else summary.retried += 1;
      }
    }
  }
  summary.elapsedMs = Date.now() - startedAt;
  return summary;
}

export async function getJob(jobId) {
  const r = await query(`select * from jobs where id = $1`, [jobId]);
  return r.rows[0] ?? null;
}

export async function getJobEvents(jobId) {
  const r = await query(`select * from job_events where job_id = $1 order by id`, [jobId]);
  return r.rows;
}

/** Aggregate queue metrics for observability surfaces. Counts only — never payloads. */
export async function getJobMetrics() {
  const [byStatus, oldest, lastHour, deadByType, schedules] = await Promise.all([
    query(`select status, count(*)::int as count from jobs group by status`),
    query(`select extract(epoch from (now() - min(run_at)))::int as oldest_due_seconds
           from jobs where status = 'queued' and run_at <= now()`),
    query(`select count(*) filter (where status = 'succeeded')::int as succeeded,
                  count(*) filter (where status = 'dead')::int as dead
           from jobs where finished_at > now() - interval '1 hour'`),
    query(`select type, count(*)::int as count from jobs where status = 'dead' group by type order by count desc limit 10`),
    query(`select name, job_type, enabled, last_enqueued_at, next_run_at from job_schedules order by name`),
  ]);
  const countsByStatus = {};
  for (const row of byStatus.rows) countsByStatus[row.status] = row.count;
  return {
    countsByStatus,
    oldestDueSeconds: oldest.rows[0]?.oldest_due_seconds ?? null,
    lastHour: lastHour.rows[0],
    deadByType: deadByType.rows,
    schedules: schedules.rows,
  };
}

export function isTerminalStatus(status) {
  return TERMINAL.has(status);
}
