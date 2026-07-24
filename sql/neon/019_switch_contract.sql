-- Switch Contract — backend contract slice, priority-list item 2/5. Additive only.
--
-- Exit-load/payout columns (exit_load_pct, exit_load_amount, folio_number) already exist from
-- sql/neon/018_redemption_contract.sql, deliberately named generically for exactly this reuse —
-- a switch's source leg realizes gains/pays exit load exactly like a redemption does. Only one
-- genuinely new column is needed: a self-reference linking a switch_out row to its paired
-- switch_in row (and vice versa), since a switch is modeled as two investment_orders rows, not
-- one — see docs/SWITCH_CONTRACT.md §1 for why two rows rather than a new switch-specific table.
--
-- payout_bank_account_id/payout_status are NOT used by switch orders — no money leaves the
-- platform on a switch (it moves from the source scheme into the destination scheme), so those
-- columns simply stay null for switch_in/switch_out rows, same as they already do for purchase.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/019_switch_contract.sql

alter table investment_orders add column if not exists switch_order_id uuid references investment_orders(id) on delete set null;
create index if not exists idx_orders_switch_pair on investment_orders (switch_order_id) where switch_order_id is not null;
