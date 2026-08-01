import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as financialStatements from "./financialStatements.js";
import { query } from "../db.js";
import { createTestCompany, deleteTestCompany } from "./testHelpers.js";

// node-postgres parses `date` columns into JS Date objects using LOCAL-timezone semantics —
// comparing via .toISOString() shifts the day depending on the machine's UTC offset. Local getters
// mirror how pg constructed the Date in the first place, so this is timezone-proof.
function dateStr(d) {
  if (d == null) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

describe("financialStatements (integration, real Neon, disposable test company)", () => {
  let companyId;

  beforeAll(async () => {
    companyId = await createTestCompany({ label: "fin-stmt" });
  });

  afterAll(async () => {
    await deleteTestCompany(companyId);
  });

  it("exports a frozen LINE_ITEM_KEYS vocabulary grouped by statement type", () => {
    const { LINE_ITEM_KEYS } = financialStatements;
    expect(Object.isFrozen(LINE_ITEM_KEYS)).toBe(true);
    expect(Object.isFrozen(LINE_ITEM_KEYS.pnl)).toBe(true);
    expect(LINE_ITEM_KEYS.pnl).toContain("revenue");
    expect(LINE_ITEM_KEYS.pnl).toContain("net_profit");
    expect(LINE_ITEM_KEYS.balance_sheet).toContain("total_equity");
    expect(LINE_ITEM_KEYS.cash_flow).toContain("cfo");
  });

  it("rejects an invalid statementType before touching the DB", async () => {
    await expect(
      financialStatements.upsertStatement({
        companyId, statementType: "not_a_type", periodType: "annual",
        periodEndDate: "2025-03-31", fiscalYear: 2025, source: "test", lineItems: [],
      })
    ).rejects.toThrow(/Invalid statementType/);
  });

  it("rejects an invalid periodType before touching the DB", async () => {
    await expect(
      financialStatements.upsertStatement({
        companyId, statementType: "pnl", periodType: "not_a_period",
        periodEndDate: "2025-03-31", fiscalYear: 2025, source: "test", lineItems: [],
      })
    ).rejects.toThrow(/Invalid periodType/);
  });

  it("rejects missing companyId/periodEndDate/fiscalYear/source", async () => {
    const base = { statementType: "pnl", periodType: "annual", periodEndDate: "2025-03-31", fiscalYear: 2025, source: "test" };
    await expect(financialStatements.upsertStatement({ ...base, companyId: undefined })).rejects.toThrow(/companyId/);
    await expect(financialStatements.upsertStatement({ ...base, companyId, periodEndDate: undefined })).rejects.toThrow(/periodEndDate/);
    await expect(financialStatements.upsertStatement({ ...base, companyId, fiscalYear: undefined })).rejects.toThrow(/fiscalYear/);
    await expect(financialStatements.upsertStatement({ ...base, companyId, source: undefined })).rejects.toThrow(/source/);
  });

  it("getLatestStatement also validates statementType/periodType", async () => {
    await expect(financialStatements.getLatestStatement(companyId, "bogus", "annual")).rejects.toThrow(/Invalid statementType/);
    await expect(financialStatements.getLatestStatement(companyId, "pnl", "bogus")).rejects.toThrow(/Invalid periodType/);
  });

  it("upserts a statement + line items and round-trips via getStatement as a flat map", async () => {
    const { statementId, lineItems } = await financialStatements.upsertStatement({
      companyId, statementType: "pnl", periodType: "annual", periodEndDate: "2025-03-31",
      fiscalYear: 2025, source: "test-fixture",
      lineItems: [
        { key: "revenue", value: 1000, unit: "INR_CRORE", rawLabel: "Revenue from operations" },
        { key: "net_profit", value: 100, unit: "INR_CRORE" },
        { key: "eps_basic", value: null }, // a real, expected case: line exists in the filing, figure illegible/unavailable
      ],
    });
    expect(statementId).toBeDefined();
    expect(lineItems).toHaveLength(3);

    const statement = await financialStatements.getStatement(statementId);
    expect(statement.companyId).toBe(companyId);
    expect(statement.statementType).toBe("pnl");
    expect(statement.periodType).toBe("annual");
    expect(dateStr(statement.periodEndDate)).toBe("2025-03-31");
    expect(statement.fiscalYear).toBe(2025);
    expect(statement.source).toBe("test-fixture");
    expect(statement.fields).toEqual({ revenue: 1000, net_profit: 100, eps_basic: null });
  });

  it("upserting the same period again updates the header in place (on conflict), not a duplicate row", async () => {
    const first = await financialStatements.upsertStatement({
      companyId, statementType: "balance_sheet", periodType: "annual", periodEndDate: "2025-03-31",
      fiscalYear: 2025, source: "test-fixture-v1",
      lineItems: [{ key: "total_assets", value: 5000 }],
    });
    const second = await financialStatements.upsertStatement({
      companyId, statementType: "balance_sheet", periodType: "annual", periodEndDate: "2025-03-31",
      fiscalYear: 2025, source: "test-fixture-v2",
      lineItems: [{ key: "total_assets", value: 5500 }],
    });
    expect(second.statementId).toBe(first.statementId);

    const count = await query(
      `select count(*)::int as n from company_financial_statements where company_id = $1 and statement_type = 'balance_sheet'`,
      [companyId]
    );
    expect(count.rows[0].n).toBe(1);

    const statement = await financialStatements.getStatement(first.statementId);
    expect(statement.fields.total_assets).toBe(5500);
    expect(statement.source).toBe("test-fixture-v2");
  });

  it("re-upserting a line item updates its value in place rather than duplicating (on conflict statement_id, line_item_key)", async () => {
    const { statementId } = await financialStatements.upsertStatement({
      companyId, statementType: "cash_flow", periodType: "annual", periodEndDate: "2024-03-31",
      fiscalYear: 2024, source: "test",
      lineItems: [{ key: "cfo", value: 200 }],
    });
    await financialStatements.upsertStatement({
      companyId, statementType: "cash_flow", periodType: "annual", periodEndDate: "2024-03-31",
      fiscalYear: 2024, source: "test",
      lineItems: [{ key: "cfo", value: 250 }, { key: "capex", value: 80 }],
    });
    const statement = await financialStatements.getStatement(statementId);
    expect(statement.fields).toEqual({ cfo: 250, capex: 80 });

    const rowCount = await query(`select count(*)::int as n from company_financial_line_items where statement_id = $1`, [statementId]);
    expect(rowCount.rows[0].n).toBe(2); // still 2 rows, not 3 — cfo updated in place, capex added
  });

  it("a duplicate key within one upsertStatement call keeps the last occurrence, not a Postgres conflict error", async () => {
    const { lineItems } = await financialStatements.upsertStatement({
      companyId, statementType: "pnl", periodType: "quarterly", periodEndDate: "2025-06-30",
      fiscalYear: 2026, fiscalQuarter: 1, source: "test",
      lineItems: [{ key: "revenue", value: 100 }, { key: "revenue", value: 999 }],
    });
    expect(lineItems).toHaveLength(1);
    expect(lineItems[0].value).toBe(999);
  });

  it("getStatementsForCompany returns newest-first, pivoted, optionally filtered by type", async () => {
    await financialStatements.upsertStatement({
      companyId, statementType: "pnl", periodType: "annual", periodEndDate: "2024-03-31",
      fiscalYear: 2024, source: "test", lineItems: [{ key: "revenue", value: 800 }],
    });
    // the 2025-03-31 pnl/annual statement already exists from an earlier test in this file

    const pnlAnnual = await financialStatements.getStatementsForCompany(companyId, { statementType: "pnl", periodType: "annual" });
    expect(pnlAnnual.length).toBeGreaterThanOrEqual(2);
    expect(pnlAnnual.every((s) => s.statementType === "pnl" && s.periodType === "annual")).toBe(true);

    const times = pnlAnnual.map((s) => new Date(s.periodEndDate).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a)); // newest first
  });

  it("getLatestStatement returns the most recent statement of a given type/period", async () => {
    const latest = await financialStatements.getLatestStatement(companyId, "pnl", "annual");
    expect(latest.fields.revenue).toBe(1000); // 2025-03-31's value, not 2024-03-31's 800
  });

  it("getStatement returns null for a nonexistent statement id", async () => {
    const result = await financialStatements.getStatement(999999999);
    expect(result).toBeNull();
  });

  it("getStatementsForCompany returns [] for a company with no statements on file", async () => {
    const otherCompanyId = await createTestCompany({ label: "fin-stmt-empty" });
    try {
      const result = await financialStatements.getStatementsForCompany(otherCompanyId);
      expect(result).toEqual([]);
    } finally {
      await deleteTestCompany(otherCompanyId);
    }
  });
});
