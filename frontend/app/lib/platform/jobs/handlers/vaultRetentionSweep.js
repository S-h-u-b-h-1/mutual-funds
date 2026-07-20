// vault-retention-sweep — daily platform-maintenance job (seeded in 012_job_platform.sql).
// Enforces Document Vault retention: any document whose expires_at has passed transitions to
// 'expired' and gets an 'expired' timeline event (actor null = system). Nothing is deleted —
// expiry is a status, so the audit trail and the row survive. Idempotent: already-expired and
// archived documents are excluded from the predicate, so a re-run (or an at-least-once double
// execution) matches zero rows the second time.
import { query } from "../../../db.js";
import { registerHandler } from "../registry.js";

export async function vaultRetentionSweep() {
  const r = await query(
    `update documents set status = 'expired', updated_at = now()
     where expires_at is not null and expires_at < now()
       and status not in ('expired', 'archived')
     returning id`
  );
  for (const row of r.rows) {
    await query(
      `insert into document_events (document_id, event_type, actor_user_id, metadata)
       values ($1, 'expired', null, '{"via":"vault-retention-sweep"}')`,
      [row.id]
    );
  }
  return { expired: r.rows.length };
}

registerHandler("vault-retention-sweep", vaultRetentionSweep);
