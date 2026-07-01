-- Phase 3 discoverability + Phase 5 product analytics (complete-workflows sprint) — real
-- tracked-behaviour aggregates, mirroring the exact pattern already proven on v_top_searches.
-- Applied live via Supabase MCP apply_migration; tracked here for version control.
--
-- KNOWN OPEN ITEM: these views were created with security_invoker=true (Postgres default-safe
-- mode). Because user_events has an insert-only RLS policy (no SELECT for anon), invoker-mode
-- views currently return an empty result set for the public anon key — verified directly
-- (a genuinely-populated view returns [] via the client-exposed key, not an error). The
-- intentional-and-already-shipped v_top_searches pattern instead uses SECURITY DEFINER
-- (creator-owner permissions) specifically so aggregate-only counts can be read publicly while
-- the raw per-event rows (session_id, full payload) stay locked down — a deliberate escape
-- hatch, not an accidental privilege leak. Whether these 8 new views should match that pattern
-- is a security-relevant tradeoff intentionally left for a dedicated review (a separate task is
-- already auditing SECURITY DEFINER usage across the whole database) rather than resolved
-- unilaterally here. Until resolved, the frontend (/discover) renders the honest "not enough
-- activity yet" empty state for these specific sections — which is correct behaviour either way.

create or replace view v_top_funds_viewed as
select payload->>'code' as scheme_code, count(*) as views, count(distinct session_id) as sessions
from user_events
where event_type = 'fund_view' and payload->>'code' is not null
group by payload->>'code'
order by views desc
limit 20;

create or replace view v_top_categories_viewed as
select payload->>'category' as category, count(*) as views, count(distinct session_id) as sessions
from user_events
where event_type = 'category_view' and payload->>'category' is not null
group by payload->>'category'
order by views desc
limit 12;

create or replace view v_top_amcs_viewed as
select payload->>'amc' as amc, count(*) as views, count(distinct session_id) as sessions
from user_events
where event_type in ('amc_view', 'amc_intel_view') and payload->>'amc' is not null
group by payload->>'amc'
order by views desc
limit 12;

create or replace view v_top_compared as
select payload->>'amc' as amc, count(*) as compares
from user_events
where event_type = 'comparison_start' and payload->>'amc' is not null
group by payload->>'amc'
order by compares desc
limit 12;

create or replace view v_top_watchlisted as
select payload->>'scheme_code' as scheme_code, count(*) as adds
from user_events
where event_type = 'watchlist_add' and payload->>'scheme_code' is not null
group by payload->>'scheme_code'
order by adds desc
limit 12;

-- Phase 5 product analytics: session duration by page (which pages keep users longest) and
-- chart-interaction rate (which charts get opened).
create or replace view v_session_duration_by_page as
select payload->>'path' as page_path,
       count(*) as sessions,
       round(avg(((payload->>'seconds')::numeric)), 1) as avg_seconds,
       round((percentile_cont(0.5) within group (order by ((payload->>'seconds')::numeric)))::numeric, 1) as median_seconds
from user_events
where event_type = 'session_duration' and payload->>'seconds' is not null
group by payload->>'path'
order by sessions desc
limit 30;

create or replace view v_chart_interactions as
select payload->>'chart' as chart, payload->>'action' as action, count(*) as interactions
from user_events
where event_type = 'chart_interaction'
group by payload->>'chart', payload->>'action'
order by interactions desc
limit 30;

create or replace view v_advisor_funnel as
select
  (select count(*) from user_events where event_type = 'advisor_cta_click') as cta_clicks,
  (select count(*) from user_events where event_type = 'advisor_contact_submit') as submits,
  (select count(*) from advisor_leads) as leads_stored;

alter view v_top_funds_viewed set (security_invoker = true);
alter view v_top_categories_viewed set (security_invoker = true);
alter view v_top_amcs_viewed set (security_invoker = true);
alter view v_top_compared set (security_invoker = true);
alter view v_top_watchlisted set (security_invoker = true);
alter view v_session_duration_by_page set (security_invoker = true);
alter view v_chart_interactions set (security_invoker = true);
alter view v_advisor_funnel set (security_invoker = true);
