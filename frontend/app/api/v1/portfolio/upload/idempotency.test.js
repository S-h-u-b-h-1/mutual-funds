import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { query, withTransaction } from "../../../../lib/db.js";
import { createTestUser, deleteTestUser } from "../../../../lib/invest/testHelpers.js";

const state = vi.hoisted(() => ({ holdings: [] }));
vi.mock("../../../../lib/portfolioImport/casPdf", () => ({ extractCasText: async buffer => ({ text: "test-only", checksum: buffer.toString() }) }));
vi.mock("../../../../lib/portfolioImport/casParser", () => ({ parseCasText: () => ({ investor: {}, provider: "cams" }) }));
vi.mock("../../../../lib/portfolioImport/casNormalizer", () => ({ normalizeCasImport: () => ({ holdings: state.holdings, errors: [], warnings: [], transactions: [] }), computePortfolioXirr: () => ({ portfolio: null }) }));
const { handleCasUpload } = await import("./casUpload");

describe("CAS exact-content idempotency and all-or-nothing persistence", () => {
  let userId;
  beforeAll(async () => { userId = await createTestUser("remediation-cas-atomic"); });
  afterAll(async () => { if (userId) await deleteTestUser(userId); });
  const call = checksum => withTransaction(async client => handleCasUpload({ user: { id: userId }, filename: "synthetic-test.pdf", buffer: Buffer.from(checksum), selectedStatementType: "cams_cas_pdf", query: async (sql, args) => {
    if (sql.includes("insert into portfolio_holdings") && args[1] === "fail-test") throw Error("Injected persistence failure");
    return client.query(sql, args);
  } }));
  it("two concurrent identical summary uploads create one upload and one holding", async () => {
    state.holdings = [{ schemeCode: "100033", units: 2, avgCost: 10, purchaseValue: 20, folioNumber: "atomic-test" }];
    const results = await Promise.all([call("a".repeat(64)), call("a".repeat(64))]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect((await query("select count(*)::int n from portfolio_uploads where user_id=$1", [userId])).rows[0].n).toBe(1);
    expect((await query("select count(*)::int n from portfolio_holdings where user_id=$1", [userId])).rows[0].n).toBe(1);
  });
  it("a later holding write failure rolls back earlier holding and upload writes", async () => {
    state.holdings = [{ schemeCode: "100033", units: 999, avgCost: 10, folioNumber: "atomic-test" }, { schemeCode: "fail-test", units: 1 }];
    await expect(call("b".repeat(64))).rejects.toThrow("Injected persistence failure");
    expect((await query("select units from portfolio_holdings where user_id=$1", [userId])).rows[0].units * 1).toBe(2);
    expect((await query("select count(*)::int n from portfolio_uploads where user_id=$1", [userId])).rows[0].n).toBe(1);
  });
});
