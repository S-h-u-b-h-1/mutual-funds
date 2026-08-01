// Valuation (Stock Intelligence) — periodic price/multiple snapshots (company_valuation_snapshots).
// Deliberately NOT a live-recomputed column on `companies`: a price-dependent field would go stale
// the instant the underlying feed disconnects. Sector/peer medians (Section 6) are likewise
// deliberately NOT stored — see getSectorMedianValuation's comment for why, and
// getPeerMedianValuation's for the peer-set definition (Section 10: must stay transparent, never
// silent).
import { query } from "../db.js";

function numOrNull(value) {
  return value === null || value === undefined ? null : Number(value);
}

// Every numeric column on company_valuation_snapshots is nullable (a company can have a price on
// file with no computable PE yet, e.g. negative earnings) — Number(row.x) without this guard would
// silently turn a real NULL into a fabricated 0 (a "PE of 0" reads as "free stock", not "unknown").
function shapeSnapshot(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    asOfDate: row.as_of_date,
    price: numOrNull(row.price),
    sharesOutstanding: numOrNull(row.shares_outstanding),
    marketCap: numOrNull(row.market_cap),
    pe: numOrNull(row.pe),
    pb: numOrNull(row.pb),
    evEbitda: numOrNull(row.ev_ebitda),
    evSales: numOrNull(row.ev_sales),
    peg: numOrNull(row.peg),
    dividendYield: numOrNull(row.dividend_yield),
    fcfYield: numOrNull(row.fcf_yield),
    source: row.source,
    computedAt: row.computed_at,
  };
}

export async function upsertValuationSnapshot({
  companyId, asOfDate, price = null, sharesOutstanding = null, marketCap = null, pe = null, pb = null,
  evEbitda = null, evSales = null, peg = null, dividendYield = null, fcfYield = null, source,
}) {
  if (!companyId) throw new Error("upsertValuationSnapshot requires companyId.");
  if (!asOfDate) throw new Error("upsertValuationSnapshot requires asOfDate.");
  if (!source) throw new Error("upsertValuationSnapshot requires source.");

  const r = await query(
    `insert into company_valuation_snapshots
       (company_id, as_of_date, price, shares_outstanding, market_cap, pe, pb, ev_ebitda, ev_sales, peg, dividend_yield, fcf_yield, source)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (company_id, as_of_date) do update set
       price = excluded.price, shares_outstanding = excluded.shares_outstanding, market_cap = excluded.market_cap,
       pe = excluded.pe, pb = excluded.pb, ev_ebitda = excluded.ev_ebitda, ev_sales = excluded.ev_sales,
       peg = excluded.peg, dividend_yield = excluded.dividend_yield, fcf_yield = excluded.fcf_yield,
       source = excluded.source, computed_at = now()
     returning *`,
    [companyId, asOfDate, price, sharesOutstanding, marketCap, pe, pb, evEbitda, evSales, peg, dividendYield, fcfYield, source]
  );
  return shapeSnapshot(r.rows[0]);
}

export async function getLatestValuation(companyId) {
  const r = await query(
    `select * from company_valuation_snapshots where company_id = $1 order by as_of_date desc limit 1`,
    [companyId]
  );
  return shapeSnapshot(r.rows[0]);
}

export async function getValuationHistory(companyId, { limit = 252 } = {}) {
  const r = await query(
    `select * from company_valuation_snapshots where company_id = $1 order by as_of_date desc limit $2`,
    [companyId, limit]
  );
  return r.rows.map(shapeSnapshot);
}

// Shared "latest snapshot on or before asOfDate, one row per company, median across the group"
// query behind both getSectorMedianValuation and getPeerMedianValuation below. `column` is always
// one of two hardcoded literals ("sector_id"/"industry_id") passed by those two functions — never
// request payload — same reasoning complianceService.js's setItemStatus uses for its own
// internal-dispatch-only string interpolation, so this is not a SQL-injection surface.
async function medianValuationQuery({ column, value, asOfDate, excludeCompanyId = null }) {
  const params = [value, asOfDate];
  let excludeClause = "";
  if (excludeCompanyId) {
    params.push(excludeCompanyId);
    excludeClause = `and c.id != $${params.length}`;
  }
  // DISTINCT ON (company_id), ordered by as_of_date desc within the as_of_date <= cutoff filter,
  // picks exactly one row per company: its most recent snapshot at-or-before asOfDate. A company
  // with two snapshots on file only ever contributes one value to the median, never both, and a
  // snapshot dated after asOfDate never leaks into a median computed for an earlier cutoff.
  // percentile_cont(0.5) is a real, continuous statistical median (interpolated for even counts),
  // not an average — FILTER (WHERE x IS NOT NULL) makes the null-exclusion explicit per column
  // rather than relying on default aggregate null-handling, so a company missing just one multiple
  // (e.g. no dividend_yield) still contributes its other multiples to their respective medians.
  const r = await query(
    `with latest_per_company as (
       select distinct on (cvs.company_id)
         cvs.company_id, cvs.pe, cvs.pb, cvs.ev_ebitda, cvs.dividend_yield
       from company_valuation_snapshots cvs
       join companies c on c.id = cvs.company_id
       where c.${column} = $1 and cvs.as_of_date <= $2 ${excludeClause}
       order by cvs.company_id, cvs.as_of_date desc
     )
     select
       count(*)::int as company_count,
       percentile_cont(0.5) within group (order by pe) filter (where pe is not null) as median_pe,
       percentile_cont(0.5) within group (order by pb) filter (where pb is not null) as median_pb,
       percentile_cont(0.5) within group (order by ev_ebitda) filter (where ev_ebitda is not null) as median_ev_ebitda,
       percentile_cont(0.5) within group (order by dividend_yield) filter (where dividend_yield is not null) as median_dividend_yield
     from latest_per_company`,
    params
  );
  const row = r.rows[0];
  return {
    companyCount: row.company_count,
    medianPe: numOrNull(row.median_pe),
    medianPb: numOrNull(row.median_pb),
    medianEvEbitda: numOrNull(row.median_ev_ebitda),
    medianDividendYield: numOrNull(row.median_dividend_yield),
  };
}

// Computed at query time, on every call, specifically so it can never drift stale relative to the
// underlying company_valuation_snapshots rows — a deliberate schema choice (see
// sql/neon/035_stock_intelligence_foundation.sql's comment on that table: no stored median column
// exists on purpose). Real statistical median (percentile_cont), not an average — an average would
// let one extreme outlier distort "typical" sector valuation.
export async function getSectorMedianValuation(sectorId, asOfDate) {
  if (!sectorId) throw new Error("getSectorMedianValuation requires sectorId.");
  if (!asOfDate) throw new Error("getSectorMedianValuation requires asOfDate.");
  const medians = await medianValuationQuery({ column: "sector_id", value: sectorId, asOfDate });
  return {
    sectorId,
    asOfDate,
    ...medians,
    reason: medians.companyCount === 0 ? "No companies with a valuation snapshot on or before asOfDate found in this sector." : null,
  };
}

// Peer-set definition (Section 10: must stay transparent, never silent) — every OTHER company
// sharing companyId's industry_id, evaluated as of the same asOfDate cutoff as the median itself.
// Industry, not sector, is the peer grouping: sector is the broader taxonomy level (see
// company_industries — many industries per sector), industry is the narrower, genuinely comparable
// one. If companyId has no industry_id on file, this returns null medians with an explicit reason
// rather than silently falling back to sector or guessing a peer set.
export async function getPeerMedianValuation(companyId, asOfDate) {
  if (!companyId) throw new Error("getPeerMedianValuation requires companyId.");
  if (!asOfDate) throw new Error("getPeerMedianValuation requires asOfDate.");

  const companyResult = await query(`select industry_id from companies where id = $1`, [companyId]);
  const company = companyResult.rows[0];
  const emptyMedians = { companyCount: 0, medianPe: null, medianPb: null, medianEvEbitda: null, medianDividendYield: null };

  if (!company) {
    return { companyId, asOfDate, industryId: null, ...emptyMedians, reason: `No company found with id ${companyId}.` };
  }
  if (!company.industry_id) {
    return { companyId, asOfDate, industryId: null, ...emptyMedians, reason: "Company has no industry_id set — cannot determine a peer set without guessing." };
  }

  const medians = await medianValuationQuery({ column: "industry_id", value: company.industry_id, asOfDate, excludeCompanyId: companyId });
  return {
    companyId,
    asOfDate,
    industryId: company.industry_id,
    ...medians,
    reason: medians.companyCount === 0 ? "No peer companies (same industry_id) with a valuation snapshot on or before asOfDate." : null,
  };
}

// Individual peer rows (identity + latest valuation each), same peer-set definition as
// getPeerMedianValuation above (same industry_id, excluding the company itself) — kept
// byte-for-byte consistent with it so "who are the peers" and "what's the peer median" can never
// silently disagree about who counts as a peer. Peer selection is deliberately this simple and
// transparent (Section 10) rather than a similarity score or market-cap-band heuristic that would
// need its own justification. Only valuation fields are returned per peer this pass — full
// fundamental metrics (ROE/ROCE/growth) per peer is a natural next step once this is proven, not
// built here to keep this composition's cost bounded (it would mean fetching and computing
// metrics for every peer on every call).
export async function getPeerCompanies(companyId) {
  if (!companyId) throw new Error("getPeerCompanies requires companyId.");
  const companyResult = await query(`select industry_id from companies where id = $1`, [companyId]);
  const company = companyResult.rows[0];
  if (!company) return { companyId, industryId: null, peers: [], reason: `No company found with id ${companyId}.` };
  if (!company.industry_id) return { companyId, industryId: null, peers: [], reason: "Company has no industry_id set — cannot determine a peer set without guessing." };

  const r = await query(
    `select distinct on (c.id) c.id, c.display_name, c.nse_symbol, c.bse_code,
            cvs.price, cvs.market_cap, cvs.pe, cvs.pb, cvs.ev_ebitda, cvs.dividend_yield, cvs.as_of_date
       from companies c
       left join company_valuation_snapshots cvs on cvs.company_id = c.id
      where c.industry_id = $1 and c.id != $2
      order by c.id, cvs.as_of_date desc`,
    [company.industry_id, companyId]
  );
  return {
    companyId,
    industryId: company.industry_id,
    peers: r.rows.map((row) => ({
      companyId: row.id,
      displayName: row.display_name,
      nseSymbol: row.nse_symbol,
      bseCode: row.bse_code,
      valuation: row.as_of_date === null ? null : {
        asOfDate: row.as_of_date,
        price: numOrNull(row.price),
        marketCap: numOrNull(row.market_cap),
        pe: numOrNull(row.pe),
        pb: numOrNull(row.pb),
        evEbitda: numOrNull(row.ev_ebitda),
        dividendYield: numOrNull(row.dividend_yield),
      },
    })),
    reason: r.rows.length === 0 ? "No other companies share this industry_id yet." : null,
  };
}
