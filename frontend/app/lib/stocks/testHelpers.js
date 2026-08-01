// Disposable test fixtures for the Stock Intelligence domain — same idea as
// frontend/app/lib/invest/testHelpers.js's createTestUser/deleteTestUser: insert a real row
// against the real Neon test branch, return its id, delete it (and everything cascading from it)
// in a paired cleanup call.
import { query } from "../db.js";

let counter = 0;
function uniqueSuffix(label) {
  counter += 1;
  return `${label}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

// Short, label-independent uniqueness for space-constrained identifier columns (isin: unique,
// realistically <=12 chars; nse_symbol/bse_code likewise short in practice). uniqueSuffix()'s
// output is NOT safe to .slice() into a short column — its uniqueness-bearing part (timestamp/
// counter/random) sits AFTER the human-readable label, so truncating to N chars keeps only the
// label's own prefix and silently drops the part that actually makes it unique. Two labels
// sharing a short common prefix (e.g. "fin-stmt" and "fin-stmt-empty") then collide on a real
// unique constraint. This generates the unique token first, independent of any label.
let shortCounter = 0;
function shortUniqueToken() {
  shortCounter += 1;
  return (shortCounter.toString(36) + Math.random().toString(36).slice(2, 8)).toUpperCase();
}

export async function createTestSector(label = "sector") {
  const suffix = uniqueSuffix(label);
  const r = await query(
    `insert into company_sectors (name, slug, description) values ($1, $2, $3) returning id`,
    [`Test Sector ${suffix}`, `test-sector-${suffix}`, "Disposable fixture sector for tests."]
  );
  return r.rows[0].id;
}

export async function deleteTestSector(sectorId) {
  if (!sectorId) return;
  await query(`delete from company_sectors where id = $1`, [sectorId]);
}

export async function createTestIndustry(sectorId, label = "industry") {
  const suffix = uniqueSuffix(label);
  const r = await query(
    `insert into company_industries (sector_id, name, slug, description) values ($1, $2, $3, $4) returning id`,
    [sectorId, `Test Industry ${suffix}`, `test-industry-${suffix}`, "Disposable fixture industry for tests."]
  );
  return r.rows[0].id;
}

export async function createTestCompany({ sectorId = null, industryId = null, label = "company" } = {}) {
  const suffix = uniqueSuffix(label);
  const token = shortUniqueToken();
  const r = await query(
    `insert into companies (legal_name, display_name, isin, nse_symbol, bse_code, sector_id, industry_id)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [`Test Company ${suffix} Ltd`, `Test Co ${suffix}`, `IN${token}`.slice(0, 12), `T${token}`.slice(0, 20), null, sectorId, industryId]
  );
  return r.rows[0].id;
}

// Deletes the company row. Every child table this domain has (identifier history, exchange
// listings, ownership/management/subsidiaries/segments, financial statements + line items,
// valuation snapshots, events, results calendar, operational metrics, commodity exposures, stock
// holdings/transactions, watchlist items, alerts, research notes) references company_id with
// `on delete cascade` (see sql/neon/035_stock_intelligence_foundation.sql) except
// stock_holdings/stock_transactions, which use `on delete restrict` deliberately (a user's
// transaction history should not silently vanish if a company row is ever removed) — tests that
// create stock_holdings/stock_transactions fixtures must delete those rows themselves first.
export async function deleteTestCompany(companyId) {
  if (!companyId) return;
  await query(`delete from companies where id = $1`, [companyId]);
}
