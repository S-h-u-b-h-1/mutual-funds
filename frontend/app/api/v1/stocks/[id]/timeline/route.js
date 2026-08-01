// Company timeline + results calendar — public (Sections 7-8).
import { getCompanyTimeline, getResultsCalendar } from "../../../../../lib/stocks/timeline";
import { withObservability } from "../../../../../lib/platform/observability/core";

async function handleGET(request, { params }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const eventType = searchParams.get("eventType") || undefined;
  const limit = searchParams.get("limit");

  const [events, resultsCalendar] = await Promise.all([
    getCompanyTimeline(id, { eventType, limit: limit ? parseInt(limit, 10) : undefined }),
    getResultsCalendar(id),
  ]);
  return Response.json({ companyId: id, events, resultsCalendar });
}

export const GET = withObservability("GET /api/v1/stocks/[id]/timeline", handleGET);
