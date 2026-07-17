-- Flow Signals pivot: AMC-level sample data -> real, industry-wide category-level data from
-- AMFI's Monthly Report (MCR). No table/column changes — fact_flow_monthly and flow_signals
-- keep their existing shape; only the SEMANTICS of two already-existing columns change for rows
-- sourced from scripts/ingest_flows.py (see that file's docstring for the full investigation):
--   amc_name  -> constant sentinel 'Industry (All AMCs)' (AMFI's public export has no AMC
--                breakdown, verified 2026-07-17 against every row of a real monthly download)
--   asset_class -> the real, granular fund category (e.g. "Small Cap Fund"), not a broad bucket
--   category    -> the broad bucket (Equity/Debt/Hybrid/Solution/Other), derived structurally
--                  from which numbered section of the MCR document a category falls under
--
-- Both views below are safe to re-run (CREATE OR REPLACE VIEW is idempotent). The one-time data
-- migration itself (deleting old source='sample' rows, backfilling real months) was applied
-- directly against production and is not repeated here — scripts/ingest_flows.py is the ongoing,
-- re-runnable source of truth for this data going forward (scheduled via
-- .github/workflows/flow_monthly.yml).

-- Previously keyed equity/debt totals on asset_class = 'Equity'/'Debt' (the old broad-bucket
-- semantic). Now that asset_class carries the granular category, that predicate would silently
-- match zero rows -- switched to the category column, which now carries the broad bucket.
CREATE OR REPLACE VIEW v_flow_headline AS
WITH latest AS (
  SELECT max(fact_flow_monthly.month) AS m FROM fact_flow_monthly
)
SELECT
  (SELECT latest.m FROM latest) AS month,
  COALESCE(sum(net_flow_cr) FILTER (WHERE category = 'Equity'), 0::numeric) AS equity_net_cr,
  COALESCE(sum(net_flow_cr) FILTER (WHERE category = 'Debt'), 0::numeric) AS debt_net_cr,
  COALESCE(sum(aum_cr), 0::numeric) AS total_aum_cr
FROM fact_flow_monthly
WHERE month = (SELECT latest.m FROM latest);

-- Added `category` to the select list so callers (frontend/app/lib/brief.js) can filter by
-- broad bucket while still displaying the granular asset_class name. Column order matters for
-- CREATE OR REPLACE VIEW (Postgres only allows appending, not inserting mid-list) -- category
-- goes last.
CREATE OR REPLACE VIEW v_amc_flows AS
WITH latest AS (
  SELECT max(fact_flow_monthly.month) AS m FROM fact_flow_monthly
)
SELECT amc_name, asset_class, net_flow_cr, month, category
FROM fact_flow_monthly
WHERE month = (SELECT latest.m FROM latest)
ORDER BY net_flow_cr DESC;
