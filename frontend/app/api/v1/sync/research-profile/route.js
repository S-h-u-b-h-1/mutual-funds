import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";

const FIELDS = ["role", "primaryGoal", "experience", "riskComfort", "horizon", "aumBand", "preferredCategories"];
const COLUMNS = { role: "role", primaryGoal: "primary_goal", experience: "experience", riskComfort: "risk_comfort", horizon: "horizon", aumBand: "aum_band", preferredCategories: "preferred_categories" };

function toApiShape(row) {
  if (!row) return null;
  return {
    role: row.role, primaryGoal: row.primary_goal, experience: row.experience,
    riskComfort: row.risk_comfort, horizon: row.horizon, aumBand: row.aum_band,
    preferredCategories: row.preferred_categories, updatedAt: row.updated_at,
  };
}

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const r = await query(
    `select role, primary_goal, experience, risk_comfort, horizon, aum_band, preferred_categories, updated_at
     from research_profile where user_id = $1`,
    [user.id]
  );
  return Response.json(toApiShape(r.rows[0]));
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

  // Same never-fabricate posture as everywhere else: only accept the known fields, coalesce
  // missing ones against the existing row rather than nulling them out on a partial update.
  const values = FIELDS.map((f) => (typeof body[f] === "string" && body[f].trim() ? body[f].trim() : null));

  const r = await query(
    `insert into research_profile (user_id, role, primary_goal, experience, risk_comfort, horizon, aum_band, preferred_categories, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (user_id) do update set
       role = coalesce($2, research_profile.role),
       primary_goal = coalesce($3, research_profile.primary_goal),
       experience = coalesce($4, research_profile.experience),
       risk_comfort = coalesce($5, research_profile.risk_comfort),
       horizon = coalesce($6, research_profile.horizon),
       aum_band = coalesce($7, research_profile.aum_band),
       preferred_categories = coalesce($8, research_profile.preferred_categories),
       updated_at = now()
     returning role, primary_goal, experience, risk_comfort, horizon, aum_band, preferred_categories, updated_at`,
    [user.id, ...values]
  );
  return Response.json(toApiShape(r.rows[0]));
}
