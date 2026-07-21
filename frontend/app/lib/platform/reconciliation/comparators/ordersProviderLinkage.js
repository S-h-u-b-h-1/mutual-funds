// orders-provider-linkage — any order that left 'draft' must carry its provider linkage
// (provider + provider_order_id): that reference is the ONLY thing that lets us reconcile
// against provider records at all, so a gap here is upstream of every other order
// reconciliation. With the stateless mock provider a status-value comparison would be fake
// noise (the mock has no order memory); the linkage invariant is what is genuinely checkable
// today, and the real BSE status comparator later slots in as its own comparator type.
import { query } from "../../../db.js";
import { registerComparator } from "../registry.js";

registerComparator({
  type: "orders-provider-linkage",
  entityType: "order",
  async loadPairs(scope = {}) {
    const limit = Math.min(Number(scope.limit ?? 500), 2000);
    const r = await query(
      `select id, status, provider, provider_order_id
       from investment_orders
       where status not in ('draft', 'cancelled')
       order by updated_at desc
       limit $1`,
      [limit]
    );
    return r.rows.map((row) => ({
      key: row.id,
      internal: { orderId: row.id, status: row.status },
      external:
        row.provider && row.provider_order_id
          ? { provider: row.provider, providerOrderId: row.provider_order_id }
          : null,
    }));
  },
  compare() {
    return { matched: true };
  },
});
