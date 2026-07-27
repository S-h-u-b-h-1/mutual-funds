// Server-only Neon/Postgres connection layer (Phase 1 migration foundation).
// Never import this from a "use client" component — only from Server Components,
// Route Handlers, or scripts that run server-side.
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { assertSafeTestDatabase } from "./testDbGuard.js";

export const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

// Neon migration Phase 2 cutover flag — stays false until Neon has been trusted as a read
// source for a real stretch of time (see /internal/neon-status). No page currently checks
// this; it exists so a future read-path swap has one real switch to flip, not a scattered
// set of ad-hoc "which database" checks.
export const READ_FROM_NEON = process.env.READ_FROM_NEON === "true";

let pool;

function getPool() {
  if (!pool) {
    if (!hasDatabaseUrl) {
      throw new Error("DATABASE_URL is not set — Neon connection unavailable.");
    }
    // Backstop, not the primary check (that's vitest.globalSetup.js, which runs before any test
    // file and so fails faster) — but process.env.VITEST is set by Vitest itself in every worker
    // it spawns, so this still catches a real production connection attempt even if the global
    // setup were ever bypassed or misconfigured. Never runs outside a Vitest process: production
    // and the cron worker never have VITEST set, so this line does nothing for them.
    if (process.env.VITEST === "true") assertSafeTestDatabase();
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    attachDatabasePool(pool);
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}

// A real transaction primitive — nothing in this codebase had one before C1/C2 of the Backend
// Hardening pass (2026-07-27) needed to make a check-then-write sequence (an idempotency dedupe
// check, an eligibility check) atomic together with the write that follows it, rather than two
// separate round trips a concurrent request could interleave between. fn receives a client whose
// .query(text, params) participates in the transaction — use it, not the module-level query()
// above, for every statement that must be part of the same atomic unit.
export async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}
