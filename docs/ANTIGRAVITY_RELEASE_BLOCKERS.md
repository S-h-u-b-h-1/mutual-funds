# MF Pulse / Suasion Securities — Release Candidate 2 (RC2) Release Blockers

**Audit Date**: 2026-07-29  
**Status**: **CONDITIONALLY READY**

---

## 1. Resolved Release Blockers (RC1 → RC2)

| Blocker ID | Domain | Description | Resolution Status | Evidence |
|---|---|---|---|---|
| **B01** | Data Freshness | AMFI HTTP scraping rate-limiting caused 5-day NAV staleness | **RESOLVED** | Updated `build_performance.py` to query Postgres `fact_nav_daily` directly. 100% agreement across source, DB, bundle, API, and UI. |
| **B02** | CI/CD Environment | `DATABASE_URL` secret missing in `production-refresh.yml` Step 3 | **RESOLVED** | Added `DATABASE_URL` env mapping to Step 3. Workflow run 30382264123 passed 100% on GHA. |
| **B03** | Skipped Tests | Previous Vitest runs reported skipped tests | **RESOLVED** | **543 / 543 tests passed across 74 test files** (0 skipped tests) in deterministic Vitest suite. |
| **B04** | Layout Shell Overlap | Navbar overlapping boxes/content at certain screen sizes | **RESOLVED** | Measured header height vs main top offset across 9 viewports (320px to 1920px) via Playwright. **0 layout overlaps detected**. |
| **B05** | IDOR Security | Guarding sensitive investor portfolio endpoints | **RESOLVED** | All protected `/api/v1/invest/*` endpoints return HTTP 401 Unauthorized for unauthenticated calls. |

---

## 2. Remaining Commercial Production Blockers (Gated on Key Provisioning)

| Blocker ID | Provider | Required Credential / Action | Impact | Resolution Path |
|---|---|---|---|---|
| **C01** | BSE StAR MF / MFU | Member ID, API Secret, EUIN/ARN mapping | Live Order Execution & Allotment | Replace `mock-bse` with production BSE StAR SOAP/REST endpoints |
| **C02** | Payment Gateway | Razorpay / Cashfree Merchant Key & Webhook Secret | Live Payment Processing | Replace `mock-payment` with production PG SDK |
| **C03** | CKYC / DigiLocker | DigiLocker API Key & CAMS KRA Partner Secret | Automated Live KYC & Bank Verification | Replace `mock-kyc` with production KRA API |
| **C04** | Repository Secret | GitHub Actions `TEST_DATABASE_URL` secret | CI Workflow `ci.yml` database integration test pass | Configure `TEST_DATABASE_URL` in GitHub Repository Settings |

---

## 3. Final Production Release Checklist

- [x] Full Vitest integration test suite passing (543/543 tests)
- [x] Full Python Pytest test suite passing (129/129 tests)
- [x] Production Next.js build compiling cleanly (125/125 routes)
- [x] NAV freshness pipeline automated and verified live on GitHub Actions
- [x] Zero visual layout overlaps across mobile, tablet, and desktop viewports
- [x] AuthGates and IDOR protection enforced on all private investor endpoints
- [ ] Production API keys provisioned for BSE StAR MF and Payment Gateway
