// Journey 3 — Portfolio. A thin orchestration layer over the EXISTING, already-tested portfolio
// intelligence engine (frontend/app/lib/portfolioIntelligence/*, frontend/app/lib/portfolioImport/*)
// — per the explicit "reuse existing analytics, do not duplicate" instruction, this file computes
// nothing about allocation/health/valuation itself; it reads holdings the same way the existing
// /api/v1/portfolio/intelligence route does and hands them to the same functions.
//
// portfolio_holdings/portfolio_transactions (sql/neon/002_auth_and_user_data.sql) are the ONE
// canonical source regardless of origin — CAS import, a completed Journey 2 order, or an explicit
// mock-connect action all write into the same two tables, tagged by `source`. Nothing downstream
// (allocation, health score, valuation) needs to know which.
import { query } from "../db.js";
import { getFund } from "../funds.js";
import { getUserHoldings, getUserTransactions } from "../portfolioImport/holdingsRead.js";
import { revaluePortfolio } from "../portfolioImport/revaluation.js";
import { computePerformanceLeaders } from "../portfolioImport/performanceLeaders.js";
import { buildHealthReport } from "../portfolioIntelligence/healthReport.js";
import { portfolioProvider } from "./providers/index.js";
import { logAudit } from "./audit.js";
import { notifyUser } from "./notifications.js";
import { emitEvent } from "../platform/events/core.js";

function toValuationHolding(h) {
  return { id: h.schemeCode, schemeCode: h.schemeCode, unitBalance: h.units, investedValue: h.purchaseValue };
}
function toLeaderHolding(h) {
  return { schemeCode: h.schemeCode, schemeName: h.schemeName, folioNumber: h.folioNumber, investedValue: h.purchaseValue, marketValue: h.currentValue, weight: h.weight };
}

const EMPTY_SUMMARY = {
  totalValue: 0, investedValue: 0, gainLoss: 0, gainLossPct: null, xirr: null,
  holdingsCount: 0, healthScore: null, qualityScore: null,
  effectiveHoldings: 0, effectiveAmcs: 0, effectiveCategories: 0,
};

async function loadHoldingsAndReport(userId) {
  const { holdings: rawHoldings, unresolved } = await getUserHoldings(userId);
  if (rawHoldings.length === 0) return { rawHoldings: [], unresolved, report: null, valuation: null, leaders: [] };

  const transactions = await getUserTransactions(userId);
  const valuation = revaluePortfolio(rawHoldings.map(toValuationHolding), getFund, transactions);
  const leaders = computePerformanceLeaders(rawHoldings.map(toLeaderHolding));
  const report = buildHealthReport(rawHoldings);
  return { rawHoldings, unresolved, report, valuation, leaders };
}

// GET /portfolio — everything in one response, for a single-call dashboard render.
export async function getPortfolio(userId) {
  const { rawHoldings, unresolved, report, valuation, leaders } = await loadHoldingsAndReport(userId);
  if (!report) {
    return { holdings: [], unresolved, summary: EMPTY_SUMMARY, allocation: null, topHoldings: [], performanceLeaders: [] };
  }
  const a = report._analytics;
  return {
    holdings: a.holdings,
    unresolved,
    summary: buildSummary(a, valuation),
    allocation: report.allocations,
    topHoldings: report.topHoldings,
    performanceLeaders: leaders,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    bottomLine: report.bottomLine,
  };
}

function buildSummary(a, valuation) {
  return {
    totalValue: a.totalValue,
    investedValue: valuation.totalInvestedValue,
    gainLoss: valuation.absoluteGain,
    gainLossPct: valuation.absoluteReturnPct,
    xirr: valuation.xirr,
    holdingsCount: a.holdingsCount,
    healthScore: a.healthScore,
    qualityScore: a.qualityScore,
    effectiveHoldings: a.effectiveHoldings,
    effectiveAmcs: a.effectiveAmcs,
    effectiveCategories: a.effectiveCategories,
    staleHoldingCount: valuation.staleHoldingCount,
    latestNavCoveragePct: valuation.latestNavCoveragePct,
  };
}

export async function getPortfolioSummary(userId) {
  const { report, valuation } = await loadHoldingsAndReport(userId);
  if (!report) return EMPTY_SUMMARY;
  return buildSummary(report._analytics, valuation);
}

export async function getPortfolioHoldings(userId) {
  const { rawHoldings, unresolved, report } = await loadHoldingsAndReport(userId);
  if (rawHoldings.length === 0) return { holdings: [], unresolved };
  return { holdings: report._analytics.holdings, unresolved }; // consolidated + weighted, matches getPortfolio's shape
}

export async function getPortfolioAllocation(userId) {
  const { report } = await loadHoldingsAndReport(userId);
  if (!report) return { amc: [], category: [], benchmark: [], sector: null };
  return report.allocations;
}

export async function getPortfolioPerformance(userId) {
  const { report, valuation, leaders } = await loadHoldingsAndReport(userId);
  const snapshots = await query(
    `select snapshot_date, total_value, holdings_count from portfolio_snapshots where user_id = $1 order by snapshot_date`,
    [userId]
  );
  if (!report) {
    return { valuation: null, performanceLeaders: [], history: snapshots.rows, historyNote: "No holdings yet." };
  }
  return {
    valuation: { investedValue: valuation.totalInvestedValue, currentValue: valuation.totalCurrentValue, gainLoss: valuation.absoluteGain, gainLossPct: valuation.absoluteReturnPct, xirr: valuation.xirr },
    performanceLeaders: leaders,
    history: snapshots.rows,
    historyNote: snapshots.rows.length < 3
      ? `Only ${snapshots.rows.length} historical snapshot(s) recorded — too little to chart a trend yet. This grows over time, never backfilled with estimates.`
      : null,
  };
}

// Portfolio Timeline — merges order lifecycle events (Journey 2) and settled transactions (CAS
// import + reconciled orders) into one chronological feed. Only emits event types this platform
// actually has real data for today (order/transaction-derived) — Document Generated / Advisor
// Note event types will appear once Journeys 4/5 land; never stubbed in ahead of that data
// existing.
export async function getPortfolioTimeline(userId, { limit = 50 } = {}) {
  const orderEvents = await query(
    `select osh.to_status, osh.reason, osh.created_at, io.scheme_code, io.order_type, io.amount, io.units
       from order_status_history osh
       join investment_orders io on io.id = osh.order_id
      where io.user_id = $1`,
    [userId]
  );
  const transactionEvents = await query(
    `select transaction_type, transaction_date, scheme_code, amount, source
       from portfolio_transactions where user_id = $1`,
    [userId]
  );

  const ORDER_STATUS_LABEL = {
    submitted: "Investment submitted", processing: "Sent for processing", units_pending: "Units allotment pending",
    completed: "Units allotted", failed: "Order failed", cancelled: "Order cancelled",
    retry_required: "Order needs retry", reversed: "Order reversed",
  };
  const TRANSACTION_LABEL = {
    purchase: "Investment settled", redemption: "Redemption completed", switch_in: "Switch completed (in)",
    switch_out: "Switch completed (out)", dividend_payout: "Dividend received", dividend_reinvest: "Dividend reinvested",
  };

  const events = [
    ...orderEvents.rows.map((r) => ({
      type: "order_status", label: ORDER_STATUS_LABEL[r.to_status] || r.to_status, schemeCode: r.scheme_code,
      orderType: r.order_type, amount: r.amount, units: r.units, reason: r.reason, occurredAt: r.created_at,
    })),
    ...transactionEvents.rows.map((r) => ({
      type: "transaction", label: TRANSACTION_LABEL[r.transaction_type] || r.transaction_type, schemeCode: r.scheme_code,
      amount: r.amount, source: r.source, occurredAt: r.transaction_date,
    })),
  ].sort((x, y) => new Date(y.occurredAt) - new Date(x.occurredAt));

  return events.slice(0, limit);
}

// Explicit, user-initiated only — never called as a side effect of anything else. Idempotent:
// if this user already has mock-connected holdings, returns them unchanged rather than doubling
// up. Every persisted row is tagged source='mock-connected', never confused with a real CAS
// import or a real completed order downstream.
export async function connectMockPortfolio(userId) {
  const existing = await query(`select 1 from portfolio_holdings where user_id = $1 and source = 'mock-connected' limit 1`, [userId]);
  if (existing.rows.length > 0) {
    return { alreadyConnected: true, ...(await getPortfolio(userId)) };
  }

  const { holdings } = await portfolioProvider.syncHoldings(userId);
  let inserted = 0;
  for (const h of holdings) {
    const fund = getFund(h.schemeCode);
    if (!fund || fund.nav == null) continue; // never persist a holding for a scheme that doesn't resolve or has no live NAV
    const avgCost = +(fund.nav * h.costFactor).toFixed(4);
    const purchaseDate = new Date(Date.now() - h.purchaseDaysAgo * 86400000).toISOString().slice(0, 10);
    await query(
      `insert into portfolio_holdings (user_id, scheme_code, units, avg_cost, source, folio_number, imported_at)
       values ($1, $2, $3, $4, 'mock-connected', $5, now())
       on conflict (user_id, scheme_code, source, folio_number) do nothing`,
      [userId, h.schemeCode, h.units, avgCost, h.folioNumber]
    );
    await query(
      `insert into portfolio_transactions (user_id, scheme_code, transaction_type, units, nav_value, amount, transaction_date, source, folio_number)
       values ($1, $2, 'purchase', $3, $4, $5, $6, 'mock-connected', $7)`,
      [userId, h.schemeCode, h.units, avgCost, +(h.units * avgCost).toFixed(2), purchaseDate, h.folioNumber]
    );
    inserted++;
  }

  await logAudit(userId, "mock_portfolio_connected", { holdingsInserted: inserted });
  await notifyUser(userId, "portfolio_connected", { title: "Demo portfolio connected", body: `${inserted} holdings added from the mock provider.`, relatedEntityType: "portfolio" });
  if (inserted > 0) {
    await emitEvent("PortfolioUpdated", { userId, reason: "mock_connected", holdingsInserted: inserted }, { correlationId: userId, source: "portfolioService" });
  }

  return { alreadyConnected: false, ...(await getPortfolio(userId)) };
}

// Reconciliation: called by orderService.transition() when an order reaches 'completed' — writes
// the SAME two tables CAS import and mock-connect use, tagged source='invest-order', so
// downstream analytics never needs a third code path. Units allotted = order.units if the order
// specified units directly; otherwise amount / current NAV (a real simplification — real
// allotment uses the NAV on the actual allotment date, which this mock timeline doesn't track;
// documented, not hidden).
export async function reconcileCompletedOrder(order) {
  const fund = getFund(order.scheme_code);
  if (!fund || fund.nav == null) return; // can't reconcile a scheme with no resolvable live NAV
  const nav = fund.nav;
  const units = order.units != null ? Number(order.units) : +(Number(order.amount) / nav).toFixed(4);
  const isInflow = order.order_type === "purchase" || order.order_type === "switch_in";
  const deltaUnits = isInflow ? units : -units;
  const transactionType = order.order_type; // enum values match portfolio_transactions.transaction_type exactly

  await query(
    `insert into portfolio_holdings (user_id, scheme_code, units, avg_cost, source, folio_number, imported_at)
     values ($1, $2, $3, $4, 'invest-order', $5, now())
     on conflict (user_id, scheme_code, source, folio_number) do update set
       units = portfolio_holdings.units + excluded.units,
       imported_at = now()`,
    [order.user_id, order.scheme_code, deltaUnits, nav, `order-${order.id}`]
  );
  await query(
    `insert into portfolio_transactions (user_id, scheme_code, transaction_type, units, nav_value, amount, transaction_date, source, folio_number)
     values ($1, $2, $3, $4, $5, $6, current_date, 'invest-order', $7)`,
    [order.user_id, order.scheme_code, transactionType, units, nav, order.amount ?? +(units * nav).toFixed(2), `order-${order.id}`]
  );
  await emitEvent("PortfolioUpdated", { userId: order.user_id, reason: "order_settled", orderId: order.id, schemeCode: order.scheme_code }, { correlationId: order.user_id, source: "portfolioService" });
}
