// Stock Master — canonical company/security identity (Stock Intelligence, Section 2). A new
// domain, deliberately separate from the mutual-fund business: no import from or reference to
// any portfolioImport/*, scheme_code, or fund_history_events code. See
// sql/neon/035_stock_intelligence_foundation.sql for the full schema this operates on.
import { query, withTransaction } from "../db.js";

const LISTING_STATUSES = new Set(["listed", "delisted", "suspended", "pre_ipo"]);
const EXCHANGES = new Set(["NSE", "BSE"]);
const IDENTIFIER_TYPES = new Set(["isin", "nse_symbol", "bse_code", "legal_name", "display_name", "sector", "industry"]);

const COMPANY_COLUMNS =
  "id, legal_name, display_name, isin, nse_symbol, bse_code, sector_id, industry_id, listing_status, " +
  "incorporation_country, website, registered_office, description, description_source, description_as_of, created_at, updated_at";

function shapeCompany(row) {
  if (!row) return null;
  return {
    id: row.id,
    legalName: row.legal_name,
    displayName: row.display_name,
    isin: row.isin,
    nseSymbol: row.nse_symbol,
    bseCode: row.bse_code,
    sectorId: row.sector_id,
    industryId: row.industry_id,
    listingStatus: row.listing_status,
    incorporationCountry: row.incorporation_country,
    website: row.website,
    registeredOffice: row.registered_office,
    description: row.description,
    descriptionSource: row.description_source,
    descriptionAsOf: row.description_as_of,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createCompany({
  legalName, displayName, isin = null, nseSymbol = null, bseCode = null, sectorId = null, industryId = null,
  listingStatus = "listed", incorporationCountry = "IN", website = null, registeredOffice = null,
  description = null, descriptionSource = null, descriptionAsOf = null,
}) {
  if (!legalName || !displayName) throw new Error("createCompany requires legalName and displayName.");
  if (!LISTING_STATUSES.has(listingStatus)) throw new Error(`createCompany: invalid listingStatus '${listingStatus}'.`);
  const r = await query(
    `insert into companies (legal_name, display_name, isin, nse_symbol, bse_code, sector_id, industry_id, listing_status, incorporation_country, website, registered_office, description, description_source, description_as_of)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     returning ${COMPANY_COLUMNS}`,
    [legalName, displayName, isin, nseSymbol, bseCode, sectorId, industryId, listingStatus, incorporationCountry, website, registeredOffice, description, descriptionSource, descriptionAsOf]
  );
  return shapeCompany(r.rows[0]);
}

export async function getCompanyById(companyId) {
  const r = await query(`select ${COMPANY_COLUMNS} from companies where id = $1`, [companyId]);
  return shapeCompany(r.rows[0]);
}

// Looks a company up by whichever identifier the caller has on hand — a scheme upload, a
// screener seed script, and a document-ingestion job each start from a different one of these.
export async function getCompanyByIdentifier({ isin, nseSymbol, bseCode } = {}) {
  if (isin) {
    const r = await query(`select ${COMPANY_COLUMNS} from companies where isin = $1`, [isin]);
    if (r.rows[0]) return shapeCompany(r.rows[0]);
  }
  if (nseSymbol) {
    const r = await query(`select ${COMPANY_COLUMNS} from companies where nse_symbol = $1`, [nseSymbol]);
    if (r.rows[0]) return shapeCompany(r.rows[0]);
  }
  if (bseCode) {
    const r = await query(`select ${COMPANY_COLUMNS} from companies where bse_code = $1`, [bseCode]);
    if (r.rows[0]) return shapeCompany(r.rows[0]);
  }
  return null;
}

// General-purpose discovery listing (Section 2's own /stocks route) — optionally narrowed to a
// sector and/or industry. Unlike searchCompanies, an empty filter is valid here (browsing, not
// searching) and returns the first page of every listed company.
export async function listCompaniesBySector({ sectorId = null, industryId = null, limit = 50 } = {}) {
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
  const conditions = ["listing_status = 'listed'"];
  const params = [];
  if (sectorId) { params.push(sectorId); conditions.push(`sector_id = $${params.length}`); }
  if (industryId) { params.push(industryId); conditions.push(`industry_id = $${params.length}`); }
  params.push(clampedLimit);
  const r = await query(
    `select ${COMPANY_COLUMNS} from companies where ${conditions.join(" and ")} order by display_name asc limit $${params.length}`,
    params
  );
  return r.rows.map(shapeCompany);
}

export async function searchCompanies(searchText, { limit = 20 } = {}) {
  const term = String(searchText || "").trim();
  if (!term) return [];
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const r = await query(
    `select ${COMPANY_COLUMNS} from companies
     where display_name ilike $1 or legal_name ilike $1 or nse_symbol ilike $1 or bse_code ilike $1 or isin ilike $1
     order by (display_name ilike $2) desc, display_name asc
     limit $3`,
    [`%${term}%`, `${term}%`, clampedLimit]
  );
  return r.rows.map(shapeCompany);
}

// THE anti-duplication mechanism (Section 2: "Corporate actions / renamed entities must not
// create duplicate companies"). Updates the current value on `companies` and appends to
// company_identifier_history in one transaction — a rename must never be modeled as inserting a
// second companies row. identifierType must be one of the columns this function knows how to
// update; 'sector'/'industry' record a history entry without touching a text column since those
// are FK columns resolved by the caller (pass sectorId/industryId separately if changing them).
export async function renameCompanyIdentifier(companyId, { identifierType, newValue, reason = null, source = null }) {
  if (!IDENTIFIER_TYPES.has(identifierType)) throw new Error(`renameCompanyIdentifier: invalid identifierType '${identifierType}'.`);
  const columnByType = { isin: "isin", nse_symbol: "nse_symbol", bse_code: "bse_code", legal_name: "legal_name", display_name: "display_name" };
  const column = columnByType[identifierType];
  if (!column) throw new Error(`renameCompanyIdentifier: '${identifierType}' has no direct column — update sector_id/industry_id via a dedicated call and pass the resolved id, then record history separately.`);

  return withTransaction(async (client) => {
    const current = await client.query(`select ${column} as current_value from companies where id = $1`, [companyId]);
    if (!current.rows[0]) throw new Error(`renameCompanyIdentifier: company ${companyId} not found.`);
    const oldValue = current.rows[0].current_value;

    await client.query(`update companies set ${column} = $1, updated_at = now() where id = $2`, [newValue, companyId]);
    await client.query(
      `insert into company_identifier_history (company_id, identifier_type, old_value, new_value, reason, source)
       values ($1, $2, $3, $4, $5, $6)`,
      [companyId, identifierType, oldValue, newValue, reason, source]
    );
    return { companyId, identifierType, oldValue, newValue };
  });
}

export async function getIdentifierHistory(companyId) {
  const r = await query(
    `select identifier_type, old_value, new_value, effective_date, reason, source, created_at
     from company_identifier_history where company_id = $1 order by effective_date desc, created_at desc`,
    [companyId]
  );
  return r.rows.map((row) => ({
    identifierType: row.identifier_type,
    oldValue: row.old_value,
    newValue: row.new_value,
    effectiveDate: row.effective_date,
    reason: row.reason,
    source: row.source,
    createdAt: row.created_at,
  }));
}

// A company can be listed on NSE, BSE, or both, with an independent symbol/code and
// listed/delisted date on each — see the schema file's header comment on this table for why
// that can't be modeled as just the nse_symbol/bse_code columns on `companies`.
function shapeExchangeListing(row) {
  if (!row) return null;
  return { exchange: row.exchange, symbolOrCode: row.symbol_or_code, listedAt: row.listed_at, delistedAt: row.delisted_at, isActive: row.is_active };
}

export async function addExchangeListing(companyId, { exchange, symbolOrCode, listedAt = null }) {
  if (!EXCHANGES.has(exchange)) throw new Error(`addExchangeListing: invalid exchange '${exchange}'.`);
  const r = await query(
    `insert into company_exchange_listings (company_id, exchange, symbol_or_code, listed_at)
     values ($1, $2, $3, $4)
     on conflict (exchange, symbol_or_code) do update set company_id = excluded.company_id, listed_at = excluded.listed_at, is_active = true
     returning id, exchange, symbol_or_code, listed_at, delisted_at, is_active`,
    [companyId, exchange, symbolOrCode, listedAt]
  );
  return shapeExchangeListing(r.rows[0]);
}

export async function delistExchangeListing(companyId, exchange, delistedAt = new Date().toISOString().slice(0, 10)) {
  const r = await query(
    `update company_exchange_listings set delisted_at = $3, is_active = false
     where company_id = $1 and exchange = $2 and is_active = true
     returning id, exchange, symbol_or_code, listed_at, delisted_at, is_active`,
    [companyId, exchange, delistedAt]
  );
  return shapeExchangeListing(r.rows[0]);
}

export async function getExchangeListings(companyId) {
  const r = await query(
    `select exchange, symbol_or_code, listed_at, delisted_at, is_active from company_exchange_listings
     where company_id = $1 order by is_active desc, exchange asc`,
    [companyId]
  );
  return r.rows.map(shapeExchangeListing);
}
