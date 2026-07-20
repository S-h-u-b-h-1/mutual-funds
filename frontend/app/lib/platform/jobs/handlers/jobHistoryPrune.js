// job-history-prune — daily platform-maintenance job (seeded in 012_job_platform.sql).
// Keeps the jobs table from growing without bound while preserving what matters:
//   succeeded/cancelled rows are routine and pruned after 30 days;
//   dead rows are the DLQ — evidence of real failures — and are kept 90 days.
// job_events go with their job via ON DELETE CASCADE. Idempotent by construction (the
// predicate only ever matches rows past the cutoff, and a deleted row can't match twice).
import { query } from "../../../db.js";
import { registerHandler } from "../registry.js";

export const ROUTINE_RETENTION_DAYS = 30;
export const DEAD_RETENTION_DAYS = 90;

export async function jobHistoryPrune() {
  const routine = await query(
    `delete from jobs
     where status in ('succeeded', 'cancelled')
       and finished_at < now() - make_interval(days => $1)`,
    [ROUTINE_RETENTION_DAYS]
  );
  const dead = await query(
    `delete from jobs
     where status = 'dead' and finished_at < now() - make_interval(days => $1)`,
    [DEAD_RETENTION_DAYS]
  );
  return { prunedRoutine: routine.rowCount, prunedDead: dead.rowCount };
}

registerHandler("job-history-prune", jobHistoryPrune);
