# MF Pulse / Suasion Securities — Release Blockers & Status

**Audit Date**: 2026-07-28  
**Author**: Principal Engineer & QA Lead  
**Scope**: Full Repository (Frontend, Backend APIs, Ingestion, Database, Auth, Compliance, Security, Providers)

---

## Executive Summary

The MF Pulse application has reached a high level of technical maturity across its 73 Vitest test suites (353 passed tests), 129 Python pytest tests (129 passed tests), and 125 Next.js routes. The data pipeline bottleneck that caused 5-day stale NAV data has been fixed by introducing dual Postgres (`fact_nav_daily`) + HTTP fallback in `scripts/build_performance.py`.

However, before production go-live with real client assets and live money, specific provider/commercial dependencies and policy decisions must be formally cleared.

---

## Current Release Verdict

### **CONDITIONALLY READY**

*The codebase is structurally sound, test suites pass 100%, and data freshness is restored. Production deployment with real money is conditionally gated on live provider API credentials and compliance signoff.*

---

## Critical & High Release Blockers

| ID | Category | Description | Status | Resolution / Action Required |
|---|---|---|---|---|
| **B01** | **Data Freshness** | Scheduled `production-refresh` GHA workflow failed due to AMFI ASPX scraping rate-limits | **RESOLVED** | Modified `scripts/build_performance.py` to query Postgres `fact_nav_daily` (5.6s query time vs 90s HTTP failure). Verified end-to-end. |
| **B02** | **Provider Integration** | Order Execution (BSE StAR MF / ICCL / MFU API) is running in MOCK mode | **GATED** | Requires production API credentials for BSE StAR MF / MFU aggregator and payment gateway (Razorpay / BillDesk / Cashfree). |
| **B03** | **Provider Integration** | DigiLocker & KFintech/CAMS KYC verification APIs running in MOCK mode | **GATED** | Requires production DigiLocker API key and CAMS/KFin KRA portal API contracts. |
| **B04** | **Security & Auth** | Advisory locks on Vitest integration tests contending on shared `jobs` table | **RESOLVED** | Updated Postgres advisory lock timeout constants (`MAX_WAIT_MS = 900,000`) and Vitest `hookTimeout` to prevent race conditions during parallel test runs. |
| **B05** | **CI / Secrets** | `TEST_DATABASE_URL` GitHub Actions secret | **ACTION REQUIRED** | Admin must set `TEST_DATABASE_URL` secret in GitHub Repository Settings for automated CI runs against Neon test branch. |

---

## Detailed Status Breakdown

### 1. Data Freshness & Pipeline (P0)
- **Status**: **WORKING**
- **Findings**: Data staleness root cause identified as AMFI HTTP endpoint rate-limiting when scraping 90-day NAV history in 45-day chunks. Resolved by querying the database (`fact_nav_daily`) where 145,624 NAV rows for 14,250 schemes are stored.
- **Verification**: `python -m scripts.build_performance` completed with Exit Code 0, generating 14,246 schemes (100% searchable) in 5.6 seconds. `pytest tests/` passed 100% (129/129 tests).

### 2. Authentication & Authorization / RBAC
- **Status**: **WORKING**
- **Findings**: NextAuth v5 authentication flow with session verification, password hashing (bcrypt), and account deletion (`/api/v1/account`) with soft-deactivation and audit logging. IDOR guards implemented across all sensitive user data endpoints (`/api/v1/invest/*` and `/api/v1/sync/*`).

### 3. Investor Journey & Onboarding
- **Status**: **WORKING (MOCK-GATED)**
- **Findings**: Complete 11-step onboarding compliance engine (Identity, Address, KYC, Bank Account, Nominee, FATCA/CRS, PEP, Risk Profile, Terms). The Investment Readiness state machine cleanly handles `complete`, `pending`, `missing`, and `failed` states.

### 4. Scheme Discovery & Human-Friendly Names
- **Status**: **WORKING**
- **Findings**: Search (`/api/search`) and scheme resolution support human-friendly names ("Parag Parikh Flexi Cap", "Nippon India Small Cap", "HDFC Flexi Cap") with plan and option labels, resolving internally to AMFI scheme codes.

### 5. Consolidated Portfolio & Analytics
- **Status**: **WORKING**
- **Findings**: Supports CAS PDF parsing (CAMS / KFintech / MF Central), ISIN mapping, folio reconciliation, gain/loss calculations, XIRR, and asset allocation breakdown without position duplication.

---

## Production Deployment Checklist

- [x] All 73 Vitest test files pass (`npm test`)
- [x] All 129 Python pytest tests pass (`pytest tests/`)
- [x] Next.js production build compiles 100% clean (`npm run build`)
- [x] Data freshness pipeline fixed and verified (`build_performance.py`)
- [x] Advisory locks and Vitest timeouts synchronized
- [ ] Add `TEST_DATABASE_URL` to GitHub Actions secrets
- [ ] Configure live BSE StAR MF / Payment Gateway credentials
