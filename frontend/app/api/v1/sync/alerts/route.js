import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";

const VALID_ALERT_TYPES = new Set([
  "health_score", "attention_score", "news", "factsheet", "benchmark", "category", "amc", "research_queue",
]);
const VALID_TARGET_TYPES = new Set(["fund", "category", "amc", "benchmark"]);
const MAX_RULES_PER_USER = 50;

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const r = await query(
    `select id, alert_type, target_type, target_id, target_name, condition, enabled, created_at, updated_at
     from alert_rules where user_id = $1 order by created_at desc`,
    [user.id]
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

  const { alertType, targetType, targetId, targetName, condition } = body;
  if (!VALID_ALERT_TYPES.has(alertType)) {
    return Response.json({ error: `alertType must be one of: ${[...VALID_ALERT_TYPES].join(", ")}` }, { status: 400 });
  }
  if (!VALID_TARGET_TYPES.has(targetType)) {
    return Response.json({ error: `targetType must be one of: ${[...VALID_TARGET_TYPES].join(", ")}` }, { status: 400 });
  }
  if (typeof targetId !== "string" || !targetId) {
    return Response.json({ error: "targetId is required" }, { status: 400 });
  }
  if (!condition || typeof condition !== "object") {
    return Response.json({ error: "condition (object) is required, e.g. {\"op\":\"below\",\"value\":50}" }, { status: 400 });
  }

  // Every enabled rule, for every user, is loaded and evaluated on every run of
  // /api/v1/internal/alerts/run — there's no per-user pagination there. An uncapped create
  // endpoint would let one account permanently degrade that shared job's runtime for everyone.
  const existingCount = await query(`select count(*) from alert_rules where user_id = $1`, [user.id]);
  if (Number(existingCount.rows[0].count) >= MAX_RULES_PER_USER) {
    return Response.json({ error: `Alert rule limit reached (max ${MAX_RULES_PER_USER})` }, { status: 429 });
  }

  const r = await query(
    `insert into alert_rules (user_id, alert_type, target_type, target_id, target_name, condition)
     values ($1, $2, $3, $4, $5, $6)
     returning id, alert_type, target_type, target_id, target_name, condition, enabled, created_at, updated_at`,
    [user.id, alertType, targetType, targetId, targetName ?? null, JSON.stringify(condition)]
  );
  return Response.json(r.rows[0], { status: 201 });
}
