import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { archiveDocument } from "../../../../../../lib/invest/documentService";
import { withObservability } from "../../../../../../lib/platform/observability/core";

async function handlePOST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { id } = await params;
  try {
    const document = await archiveDocument(user.id, id);
    if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
    return Response.json({ document });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

export const POST = withObservability("POST /api/v1/invest/documents/[id]/archive", handlePOST);
