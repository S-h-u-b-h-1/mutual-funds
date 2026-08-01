// Stock Portfolio (Stock Intelligence, Section 18) — a separate domain from
// portfolioImport/portfolio_holdings (mutual funds): no folio number, no NAV, no scheme_code. A
// stock position has no live current_value/gain_loss here, on purpose — Section 28 states price
// data "depends on a licensed feed", which does not exist yet; every summary this module returns
// makes that explicit (currentValue: null with a reason) rather than fabricating or silently
// omitting it.
import { query, withTransaction } from "../db.js";

const TRANSACTION_TYPES = new Set(["buy", "sell"]);
const SOURCES = new Set(["manual", "broker_import"]);

function shapeHolding(row) {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    quantity: Number(row.quantity),
    avgCost: Number(row.avg_cost),
    investedValue: Math.round(Number(row.quantity) * Number(row.avg_cost) * 100) / 100,
    source: row.source,
    firstAcquiredAt: row.first_acquired_at,
    updatedAt: row.updated_at,
  };
}

function shapeTransaction(row) {
  return {
    id: row.id,
    userId: row.user_id,
    companyId: row.company_id,
    transactionType: row.transaction_type,
    quantity: Number(row.quantity),
    price: Number(row.price),
    transactionDate: row.transaction_date,
    source: row.source,
    createdAt: row.created_at,
  };
}

// Records the transaction AND updates the holding in one atomic step — a buy blends
// (old_quantity * old_avg_cost + txn_quantity * txn_price) over the new total quantity (the same
// weighted-average approach this session's MF portfolio work already established as correct for
// exactly this scenario); a sell reduces quantity but leaves avg_cost untouched, since selling
// part of a position doesn't change what the remaining units cost. A sell that would take
// quantity negative is rejected — this is a record of real transactions, not a place to paper
// over an inconsistent history.
export async function recordTransaction({ userId, companyId, transactionType, quantity, price, transactionDate, source = "manual" }) {
  if (!TRANSACTION_TYPES.has(transactionType)) throw new Error(`recordTransaction: invalid transactionType '${transactionType}'.`);
  if (!SOURCES.has(source)) throw new Error(`recordTransaction: invalid source '${source}'.`);
  if (!(quantity > 0) || !(price >= 0)) throw new Error("recordTransaction requires quantity > 0 and price >= 0.");

  return withTransaction(async (client) => {
    const existing = await client.query(
      `select quantity, avg_cost from stock_holdings where user_id = $1 and company_id = $2 and source = $3`,
      [userId, companyId, source]
    );
    const oldQuantity = existing.rows[0] ? Number(existing.rows[0].quantity) : 0;
    const oldAvgCost = existing.rows[0] ? Number(existing.rows[0].avg_cost) : 0;

    let newQuantity, newAvgCost;
    if (transactionType === "buy") {
      newQuantity = oldQuantity + quantity;
      newAvgCost = newQuantity === 0 ? 0 : (oldQuantity * oldAvgCost + quantity * price) / newQuantity;
    } else {
      if (quantity > oldQuantity) throw new Error(`recordTransaction: cannot sell ${quantity} units, only ${oldQuantity} held (user ${userId}, company ${companyId}, source ${source}).`);
      newQuantity = oldQuantity - quantity;
      newAvgCost = oldAvgCost; // selling part of a position doesn't change what the rest cost
    }

    const txnResult = await client.query(
      `insert into stock_transactions (user_id, company_id, transaction_type, quantity, price, transaction_date, source)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (user_id, company_id, transaction_type, quantity, price, transaction_date, source) do nothing
       returning *`,
      [userId, companyId, transactionType, quantity, price, transactionDate, source]
    );
    if (!txnResult.rows[0]) {
      // Exact-duplicate transaction (same fingerprint) — a retry or a re-import, not a new event.
      // The holding was already updated for it the first time; do not update it again.
      const holding = await client.query(`select * from stock_holdings where user_id = $1 and company_id = $2 and source = $3`, [userId, companyId, source]);
      return { transaction: null, holding: holding.rows[0] ? shapeHolding(holding.rows[0]) : null, deduped: true };
    }

    const holdingResult = await client.query(
      `insert into stock_holdings (user_id, company_id, quantity, avg_cost, source, first_acquired_at)
       values ($1,$2,$3,$4,$5,$6)
       on conflict (user_id, company_id, source) do update set quantity = excluded.quantity, avg_cost = excluded.avg_cost, updated_at = now()
       returning *`,
      [userId, companyId, newQuantity, newAvgCost, source, transactionType === "buy" ? transactionDate : null]
    );

    return { transaction: shapeTransaction(txnResult.rows[0]), holding: shapeHolding(holdingResult.rows[0]), deduped: false };
  });
}

export async function getHoldings(userId) {
  const r = await query(
    `select h.*, c.display_name, c.nse_symbol, c.bse_code, c.sector_id, c.industry_id
     from stock_holdings h join companies c on c.id = h.company_id
     where h.user_id = $1 and h.quantity > 0
     order by c.display_name asc`,
    [userId]
  );
  return r.rows.map((row) => ({ ...shapeHolding(row), displayName: row.display_name, nseSymbol: row.nse_symbol, bseCode: row.bse_code, sectorId: row.sector_id, industryId: row.industry_id }));
}

export async function getHolding(userId, companyId, source = "manual") {
  const r = await query(`select * from stock_holdings where user_id = $1 and company_id = $2 and source = $3`, [userId, companyId, source]);
  return r.rows[0] ? shapeHolding(r.rows[0]) : null;
}

export async function getTransactions(userId, { companyId = null, limit = 100 } = {}) {
  const clampedLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
  const r = companyId
    ? await query(`select * from stock_transactions where user_id = $1 and company_id = $2 order by transaction_date desc, created_at desc limit $3`, [userId, companyId, clampedLimit])
    : await query(`select * from stock_transactions where user_id = $1 order by transaction_date desc, created_at desc limit $2`, [userId, clampedLimit]);
  return r.rows.map(shapeTransaction);
}

// Invested-value and sector/industry allocation only — currentValue/gainLoss/allocation-by-current-
// value are null with an explicit reason, never fabricated or silently omitted, since there is no
// live price feed behind this yet (Section 28).
export async function getPortfolioSummary(userId) {
  const holdings = await getHoldings(userId);
  const totalInvestedValue = Math.round(holdings.reduce((sum, h) => sum + h.investedValue, 0) * 100) / 100;

  const bySector = {};
  const byIndustry = {};
  for (const h of holdings) {
    const sectorKey = h.sectorId ?? "unclassified";
    const industryKey = h.industryId ?? "unclassified";
    bySector[sectorKey] = (bySector[sectorKey] ?? 0) + h.investedValue;
    byIndustry[industryKey] = (byIndustry[industryKey] ?? 0) + h.investedValue;
  }

  return {
    userId,
    holdingsCount: holdings.length,
    totalInvestedValue,
    currentValue: null,
    gainLoss: null,
    unavailableReason: holdings.length > 0 ? "no_live_price_feed" : null,
    allocationBySector: bySector,
    allocationByIndustry: byIndustry,
    holdings,
  };
}
