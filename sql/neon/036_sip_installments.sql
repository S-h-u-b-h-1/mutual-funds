-- 036_sip_installments.sql — H4 (docs/LAUNCH_BLOCKER_REPORT.md): SIP mandates never actually
-- recurred after the first authorization. Seeds the daily schedule that drives
-- frontend/app/lib/platform/jobs/handlers/sipInstallments.js — same pattern as the two
-- platform-maintenance schedules 012_job_platform.sql already seeds (vault-retention-sweep,
-- job-history-prune): a job_schedules row with a fixed daily_at UTC time, picked up by the
-- existing jobs-worker.yml cron tick (runs every 15 minutes) via its own "enqueue due schedules"
-- step. No new table, no new workflow — this is purely additive data on infrastructure that
-- already exists and is already exercised in production.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/036_sip_installments.sql (or the Neon MCP
-- run_sql_transaction workaround per docs/MIGRATION_RUNBOOK.md if the auto-classifier declines).

insert into job_schedules (name, job_type, daily_at, next_run_at) values
  ('sip-installment-run-daily', 'sip-installment-run', '02:45', now())
on conflict (name) do nothing;
