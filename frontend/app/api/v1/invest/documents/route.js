// Journey 4 — Document Vault. Simple list: latest first, optional category/status filter and a
// limit. For keyword/tag/date-range search, see GET /documents/search.
import { requireUser, unauthorized } from "../../../../lib/apiAuth";
import { listDocuments } from "../../../../lib/invest/documentService";

export async function GET(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const params = new URL(request.url).searchParams;
  const category = params.get("category") || undefined;
  const status = params.get("status") || undefined;
  const limitParam = params.get("limit");
  const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 50;

  const documents = await listDocuments(user.id, { category, status, limit });
  return Response.json({ documents });
}
