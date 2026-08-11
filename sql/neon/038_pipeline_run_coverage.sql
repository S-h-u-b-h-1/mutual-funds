-- 2026-08-11 NAV freshness incident fix. Root cause: fact_nav_daily genuinely contained a row
-- dated 2026-08-10 (a real trading day), so every existing freshness check (all of which compare
-- only MAX(nav_date) against today's calendar date) reported "current" -- but only 5 of the
-- ~8,500 normally-active schemes actually had that date; the other ~8,469 were still on
-- 2026-08-07. A single max-date check cannot distinguish "the newest date exists for everyone"
-- from "the newest date exists for almost no one". These columns record the missing dimension:
-- what fraction of the normal scheme universe actually had the ingested date, computed once per
-- run by scripts/cloud_pipeline.py (see ingestion/freshness.py's classify_freshness/
-- coverage_baseline) and used by scripts/assert_pipeline_freshness.py and the frontend freshness
-- surfaces to tell "current" apart from "technically present but still filling in".
--
-- Neon-only: this mission's own instruction is that Neon is the authoritative database and new
-- capability should not deepen Supabase's role, so these columns are added only to Neon's
-- fact_pipeline_runs and populated via a targeted UPDATE (not the shared dict written to both
-- databases) -- Supabase's fact_pipeline_runs schema is untouched and its existing write path
-- is unaffected.
alter table fact_pipeline_runs
  add column if not exists coverage_pct numeric,
  add column if not exists expected_trading_day date,
  add column if not exists schemes_at_source_date integer,
  add column if not exists schemes_baseline integer,
  add column if not exists freshness_state text;

comment on column fact_pipeline_runs.coverage_pct is
  'schemes_at_source_date / schemes_baseline -- fraction of the normal scheme universe that had source_date''s NAV at the moment this run finished ingesting. Null if no baseline could be computed yet.';
comment on column fact_pipeline_runs.expected_trading_day is
  'The business day (Mon-Fri, holiday-blind) whose NAV should already be in the warehouse by the time this run started -- see ingestion/freshness.py:expected_trading_day().';
comment on column fact_pipeline_runs.schemes_at_source_date is
  'Distinct scheme_code count in fact_nav_daily for this run''s source_date, read back from Neon immediately after upsert.';
comment on column fact_pipeline_runs.schemes_baseline is
  'Max distinct scheme_code count across the most recent weekday dates prior to source_date -- the "normal" denominator coverage_pct is measured against.';
comment on column fact_pipeline_runs.freshness_state is
  'CURRENT / PARTIAL / STALE / UNKNOWN -- see ingestion/freshness.py:classify_freshness(). PARTIAL is the state this incident fix exists to surface: source_date is present but coverage is below COVERAGE_MIN.';
