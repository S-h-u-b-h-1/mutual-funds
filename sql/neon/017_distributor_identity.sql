-- Distributor Identity & Regulatory Configuration (Phase 5 slice, 2026-07-24).
-- Suasion Securities' own AMFI-registered distributor identity, config/DB-backed rather than
-- hardcoded, so every order/mandate/document/audit-trail touchpoint that needs ARN/EUIN
-- attribution reads it from here instead of a literal scattered through the codebase — and so a
-- future real provider adapter (BSE StAR MF, CAMS, KFintech) obtains it the same way rather than
-- embedding its own copy.
--
-- Two-level model, matching real AMFI structure: ONE ARN is a firm-level distributor
-- registration (Suasion Securities); MANY EUINs are individual-employee registrations under that
-- ARN. Today there is exactly one of each (seeded below with the confirmed production values),
-- but the shape supports "multiple advisors and EUINs under the same ARN" from day one rather
-- than needing a later migration to add it.

create table if not exists distributor_arns (
  id uuid primary key default gen_random_uuid(),
  arn text not null unique,
  distributor_name text not null,
  arn_valid_until date, -- null = not yet supplied; never fabricated
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists distributor_euins (
  id uuid primary key default gen_random_uuid(),
  distributor_arn_id uuid not null references distributor_arns(id) on delete cascade,
  euin text not null unique,
  -- RM mapping: which internal advisor (the existing `advisors` table) this EUIN belongs to.
  -- Null today — no order-placement flow yet passes an advisor/placed-by context (orderService.js
  -- createOrder doesn't accept one; investment_orders.placed_by_user_id is populated by nothing
  -- yet) — this column is the hook for when advisor-assisted ordering lands (Journey 5).
  advisor_id uuid references advisors(id) on delete set null,
  branch_name text,
  branch_code text,
  contact_name text,
  contact_email text,
  contact_phone text,
  -- Exactly one EUIN is the default attribution used when no more specific advisor context
  -- applies — enforced below via the same partial-unique-index idiom already used elsewhere in
  -- this schema for "at most one X per set" constraints.
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ux_distributor_euins_one_default on distributor_euins (is_default) where is_default;
create index if not exists idx_distributor_euins_arn on distributor_euins (distributor_arn_id);
create index if not exists idx_distributor_euins_advisor on distributor_euins (advisor_id) where advisor_id is not null;

-- Confirmed production values (2026-07-24) — real, not placeholder. Nothing here fabricates data
-- that wasn't actually supplied: branch/contact fields are left null rather than guessed, and
-- arn_valid_until is left null since no expiry date was given.
insert into distributor_arns (arn, distributor_name)
values ('289322', 'Suasion Securities')
on conflict (arn) do nothing;

insert into distributor_euins (distributor_arn_id, euin, is_default)
select id, 'E544323', true from distributor_arns where arn = '289322'
on conflict (euin) do nothing;

-- Snapshot columns, not live joins: ARN/EUIN attribution on an order/mandate must freeze at the
-- moment it's created, matching real regulatory/audit practice (a later change to the EUIN
-- roster must never rewrite which distributor gets credit for a transaction that already
-- happened) — the same snapshot-not-live-reference reasoning already applied elsewhere in this
-- schema (e.g. portfolio_folio's encrypted-at-rest folio number, every provider_reference-style
-- column). Nullable: existing rows predate this migration and have no attribution to backfill.
alter table investment_orders add column if not exists distributor_arn text;
alter table investment_orders add column if not exists distributor_euin text;
alter table sip_mandates add column if not exists distributor_arn text;
alter table sip_mandates add column if not exists distributor_euin text;
