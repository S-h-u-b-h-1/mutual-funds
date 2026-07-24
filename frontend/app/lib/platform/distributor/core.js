// Distributor Identity & Regulatory Configuration. Suasion Securities' own AMFI distributor
// identity (ARN) and the individual-employee registrations under it (EUINs), config/DB-backed —
// see sql/neon/017_distributor_identity.sql and docs/DISTRIBUTOR_IDENTITY.md. Every order/
// mandate/document/audit touchpoint that needs ARN/EUIN attribution should call one of these
// functions, never embed the literal values — including a future real provider adapter (BSE
// StAR MF, CAMS, KFintech), which should obtain them from here too rather than its own copy.
import { query } from "../../db.js";

const ATTRIBUTION_SELECT = `
  select a.arn, a.distributor_name, a.arn_valid_until, e.id as euin_id, e.euin,
         e.advisor_id, e.branch_name, e.branch_code, e.contact_name, e.contact_email, e.contact_phone
  from distributor_euins e
  join distributor_arns a on a.id = e.distributor_arn_id
`;

/** The EUIN used to attribute an order/mandate when no more specific advisor context applies —
 * today, this is every order, since no placement flow yet passes an advisor context (see
 * orderService.js's createOrder). Throws rather than silently attributing nothing: an order
 * placed with no distributor attribution at all would be a real data-integrity problem once a
 * distributor identity is supposed to exist, not a degraded-but-acceptable state. */
export async function getDefaultDistributorAttribution() {
  const r = await query(`${ATTRIBUTION_SELECT} where e.is_default = true and e.active = true and a.active = true limit 1`);
  if (r.rows.length === 0) {
    throw new Error("getDefaultDistributorAttribution: no active default distributor EUIN is configured.");
  }
  return r.rows[0];
}

/** Prefers an EUIN specifically mapped to the given advisor (RM mapping); falls back to the
 * default EUIN if the advisor has none mapped, or if advisorId is null/undefined. This is the
 * forward-looking entry point for advisor-assisted transactions (Journey 5) — not yet called
 * from any live order-placement path, since none currently accepts an advisor context, but the
 * lookup itself is ready for when one does. */
export async function getDistributorAttributionForAdvisor(advisorId) {
  if (advisorId) {
    const r = await query(`${ATTRIBUTION_SELECT} where e.advisor_id = $1 and e.active = true and a.active = true limit 1`, [advisorId]);
    if (r.rows.length > 0) return r.rows[0];
  }
  return getDefaultDistributorAttribution();
}

/** Full read of one distributor firm (by ARN) and every EUIN registered under it — for
 * disclosure/display surfaces that need more than just the default attribution (e.g. a future
 * operator-facing distributor-profile view). Returns null for an unknown ARN. */
export async function getDistributorProfile(arn) {
  const firm = await query(`select * from distributor_arns where arn = $1`, [arn]);
  if (firm.rows.length === 0) return null;
  const euins = await query(
    `select * from distributor_euins where distributor_arn_id = $1 order by is_default desc, created_at`,
    [firm.rows[0].id]
  );
  return { ...firm.rows[0], euins: euins.rows };
}
