// Stock Watchlist (Stock Intelligence, Section 20) — explicitly not the same concept as a
// portfolio holding. Multiple watchlists per user; nothing is created for a user until they ask
// for it (no default-row insert trigger anywhere in this codebase's Neon schema).
import { query } from "../db.js";

function shapeWatchlist(row) {
  return { id: row.id, userId: row.user_id, name: row.name, createdAt: row.created_at };
}

function shapeItem(row) {
  return { id: row.id, watchlistId: row.watchlist_id, companyId: row.company_id, notes: row.notes, addedAt: row.added_at };
}

export async function createWatchlist(userId, name = "My Watchlist") {
  const r = await query(`insert into stock_watchlists (user_id, name) values ($1, $2) returning *`, [userId, name]);
  return shapeWatchlist(r.rows[0]);
}

export async function getWatchlists(userId) {
  const r = await query(`select * from stock_watchlists where user_id = $1 order by created_at asc`, [userId]);
  return r.rows.map(shapeWatchlist);
}

// Convenience for a simple "add to watchlist" action that shouldn't force the user through an
// explicit "create a watchlist" step first — returns the user's oldest watchlist, creating the
// default-named one only if they truly have none yet.
export async function getOrCreateDefaultWatchlist(userId) {
  const existing = await getWatchlists(userId);
  if (existing.length > 0) return existing[0];
  return createWatchlist(userId, "My Watchlist");
}

// Ownership check for API routes — a watchlistId in a URL is client-supplied and must never be
// trusted as belonging to the requesting user without this (same "never trust a client-supplied
// id" posture as every other user-scoped route in this codebase, see lib/apiAuth.js's header
// comment).
export async function isWatchlistOwner(watchlistId, userId) {
  const r = await query(`select 1 from stock_watchlists where id = $1 and user_id = $2`, [watchlistId, userId]);
  return r.rows.length > 0;
}

export async function addToWatchlist(watchlistId, companyId, notes = null) {
  const r = await query(
    `insert into stock_watchlist_items (watchlist_id, company_id, notes) values ($1,$2,$3)
     on conflict (watchlist_id, company_id) do update set notes = excluded.notes
     returning *`,
    [watchlistId, companyId, notes]
  );
  return shapeItem(r.rows[0]);
}

export async function removeFromWatchlist(watchlistId, companyId) {
  const r = await query(`delete from stock_watchlist_items where watchlist_id = $1 and company_id = $2 returning id`, [watchlistId, companyId]);
  return r.rows.length > 0;
}

export async function getWatchlistItems(watchlistId) {
  const r = await query(
    `select i.*, c.display_name, c.nse_symbol, c.bse_code from stock_watchlist_items i
     join companies c on c.id = i.company_id where i.watchlist_id = $1 order by i.added_at desc`,
    [watchlistId]
  );
  return r.rows.map((row) => ({ ...shapeItem(row), displayName: row.display_name, nseSymbol: row.nse_symbol, bseCode: row.bse_code }));
}
