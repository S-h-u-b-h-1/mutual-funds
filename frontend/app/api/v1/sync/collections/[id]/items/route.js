import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { query } from "../../../../../../lib/db";

export async function POST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const schemeCode = typeof body.schemeCode === "string" ? body.schemeCode : "";
  if (!schemeCode) return Response.json({ error: "schemeCode is required" }, { status: 400 });

  // user_collection_items has no user_id of its own — ownership is only provable by joining
  // through its parent collection, so that check must happen before any write (see
  // 002_auth_and_user_data.sql's no-RLS rationale: this IS the authorization gate).
  const owned = await query(`select id from user_collections where id = $1 and user_id = $2`, [params.id, user.id]);
  if (!owned.rows[0]) return Response.json({ error: "Not found" }, { status: 404 });

  const r = await query(
    `insert into user_collection_items (collection_id, scheme_code, fund_name)
     values ($1, $2, $3)
     on conflict (collection_id, scheme_code) do nothing
     returning scheme_code, fund_name, added_at`,
    [params.id, schemeCode, body.fundName ?? null]
  );
  if (r.rows[0]) return Response.json(r.rows[0], { status: 201 });

  const existing = await query(
    `select scheme_code, fund_name, added_at from user_collection_items where collection_id = $1 and scheme_code = $2`,
    [params.id, schemeCode]
  );
  return Response.json(existing.rows[0]);
}
