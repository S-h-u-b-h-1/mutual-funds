// Test-only helper. NOT imported by any production code path.
//
// jobPlatform.test.js and webhookPlatform.test.js both call claimJobs()/runWorkerTick()
// against the real, shared `jobs` table — correctly, since that's exactly what production
// workers do (claim ANY due row, not just "mine"). Run as separate files under Vitest's
// default file-level parallelism, though, the two can race each other: one file's claim can
// land on a row the other file's cleanup deletes in the same instant (job_events FK
// violation), or steal a job the other file's own runWorkerTick() call was waiting to process.
//
// Fix: a Postgres advisory lock, held for each file's entire run, so the two files serialize
// against EACH OTHER without touching Vitest's scheduler or slowing down the other 36 files
// that never call claimJobs(). Advisory locks are session-scoped, so this uses its own
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
const MAX_WAIT_MS = 180_000;
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
          "Either jobPlatform.test.js/webhookPlatform.test.js are both genuinely still running, " +
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
