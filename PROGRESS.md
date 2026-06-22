# MF Pulse — build progress

Durable tracker (survives across sessions). Updated 2026-06-21.

**15 / 20 tasks complete · 75%** — backend verified, data layer LIVE on Supabase, dashboard **DEPLOYED & PUBLIC** with AMC drill-down, search, and behavioural analytics.

### 🌐 LIVE: https://frontend-six-beta-20.vercel.app
Real AMFI scheme/NAV universe + (sample) monthly net-flow headline. Reads Supabase via PostgREST.

**Live cloud DB:** Supabase project `FinPulse` (ref `autijihzocnxduipeaop`, region ap-northeast-2). 14,219 schemes + 14,219 NAVs served via PostgREST with the publishable key. Public read only; `user_events` public-insert. The `postgres` master password was deliberately **not** rotated (serving via PostgREST needs no DB password).

## Phase 1 · Foundation
- [x] **1. Project setup & data exploration** — repo, Docker (Postgres+Timescale+Redis), venv. Verified the real AMFI feed. ⚠️ Corrected two myths from planning: URL is `portal.amfiindia.com` (not `www`), and the file is **semicolon**-separated (not pipe), **NAV-only (no AUM)**.
- [x] **2. AMFI parser & raw ingestion** — `ingestion/amfi_parser.py` + `load_nav.py`. Stateful hierarchy parse. **Verified: 14,219 rows, 51 AMCs, 0 NAV failures.** Idempotent upserts.
- [x] **3. dim_scheme seed & category mapping** — asset-class derivation incl. legacy labels (Income→Debt, Growth/ELSS→Equity). Loaded into Postgres.
- [x] **4. dbt models — core aggregations** — `dbt/` project, staging+marts, `not_null`/source tests. Logic verified via direct SQL. ⚠️ dbt-core 1.9 won't run on **Python 3.14** (mashumaro break) — run under Python 3.12/3.13 or the dbt Docker image.
- [x] **5. Airflow DAG — daily schedule** — `airflow/dags/mfpulse_daily.py`: download→load→`dbt build`→Slack. Schedule 8:30pm IST Mon–Sat.

## Phase 2 · Pipeline
- [x] **6. SEBI monthly flow ingestion** → `ingestion/sebi_flows.py` loads a monthly CSV into `fact_flow_monthly` (verified, 12 rows). Seeded Supabase + headline views. Dashboard shows it with a **"Sample"** badge — real SEBI/AMFI data is PDF-only, so export the monthly CSV and re-run the loader.
- [x] **7. FastAPI REST endpoints** *(ahead of schedule)* — `api/main.py`. **Verified live**: `/health`, `/api/overview`, `/api/amcs`, `/api/events`.
- [ ] **8. Redis caching** for heavy aggregations
- [x] **9. user_events tracking end-to-end** — ✅ frontend logs `page_view`/`search`/`amc_view`/`search_click` to Supabase (`app/lib/track.js`); verified events land + are queryable by type/session.
- [ ] **10. Data-quality tests in CI** — parser tests pass (4/4); add GitHub Actions

## Phase 3 · Frontend
- [x] **11. Next.js 14 app scaffold** — `frontend/` (App Router, JS). `next build` ✅ static-prerenders against live Supabase.
- [x] **12. Dashboard hero** — schemes / AMCs / asset-class cards, reading `v_asset_class_summary` view.
- [x] **13. AMC chips + drill-down** — chips link to `/amc/[amc]` showing scheme counts by class + equity schemes with live NAV (FK embed).
- [~] **14. Search + watchlist** — ✅ live scheme/AMC search (`app/components/Search.jsx`, debounced PostgREST ilike). Watchlist still TODO.
- [x] **15. Behavioural event tracking from UI** — ✅ wired & verified (see #9).

## Phase 4 · Launch *(deployment — added per request)*
- [x] **16. Deploy Postgres** — ✅ **LIVE** on Supabase (`FinPulse`). Full 14k rows via PostgREST. Aggregate views + RLS in place.
- [x] **17. Deploy API** — reads go directly through Supabase PostgREST (no separate API needed). FastAPI `Dockerfile` ready if a custom API is wanted later.
- [x] **18. Deploy frontend** — ✅ **LIVE** at https://frontend-six-beta-20.vercel.app (Vercel, team shubh1s-projects, prod, public 200).
- [ ] **19. Domain** — on free *.vercel.app (your choice). Rename Vercel project `frontend`→`mfpulse` for a cleaner URL anytime.
- [ ] **20. Launch** — r/IndiaInvestments, r/mutualfunds_india

## Redeploy after changes
```bash
cd frontend && npm run build
VERCEL_TOKEN=<token> npx vercel deploy --prod --yes --scope shubh1s-projects \
  --build-env NEXT_PUBLIC_SUPABASE_URL=... --build-env NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

## How to run what's built
```bash
docker compose up -d
docker exec -i mfpulse-db psql -U mfpulse -d mfpulse < sql/001_schema.sql
.venv/bin/python -m ingestion.load_nav          # download + load today's NAVs
.venv/bin/uvicorn api.main:app --reload         # http://localhost:8000/docs
.venv/bin/pytest tests/                          # data-quality tests
```
