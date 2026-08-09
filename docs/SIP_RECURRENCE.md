# SIP Recurrence (H4)

Closes `docs/LAUNCH_BLOCKER_REPORT.md`'s H4: a SIP mandate authorized exactly one debit at setup
and nothing ever fired again — no job or handler existed anywhere that placed a subsequent
installment. `createSipMandate()` only ever registers the standing NACH/UPI Autopay authorization
(`mandate_status`/`provider_mandate_id`); it has never itself created an `investment_orders` row,
so `start_date` is the first installment's due date, on the same footing as every later one.

## What ships

- **`frontend/app/lib/invest/sipSchedule.js`** — pure, unit-tested date arithmetic:
  `isInstallmentDueOn(mandate, date)`. A mandate's installment day is fixed at its `start_date`'s
  day-of-month (monthly/quarterly) or day-of-week (weekly) — there is no separate "billing day"
  column, matching how a real AMC SIP mandate works. Monthly/quarterly clamp to the last day of a
  shorter month (a day-31 mandate fires on day 30 in April, day 28/29 in February) rather than
  skipping the month or rolling into the next one.
- **`frontend/app/lib/platform/jobs/handlers/sipInstallments.js`** — the `sip-installment-run` job
  type. Scans every `mandate_status='active'` mandate, filters to the ones due today via
  `sipSchedule.js`, and places one purchase order per due mandate via
  `orderService.createOrder()` with idempotency key `sip:<mandateId>:<dueDate>` — reusing C1's
  idempotency machinery so a job retry or an overlapping tick can never double-place the same
  day's installment. One mandate's failure (e.g. investment readiness lapsed since setup) is
  recorded and skipped, not thrown — it must never block every other mandate's installment that
  run, same reasoning `vaultRetentionSweep`/`jobHistoryPrune`'s per-row loops already use.
- **`sql/neon/036_sip_installments.sql`** — seeds one `job_schedules` row
  (`sip-installment-run-daily`, `daily_at '02:45'` UTC), same pattern as the two existing
  platform-maintenance schedules (`012_job_platform.sql`). No new table, no new workflow — picked
  up by the existing `jobs-worker.yml` cron tick (every 15 minutes) via its "enqueue due
  schedules" step.

## A real bug caught during testing

`node-postgres`'s default type parser for a `date` column builds the JS `Date` at **local**
midnight of the intended calendar day, not UTC midnight. Reading it back with `.getUTCDate()`
(the natural-looking choice) is only correct if the reading process happens to run in the same
timezone the value was built in — this sandbox runs in UTC+5:30, and a mandate's real
`start_date` came back one calendar day early through that path during integration testing,
silently causing every "due today" mandate to be skipped. Fixed by casting
`start_date::text`/`end_date::text` in the handler's SQL so a plain `"YYYY-MM-DD"` string reaches
`sipSchedule.js`, never an ambiguous `Date` object — the module's `toUTCDateOnly()` now documents
this contract explicitly. `now()` (the live "today" value, always genuinely UTC since the DB
session runs in `GMT`) is unaffected — only stored `date`-typed columns round-tripped through
node-postgres carry the risk.

## What was deliberately not built

- **No new "billing day" field.** The recurrence day derives from `start_date` alone, matching the
  existing schema (`sql/neon/010_order_management.sql`) — adding a separate column would be new
  surface the mandate contract doesn't need.
- **No mid-cycle amount/frequency change handling** beyond what already exists (there is none
  today) — out of scope for closing H4 specifically.
- **No customer-facing "next installment date" UI** — the report's own recommended fix is
  backend-only ("no backend change needed... at minimum collapse to a real state machine," in
  H4's sibling H1's phrasing); this mirrors that scope discipline for H4 itself. A future UI slice
  can compute "next due" client-side from the same `sipSchedule.js` logic if needed.

## Verified

15 tests: 11 pure unit tests for `isInstallmentDueOn` (leap-year Feb 29 clamping, day-31 monthly
clamping across every shorter month, quarterly cadence, weekly day-of-week matching, start/end
boundaries, camelCase field-name compatibility) + 4 real-Neon integration tests against a
disposable investment-ready user (creates exactly one order for a mandate due today; idempotent
on a same-day re-run; correctly skips a future-start and a past-end mandate; two distinct mandates
due the same day are each processed independently). Full `app/lib/platform/jobs` suite re-run
clean in isolation after the timezone fix (one earlier failure in the same area was a transient
Neon connection drop under heavy combined-suite load — the documented gotcha #3 pattern from this
session's own history, not a regression, confirmed by an isolated re-run passing 21/21).
