// sip-installment-run — daily platform-maintenance job (seeded in 023_sip_installments.sql).
// H4 (docs/LAUNCH_BLOCKER_REPORT.md): closes the gap where a SIP mandate authorized exactly one
// debit at setup and nothing ever fired again — no job or handler existed anywhere that placed a
// subsequent installment. createSipMandate() only ever registers the standing authorization
// (mandate_status/provider_mandate_id); it has never itself created an investment_orders row, so
// start_date IS the first installment's due date, on the same footing as every later one.
//
// Runs once daily, scans every currently-active mandate, and for each whose start_date/frequency
// makes today a due date (sipSchedule.js — pure, unit-tested date math, no invented "billing day"
// field), places one purchase order via orderService.createOrder() with a deterministic
// idempotency key (`sip:<mandateId>:<dueDate>`) — reusing C1's idempotency machinery so a job
// retry or an overlapping tick can never double-place the same day's installment for the same
// mandate. One mandate's failure (e.g. investment readiness has lapsed since setup) is recorded
// and skipped, not thrown — it must never block every other mandate's installment this run, the
// same reasoning vaultRetentionSweep/jobHistoryPrune's per-row loops already use.
import { query } from "../../../db.js";
import { registerHandler } from "../registry.js";
import { createOrder } from "../../../invest/orderService.js";
import { isInstallmentDueOn, dueDateKey } from "../../../invest/sipSchedule.js";

export async function sipInstallmentRun() {
  // start_date/end_date cast ::text deliberately — see sipSchedule.js's toUTCDateOnly() comment
  // for why a raw node-postgres `date` value must never reach that module unconverted.
  const r = await query(
    `select id, user_id, scheme_code, amount, frequency, start_date::text as start_date, end_date::text as end_date
     from sip_mandates
     where mandate_status = 'active'
       and start_date <= current_date
       and (end_date is null or end_date >= current_date)`
  );

  const today = new Date();
  const due = r.rows.filter((mandate) => isInstallmentDueOn(mandate, today));
  const dueDate = dueDateKey(today);

  let created = 0;
  let failed = 0;
  const failures = [];
  for (const mandate of due) {
    try {
      await createOrder(mandate.user_id, {
        schemeCode: mandate.scheme_code,
        orderType: "purchase",
        amount: Number(mandate.amount),
        idempotencyKey: `sip:${mandate.id}:${dueDate}`,
      });
      created += 1;
    } catch (err) {
      failed += 1;
      failures.push({ mandateId: mandate.id, userId: mandate.user_id, reason: err.message });
    }
  }

  return { candidateMandates: r.rows.length, dueToday: due.length, created, failed, failures };
}

registerHandler("sip-installment-run", sipInstallmentRun);
