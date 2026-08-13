-- Mirror of sql/039_news_company_entities.sql for the Neon read model.

alter table public.news_entities
  drop constraint if exists news_entities_entity_type_check;

alter table public.news_entities
  add constraint news_entities_entity_type_check
  check (entity_type in ('sector', 'amc', 'category', 'benchmark', 'index', 'company'));
