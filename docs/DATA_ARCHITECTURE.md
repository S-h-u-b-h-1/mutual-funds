# MF Pulse — Data Architecture & Audit

> Source of truth: **Supabase Postgres** (project `FinPulse`). The brief referenced
> "Neon" — there is no Neon instance wired in; Supabase Postgres plays that exact role.
> A Neon migration would only need a connection string + repointing the loaders.

## Phase 1 — Audit (current state)

| # | Area | Finding |
|---|---|---|
| 1 | DB architecture | Star schema: `dim_scheme`, `fact_nav_daily`, `fact_flow_monthly`, `flow_signals`, `user_events`, `alerts`. Served read-only via PostgREST + publishable key (RLS). |
| 2 | Data sources | **NAV/schemes**: AMFI `NAVAll.txt` (real, daily). **30-day index**: AMFI history (real). **Monthly flows**: SEBI/AMFI monthly report — **sample data** (source is PDF-only). |
| 3 | Freshness model | Previously **none** — no staleness signal. NAV was a one-off seed (3 days stale). |
| 4 | Historical retention | `fact_nav_daily` keyed (scheme, date) → accumulates over days. But no daily cron meant history wasn't growing. |
| 5 | Event tracking | `user_events` (immediate PostgREST insert, RLS public-insert, rate-limited in API). Worked, but unstructured (payload JSONB only). |
| 6 | Weaknesses | No pipeline audit log; no health snapshots; no lineage columns; flows hardcoded sample; daily ingestion not scheduled. |
| 7 | Missing prod reqs | Append-only audit trail, freshness/observability surface, scheduled ingestion, source/timestamp lineage. |
| 8 | Scalability | Fine at current scale (15k NAV rows). Regular views are sub-50ms; PostgREST + Vercel ISR cache reads. |
| 9 | Trust concerns | Copy overstated freshness ("live flows"). Sample flows not always labelled. |
| 10 | Tech debt | Single FastAPI not on serving path (PostgREST direct); dbt blocked on Python 3.14. |

## Phases 2–9 — Implemented

- **Lineage**: `source`, `ingested_at` on `fact_nav_daily`/`fact_flow_monthly`; `computed_at` on signals.
- **Audit log** (append-only): `fact_pipeline_runs` — pipeline, status, source, source_date, rows, duration_ms, error, timing.
- **Health snapshots** (append-only): `fact_system_health` — nav latest/staleness, totals, status (green/amber/red).
- **Events** (Phase 5): structured `entity_type`/`entity_value`/`page` columns + indexes; immediate persistence; rate-limited; taxonomy: search, view_amc, watchlist_add/remove, page_view, signal_click, alert_signup, compare_amc.
- **Daily pipeline** (Phase 3): `scripts/cloud_pipeline.py` — download → parse → validate → idempotent upsert (service-role) → record run → snapshot health. Scheduled by `.github/workflows/daily-nav.yml` (8pm IST Mon–Sat); **activates when `SUPABASE_SERVICE_ROLE_KEY` is added to repo secrets**.
- **Observability** (Phase 6/7): `/data-status` (freshness, pipeline runs) + `/status`.
- **Truthfulness** (Phase 8): all "live flows" copy → "Daily NAV intelligence / Latest AMFI / Live platform activity".
- **Performance** (Phase 9): indexes on event entity/session; aggregate views are sub-50ms at this scale; caching via PostgREST + Vercel ISR `revalidate`. Materialized views are the next step at ~10× scale (documented, not yet needed).

## Freshness model
`staleness = today − max(nav_date)` → **green ≤ 2d · amber ≤ 7d · red > 7d**. Snapshotted each run into `fact_system_health`; shown on `/data-status`. Currently **amber** (cron not yet activated).

## Trust model — every number is traceable
- NAV/scheme counts → `dim_scheme` / `fact_nav_daily` (source `AMFI:NAVAll`, `ingested_at`).
- 30-day index → real AMFI NAV history (bundled snapshot, regenerable).
- Monthly flows + signals → **labelled sample** everywhere (badges + `/data-status` + brief disclosure) until the SEBI export is connected.
- Events → `user_events`, exposed only as PII-free aggregates.

## Phase 4 — Monthly flows: blocker (honest)
- **Where**: `fact_flow_monthly`. **Why sample**: SEBI/AMFI publish monthly net flows only as **PDF** (and an Excel with no stable URL) — no clean machine endpoint (verified: AMFI AAUM module is POST-only/Excel; SEBI returns PDFs).
- **Ready**: `ingestion/sebi_flows.py` ingests a normalised CSV **and** the AMFI monthly Excel (`load_excel`, header auto-detect, tested). Drop in one monthly export → real history, no code change.

## Production readiness: **74 / 100**
Strong: schema, lineage, audit log, observability, truthful copy, idempotent loader, CI, deploy. Gaps to 90+: activate the daily cron (add the service-role secret), connect real monthly flows, add alerting on pipeline failure (Sentry DSN), and materialized views at scale.
