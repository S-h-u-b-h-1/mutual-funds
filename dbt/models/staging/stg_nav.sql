-- Clean, typed view over the raw daily NAV facts joined to scheme dimensions.
with nav as (
    select scheme_code, nav_date, nav_value
    from {{ source('mfpulse', 'fact_nav_daily') }}
    where nav_value is not null
)
select
    n.scheme_code,
    s.scheme_name,
    s.amc_name,
    s.asset_class,
    s.category_raw,
    n.nav_date,
    n.nav_value
from nav n
join {{ source('mfpulse', 'dim_scheme') }} s using (scheme_code)
