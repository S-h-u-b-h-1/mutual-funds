import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";

const MAX_LIMIT = 100;
// entityType: 'fund' | 'amc' | 'category' | 'benchmark' | 'manager' | 'search' — 'search' reuses
// this same append-only log (entityId/entityName both hold the raw query text) rather than a
// separate table, mirroring how sessionMemory.js already treats recent-views and recent-searches
// as two views over one kind of "you looked at this" event.
export async function GET(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const entityType = url.searchParams.get("type");
  const limit = Math.min(Number(url.searchParams.get("limit")) || 24, MAX_LIMIT);

  const r = entityType
    ? await query(
        `select entity_type, entity_id, entity_name, meta, viewed_at from user_research_history
         where user_id = $1 and entity_type = $2 order by viewed_at desc limit $3`,
        [user.id, entityType, limit]
      )
    : await query(
        `select entity_type, entity_id, entity_name, meta, viewed_at from user_research_history
         where user_id = $1 order by viewed_at desc limit $2`,
        [user.id, limit]
      );
  return Response.json({ items: r.rows });
}

export async function POST(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const entityType = typeof body.entityType === "string" ? body.entityType : "";
  const entityId = typeof body.entityId === "string" ? body.entityId : "";
  if (!entityType || !entityId) {
    return Response.json({ error: "entityType and entityId are required" }, { status: 400 });
  }

  const r = await query(
    `insert into user_research_history (user_id, entity_type, entity_id, entity_name, meta)
     values ($1, $2, $3, $4, $5)
     returning entity_type, entity_id, entity_name, meta, viewed_at`,
    [user.id, entityType, entityId, body.entityName ?? null, body.meta ? JSON.stringify(body.meta) : null]
  );
  return Response.json(r.rows[0], { status: 201 });
}
