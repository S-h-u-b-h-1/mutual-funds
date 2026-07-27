import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.js"],
    // Integration tests hit real Neon over the network with several sequential round-trips per
    // service call (e.g. one compliance item submission touches 5+ queries) — the 5s default is
    // tuned for pure-logic unit tests and was measured to be too short for these.
    testTimeout: 45000,
    // jobPlatform.test.js, webhookPlatform.test.js, and eventBus.test.js all claim from the
    // SAME shared `jobs` table on the real Neon branch, matching production's claimJobs()
    // semantics (claim ANY due row). Under Vitest's default file-level parallelism they can
    // race each other: one file's claim can land on a row another file's own cleanup deletes
    // in the same instant, or steal a job another file's runWorkerTick() was about to process.
    // Rather than serialize the whole 38-file suite (measured: pushes total wall-clock past 10
    // minutes) for a race only these files can even trigger, they take a Postgres advisory
    // lock (see jobs/testClaimLock.js and their own beforeAll/afterAll) so only THEY mutually
    // exclude — everything else stays fully parallel. Whichever starts last legitimately
    // blocks in its beforeAll for as long as the others' runs take. eventBus.test.js's own
    // real-wiring tests (each driving a disposable user through makeInvestmentReadyUser, real
    // order settlement, etc.) run up to 180s EACH under contention, plus a final queue drain in
    // its own afterAll before releasing the lock — proven in a real run to push the file holding
    // the lock past 400s total. Must stay comfortably above testClaimLock.js's own MAX_WAIT_MS
    // (600000) or the waiting file's beforeAll gets killed by this timeout before its lock-wait
    // even has a chance to time out on its own with a diagnosable error.
    hookTimeout: 660000,
  },
});
