// Private per-user research notes for one company — auth required (Section 22-23: personal notes
// only this pass, no public/community feature).
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { getResearchNote, upsertResearchNote } from "../../../../../lib/stocks/researchNoteService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  const note = await getResearchNote(user.id, id);
  return Response.json({ note });
}

async function handlePUT(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const note = await upsertResearchNote({ userId: user.id, companyId: id, ...body });
  return Response.json({ note });
}

export const GET = withObservability("GET /api/v1/stocks/[id]/research-notes", handleGET);
export const PUT = withObservability("PUT /api/v1/stocks/[id]/research-notes", handlePUT);
