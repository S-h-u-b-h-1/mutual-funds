-- MF Pulse x Suasion Securities — Invest Platform, Phase 1 (Modules 1 + 2).
-- Backs docs/INVEST_PLATFORM_ARCHITECTURE.md. Mock-provider phase only — see that doc's §11/§12
-- for what is explicitly NOT true yet (no real PAN/Aadhaar/bank data, no real provider wiring).
--
-- DELIBERATE CHOICES:
--
-- 1. Extends `users` (role, investor_tier) rather than a parallel identity table — one user
--    record for research-only visitors and investors alike, per the explicit "do not duplicate
--    users" instruction. `role` is the permission boundary (investor/advisor/admin); `investor_tier`
--    is a segmentation label (retail/experienced/hni), never a permission check — see
--    architecture doc §2.
--
-- 2. Onboarding progress is NOT a stored column anywhere in this file. It's a derived percentage
--    over compliance_items (completed / total), computed in complianceService.js. A stored
--    progress value would be a second source of truth that could silently drift from the items
--    it's supposed to summarize — the same class of bug this codebase has already hit once
--    (field_validation_results' pre-fix idempotency gap, see docs/METADATA_PROVENANCE_SCHEMA.md).
--
-- 3. All PII-shaped columns (pan_masked, account numbers) store masked/reference values only,
--    matching the architecture doc's §9.2 constraint — this phase mock-populates them with
--    synthetic values, never real ones.
--
-- 4. No RLS — same rationale as sql/neon/002_auth_and_user_data.sql: DATABASE_URL is server-only,
--    every route handler filters by the session's own user_id, and advisor/admin scope checks
--    happen in application code (requireRole() in lib/invest/authz.js), not at the DB layer.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/009_invest_identity_compliance.sql

alter table users add column if not exists role text not null default 'investor';
alter table users add column if not exists investor_tier text;

-- ============================================================================
-- Module 1: Investor Identity
-- ============================================================================

create table if not exists investor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  date_of_birth date,
  gender text,
  occupation text,
  annual_income_band text,       -- banded ('<5L','5-10L','10-25L','25L+'), never an exact figure
  pan_masked text,                -- last 4 characters only; mock-generated this phase
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  pincode text,
  country text not null default 'IN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists investment_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_number text not null unique,  -- mock-generated (MockInvestmentProvider), never a real BSE/CDSL account number
  status text not null default 'pending', -- 'pending' | 'active' | 'suspended' | 'closed'
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists risk_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  risk_category text,             -- 'conservative' | 'moderate' | 'aggressive'
  score integer,                   -- 0-100, derived from `answers`
  answers jsonb,                    -- raw questionnaire responses — kept so the score can be re-derived/audited, never silently recomputed from nothing
  assessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists investment_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  preferred_categories jsonb,      -- e.g. ["Large Cap","ELSS"]
  preferred_plan text not null default 'direct', -- 'direct' | 'regular'
  sip_day integer check (sip_day between 1 and 28),
  goals jsonb,                       -- array of {type, target_amount, target_date}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- Brought forward from the architecture doc's CRM section (§5.3) because Module 1's RM
-- assignment needs somewhere to point — one minimal table now, extended by Module 9 (CRM), not
-- duplicated later.
create table if not exists advisors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  employee_code text,
  specialization text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists rm_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  advisor_id uuid references advisors(id) on delete set null,
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_rm_assignments_user_active on rm_assignments (user_id) where active;
create index if not exists idx_rm_assignments_advisor_active on rm_assignments (advisor_id) where active;

-- Backing data for the 'nominee' and 'bank' compliance items below — a compliance item flipping
-- to 'completed' with no persisted record behind it would be a checkbox with nothing real under
-- it, so these exist even though the brief's Module 1 list didn't name them explicitly.
create table if not exists nominees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  relationship text not null,
  allocation_pct numeric not null check (allocation_pct > 0 and allocation_pct <= 100),
  pan_masked text,
  minor boolean not null default false,
  guardian_name text,
  created_at timestamptz not null default now()
);
create index if not exists idx_nominees_user on nominees (user_id);

create table if not exists bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  account_number_masked text not null,
  ifsc text not null,
  account_holder_name text not null,
  verification_method text,
  verified boolean not null default false,
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_bank_accounts_user on bank_accounts (user_id);

-- ============================================================================
-- Module 2: Compliance Engine
-- ============================================================================

create table if not exists compliance_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  overall_status text not null default 'pending', -- 'pending' | 'in_progress' | 'needs_review' | 'completed' | 'rejected'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists compliance_items (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references compliance_applications(id) on delete cascade,
  item_key text not null,       -- 'mobile' | 'email' | 'pan' | 'identity' | 'nominee' | 'bank' | 'fatca' | 'risk_profile' | 'investment_ready'
  status text not null default 'pending', -- 'pending' | 'in_progress' | 'verified' | 'rejected' | 'needs_review' | 'completed'
  provider text,                  -- which (mock, this phase) provider handled it
  provider_reference text,
  rejection_reason text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, item_key)
);
create index if not exists idx_compliance_items_app on compliance_items (application_id);
