-- News ingestion now links exact, vetted exchange symbols to company entities.
-- Keep the existing public-read RLS policy unchanged; this migration only widens the
-- constrained vocabulary so deterministic company links can be stored.

alter table public.news_entities
  drop constraint if exists news_entities_entity_type_check;

alter table public.news_entities
  add constraint news_entities_entity_type_check
  check (entity_type in ('sector', 'amc', 'category', 'benchmark', 'index', 'company'));
