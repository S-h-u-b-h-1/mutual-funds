// Integration tests (real Neon, disposable fixture rows) — see invest/complianceService.test.js
// for the reference pattern this follows. There's no per-user concept in this domain and no
// equivalent of invest/testHelpers.js's createTestUser yet, so the fixture root (a disposable
// company_sectors row, plus one industry and one company under it) is created directly with
// query() in beforeAll, matching the same direct-fixture style used by
// platform/reconciliation/reconciliationEngine.test.js.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { query } from "../db.js";
import {
  listSectors,
  getSector,
  listIndustries,
  getSectorCompanies,
  getSectorOperatingMetricTemplate,
  upsertSectorOperatingMetricTemplate,
  getCompanyOperationalMetrics,
  upsertCompanyOperationalMetric,
  getSectorAggregates,
} from "./sectors.js";

const RUN = crypto.randomBytes(4).toString("hex");

// company_operational_metrics.period_end_date is a `date` column; node-postgres parses it as a
// JS Date at LOCAL midnight (see postgres-date's own doc comment), not UTC midnight. Rendering it
// back out via toISOString() (always UTC) can shift the calendar date by one day depending on the
// host's timezone — see invest/redemptionService.test.js's insertPurchaseTransaction comment for
// the same gotcha hit for real in this codebase. Local getters avoid that skew entirely.
function localDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("sectors.js (integration, real Neon, disposable sector)", () => {
  let sectorId, industryId, companyId;

  beforeAll(async () => {
    const sector = await query(
      `insert into company_sectors (name, slug, description) values ($1, $2, $3) returning id`,
      [`Test Sector ${RUN}`, `test-sector-${RUN}`, "Disposable sector for sectors.test.js"]
    );
    sectorId = sector.rows[0].id;

    const industry = await query(
      `insert into company_industries (sector_id, name, slug, description) values ($1, $2, $3, $4) returning id`,
      [sectorId, `Test Industry ${RUN}`, `test-industry-${RUN}`, "Disposable industry for sectors.test.js"]
    );
    industryId = industry.rows[0].id;

    const company = await query(
      `insert into companies (legal_name, display_name, nse_symbol, bse_code, sector_id, industry_id)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [`Test Company ${RUN} Ltd`, `Test Co ${RUN}`, `TSTC${RUN.toUpperCase()}`, `BSE${RUN}`, sectorId, industryId]
    );
    companyId = company.rows[0].id;

    // Two periods of the same metric, so getCompanyOperationalMetrics' newest-first ordering and
    // the metricKey filter both have something real to prove.
    await query(
      `insert into company_operational_metrics (company_id, metric_key, value, unit, period_type, period_end_date, source)
       values ($1, 'net_interest_margin', 3.5, 'PERCENT', 'quarterly', '2026-03-31', 'test-fixture'),
              ($1, 'net_interest_margin', 3.7, 'PERCENT', 'quarterly', '2025-12-31', 'test-fixture')`,
      [companyId]
    );

    await query(
      `insert into sector_operating_metric_templates (sector_id, metric_key, label, unit, description)
       values ($1, 'net_interest_margin', 'Net Interest Margin', 'PERCENT', 'Test fixture template row')`,
      [sectorId]
    );

    await query(
      `insert into company_valuation_snapshots (company_id, as_of_date, pe, source) values ($1, current_date, 18.4, 'test-fixture')`,
      [companyId]
    );
  });

  afterAll(async () => {
    // Deletion order matters here — this is NOT a plain cascade-from-the-top delete. Per
    // migration 035: company_industries.sector_id is ON DELETE RESTRICT (deleting the sector
    // first would fail with a FK violation while the industry row still references it), and
    // companies.sector_id/industry_id are ON DELETE SET NULL, not CASCADE (deleting the sector
    // without first deleting the company would silently orphan the company row instead of
    // removing it). Only sector_operating_metric_templates actually cascades from
    // company_sectors. Deleting the company below cascades to its own
    // company_operational_metrics and company_valuation_snapshots rows automatically (both
    // declared ON DELETE CASCADE on company_id).
    await query(`delete from companies where id = $1`, [companyId]);
    await query(`delete from company_industries where id = $1`, [industryId]);
    await query(`delete from company_sectors where id = $1`, [sectorId]);
  });

  it("listSectors includes the disposable test sector (a shared table — asserts containment, not exact equality)", async () => {
    const sectors = await listSectors();
    expect(sectors.some((s) => s.id === sectorId && s.name === `Test Sector ${RUN}`)).toBe(true);
  });

  it("getSector returns the sector by id", async () => {
    const sector = await getSector(sectorId);
    expect(sector).toMatchObject({ id: sectorId, name: `Test Sector ${RUN}`, slug: `test-sector-${RUN}` });
  });

  it("getSector returns null for a sector that doesn't exist", async () => {
    const sector = await getSector("00000000-0000-0000-0000-000000000000");
    expect(sector).toBeNull();
  });

  it("listIndustries returns industries scoped to the sector", async () => {
    const industries = await listIndustries(sectorId);
    expect(industries).toHaveLength(1);
    expect(industries[0]).toMatchObject({ id: industryId, sector_id: sectorId, name: `Test Industry ${RUN}` });
  });

  it("getSectorCompanies returns the company, narrowable to one industry", async () => {
    const all = await getSectorCompanies(sectorId);
    expect(all).toEqual([
      expect.objectContaining({ id: companyId, display_name: `Test Co ${RUN}`, industry_id: industryId }),
    ]);

    const narrowed = await getSectorCompanies(sectorId, { industryId });
    expect(narrowed.map((c) => c.id)).toEqual([companyId]);
  });

  it("getSectorOperatingMetricTemplate returns the template rows for the sector", async () => {
    const template = await getSectorOperatingMetricTemplate(sectorId);
    expect(template).toEqual([
      { metric_key: "net_interest_margin", label: "Net Interest Margin", unit: "PERCENT", description: "Test fixture template row" },
    ]);
  });

  it("upsertSectorOperatingMetricTemplate inserts a new row for a new metric_key", async () => {
    await upsertSectorOperatingMetricTemplate({
      sectorId, metricKey: "gross_npa_ratio", label: "Gross NPA", unit: "PERCENT", description: "Second fixture row",
    });
    const template = await getSectorOperatingMetricTemplate(sectorId);
    expect(template.map((t) => t.metric_key).sort()).toEqual(["gross_npa_ratio", "net_interest_margin"]);
  });

  it("upsertSectorOperatingMetricTemplate updates an existing (sector_id, metric_key) row instead of duplicating it", async () => {
    await upsertSectorOperatingMetricTemplate({
      sectorId, metricKey: "net_interest_margin", label: "NIM (updated)", unit: "PERCENT", description: "Updated by test",
    });
    const template = await getSectorOperatingMetricTemplate(sectorId);
    expect(template).toHaveLength(2); // still 2 (net_interest_margin + gross_npa_ratio), not 3
    const nim = template.find((t) => t.metric_key === "net_interest_margin");
    expect(nim.label).toBe("NIM (updated)");
  });

  it("getCompanyOperationalMetrics returns the company's metrics newest-first", async () => {
    const metrics = await getCompanyOperationalMetrics(companyId);
    expect(metrics.map((m) => localDateString(m.period_end_date))).toEqual(["2026-03-31", "2025-12-31"]);
  });

  it("getCompanyOperationalMetrics filters to one metric key", async () => {
    const metrics = await getCompanyOperationalMetrics(companyId, { metricKey: "net_interest_margin" });
    expect(metrics.length).toBeGreaterThan(0);
    expect(metrics.every((m) => m.metric_key === "net_interest_margin")).toBe(true);
  });

  it("upsertCompanyOperationalMetric inserts a new row for a new period_end_date", async () => {
    await upsertCompanyOperationalMetric({
      companyId, metricKey: "net_interest_margin", value: 3.9, unit: "PERCENT",
      periodType: "quarterly", periodEndDate: "2026-06-30", source: "test-fixture",
    });
    const metrics = await getCompanyOperationalMetrics(companyId, { metricKey: "net_interest_margin" });
    expect(metrics.map((m) => localDateString(m.period_end_date))).toEqual(["2026-06-30", "2026-03-31", "2025-12-31"]);
  });

  it("upsertCompanyOperationalMetric updates the same (company_id, metric_key, period_end_date) row instead of duplicating it", async () => {
    await upsertCompanyOperationalMetric({
      companyId, metricKey: "net_interest_margin", value: 3.6, unit: "PERCENT",
      periodType: "quarterly", periodEndDate: "2026-03-31", source: "test-fixture-updated",
    });
    const metrics = await getCompanyOperationalMetrics(companyId, { metricKey: "net_interest_margin" });
    expect(metrics).toHaveLength(3); // still 3 rows (2026-06-30, 2026-03-31, 2025-12-31) — no duplicate created
    const updated = metrics.find((m) => localDateString(m.period_end_date) === "2026-03-31");
    expect(Number(updated.value)).toBe(3.6);
    expect(updated.source).toBe("test-fixture-updated");
  });

  it("getSectorAggregates reports company count and valuation-snapshot coverage honestly, with no fabricated market-cap/growth figure", async () => {
    const aggregates = await getSectorAggregates(sectorId);
    expect(aggregates).toEqual({ sectorId, companyCount: 1, companiesWithValuationSnapshot: 1 });
    expect(aggregates).not.toHaveProperty("sectorMarketCap");
    expect(aggregates).not.toHaveProperty("averageGrowth");
  });
});
