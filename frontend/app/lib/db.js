// Server-only Neon/Postgres connection layer (Phase 1 migration foundation).
// Never import this from a "use client" component — only from Server Components,
// Route Handlers, or scripts that run server-side.
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

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
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    attachDatabasePool(pool);
  }
  return pool;
}

export async function query(text, params) {
  return getPool().query(text, params);
}
