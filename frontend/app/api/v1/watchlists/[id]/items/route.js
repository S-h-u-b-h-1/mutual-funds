// Membership of one watchlist — auth required, with an explicit ownership check: the watchlist id
// in the URL is client-supplied and must never be trusted without verifying it belongs to the
// requesting user (same posture as every other user-scoped route in this codebase).
import { requireUser, unauthorized } from "../../../../../lib/apiAuth";
import { isWatchlistOwner, addToWatchlist, removeFromWatchlist, getWatchlistItems } from "../../../../../lib/stocks/watchlistService";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await isWatchlistOwner(id, user.id))) return Response.json({ error: "Watchlist not found" }, { status: 404 });
  const items = await getWatchlistItems(id);
  return Response.json({ watchlistId: id, items });
}

async function handlePOST(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await isWatchlistOwner(id, user.id))) return Response.json({ error: "Watchlist not found" }, { status: 404 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (!body?.companyId) return Response.json({ error: "companyId is required" }, { status: 400 });

  const item = await addToWatchlist(id, body.companyId, body.notes ?? null);
  return Response.json({ item }, { status: 201 });
}

async function handleDELETE(request, { params }) {
  const user = await requireUser();
  if (!user) return unauthorized();
  const { id } = await params;
  if (!(await isWatchlistOwner(id, user.id))) return Response.json({ error: "Watchlist not found" }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) return Response.json({ error: "companyId query param is required" }, { status: 400 });

  const removed = await removeFromWatchlist(id, companyId);
  return Response.json({ removed });
}

export const GET = withObservability("GET /api/v1/watchlists/[id]/items", handleGET);
export const POST = withObservability("POST /api/v1/watchlists/[id]/items", handlePOST);
export const DELETE = withObservability("DELETE /api/v1/watchlists/[id]/items", handleDELETE);
