import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";

// One-shot import of a user's pre-auth localStorage data (frontend/app/lib/sessionMemory.js,
// WatchButton.jsx) into the cloud tables, run once per user right after their first sign-in.
// This is NOT the ongoing sync path — /api/v1/sync/{watchlist,notes,...} are that; this exists
// only to move whatever a user already accumulated anonymously before they had an account, so
// signing up doesn't feel like starting over. Idempotent via the audit_log 'sync_migrate' marker
// (see 002_auth_and_user_data.sql's own action vocabulary comment) — already-migrated users get
// a no-op 200, not a re-import, so a page that calls this on every login is always safe to call.
const MAX_ITEMS = 500;

function asArray(v) {
  return Array.isArray(v) ? v.slice(0, MAX_ITEMS) : [];
}

export async function POST(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const already = await query(
    `select 1 from audit_log where user_id = $1 and action = 'sync_migrate' limit 1`,
    [user.id]
  );
  if (already.rows[0]) {
    return Response.json({ migrated: false, reason: "already_migrated" });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const counts = { watchlist: 0, notes: 0, history: 0, comparisons: 0 };

  for (const item of asArray(body.watchlist)) {
    const schemeCode = typeof item?.code === "string" ? item.code : typeof item?.schemeCode === "string" ? item.schemeCode : "";
    if (!schemeCode) continue;
    const r = await query(
      `insert into user_watchlist (user_id, scheme_code, fund_name, amc) values ($1, $2, $3, $4)
       on conflict (user_id, scheme_code) do nothing returning scheme_code`,
      [user.id, schemeCode, item.name ?? item.fundName ?? null, item.amc ?? null]
    );
    if (r.rows[0]) counts.watchlist++;
  }

  // { [schemeCode]: [{ text, fundName, at }, ...] } — no natural per-note dedupe key from the
  // client's locally-generated id, so a retried migration after a partial failure could
  // duplicate notes already imported in the failed attempt. Accepted as a rare-edge-case
  // tradeoff: the common path is exactly one successful run, gated by the marker above.
  // Object.entries has no length cap of its own the way asArray() caps every array-shaped input
  // above — an attacker-controlled body could otherwise carry tens of thousands of scheme_code
  // keys, each spawning its own sequential inserts, tying up pooled connection capacity for one
  // request far longer than any real localStorage payload ever would.
  const notesByCode = body.notes && typeof body.notes === "object" && !Array.isArray(body.notes) ? body.notes : {};
  for (const [schemeCode, notes] of Object.entries(notesByCode).slice(0, MAX_ITEMS)) {
    for (const note of asArray(notes)) {
      const text = typeof note?.text === "string" ? note.text.trim() : "";
      if (!text) continue;
      await query(
        `insert into user_research_notes (user_id, scheme_code, fund_name, text, created_at)
         values ($1, $2, $3, $4, coalesce($5::timestamptz, now()))`,
        [user.id, schemeCode, note.fundName ?? null, text, note.at ?? null]
      );
      counts.notes++;
    }
  }

  for (const view of asArray(body.recentViews)) {
    const entityType = typeof view?.type === "string" ? view.type : "";
    const entityId = typeof view?.id === "string" ? view.id : "";
    if (!entityType || !entityId) continue;
    const { type, id, at, ...rest } = view;
    await query(
      `insert into user_research_history (user_id, entity_type, entity_id, entity_name, meta, viewed_at)
       values ($1, $2, $3, $4, $5, coalesce($6::timestamptz, now()))`,
      [user.id, entityType, entityId, view.name ?? null, Object.keys(rest).length ? JSON.stringify(rest) : null, at ?? null]
    );
    counts.history++;
  }

  for (const q of asArray(body.recentSearches)) {
    const text = typeof q === "string" ? q.trim() : "";
    if (!text) continue;
    await query(
      `insert into user_research_history (user_id, entity_type, entity_id, entity_name)
       values ($1, 'search', $2, $2)`,
      [user.id, text]
    );
    counts.history++;
  }

  for (const cmp of asArray(body.recentComparisons)) {
    const name = typeof cmp?.name === "string" ? cmp.name.trim() : "";
    const amcs = Array.isArray(cmp?.amcs) ? cmp.amcs : null;
    if (!name || !amcs?.length) continue;
    const existing = await query(`select id from user_saved_comparisons where user_id = $1 and name = $2`, [user.id, name]);
    if (existing.rows[0]) continue;
    await query(`insert into user_saved_comparisons (user_id, name, amcs) values ($1, $2, $3)`, [user.id, name, JSON.stringify(amcs)]);
    counts.comparisons++;
  }

  await query(
    `insert into audit_log (user_id, action, metadata) values ($1, 'sync_migrate', $2)`,
    [user.id, JSON.stringify(counts)]
  );

  return Response.json({ migrated: true, counts });
}
