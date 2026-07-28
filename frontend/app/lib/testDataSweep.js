// Test-only helper. NOT imported by any production code path (only vitest.globalSetup.js calls
// this). Runs once, before any test file, right after assertSafeTestDatabase() has already
// confirmed the connected database is the dedicated "test" branch — never production.
//
// Why this exists: individual test files are supposed to clean up everything they create
// (unique-run-id-scoped rows, cleanup in finally/afterAll), and mostly do — but a killed process,
// a genuine assertion failure hit mid-test (before its own cleanup line runs), or a file that
// simply doesn't scope its cleanup correctly all leave real rows behind on the shared test
// branch. Investigated 2026-07-28: found 737 stale queued `jobs` rows (mostly
// webhook-outbound-deliver/event-dispatch backlog going back to 2026-07-21) and 21 leftover
// `@mfpulse.test` users from the same window, PLUS a genuine bug in eventBus.test.js's own
// outbound-webhook test (its cleanup line sat after its assertions but not inside `finally`, so
// any assertion failure skipped it — fixed separately, see that file's own comment).
//
// This does NOT replace per-test cleanup (still the first line of defense — cheaper, and doesn't
// need an age threshold since it runs right after the row was created) — it's a second, coarser
// safety net so the branch self-heals before every fresh suite run regardless of how a prior run
// ended. Age-thresholded, not an unconditional wipe: a genuinely concurrent second `vitest run`
// against the same branch (two CI jobs racing, unlikely but not impossible) could have rows
// younger than the threshold still legitimately in flight — those are left alone.
//
// Uses its own dedicated pg.Client rather than db.js's pooled query() helper: this runs once in
// Vitest's separate global-setup process (not a per-worker test process), so there's no natural
// point later where db.js's module-level pool would ever get closed — left open, it would just
// keep that process's event loop alive. A client this function opens and ends itself has a clean,
// fully-owned lifecycle instead.
import pg from "pg";

const STALE_AFTER = "2 hours";

export async function sweepStaleTestData() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    // Jobs table: this branch never carries real production traffic (it's test-suite-only), so
    // age alone is a safe, sufficient filter — no test-specific type/prefix matching needed.
    // job_events cascades automatically (job_events_job_id_fkey is ON DELETE CASCADE).
    const jobs = await client.query(`delete from jobs where created_at < now() - interval '${STALE_AFTER}' returning id`);

    // Users: scoped to the EXACT synthetic domain testHelpers.js's createTestUser() always uses
    // (mfpulse.test — an RFC 2606 reserved test TLD, guaranteed to never collide with a real
    // address). Deliberately narrower than a "test-%" prefix match: the test branch was forked
    // from production and can carry real-looking rows (confirmed: a handful of @gmail.com/
    // @example.com addresses, at least one that reads as a real person's account) that a looser
    // pattern could wrongly catch.
    const users = await client.query(
      `delete from users where email like '%@mfpulse.test' and created_at < now() - interval '${STALE_AFTER}' returning id`
    );

    // Outbound webhook listeners: every test-created one is named test-<hex>-<suffix> (see
    // eventBus.test.js/webhookPlatform.test.js) — real, product-configured listeners never start
    // with "test-".
    const webhooks = await client.query(
      `delete from webhook_outbound where name like 'test-%' and created_at < now() - interval '${STALE_AFTER}' returning id`
    );

    return { jobsDeleted: jobs.rows.length, usersDeleted: users.rows.length, webhookListenersDeleted: webhooks.rows.length };
  } finally {
    await client.end();
  }
}
