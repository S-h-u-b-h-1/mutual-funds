// A user's stock watchlists — auth required. Multiple watchlists per user (Section 20); nothing
// is auto-created here, matching this codebase's "don't fabricate state nobody asked for" posture.
import { requireUser, unauthorized } from "../../../lib/apiAuth";
import { createWatchlist, getWatchlists } from "../../../lib/stocks/watchlistService";
import { withObservability } from "../../../lib/platform/observability/core";

async function handleGET() {
  const user = await requireUser();
  if (!user) return unauthorized();
  const watchlists = await getWatchlists(user.id);
  return Response.json({ watchlists });
}

async function handlePOST(request) {
  const user = await requireUser();
  if (!user) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const watchlist = await createWatchlist(user.id, body?.name);
  return Response.json({ watchlist }, { status: 201 });
}

export const GET = withObservability("GET /api/v1/watchlists", handleGET);
export const POST = withObservability("POST /api/v1/watchlists", handlePOST);
