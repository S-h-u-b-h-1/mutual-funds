// Normalizes casParser.js's raw rows into real Holdings + resolved transactions. Unlike the CSV
// import path (normalizer.js), which only trusts an exact ISIN or exact-name match, CAS scheme
// name strings are messier (registrar-specific abbreviations, inconsistent plan/option wording),
// so this path uses the canonical scheme resolver (schemeResolver.js) — a real, tested, already-
// built engine that was sitting unused by any caller until this mission wired it in. Its 7-tier
// waterfall (ISIN -> code -> exact name -> plan/option decomposition -> legacy alias -> constrained
// fuzzy -> unresolved) never silently guesses between multiple plausible schemes: anything short of
// "confirmed" or "high_confidence" is reported as an error requiring the investor's confirmation,
// exactly the brief's "reject ambiguous mappings" requirement.
import { getFund } from "../funds";
import { resolveSchemeIdentity } from "./schemeResolver";
import { buildHolding, computeWeights } from "./normalizer";
import { computeXirr } from "./xirr";

const ACCEPTABLE_STATUSES = new Set(["confirmed", "high_confidence"]);

/**
 * @param {ReturnType<typeof import('./casParser').parseCasText>} parsed
 * @returns {{ holdings, errors, transactions, warnings }}
 */
export function normalizeCasImport(parsed) {
  const holdings = [];
  const errors = [];
  const warnings = [...parsed.warnings];
  const resolvedByFolioIsin = new Map(); // "folio|isin" -> schemeCode, so transactions can reuse the same resolution as their holding row without re-running the resolver

  // Same ISIN + same folio appearing twice within ONE statement is a genuine, real case (not a
  // parser artifact — found live against a real CAS: a Consolidated Account Summary shows one
  // CLOSING balance per scheme+folio, so two rows sharing both can only be a duplicate line the
  // registrar's own export produced). Distinct from "same fund, different folios" (each folio's
  // row is kept, per Phase 4's own instruction) — this narrower key is folio+ISIN together, so
  // that legitimate multi-folio holdings are never touched by this check.
  const seenFolioIsin = new Set();
  const rows = [];
  for (const row of parsed.rows) {
    const key = `${row.folioNumber}|${row.isin}`;
    if (seenFolioIsin.has(key)) {
      warnings.push(`"${row.schemeName}" appears more than once under the same folio in this statement — the repeat was excluded rather than double-counted. If this fund is genuinely held via more than one folio, each folio's row is kept separately; this specifically means the SAME folio listed the SAME scheme twice.`);
      continue;
    }
    seenFolioIsin.add(key);
    rows.push(row);
  }

  for (const row of rows) {
    const resolution = resolveSchemeIdentity({ schemeName: row.schemeName, isin: row.isin });

    if (!ACCEPTABLE_STATUSES.has(resolution.status)) {
      errors.push({
        schemeName: row.schemeName,
        isin: row.isin,
        folioNumber: row.folioNumber,
        reason: resolution.warning || `Could not confidently resolve "${row.schemeName}" to a known scheme.`,
        status: resolution.status,
        ambiguityCandidates: resolution.ambiguityCandidates,
      });
      continue;
    }

    if (row.units == null || row.units <= 0) {
      errors.push({ schemeName: row.schemeName, isin: row.isin, folioNumber: row.folioNumber, reason: `Invalid or missing closing unit balance (${row.units}).` });
      continue;
    }

    const fund = getFund(resolution.schemeCode);
    if (!fund) {
      // Resolver returned a scheme code that funds.js doesn't recognize — an internal consistency
      // gap between the two data sources, not a bad input file. Reported distinctly so it doesn't
      // read as "your statement has an unknown fund" when the fault is on this side.
      errors.push({ schemeName: row.schemeName, isin: row.isin, folioNumber: row.folioNumber, reason: `Resolved to scheme code ${resolution.schemeCode}, which isn't in the current fund universe — this is a platform data gap, not an issue with your statement.` });
      continue;
    }

    resolvedByFolioIsin.set(`${row.folioNumber}|${row.isin}`, fund.code);

    const holding = buildHolding(fund, {
      units: row.units,
      purchaseValue: row.purchaseValue,
      folioNumber: row.folioNumber,
      source: "cas",
      isin: row.isin,
    });
    if (resolution.confidence !== "high") {
      holding.resolutionWarning = resolution.warning; // surfaced to the UI, never silently dropped
    }
    holdings.push(holding);
  }

  const transactions = [];
  for (const t of parsed.transactions) {
    const schemeCode = resolvedByFolioIsin.get(`${t.folioNumber}|${t.isin}`);
    if (!schemeCode) continue; // belongs to a holding that failed resolution above — already reported as an error there, not duplicated here
    transactions.push({
      schemeCode,
      transactionType: t.transactionType,
      transactionDate: t.transactionDate,
      amount: t.amount,
      units: t.units,
      navValue: t.navValue,
      folioNumber: t.folioNumber,
    });
  }

  return { holdings: computeWeights(holdings), errors, transactions, warnings };
}

// Purchases/switch-ins are outflows (money leaving the investor); redemptions/switch-outs/
// dividend payouts are inflows; dividend reinvestment is a unit conversion, not a cash flow, and
// is deliberately excluded. The terminal inflow (today, at currentValue) closes the series so
// XIRR measures the full return to date, not just realized flows.
const OUTFLOW_TYPES = new Set(["purchase", "switch_in"]);
const INFLOW_TYPES = new Set(["redemption", "switch_out", "dividend_payout"]);

/**
 * @param {object[]} transactions same shape as normalizeCasImport's transactions output
 * @param {{schemeCode: string, currentValue: number|null}[]} holdings
 * @returns {{ portfolio: number|null, byScheme: Record<string, number|null> }}
 */
export function computePortfolioXirr(transactions, holdings) {
  const today = new Date().toISOString().slice(0, 10);
  const byScheme = {};
  const portfolioFlows = [];

  const byCode = new Map();
  for (const txn of transactions) {
    if (!byCode.has(txn.schemeCode)) byCode.set(txn.schemeCode, []);
    byCode.get(txn.schemeCode).push(txn);
  }

  for (const holding of holdings) {
    const flows = (byCode.get(holding.schemeCode) || [])
      .filter((t) => OUTFLOW_TYPES.has(t.transactionType) || INFLOW_TYPES.has(t.transactionType))
      .map((t) => ({ date: t.transactionDate, amount: OUTFLOW_TYPES.has(t.transactionType) ? -Math.abs(t.amount) : Math.abs(t.amount) }));
    portfolioFlows.push(...flows);
    if (holding.currentValue != null) {
      flows.push({ date: today, amount: holding.currentValue });
      portfolioFlows.push({ date: today, amount: holding.currentValue });
    }
    byScheme[holding.schemeCode] = computeXirr(flows);
  }

  return { portfolio: computeXirr(portfolioFlows), byScheme };
}
