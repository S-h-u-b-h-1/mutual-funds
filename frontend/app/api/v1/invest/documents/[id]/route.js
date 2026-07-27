// Journey 4 — Document Details + Document Timeline in one call.
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getDocumentWithTimeline } from "../../../../../lib/invest/documentService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const result = await getDocumentWithTimeline(user.id, id);
  if (!result) return Response.json({ error: "Document not found" }, { status: 404 });
  return Response.json(result);
}

export const GET = withObservability("GET /api/v1/invest/documents/[id]", handleGET);
