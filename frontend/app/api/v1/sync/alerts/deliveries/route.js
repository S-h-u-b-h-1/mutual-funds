import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { query } from "../../../../../lib/db";

// alert_deliveries has no user_id of its own (see 002_auth_and_user_data.sql) — every triggered
// alert a user can see, they see only by joining through alert_rules.user_id, same ownership
// pattern as collection items.
export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const r = await query(
    `select d.id, d.rule_id, d.triggered_at, d.channel, d.status, d.payload,
            r.alert_type, r.target_type, r.target_name
     from alert_deliveries d
     join alert_rules r on r.id = d.rule_id
     where r.user_id = $1
     order by d.triggered_at desc
     limit 100`,
    [user.id]
  );
  return Response.json({ items: r.rows });
}
