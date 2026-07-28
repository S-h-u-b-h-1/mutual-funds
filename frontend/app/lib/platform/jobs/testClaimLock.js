// Test-only helper. NOT imported by any production code path.
//
// Any test file that calls claimJobs()/runWorkerTick() (jobPlatform.test.js,
// webhookPlatform.test.js, eventBus.test.js, notifications/core.test.js, and any future one)
// touches the real, shared `jobs` table — correctly, since that's exactly what production
// workers do (claim ANY due row, not just "mine"). Run as separate files under Vitest's default
// file-level parallelism, though, they can race each other: one file's claim can land on a row
// another file's cleanup deletes in the same instant (job_events FK violation), or steal a job
// another file's own runWorkerTick() call was waiting to process.
//
// Membership test: does this file call claimJobs()/runWorkerTick() itself in a way that asserts
// on WHICH jobs got claimed (not idIn/typeLike-scoped)? If yes, it needs this lock. If a file
// only ENQUEUES jobs (e.g. via a real route call's emitEvent() side effect) and never claims,
// it does NOT need this lock — see the 2026-07-28 incident below for why that distinction
// matters and isn't obvious.
//
// 2026-07-28 incident (kept for the next person who hits this): journey1-onboarding.e2e.test.js
// briefly joined this group after jobPlatform.test.js's "drains the queue" test came back with
// 0 succeeded jobs instead of >=2 while journey1 ran concurrently — journey1 enqueues real
// event-dispatch jobs via 8+ real route calls and doesn't drain them until its own afterAll, so
// its backlog was still sitting `queued` mid-run, available for jobPlatform.test.js's own
// UNFILTERED runWorkerTick({maxJobs:50}) call to exhaust its budget on before ever reaching its
// own freshly-enqueued jobs. Adding journey1 to this lock fixed that specific symptom but was
// the wrong root-cause fix: it only serializes journey1 against the 4 files already here, not
// against the many OTHER integration test files that also drive real identityService/
// complianceService/orderService/portfolioService/documentService calls and enqueue the exact
// same kind of job (confirmed: the SAME failure reappeared in a full-suite run with journey1
// correctly locked, because a different file was the real interloper that time). Growing this
// lock group file-by-file every time a new interloper is found doesn't scale — it just keeps
// pushing the group's total serialized time up (it had already reached ~700s+ before this was
// caught). The actual fix: scope every claiming test's own runWorkerTick()/claimJobs() calls to
// idIn (the specific job ids it created), which the job platform's own claimJobs() already
// supports precisely for this (see core.js's own doc comment: "added for the test suite's
// disposable-run isolation"). Once a file only ever asks for ITS OWN job ids, no other file's
// ambient queue activity — however much of it there is, whoever's causing it — can affect its
// correctness. journey1 was removed from this group again once jobPlatform.test.js's two
// previously-unfiltered tests (and eventBus.test.js's three) were fixed this way.
//
// Fix: a Postgres advisory lock, held for each file's entire run, so every file that acquires
// it serializes against every OTHER file that does, without touching Vitest's scheduler or
// slowing down the files that never call claimJobs(). Advisory locks are session-scoped, so this uses its own
// dedicated `pg.Client` rather than the app's pooled query() helper — a lock acquired on one
// pooled connection would be invisible to an unlock issued on a different one.
//
// That dedicated client must NOT point at the `-pooler` host, though. Neon's pooled endpoint
// runs PgBouncer in transaction-pooling mode (confirmed via list_branch_computes:
// pooler_mode: "transaction"), which does not guarantee the same backend session across
// separate statements from one client — even a single dedicated pg.Client can have its
// pg_try_advisory_lock() and later queries silently routed to DIFFERENT backends. The lock
// then "sometimes" holds depending on how PgBouncer happens to multiplex that connection,
// which is exactly the intermittent, hard-to-reproduce flake this was built to fix in the
// first place (proven experimentally: webhookPlatform.test.js's end-to-end test was 100%
// reliable alone or fully isolated from jobPlatform.test.js, but flaked when run alongside it
// even WITH this lock in place, until switching off the pooler here). Deriving the direct
// host from DATABASE_URL — rather than a second hardcoded connection string — means this
// keeps following whatever branch/project DATABASE_URL already points at.
//
// A plain blocking pg_advisory_lock() has a real failure mode: if a run holding the lock is
// killed abnormally (a CI timeout, Ctrl+C, an OOM kill) rather than exiting normally, its
// connection dies WITHOUT running afterAll/releaseClaimTestLock() — but the lock itself is
// tied to that Postgres backend, not to the Node process, so Postgres holds it until that
// backend's connection is reaped. Every future run then blocks silently, indistinguishable
// from a slow-but-healthy wait, until something notices and manually terminates the stray
// backend (`select pg_terminate_backend(pid) ... where locktype='advisory'`). Polling with
// pg_try_advisory_lock() + a bounded max wait turns that silent hang into a clear, actionable
// error instead.
import pg from "pg";

const LOCK_KEY = 847_331_009; // arbitrary constant, just needs to match between both call sites
// eventBus.test.js's real-wiring tests (makeInvestmentReadyUser + a full order lifecycle) run up
// to 180s EACH under real contention, and its own afterAll now runs a final drain on top of that
// (see its comment) before releasing the lock — so whichever file holds the lock can legitimately
// occupy it for several hundred seconds. 180s (sized for the original two-file M1-era pairing)
// was proven too short once M4 joined this same lock group: a real run had jobPlatform.test.js
// time out waiting while eventBus.test.js was still legitimately running. Sized with real
// headroom above today's worst-case sum (180+180+120+drain+small tests ≈ 525s) across the 4
// files that actually need this lock (see the file-level comment above for why journey1-
// onboarding.e2e.test.js is NOT among them despite briefly joining on 2026-07-28).
const MAX_WAIT_MS = 600_000;
const POLL_INTERVAL_MS = 500;

function directConnectionString() {
  return String(process.env.DATABASE_URL).replace(/^(postgres(?:ql)?:\/\/[^@]+@[^.]+)-pooler(\.)/, "$1$2");
}

let client;

export async function acquireClaimTestLock() {
  client = new pg.Client({ connectionString: directConnectionString() });
  await client.connect();
  const deadline = Date.now() + MAX_WAIT_MS;
  for (;;) {
    const r = await client.query("select pg_try_advisory_lock($1) as got", [LOCK_KEY]);
    if (r.rows[0].got) return;
    if (Date.now() > deadline) {
      await client.end();
      client = undefined;
      throw new Error(
        `acquireClaimTestLock: could not acquire advisory lock ${LOCK_KEY} within ${MAX_WAIT_MS}ms. ` +
          "Either jobPlatform.test.js/webhookPlatform.test.js/eventBus.test.js are both genuinely still running, " +
          "or an earlier run was killed abnormally and left its lock orphaned — check " +
          "`select l.pid, a.state, now() - a.state_change as idle_for from pg_locks l " +
          "join pg_stat_activity a on a.pid = l.pid where l.locktype = 'advisory'` " +
          `and pg_terminate_backend() the stray pid holding objid ${LOCK_KEY} if it's idle.`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export async function releaseClaimTestLock() {
  if (!client) return;
  await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
  await client.end();
  client = undefined;
}
