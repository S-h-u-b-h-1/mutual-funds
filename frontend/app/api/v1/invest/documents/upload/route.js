// Journey 4 — user-initiated upload. Mock phase: this accepts document METADATA only (title,
// category, docType, tags, mimeType, fileSizeBytes) — there is no real binary/multipart storage
// backend yet ("No real providers yet. Only architecture, persistence and APIs"). storageRef in
// the response is a synthetic reference from documentProvider.storeUpload(), not a real file URL.
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { uploadDocument } from "../../../../../lib/invest/documentService";

export async function POST(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const document = await uploadDocument(user.id, body);
    return Response.json({ document });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
