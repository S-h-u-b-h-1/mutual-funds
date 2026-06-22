-- One row per (amc, asset_class, nav_date): the aggregation that backs the
-- dashboard chips and the AMC drill-downs.
select
    amc_name,
    asset_class,
    nav_date,
    count(*)              as scheme_count,
    round(avg(nav_value), 4) as avg_nav,
    max(nav_value)        as max_nav,
    min(nav_value)        as min_nav
from {{ ref('stg_nav') }}
group by amc_name, asset_class, nav_date
