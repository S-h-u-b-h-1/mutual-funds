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
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) return Response.json({ error: "text is required" }, { status: 400 });

  const r = await query(
    `update user_research_notes set text = $3, updated_at = now()
     where id = $1 and user_id = $2
     returning id, scheme_code, fund_name, text, created_at, updated_at`,
    [params.id, user.id, text]
  );
  if (!r.rows[0]) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(r.rows[0]);
}

export async function DELETE(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  await query(`delete from user_research_notes where id = $1 and user_id = $2`, [params.id, user.id]);
  return new Response(null, { status: 204 });
}
