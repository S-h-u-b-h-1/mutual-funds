// Shared test-only helper — creates a disposable test user for integration tests and deletes it
// (cascades to every invest_* row via the FKs' `on delete cascade`) afterward. Same disposable-
// test-account pattern already used elsewhere in this session's verification passes; never used
// outside test files.
import { query } from "../db.js";
import crypto from "node:crypto";

export async function createTestUser(label) {
  const email = `invest-test-${label}-${crypto.randomBytes(4).toString("hex")}@mfpulse.test`;
  const r = await query(`insert into users (name, email) values ($1, $2) returning id`, [`Test ${label}`, email]);
  return r.rows[0].id;
}

export async function deleteTestUser(userId) {
  await query(`delete from users where id = $1`, [userId]);
}
