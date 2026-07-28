// Runs once before the entire test run starts, before any test file (or its beforeAll) executes.
// See app/lib/testDbGuard.js for the actual check and docs/TEST_DATABASE_AND_CI.md for why this
// exists. A thrown error here aborts the whole run before a single connection is opened.
import { assertSafeTestDatabase } from "./app/lib/testDbGuard.js";
import { sweepStaleTestData } from "./app/lib/testDataSweep.js";

export default async function setup() {
  assertSafeTestDatabase();

  // Best-effort, non-fatal: a sweep failure (network blip, permissions) must never block the
  // actual test run over a hygiene pass — log and continue. See testDataSweep.js for what this
  // clears and why (2026-07-28 stale-test-data incident).
  try {
    const result = await sweepStaleTestData();
    if (result.jobsDeleted || result.usersDeleted || result.webhookListenersDeleted) {
      console.log(
        `[testDataSweep] cleared stale test data: ${result.jobsDeleted} job(s), ` +
          `${result.usersDeleted} user(s), ${result.webhookListenersDeleted} webhook listener(s)`
      );
    }
  } catch (err) {
    console.error("[testDataSweep] failed (non-fatal, continuing with the test run):", err);
  }
}
