// Mock phase: there is no real object-storage backend to stream bytes from — this records the
// download event and returns the document (including its synthetic storageRef), not a binary
// response. See documentService.downloadDocument for the full rationale.
import { requireUser, unauthorized } from "../../../../../../lib/apiAuth";
import { downloadDocument } from "../../../../../../lib/invest/documentService";
import { withObservability } from "../../../../../../lib/platform/observability/core";

async function handlePOST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();

  const { id } = await params;
  const document = await downloadDocument(user.id, id);
  if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
  return Response.json({ document });
}

export const POST = withObservability("POST /api/v1/invest/documents/[id]/download", handlePOST);
