-- MF Pulse x Suasion Securities — Invest Platform, Phase 2, Journey 2 (Order Management).
-- Backs docs/INVEST_PLATFORM_ARCHITECTURE.md. Mock-provider phase only, same constraints as
-- sql/neon/009_invest_identity_compliance.sql — no real order ever reaches BSE Star MF/CAMS/
-- KFintech, no real money moves.
--
-- DELIBERATE CHOICES:
--
-- 1. investment_orders is DISTINCT from the existing portfolio_transactions
--    (sql/neon/002_auth_and_user_data.sql) — that table holds already-settled, CAS-imported
--    history; this one holds the LIVE order lifecycle (draft through terminal states). A
--    reconciliation step (orderService.js) writes into portfolio_transactions once an order
--    reaches 'completed', so downstream analytics reads one table regardless of source —
--    see Journey 3.
--
-- 2. order_status_history is the "Order Timeline" — investment_orders.status is the current
--    state; this table is every transition that got it there, with a reason. Without this,
--    "show the order timeline" would mean reconstructing history from updated_at alone, which
--    only ever shows the LATEST change.
--
-- 3. notifications is intentionally minimal this pass — just enough for Journey 2's own
--    requirement ("every state transition should generate...notifications"). The full
--    notification service (list/mark-read APIs, the complete event vocabulary) is Journey 6;
--    building the table now and the full service later avoids building it twice.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/010_order_management.sql

create table if not exists investment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  placed_by_user_id uuid references users(id), -- advisor, if placed on the client's behalf; null if self-directed
  scheme_code text not null,
  related_scheme_code text, -- target scheme for switch_in/switch_out; null for purchase/redemption
  order_type text not null, -- 'purchase' | 'redemption' | 'switch_in' | 'switch_out'
  amount numeric,             -- for purchase/redemption/switch by amount
  units numeric,               -- for redemption/switch by units
  status text not null default 'draft',
  -- 'draft' | 'submitted' | 'processing' | 'units_pending' | 'completed' | 'failed'
  -- | 'cancelled' | 'reversed' | 'retry_required'
  provider text,                -- 'mock-investment' this phase
  provider_order_id text,
  folio_number text,
  rejection_reason text,
  submitted_at timestamptz,     -- when it left 'draft' — refreshOrderStatus's elapsed-time clock starts here, not created_at
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_orders_user_status on investment_orders (user_id, status);
create index if not exists idx_orders_provider_ref on investment_orders (provider, provider_order_id);

create table if not exists order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references investment_orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists idx_order_history_order on order_status_history (order_id, created_at);

create table if not exists sip_mandates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scheme_code text not null,
  amount numeric not null,
  frequency text not null,       -- 'monthly' | 'weekly' | 'quarterly'
  start_date date not null,
  end_date date,                   -- null = until cancelled
  mandate_status text not null default 'pending', -- 'pending' | 'active' | 'paused' | 'cancelled' | 'expired'
  provider_mandate_id text,
  provider text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sip_mandates_user on sip_mandates (user_id, mandate_status);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,             -- 'order_submitted' | 'order_processing' | 'order_completed' | 'order_failed' | 'order_cancelled' | 'order_retry_required' | ... (grows with Journey 6)
  title text not null,
  body text,
  related_entity_type text,        -- 'order' | 'compliance_item' | ... (grows with Journey 6)
  related_entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_unread on notifications (user_id, created_at desc) where read_at is null;
