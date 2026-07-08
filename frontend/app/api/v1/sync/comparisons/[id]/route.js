import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { query } from "../../../../../lib/db";

export async function DELETE(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  await query(`delete from user_saved_comparisons where id = $1 and user_id = $2`, [params.id, user.id]);
  return new Response(null, { status: 204 });
}
