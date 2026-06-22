-- MF Pulse — core schema
-- Plain-Postgres compatible (runs on local Docker Postgres and on Supabase).
-- TimescaleDB hypertable conversion is optional and guarded at the bottom.

-- ---------------------------------------------------------------------------
-- dim_scheme : one row per scheme_code, slowly-changing dimension.
-- Source: AMFI NAVAll.txt. We track first_seen/last_seen so we can detect
-- new schemes and retired ones without deleting history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dim_scheme (
    scheme_code   TEXT PRIMARY KEY,
    scheme_name   TEXT NOT NULL,
    amc_name      TEXT NOT NULL,
    asset_class   TEXT NOT NULL,            -- Equity / Debt / Hybrid / Solution / Other
    scheme_type   TEXT,                     -- Open Ended Schemes / Close Ended Schemes / ...
    category_raw  TEXT,                     -- raw AMFI category, e.g. "Equity Scheme - Large Cap Fund"
    isin_growth   TEXT,
    isin_reinvest TEXT,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    first_seen    DATE NOT NULL,
    last_seen     DATE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dim_scheme_amc   ON dim_scheme (amc_name);
CREATE INDEX IF NOT EXISTS idx_dim_scheme_class ON dim_scheme (asset_class);

-- ---------------------------------------------------------------------------
-- fact_nav_daily : the daily NAV time series.
-- NAVAll.txt has NAV only (no AUM), so AUM lives in fact_flow_monthly (SEBI).
-- Composite PK makes the daily load idempotent.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_nav_daily (
    scheme_code TEXT NOT NULL REFERENCES dim_scheme (scheme_code),
    nav_date    DATE NOT NULL,
    nav_value   NUMERIC(18, 6),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (scheme_code, nav_date)
);
CREATE INDEX IF NOT EXISTS idx_nav_date ON fact_nav_daily (nav_date);

-- ---------------------------------------------------------------------------
-- fact_flow_monthly : net inflow/outflow by AMC + category, from SEBI monthly
-- reports. This is what powers the headline "+₹14,820 Cr equity inflow" numbers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fact_flow_monthly (
    amc_name    TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    category    TEXT,
    month       DATE NOT NULL,             -- first day of the reporting month
    inflow_cr   NUMERIC(18, 2),
    outflow_cr  NUMERIC(18, 2),
    net_flow_cr NUMERIC(18, 2),
    aum_cr      NUMERIC(18, 2),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (amc_name, asset_class, month)
);
CREATE INDEX IF NOT EXISTS idx_flow_month ON fact_flow_monthly (month);

-- ---------------------------------------------------------------------------
-- user_events : behavioural tracking (the "portfolio piece" differentiator).
-- Every search, AMC drill-down, alert sign-up and watchlist add lands here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_events (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    session_id  TEXT NOT NULL,
    event_type  TEXT NOT NULL,            -- search / amc_view / alert_signup / watchlist_add / page_view
    payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
    country     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_type ON user_events (event_type);
CREATE INDEX IF NOT EXISTS idx_events_time ON user_events (created_at);

-- ---------------------------------------------------------------------------
-- Optional: convert fact_nav_daily to a TimescaleDB hypertable for fast
-- time-range queries. Safe no-op if the extension isn't installed.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') THEN
        CREATE EXTENSION IF NOT EXISTS timescaledb;
        PERFORM create_hypertable('fact_nav_daily', 'nav_date',
                                  if_not_exists => TRUE, migrate_data => TRUE);
    END IF;
END $$;
