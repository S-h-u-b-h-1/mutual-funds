import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { query } from "../../../../../lib/db";

export async function DELETE(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  // Owned items cascade via user_collection_items.collection_id's own FK — no separate cleanup.
  await query(`delete from user_collections where id = $1 and user_id = $2`, [params.id, user.id]);
  return new Response(null, { status: 204 });
}
