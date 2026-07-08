import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { query } from "../../../../../lib/db";

export async function DELETE(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { schemeCode } = params;
  await query(`delete from user_watchlist where user_id = $1 and scheme_code = $2`, [user.id, schemeCode]);
  return new Response(null, { status: 204 });
}
