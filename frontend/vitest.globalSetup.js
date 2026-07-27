// Runs once before the entire test run starts, before any test file (or its beforeAll) executes.
// See app/lib/testDbGuard.js for the actual check and docs/TEST_DATABASE_AND_CI.md for why this
// exists. A thrown error here aborts the whole run before a single connection is opened.
import { assertSafeTestDatabase } from "./app/lib/testDbGuard.js";

export default function setup() {
  assertSafeTestDatabase();
}
