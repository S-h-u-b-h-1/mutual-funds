// Commodity intelligence + company exposure (Stock Intelligence, Sections 13 & 15). Persistence
// layer around commodities/commodity_prices/company_commodity_exposures — never itself calls out
// to a real vendor; see providers/types.js and providers/mock/MockCommodityProvider.js for the
// provider seam this ingests from.
import { query } from "../db.js";

const EXPOSURE_TYPES = new Set(["input", "output"]);
const SIGNIFICANCE_LEVELS = new Set(["primary", "significant", "minor"]);

export async function upsertCommodity({ name, category, defaultUnit, description = null }) {
  if (!name || !category || !defaultUnit) throw new Error("upsertCommodity requires name, category, and defaultUnit.");
  const r = await query(
    `insert into commodities (name, category, default_unit, description) values ($1,$2,$3,$4)
     on conflict (name) do update set category = excluded.category, default_unit = excluded.default_unit, description = excluded.description
     returning id, name, category, default_unit, description, created_at`,
    [name, category, defaultUnit, description]
  );
  return shapeCommodity(r.rows[0]);
}

function shapeCommodity(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, category: row.category, defaultUnit: row.default_unit, description: row.description, createdAt: row.created_at };
}

export async function getCommodityByName(name) {
  const r = await query(`select id, name, category, default_unit, description, created_at from commodities where name = $1`, [name]);
  return shapeCommodity(r.rows[0]);
}

export async function listCommodities() {
  const r = await query(`select id, name, category, default_unit, description, created_at from commodities order by category, name`);
  return r.rows.map(shapeCommodity);
}

function shapePriceRow(row) {
  return {
    id: row.id,
    commodityId: row.commodity_id,
    grade: row.grade,
    location: row.location,
    unit: row.unit,
    currency: row.currency,
    price: Number(row.price),
    assessmentDate: row.assessment_date,
    source: row.source,
    methodologyRef: row.methodology_ref,
    fetchedAt: row.fetched_at,
  };
}

export async function recordCommodityPrice(commodityId, { grade = null, location = null, unit, currency = "INR", price, assessmentDate, source, methodologyRef = null, fetchedAt = null }) {
  if (price == null || !unit || !assessmentDate || !source) throw new Error("recordCommodityPrice requires price, unit, assessmentDate, and source.");
  const r = await query(
    `insert into commodity_prices (commodity_id, grade, location, unit, currency, price, assessment_date, source, methodology_ref, fetched_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9, coalesce($10, now())) returning *`,
    [commodityId, grade, location, unit, currency, price, assessmentDate, source, methodologyRef, fetchedAt]
  );
  return shapePriceRow(r.rows[0]);
}

// Looks up (or registers, from the provider's own catalog) the commodity row, then persists
// whatever the provider currently reports as the latest price. The provider is the source of
// truth for what "commodities" exist; this function never invents a commodity row on its own.
export async function ingestLatestPrice(provider, commodityName) {
  const priceResponse = await provider.getLatestPrice({ commodityName });
  if (!priceResponse) return null;
  let commodity = await getCommodityByName(commodityName);
  if (!commodity) {
    const catalog = await provider.listAvailableCommodities();
    const catalogEntry = catalog.find((c) => c.name === commodityName);
    commodity = await upsertCommodity({
      name: commodityName,
      category: catalogEntry?.category ?? "uncategorized",
      defaultUnit: catalogEntry?.defaultUnit ?? priceResponse.unit,
    });
  }
  return recordCommodityPrice(commodity.id, priceResponse);
}

export async function getLatestCommodityPrice(commodityId) {
  const r = await query(`select * from commodity_prices where commodity_id = $1 order by assessment_date desc, fetched_at desc limit 1`, [commodityId]);
  return r.rows[0] ? shapePriceRow(r.rows[0]) : null;
}

export async function getCommodityPriceHistory(commodityId, { limit = 90 } = {}) {
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 90, 1), 730);
  const r = await query(`select * from commodity_prices where commodity_id = $1 order by assessment_date desc limit $2`, [commodityId, clampedLimit]);
  return r.rows.map(shapePriceRow);
}

// ============================================================================
// Company <-> commodity exposure (Section 15). Deliberately qualitative (significance, not a
// numeric cost-share) — no verified source for exact input-cost-structure percentages exists yet.
// ============================================================================

export async function addCompanyCommodityExposure({ companyId, commodityId, exposureType, significance = null, description = null, source = null }) {
  if (!EXPOSURE_TYPES.has(exposureType)) throw new Error(`addCompanyCommodityExposure: invalid exposureType '${exposureType}'.`);
  if (significance != null && !SIGNIFICANCE_LEVELS.has(significance)) throw new Error(`addCompanyCommodityExposure: invalid significance '${significance}'.`);
  const r = await query(
    `insert into company_commodity_exposures (company_id, commodity_id, exposure_type, significance, description, source)
     values ($1,$2,$3,$4,$5,$6)
     on conflict (company_id, commodity_id, exposure_type) do update set significance = excluded.significance, description = excluded.description, source = excluded.source
     returning id, company_id, commodity_id, exposure_type, significance, description, source`,
    [companyId, commodityId, exposureType, significance, description, source]
  );
  return shapeExposure(r.rows[0]);
}

function shapeExposure(row) {
  return { id: row.id, companyId: row.company_id, commodityId: row.commodity_id, exposureType: row.exposure_type, significance: row.significance, description: row.description, source: row.source };
}

export async function getCompanyCommodityExposures(companyId) {
  const r = await query(
    `select e.id, e.company_id, e.commodity_id, e.exposure_type, e.significance, e.description, e.source, c.name as commodity_name, c.category as commodity_category
     from company_commodity_exposures e join commodities c on c.id = e.commodity_id
     where e.company_id = $1 order by e.exposure_type, e.significance nulls last`,
    [companyId]
  );
  return r.rows.map((row) => ({ ...shapeExposure(row), commodityName: row.commodity_name, commodityCategory: row.commodity_category }));
}

// Section 15's core deliverable: explain input-cost-exposure direction ("iron ore prices are up
// X% over the period") WITHOUT claiming a profit impact — margin effects depend on pricing power,
// hedging, and inventory timing this data does not capture, so that caveat is baked into every
// note returned here rather than left to whatever UI copy renders it later.
export async function explainCompanyCommodityExposure(companyId, { lookbackDays = 30 } = {}) {
  const exposures = await getCompanyCommodityExposures(companyId);
  const inputExposures = exposures.filter((e) => e.exposureType === "input");

  const explanations = [];
  for (const exposure of inputExposures) {
    const history = await getCommodityPriceHistory(exposure.commodityId, { limit: lookbackDays + 5 });
    if (history.length < 2) {
      explanations.push({ ...exposure, direction: "unknown", percentChange: null, note: `No sufficient price history on file for ${exposure.commodityName} to describe a recent trend.` });
      continue;
    }
    const latest = history[0];
    const prior = history[history.length - 1];
    const percentChange = prior.price === 0 ? null : Math.round(((latest.price - prior.price) / prior.price) * 10000) / 100;
    const direction = percentChange == null ? "unknown" : percentChange > 0.5 ? "up" : percentChange < -0.5 ? "down" : "flat";
    const note =
      percentChange == null
        ? `Price trend for ${exposure.commodityName} could not be computed.`
        : `${exposure.commodityName} price is ${direction} ${Math.abs(percentChange)}% from ${prior.assessmentDate} to ${latest.assessmentDate}. ` +
          `This does not imply a specific profit impact for the company — margin effects depend on pricing power, hedging, and inventory timing not captured by this data.`;
    explanations.push({ ...exposure, direction, percentChange, latestPrice: latest.price, priorPrice: prior.price, priorDate: prior.assessmentDate, latestDate: latest.assessmentDate, note });
  }
  return explanations;
}
