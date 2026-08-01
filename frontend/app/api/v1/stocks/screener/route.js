// Deterministic stock screener — public, POST (a filter group is a request body, not a query
// string). Body: { filterGroup, sortBy, sortDirection, limit } — or { screen: "highRoce" } to run
// one of screener.js's EXAMPLE_SCREENS by name.
//
// Field resolution this pass: every listed company annotated with its latest valuation snapshot
// (marketCap/pe/pb/evEbitda/dividendYield) plus sector_id/industry_id — cheap, one query,
// acceptable at this domain's current scale. Fundamental-statement-derived fields (roce,
// debtToEquity, salesGrowth5y, ...) are NOT resolved here yet: doing so would mean fetching and
// computing metrics.js's full output for every listed company on every screener call, which needs
// either a much smaller candidate set first or a precomputed/cached metrics table — a real
// optimization to build once real financial-statement data exists, not before. Until then, a
// filter referencing one of those fields simply matches nothing (screener.js's own designed
// behavior for a field that isn't present on a company), which is honest, not broken.
import { query } from "../../../../lib/db";
import { runScreener, EXAMPLE_SCREENS } from "../../../../lib/stocks/screener";
import { withObservability } from "../../../../lib/platform/observability/core";

async function loadScreenableCompanies() {
  const r = await query(
    `select distinct on (c.id)
        c.id as company_id, c.display_name, c.nse_symbol, c.bse_code, c.sector_id, c.industry_id,
        cvs.market_cap, cvs.pe, cvs.pb, cvs.ev_ebitda, cvs.dividend_yield
       from companies c
       left join company_valuation_snapshots cvs on cvs.company_id = c.id
      where c.listing_status = 'listed'
      order by c.id, cvs.as_of_date desc`
  );
  return r.rows.map((row) => ({
    companyId: row.company_id,
    displayName: row.display_name,
    nseSymbol: row.nse_symbol,
    bseCode: row.bse_code,
    sectorId: row.sector_id,
    industryId: row.industry_id,
    marketCap: row.market_cap === null ? null : Number(row.market_cap),
    pe: row.pe === null ? null : Number(row.pe),
    pb: row.pb === null ? null : Number(row.pb),
    evEbitda: row.ev_ebitda === null ? null : Number(row.ev_ebitda),
    dividendYield: row.dividend_yield === null ? null : Number(row.dividend_yield),
  }));
}

async function handlePOST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  let filterGroup = body?.filterGroup;
  if (body?.screen) {
    const named = EXAMPLE_SCREENS[body.screen];
    if (!named) return Response.json({ error: `Unknown screen '${body.screen}'. Available: ${Object.keys(EXAMPLE_SCREENS).join(", ")}` }, { status: 400 });
    filterGroup = named.filterGroup;
  }
  if (!filterGroup) return Response.json({ error: "filterGroup (or screen) is required" }, { status: 400 });

  const companies = await loadScreenableCompanies();
  try {
    const result = runScreener(companies, filterGroup, { sortBy: body?.sortBy, sortDirection: body?.sortDirection, limit: body?.limit });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: String(error?.message || error) }, { status: 400 });
  }
}

async function handleGET() {
  return Response.json({ availableScreens: Object.entries(EXAMPLE_SCREENS).map(([key, s]) => ({ key, label: s.label, description: s.description })) });
}

export const POST = withObservability("POST /api/v1/stocks/screener", handlePOST);
export const GET = withObservability("GET /api/v1/stocks/screener", handleGET);
