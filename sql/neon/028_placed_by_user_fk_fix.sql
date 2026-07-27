-- MF Pulse — Backend Hardening Phase 3, H5 (FK behavior fix).
-- Backs docs/BACKEND_TECHNICAL_DEBT.md H5. investment_orders.placed_by_user_id (the advisor/staff
-- user who placed an order on an investor's behalf, for the not-yet-live advisor-assisted-ordering
-- feature) currently has no ON DELETE behavior at all (confirmed via pg_constraint: plain
-- `FOREIGN KEY (placed_by_user_id) REFERENCES users(id)`, defaulting to NO ACTION) — meaning
-- deleting the advisor/staff user row would hard-fail with a live FK violation the moment any
-- order actually has this column set. Every other nullable FK on this exact table
-- (payment_bank_account_id, payout_bank_account_id, switch_order_id) already uses
-- `on delete set null` — this brings placed_by_user_id in line with that established pattern
-- rather than inventing a new one. Correct behavior: if the staff/advisor user is later deleted,
-- the order (the INVESTOR's real financial record) must survive; it just loses the "placed by"
-- attribution, exactly like it already loses bank-account attribution today.
--
-- Zero rows currently have this column set (advisor-assisted ordering isn't live yet), so this
-- changes no existing data — pure constraint correction on an already-empty column.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/028_placed_by_user_fk_fix.sql
-- Apply to BOTH the production branch and the dedicated "test" branch (br-weathered-star-
-- atigraez) — see docs/TEST_DATABASE_AND_CI.md's schema-drift note.
--
-- NOTE: this is an ALTER TABLE against the same live, central `investment_orders` table that
-- C1's migration (022) was denied against by this session's own tooling. If this migration is
-- also denied against production, do NOT force it — apply it to the test branch only, record that
-- honestly in docs/MIGRATION_RUNBOOK.md's inventory (same pattern as 022/024), and leave it for
-- someone with direct production DB access, same as C1/H6.

alter table investment_orders drop constraint if exists investment_orders_placed_by_user_id_fkey;
alter table investment_orders add constraint investment_orders_placed_by_user_id_fkey
  foreign key (placed_by_user_id) references users(id) on delete set null;
