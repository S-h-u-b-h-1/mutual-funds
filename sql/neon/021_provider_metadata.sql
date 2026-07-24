-- Provider Metadata — backend contract slice, priority-list item 4/5 (2026-07-24 brief).
-- Additive only.
--
-- Deliberately NOT the full "Payment Attempt entity" (a new table, retry lifecycle,
-- payment-failure-visibility) already flagged separately in
-- docs/INVEST_PLATFORM_BENCHMARK_AND_ROADMAP.md §5 Recommendation 1 as its own, larger, P0 item
-- — that is real, tracked, future work, not this slice. "Payment metadata" here means: capture
-- the outcome of the ONE payment/mandate-registration attempt this app's mock lifecycle already
-- makes, as snapshot fields on the order/mandate row itself, the same pattern already used for
-- exit-load/distributor attribution. No new entity, no retry tracking.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/021_provider_metadata.sql

-- Plan/option: a snapshot of the scheme's plan (Direct/Regular) and option (Growth/IDCW) at the
-- moment of the order, same reasoning as every other snapshot column in this schema — the fund
-- universe's own plan/option classification for a scheme code should not silently change what
-- an already-placed order is understood to have been.
alter table investment_orders add column if not exists plan text;
alter table investment_orders add column if not exists option text;
alter table sip_mandates add column if not exists plan text;
alter table sip_mandates add column if not exists option text;

-- Payment metadata: the outcome of paymentProvider.initiatePayment() (purchase orders) or
-- .initiateMandate() (SIP mandates) — previously never called from any real code path at all,
-- despite being fully registered/exported. payment_bank_account_id is the SOURCE account funds
-- are drawn from, symmetric with investment_orders.payout_bank_account_id (sql/neon/018) which
-- is the DESTINATION for a redemption payout — same bank_accounts table, opposite direction.
alter table investment_orders add column if not exists payment_reference text;
alter table investment_orders add column if not exists payment_status text;
alter table investment_orders add column if not exists payment_bank_account_id uuid references bank_accounts(id) on delete set null;
alter table sip_mandates add column if not exists payment_reference text;
alter table sip_mandates add column if not exists payment_status text;
alter table sip_mandates add column if not exists payment_bank_account_id uuid references bank_accounts(id) on delete set null;

-- Standardized provider error codes: investment_orders.rejection_reason (migration 010) is
-- free-text prose ("Mock gateway rejection: scheme not open for subscription (simulated).") —
-- fine for a human, unusable for a caller (this app's own UI, or Codex's) to branch on. This is
-- a stable code alongside it, never a replacement for the human-readable reason.
alter table investment_orders add column if not exists provider_error_code text;
alter table sip_mandates add column if not exists provider_error_code text;
