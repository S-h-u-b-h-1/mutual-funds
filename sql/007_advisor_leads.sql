-- Soft advisor-contact CTA (Phase 10, PMF/premium-UI sprint). Public can INSERT only — never
-- SELECT, so names/emails/phones/messages are never readable via the client-exposed anon key.
-- Mirrors the exact security model already proven on alerts/user_events (insert-only RLS), with
-- an added DB-level consent gate (defense in depth beyond the client-side checkbox).
-- Applied live via Supabase MCP apply_migration; tracked here for version control.
create table if not exists advisor_leads (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  phone text,
  investor_type text,
  interest_area text,
  message text,
  source_page text,
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

alter table advisor_leads enable row level security;

create policy "i_advisor_leads" on advisor_leads
  for insert to public
  with check (consent = true and length(name) > 0 and length(email) > 0);
