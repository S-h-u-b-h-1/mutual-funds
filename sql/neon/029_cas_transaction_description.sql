-- MF Pulse — Suasion Securities system-of-record directive, Part 1 (CAS transaction classification).
-- portfolio_transactions previously stored only the classified transaction_type and never the
-- source statement's own description text or its running unit balance after each row — both were
-- parsed by casParser.js's TXN_ROW_RE (the description drives classification; the balance is its
-- own regex capture group) but discarded before reaching the DB. Per the governing directive:
-- "Preserve the original source description" and "For every transaction store/retain where
-- available: ... transaction description ... unit balance". Purely additive, both nullable, zero
-- existing rows affected — this only widens what future inserts can carry.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/029_cas_transaction_description.sql
-- Apply to BOTH the production branch and the dedicated "test" branch (br-weathered-star-
-- atigraez) — see docs/TEST_DATABASE_AND_CI.md's schema-drift note. If production application is
-- blocked by this session's own tooling (same pattern as 022/024/028), apply to test only, record
-- that honestly in docs/MIGRATION_RUNBOOK.md's inventory, and leave production application for
-- someone with direct DB access.

alter table portfolio_transactions add column if not exists description text;
alter table portfolio_transactions add column if not exists unit_balance numeric;

comment on column portfolio_transactions.description is
  'Raw source-statement text for this transaction row, preserved regardless of classification outcome (including when transaction_type is unknown).';
comment on column portfolio_transactions.unit_balance is
  'The statement''s own running unit balance immediately after this transaction, as reported by the registrar — not recomputed.';
comment on column portfolio_transactions.transaction_type is
  'purchase | sip | redemption | switch_in | switch_out | dividend_payout | dividend_reinvest | unknown. "unknown" means the source description could not be safely classified into any of the above — never guessed, see casParser.js classifyTransaction().';
