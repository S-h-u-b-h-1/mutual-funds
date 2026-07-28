# MF Pulse / Suasion Securities — Data Freshness Audit

**Audit Date**: 2026-07-28  
**Priority Level**: P0 (Launch-Critical)

---

## 1. Freshness Chain Traceability

```
[AMFI NAVAll.txt / Portal] ──(Step 0)
          │
          ▼
[Step 1: cloud_pipeline.py] ──▶ Ingests to Supabase / Neon (fact_nav_daily)
          │
          ▼
[Step 3: build_performance.py] ──▶ Queries Postgres (fact_nav_daily) + AMFI Fallback
          │                         Generates funds.json, performance.json
          ▼
[Step 3: build_daily.py] ──▶ Generates daily.json & Explained Alerts
          │
          ▼
[Step 4: assert_pipeline_freshness.py] ──▶ Validates NAV dates across DB & JSON
          │
          ▼
[Step 5: Git Commit & Push] ──▶ Auto-deploys to Vercel production
```

---

## 2. Root Cause Analysis of Previous 5-Day Staleness

### Problem Statement
Production website (`mf-pulse.vercel.app`) was displaying NAV data that was ~5 days behind real trading days.

### Diagnostic Findings
1. **GitHub Actions Failures**: Scheduled `production-refresh` runs were failing at Step 3 (`build_performance.py`).
2. **HTTP Rate-Limiting**: `build_performance.py` was fetching 90-day NAV history over HTTP from `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx`. AMFI's web portal began throttling/returning empty responses (only 28.7% of schemes returned data).
3. **Data Gate Abort**: `assert_returns_usable` failed fast (as designed) when `with30d` coverage fell below 50%, preventing commit and deploy.

---

## 3. Implemented Fix & Verification

- **Postgres Direct Querying**: Updated `scripts/build_performance.py` (`fetch_series_db` and `anchor_nav`) to query the Postgres `fact_nav_daily` table directly whenever `DATABASE_URL` is set.
- **Performance Boost**: DB fetch loads 140,000+ daily NAV records in **0.52s–5.6s** (compared to 90+ seconds HTTP scraping).
- **Execution Verification**:
  - `build_performance.py`: **Exit Code 0** (14,246 schemes kept, 100% coverage).
  - `build_daily.py`: **Exit Code 0** (Explained alerts generated).
  - `pytest tests/`: **Exit Code 0** (129/129 passed).
  - `vitest run`: **Exit Code 0** (73/73 test files passed).
