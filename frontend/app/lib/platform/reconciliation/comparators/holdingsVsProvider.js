// holdings-vs-provider — the flagship external-truth comparator: internal portfolio_holdings
// (source='mock-connected') against what the portfolio provider reports for the same user.
// The mock provider is deterministic per user, so this is a REAL comparison exercising the
// exact shape RTA/BSE holdings reconciliation will have — swapping in a real provider changes
// the provider import, not this comparator's logic. Units compare with a 0.001 tolerance
// (3-decimal unit precision); avg cost is deliberately NOT compared (it is a derived,
// NAV-dependent internal figure, not provider truth).
import { query } from "../../../db.js";
import { portfolioProvider } from "../../../invest/providers/index.js";
import { registerComparator } from "../registry.js";

const UNITS_TOLERANCE = 0.001;

registerComparator({
  type: "holdings-vs-provider",
  entityType: "holding",
  async loadPairs(scope = {}) {
    const userLimit = Math.min(Number(scope.userLimit ?? 25), 200);
    const users = await query(
      `select distinct user_id from portfolio_holdings where source = 'mock-connected'
       order by user_id limit $1`,
      [userLimit]
    );
    const pairs = [];
    for (const { user_id } of users.rows) {
      const internalRows = await query(
        `select scheme_code, units, folio_number from portfolio_holdings
         where user_id = $1 and source = 'mock-connected'`,
        [user_id]
      );
      const external = await portfolioProvider.syncHoldings(user_id);
      const externalByScheme = new Map(external.holdings.map((h) => [String(h.schemeCode), h]));
      const seen = new Set();
      for (const row of internalRows.rows) {
        const ext = externalByScheme.get(String(row.scheme_code)) ?? null;
        seen.add(String(row.scheme_code));
        pairs.push({
          key: `${user_id}:${row.scheme_code}`,
          internal: { units: Number(row.units), folio: row.folio_number },
          external: ext ? { units: Number(ext.units), folio: ext.folioNumber } : null,
        });
      }
      for (const [schemeCode, ext] of externalByScheme) {
        if (!seen.has(schemeCode)) {
          pairs.push({
            key: `${user_id}:${schemeCode}`,
            internal: null,
            external: { units: Number(ext.units), folio: ext.folioNumber },
          });
        }
      }
    }
    return pairs;
  },
  compare(internal, external) {
    const diffs = [];
    if (Math.abs(internal.units - external.units) > UNITS_TOLERANCE) {
      diffs.push({ field: "units", internal: internal.units, external: external.units });
    }
    if (internal.folio !== external.folio) {
      diffs.push({ field: "folio_number", internal: internal.folio, external: external.folio });
    }
    return { matched: diffs.length === 0, diffs };
  },
});
