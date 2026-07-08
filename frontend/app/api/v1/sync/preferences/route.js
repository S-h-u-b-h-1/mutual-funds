import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const r = await query(
    `select dashboard_layout, theme, updated_at from user_preferences where user_id = $1`,
    [user.id]
  );
  return Response.json(r.rows[0] ?? { dashboard_layout: null, theme: null, updated_at: null });
}

export async function PUT(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const r = await query(
    `insert into user_preferences (user_id, dashboard_layout, theme, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id) do update set
       dashboard_layout = coalesce($2, user_preferences.dashboard_layout),
       theme = coalesce($3, user_preferences.theme),
       updated_at = now()
     returning dashboard_layout, theme, updated_at`,
    [user.id, body.dashboardLayout ? JSON.stringify(body.dashboardLayout) : null, body.theme ?? null]
  );
  return Response.json(r.rows[0]);
}
