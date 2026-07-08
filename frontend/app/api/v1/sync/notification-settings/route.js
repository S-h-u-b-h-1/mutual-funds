import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";

const VALID_CHANNELS = new Set(["email", "push", "in_app"]);

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const r = await query(
    `select alert_type, channel, enabled from user_notification_settings where user_id = $1 order by alert_type, channel`,
    [user.id]
  );
  return Response.json({ items: r.rows });
}

// Upserts one (alertType, channel) rule at a time — matches the schema's own
// unique(user_id, alert_type, channel) and keeps this a small, composable toggle rather than a
// bulk-replace endpoint.
export async function PUT(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { alertType, channel } = body;
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
  if (typeof alertType !== "string" || !alertType) {
    return Response.json({ error: "alertType is required" }, { status: 400 });
  }
  if (!VALID_CHANNELS.has(channel)) {
    return Response.json({ error: `channel must be one of: ${[...VALID_CHANNELS].join(", ")}` }, { status: 400 });
  }

  const r = await query(
    `insert into user_notification_settings (user_id, alert_type, channel, enabled)
     values ($1, $2, $3, $4)
     on conflict (user_id, alert_type, channel) do update set enabled = excluded.enabled
     returning alert_type, channel, enabled`,
    [user.id, alertType, channel, enabled]
  );
  return Response.json(r.rows[0]);
}
