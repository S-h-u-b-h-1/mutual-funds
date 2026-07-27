// Journey 4 — full-text + multi-filter document search. All params optional and combinable.
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { searchDocuments } from "../../../../../lib/invest/documentService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const params = new URL(request.url).searchParams;
  const limitParam = params.get("limit");
  const tagsParam = params.get("tags");

  const documents = await searchDocuments(user.id, {
    keyword: params.get("keyword") || undefined,
    category: params.get("category") || undefined,
    status: params.get("status") || undefined,
    source: params.get("source") || undefined,
    tags: tagsParam ? tagsParam.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
    dateFrom: params.get("dateFrom") || undefined,
    dateTo: params.get("dateTo") || undefined,
    limit: limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 50,
  });
  return Response.json({ documents });
}

export const GET = withObservability("GET /api/v1/invest/documents/search", handleGET);
