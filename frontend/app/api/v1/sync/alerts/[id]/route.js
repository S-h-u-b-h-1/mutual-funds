import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { query } from "../../../../../lib/db";

export async function PUT(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const r = await query(
    `update alert_rules set
       enabled = coalesce($3, enabled),
       condition = coalesce($4, condition),
       updated_at = now()
     where id = $1 and user_id = $2
     returning id, alert_type, target_type, target_id, target_name, condition, enabled, created_at, updated_at`,
    [params.id, user.id, typeof body.enabled === "boolean" ? body.enabled : null, body.condition ? JSON.stringify(body.condition) : null]
  );
  if (!r.rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(r.rows[0]);
}

export async function DELETE(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  await query(`delete from alert_rules where id = $1 and user_id = $2`, [params.id, user.id]);
  return new Response(null, { status: 204 });
}
