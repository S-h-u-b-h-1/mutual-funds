import { getFundByIsin, getFundByExactName } from "../funds";
import { getMetadata } from "../metadata";
import { parseFlexibleDate, parseFlexibleNumber } from "./fieldAliases";

// Builds one enriched Holding from an already-resolved fund + the source-reported facts
// (units/cost/date/folio/source). Shared by the import path (normalizeHoldings, below — fund
// resolved by ISIN/name match) and the read path (holdingsRead.js — fund resolved directly by
// stored scheme_code), so enrichment logic exists in exactly one place regardless of caller.
export function buildHolding(fund, { units, avgCost, purchaseValue, purchaseDate, folioNumber, source, isin, importedAt }) {
  if (avgCost == null && purchaseValue != null && units > 0) avgCost = +(purchaseValue / units).toFixed(4);
  if (purchaseValue == null && avgCost != null) purchaseValue = +(avgCost * units).toFixed(2);

  const nav = fund.nav ?? null;
  const currentValue = nav != null ? +(units * nav).toFixed(2) : null;
  const gainLoss = currentValue != null && purchaseValue != null ? +(currentValue - purchaseValue).toFixed(2) : null;
  const gainLossPct = gainLoss != null && purchaseValue > 0 ? +((gainLoss / purchaseValue) * 100).toFixed(2) : null;
  const meta = getMetadata(fund.code);

  return {
    schemeCode: fund.code,
    schemeName: fund.name,
    isin: fund.isin || isin || null,
    units,
    avgCost: avgCost ?? null,
    purchaseValue: purchaseValue ?? null,
    currentValue,
    gainLoss,
    absoluteGain: gainLoss,
    gainLossPct,
    returnPct: gainLossPct,
    purchaseDate: purchaseDate ?? null,
    amc: fund.amc || null,
    category: fund.category || null,
    benchmark: fund.benchmark || null,
    expenseRatio: meta?.expense_ratio ?? meta?.direct_expense_ratio ?? meta?.regular_expense_ratio ?? null,
    nav,
    r1d: fund.r1d ?? null,
    // Portfolio Metadata: the date this specific nav value is from, and how many trading days old
    // it is — same fields revaluation.js's own (separately re-fetched) getFund() call already
    // relies on, now carried on the holding itself so callers of getPortfolio()/getPortfolioHoldings()
    // can show per-holding freshness without a second lookup.
    navDate: fund.navDate || null,
    staleDays: fund.staleDays ?? null,
    weight: null, // filled in by computeWeights, once the full batch total is known
    source,
    folioNumber: folioNumber ?? null,
    importedAt: importedAt ?? new Date().toISOString(),
  };
}

// Weight is portfolio-level (% of total current value across the whole set), so it can only be
// computed once every holding in the batch is known — never per-row.
export function computeWeights(holdings) {
  const totalValue = holdings.reduce((sum, h) => sum + (h.currentValue || 0), 0);
  for (const h of holdings) {
    h.weight = totalValue > 0 && h.currentValue != null ? +((h.currentValue / totalValue) * 100).toFixed(2) : null;
  }
  return holdings;
}

// Resolves each raw parsed row to a real scheme (ISIN first, exact-name fallback — never a fuzzy
// guess), then delegates to buildHolding for enrichment. A row that can't be resolved or has
// invalid units is reported as an error and excluded, never silently dropped or guessed.
export function normalizeHoldings(rawRows, source) {
  const resolved = [];
  const errors = [];

  for (const row of rawRows) {
    const fund = (row.isin && getFundByIsin(row.isin)) || (row.schemeName && getFundByExactName(row.schemeName)) || null;
    if (!fund) {
      errors.push({
        line: row._sourceLine ?? null,
        schemeName: row.schemeName || "(blank)",
        reason: row.isin
          ? `No fund matches ISIN "${row.isin}".`
          : `No unique fund matches the name "${row.schemeName}" (no ISIN was provided to match on instead).`,
      });
      continue;
    }

    const units = parseFlexibleNumber(row.units);
    if (units == null || units <= 0) {
      errors.push({ line: row._sourceLine ?? null, schemeName: fund.name, reason: `Invalid or missing units ("${row.units}").` });
      continue;
    }

    resolved.push(
      buildHolding(fund, {
        units,
        avgCost: parseFlexibleNumber(row.avgCost),
        purchaseValue: parseFlexibleNumber(row.purchaseValue),
        purchaseDate: parseFlexibleDate(row.purchaseDate),
        folioNumber: row.folioNumber || null,
        source,
        isin: row.isin || null,
      })
    );
  }

  return { holdings: computeWeights(resolved), errors };
}
