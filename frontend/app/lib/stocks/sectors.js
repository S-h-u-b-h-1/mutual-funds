// Sector/industry intelligence — Sections 11-12 of the Stock Intelligence build. Schema:
// sql/neon/035_stock_intelligence_foundation.sql (company_sectors, company_industries,
// sector_operating_metric_templates, company_operational_metrics). The template registry is what
// lets a bank's page ask for NIM/GNPA/NNPA/CASA and a cement page ask for capacity/utilization/
// realization instead of both being forced through one generic metric shape — see that
// migration's comment on sector_operating_metric_templates for the full reasoning.
import { query } from "../db.js";

export async function listSectors() {
  const r = await query(`select id, name, slug, description, created_at from company_sectors order by name`);
  return r.rows;
}

export async function getSector(sectorId) {
  const r = await query(`select id, name, slug, description, created_at from company_sectors where id = $1`, [sectorId]);
  return r.rows[0] ?? null;
}

export async function listIndustries(sectorId) {
  const r = await query(
    `select id, sector_id, name, slug, description, created_at
       from company_industries
      where sector_id = $1
      order by name`,
    [sectorId]
  );
  return r.rows;
}

export async function getSectorCompanies(sectorId, { industryId } = {}) {
  const conditions = ["sector_id = $1"];
  const params = [sectorId];
  if (industryId) {
    params.push(industryId);
    conditions.push(`industry_id = $${params.length}`);
  }
  const r = await query(
    `select id, display_name, legal_name, nse_symbol, bse_code, industry_id, listing_status
       from companies
      where ${conditions.join(" and ")}
      order by display_name`,
    params
  );
  return r.rows;
}

// The list of {metric_key, label, unit, description} a page/API caller should ask
// company_operational_metrics for, given a sector — the per-sector template that makes
// Section 11's "no one generic template for every industry" real rather than aspirational.
export async function getSectorOperatingMetricTemplate(sectorId) {
  const r = await query(
    `select metric_key, label, unit, description
       from sector_operating_metric_templates
      where sector_id = $1
      order by label`,
    [sectorId]
  );
  return r.rows;
}

// Admin/seed-time write. on conflict target matches the table's own unique(sector_id, metric_key)
// — resubmitting the same metric for a sector corrects the row in place instead of duplicating it.
export async function upsertSectorOperatingMetricTemplate({ sectorId, metricKey, label, unit, description = null }) {
  const r = await query(
    `insert into sector_operating_metric_templates (sector_id, metric_key, label, unit, description)
     values ($1, $2, $3, $4, $5)
     on conflict (sector_id, metric_key) do update set
       label = excluded.label, unit = excluded.unit, description = excluded.description
     returning *`,
    [sectorId, metricKey, label, unit, description]
  );
  return r.rows[0];
}

// A time series for one company — optionally narrowed to one metric key (e.g. quarterly capacity
// utilization only), newest period first. `value`/other numeric columns come back from pg as
// strings (numeric has no default type parser, to avoid precision loss) — callers that need to do
// arithmetic on them must wrap with Number() themselves; this layer returns exactly what the row
// contains, no implicit coercion.
export async function getCompanyOperationalMetrics(companyId, { metricKey, limit = 12 } = {}) {
  const conditions = ["company_id = $1"];
  const params = [companyId];
  if (metricKey) {
    params.push(metricKey);
    conditions.push(`metric_key = $${params.length}`);
  }
  params.push(limit);
  const r = await query(
    `select id, company_id, metric_key, value, unit, period_type, period_end_date, source, source_date, created_at
       from company_operational_metrics
      where ${conditions.join(" and ")}
      order by period_end_date desc
      limit $${params.length}`,
    params
  );
  return r.rows;
}

// on conflict target matches unique(company_id, metric_key, period_end_date) — re-ingesting the
// same company/metric/period (e.g. a corrected source document) updates that one row in place
// rather than creating a second row for the same period.
export async function upsertCompanyOperationalMetric({
  companyId, metricKey, value, unit, periodType, periodEndDate, source, sourceDate = null,
}) {
  const r = await query(
    `insert into company_operational_metrics
       (company_id, metric_key, value, unit, period_type, period_end_date, source, source_date)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (company_id, metric_key, period_end_date) do update set
       value = excluded.value, unit = excluded.unit, period_type = excluded.period_type,
       source = excluded.source, source_date = excluded.source_date
     returning *`,
    [companyId, metricKey, value, unit, periodType, periodEndDate, source, sourceDate]
  );
  return r.rows[0];
}

// Deliberately small and honest. Most companies won't have financial/valuation data ingested this
// early, so a "sector average P/E" or "sector market cap" computed over whichever few rows happen
// to exist would misrepresent itself as sector-representative — exactly the kind of fabricated-
// from-partial-data aggregate this codebase avoids elsewhere (see e.g. company_commodity_exposures'
// qualitative-only significance field in migration 035). This function only ever returns counts
// that are true of EVERY row they cover: how many companies are in the sector, and how many of
// those have at least one valuation snapshot on file at all. If/when coverage is high enough for a
// real average/aggregate to be honest, add it here explicitly — don't let a partial-coverage
// number masquerade as a full one now.
export async function getSectorAggregates(sectorId) {
  const companyCount = await query(`select count(*)::int as count from companies where sector_id = $1`, [sectorId]);
  const withValuation = await query(
    `select count(distinct cvs.company_id)::int as count
       from company_valuation_snapshots cvs
       join companies c on c.id = cvs.company_id
      where c.sector_id = $1`,
    [sectorId]
  );
  return {
    sectorId,
    companyCount: companyCount.rows[0].count,
    companiesWithValuationSnapshot: withValuation.rows[0].count,
  };
}
