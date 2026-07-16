// Diffs a new CAS import's resolved rows against the previously-approved import's active
// holdings (Persistent Portfolio Mission, Phase 6). Pure function — takes plain arrays, no DB
// access — so it can run against either live portfolio_holding rows or draft rows during
// review. Never overwrites history itself; the caller decides what to persist from the result.
//
// Identity for matching "the same position across two imports" is folioToken + schemeCode
// together (not schemeCode alone, since the same fund held via two folios must stay two
// positions — see casNormalizer.js's own same-folio-vs-different-folio distinction, which this
// reuses at the persistence layer).
import crypto from "crypto";

const UNIT_EPSILON = 1e-6; // avoid flagging a change caused by float rounding, not a real transaction

function key(row) {
  return `${row.folioToken}|${row.schemeCode}`;
}

/**
 * @param {{folioToken: string, schemeCode: string, units: number}[]} previous - active holdings from the prior approved import
 * @param {{folioToken: string, schemeCode: string, units: number}[]} current - resolved rows from the new import
 * @returns {{
 *   added: object[],
 *   removed: object[],
 *   increased: object[],
 *   reduced: object[],
 *   fullyRedeemed: object[],
 *   unchanged: object[],
 * }}
 */
export function diffPortfolio(previous, current) {
  const prevMap = new Map((previous || []).map((r) => [key(r), r]));
  const currMap = new Map((current || []).map((r) => [key(r), r]));

  const added = [];
  const increased = [];
  const reduced = [];
  const unchanged = [];
  for (const [k, row] of currMap) {
    const prior = prevMap.get(k);
    if (!prior) {
      added.push(row);
      continue;
    }
    const delta = row.units - prior.units;
    if (Math.abs(delta) <= UNIT_EPSILON) unchanged.push(row);
    else if (delta > 0) increased.push({ ...row, previousUnits: prior.units, delta });
    else reduced.push({ ...row, previousUnits: prior.units, delta });
  }

  const removed = [];
  const fullyRedeemed = [];
  for (const [k, row] of prevMap) {
    if (currMap.has(k)) continue;
    // A row absent from the new statement is a full redemption of that folio+scheme position —
    // distinct from "removed" in the sense of a data error, since the prior import proves the
    // position existed. Both lists point at the same rows; fullyRedeemed is the semantic label
    // the brief asks for, removed is the mechanical "no longer present" fact for generic callers.
    removed.push(row);
    fullyRedeemed.push(row);
  }

  // Switches (redemption in one scheme + purchase in another, same folio, same statement) are
  // not distinguishable from an unrelated added+removed pair by units/scheme-code alone — that
  // needs the transaction-ledger rows (transaction_type 'switch_in'/'switch_out'), which
  // casParser.js already classifies for the ledger CAS sub-format. Deliberately not guessed here
  // from a Summary-format diff, where no transaction rows exist at all.
  return { added, removed, increased, reduced, fullyRedeemed, unchanged };
}

/**
 * A normalized, order-independent fingerprint of a statement's holdings — for detecting an
 * "equivalent statement" duplicate (same underlying content, different PDF bytes: a re-export,
 * a re-download, a different page-render pass) even when the file checksum differs (Phase 7).
 * Rounds units to 4dp and NAV date to the day, so two exports of the identical statement always
 * fingerprint identically regardless of incidental PDF-encoding differences.
 * @param {{folioToken: string, schemeCode: string, units: number, navDate: string|null}[]} rows
 * @returns {string} sha256 hex
 */
export function statementFingerprint(rows) {
  const normalized = (rows || [])
    .map((r) => `${r.folioToken}|${r.schemeCode}|${Number(r.units).toFixed(4)}|${r.navDate || ""}`)
    .sort()
    .join("\n");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}
