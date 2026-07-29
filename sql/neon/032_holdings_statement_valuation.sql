-- MF Pulse — Suasion Securities system-of-record directive, Phase 3 (NAV revaluation).
-- "Do not confuse statement market value with latest MF Pulse valuation... preserve both when
-- available... this distinction matters because a CAS may already be several days old." Before
-- this migration, casParser.js already extracted the statement's own reported market value (and,
-- for the summary format, its own per-row NAV/NAV date) — but casNormalizer.js's buildHolding()
-- call silently discarded all three before they ever reached a holding object, let alone the DB.
-- currentValue/nav/nav_date (existing, unaffected) always reflect MF Pulse's OWN live valuation;
-- these three columns are the statement's own figures, kept purely for reconciliation.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/032_holdings_statement_valuation.sql
-- Apply to BOTH the production branch and the dedicated "test" branch (br-weathered-star-
-- atigraez) — see docs/TEST_DATABASE_AND_CI.md's schema-drift note. If production application is
-- blocked by this session's own tooling (same pattern as 022/024/028/029/030/031), apply to test
-- only, record that honestly in docs/MIGRATION_RUNBOOK.md's inventory, and leave production
-- application for someone with direct DB access.
alter table portfolio_holdings add column if not exists statement_value numeric;
alter table portfolio_holdings add column if not exists statement_nav numeric;
alter table portfolio_holdings add column if not exists statement_nav_date date;

comment on column portfolio_holdings.statement_value is
  'The source statement''s own reported market value for this holding, as of the statement date — NOT recomputed, kept for reconciliation against current_value (units x live NAV).';
comment on column portfolio_holdings.statement_nav is
  'The source statement''s own reported NAV, when the format discloses one per row (the CAS summary format does; the transaction-ledger format''s closing section does not, so this is null there).';
comment on column portfolio_holdings.statement_nav_date is
  'The date statement_nav is as of, per the statement itself — distinct from nav_date, which is MF Pulse''s own latest available NAV date.';
