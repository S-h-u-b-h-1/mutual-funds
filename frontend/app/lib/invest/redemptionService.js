// Redemption Contract — backend contract slice, 2026-07-24 priority brief. Backs
// docs/REDEMPTION_CONTRACT.md. Two exports: getRedemptionEligibility() is a stateless, live-
// computed preview (never persisted — NAV/holding-period/pending-orders all change by the
// minute, so a stored "quote" would just be a second, staler source of truth); createRedemptionOrder()
// re-runs the SAME eligibility computation server-side before writing anything, so a client can
// never submit against a stale quote.
//
// Does not call orderService.createOrder() — that function explicitly refuses orderType=
// 'redemption' (see its validateOrderInput) because it has no way to enforce folio ownership,
// redeemable-balance, ELSS lock-in, or payout-bank requirements generically. This file is the
// ONLY path that can create a redemption order; it does its own insert, then hands off to
// orderService's already-generic submitOrder()/transition() for everything after that (provider
// submission, status polling, settlement, payout).
import { query } from "../db.js";
import { getFund } from "../funds.js";
import { classifyFundTaxTreatment, EXIT_LOAD_GENERAL_GUIDANCE } from "../portfolioIntelligence/taxEngine.js";
import { assertInvestmentReady, submitOrder } from "./orderService.js";
import { logAudit } from "./audit.js";
import { getDefaultDistributorAttribution } from "../platform/distributor/core.js";

const ELSS_LOCK_IN_DAYS = 3 * 365;
// A redemption order in any of these statuses is genuinely resolved — its units are free again.
// Deliberately NOT orderService's TERMINAL_STATUSES: that set also includes 'retry_required',
// which is a recoverable state (the user can retry the SAME order) where the units are still
// spoken for. Using the wrong set here would let a second redemption request double-spend units
// that are really just sitting in a retryable order.
const RESOLVED_STATUSES = ["completed", "failed", "cancelled", "reversed"];

function daysBetween(from, to) {
  return Math.floor((to.getTime() - new Date(from).getTime()) / 86400000);
}

// Only computes a number where the app's own existing content (taxEngine's general guidance)
// already asserts one crisp, unambiguous figure — equity-oriented, 1% within 12 months. Every
// other bucket ("nil to 1% within 6-12 months", "a small graded load") is a range, not a value,
// so this deliberately returns null rather than collapsing a range into a fake precise number.
function estimateExitLoad(treatment, holdingPeriodDays) {
  if (treatment !== "equityOriented" || holdingPeriodDays == null) return null;
  return holdingPeriodDays < 365 ? 1 : 0;
}

export async function getRedemptionEligibility(userId, schemeCode) {
  const fund = getFund(schemeCode);
  if (!fund) throw new Error(`Unknown scheme code '${schemeCode}': cannot resolve fund/NAV data.`);
  const taxTreatment = classifyFundTaxTreatment(fund.category);

  const [holdingsResult, pendingResult, earliestResult, bankResult] = await Promise.all([
    query(`select source, folio_number, units, avg_cost from portfolio_holdings where user_id = $1 and scheme_code = $2 and units > 0`, [userId, schemeCode]),
    query(
      `select folio_number, coalesce(sum(units), 0) as pending_units
       from investment_orders
       where user_id = $1 and scheme_code = $2 and order_type = 'redemption' and status != all($3)
       group by folio_number`,
      [userId, schemeCode, RESOLVED_STATUSES]
    ),
    query(
      `select folio_number, min(transaction_date) as earliest_purchase
       from portfolio_transactions
       where user_id = $1 and scheme_code = $2 and transaction_type = 'purchase'
       group by folio_number`,
      [userId, schemeCode]
    ),
    query(
      `select id, account_number_masked, ifsc, account_holder_name
       from bank_accounts where user_id = $1 and verified = true
       order by is_primary desc, created_at desc limit 1`,
      [userId]
    ),
  ]);

  const pendingByFolio = new Map(pendingResult.rows.map((r) => [r.folio_number, Number(r.pending_units)]));
  const earliestByFolio = new Map(earliestResult.rows.map((r) => [r.folio_number, r.earliest_purchase]));
  const payoutBank = bankResult.rows[0]
    ? { id: bankResult.rows[0].id, accountNumberMasked: bankResult.rows[0].account_number_masked, ifsc: bankResult.rows[0].ifsc, accountHolderName: bankResult.rows[0].account_holder_name }
    : null;

  const today = new Date();
  const folios = holdingsResult.rows.map((row) => {
    const unitsHeld = Number(row.units);
    const unitsPendingRedemption = pendingByFolio.get(row.folio_number) || 0;
    const unitsRedeemable = Math.max(0, +(unitsHeld - unitsPendingRedemption).toFixed(4));
    const earliestPurchaseDate = earliestByFolio.get(row.folio_number) || null;
    const holdingPeriodDays = earliestPurchaseDate ? daysBetween(earliestPurchaseDate, today) : null;

    const elssLockIn = taxTreatment.isElss
      ? { locked: holdingPeriodDays == null || holdingPeriodDays < ELSS_LOCK_IN_DAYS, unlockDate: earliestPurchaseDate ? new Date(new Date(earliestPurchaseDate).getTime() + ELSS_LOCK_IN_DAYS * 86400000).toISOString().slice(0, 10) : null }
      : null;

    const estimatedPct = estimateExitLoad(taxTreatment.treatment, holdingPeriodDays);
    const availableAmount = fund.nav != null ? +(unitsRedeemable * fund.nav).toFixed(2) : null;
    const estimatedExitLoadAmount = estimatedPct != null && availableAmount != null ? +(availableAmount * estimatedPct / 100).toFixed(2) : null;

    const blockers = [];
    if (unitsRedeemable <= 0) {
      blockers.push(unitsPendingRedemption > 0
        ? "No redeemable units — the full balance is already pending in another redemption request."
        : "No redeemable units in this folio.");
    }
    if (elssLockIn?.locked) {
      blockers.push(earliestPurchaseDate
        ? `ELSS units carry a mandatory 3-year lock-in from purchase date; not eligible until ${elssLockIn.unlockDate}.`
        : "ELSS units carry a mandatory 3-year lock-in from purchase date; this app has no purchase-date record for this folio, so lock-in status cannot be confirmed — treated as locked until it can be.");
    }

    return {
      folioNumber: row.folio_number,
      source: row.source,
      unitsHeld, unitsPendingRedemption, unitsRedeemable,
      avgCost: row.avg_cost != null ? Number(row.avg_cost) : null,
      availableAmount,
      estimatedGainLoss: row.avg_cost != null && availableAmount != null ? +(availableAmount - unitsRedeemable * Number(row.avg_cost)).toFixed(2) : null,
      taxContext: { earliestPurchaseDate, holdingPeriodDays, elssLockIn, note: "Holding period is the earliest known purchase transaction for this folio, not a full FIFO lot ledger — a partial redemption's actual short/long-term split may differ. See docs/REDEMPTION_CONTRACT.md §3." },
      exitLoad: { estimatedPct, estimatedAmount: estimatedExitLoadAmount, isEstimate: true, basis: "general market convention, not this fund's actual factsheet figure", note: EXIT_LOAD_GENERAL_GUIDANCE },
      eligible: blockers.length === 0,
      blockers,
    };
  });

  const portfolioBlockers = [];
  if (folios.length === 0) portfolioBlockers.push("No holdings found for this scheme.");
  if (!payoutBank) portfolioBlockers.push("No verified payout bank account on file — required before any redemption can be processed.");
  // Guards createRedemptionOrder's amount->units conversion below: dividing by a null nav would
  // silently produce NaN, and `NaN > unitsRedeemable` is always false in JS — the overdraw check
  // would wrongly pass. Same defensive shape as portfolioService.js's reconcileCompletedOrder.
  if (fund.nav == null) portfolioBlockers.push("No live NAV available for this scheme — cannot compute redemption value.");

  return {
    schemeCode, fundName: fund.name ?? null, fundAmc: fund.amc ?? null, category: fund.category ?? null,
    nav: fund.nav ?? null, navDate: fund.navDate ?? null,
    taxTreatment: { treatment: taxTreatment.treatment, treatmentDetail: taxTreatment.treatment ? { label: taxTreatment.label, ltcgHoldingPeriod: taxTreatment.ltcgHoldingPeriod, ltcgRate: taxTreatment.ltcgRate, stcgHoldingPeriod: taxTreatment.stcgHoldingPeriod, stcgRate: taxTreatment.stcgRate, note: taxTreatment.note } : null, isElss: taxTreatment.isElss },
    payoutBank,
    folios,
    eligible: portfolioBlockers.length === 0 && folios.some((f) => f.eligible),
    blockers: portfolioBlockers,
  };
}

export async function createRedemptionOrder(userId, { schemeCode, folioNumber, amount = null, units = null, draft = false }) {
  await assertInvestmentReady(userId);
  if (!schemeCode) throw new Error("schemeCode is required.");
  if (!folioNumber) throw new Error("folioNumber is required — see GET the eligibility contract for which folios are available.");
  if (amount == null && units == null) throw new Error("Either amount or units is required.");

  const eligibility = await getRedemptionEligibility(userId, schemeCode);
  const folio = eligibility.folios.find((f) => f.folioNumber === folioNumber);
  if (!folio) throw new Error(`No holding found for scheme '${schemeCode}' under folio '${folioNumber}'.`);
  // Portfolio-level blockers (no verified payout bank, no live NAV) apply regardless of which
  // folio was requested — checked generally, not just the payout-bank case, so a future new
  // portfolio-level blocker can't silently slip past this gate the way missing-NAV almost did.
  // Checked after the folio lookup so "you don't hold this folio" stays the more specific,
  // actionable error when both are true.
  if (eligibility.blockers.length > 0) throw new Error(`Not eligible for redemption: ${eligibility.blockers.join(" ")}`);
  if (!folio.eligible) throw new Error(`Folio is not eligible for redemption: ${folio.blockers.join(" ")}`);

  const requestedUnits = units != null ? Number(units) : +(Number(amount) / eligibility.nav).toFixed(4);
  if (requestedUnits > folio.unitsRedeemable + 1e-6) {
    throw new Error(`Requested ${requestedUnits} units exceeds the redeemable balance of ${folio.unitsRedeemable} units for folio '${folioNumber}'.`);
  }

  // Frozen at this moment, from the SAME eligibility computation just used to validate the
  // request — never recomputed later. Same snapshot principle as distributor attribution
  // (sql/neon/017) and for the same reason: what the investor was quoted must not silently
  // drift as NAV/holding-period keep moving after they've acted.
  const exitLoadPct = folio.exitLoad.estimatedPct;
  const grossAmount = amount != null ? Number(amount) : +(requestedUnits * eligibility.nav).toFixed(2);
  const exitLoadAmount = exitLoadPct != null ? +(grossAmount * exitLoadPct / 100).toFixed(2) : null;
  const netSettlementAmount = exitLoadAmount != null ? +(grossAmount - exitLoadAmount).toFixed(2) : null;

  const distributor = await getDefaultDistributorAttribution();

  const r = await query(
    `insert into investment_orders (
       user_id, scheme_code, order_type, amount, units, status,
       distributor_arn, distributor_euin, folio_number,
       exit_load_pct, exit_load_amount, net_settlement_amount,
       payout_bank_account_id, payout_status
     )
     values ($1, $2, 'redemption', $3, $4, 'draft', $5, $6, $7, $8, $9, $10, $11, 'pending')
     returning *`,
    [userId, schemeCode, amount, units, distributor.arn, distributor.euin, folioNumber, exitLoadPct, exitLoadAmount, netSettlementAmount, eligibility.payoutBank.id]
  );
  const order = r.rows[0];
  await logAudit(userId, "redemption_order_created", {
    orderId: order.id, schemeCode, folioNumber, requestedUnits,
    exitLoadPct, exitLoadAmount, netSettlementAmount,
    payoutBankAccountId: eligibility.payoutBank.id,
    distributorArn: distributor.arn, distributorEuin: distributor.euin,
  });
  if (draft) return order;
  return submitOrder(userId, order.id);
}
