-- MF Pulse x Suasion Securities — Auth+Onboarding truth audit, Phases 4-11 (compliance data model).
-- Extends the Module 1/2 schema from 009_invest_identity_compliance.sql. Every item below was
-- verified ABSENT or genuinely PARTIAL by direct code audit (not assumed from docs) before being
-- added here — see docs/SUASION_PLATFORM_STATUS.md for the full per-item finding.
--
-- ============================================================================
-- Phase 4/9: a real phone number to actually verify (previously: the 'mobile' compliance item
-- checked a hardcoded mock-OTP literal against no phone number at all — no number was ever
-- collected or stored anywhere for an investor, so "mobile verified" was structurally unfalsifiable
-- theater, not because verified === true was wrong but because there was nothing behind it).
-- ============================================================================
alter table investor_profiles add column if not exists phone_number text;
comment on column investor_profiles.phone_number is
  'The number the mobile compliance step is actually verifying. Stored in full (not masked) because a real SMS/OTP provider will eventually need to dial it — this is ordinary contact PII, not a financial secret like a bank account or PAN. Never logged (see complianceService.js).';

-- ============================================================================
-- Phase 7: PEP (Politically Exposed Person) declaration — previously ABSENT entirely (verified by
-- repo-wide grep for "pep"/"politically exposed": zero hits before this migration). Modeled as its
-- own table, same pattern as nominees/bank_accounts backing their compliance_items row: the
-- compliance_items('pep') row is the workflow-status pointer, this table is the actual record.
-- No automated PEP screening is implemented or assumed — SEBI/AMFI KYC norms require an explicit
-- self-declaration, and a "yes" always routes to manual review rather than any automated decision,
-- per the mission's explicit "do not invent automated PEP screening if no screening provider
-- exists" instruction.
-- ============================================================================
create table if not exists pep_declarations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  declared boolean not null,                -- true = self-declared as a PEP (or close PEP relative/associate)
  status text not null default 'pending',   -- 'pending' | 'not_applicable' | 'needs_review' | 'cleared' | 'rejected'
  declared_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references users(id),    -- an advisor/admin role user; null until reviewed
  review_notes text,
  created_at timestamptz not null default now(),
  unique (user_id)
);
comment on table pep_declarations is
  'One row per investor. declared=false auto-resolves to status=not_applicable (no review needed). declared=true always starts at needs_review — no automated PEP screening provider exists, so this always routes to a human (see complianceService.js pep case).';

-- ============================================================================
-- Phase 6: FATCA/CRS — previously a single boolean (`payload.declared === true`) behind the
-- 'fatca' compliance item, with no structured persistence at all (verified: no fatca-shaped
-- columns/tables existed anywhere in the schema before this migration). Replaced with a
-- structured, versioned declaration.
--
-- ENGINEERING MODEL READY: the fields below are the standard fields every FATCA/CRS
-- self-certification form in the securities industry collects (tax residency country(ies) + TIN
-- per country, country of birth, US-person indicator) — this is not proprietary or uncertain
-- information architecture.
--
-- REGULATORY FIELD SET REQUIRES CONFIRMATION: whether this EXACT field list matches Suasion
-- Securities' actual FATCA/CRS self-certification form (the one a real KRA/RTA will require) has
-- NOT been confirmed against Suasion's compliance/legal team or an actual provider contract. Do
-- not treat this table as the final regulatory form — treat it as a reasonable, versioned,
-- extensible engineering model ready to be adjusted once that confirmation happens. `version`
-- exists specifically so a future field-set change doesn't silently reinterpret old declarations.
-- ============================================================================
create table if not exists fatca_declarations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  version integer not null default 1,
  tax_residency_country text not null,        -- ISO 3166-1 alpha-2, primary tax residency
  additional_tax_residencies jsonb,             -- [{country, tin, tinType}, ...] — CRS requires listing every tax residency, not just one
  tin text,                                       -- primary country's Tax Identification Number (India: PAN doubles as TIN)
  tin_type text,                                  -- e.g. 'PAN' | 'SSN' | 'other' — free text, not an enforced enum (regulatory-set TBD)
  country_of_birth text,
  place_of_birth text,
  is_us_person boolean not null default false,
  is_us_citizen boolean not null default false,
  status text not null default 'pending',        -- 'pending' | 'completed' | 'needs_review'
  declared_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id)
);
comment on table fatca_declarations is
  'ENGINEERING MODEL READY / REGULATORY FIELD SET REQUIRES CONFIRMATION — see migration header. A US-person declaration (is_us_person or is_us_citizen = true) routes to needs_review rather than auto-completing; the actual downstream reporting workflow for a US-person investor is not built (BLOCKED — no FATCA reporting provider/process integrated yet).';

-- ============================================================================
-- Phase 11: Consent ledger — previously ABSENT as a generic mechanism. Three unrelated, ad hoc
-- boolean/string mechanisms existed instead (advisor_leads.consent, a dropped
-- investor_profile.consent_given_at, and complianceService's unpersisted payload.consentToken) —
-- none shared a schema and none of them durably recorded WHAT was consented to, at what version,
-- or from what source. This table is the single place any future consent-bearing action writes to.
-- ============================================================================
create table if not exists consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  consent_type text not null,        -- e.g. 'terms' | 'privacy' | 'portfolio_import' | 'investment_declaration' | 'fatca_declaration' | 'nominee_declaration' | 'transaction_authorization' | 'communication_preference'
  version text not null,               -- the policy/document version the user actually saw, e.g. 'terms-v3' or a date-based tag
  status text not null default 'granted', -- 'granted' | 'withdrawn'
  source text,                          -- which flow captured it, e.g. 'onboarding' | 'order_review' | 'settings'
  document_ref text,                    -- optional pointer to the specific document/policy record consented to
  correlation_id text,                  -- ties back to the request/order/compliance-item that required this consent
  created_at timestamptz not null default now()
);
create index if not exists idx_consent_records_user on consent_records (user_id, consent_type);
comment on table consent_records is
  'Append-only. A withdrawal is a NEW row with status=withdrawn, never an update/delete of the original grant — the grant must remain provable even after withdrawal. Deliberately no IP/device metadata column: not currently justified by any actual requirement, and this mission''s own instruction is "do not collect unnecessary tracking data."';

-- ============================================================================
-- Phase 9: nominee resubmission currently INSERTs a new row every time instead of replacing —
-- verified: complianceService.js's nominee case has no ON CONFLICT at all, so correcting a typo in
-- a submitted nominee's name creates a second, extra nominee row rather than fixing the first.
-- Adds an explicit slot (`sequence`) so a resubmission of the SAME slot correctly replaces it,
-- while still leaving room for real multi-nominee support later (a different sequence = a
-- genuinely different nominee, not a correction) — the schema was already multi-nominee-capable in
-- principle (no prior unique(user_id)), this just makes "which nominee is this" explicit instead
-- of ambiguous.
--
-- PRE-PRODUCTION NOTE: if production already has more than one nominees row for the same user_id
-- (a real possibility given the bug being fixed here), reconcile those manually — keep the correct
-- row, delete/archive the rest — BEFORE applying the unique index below, or index creation will
-- fail. Test branch has no such pre-existing data, so this applies cleanly there.
-- ============================================================================
alter table nominees add column if not exists sequence integer not null default 1;
create unique index if not exists idx_nominees_user_sequence on nominees (user_id, sequence);
comment on column nominees.sequence is
  'Which nominee slot this is for the investor (1, 2, 3, ...). Resubmitting the same slot replaces that nominee (ON CONFLICT DO UPDATE in complianceService.js); a different slot adds an additional nominee.';

-- ============================================================================
-- Phase 13: investment_accounts currently conflates the internal MF Pulse account row with a
-- future real provider-issued client identity (account_number is explicitly mock-generated, never
-- a real BSE/CDSL identifier — see 009's own column comment). These columns let a real UCC/client
-- reference be recorded distinctly once a real provider exists, without needing another migration.
-- ============================================================================
alter table investment_accounts add column if not exists provider text;
alter table investment_accounts add column if not exists provider_client_reference text;
alter table investment_accounts add column if not exists verified_at timestamptz;
alter table investment_accounts add column if not exists failure_reason text;
comment on column investment_accounts.provider is
  'Which investment provider this account was opened with (e.g. "mock-investment" today; "bse-star-mf" once real). Distinct from account_number, which stays MF Pulse''s own internal identifier.';
comment on column investment_accounts.provider_client_reference is
  'The provider''s own client/UCC identifier for this investor, once a real provider is connected. Null under the mock provider — there is no real UCC to record yet.';

-- Run: psql "$DATABASE_URL" -f sql/neon/034_compliance_model_hardening.sql
-- Apply to BOTH the production branch and the dedicated "test" branch (br-weathered-star-
-- atigraez), subject to the nominees pre-production note above. If production application is
-- blocked by this session's own tooling (same pattern as prior migrations), apply to test only and
-- record that honestly in docs/MIGRATION_RUNBOOK.md's inventory.
