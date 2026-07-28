import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.js"],
    // Hard-refuses to run this real-Postgres integration suite against production — see
    // app/lib/testDbGuard.js and docs/TEST_DATABASE_AND_CI.md. Runs once before any test file.
    globalSetup: ["./vitest.globalSetup.js"],
    // Integration tests hit real Neon over the network with several sequential round-trips per
    // service call (e.g. one compliance item submission touches 5+ queries) — the 5s default is
    // tuned for pure-logic unit tests and was measured to be too short for these.
    testTimeout: 45000,
    // jobPlatform.test.js, webhookPlatform.test.js, eventBus.test.js, and notifications/core.test.js
    // all claim from the SAME shared `jobs` table on the real Neon branch, matching production's
    // claimJobs() semantics (claim ANY due row). Under Vitest's default file-level parallelism
    // they can race each other: one file's claim can land on a row another file's own cleanup
    // deletes in the same instant, or steal a job another file's runWorkerTick() was about to
    // process. Rather than serialize the whole suite for a race only these files can even
    // trigger, they take a Postgres advisory lock (see jobs/testClaimLock.js and their own
    // beforeAll/afterAll) so only THEY mutually exclude — everything else stays fully parallel.
    // Whichever starts last legitimately blocks in its beforeAll for as long as the others' runs
    // take. Must stay comfortably above testClaimLock.js's own MAX_WAIT_MS (600000) or the
    // waiting file's beforeAll gets killed by THIS timeout before its lock-wait even has a chance
    // to time out on its own with a diagnosable error — the two constants are a paired invariant,
    // always keep this one higher. (2026-07-28: a 5th file, journey1-onboarding.e2e.test.js,
    // briefly joined this group and pushed both constants up further — see testClaimLock.js's own
    // comment for why that was reverted in favor of idIn-scoping the claiming tests instead.)
    hookTimeout: 660000,
  },
});
