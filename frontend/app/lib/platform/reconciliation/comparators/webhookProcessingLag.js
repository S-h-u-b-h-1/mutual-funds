// webhook-processing-lag — single-sided infra reconciliation: an incoming webhook delivery
// stuck in 'received'/'processing' beyond the lag threshold means its processing job is
// wedged, lost, or dead-lettered — the delivery-status truth and the queue truth have
// diverged. Uses the explicit-verdict pair form ({exception}/{matched}); previously-flagged
// deliveries that have since processed emit {matched:true} so their open items auto-heal.
import { query } from "../../../db.js";
import { registerComparator } from "../registry.js";

export const LAG_THRESHOLD_MINUTES = 30;

registerComparator({
  type: "webhook-processing-lag",
  entityType: "webhook_delivery",
  async loadPairs(scope = {}) {
    const threshold = Number(scope.thresholdMinutes ?? LAG_THRESHOLD_MINUTES);
    const stuck = await query(
      `select id, provider, status,
              floor(extract(epoch from (now() - received_at)) / 60)::int as age_minutes
       from webhook_deliveries
       where status in ('received', 'processing')
         and received_at < now() - make_interval(mins => $1)
       order by received_at
       limit 500`,
      [threshold]
    );
    const pairs = stuck.rows.map((row) => ({
      key: row.id,
      exception: {
        kind: "stale_processing",
        diffs: [
          { field: "status", internal: row.status, external: null },
          { field: "age_minutes", internal: row.age_minutes, external: `<= ${threshold}` },
        ],
      },
    }));
    // deliveries with an OPEN lag item that have since completed → matched, so they heal
    const healed = await query(
      `select ri.entity_key
       from reconciliation_items ri
       join webhook_deliveries wd on wd.id::text = ri.entity_key
       where ri.recon_type = 'webhook-processing-lag'
         and ri.status in ('retry','mismatch','escalated')
         and wd.status in ('processed', 'duplicate')`
    );
    for (const row of healed.rows) pairs.push({ key: row.entity_key, matched: true });
    return pairs;
  },
  compare() {
    return { matched: true };
  },
});
