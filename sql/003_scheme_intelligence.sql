-- 003_scheme_intelligence.sql
-- Scheme-level intelligence warehouse extension (Phase 2).
--
-- Architecture note: the live product currently serves scheme-level returns from a
-- nightly-materialized bundle (frontend/app/data/funds.json, built by
-- scripts/build_performance.py from real AMFI NAV). These tables are the warehouse
-- equivalent so the same metrics can be queried via PostgREST/SQL and persisted with
-- history. The pipeline can populate them in the same run that writes the bundle.

create table if not exists fact_scheme_returns (
  scheme_code            text not null,
  as_of_date             date not null,
  return_1d              numeric,
  return_7d              numeric,
  return_30d             numeric,
  return_90d             numeric,
  return_180d            numeric,
  return_1y              numeric,
  return_3y              numeric,
  return_5y              numeric,
  volatility_30d         numeric,
  volatility_90d         numeric,
  max_drawdown_90d       numeric,
  trend_score            numeric,
  category_rank_30d      int,
  category_size_30d      int,
  category_percentile_30d int,
  calculated_at          timestamptz not null default now(),
  primary key (scheme_code, as_of_date)
);

create table if not exists fact_scheme_data_quality (
  scheme_code      text not null,
  as_of_date       date not null,
  nav_history_days int,
  missing_dates    int,
  stale_days       int,
  has_latest_nav   boolean,
  has_category     boolean,
  has_amc          boolean,
  quality_status   text,            -- ok | limited | stale
  calculated_at    timestamptz not null default now(),
  primary key (scheme_code, as_of_date)
);

create table if not exists fact_scheme_signals (
  scheme_code text not null,
  signal_date date not null,
  signal_type text not null,        -- top_category | strong_1y | improving | weakening | sharp_fall | stale | insufficient | idcw
  severity    text not null,        -- positive | caution | warning
  title       text not null,
  explanation text,
  metric_value numeric,
  source      text default 'AMFI',
  primary key (scheme_code, signal_date, signal_type)
);

create index if not exists ix_scheme_returns_asof on fact_scheme_returns (as_of_date);
create index if not exists ix_scheme_returns_cat on fact_scheme_returns (category_rank_30d);

-- Latest-snapshot convenience view (one row per scheme, newest as_of_date).
create or replace view v_scheme_latest as
select distinct on (r.scheme_code)
  r.scheme_code, d.scheme_name, d.amc_name, d.category_raw, d.asset_class,
  r.as_of_date, r.return_30d, r.return_90d, r.return_1y, r.trend_score,
  r.category_rank_30d, r.category_percentile_30d, q.quality_status
from fact_scheme_returns r
left join dim_scheme d using (scheme_code)
left join fact_scheme_data_quality q using (scheme_code, as_of_date)
order by r.scheme_code, r.as_of_date desc;

-- RLS: public read only (no anon writes; pipeline writes with the service role).
alter table fact_scheme_returns      enable row level security;
alter table fact_scheme_data_quality enable row level security;
alter table fact_scheme_signals      enable row level security;
do $$ begin
  create policy p_read on fact_scheme_returns      for select using (true);
  create policy p_read on fact_scheme_data_quality for select using (true);
  create policy p_read on fact_scheme_signals      for select using (true);
exception when duplicate_object then null; end $$;
