// Reconciliation Engine core (Phase 4 M3). Runs a registered comparator, records the run,
// and maintains ONE open exception item per (recon_type, entity_key) with the
// retry → mismatch → escalated ladder; matching again auto-resolves. See 014_reconciliation.sql
// for the model rationale and docs/RECONCILIATION_ENGINE.md for the architecture.
import { query } from "../../db.js";
import { registerHandler } from "../jobs/registry.js";
import { getComparator } from "./registry.js";

// occurrences → status: 1st sighting 'retry' (often timing), 2nd 'mismatch', 3rd+ 'escalated'
export function ladderStatus(occurrences) {
  if (occurrences >= 3) return "escalated";
  if (occurrences >= 2) return "mismatch";
  return "retry";
}

async function upsertException(runId, comparator, pair, mismatchKind, diffs) {
  const open = await query(
    `select * from reconciliation_items
     where recon_type = $1 and entity_key = $2 and status in ('retry','mismatch','escalated')`,
    [comparator.type, pair.key]
  );
  if (open.rows[0]) {
    const item = open.rows[0];
    const occurrences = item.occurrences + 1;
    await query(
      `update reconciliation_items
       set occurrences = $2, status = $3, mismatch_kind = $4, details = $5,
           last_seen_run_id = $6, updated_at = now()
       where id = $1`,
      [item.id, occurrences, ladderStatus(occurrences), mismatchKind, JSON.stringify({ diffs }), runId]
    );
    return { id: item.id, status: ladderStatus(occurrences), new: false };
  }
  const r = await query(
    `insert into reconciliation_items
       (recon_type, entity_type, entity_key, status, mismatch_kind, details, first_seen_run_id, last_seen_run_id)
     values ($1, $2, $3, 'retry', $4, $5, $6, $6) returning id`,
    [comparator.type, comparator.entityType, pair.key, mismatchKind, JSON.stringify({ diffs }), runId]
  );
  return { id: r.rows[0].id, status: "retry", new: true };
}

async function autoResolveIfOpen(runId, reconType, entityKey) {
  // $3 is used in two contexts that need different types (text concatenation vs. a uuid
  // column) — without explicit casts, Postgres unifies both to whatever the `||` operator
  // infers (text) and then fails assigning that to last_seen_run_id. Cast both explicitly.
  const r = await query(
    `update reconciliation_items
     set status = 'resolved', resolved_by = 'auto',
         resolution_note = 'Auto-resolved: entity matched again in run ' || $3::text,
         resolved_at = now(), last_seen_run_id = $3::uuid, updated_at = now()
     where recon_type = $1 and entity_key = $2 and status in ('retry','mismatch','escalated')
     returning id`,
    [reconType, entityKey, runId]
  );
  return r.rows.length;
}

/**
 * Execute one reconciliation run for a registered comparator. Never throws on exceptions
 * FOUND (that's the engine working); throws only when the run itself cannot execute —
 * unknown type, comparator crash — after marking the run 'failed' (the job platform then
 * retries the run).
 */
export async function runReconciliation(reconType, scope = {}, { jobId = null } = {}) {
  const comparator = getComparator(reconType);
  if (!comparator) throw new Error(`No comparator registered for reconciliation type '${reconType}'.`);
  const runRow = await query(
    `insert into reconciliation_runs (recon_type, scope, job_id) values ($1, $2, $3) returning id`,
    [reconType, JSON.stringify(scope), jobId]
  );
  const runId = runRow.rows[0].id;
  const totals = { checked: 0, matched: 0, exceptions: 0, autoResolved: 0, retry: 0, mismatch: 0, escalated: 0 };
  try {
    const pairs = await comparator.loadPairs(scope);
    for (const pair of pairs) {
      // A degenerate both-null pair is skipped BEFORE counting it as checked — it wasn't
      // actually examined for anything, so it shouldn't inflate the run's totals.
      if (!pair.exception && pair.matched !== true && pair.internal == null && pair.external == null) continue;
      totals.checked += 1;
      let verdict;
      // Comparators may hand down an explicit verdict for single-sided checks (a stuck
      // delivery has no "external side" to diff): { exception: {kind, diffs} } or
      // { matched: true } — the latter exists so a previously-open item can auto-heal.
      if (pair.exception) verdict = { mismatchKind: pair.exception.kind, diffs: pair.exception.diffs ?? [] };
      else if (pair.matched === true) verdict = null;
      else if (pair.external == null) verdict = { mismatchKind: "missing_external", diffs: [] };
      else if (pair.internal == null) verdict = { mismatchKind: "missing_internal", diffs: [] };
      else {
        const compared = comparator.compare(pair.internal, pair.external);
        verdict = compared.matched ? null : { mismatchKind: "value_mismatch", diffs: compared.diffs ?? [] };
      }
      if (verdict == null) {
        totals.matched += 1;
        totals.autoResolved += await autoResolveIfOpen(runId, reconType, pair.key);
      } else {
        totals.exceptions += 1;
        const item = await upsertException(runId, comparator, pair, verdict.mismatchKind, verdict.diffs);
        totals[item.status] += 1;
      }
    }
    await query(
      `update reconciliation_runs set status = 'completed', totals = $2, finished_at = now() where id = $1`,
      [runId, JSON.stringify(totals)]
    );
    return { runId, totals };
  } catch (err) {
    await query(
      `update reconciliation_runs set status = 'failed', error = $2, totals = $3, finished_at = now() where id = $1`,
      [runId, String(err?.message ?? err).slice(0, 2000), JSON.stringify(totals)]
    );
    throw err;
  }
}

/** Operator resolution of an open exception (auth/RBAC gating arrives with M12's permission middleware). */
export async function resolveReconciliationItem(itemId, { resolvedBy, note }) {
  if (!resolvedBy || !note) throw new Error("resolvedBy and note are required to resolve an item.");
  const r = await query(
    `update reconciliation_items
     set status = 'resolved', resolved_by = $2, resolution_note = $3, resolved_at = now(), updated_at = now()
     where id = $1 and status in ('retry','mismatch','escalated') returning *`,
    [itemId, resolvedBy, note]
  );
  if (!r.rows[0]) throw new Error(`Item ${itemId} is not an open exception.`);
  return r.rows[0];
}

/** Aggregate reconciliation metrics — counts and last-run summaries, never record contents. */
export async function getReconciliationMetrics() {
  const [openByType, lastRuns] = await Promise.all([
    query(`select recon_type, status, count(*)::int as count
           from reconciliation_items where status in ('retry','mismatch','escalated')
           group by recon_type, status order by recon_type, status`),
    query(`select distinct on (recon_type) recon_type, id as run_id, status, totals, started_at, finished_at
           from reconciliation_runs order by recon_type, started_at desc`),
  ]);
  return { openExceptions: openByType.rows, lastRuns: lastRuns.rows };
}

// The single job type every scheduled reconciliation uses (seeded in 014).
registerHandler("reconciliation-run", async (payload, { job }) => {
  if (!payload?.reconType) throw new Error("reconciliation-run job payload requires reconType.");
  return await runReconciliation(payload.reconType, payload.scope ?? {}, { jobId: job?.id ?? null });
});
