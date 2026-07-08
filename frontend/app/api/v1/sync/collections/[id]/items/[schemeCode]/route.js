import { requireUser, unauthorized } from "../../../../../../../lib/apiAuth";
import { query } from "../../../../../../../lib/db";

export async function DELETE(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  await query(
    `delete from user_collection_items i
     using user_collections c
     where i.collection_id = c.id and c.id = $1 and c.user_id = $2 and i.scheme_code = $3`,
    [params.id, user.id, params.schemeCode]
  );
  return new Response(null, { status: 204 });
}
