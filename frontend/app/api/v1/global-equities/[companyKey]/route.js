import { FiscalAiError } from "../../../../lib/fiscalAi/client";
import { getGlobalEquityReport } from "../../../../lib/fiscalAi/service";
import { withObservability } from "../../../../lib/platform/observability/core";

async function handleGET(_request, context) {
  try {
    const { companyKey } = await context.params;
    return Response.json(await getGlobalEquityReport(companyKey));
  } catch (error) {
    const status = error instanceof FiscalAiError ? error.status : 500;
    return Response.json({ error: error?.message || "Global equity report is temporarily unavailable." }, { status });
  }
}

export const GET = withObservability("GET /api/v1/global-equities/:companyKey", handleGET);
