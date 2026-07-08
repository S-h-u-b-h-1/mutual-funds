import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";

export async function GET(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const schemeCode = new URL(request.url).searchParams.get("schemeCode");
  const r = schemeCode
    ? await query(
        `select id, scheme_code, fund_name, text, created_at, updated_at from user_research_notes
         where user_id = $1 and scheme_code = $2 order by created_at desc`,
        [user.id, schemeCode]
      )
    : await query(
        `select id, scheme_code, fund_name, text, created_at, updated_at from user_research_notes
         where user_id = $1 order by created_at desc limit 200`,
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
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!schemeCode || !text) {
    return Response.json({ error: "schemeCode and text are required" }, { status: 400 });
  }

  const r = await query(
    `insert into user_research_notes (user_id, scheme_code, fund_name, text)
     values ($1, $2, $3, $4)
     returning id, scheme_code, fund_name, text, created_at, updated_at`,
    [user.id, schemeCode, body.fundName ?? null, text]
  );
  return Response.json(r.rows[0], { status: 201 });
}
