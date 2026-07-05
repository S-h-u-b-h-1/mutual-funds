// Server-only Neon read functions (Phase 2 Neon migration). Used today by /internal/neon-status
// only; once READ_FROM_NEON is flipped on, real page read paths would call these too. Every
// function is individually safe regardless of Neon's availability — returns null/empty and
// never throws, so a canary page or a flagged read path degrades gracefully instead of crashing.
import { hasDatabaseUrl, query } from "./db";

// node-postgres parses SQL date/timestamp columns into native JS Date objects (unlike
// PostgREST/Supabase, which always serializes them as strings) — a raw Date rendered directly
// as a JSX child crashes React ("Objects are not valid as a React child"). This only reproduces
// when Neon actually has a row to return, so it's easy to miss with no local DATABASE_URL.
// Fixed once here so every caller gets plain, display-safe strings, matching Supabase's shape.
function stringifyDates(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = v instanceof Date ? v.toISOString() : v;
  return out;
}

async function safeQuery(sql, params) {
  if (!hasDatabaseUrl) return null;
  try {
    const { rows } = await query(sql, params);
    return rows.map(stringifyDates);
  } catch (e) {
    console.error("[neonReads]", e.message);
    return null;
  }
}

export async function checkNeonConnection() {
  const rows = await safeQuery("select 1 as ok");
  return Boolean(rows?.[0]?.ok === 1);
}

export async function getNeonFreshness() {
  const rows = await safeQuery(
    `select nav_latest_date, nav_staleness_days, total_schemes, total_amcs, total_nav_rows,
            total_events, status, captured_at
     from fact_system_health order by captured_at desc limit 1`
  );
  return rows?.[0] ?? null;
}

export async function getNeonNewsCount() {
  const rows = await safeQuery("select count(*)::int as count from news_articles");
  return rows?.[0]?.count ?? null;
}

export async function getNeonPipelineRuns(limit = 5) {
  return safeQuery(
    `select pipeline, status, source, source_date, rows_ingested, duration_ms, error,
            started_at, finished_at
     from fact_pipeline_runs order by finished_at desc limit $1`,
    [limit]
  );
}

export async function getNeonMarketQuotes() {
  return safeQuery(
    `select distinct on (symbol) symbol, name, group_name, price, change, change_pct,
            currency, quote_time, fetched_at
     from market_quotes order by symbol, fetched_at desc`
  );
}

export async function getNeonLastRefresh() {
  const rows = await safeQuery(
    `select
       (select max(fetched_at) from market_quotes) as last_market_quote,
       (select max(finished_at) from fact_pipeline_runs) as last_pipeline_run,
       (select max(finished_at) from news_ingestion_runs) as last_news_run`
  );
  return rows?.[0] ?? null;
}

export async function getNeonCounts() {
  // Every count cast to ::int — Postgres count(*) is bigint, and node-postgres returns bigint as
  // a STRING (not a JS number, to avoid silent precision loss). Uncast, every row here would
  // strict-compare (!==) unequal against Supabase's parsed-integer counts even when they match.
  const rows = await safeQuery(`
    select
      (select count(*)::int from dim_scheme) as dim_scheme,
      (select count(*)::int from fact_nav_daily) as fact_nav_daily,
      (select count(*)::int from fact_pipeline_runs) as fact_pipeline_runs,
      (select count(*)::int from fact_system_health) as fact_system_health,
      (select count(*)::int from news_sources) as news_sources,
      (select count(*)::int from news_articles) as news_articles,
      (select count(*)::int from news_entities) as news_entities,
      (select count(*)::int from news_market_links) as news_market_links,
      (select count(*)::int from news_sentiment) as news_sentiment,
      (select count(*)::int from news_ingestion_runs) as news_ingestion_runs,
      (select count(*)::int from market_quotes) as market_quotes,
      (select count(*)::int from market_quote_runs) as market_quote_runs,
      (select count(*)::int from factsheet_archive) as factsheet_archive,
      (select count(*)::int from fund_history_events) as fund_history_events,
      (select count(*)::int from user_events) as user_events,
      (select count(*)::int from alerts) as alerts,
      (select count(*)::int from advisor_leads) as advisor_leads
  `);
  return rows?.[0] ?? null;
}
