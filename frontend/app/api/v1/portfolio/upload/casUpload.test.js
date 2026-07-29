import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { query } from "../../../../lib/db.js";
import { createTestUser, deleteTestUser } from "../../../../lib/invest/testHelpers.js";
import { persistUnresolvedHoldings, resolveStaleUnresolvedHoldings, persistTransactions } from "./casUpload.js";

describe("unresolved/ambiguous holdings persistence (integration, real Neon, disposable user)", () => {
  let userId;

  beforeAll(async () => {
    userId = await createTestUser("cas-unresolved");
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  it("persists unresolved and ambiguous holdings as standing, queryable rows — not just an upload response", async () => {
    const errors = [
      {
        schemeName: "Some Obscure Fund - Direct Growth",
        isin: null,
        folioNumber: "99001",
        units: 120.5,
        purchaseValue: 15000,
        marketValueReported: 16200,
        reason: "No scheme name or ISIN provided.",
        status: "unresolved",
      },
      {
        schemeName: "ABC Growth Fund",
        isin: "INFAAA000001",
        folioNumber: "99002",
        units: 50,
        purchaseValue: 5000,
        marketValueReported: 5300,
        reason: "2 schemes share this exact name and the active-status tiebreak didn't narrow it to one.",
        status: "needs_review",
        ambiguityCandidates: [{ schemeCode: "111111", name: "ABC Growth Fund - Regular" }, { schemeCode: "222222", name: "ABC Growth Fund - Direct" }],
      },
    ];

    await persistUnresolvedHoldings(query, userId, null, errors);

    const rows = await query(
      `select raw_scheme_name, isin, folio_number, units, purchase_value, market_value_reported, resolution_status, resolution_reason, ambiguity_candidates, status
       from portfolio_unresolved_holdings where user_id = $1 order by folio_number`,
      [userId]
    );

    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0]).toMatchObject({
      raw_scheme_name: "Some Obscure Fund - Direct Growth",
      isin: null,
      folio_number: "99001",
      resolution_status: "unresolved",
      status: "open",
    });
    expect(Number(rows.rows[0].units)).toBe(120.5);
    expect(Number(rows.rows[0].purchase_value)).toBe(15000);

    expect(rows.rows[1]).toMatchObject({
      raw_scheme_name: "ABC Growth Fund",
      isin: "INFAAA000001",
      folio_number: "99002",
      resolution_status: "needs_review",
      status: "open",
    });
    expect(rows.rows[1].ambiguity_candidates).toHaveLength(2);

    // A later upload resolves folio 99002's holding (real ISIN match) but NOT folio 99001's —
    // only the matching row should flip to 'resolved'; the other stays 'open'.
    await resolveStaleUnresolvedHoldings(query, userId, [
      { isin: "INFAAA000001", folioNumber: "99002", schemeCode: "111111" },
    ]);

    const after = await query(
      `select folio_number, status, resolved_at from portfolio_unresolved_holdings where user_id = $1 order by folio_number`,
      [userId]
    );
    expect(after.rows.find((r) => r.folio_number === "99001")).toMatchObject({ status: "open", resolved_at: null });
    const resolved = after.rows.find((r) => r.folio_number === "99002");
    expect(resolved.status).toBe("resolved");
    expect(resolved.resolved_at).not.toBeNull();
  });
});

describe("transaction idempotency (integration, real Neon, disposable user)", () => {
  let userId;

  beforeAll(async () => {
    userId = await createTestUser("cas-txn-idempotency");
  });

  afterAll(async () => {
    await deleteTestUser(userId);
  });

  it("re-persisting the exact same transaction is a no-op, not a duplicate row — the DB-level backstop beyond the app-level checksum gate", async () => {
    const transactions = [
      { schemeCode: "100064", transactionType: "purchase", description: "Purchase", transactionDate: "2026-01-15", amount: 10000, units: 316.4, navValue: 31.6, unitBalance: 316.4, folioNumber: "77001" },
      { schemeCode: "100064", transactionType: "sip", description: "Purchase - SIP Installment", transactionDate: "2026-02-15", amount: 5000, units: 155.3, navValue: 32.2, unitBalance: 471.7, folioNumber: "77001" },
    ];

    await persistTransactions(query, userId, transactions);
    const firstPass = await query(`select count(*)::int as n from portfolio_transactions where user_id = $1`, [userId]);
    expect(firstPass.rows[0].n).toBe(2);

    // Simulate a retry/race replaying the exact same rows — same fingerprint, must not duplicate.
    await persistTransactions(query, userId, transactions);
    const secondPass = await query(`select count(*)::int as n from portfolio_transactions where user_id = $1`, [userId]);
    expect(secondPass.rows[0].n).toBe(2); // unchanged — ON CONFLICT DO NOTHING held

    // A genuinely different transaction (different date) for the same scheme/folio is NOT
    // suppressed — the fingerprint correctly distinguishes it from the two above.
    await persistTransactions(query, userId, [
      { schemeCode: "100064", transactionType: "purchase", description: "Purchase", transactionDate: "2026-03-15", amount: 10000, units: 300, navValue: 33.3, unitBalance: 771.7, folioNumber: "77001" },
    ]);
    const thirdPass = await query(`select count(*)::int as n from portfolio_transactions where user_id = $1`, [userId]);
    expect(thirdPass.rows[0].n).toBe(3);
  });
});
