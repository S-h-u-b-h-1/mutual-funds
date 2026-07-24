-- Redemption Contract — backend contract slice, per the 2026-07-24 priority brief ("eliminate
-- remaining backend contract gaps that block the investor platform"). Additive only.
--
-- investment_orders.folio_number already existed (migration 010) but nothing ever populated or
-- read it for redemption purposes — this migration adds only what's genuinely new: exit-load
-- and payout tracking. All nullable; every existing writer/reader keeps working unchanged.
--
-- DELIBERATE CHOICES:
--
-- 1. exit_load_pct/exit_load_amount/net_settlement_amount are snapshot columns, stamped once at
--    order creation by redemptionService.createRedemptionOrder() — never recomputed later. Same
--    reasoning as distributor_arn/distributor_euin (sql/neon/017): what the investor was quoted
--    at the moment they acted must not silently drift as holding-period/NAV keep changing.
--
-- 2. payout_bank_account_id references bank_accounts (sql/neon/009) rather than duplicating
--    account details onto investment_orders — a real redemption's payout always rides on an
--    already-KYC'd bank account, never a fresh one collected mid-order.
--
-- 3. payout_status is intentionally a 2-state field (pending -> initiated), not a fuller
--    pending/initiated/credited/failed simulation. This app has no real banking rail and no
--    visibility into actual credit timing (T+1/T+2/T+3, weekends, bank holidays are all real
--    variables this app does not track) — asserting a fake "credited" state would fabricate
--    money having arrived when it hasn't. See docs/REDEMPTION_CONTRACT.md §4.
--
-- 4. Column names are generic (folio_number already was; exit_load_pct/exit_load_amount are not
--    named redemption_*) because the Switch Contract (next slice, same priority brief) also
--    needs exit-load handling on the same table — this avoids a second near-duplicate column
--    set next slice. Only redemption logic is implemented against them in this migration; switch
--    validation is explicitly out of scope here.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/018_redemption_contract.sql

alter table investment_orders add column if not exists exit_load_pct numeric;
alter table investment_orders add column if not exists exit_load_amount numeric;
alter table investment_orders add column if not exists net_settlement_amount numeric;
alter table investment_orders add column if not exists payout_bank_account_id uuid references bank_accounts(id) on delete set null;
alter table investment_orders add column if not exists payout_status text; -- null (n/a) | 'pending' | 'initiated'
alter table investment_orders add column if not exists payout_reference text;
alter table investment_orders add column if not exists payout_initiated_at timestamptz;
