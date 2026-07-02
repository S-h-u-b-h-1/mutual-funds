-- Phase 3 (realtime-intelligence sprint) — financial news ingestion. Public SELECT (news is
-- meant to be public-facing, same posture as dim_scheme/fact_nav_daily), NO public INSERT
-- anywhere — writes happen only via scripts/ingest_news.py using the service-role key (the
-- exact same pattern already proven on cloud_pipeline.py / fact_nav_daily). RLS enforces this
-- at the database layer, not just by omission in the frontend code.

create table if not exists news_sources (
  id bigint generated always as identity primary key,
  name text not null unique,
  source_type text not null check (source_type in ('rss', 'api', 'regulatory')),
  url text not null,
  credibility text not null check (credibility in ('official', 'tier1_business', 'tier2_business')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists news_articles (
  id bigint generated always as identity primary key,
  source_id bigint references news_sources(id),
  title text not null,
  url text not null unique,
  title_hash text not null,            -- dedup fallback: the same story synced across two feeds
  summary text,                        -- verbatim from the source RSS description, HTML-stripped
                                        -- and length-capped — never generated or paraphrased
  published_at timestamptz,
  fetched_at timestamptz not null default now(),
  category text,                       -- rbi | sebi | amfi | earnings | macro | sector | amc |
                                        -- mutual_funds | global | market_moving | corporate
  importance_score int check (importance_score between 0 and 100),
  market_relevance_score int check (market_relevance_score between 0 and 100),
  sentiment_label text check (sentiment_label in ('positive', 'negative', 'neutral', 'mixed')),
  created_at timestamptz not null default now()
);
create index if not exists ix_news_articles_published on news_articles (published_at desc);
create index if not exists ix_news_articles_category on news_articles (category);
create index if not exists ix_news_articles_title_hash on news_articles (title_hash);
create index if not exists ix_news_articles_importance on news_articles (importance_score desc);

-- canonical entities (sector / AMC / mutual-fund category / benchmark / index), reused across
-- articles so "which sector" answers are queryable, not just free text on each article.
create table if not exists news_entities (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('sector', 'amc', 'category', 'benchmark', 'index')),
  name text not null,
  unique (entity_type, name)
);

-- article <-> entity link, always carrying the deterministic rule_id that produced it — every
-- connection traces to a real, inspectable rule (scripts/market_reaction.py), never a guess.
create table if not exists news_market_links (
  id bigint generated always as identity primary key,
  article_id bigint not null references news_articles(id) on delete cascade,
  entity_id bigint not null references news_entities(id) on delete cascade,
  relation text not null,              -- always hedged: "may affect" / "relevant to", never "will"
  rule_id text not null,
  created_at timestamptz not null default now(),
  unique (article_id, entity_id)
);
create index if not exists ix_news_market_links_entity on news_market_links (entity_id);

-- kept as its own table per spec (in addition to the denormalised sentiment_label on
-- news_articles) so the keyword trail behind a sentiment call is inspectable, not opaque.
create table if not exists news_sentiment (
  id bigint generated always as identity primary key,
  article_id bigint not null references news_articles(id) on delete cascade,
  label text not null check (label in ('positive', 'negative', 'neutral', 'mixed')),
  method text not null default 'keyword_lexicon_v1',  -- explicit: a keyword lexicon, NOT an ML/NLP
                                                       -- sentiment model — never overclaim precision
  matched_keywords text[],
  created_at timestamptz not null default now()
);

-- audit log, same shape/purpose as the existing fact_pipeline_runs (publicly readable so a
-- future /data-status extension can show news-pipeline health, same transparency posture).
create table if not exists news_ingestion_runs (
  id bigint generated always as identity primary key,
  source_id bigint references news_sources(id),
  status text not null,
  articles_fetched int not null default 0,
  articles_new int not null default 0,
  articles_duplicate int not null default 0,
  error text,
  started_at timestamptz not null,
  finished_at timestamptz not null default now()
);

alter table news_sources enable row level security;
alter table news_articles enable row level security;
alter table news_entities enable row level security;
alter table news_market_links enable row level security;
alter table news_sentiment enable row level security;
alter table news_ingestion_runs enable row level security;

create policy "public_read_news_sources" on news_sources for select using (true);
create policy "public_read_news_articles" on news_articles for select using (true);
create policy "public_read_news_entities" on news_entities for select using (true);
create policy "public_read_news_market_links" on news_market_links for select using (true);
create policy "public_read_news_sentiment" on news_sentiment for select using (true);
create policy "public_read_news_ingestion_runs" on news_ingestion_runs for select using (true);
-- No INSERT/UPDATE/DELETE policies anywhere above — only the service-role key (which bypasses
-- RLS entirely) can write, exactly like fact_nav_daily. Verified live after apply, not assumed.
