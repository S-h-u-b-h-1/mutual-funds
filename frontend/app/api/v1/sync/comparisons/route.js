import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { query } from "../../../../lib/db";

export async function GET() {
  const user = await requireUser();
  if (!user) return unauthorized();

  const r = await query(
    `select id, name, amcs, created_at from user_saved_comparisons where user_id = $1 order by created_at desc`,
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
  const amcs = Array.isArray(body.amcs) ? body.amcs : null;
  if (!name || !amcs?.length) {
    return Response.json({ error: "name and a non-empty amcs array are required" }, { status: 400 });
  }

  // Re-saving under the same name replaces its AMC list — matches sessionMemory.recordComparison's
  // "replace by name" semantics rather than accumulating duplicate saved comparisons. No unique
  // constraint on (user_id, name) exists (unlike user_collections), so this is a check-then-write
  // rather than an ON CONFLICT upsert — an acceptable tradeoff for a single-user, low-concurrency
  // action like naming a saved comparison.
  const existing = await query(
    `select id from user_saved_comparisons where user_id = $1 and name = $2`,
    [user.id, name]
  );
  const r = existing.rows[0]
    ? await query(
        `update user_saved_comparisons set amcs = $2 where id = $1 returning id, name, amcs, created_at`,
        [existing.rows[0].id, JSON.stringify(amcs)]
      )
    : await query(
        `insert into user_saved_comparisons (user_id, name, amcs) values ($1, $2, $3)
         returning id, name, amcs, created_at`,
        [user.id, name, JSON.stringify(amcs)]
      );
  return Response.json(r.rows[0], { status: existing.rows[0] ? 200 : 201 });
}
