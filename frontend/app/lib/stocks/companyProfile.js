// Company Profile (Stock Intelligence, Section 3) — ownership/management/subsidiaries/segments,
// each a row-per-fact table so every fact carries its own as_of_date/source rather than a single
// JSON blob nobody can attach provenance to individually. getCompanyPageContract() assembles the
// full "everything about a company" response the eventual /stocks/:id API route (Section 27)
// returns to Codex, in one deterministic shape.
import { query } from "../db.js";
import { getCompanyById, getExchangeListings } from "./companyService.js";

const OWNER_TYPES = new Set(["promoter", "institutional", "public", "other"]);
const SEGMENT_RELATIONSHIPS = new Set(["subsidiary", "associate", "joint_venture", "brand"]);

export async function addOwnershipRecord({ companyId, holderType, holderName = null, holdingPercent = null, asOfDate, source }) {
  if (!OWNER_TYPES.has(holderType)) throw new Error(`addOwnershipRecord: invalid holderType '${holderType}'.`);
  if (!asOfDate || !source) throw new Error("addOwnershipRecord requires asOfDate and source — ownership figures without provenance are not recorded.");
  const r = await query(
    `insert into company_ownership (company_id, holder_type, holder_name, holding_percent, as_of_date, source)
     values ($1,$2,$3,$4,$5,$6) returning id, holder_type, holder_name, holding_percent, as_of_date, source`,
    [companyId, holderType, holderName, holdingPercent, asOfDate, source]
  );
  return r.rows[0];
}

export async function getOwnership(companyId) {
  const r = await query(
    `select holder_type, holder_name, holding_percent, as_of_date, source from company_ownership
     where company_id = $1 order by as_of_date desc, holder_type asc`,
    [companyId]
  );
  return r.rows.map((row) => ({ holderType: row.holder_type, holderName: row.holder_name, holdingPercent: row.holding_percent, asOfDate: row.as_of_date, source: row.source }));
}

export async function addManagementRecord({ companyId, personName, role, sinceDate = null, untilDate = null, source = null }) {
  if (!personName || !role) throw new Error("addManagementRecord requires personName and role.");
  const r = await query(
    `insert into company_management (company_id, person_name, role, since_date, until_date, source)
     values ($1,$2,$3,$4,$5,$6) returning id, person_name, role, since_date, until_date, source`,
    [companyId, personName, role, sinceDate, untilDate, source]
  );
  return r.rows[0];
}

export async function getManagement(companyId, { currentOnly = true } = {}) {
  const r = await query(
    `select person_name, role, since_date, until_date, source from company_management
     where company_id = $1 ${currentOnly ? "and until_date is null" : ""}
     order by since_date desc nulls last`,
    [companyId]
  );
  return r.rows.map((row) => ({ personName: row.person_name, role: row.role, sinceDate: row.since_date, untilDate: row.until_date, source: row.source }));
}

export async function addSubsidiary({ companyId, subsidiaryName, relationship = "subsidiary", ownershipPercent = null, source = null, asOfDate = null }) {
  if (!subsidiaryName) throw new Error("addSubsidiary requires subsidiaryName.");
  if (!SEGMENT_RELATIONSHIPS.has(relationship)) throw new Error(`addSubsidiary: invalid relationship '${relationship}'.`);
  const r = await query(
    `insert into company_subsidiaries (company_id, subsidiary_name, relationship, ownership_percent, source, as_of_date)
     values ($1,$2,$3,$4,$5,$6) returning id, subsidiary_name, relationship, ownership_percent, source, as_of_date`,
    [companyId, subsidiaryName, relationship, ownershipPercent, source, asOfDate]
  );
  return r.rows[0];
}

export async function getSubsidiaries(companyId) {
  const r = await query(
    `select subsidiary_name, relationship, ownership_percent, source, as_of_date from company_subsidiaries
     where company_id = $1 order by relationship asc, subsidiary_name asc`,
    [companyId]
  );
  return r.rows.map((row) => ({ subsidiaryName: row.subsidiary_name, relationship: row.relationship, ownershipPercent: row.ownership_percent, source: row.source, asOfDate: row.as_of_date }));
}

export async function addBusinessSegment({ companyId, segmentName, description = null, revenueSharePercent = null, asOfPeriod = null, source = null }) {
  if (!segmentName) throw new Error("addBusinessSegment requires segmentName.");
  const r = await query(
    `insert into company_business_segments (company_id, segment_name, description, revenue_share_percent, as_of_period, source)
     values ($1,$2,$3,$4,$5,$6) returning id, segment_name, description, revenue_share_percent, as_of_period, source`,
    [companyId, segmentName, description, revenueSharePercent, asOfPeriod, source]
  );
  return r.rows[0];
}

export async function getBusinessSegments(companyId) {
  const r = await query(
    `select segment_name, description, revenue_share_percent, as_of_period, source from company_business_segments
     where company_id = $1 order by revenue_share_percent desc nulls last`,
    [companyId]
  );
  return r.rows.map((row) => ({ segmentName: row.segment_name, description: row.description, revenueSharePercent: row.revenue_share_percent, asOfPeriod: row.as_of_period, source: row.source }));
}

// The full company-page response shape (Section 27's future /stocks/:id route). Deliberately does
// NOT include financial statements/metrics/valuation/timeline/screener membership — those are
// separately-owned modules (financialStatements.js, metrics.js, valuation.js, timeline.js) with
// their own query shapes; a route handler composes this with those, rather than this function
// reaching into tables it doesn't own. Returns null (not a partial object) if the company doesn't
// exist, so a caller can't accidentally render a page for a company that was never found.
export async function getCompanyPageContract(companyId) {
  const company = await getCompanyById(companyId);
  if (!company) return null;
  const [exchangeListings, ownership, management, subsidiaries, businessSegments] = await Promise.all([
    getExchangeListings(companyId),
    getOwnership(companyId),
    getManagement(companyId),
    getSubsidiaries(companyId),
    getBusinessSegments(companyId),
  ]);
  return { company, exchangeListings, ownership, management, subsidiaries, businessSegments };
}
