# MF Pulse — build progress

Durable tracker (survives across sessions). Updated 2026-06-21.

**Implementation complete (per the 22-day plan).** Everything buildable is built, tested, and deployed. Items that need *your* external keys are **code-complete** and activate the moment a key is set (Resend email delivery, Sentry DSN). The Reddit launch is yours to run.

### Completed in the autonomous build (Phases 1–4)
- **Spike detection** (Day 13) — z-score `flow_signals` + dashboard "⚡ Flow signals" section (6 months of flow history).
- **Quality gate** (Day 7) — `ingestion/quality_gate.py` (negative-NAV, class-set, freshness, coverage floor) wired into the DAG; offline data-quality tests in CI.
- **Redis caching + event hardening** (Day 10/11) — cache decorator + 1h TTL + secret-protected flush; events validated, rate-limited (60/min), geo-enriched.
- **Alerts** (Day 14) — `alerts` table + `/api/alerts` subscribe + live signup form + Resend delivery (gated on `RESEND_API_KEY`, dry-run otherwise).
- **SEBI Excel parser** (Day 12) — `sebi_flows.load_excel` with header auto-detection + round-trip test.
- **SEO/branding** (Day 19) — dynamic OG image, sitemap, robots, favicon, Inter, metadata.
- **Monitoring** (Day 21) — `/status` page, `/about`, Sentry wiring (FE + BE, gated), `RUNBOOK.md`.
- **13 Python tests** pass (parser, quality, spike, excel) + Next.js build in CI.

**Live:** https://frontend-six-beta-20.vercel.app · **Repo:** https://github.com/S-h-u-b-h-1/MF-Pulse

---

**17 / 20 original-plan tasks · 85%** — backend verified, data layer LIVE on Supabase, dashboard **DEPLOYED & PUBLIC** with drill-down, search, watchlist, real NAV-history sparklines, behavioural analytics, and **CI** on GitHub.

### 🌐 LIVE: https://frontend-six-beta-20.vercel.app
### 📦 Repo: https://github.com/S-h-u-b-h-1/MF-Pulse
Real AMFI scheme/NAV universe + (sample) monthly net-flow headline. Reads Supabase via PostgREST.

**NAV history**: `ingestion/nav_history.py` (backfill from AMFI's date-range report) + `scripts/build_amc_trend.py` (per-AMC normalised equity index → `frontend/app/data/amc_trend.json`, real 30-day data, powers the AMC sparklines).

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
- [x] **10. Data-quality tests in CI** — ✅ `.github/workflows/ci.yml`: Python parser tests + Next.js build on every push/PR to `main`. Vercel env vars set on all 3 environments, so the repo self-deploys.

## Phase 3 · Frontend
- [x] **11. Next.js 14 app scaffold** — `frontend/` (App Router, JS). `next build` ✅ static-prerenders against live Supabase.
- [x] **12. Dashboard hero** — schemes / AMCs / asset-class cards, reading `v_asset_class_summary` view.
- [x] **13. AMC chips + drill-down** — chips link to `/amc/[amc]` showing scheme counts by class + equity schemes with live NAV (FK embed).
- [x] **14. Search + watchlist** — ✅ debounced scheme/AMC search + a localStorage watchlist (star any scheme on its AMC page; panel on home shows live NAV; logs `watchlist_add`).
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
