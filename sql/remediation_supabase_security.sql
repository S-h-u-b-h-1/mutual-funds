-- Reviewed production security change. Preserves underlying data and historical materialized views.
alter view public.v_top_searches set (security_invoker = true);
revoke all on public.v_top_searches from anon, authenticated;
alter view public.v_event_summary set (security_invoker = true);
alter view public.v_flow_headline set (security_invoker = true);
alter view public.v_amc_flows set (security_invoker = true);

create or replace view public.v_public_amc_summary with (security_invoker = true) as
select amc_name, asset_class, count(*) as schemes from public.dim_scheme group by amc_name, asset_class;

create or replace view public.v_public_asset_class_summary with (security_invoker = true) as
with dates as (select scheme_code, max(nav_date) as latest_nav_date from public.fact_nav_daily group by scheme_code)
select d.asset_class, count(*) as schemes, max(n.latest_nav_date) as latest_nav_date
from public.dim_scheme d left join dates n using (scheme_code) group by d.asset_class;

grant select on public.v_public_amc_summary, public.v_public_asset_class_summary to anon, authenticated;
-- Revocation of legacy materialized views follows deployment of the new serving views.
