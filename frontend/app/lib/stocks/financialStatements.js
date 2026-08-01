// Financial Statements (Stock Intelligence) — normalized statement headers
// (company_financial_statements) plus entity-attribute-value line items
// (company_financial_line_items). See sql/neon/035_stock_intelligence_foundation.sql for the full
// schema this operates on.
//
// LINE_ITEM_KEYS below is the ONLY place the raw line-item vocabulary is defined — metrics.js (and
// any future consumer) imports it rather than hardcoding its own key strings, per the same
// "frontend never independently defines fundamentals" requirement Section 5 states for derived
// metrics (see this migration's own comment on the company_financial_statements table), applied one
// layer earlier to the raw fields those metrics are computed from.
import { query, withTransaction } from "../db.js";

export const LINE_ITEM_KEYS = Object.freeze({
  pnl: Object.freeze([
    "revenue", "total_income", "cost_of_materials", "employee_expenses", "other_expenses",
    "total_expenses", "ebitda", "depreciation_amortization", "finance_costs",
    "profit_before_tax", "tax_expense", "net_profit", "eps_basic", "eps_diluted",
  ]),
  balance_sheet: Object.freeze([
    "total_assets", "total_liabilities", "total_equity", "share_capital", "reserves_and_surplus",
    "total_debt", "cash_and_equivalents", "current_assets", "current_liabilities", "inventory",
    "trade_receivables", "trade_payables",
  ]),
  cash_flow: Object.freeze([
    "cfo", "cfi", "cff", "capex", "dividend_paid", "net_change_in_cash",
  ]),
});

// Mirrors company_financial_statements' own check constraints — validated here too so a bad value
// fails fast with a clear message instead of surfacing as an opaque Postgres constraint-violation
// error several stack frames away from the caller's mistake.
const STATEMENT_TYPES = new Set(Object.keys(LINE_ITEM_KEYS));
const PERIOD_TYPES = new Set(["annual", "quarterly"]);

function assertValidStatementType(statementType) {
  if (!STATEMENT_TYPES.has(statementType)) {
    throw new Error(`Invalid statementType '${statementType}' — must be one of: ${[...STATEMENT_TYPES].join(", ")}.`);
  }
}
function assertValidPeriodType(periodType) {
  if (!PERIOD_TYPES.has(periodType)) {
    throw new Error(`Invalid periodType '${periodType}' — must be one of: ${[...PERIOD_TYPES].join(", ")}.`);
  }
}

function shapeStatementHeader(row) {
  if (!row) return null;
  return {
    id: row.id,
    companyId: row.company_id,
    statementType: row.statement_type,
    periodType: row.period_type,
    periodEndDate: row.period_end_date,
    fiscalYear: row.fiscal_year,
    fiscalQuarter: row.fiscal_quarter,
    isRestated: row.is_restated,
    restatedFromId: row.restated_from_id,
    source: row.source,
    sourceDocumentRef: row.source_document_ref,
    ingestedAt: row.ingested_at,
  };
}

// Pivots line_item_key/value rows into the flat map shape metrics.js's compute() functions consume
// directly. `value` is nullable on the DB row (a line can be on file with an illegible/unavailable
// figure) — null stays null here, never coerced to 0.
function fieldsFromRows(rows) {
  const fields = {};
  for (const row of rows) fields[row.line_item_key] = row.value === null ? null : Number(row.value);
  return fields;
}

// Upserts one statement header + all its line items in a single transaction — a partial write
// (header committed, line items failing halfway through) would leave a statement row indistinguish-
// able from "not yet ingested". Line items are bulk-upserted via unnest() in one round trip rather
// than one INSERT per item (a statement typically carries 10-20 line items), same pattern
// complianceService.ensureApplication uses for its own multi-row upsert.
//
// Always targets the non-restated row for the period — is_restated defaults to false on insert,
// which is also what the unique constraint's ON CONFLICT target matches against. A genuine
// restatement (is_restated = true, restated_from_id set) is a separate, deliberate write this
// function does not attempt to model.
export async function upsertStatement({
  companyId, statementType, periodType, periodEndDate, fiscalYear, fiscalQuarter = null,
  source, sourceDocumentRef = null, lineItems = [],
}) {
  assertValidStatementType(statementType);
  assertValidPeriodType(periodType);
  if (!companyId) throw new Error("upsertStatement requires companyId.");
  if (!periodEndDate) throw new Error("upsertStatement requires periodEndDate.");
  if (!fiscalYear) throw new Error("upsertStatement requires fiscalYear.");
  if (!source) throw new Error("upsertStatement requires source.");

  // De-dupe by key (last occurrence wins) before building the unnest() arrays — a duplicate key in
  // the same call would otherwise make the bulk ON CONFLICT DO UPDATE affect the same row twice in
  // one command, which Postgres rejects outright.
  const dedup = new Map();
  for (const item of lineItems) {
    if (item?.key) dedup.set(item.key, item);
  }
  const cleanItems = [...dedup.values()];

  return withTransaction(async (client) => {
    const stmt = await client.query(
      `insert into company_financial_statements
         (company_id, statement_type, period_type, period_end_date, fiscal_year, fiscal_quarter, source, source_document_ref)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (company_id, statement_type, period_type, period_end_date, is_restated) do update set
         fiscal_year = excluded.fiscal_year, fiscal_quarter = excluded.fiscal_quarter,
         source = excluded.source, source_document_ref = excluded.source_document_ref,
         ingested_at = now()
       returning id`,
      [companyId, statementType, periodType, periodEndDate, fiscalYear, fiscalQuarter, source, sourceDocumentRef]
    );
    const statementId = stmt.rows[0].id;

    if (cleanItems.length === 0) return { statementId, lineItems: [] };

    const keys = cleanItems.map((i) => i.key);
    const values = cleanItems.map((i) => i.value ?? null);
    const units = cleanItems.map((i) => i.unit ?? "INR_CRORE");
    const rawLabels = cleanItems.map((i) => i.rawLabel ?? null);

    const r = await client.query(
      `insert into company_financial_line_items (statement_id, line_item_key, value, unit, raw_label)
       select $1, k, v, u, l
       from unnest($2::text[], $3::numeric[], $4::text[], $5::text[]) as t(k, v, u, l)
       on conflict (statement_id, line_item_key) do update set
         value = excluded.value, unit = excluded.unit, raw_label = excluded.raw_label
       returning line_item_key, value, unit, raw_label`,
      [statementId, keys, values, units, rawLabels]
    );
    return {
      statementId,
      lineItems: r.rows.map((row) => ({
        key: row.line_item_key,
        value: row.value === null ? null : Number(row.value),
        unit: row.unit,
        rawLabel: row.raw_label,
      })),
    };
  });
}

// Header plus every line item pivoted into a flat { [line_item_key]: value|null } map under
// `fields` — the shape metrics.js's compute() functions consume directly as one of
// pnl/balanceSheet/cashFlow. Returns null (not a partial object) if the statement doesn't exist.
export async function getStatement(statementId) {
  const stmtResult = await query(
    `select id, company_id, statement_type, period_type, period_end_date, fiscal_year, fiscal_quarter,
            is_restated, restated_from_id, source, source_document_ref, ingested_at
       from company_financial_statements where id = $1`,
    [statementId]
  );
  const header = stmtResult.rows[0];
  if (!header) return null;

  const itemsResult = await query(
    `select line_item_key, value, unit, raw_label from company_financial_line_items where statement_id = $1`,
    [statementId]
  );
  return { ...shapeStatementHeader(header), fields: fieldsFromRows(itemsResult.rows) };
}

// Newest-first, each with its own pivoted `fields` map, optionally filtered by statementType/
// periodType. Returns [] for a company with nothing on file — never throws for "no data yet".
export async function getStatementsForCompany(companyId, { statementType, periodType, limit = 12 } = {}) {
  if (statementType) assertValidStatementType(statementType);
  if (periodType) assertValidPeriodType(periodType);

  const conditions = ["company_id = $1"];
  const params = [companyId];
  if (statementType) {
    params.push(statementType);
    conditions.push(`statement_type = $${params.length}`);
  }
  if (periodType) {
    params.push(periodType);
    conditions.push(`period_type = $${params.length}`);
  }
  params.push(limit);

  const stmts = await query(
    `select id, company_id, statement_type, period_type, period_end_date, fiscal_year, fiscal_quarter,
            is_restated, restated_from_id, source, source_document_ref, ingested_at
       from company_financial_statements
      where ${conditions.join(" and ")}
      order by period_end_date desc
      limit $${params.length}`,
    params
  );
  if (stmts.rows.length === 0) return [];

  const ids = stmts.rows.map((r) => r.id);
  const items = await query(
    `select statement_id, line_item_key, value, unit, raw_label
       from company_financial_line_items where statement_id = any($1::bigint[])`,
    [ids]
  );
  const byStatement = new Map();
  for (const row of items.rows) {
    if (!byStatement.has(row.statement_id)) byStatement.set(row.statement_id, []);
    byStatement.get(row.statement_id).push(row);
  }
  return stmts.rows.map((s) => ({ ...shapeStatementHeader(s), fields: fieldsFromRows(byStatement.get(s.id) || []) }));
}

export async function getLatestStatement(companyId, statementType, periodType) {
  assertValidStatementType(statementType);
  assertValidPeriodType(periodType);
  const [latest] = await getStatementsForCompany(companyId, { statementType, periodType, limit: 1 });
  return latest || null;
}
