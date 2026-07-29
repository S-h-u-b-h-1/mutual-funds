# MF Pulse / Suasion Securities — Investor Journey Audit

**Audit date**: 2026-07-28 (this revision). **Method**: every row below was verified against actual
source code (`frontend/app/lib/invest/`, `frontend/app/api/v1/invest/`) and the live production
database schema (`information_schema.tables` / `describe_table_schema` via the Neon MCP tools) —
never assumed from a prior doc, a table/route name, or an item's own label.

**Correction notice**: the previous revision of this document (also dated 2026-07-28, written by a
different pass) claimed PEP declarations and structured FATCA/CRS both persist to real,
`VERIFIED`, production-backed tables (`pep_declarations`, `fatca_declarations`). **Both claims are
false.** Neither table exists in the production schema (confirmed via direct
`information_schema.tables` query — zero rows for `%pep%`/`%fatca%`/`%consent%`), and there is no
PEP handling anywhere in the codebase (`grep -ri "PEP\|politically.exposed"` across `app/` returns
nothing). FATCA is a bare boolean flag on `compliance_items`, not a dedicated table. This is
exactly the failure mode the governing directive warned about ("do not trust roadmap docs... inspect
the code and database") — except in the more dangerous direction of a doc claiming *more* exists
than actually does, on a compliance-critical surface. Treat every "VERIFIED" claim in this file as
checked against code+DB on the date above; treat any older doc's claims about this surface as
unverified until re-checked the same way.

---

## Complete investor journey lifecycle

```
[Register / Login]  (Auth.js, users table)
       │
       ▼
[Investor Onboarding & Compliance]
  ├── Contact Verification (mobile/email OTP — mock, unrate-limited)
  ├── PAN Validation + KYC (mock KRA/CKYC provider)
  ├── Identity/DigiLocker-shaped verification (mock document provider + bare consentToken)
  ├── Bank Account Verification (mock penny-drop)
  ├── Nominee Declaration (single-submission, no multi-nominee allocation check, no opt-out state)
  ├── FATCA/CRS Declaration (BOOLEAN ONLY — no tax residency/TIN/country capture)
  ├── PEP Declaration (DOES NOT EXIST)
  └── Risk Profile Assessment
       │
       ▼
[Investment Readiness Evaluation] — compliance_items, all-DONE-gates 'investment_ready'
       │
       ▼
[Portfolio Setup]
  ├── Import Existing Portfolio (CAMS/KFintech/ET Money/Groww/Coin CAS parsers) → portfolio_holdings
  └── OR mock "connect" a portfolio → SAME portfolio_holdings table, source='mock-connected'
       │
       ▼
[Transaction Execution]
  ├── Purchase (Lump Sum) — payment fields flat on investment_orders, no Payment Attempt entity
  ├── SIP Creation (create + list only — no pause/resume/cancel/modify)
  ├── Redemption (Holding-first validation — real, complete)
  └── Switch (Same-AMC enforced — real, complete)
       │
       ▼
[Post-Transaction Operations]
  ├── Order Tracking & Timeline (real)
  ├── Document Storage in Vault (real)
  └── Notification Read APIs (real, complete — Journey 5)
```

---

## Onboarding & compliance matrix (verified against code + production DB, 2026-07-28)

| Step | Frontend path | Backend route | DB table | Status | Notes |
|---|---|---|---|---|---|
| Investor profile | `/invest/onboarding` | `GET/PUT /api/v1/invest/profile` | `investor_profiles` (plural — NOT `investor_profile` singular, a confirmed-dead table pending drop, see `BACKEND_TECHNICAL_DEBT.md` L5) | **REAL** | `identityService.js` |
| Investment account | same | `POST /api/v1/invest/account` | `investment_accounts` | **REAL** | |
| Contact verification (mobile/email) | `/invest/compliance` | `POST /api/v1/invest/compliance/items/{mobile,email}` | `compliance_items` | **PARTIAL** | `complianceService.js:68-72` — mock OTP (`"123456"` always succeeds), **zero rate limiting, zero expiry, zero attempt counting** — any value can be retried unlimited times forever |
| PAN / KYC | `/invest/compliance` | `.../compliance/items/pan` | `compliance_items` | **REAL (mock provider)** | Goes through `kycProvider.initiateVerification`/`checkStatus` — real adapter-boundary shape, mock implementation, `complianceService.js:111-118` |
| Identity (DigiLocker-shaped) | `/invest/compliance` | `.../compliance/items/identity` | `compliance_items` | **REAL (mock provider)** | `documentProvider.fetchDocument` + `kycProvider.checkCKYCStatus`, gated on a bare `consentToken` string — no consent ledger backs that token (see Consent row below), `complianceService.js:120-128` |
| Bank account | `/invest/compliance` | `.../compliance/items/bank` | `bank_accounts` | **REAL** | Stores masked number only (`account_number_masked`, last 4 digits) — good practice already in place; mock penny-drop, 90% auto-verify / 10% `needs_review`, `complianceService.js:145-164` |
| Nominee | `/invest/compliance` | `.../compliance/items/nominee` | `nominees` | **PARTIAL** | Real table with a per-row `allocation_pct > 0 and <= 100` CHECK constraint, but **no aggregate validation across multiple nominees** — `submitItem('nominee')` is a bare `INSERT`, callable repeatedly, with nothing summing allocations to 100% across rows. **No explicit nominee opt-out state** — declining to nominate isn't representable, only "not yet submitted" (indistinguishable from not having gotten to that step). `complianceService.js:130-143` |
| FATCA/CRS | `/invest/compliance` | `.../compliance/items/fatca` | `compliance_items` (boolean only) | **STUB, NOT REAL** | `complianceService.js:166-170`: `payload.declared === true` → completed. No tax residency, no country/jurisdiction, no TIN, no TIN-exemption reason, no declaration version, no timestamp beyond the generic `completed_at`. Regulatory scope, currently the weakest real gap in onboarding. |
| PEP declaration | *(no frontend route exists)* | *(no backend route exists)* | *(no table exists)* | **DOES NOT EXIST** | Zero references anywhere in `app/` or the production schema. Not in `complianceService.js`'s `ITEM_KEYS` array at all — `submitItem(userId, 'pep', ...)` would throw `"Unknown compliance item: pep"` today. |
| Risk profile | `/invest/onboarding` | `GET/PUT /api/v1/invest/risk-profile` | `risk_profiles` | **REAL** | |
| Consent | *(implicit, via `identity` item's `consentToken`)* | *(none dedicated)* | *(no table)* | **DOES NOT EXIST as a ledger** | `consentToken` is a bare opaque string passed into one compliance item — no `consents` table, no type/version/accepted_at/withdrawn_at/source record, no audit trail of what was actually agreed to. Every other "consent" moment in the journey (terms, privacy, provider authorization, portfolio import) has no capture mechanism at all. |
| Distributor attribution | *(implicit, order-time)* | via `orderService.js` | `distributor_arns`, `distributor_euins` | **REAL, COMPLETE** | ARN 289322 / EUIN E544323, DB-backed not hardcoded, snapshotted onto orders/mandates at creation. Shipped 2026-07-24, no further work needed — see `docs/DISTRIBUTOR_IDENTITY.md`. |
| Onboarding/readiness contract | `/invest/onboarding` (frontend) | `GET /api/v1/invest/profile` (bundles profile+account+preferences+rmAssignment+onboarding) | — | **THIN, NOT A REAL CONTRACT** | `identityService.getOnboardingProgress()` is a one-line alias for `getComplianceProgress()` (`identityService.js:168-170`) — returns only the raw compliance-items list + a percent. No `steps[]` with human labels, no `nextAction`, no required-vs-optional distinction. Codex has to reconstruct all onboarding UX logic client-side from the raw item list. |

## Portfolio import ↔ Invest platform

**REAL, already unified — not two silos.** `portfolio_holdings`/`portfolio_transactions`
(migration `002_auth_and_user_data.sql`) is the single canonical table both systems write:
`app/lib/portfolioImport/holdingsRead.js` (the CAS-import engine's read path) and
`app/lib/invest/portfolioService.js` (the Invest platform's own mock "connect a portfolio" flow,
`source='mock-connected'`) both read/write the same rows, distinguished by `source`. No bridge
needs to be built from scratch — Section C's real work is PAN-based discovery (Section 14, doesn't
exist, correctly so — no real provider to build against) and a pre-commit review step (Section 15 —
CAS imports currently commit directly, no draft/review/approve stage).

## Payment / order / holding separation

**Not separated — flat fields on one row.** `investment_orders` carries `payment_status`,
`payment_reference`, `payment_bank_account_id`, `provider_error_code` directly
(`orderService.js:210,228,258`). A retried payment overwrites these same columns — no history of
prior attempts, no `payment_attempt_id`, no distinct payment lifecycle from the order's own
lifecycle. This is the confirmed, substantial gap Section 16 (Payment Attempt entity) targets;
matches what Provider Metadata's own shipped-scope note (2026-07-24) explicitly deferred as "a
bigger P0 item," not overlooked.

## SIP lifecycle

**Create + list only.** `orderService.js` exports exactly `createSipMandate` and
`listSipMandates` — no pause, resume, cancel, or amount/date modification specific to a SIP
mandate, and no instalment-history table recording each recurring debit as its own record. No SIP-
specific job type found in the job platform's handler set — there is no engine that actually fires
recurring instalments today, only the one-time mandate record.

## Reconciliation Engine ↔ orders/payments

**Not currently wired.** `app/lib/platform/reconciliation/` (M3, Phase 4) has zero references to
`investment_orders` or `payment_status` — it exists as generic infrastructure but nothing in the
Invest order/payment path calls into it yet.

## Webhook idempotency (payment path)

**No async payment webhook path exists yet, so nothing to make idempotent today** —
`MockPaymentProvider` responds synchronously in the same request; nothing in
`app/lib/invest/providers/` or `orderService.js` calls into the Webhook Platform
(`platform/webhooks/`). This is a forward-looking adapter-boundary gap (Section 18), not an active
bug — becomes real the moment any provider that calls back asynchronously (any real gateway) is
adapted in.

## Advisor / Operations / Management APIs

**Does not exist.** `find app/api -iregex '.*(advisor|ops|admin|management|back-office).*'`
returns nothing. Per the directive, Codex has already built frontend shells for these three
surfaces with no backend behind them — confirmed a real, complete gap, Section G's entire scope.

## Investment readiness state machine (unchanged, still accurate)

`compliance_items` + `compliance_applications.overall_status`, computed in
`complianceService.refreshOverallStatus()`:
- **`completed`**: every item verified/completed → `investment_ready` auto-completes → order/
  redemption/switch/SIP creation unblocked.
- **`rejected`** / **`needs_review`** / **`in_progress`** / **`pending`**: blocks
  `investment_ready`; `orderService.js` and friends re-check this gate server-side on every
  transaction-creating call (never trusts a frontend-cached readiness flag).
