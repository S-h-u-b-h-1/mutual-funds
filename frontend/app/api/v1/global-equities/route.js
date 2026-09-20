import { FiscalAiError } from "../../../lib/fiscalAi/client";
import { getGlobalEquityUniverse } from "../../../lib/fiscalAi/service";
import { withObservability } from "../../../lib/platform/observability/core";

async function handleGET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await getGlobalEquityUniverse({
      query: searchParams.get("q") || "",
      country: searchParams.get("country") || "",
      sector: searchParams.get("sector") || "",
    });
    return Response.json(result);
  } catch (error) {
    const status = error instanceof FiscalAiError ? error.status : 500;
    return Response.json({ error: error?.message || "Global equities are temporarily unavailable." }, { status });
  }
}

export const GET = withObservability("GET /api/v1/global-equities", handleGET);
