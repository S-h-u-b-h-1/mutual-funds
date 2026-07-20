// Updates the document's visibility ('private' | 'shared' | 'advisor' | 'internal') — also how a
// share is revoked (pass visibility: 'private'). Cross-user enforcement (an advisor actually
// seeing a 'shared' document) is Journey 5 (CRM)'s concern; this endpoint only sets the flag.
import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { shareDocument } from "../../../../../../lib/invest/documentService";

export async function POST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const document = await shareDocument(user.id, id, body);
    if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
    return Response.json({ document });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
