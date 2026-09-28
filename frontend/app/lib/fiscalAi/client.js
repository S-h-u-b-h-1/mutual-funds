import "server-only";

const DEFAULT_BASE_URL = "https://api.fiscal.ai";
const DEFAULT_REVALIDATE_SECONDS = 6 * 60 * 60;

export class FiscalAiError extends Error {
  constructor(message, { status = 500, code = "fiscal_ai_error", details = null } = {}) {
    super(message);
    this.name = "FiscalAiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function configuration() {
  const apiKey = process.env.FISCAL_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new FiscalAiError("Fiscal.ai is not configured on this server.", {
      status: 503,
      code: "fiscal_ai_not_configured",
    });
  }

  return {
    apiKey,
    baseUrl: (process.env.FISCAL_AI_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ""),
  };
}

async function requestJson(path, params = {}, { revalidate = DEFAULT_REVALIDATE_SECONDS } = {}) {
  const { apiKey, baseUrl } = configuration();
  const url = new URL(path, `${baseUrl}/`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response;
  try {
    response = await fetch(url, {
      headers: { "X-Api-Key": apiKey, Accept: "application/json" },
      cache: "force-cache",
      next: { revalidate },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new FiscalAiError("Fiscal.ai could not be reached.", {
      status: 502,
      code: "fiscal_ai_unreachable",
      details: error?.message || null,
    });
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error || body?.message || `Fiscal.ai returned HTTP ${response.status}.`;
    throw new FiscalAiError(message, {
      status: response.status,
      code: response.status === 429 ? "fiscal_ai_rate_limited" : "fiscal_ai_request_failed",
    });
  }

  return body;
}

export function listFiscalCompanies({ page = 1, compact = true, allCompanies = false } = {}) {
  return requestJson("/v3/companies-list", {
    pageNumber: Math.max(1, Number(page) || 1),
    compact,
    allCompanies,
  });
}

export function getFiscalCompanyProfile(companyKey) {
  return requestJson("/v3/company/profile", { companyKey });
}

export function getFiscalStockPrices(companyKey, { startDate, endDate, latest } = {}) {
  return requestJson("/v3/company/stock-prices", { companyKey, startDate, endDate, latest });
}

export function getFiscalIncomeStatement(fscl, { periodType = "annual" } = {}) {
  return requestJson("/v1/company/financials/income-statement/standardized", { fscl, periodType });
}

export function getFiscalRatios(fscl, { periodType = "annual" } = {}) {
  return requestJson("/v1/company/ratios", { fscl, periodType });
}

export function getFiscalNewsSummary(fscl) {
  return requestJson("/v1/company/news-summary", { fscl }, { revalidate: 24 * 60 * 60 });
}
