import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { query } from "../db.js";
import { getFund } from "../funds.js";
import * as portfolioService from "./portfolioService.js";
import { makeInvestmentReadyUser, createTestUser, deleteTestUser } from "./testHelpers.js";
import * as orderService from "./orderService.js";

const REAL_SCHEME_CODE = "119551"; // reused from orderService.test.js — already established as a resolvable fixture
// Two more real, active, resolvable schemes, kept distinct from REAL_SCHEME_CODE and from each
// other — the reconcileCompletedOrder tests below all share one reconcileUserId and now correctly
// accumulate units across multiple reconciliations for the SAME scheme (that's the point of the
// fix being tested), so any test asserting an exact row count or an absolute unit-count sign needs
// its own scheme to avoid depending on what earlier tests in the same file already wrote.
const REAL_SCHEME_CODE_2 = "103052";
const REAL_SCHEME_CODE_3 = "112278";
const REAL_SCHEME_CODE_4 = "100064"; // isolated for the avg_cost weighted-average test below

describe("portfolioService (integration, real Neon, disposable investment-ready users)", () => {
  let emptyUserId; // stays holding-free for the life of the suite — empty-state + timeline-with-no-events checks
  let connectUserId; // exercises connectMockPortfolio in isolation
  let reconcileUserId; // exercises reconcileCompletedOrder via a real order lifecycle

  beforeAll(async () => {
    [emptyUserId, connectUserId, reconcileUserId] = await Promise.all([
      makeInvestmentReadyUser("portfolio-empty"),
      makeInvestmentReadyUser("portfolio-connect"),
      makeInvestmentReadyUser("portfolio-reconcile"),
    ]);
  }, 120000);

  afterAll(async () => {
    await Promise.all([emptyUserId, connectUserId, reconcileUserId].map(deleteTestUser));
  });

  describe("empty state (no holdings yet)", () => {
    it("getPortfolio returns a clean zeroed shape, not an error", async () => {
      const p = await portfolioService.getPortfolio(emptyUserId);
      expect(p.holdings).toEqual([]);
      expect(p.allocation).toBeNull();
      expect(p.topHoldings).toEqual([]);
      expect(p.performanceLeaders).toEqual([]);
      expect(p.summary).toEqual({
        totalValue: 0, investedValue: 0, gainLoss: 0, gainLossPct: null, xirr: null,
        holdingsCount: 0, healthScore: null, qualityScore: null,
        effectiveHoldings: 0, effectiveAmcs: 0, effectiveCategories: 0,
        latestOfficialNavDate: null, valuationDate: null, valuationConfidence: null,
        latestNavCoveragePct: null, staleHoldingCount: 0, latestNavDayChange: null,
      });
      // Portfolio Metadata: dataQuality is always a fully-shaped object, never null — an empty
      // portfolio has a real "calculated at this instant, zero holdings to describe" state, same
      // reasoning as EMPTY_SUMMARY being a zeroed object rather than summary: null.
      expect(p.dataQuality.calculatedAt).toBeTruthy();
      expect(p.dataQuality.datasetAsOf).toBeTruthy();
      expect(p.dataQuality.lastImportedAt).toBeNull();
      expect(p.dataQuality.navDateRange).toEqual({ oldest: null, newest: null });
      expect(p.dataQuality.staleHoldingCount).toBe(0);
      expect(p.dataQuality.unresolvedCount).toBe(0);
    });

    it("getPortfolioSummary matches the same EMPTY_SUMMARY shape standalone", async () => {
      const summary = await portfolioService.getPortfolioSummary(emptyUserId);
      expect(summary.holdingsCount).toBe(0);
      expect(summary.totalValue).toBe(0);
      expect(summary.xirr).toBeNull();
    });

    it("getPortfolioHoldings returns an empty array, not null or an error", async () => {
      const { holdings, unresolved } = await portfolioService.getPortfolioHoldings(emptyUserId);
      expect(holdings).toEqual([]);
      expect(unresolved).toEqual([]);
    });

    it("getPortfolioAllocation returns empty-but-shaped buckets", async () => {
      const allocation = await portfolioService.getPortfolioAllocation(emptyUserId);
      expect(allocation).toEqual({ amc: [], category: [], benchmark: [], sector: null });
    });

    it("getPortfolioPerformance returns a null valuation with an honest note, not a 400", async () => {
      const perf = await portfolioService.getPortfolioPerformance(emptyUserId);
      expect(perf.valuation).toBeNull();
      expect(perf.performanceLeaders).toEqual([]);
      expect(perf.historyNote).toMatch(/No holdings yet/);
    });

    it("getPortfolioTimeline returns an empty feed for a user with no orders or transactions", async () => {
      const events = await portfolioService.getPortfolioTimeline(emptyUserId);
      expect(events).toEqual([]);
    });
  });

  describe("connectMockPortfolio (explicit, user-initiated demo holdings)", () => {
    it("creates 3-6 real-scheme holdings tagged source='mock-connected', then reports non-empty getPortfolio", async () => {
      const result = await portfolioService.connectMockPortfolio(connectUserId);
      expect(result.alreadyConnected).toBe(false);
      expect(result.holdings.length).toBeGreaterThanOrEqual(3);
      expect(result.holdings.length).toBeLessThanOrEqual(6);
      expect(result.summary.holdingsCount).toBe(result.holdings.length);

      const rows = await query(
        `select distinct source from portfolio_holdings where user_id = $1`,
        [connectUserId]
      );
      expect(rows.rows.map((r) => r.source)).toEqual(["mock-connected"]);
    });

    it("is idempotent — a second call returns the SAME holdings, not a fresh/duplicate set", async () => {
      const before = await query(
        `select scheme_code, units, folio_number from portfolio_holdings where user_id = $1 order by scheme_code`,
        [connectUserId]
      );
      const second = await portfolioService.connectMockPortfolio(connectUserId);
      expect(second.alreadyConnected).toBe(true);

      const after = await query(
        `select scheme_code, units, folio_number from portfolio_holdings where user_id = $1 order by scheme_code`,
        [connectUserId]
      );
      expect(after.rows).toEqual(before.rows);
    });

    it("logs an audit event and a notification for the connect action", async () => {
      const audit = await query(
        `select action from audit_log where user_id = $1 and action = 'mock_portfolio_connected'`,
        [connectUserId]
      );
      expect(audit.rows.length).toBe(1);

      const notif = await query(
        `select type from notifications where user_id = $1 and type = 'portfolio_connected'`,
        [connectUserId]
      );
      expect(notif.rows.length).toBe(1);
    });

    // Portfolio Metadata: real per-holding NAV facts (from the same funds.json data every fund
    // page already reads) and portfolio-level freshness, now surfaced for the first time —
    // previously computed internally by revaluation.js's own staleHoldingCount/latestNavCoveragePct
    // but never per-holding, and never with an explicit "when was this valuation computed" or
    // "when did this user's data last get imported" fact anywhere in the API surface.
    it("surfaces per-holding navDate/staleDays and portfolio-level dataQuality for a connected portfolio", async () => {
      const p = await portfolioService.getPortfolio(connectUserId);
      expect(p.holdings.length).toBeGreaterThan(0);
      for (const h of p.holdings) {
        expect(h.navDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof h.staleDays).toBe("number");
      }

      expect(p.dataQuality.lastImportedAt).toBeTruthy();
      expect(p.dataQuality.navDateRange.oldest).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.dataQuality.navDateRange.newest).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.dataQuality.navDateRange.oldest <= p.dataQuality.navDateRange.newest).toBe(true);
      expect(p.dataQuality.latestNavCoveragePct).toBe(100); // connectMockPortfolio only ever inserts holdings with a resolvable live NAV

      // Standalone endpoint returns the identical shape, not a second, possibly-diverging computation.
      const standalone = await portfolioService.getPortfolioDataQuality(connectUserId);
      expect(standalone.navDateRange).toEqual(p.dataQuality.navDateRange);
      expect(standalone.datasetAsOf).toBe(p.dataQuality.datasetAsOf);
    });
  });

  describe("reconcileCompletedOrder", () => {
    it("a real order that reaches 'completed' via refreshOrderStatus is reconciled into portfolio_holdings automatically", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0.1); // keeps placeOrder on its accept branch AND decideNextStatus on 'completed'
      const order = await orderService.createOrder(reconcileUserId, {
        schemeCode: REAL_SCHEME_CODE, orderType: "purchase", amount: 5000,
      });
      expect(order.status).toBe("submitted");

      // Backdate submitted_at instead of waiting out PROGRESSION_SECONDS.resolve (18s) for real —
      // refreshOrderStatus computes elapsed time from this column, so this is a real trigger of
      // the actual code path, not a bypass of it.
      await query(`update investment_orders set submitted_at = now() - interval '30 seconds' where id = $1`, [order.id]);
      const completed = await orderService.refreshOrderStatus(reconcileUserId, order.id);
      expect(completed.status).toBe("completed");
      vi.restoreAllMocks();

      // Holdings consolidate on a stable folio_number ('') — deliberately NOT the per-order id, so
      // a second order for the same scheme accumulates into this same row rather than fragmenting
      // (see reconcileCompletedOrder's own comment for the full rationale). The transaction ledger
      // still keys its own row by the real order id, since each order must remain its own distinct
      // historical event regardless of how the resulting holding consolidates.
      const holding = await query(
        `select units, source, folio_number from portfolio_holdings where user_id = $1 and scheme_code = $2 and source = 'invest-order'`,
        [reconcileUserId, REAL_SCHEME_CODE]
      );
      expect(holding.rows.length).toBe(1);
      expect(holding.rows[0].folio_number).toBe("");
      expect(Number(holding.rows[0].units)).toBeGreaterThan(0);

      const txn = await query(
        `select transaction_type, source from portfolio_transactions where user_id = $1 and folio_number = $2`,
        [reconcileUserId, `order-${order.id}`]
      );
      expect(txn.rows.length).toBe(1);
      expect(txn.rows[0].transaction_type).toBe("purchase");
      expect(txn.rows[0].source).toBe("invest-order");
    });

    it("a second purchase order for the SAME scheme accumulates into the same holding row, not a fragmented second row", async () => {
      // Uses REAL_SCHEME_CODE_2, not REAL_SCHEME_CODE — this test reconciles multiple orders for
      // one scheme and asserts an exact row count, so it must not share accumulated state with the
      // other tests in this block, which all use REAL_SCHEME_CODE against the same reconcileUserId.
      const orderA = "00000000-0000-0000-0000-0000000000a1";
      const orderB = "00000000-0000-0000-0000-0000000000a2";
      await portfolioService.reconcileCompletedOrder({
        id: orderA, user_id: reconcileUserId, scheme_code: REAL_SCHEME_CODE_2, order_type: "purchase", amount: 5000, units: null,
      });
      const afterFirst = await query(
        `select units from portfolio_holdings where user_id = $1 and scheme_code = $2 and source = 'invest-order' and folio_number = ''`,
        [reconcileUserId, REAL_SCHEME_CODE_2]
      );
      const unitsAfterFirst = Number(afterFirst.rows[0].units);

      await portfolioService.reconcileCompletedOrder({
        id: orderB, user_id: reconcileUserId, scheme_code: REAL_SCHEME_CODE_2, order_type: "purchase", amount: 3000, units: null,
      });

      const allRows = await query(
        `select units from portfolio_holdings where user_id = $1 and scheme_code = $2 and source = 'invest-order'`,
        [reconcileUserId, REAL_SCHEME_CODE_2]
      );
      expect(allRows.rows).toHaveLength(1); // still ONE row, not two — the second order accumulated rather than fragmenting
      expect(Number(allRows.rows[0].units)).toBeGreaterThan(unitsAfterFirst);

      // Both orders remain independently visible in the transaction ledger, keyed by their own real order id.
      const txns = await query(
        `select folio_number from portfolio_transactions where user_id = $1 and scheme_code = $2 and source = 'invest-order' and folio_number in ($3, $4)`,
        [reconcileUserId, REAL_SCHEME_CODE_2, `order-${orderA}`, `order-${orderB}`]
      );
      expect(txns.rows).toHaveLength(2);
    });

    it("a redemption order produces a negative unit delta (called directly, since the mock provider doesn't track redeemable balances)", async () => {
      // Uses REAL_SCHEME_CODE_3, untouched by any other test in this block — this scheme's first
      // (and only) reconciliation here is the redemption itself, so the resulting row's sign is
      // unambiguous regardless of what other tests already wrote for reconcileUserId elsewhere.
      const fakeOrderId = "00000000-0000-0000-0000-000000000001";
      await portfolioService.reconcileCompletedOrder({
        id: fakeOrderId, user_id: reconcileUserId, scheme_code: REAL_SCHEME_CODE_3,
        order_type: "redemption", amount: 1000, units: null,
      });
      const holding = await query(
        `select units from portfolio_holdings where user_id = $1 and scheme_code = $2 and source = 'invest-order' and folio_number = ''`,
        [reconcileUserId, REAL_SCHEME_CODE_3]
      );
      expect(Number(holding.rows[0].units)).toBeLessThan(0);
    });

    it("silently skips reconciliation for a scheme code that doesn't resolve to a live fund", async () => {
      const fakeOrderId = "00000000-0000-0000-0000-000000000002";
      await expect(portfolioService.reconcileCompletedOrder({
        id: fakeOrderId, user_id: reconcileUserId, scheme_code: "NOT-A-REAL-SCHEME",
        order_type: "purchase", amount: 1000, units: null,
      })).resolves.toBeUndefined();

      const holding = await query(
        `select 1 from portfolio_holdings where folio_number = $1`,
        [`order-${fakeOrderId}`]
      );
      expect(holding.rows.length).toBe(0);
    });

    it("getPortfolioPerformance returns a real numeric currentValue for a non-empty portfolio, not undefined", async () => {
      // Regression test: getPortfolioPerformance() previously read valuation.totalCurrentValue, a
      // field revaluePortfolio() has never returned (the real field is totalMarketValue) — so this
      // API's valuation.currentValue silently serialized as undefined (JSON.stringify drops it
      // entirely) for every user with real holdings. reconcileUserId has real holdings by this
      // point in the describe block (from the REAL_SCHEME_CODE/_2/_3 tests above), so this exercises
      // the actual non-empty-portfolio path the empty-state test above can't reach.
      const perf = await portfolioService.getPortfolioPerformance(reconcileUserId);
      expect(perf.valuation).not.toBeNull();
      expect(typeof perf.valuation.currentValue).toBe("number");
      expect(perf.valuation.currentValue).toBeGreaterThan(0);
    });

    it("avg_cost blends as a weighted average across purchases at different NAVs, not frozen at the first order's price", async () => {
      // The consolidation fix above means repeat purchases now land in ONE row, so avg_cost must
      // be recomputed on every inflow or investedValue/gainLoss silently drifts wrong (buildHolding()
      // derives purchaseValue = avg_cost * units, so this isn't cosmetic). Live NAV can't be forced
      // to change mid-test-run, so this seeds a synthetic prior position at a KNOWN, deliberately
      // different cost basis, then reconciles a real purchase at the live NAV and checks the exact
      // blended result — proving the CASE expression actually recomputes rather than freezing.
      const fund = getFund(REAL_SCHEME_CODE_4);
      expect(fund).toBeTruthy();
      const liveNav = fund.nav;
      const priorUnits = 40;
      const priorAvgCost = +(liveNav * 0.6).toFixed(4); // deliberately far from liveNav

      await query(
        `insert into portfolio_holdings (user_id, scheme_code, units, avg_cost, source, folio_number, imported_at)
         values ($1, $2, $3, $4, 'invest-order', '', now())`,
        [reconcileUserId, REAL_SCHEME_CODE_4, priorUnits, priorAvgCost]
      );

      const newUnits = 10;
      await portfolioService.reconcileCompletedOrder({
        id: "00000000-0000-0000-0000-0000000000a3", user_id: reconcileUserId, scheme_code: REAL_SCHEME_CODE_4,
        order_type: "purchase", amount: null, units: newUnits,
      });

      const expectedAvgCost = (priorUnits * priorAvgCost + newUnits * liveNav) / (priorUnits + newUnits);
      const row = await query(
        `select units, avg_cost from portfolio_holdings where user_id = $1 and scheme_code = $2 and source = 'invest-order' and folio_number = ''`,
        [reconcileUserId, REAL_SCHEME_CODE_4]
      );
      expect(Number(row.rows[0].units)).toBeCloseTo(priorUnits + newUnits, 4);
      expect(Number(row.rows[0].avg_cost)).toBeCloseTo(expectedAvgCost, 4);
      expect(Number(row.rows[0].avg_cost)).not.toBeCloseTo(priorAvgCost, 2); // proves it moved, not frozen at the prior price

      // A subsequent redemption must NOT change the (now-blended) avg_cost of the remaining units.
      await portfolioService.reconcileCompletedOrder({
        id: "00000000-0000-0000-0000-0000000000a4", user_id: reconcileUserId, scheme_code: REAL_SCHEME_CODE_4,
        order_type: "redemption", amount: null, units: 5,
      });
      const afterRedemption = await query(
        `select units, avg_cost from portfolio_holdings where user_id = $1 and scheme_code = $2 and source = 'invest-order' and folio_number = ''`,
        [reconcileUserId, REAL_SCHEME_CODE_4]
      );
      expect(Number(afterRedemption.rows[0].units)).toBeCloseTo(priorUnits + newUnits - 5, 4);
      expect(Number(afterRedemption.rows[0].avg_cost)).toBeCloseTo(expectedAvgCost, 4);
    });
  });

  describe("getPortfolioTimeline merge + sort", () => {
    it("merges order-lifecycle events newest-first and respects the limit parameter", async () => {
      const events = await portfolioService.getPortfolioTimeline(reconcileUserId, { limit: 1 });
      expect(events.length).toBe(1);

      const all = await portfolioService.getPortfolioTimeline(reconcileUserId, { limit: 50 });
      expect(all.length).toBeGreaterThanOrEqual(2); // at least the 'submitted' and 'completed' transitions from the order above
      const timestamps = all.map((e) => new Date(e.occurredAt).getTime());
      expect(timestamps).toEqual([...timestamps].sort((a, b) => b - a));
      expect(all.some((e) => e.label === "Units allotted")).toBe(true);
    });
  });

  describe("cross-user isolation", () => {
    it("one user's holdings never appear in another user's portfolio", async () => {
      const freshUserId = await createTestUser("portfolio-isolation");
      try {
        const p = await portfolioService.getPortfolio(freshUserId);
        expect(p.holdings).toEqual([]);
      } finally {
        await deleteTestUser(freshUserId);
      }
    });
  });
}, 180000);
