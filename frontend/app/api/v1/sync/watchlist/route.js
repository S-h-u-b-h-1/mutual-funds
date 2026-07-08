import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const r = await query(
    `select scheme_code, fund_name, amc, added_at from user_watchlist where user_id = $1 order by added_at desc`,
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
  const schemeCode = typeof body.schemeCode === "string" ? body.schemeCode : "";
  if (!schemeCode) return Response.json({ error: "schemeCode is required" }, { status: 400 });

  // on conflict do nothing => idempotent add, safe for a client to retry after a dropped response
  // without an accidental duplicate error (optimistic-update-friendly).
  const r = await query(
    `insert into user_watchlist (user_id, scheme_code, fund_name, amc)
     values ($1, $2, $3, $4)
     on conflict (user_id, scheme_code) do nothing
     returning scheme_code, fund_name, amc, added_at`,
    [user.id, schemeCode, body.fundName ?? null, body.amc ?? null]
  );
  if (r.rows[0]) return Response.json(r.rows[0], { status: 201 });

  const existing = await query(
    `select scheme_code, fund_name, amc, added_at from user_watchlist where user_id = $1 and scheme_code = $2`,
    [user.id, schemeCode]
  );
  return Response.json(existing.rows[0], { status: 200 });
}
