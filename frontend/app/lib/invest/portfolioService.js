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
import { getFund, asOf as fundsDatasetAsOf } from "../funds.js";
import { getUserHoldings, getUserTransactions } from "../portfolioImport/holdingsRead.js";
import { revaluePortfolio } from "../portfolioImport/revaluation.js";
import { computePerformanceLeaders } from "../portfolioImport/performanceLeaders.js";
import { buildHealthReport } from "../portfolioIntelligence/healthReport.js";
import { portfolioProvider } from "./providers/index.js";
import { callProvider } from "./providers/resilience.js";
import { logAudit } from "./audit.js";
import { notifyUser } from "./notifications.js";
import { emitEvent } from "../platform/events/core.js";

function toValuationHolding(h) {
  return { id: h.schemeCode, schemeCode: h.schemeCode, unitBalance: h.units, investedValue: h.purchaseValue };
}
function toLeaderHolding(h) {
  return { schemeCode: h.schemeCode, schemeName: h.schemeName, folioNumber: h.folioNumber, investedValue: h.purchaseValue, marketValue: h.currentValue, weight: h.weight, navDate: h.navDate, staleDays: h.staleDays };
}

const EMPTY_SUMMARY = {
  totalValue: 0, investedValue: 0, gainLoss: 0, gainLossPct: null, xirr: null,
  holdingsCount: 0, healthScore: null, qualityScore: null,
  effectiveHoldings: 0, effectiveAmcs: 0, effectiveCategories: 0,
  latestOfficialNavDate: null, valuationDate: null, valuationConfidence: null,
  latestNavCoveragePct: null, staleHoldingCount: 0, latestNavDayChange: null,
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
    return {
      holdings: [], unresolved, summary: EMPTY_SUMMARY, allocation: null, topHoldings: [], performanceLeaders: [],
      valueHistory: [], valueHistoryRanges: [],
      dataQuality: buildDataQuality(rawHoldings, unresolved, valuation),
    };
  }
  const a = report._analytics;
  const dataQuality = buildDataQuality(rawHoldings, unresolved, valuation);
  const summary = buildSummary(a, valuation, dataQuality, unresolved, rawHoldings.length);
  return {
    // Customer-facing holdings must preserve every stored folio/source row. Analytics below can
    // still use the consolidated report, but the table must not hide a second folio of the same
    // scheme (e.g. the merged-CAS regression imports 13 rows, with two folios in one scheme).
    holdings: rawHoldings,
    unresolved,
    summary,
    allocation: report.allocations,
    topHoldings: report.topHoldings,
    performanceLeaders: leaders,
    strengths: report.strengths,
    weaknesses: report.weaknesses,
    researchOpportunities: report.researchOpportunities,
    bottomLine: report.bottomLine,
    projection: report.projection,
    risk: report.risk,
    diversification: report.diversification,
    concentration: report.concentration,
    valueHistory: buildCurrentValueHistory(summary, dataQuality),
    valueHistoryRanges: summary.totalValue > 0 ? ["since_import"] : [],
    dataQuality,
  };
}

function latestNavDateFromValuation(valuation) {
  return (valuation?.holdingValuations || []).reduce(
    (latest, v) => (v.navDate && (!latest || v.navDate > latest) ? v.navDate : latest),
    null
  );
}

function buildValuationConfidence(valuation, unresolved) {
  if (!valuation || valuation.latestNavCoveragePct == null) return null;
  if (unresolved.length > 0) return "Review required";
  if (valuation.latestNavCoveragePct === 100 && valuation.staleHoldingCount === 0) return "High";
  if (valuation.latestNavCoveragePct >= 80) return "Partial";
  return "Low";
}

function buildLatestNavDayChange(rawHoldings) {
  let previousValue = 0;
  let currentValue = 0;
  let covered = 0;
  for (const holding of rawHoldings) {
    if (holding.currentValue == null || holding.nav == null || holding.units == null || holding.r1d == null) continue;
    const pct = Number(holding.r1d);
    if (!Number.isFinite(pct) || pct <= -100) continue;
    currentValue += Number(holding.currentValue);
    previousValue += Number(holding.currentValue) / (1 + pct / 100);
    covered += 1;
  }
  if (covered === 0 || previousValue <= 0) return null;
  const value = +(currentValue - previousValue).toFixed(2);
  return {
    value,
    percentage: +((value / previousValue) * 100).toFixed(2),
    coveragePct: +((covered / rawHoldings.length) * 100).toFixed(1),
  };
}

function buildCurrentValueHistory(summary, dataQuality) {
  if (!summary || summary.totalValue == null || summary.totalValue <= 0) return [];
  const date = summary.latestOfficialNavDate || dataQuality?.navDateRange?.newest || new Date().toISOString().slice(0, 10);
  return [{
    id: `current-${date}`,
    date,
    marketValue: summary.totalValue,
    investedValue: summary.investedValue,
    gainLoss: summary.gainLoss,
    navCoveragePct: summary.latestNavCoveragePct,
  }];
}

function buildSummary(a, valuation, dataQuality = null, unresolved = [], storedHoldingsCount = a.holdingsCount) {
  const latestOfficialNavDate = latestNavDateFromValuation(valuation) || dataQuality?.navDateRange?.newest || null;
  return {
    totalValue: a.totalValue,
    investedValue: valuation.totalInvestedValue,
    gainLoss: valuation.absoluteGain,
    gainLossPct: valuation.absoluteReturnPct,
    xirr: valuation.xirr,
    holdingsCount: storedHoldingsCount,
    healthScore: a.healthScore,
    qualityScore: a.qualityScore,
    effectiveHoldings: a.effectiveHoldings,
    effectiveAmcs: a.effectiveAmcs,
    effectiveCategories: a.effectiveCategories,
    staleHoldingCount: valuation.staleHoldingCount,
    latestNavCoveragePct: valuation.latestNavCoveragePct,
    latestOfficialNavDate,
    valuationDate: latestOfficialNavDate,
    computedAt: dataQuality?.calculatedAt || new Date().toISOString(),
    valuationConfidence: buildValuationConfidence(valuation, unresolved),
    latestNavDayChange: buildLatestNavDayChange(a.holdings || []),
    evidenceConfidence: a.projection?.confidence || null,
    healthScoreBreakdown: a.healthScoreBreakdown || [],
  };
}

// Portfolio Metadata: freshness/quality facts ABOUT the valuation above, not the valuation
// itself — deliberately a separate top-level key from `summary`, never merged into it, so the
// existing exact-shape EMPTY_SUMMARY contract never has to change for this. `rawHoldings` (the
// pre-consolidation list from getUserHoldings, already ordered imported_at desc) is used rather
// than the consolidated/analytics holdings list, since every individual lot's own import/NAV
// facts matter here, not the scheme-deduplicated view.
function buildDataQuality(rawHoldings, unresolved, valuation) {
  const navDates = rawHoldings.map((h) => h.navDate).filter(Boolean).sort(); // "YYYY-MM-DD" — lexicographic sort is chronological
  const importedTimes = rawHoldings
    .map((h) => (h.importedAt ? new Date(h.importedAt).getTime() : null))
    .filter((t) => t != null && !Number.isNaN(t));

  return {
    calculatedAt: new Date().toISOString(),
    // The whole AMFI-derived dataset's own last refresh (funds.js's exported `asOf`) — a
    // system-wide fact distinct from any one holding's navDate, e.g. "our pipeline last ran on
    // this date" vs. "this specific scheme's NAV is from this date" (a stale/delisted scheme can
    // have a much older navDate than the dataset's own asOf).
    datasetAsOf: fundsDatasetAsOf,
    lastImportedAt: importedTimes.length ? new Date(Math.max(...importedTimes)).toISOString() : null,
    navDateRange: {
      oldest: navDates.length ? navDates[0] : null,
      newest: navDates.length ? navDates[navDates.length - 1] : null,
    },
    // Reused, not recomputed — revaluation.js already derives these from the same per-holding
    // navDate/staleDays facts; duplicating the logic here would risk the two silently diverging.
    staleHoldingCount: valuation?.staleHoldingCount ?? 0,
    latestNavCoveragePct: valuation?.latestNavCoveragePct ?? null,
    unresolvedCount: unresolved.length,
  };
}

// Standalone, for a UI that wants a lightweight freshness/quality check (e.g. a "prices as of"
// badge) without pulling the full combined getPortfolio() payload. Also folded into getPortfolio()
// itself below, same pattern as getPortfolioAllocation/getPortfolioHoldings.
export async function getPortfolioDataQuality(userId) {
  const { rawHoldings, unresolved, valuation } = await loadHoldingsAndReport(userId);
  return buildDataQuality(rawHoldings, unresolved, valuation);
}

export async function getPortfolioSummary(userId) {
  const { rawHoldings, unresolved, report, valuation } = await loadHoldingsAndReport(userId);
  if (!report) return EMPTY_SUMMARY;
  return buildSummary(report._analytics, valuation, buildDataQuality(rawHoldings, unresolved, valuation), unresolved, rawHoldings.length);
}

export async function getPortfolioHoldings(userId) {
  const { rawHoldings, unresolved } = await loadHoldingsAndReport(userId);
  if (rawHoldings.length === 0) return { holdings: [], unresolved };
  return { holdings: rawHoldings, unresolved }; // folio-level stored holdings; analytics endpoints own consolidation
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
    valuation: { investedValue: valuation.totalInvestedValue, currentValue: valuation.totalMarketValue, gainLoss: valuation.absoluteGain, gainLossPct: valuation.absoluteReturnPct, xirr: valuation.xirr },
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

  // A read — fetches the provider's current view of holdings, doesn't create state there. Safe
  // to retry.
  const { holdings } = await callProvider("mock-portfolio", "syncHoldings", () => portfolioProvider.syncHoldings(userId), { retryable: true });
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
//
// Holdings consolidate on a STABLE folio_number ("" — no real folio exists yet, no live provider
// is connected), deliberately NOT unique per order: repeat Suasion purchases of the same scheme
// (e.g. separate SIP installments placed as separate orders) accumulate into ONE holding row, the
// same way multi-installment CAS-imported holdings already do. This was a real, previously-
// unverified question (an earlier per-order-unique folio_number meant the ON CONFLICT target could
// never collide across orders, so repeat purchases silently fragmented into separate rows instead
// of one growing position) — resolved as a deliberate product decision, not guessed at; see
// docs/SUASION_PLATFORM_STATUS.md Section 5 for the full finding and the alternative reading
// (per-purchase-lot tracking for FIFO capital-gains cost basis) that was considered and rejected
// in favor of this simpler model. If lot-level cost-basis tracking is needed later, derive it from
// portfolio_transactions (below) — which correctly keeps ITS OWN per-order identity via
// folio_number, since each transaction must remain its own distinct historical event regardless of
// how the resulting holding consolidates, and both XIRR paths (computePortfolioXirr,
// revaluePortfolio) already join holdings to transactions by scheme_code alone, never by
// folio_number, so this split is safe for every existing consumer.
export async function reconcileCompletedOrder(order) {
  const fund = getFund(order.scheme_code);
  if (!fund || fund.nav == null) return; // can't reconcile a scheme with no resolvable live NAV
  const nav = fund.nav;
  const units = order.units != null ? Number(order.units) : +(Number(order.amount) / nav).toFixed(4);
  const isInflow = order.order_type === "purchase" || order.order_type === "switch_in";
  const deltaUnits = isInflow ? units : -units;
  const transactionType = order.order_type; // enum values match portfolio_transactions.transaction_type exactly

  // avg_cost is the position's weighted-average cost basis, not "this order's NAV" — on a second
  // (and every subsequent) inflow for an already-consolidated holding, it must blend with the
  // existing units at their existing cost, or investedValue/gainLoss silently drifts wrong the
  // moment two purchases land at different NAVs (verified: buildHolding() derives
  // purchaseValue = avg_cost * units, so a stale avg_cost directly corrupts every downstream
  // valuation figure, not just a display label). A redemption/switch_out leaves the remaining
  // units' avg_cost unchanged — selling part of a position doesn't change what the REMAINING
  // units cost, only an inflow does. excluded.units/excluded.avg_cost below are this call's
  // signed delta and current NAV; portfolio_holdings.units/.avg_cost are the pre-update row —
  // Postgres evaluates every SET expression in an UPDATE against the pre-update row, so this is
  // safe even though units is set in the same statement.
  await query(
    `insert into portfolio_holdings (user_id, scheme_code, units, avg_cost, source, folio_number, imported_at)
     values ($1, $2, $3, $4, 'invest-order', '', now())
     on conflict (user_id, scheme_code, source, folio_number) do update set
       avg_cost = case
         when excluded.units > 0 then
           (portfolio_holdings.units * portfolio_holdings.avg_cost + excluded.units * excluded.avg_cost)
           / nullif(portfolio_holdings.units + excluded.units, 0)
         else portfolio_holdings.avg_cost
       end,
       units = portfolio_holdings.units + excluded.units,
       imported_at = now()`,
    [order.user_id, order.scheme_code, deltaUnits, nav]
  );
  await query(
    `insert into portfolio_transactions (user_id, scheme_code, transaction_type, units, nav_value, amount, transaction_date, source, folio_number)
     values ($1, $2, $3, $4, $5, $6, current_date, 'invest-order', $7)`,
    [order.user_id, order.scheme_code, transactionType, units, nav, order.amount ?? +(units * nav).toFixed(2), `order-${order.id}`]
  );
  await emitEvent("PortfolioUpdated", { userId: order.user_id, reason: "order_settled", orderId: order.id, schemeCode: order.scheme_code }, { correlationId: order.user_id, source: "portfolioService" });
}
