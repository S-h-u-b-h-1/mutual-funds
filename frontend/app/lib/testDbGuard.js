// Structural safety guard against the test suite ever running against the production Neon
// database. See docs/TEST_DATABASE_AND_CI.md for the full mechanism and the incident that
// motivated it: a disposable local test branch expired on 2026-07-09 and .env.local was
// silently updated with what turned out to be the production connection string — every local
// test run since then, and every real row this codebase's test files ever created, landed in
// production. NODE_ENV alone was never checked and would not have caught this anyway (it's
// frequently unset in ad hoc local runs); this guard checks the actual resolved database
// instead of trusting any single signal.
//
// Two independent conditions must both hold, or this throws:
//   1. TEST_DATABASE_URL is set and is byte-for-byte identical to DATABASE_URL — proves the
//      environment was deliberately configured for tests, not just inherited from whatever
//      DATABASE_URL already happened to be.
//   2. The resolved host is NOT the known production Neon host — a backstop that still catches
//      the case where someone points TEST_DATABASE_URL at production by mistake (condition 1
//      alone would pass in that case, since both vars would agree).
const PRODUCTION_NEON_HOST = "ep-autumn-wind-atiwaldh-pooler.c-9.us-east-1.aws.neon.tech";

function hostOf(connectionString) {
  try {
    return new URL(connectionString).host;
  } catch {
    return null;
  }
}

export function assertSafeTestDatabase() {
  const dbUrl = process.env.DATABASE_URL;
  const testDbUrl = process.env.TEST_DATABASE_URL;

  if (!dbUrl) {
    throw new Error(
      "Refusing to run: DATABASE_URL is not set. This test suite makes real writes against a " +
        "real Postgres database and needs one configured. See docs/TEST_DATABASE_AND_CI.md."
    );
  }
  if (!testDbUrl) {
    throw new Error(
      "Refusing to run: TEST_DATABASE_URL is not set. This suite requires an explicit test-" +
        "database marker in addition to DATABASE_URL — set TEST_DATABASE_URL to the exact same " +
        "value as DATABASE_URL to confirm this environment was deliberately configured for " +
        "tests. See docs/TEST_DATABASE_AND_CI.md."
    );
  }
  if (testDbUrl !== dbUrl) {
    throw new Error(
      "Refusing to run: TEST_DATABASE_URL and DATABASE_URL are set to different values. They " +
        "must be identical — this suite only ever touches the database named by DATABASE_URL, " +
        "so a mismatched TEST_DATABASE_URL doesn't actually confirm which database is about to " +
        "be used. See docs/TEST_DATABASE_AND_CI.md."
    );
  }

  const host = hostOf(dbUrl);
  if (host === PRODUCTION_NEON_HOST) {
    throw new Error(
      `Refusing to run: DATABASE_URL resolves to the production Neon host ` +
        `(${PRODUCTION_NEON_HOST}). This suite creates and deletes real rows and must never run ` +
        `against production, regardless of what TEST_DATABASE_URL claims. Point both env vars ` +
        `at the dedicated Neon "test" branch instead. See docs/TEST_DATABASE_AND_CI.md.`
    );
  }
}
