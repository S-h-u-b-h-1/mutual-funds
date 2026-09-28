import pg from "pg";
import { assertSafeTestDatabase } from "../app/lib/testDbGuard.js";
import { assertConnectedTestDatabase } from "../app/lib/testDatabaseIdentity.mjs";

let client;
try {
  assertSafeTestDatabase();
  client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL, connectionTimeoutMillis: 15000, query_timeout: 15000 });
  await client.connect();
  const identity = await assertConnectedTestDatabase(client.query.bind(client), true);
  console.log(JSON.stringify({ status: "pass", identity }));
} catch {
  console.error("CI database preflight failed. No tests may run; verify the isolated credential and target identity.");
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}
