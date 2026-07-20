-- MF Pulse x Suasion Securities — Invest Platform, Phase 2, Journey 4 (Document Vault).
-- The canonical document layer for the whole platform — Research and Invest can both write into
-- this table in the future; nothing here is tied to a specific provider (mock or real).
--
-- DELIBERATE CHOICES:
--
-- 1. No real binary storage backend exists this phase ("No real providers yet. Only
--    architecture, persistence and APIs" — explicit brief scope). storage_ref is always a
--    synthetic reference (see providers/mock/MockDocumentProvider.js's generateDocument and
--    ids.js's mockRef), never a real object-storage URL. A real implementation swaps the
--    provider, not this schema.
--
-- 2. document_events is the Document Timeline — same pattern as order_status_history
--    (010_order_management.sql): documents.status is the CURRENT stage; this table is every
--    lifecycle event that happened to it, including read-only ones (downloaded) that never
--    change status.
--
-- 3. visibility is captured now for future RBAC (Investor/Advisor/Admin/Internal/Shared) but
--    NOT YET enforced across users this pass — every API in this journey is self-service (the
--    caller's own documents only), matching every other Invest endpoint. Cross-user advisor
--    access is Journey 5 (CRM)'s concern, built on top of this same column.
--
-- 4. category/doc_type/status/source/visibility/event_type are app-validated (see
--    documentService.js), not DB CHECK constraints — same convention as investment_orders.status
--    and compliance_items.item_key, so adding a new value never needs a migration.
--
-- Run: psql "$DATABASE_URL" -f sql/neon/011_document_vault.sql

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  category text not null,
  -- 'identity' | 'compliance' | 'portfolio' | 'transactions' | 'statements' | 'tax' | 'mandates'
  -- | 'research_exports' | 'advisor_documents' | 'other'
  doc_type text not null,
  -- finer-grained than category: 'cas' | 'account_statement' | 'investment_confirmation'
  -- | 'tax_statement' | 'kyc_pdf' | 'mandate' | 'advisor_note' | 'user_upload'
  title text not null,
  description text,
  tags text[] not null default '{}',
  source text not null,        -- 'mock-generated' | 'user-upload' — HOW it entered the vault
  provider text,                -- which provider fabricated/supplied it; null for a plain upload
  storage_ref text not null,    -- synthetic this phase — never a real file
  mime_type text,
  file_size_bytes integer,
  status text not null default 'generated',
  -- 'generated' | 'uploaded' | 'reviewed' | 'verified' | 'archived' | 'expired'
  visibility text not null default 'private', -- 'private' | 'shared' | 'advisor' | 'internal'
  related_entity_type text,     -- 'order' | 'compliance_item' | 'portfolio' | null
  related_entity_id text,
  expires_at timestamptz,
  metadata jsonb not null default '{}', -- extensible bag for anything that doesn't need its own column
  -- search_vector is trigger-maintained, not a GENERATED column: to_tsvector(regconfig, text) is
  -- STABLE, not IMMUTABLE (its behavior depends on the text-search-configuration catalog, even
  -- for a builtin like 'english'), so Postgres rejects it inside a `generated always as` — the
  -- trigger below is the standard, documented workaround.
  search_vector tsvector,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_documents_user on documents (user_id, created_at desc);
create index if not exists idx_documents_user_category on documents (user_id, category);
create index if not exists idx_documents_user_status on documents (user_id, status);
create index if not exists idx_documents_search on documents using gin (search_vector);
create index if not exists idx_documents_tags on documents using gin (tags);

create or replace function documents_search_vector_update() returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(new.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', replace(new.category, '_', ' ')), 'C') ||
    setweight(to_tsvector('english', replace(new.doc_type, '_', ' ')), 'C');
  return new;
end;
$$ language plpgsql;

drop trigger if exists documents_search_vector_trigger on documents;
create trigger documents_search_vector_trigger
  before insert or update on documents
  for each row execute function documents_search_vector_update();

create table if not exists document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  event_type text not null,
  -- 'generated' | 'uploaded' | 'reviewed' | 'verified' | 'downloaded' | 'archived' | 'expired'
  -- | 'shared'
  -- `on delete set null`, not cascade: an actor being deleted shouldn't destroy the event record
  -- itself (the document's own audit trail should survive), just anonymize who did it. This is
  -- also required for correctness, not just intent — document_id already cascades from
  -- documents(user_id) on delete cascade, so a NO ACTION/RESTRICT default here (Postgres's
  -- default when unspecified) can deadlock that cascade: deleting a user whose documents
  -- reference them as BOTH owner and actor fails, because this FK's restrict check fires before
  -- the other cascade path removes the row.
  actor_user_id uuid references users(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists idx_document_events_document on document_events (document_id, created_at);
