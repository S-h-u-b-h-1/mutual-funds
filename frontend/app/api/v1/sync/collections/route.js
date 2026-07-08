import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const r = await query(
    `select
       c.id, c.name, c.created_at,
       coalesce(
         json_agg(
           json_build_object('schemeCode', i.scheme_code, 'fundName', i.fund_name, 'addedAt', i.added_at)
           order by i.added_at desc
         ) filter (where i.id is not null),
         '[]'
       ) as items
     from user_collections c
     left join user_collection_items i on i.collection_id = c.id
     where c.user_id = $1
     group by c.id
     order by c.created_at desc`,
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
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });

  const r = await query(
    `insert into user_collections (user_id, name) values ($1, $2)
     on conflict (user_id, name) do nothing
     returning id, name, created_at`,
    [user.id, name]
  );
  if (r.rows[0]) return Response.json({ ...r.rows[0], items: [] }, { status: 201 });

  const existing = await query(
    `select id, name, created_at from user_collections where user_id = $1 and name = $2`,
    [user.id, name]
  );
  return Response.json({ ...existing.rows[0], items: [] }, { status: 200 });
}
