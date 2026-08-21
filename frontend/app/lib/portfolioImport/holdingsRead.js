import { query } from "../db.js";
import { getFund } from "../funds.js";
import { buildHolding, computeWeights } from "./normalizer.js";

// Reads a user's persisted portfolio_holdings and enriches each with live fund data — the read
// counterpart to normalizeHoldings' import path. scheme_code is already resolved (stored at
// import time), so this looks funds up directly rather than by ISIN/name match. Rows whose
// scheme_code no longer resolves (a fund removed from the active universe) are reported, not
// silently dropped, since that's a real data-integrity fact the caller should know about.
export async function getUserHoldings(userId) {
  const r = await query(
    `select scheme_code, units, avg_cost, source, folio_number, imported_at
     from portfolio_holdings where user_id = $1 order by imported_at desc`,
    [userId]
  );

  const holdings = [];
  const unresolved = [];
  for (const row of r.rows) {
    const fund = getFund(row.scheme_code);
    if (!fund) {
      unresolved.push({ schemeCode: row.scheme_code, source: row.source, reason: "Scheme code no longer resolves against the active fund universe." });
      continue;
    }
    holdings.push(
      buildHolding(fund, {
        units: Number(row.units),
        avgCost: row.avg_cost != null ? Number(row.avg_cost) : null,
        purchaseValue: null,
        purchaseDate: null,
        folioNumber: row.folio_number || null,
        source: row.source,
        isin: null,
        importedAt: row.imported_at,
      })
    );
  }

  return { holdings: computeWeights(holdings), unresolved };
}

// Read counterpart for portfolio_transactions — parallel to getUserHoldings above. Used by the
// intelligence route to compute XIRR from real dated cash flows; returns the raw stored rows
// (no fund enrichment needed, revaluation.js only needs schemeCode/type/date/amount).
export async function getUserTransactions(userId) {
  const r = await query(
    `select scheme_code, transaction_type, transaction_date, amount
     from portfolio_transactions where user_id = $1 order by transaction_date asc`,
    [userId]
  );
  return r.rows.map((row) => ({
    schemeCode: row.scheme_code,
    transactionType: row.transaction_type,
    transactionDate: row.transaction_date,
    amount: row.amount != null ? Number(row.amount) : null,
  }));
}
