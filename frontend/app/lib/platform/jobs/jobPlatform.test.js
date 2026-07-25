// Background Job Platform integration tests (Phase 4 M1) — real Neon, no mocks of the queue
// itself. Every test type is namespaced 'test-…' and cleaned up afterwards, so runs are safe
// against the production database (same disposable-rows discipline as the invest suites).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { query } from "../../db.js";
import {
  enqueueJob,
  claimJobs,
  completeJob,
  failJob,
  cancelJob,
  reclaimExpiredLeases,
  requeueDeadJob,
  computeBackoffSeconds,
  nextDailyOccurrence,
  runDueSchedules,
  runWorkerTick,
  getJob,
  getJobEvents,
  getJobMetrics,
} from "./core.js";
import { registerHandler } from "./registry.js";
import { vaultRetentionSweep } from "./handlers/vaultRetentionSweep.js";
import { jobHistoryPrune, ROUTINE_RETENTION_DAYS, DEAD_RETENTION_DAYS } from "./handlers/jobHistoryPrune.js";
// Full production handler set (webhooks/reconciliation/event-dispatch), not just this file's own
// two handlers. runWorkerTick() below claims from the SAME shared `jobs` table that other test
// files' real service calls (M2/M3/M4) can leave due rows in — without every real handler
// registered, a claimed stranger fails with "No handler registered for job type ..." instead of
// running (or harmlessly no-op'ing) on its own merits, which both corrupts this file's precise
// claim-count assertions and dead-letters jobs that a correctly-equipped worker would process fine.
import "./handlers/index.js";
import { acquireClaimTestLock, releaseClaimTestLock } from "./testClaimLock.js";

const RUN = crypto.randomBytes(3).toString("hex");
const T = (name) => `test-${RUN}-${name}`;
const W = `test-worker-${RUN}`;

async function cleanup() {
  await query(`delete from jobs where type like $1`, [`test-${RUN}-%`]);
  await query(`delete from job_schedules where name like $1`, [`test-${RUN}-%`]);
}

// Claim only this run's jobs — the production queue may hold real due jobs during a test run
// (e.g. undrained event-dispatch jobs from other files' makeInvestmentReadyUser() calls), and
// tests must neither steal them nor be confused by them. Filtered at the SQL level (claimJobs'
// typeLike option) rather than over-claiming and sorting client-side: under the full suite's
// true concurrency, claiming a batch that includes foreign rows and then releasing the ones
// that don't match is itself an amplifier — every foreign row claimed costs an extra write to
// put back, and a first attempt at over-claiming with a fixed headroom (limit+20, then an
// unbounded claim-and-park loop) both proved insufficient or too expensive under real noise
// volume (measured: a full-suite run needed more than 21 headroom, and the loop's extra round
// trips were enough to start timing out unrelated files' own Neon connections). Since Postgres
// never even considers non-matching rows with a WHERE-clause filter, this is both correct
// regardless of how much foreign noise exists AND touches only this run's own rows.
async function claimOwn({ limit = 10, leaseSeconds = 120 } = {}) {
  return claimJobs(W, { limit, leaseSeconds, typeLike: `test-${RUN}-%` });
}

beforeAll(async () => {
  // See testClaimLock.js: this file and webhookPlatform.test.js both claim from the shared
  // `jobs` table and race each other under Vitest's file-level parallelism without this.
  await acquireClaimTestLock();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await releaseClaimTestLock();
});

describe("job platform (integration, real Neon)", () => {
  describe("enqueue", () => {
    it("enqueues with defaults and records an 'enqueued' event", async () => {
      const { job, deduplicated } = await enqueueJob(T("basic"), { a: 1 });
      expect(deduplicated).toBe(false);
      expect(job.status).toBe("queued");
      expect(job.priority).toBe(5);
      expect(job.attempts).toBe(0);
      const events = await getJobEvents(job.id);
      expect(events.map((e) => e.event)).toEqual(["enqueued"]);
    });

    it("idempotency_key makes enqueue idempotent — second call returns the SAME job, no new row", async () => {
      const key = T("idem-key");
      const first = await enqueueJob(T("idem"), { n: 1 }, { idempotencyKey: key });
      const second = await enqueueJob(T("idem"), { n: 2 }, { idempotencyKey: key });
      expect(second.deduplicated).toBe(true);
      expect(second.job.id).toBe(first.job.id);
      const rows = await query(`select count(*)::int as c from jobs where idempotency_key = $1`, [key]);
      expect(rows.rows[0].c).toBe(1);
      const events = await getJobEvents(first.job.id);
      expect(events.map((e) => e.event)).toEqual(["enqueued", "deduplicated"]);
    });

    it("rejects a missing type before touching the database", async () => {
      await expect(enqueueJob("", {})).rejects.toThrow(/type is required/i);
    });
  });

  describe("claiming", () => {
    it("claims by priority first, then run_at, and marks running with a lease + attempt count", async () => {
      await enqueueJob(T("claim"), { which: "low" }, { priority: 7 });
      await enqueueJob(T("claim"), { which: "urgent" }, { priority: 1 });
      // claimOwn may also pick up this run's earlier still-queued jobs — filter to this test's
      // type; the returned batch is ordered by (priority, run_at), so urgent must precede low.
      const mine = await claimOwn({ limit: 10 });
      const claimTyped = mine.filter((j) => j.type === T("claim"));
      expect(claimTyped.length).toBe(2);
      expect(claimTyped[0].payload.which).toBe("urgent");
      expect(claimTyped[1].payload.which).toBe("low");
      expect(claimTyped[0].status).toBe("running");
      expect(claimTyped[0].attempts).toBe(1);
      expect(new Date(claimTyped[0].lease_expires_at).getTime()).toBeGreaterThan(Date.now());
      for (const j of mine) await completeJob(j.id, W);
    });

    it("a delayed job (future run_at) is not claimable before its time", async () => {
      const { job } = await enqueueJob(T("delayed"), {}, { delaySeconds: 3600 });
      const mine = await claimOwn();
      expect(mine.find((j) => j.id === job.id)).toBeUndefined();
      const fresh = await getJob(job.id);
      expect(fresh.status).toBe("queued");
      await cancelJob(job.id);
    });

    it("a claimed (running) job cannot be claimed again by another worker", async () => {
      const { job } = await enqueueJob(T("exclusive"), {});
      const mine = await claimOwn();
      expect(mine.map((j) => j.id)).toContain(job.id);
      const again = await claimJobs(`${W}-2`, { limit: 50 });
      expect(again.find((j) => j.id === job.id)).toBeUndefined();
      // restore any strangers that -2 grabbed
      for (const j of again) {
        await query(
          `update jobs set status = 'queued', locked_by = null, lease_expires_at = null,
              attempts = attempts - 1, updated_at = now() where id = $1`,
          [j.id]
        );
      }
      await completeJob(job.id, W);
    });
  });

  describe("completion, retry, dead-letter", () => {
    it("completeJob → succeeded with result + event; completing a non-running job throws", async () => {
      const { job } = await enqueueJob(T("done"), {});
      const [claimed] = await claimOwn({ limit: 1 });
      const done = await completeJob(claimed.id, W, { ok: true });
      expect(done.status).toBe("succeeded");
      expect(done.result.ok).toBe(true);
      expect(done.finished_at).not.toBeNull();
      await expect(completeJob(job.id, W)).rejects.toThrow(/not running/);
      const events = await getJobEvents(job.id);
      expect(events.at(-1).event).toBe("succeeded");
    });

    it("completeJob/failJob are fenced to the claiming worker — a second worker's call on a job it doesn't hold the lease for is a no-op, not a steal", async () => {
      const { job } = await enqueueJob(T("fence"), {});
      const [claimed] = await claimOwn({ limit: 1 });
      expect(claimed.id).toBe(job.id);
      // A worker id that never actually claimed this job (simulating the lease-reclaim race:
      // a second worker picked it up after this job's real lease expired while the first worker
      // was still mid-execution) must not be able to complete or fail it out from under the
      // real owner.
      const impostor = `${W}-impostor`;
      const completeResult = await completeJob(job.id, impostor, { ok: true });
      expect(completeResult.fenced).toBe(true);
      const stillRunning = await getJob(job.id);
      expect(stillRunning.status).toBe("running");
      expect(stillRunning.locked_by).toBe(W);

      const failResult = await failJob(job.id, impostor, new Error("impostor failure"));
      expect(failResult.fenced).toBe(true);
      const stillRunning2 = await getJob(job.id);
      expect(stillRunning2.status).toBe("running"); // impostor's failJob call had zero effect
      expect(stillRunning2.last_error).toBeNull();

      // the REAL owner can still complete it normally
      const done = await completeJob(job.id, W, { ok: true });
      expect(done.status).toBe("succeeded");
    });

    it("failJob below max_attempts requeues with exponential backoff and a retry_scheduled event", async () => {
      const { job } = await enqueueJob(T("retry"), {}, { backoffBaseSeconds: 40, backoffMaxSeconds: 3600 });
      const [claimed] = await claimOwn({ limit: 1 });
      expect(claimed.id).toBe(job.id);
      const outcome = await failJob(job.id, W, new Error("transient provider failure"));
      expect(outcome.status).toBe("queued");
      // attempt 1, base 40 → exact 40s, ±25% jitter → [30, 50]
      expect(outcome.retryInSeconds).toBeGreaterThanOrEqual(30);
      expect(outcome.retryInSeconds).toBeLessThanOrEqual(50);
      const fresh = await getJob(job.id);
      expect(fresh.status).toBe("queued");
      expect(fresh.last_error).toMatch(/transient provider failure/);
      expect(new Date(fresh.run_at).getTime()).toBeGreaterThan(Date.now() + 25_000);
      const events = await getJobEvents(job.id);
      expect(events.at(-1).event).toBe("retry_scheduled");
      await query(`update jobs set run_at = now() where id = $1`, [job.id]);
      const [reclaimed] = await claimOwn({ limit: 1 });
      await completeJob(reclaimed.id, W);
    });

    it("failJob at max_attempts dead-letters (the DLQ), and requeueDeadJob revives it", async () => {
      const { job } = await enqueueJob(T("dlq"), {}, { maxAttempts: 1 });
      await claimOwn({ limit: 1 });
      const outcome = await failJob(job.id, W, new Error("hard failure"));
      expect(outcome.status).toBe("dead");
      const dead = await getJob(job.id);
      expect(dead.status).toBe("dead");
      expect(dead.finished_at).not.toBeNull();
      const events = await getJobEvents(job.id);
      expect(events.at(-1).event).toBe("dead_lettered");
      const revived = await requeueDeadJob(job.id);
      expect(revived.status).toBe("queued");
      expect(revived.attempts).toBe(0);
      await cancelJob(job.id);
    });

    it("computeBackoffSeconds grows exponentially and caps at max (jitter bounded ±25%)", () => {
      const noJitter = () => 0.5; // random 0.5 → jitter 0
      expect(computeBackoffSeconds(1, 30, 3600, noJitter)).toBe(30);
      expect(computeBackoffSeconds(2, 30, 3600, noJitter)).toBe(60);
      expect(computeBackoffSeconds(5, 30, 3600, noJitter)).toBe(480);
      expect(computeBackoffSeconds(12, 30, 3600, noJitter)).toBe(3600); // capped
      const jittered = computeBackoffSeconds(1, 100, 3600);
      expect(jittered).toBeGreaterThanOrEqual(75);
      expect(jittered).toBeLessThanOrEqual(125);
    });
  });

  describe("cancellation", () => {
    it("cancels a queued job; refuses running and terminal jobs", async () => {
      const { job } = await enqueueJob(T("cancel"), {}, { delaySeconds: 3600 });
      const cancelled = await cancelJob(job.id);
      expect(cancelled.status).toBe("cancelled");
      await expect(cancelJob(job.id)).rejects.toThrow(/status 'cancelled'/);
      const { job: runningJob } = await enqueueJob(T("cancel"), {});
      await claimOwn({ limit: 1 });
      await expect(cancelJob(runningJob.id)).rejects.toThrow(/status 'running'/);
      await completeJob(runningJob.id, W);
    });
  });

  describe("lease recovery (worker crash)", () => {
    it("requeues an orphaned running job whose lease expired; dead-letters if attempts are exhausted", async () => {
      const { job: orphan } = await enqueueJob(T("orphan"), {});
      const { job: doomed } = await enqueueJob(T("orphan"), {}, { maxAttempts: 1 });
      await claimOwn({ limit: 2 });
      // simulate a dead worker: lease is in the past
      await query(`update jobs set lease_expires_at = now() - interval '1 minute' where id in ($1, $2)`, [orphan.id, doomed.id]);
      await reclaimExpiredLeases();
      const o = await getJob(orphan.id);
      const d = await getJob(doomed.id);
      expect(o.status).toBe("queued");
      expect(o.locked_by).toBeNull();
      expect(d.status).toBe("dead");
      expect(d.last_error).toMatch(/lease expired/i);
      expect((await getJobEvents(orphan.id)).at(-1).event).toBe("lease_reclaimed");
      await cancelJob(orphan.id);
    });
  });

  describe("recurring schedules", () => {
    it("runDueSchedules enqueues a due schedule exactly once per slot (idempotency key) and advances next_run_at", async () => {
      const name = T("sched-interval");
      await query(
        `insert into job_schedules (name, job_type, interval_seconds, next_run_at)
         values ($1, $2, 300, now() - interval '1 second')`,
        [name, T("sched-job")]
      );
      const first = await runDueSchedules();
      expect(first.enqueued).toBeGreaterThanOrEqual(1);
      const jobs1 = await query(`select * from jobs where type = $1`, [T("sched-job")]);
      expect(jobs1.rows.length).toBe(1);
      expect(jobs1.rows[0].schedule_id).not.toBeNull();
      const sched = await query(`select * from job_schedules where name = $1`, [name]);
      expect(new Date(sched.rows[0].next_run_at).getTime()).toBeGreaterThan(Date.now() + 250_000);
      expect(sched.rows[0].last_enqueued_at).not.toBeNull();
      // second sweep in the same window: schedule no longer due → nothing new
      const second = await runDueSchedules();
      const jobs2 = await query(`select count(*)::int as c from jobs where type = $1`, [T("sched-job")]);
      expect(jobs2.rows[0].c).toBe(1);
      expect(second.due).toBe(0);
    });

    it("a crash between enqueue and advance cannot double-enqueue the same slot (idempotency key catches it)", async () => {
      const name = T("sched-crash");
      await query(
        `insert into job_schedules (name, job_type, interval_seconds, next_run_at)
         values ($1, $2, 300, now() - interval '1 second')`,
        [name, T("sched-crash-job")]
      );
      await runDueSchedules();
      // simulate the crash: rewind next_run_at to the exact same slot as if the advance was lost
      const slot = await query(`select last_enqueued_at from job_schedules where name = $1`, [name]);
      expect(slot.rows[0].last_enqueued_at).not.toBeNull();
      const jobRow = await query(`select idempotency_key from jobs where type = $1`, [T("sched-crash-job")]);
      const originalKey = jobRow.rows[0].idempotency_key;
      // key shape is sched:<name>:<ISO slot> — the ISO timestamp itself contains colons, so
      // strip the known prefix instead of splitting on ':'
      const originalSlot = originalKey.slice(`sched:${name}:`.length);
      await query(`update job_schedules set next_run_at = $2 where name = $1`, [name, originalSlot]);
      const rerun = await runDueSchedules();
      expect(rerun.enqueued).toBe(0); // deduplicated, not enqueued
      const count = await query(`select count(*)::int as c from jobs where type = $1`, [T("sched-crash-job")]);
      expect(count.rows[0].c).toBe(1);
    });

    it("nextDailyOccurrence picks today's slot if still ahead, else tomorrow's (UTC)", () => {
      const from = new Date("2026-07-20T10:00:00Z");
      expect(nextDailyOccurrence("11:30:00", from).toISOString()).toBe("2026-07-20T11:30:00.000Z");
      expect(nextDailyOccurrence("09:00:00", from).toISOString()).toBe("2026-07-21T09:00:00.000Z");
    });
  });

  describe("runWorkerTick (end-to-end)", () => {
    it("drains the queue: succeeds good jobs, retries a flaky one, dead-letters an unknown type", async () => {
      // Deliberately calls the real, unfiltered runWorkerTick() (not claimOwn()) — the point of
      // this test is the real drain behavior, and its assertions already tolerate extra due jobs
      // succeeding alongside via toBeGreaterThanOrEqual. Under the full suite's true concurrency
      // that can mean genuinely draining a meaningful amount of other files' foreign due jobs
      // (e.g. undrained event-dispatch jobs) within maxJobs's budget, which the global 45s
      // testTimeout isn't sized for — this failed on a timeout, not a wrong assertion, in a real
      // full-suite run.
      let flakyCalls = 0;
      registerHandler(T("ok"), async (payload) => ({ echoed: payload.n }));
      registerHandler(T("flaky"), async () => {
        flakyCalls += 1;
        if (flakyCalls === 1) throw new Error("first attempt fails");
        return { recoveredOnAttempt: flakyCalls };
      });
      await enqueueJob(T("ok"), { n: 1 });
      await enqueueJob(T("ok"), { n: 2 });
      const { job: flakyJob } = await enqueueJob(T("flaky"), {}, { backoffBaseSeconds: 30 });
      const { job: unknownJob } = await enqueueJob(T("no-handler"), {}, { maxAttempts: 1 });

      const tick1 = await runWorkerTick({ workerId: W, maxJobs: 50 });
      expect(tick1.succeeded).toBeGreaterThanOrEqual(2);
      expect(tick1.retried).toBeGreaterThanOrEqual(1);
      expect(tick1.deadLettered).toBeGreaterThanOrEqual(1);

      const unknown = await getJob(unknownJob.id);
      expect(unknown.status).toBe("dead");
      expect(unknown.last_error).toMatch(/No handler registered/);

      // flaky job is queued for retry with backoff — pull it forward and tick again
      const flakyMid = await getJob(flakyJob.id);
      expect(flakyMid.status).toBe("queued");
      await query(`update jobs set run_at = now() where id = $1`, [flakyJob.id]);
      const tick2 = await runWorkerTick({ workerId: W, maxJobs: 50 });
      expect(tick2.succeeded).toBeGreaterThanOrEqual(1);
      const flakyDone = await getJob(flakyJob.id);
      expect(flakyDone.status).toBe("succeeded");
      expect(flakyDone.result.recoveredOnAttempt).toBe(2);
      expect(flakyDone.attempts).toBe(2);
    }, 120000);

    it("respects maxJobs as a hard claim ceiling", async () => {
      registerHandler(T("bulk"), async () => ({}));
      for (let i = 0; i < 5; i += 1) await enqueueJob(T("bulk"), { i });
      const tick = await runWorkerTick({ workerId: W, maxJobs: 2, batchSize: 2 });
      expect(tick.claimed).toBeLessThanOrEqual(2);
      // drain the rest so cleanup stays simple
      await runWorkerTick({ workerId: W, maxJobs: 50 });
    });
  });

  describe("real handlers", () => {
    it("vault-retention-sweep expires overdue documents, writes a timeline event, and is idempotent", async () => {
      const email = `invest-test-jobs-${RUN}@mfpulse.test`;
      const user = await query(`insert into users (name, email) values ('Jobs Test', $1) returning id`, [email]);
      const userId = user.rows[0].id;
      try {
        const doc = await query(
          `insert into documents (user_id, category, doc_type, title, source, provider, storage_ref, mime_type, status, expires_at)
           values ($1, 'statements', 'account_statement', 'Expiring statement', 'mock-generated', 'test', $2, 'application/pdf', 'generated', now() - interval '1 day')
           returning id`,
          [userId, `doc_test_${RUN}`]
        );
        const first = await vaultRetentionSweep();
        expect(first.expired).toBeGreaterThanOrEqual(1);
        const fresh = await query(`select status from documents where id = $1`, [doc.rows[0].id]);
        expect(fresh.rows[0].status).toBe("expired");
        const events = await query(
          `select event_type from document_events where document_id = $1 order by id`,
          [doc.rows[0].id]
        );
        expect(events.rows.at(-1).event_type).toBe("expired");
        const second = await vaultRetentionSweep();
        const stillOne = await query(
          `select count(*)::int as c from document_events where document_id = $1 and event_type = 'expired'`,
          [doc.rows[0].id]
        );
        expect(stillOne.rows[0].c).toBe(1); // second sweep did not double-fire
        expect(second.expired).toBe(0);
      } finally {
        await query(`delete from users where id = $1`, [userId]);
      }
    });

    it("job-history-prune deletes old routine jobs, keeps recent ones and young dead ones", async () => {
      const mk = async (status, daysAgo) => {
        const r = await query(
          `insert into jobs (type, status, finished_at, attempts)
           values ($1, $2, now() - make_interval(days => $3), 1) returning id`,
          [T("prunable"), status, daysAgo]
        );
        return r.rows[0].id;
      };
      const oldSucceeded = await mk("succeeded", ROUTINE_RETENTION_DAYS + 5);
      const freshSucceeded = await mk("succeeded", 1);
      const youngDead = await mk("dead", ROUTINE_RETENTION_DAYS + 5); // old for routine, young for dead
      const ancientDead = await mk("dead", DEAD_RETENTION_DAYS + 5);
      const result = await jobHistoryPrune();
      expect(result.prunedRoutine).toBeGreaterThanOrEqual(1);
      expect(result.prunedDead).toBeGreaterThanOrEqual(1);
      const survivors = await query(`select id from jobs where type = $1`, [T("prunable")]);
      const ids = survivors.rows.map((r) => r.id);
      expect(ids).toContain(freshSucceeded);
      expect(ids).toContain(youngDead);
      expect(ids).not.toContain(oldSucceeded);
      expect(ids).not.toContain(ancientDead);
    });
  });

  describe("metrics", () => {
    it("returns aggregate counts, schedule state, and never leaks payloads", async () => {
      const metrics = await getJobMetrics();
      expect(metrics.countsByStatus).toBeTypeOf("object");
      expect(Array.isArray(metrics.schedules)).toBe(true);
      const seeded = metrics.schedules.map((s) => s.name);
      expect(seeded).toContain("vault-retention-sweep-daily");
      expect(seeded).toContain("job-history-prune-daily");
      expect(JSON.stringify(metrics)).not.toMatch(/payload/);
    });
  });
});
