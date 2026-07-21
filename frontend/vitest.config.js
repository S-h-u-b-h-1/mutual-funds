import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.js"],
    // Integration tests hit real Neon over the network with several sequential round-trips per
    // service call (e.g. one compliance item submission touches 5+ queries) — the 5s default is
    // tuned for pure-logic unit tests and was measured to be too short for these.
    testTimeout: 45000,
    // jobPlatform.test.js and webhookPlatform.test.js both claim from the SAME shared `jobs`
    // table on the real Neon branch, matching production's claimJobs() semantics (claim ANY
    // due row). Under Vitest's default file-level parallelism the two can race: one file's
    // claim can land on a row the other file's own cleanup deletes in the same instant, or
    // steal a job the other file's runWorkerTick() was about to process. Rather than serialize
    // the whole 38-file suite (measured: pushes total wall-clock past 10 minutes) for a race
    // that only two files can even trigger, those two files take a Postgres advisory lock
    // (see their own beforeAll/afterAll) so only THEY mutually exclude — everything else stays
    // fully parallel. Whichever of the two starts second legitimately blocks in its beforeAll
    // for as long as the first file's entire run takes — proven safe in isolation (~77s for
    // both together), but under the FULL suite's 38-way file parallelism against one live Neon
    // endpoint, resource contention alone can push either file well past Vitest's 10s default
    // hookTimeout. Raised generously above the worst observed full-suite wait, not just the
    // isolated one, so the wait itself is never mistaken for a hang.
    hookTimeout: 300000,
  },
});
