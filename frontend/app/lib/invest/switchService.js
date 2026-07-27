// Switch Contract — backend contract slice, priority-list item 2/5. Backs
// docs/SWITCH_CONTRACT.md. Models a switch as two linked investment_orders rows (switch_out on
// the source scheme, switch_in on the destination), not a new entity — the two-row shape was
// already in the schema (ORDER_TYPES) since Journey 2, just never wired to real eligibility.
//
// Deliberately reuses redemptionService.getRedemptionEligibility() for the entire source-side
// computation (eligible folios, redeemable units, exit-load estimate, tax context, ELSS lock-in)
// rather than reimplementing it — a switch's source leg realizes gains/pays exit load exactly
// like a redemption does; see docs/SWITCH_CONTRACT.md §1.
import { query, withTransaction } from "../db.js";
import { getFund } from "../funds.js";
import { assertInvestmentReady, submitOrder } from "./orderService.js";
import { getRedemptionEligibility } from "./redemptionService.js";
import { logAudit } from "./audit.js";
import { getDefaultDistributorAttribution } from "../platform/distributor/core.js";

// queryFn threads through to getRedemptionEligibility — see that function's own comment. Only
// matters when createSwitchOrder calls this from inside its advisory-locked transaction; the
// GET /eligibility preview endpoint keeps using the plain pool query via the default.
export async function getSwitchEligibility(userId, sourceSchemeCode, destinationSchemeCode, queryFn = query) {
  if (sourceSchemeCode === destinationSchemeCode) {
    throw new Error("Source and destination scheme codes must differ — a fund cannot be switched into itself.");
  }
  const destinationFund = getFund(destinationSchemeCode);
  if (!destinationFund) throw new Error(`Unknown destination scheme code '${destinationSchemeCode}': cannot resolve fund data.`);

  const source = await getRedemptionEligibility(userId, sourceSchemeCode, queryFn);
  const sameAmc = source.fundAmc != null && destinationFund.amc != null
    ? source.fundAmc === destinationFund.amc
    : false;
  const destinationActive = destinationFund.active !== false;

  const blockers = [...source.blockers];
  // Real BSE StAR MF / AMFI "switch" is a single same-AMC transaction type; a cross-AMC move is
  // not one transaction, it is a redemption plus a separate fresh purchase. Enforced as a hard
  // gate rather than silently treated as a switch — see docs/SWITCH_CONTRACT.md §2.
  if (!sameAmc) blockers.push(`Switch requires the same AMC on both sides — source is '${source.fundAmc || "unknown"}', destination is '${destinationFund.amc || "unknown"}'. Use a separate redemption and purchase instead.`);
  if (!destinationActive) blockers.push("Destination scheme is not currently open for subscription.");

  return {
    sourceSchemeCode, destinationSchemeCode,
    sourceFundName: source.fundName, destinationFundName: destinationFund.name ?? null,
    sourceAmc: source.fundAmc, destinationAmc: destinationFund.amc ?? null,
    sameAmc, destinationActive,
    destinationNav: destinationFund.nav ?? null, destinationNavDate: destinationFund.navDate ?? null,
    source,
    eligible: blockers.length === 0 && source.folios.some((f) => f.eligible),
    blockers,
  };
}

export async function createSwitchOrder(userId, { sourceSchemeCode, destinationSchemeCode, folioNumber, amount = null, units = null, draft = false }) {
  await assertInvestmentReady(userId);
  if (!folioNumber) throw new Error("folioNumber is required — see GET the switch eligibility contract for which folios are available.");
  if (amount == null && units == null) throw new Error("Either amount or units is required.");
  // Backend Hardening (2026-07-24): same negative/zero gap as redemptionService's own guard —
  // this file's overdraw check has the identical `requestedUnits > unitsRedeemable` shape,
  // which a negative value would always pass.
  if (amount != null && !(amount > 0)) throw new Error("amount must be greater than 0.");
  if (units != null && !(units > 0)) throw new Error("units must be greater than 0.");

  // C2 (docs/BACKEND_AUDIT_REPORT.md, docs/BACKEND_TECHNICAL_DEBT.md): a switch's source leg is a
  // redemption of that folio, tax- and eligibility-wise (see this file's own header comment) —
  // it needs the identical TOCTOU fix. Same advisory lock KEY as redemptionService's own
  // ("redemption:userId:folioNumber", not "switch:...") so a plain redemption and a switch
  // racing on the same folio also correctly serialize against each other, not just switch-vs-
  // switch or redemption-vs-redemption.
  const { switchOut, switchIn, requestedUnits, exitLoadPct, exitLoadAmount, netAmount, distributor } = await withTransaction(async (client) => {
    await client.query(`select pg_advisory_xact_lock(hashtext($1))`, [`redemption:${userId}:${folioNumber}`]);

    const eligibility = await getSwitchEligibility(userId, sourceSchemeCode, destinationSchemeCode, client.query.bind(client));
    const folio = eligibility.source.folios.find((f) => f.folioNumber === folioNumber);
    if (!folio) throw new Error(`No holding found for scheme '${sourceSchemeCode}' under folio '${folioNumber}'.`);
    if (!eligibility.sameAmc || !eligibility.destinationActive) throw new Error(`Not eligible for switch: ${eligibility.blockers.join(" ")}`);
    if (!folio.eligible) throw new Error(`Source folio is not eligible for switch: ${folio.blockers.join(" ")}`);

    const requestedUnits = units != null ? Number(units) : +(Number(amount) / eligibility.source.nav).toFixed(4);
    if (requestedUnits > folio.unitsRedeemable + 1e-6) {
      throw new Error(`Requested ${requestedUnits} units exceeds the redeemable balance of ${folio.unitsRedeemable} units for folio '${folioNumber}'.`);
    }

    // Frozen at this moment, same snapshot principle as redemption/distributor attribution.
    const exitLoadPct = folio.exitLoad.estimatedPct;
    const grossAmount = amount != null ? Number(amount) : +(requestedUnits * eligibility.source.nav).toFixed(2);
    const exitLoadAmount = exitLoadPct != null ? +(grossAmount * exitLoadPct / 100).toFixed(2) : null;
    // What actually reaches the destination purchase — net of the source-side exit load, since no
    // cash changes hands outside the platform on a switch (see sql/neon/019's own comment).
    const netAmount = exitLoadAmount != null ? +(grossAmount - exitLoadAmount).toFixed(2) : grossAmount;

    const distributor = await getDefaultDistributorAttribution();

    const outResult = await client.query(
      `insert into investment_orders (
         user_id, scheme_code, related_scheme_code, order_type, amount, units, status,
         distributor_arn, distributor_euin, folio_number, exit_load_pct, exit_load_amount
       )
       values ($1, $2, $3, 'switch_out', $4, $5, 'draft', $6, $7, $8, $9, $10)
       returning *`,
      [userId, sourceSchemeCode, destinationSchemeCode, amount, units, distributor.arn, distributor.euin, folioNumber, exitLoadPct, exitLoadAmount]
    );
    const switchOut = outResult.rows[0];

    const inResult = await client.query(
      `insert into investment_orders (
         user_id, scheme_code, related_scheme_code, order_type, amount, status,
         distributor_arn, distributor_euin, switch_order_id
       )
       values ($1, $2, $3, 'switch_in', $4, 'draft', $5, $6, $7)
       returning *`,
      [userId, destinationSchemeCode, sourceSchemeCode, netAmount, distributor.arn, distributor.euin, switchOut.id]
    );
    const switchIn = inResult.rows[0];

    const linkedOut = await client.query(`update investment_orders set switch_order_id = $2 where id = $1 returning *`, [switchOut.id, switchIn.id]);

    return { switchOut: linkedOut.rows[0], switchIn, requestedUnits, exitLoadPct, exitLoadAmount, netAmount, distributor };
  });

  await logAudit(userId, "switch_order_created", {
    switchOutId: switchOut.id, switchInId: switchIn.id, sourceSchemeCode, destinationSchemeCode, folioNumber,
    requestedUnits, exitLoadPct, exitLoadAmount, netAmount,
    distributorArn: distributor.arn, distributorEuin: distributor.euin,
  });

  if (draft) return { switchOut, switchIn };
  // Both legs progress independently through the existing generic order engine once submitted —
  // documented limitation, not an oversight; see docs/SWITCH_CONTRACT.md §3.
  const [submittedOut, submittedIn] = await Promise.all([
    submitOrder(userId, switchOut.id),
    submitOrder(userId, switchIn.id),
  ]);
  return { switchOut: submittedOut, switchIn: submittedIn };
}
