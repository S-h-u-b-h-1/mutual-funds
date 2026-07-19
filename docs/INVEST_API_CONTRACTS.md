# Invest Platform — API Contracts

Phase 1 (Modules 1, 2, 5). Documents every Invest endpoint live as of this pass — Investor
Identity and the Compliance Engine. This is the contract for frontend integration: request/
response shapes here are stable; any breaking change gets a version bump or a new field, not a
silent reshape. Endpoints for Modules 6-10 (Order Engine, Portfolio Engine, Document Vault, CRM,
Notifications) will be appended here as each module lands — see
`docs/INVEST_PLATFORM_ARCHITECTURE.md` for the full target surface.

**Path convention**: `/api/v1/invest/...`, not the bare `/invest/...` used in the brief's own
examples — this repo already has an established `/api/v1/` namespace (`/api/v1/sync/*`,
`/api/v1/portfolio/*`), and Invest follows it rather than introducing a second convention.

**Auth**: every endpoint requires a signed-in session (the existing Auth.js cookie/session — no
separate Invest login). No session → `401 {"error": "Unauthorized"}` on every route below; that
response is not repeated per-endpoint in this doc. The authenticated user's id is derived
server-side from the session, never from the request — no endpoint accepts a `userId` field.

**Mock phase**: every response below reflects real database state, but any field whose value
originates from a provider call (account numbers, KYC session ids, CKYC status) comes from a
Mock*Provider — see `docs/INVEST_PLATFORM_ARCHITECTURE.md` §11. Nothing here is a real CDSL/BSE
Star MF/CAMS/KFintech/DigiLocker value.

---

## Module 1 — Investor Identity

### `GET /api/v1/invest/profile`

Combined identity summary — everything a dashboard/onboarding screen needs in one call.

```json
{
  "profile": { "user_id": "...", "occupation": "Engineer", "city": "Mumbai", "annual_income_band": null, "... ": "other investor_profiles columns" } ,
  "account": { "account_number": "MFPMOCK12345678", "status": "active", "opened_at": "2026-07-19T..." },
  "preferences": { "preferred_categories": ["Large Cap", "ELSS"], "preferred_plan": "direct", "sip_day": 5 },
  "rmAssignment": { "advisor_id": "...", "advisor_name": "...", "employee_code": "...", "assigned_at": "..." },
  "onboarding": { "overallStatus": "in_progress", "completed": 4, "total": 9, "percent": 44, "items": [ /* see GET /compliance */ ] }
}
```

`profile`, `account`, `rmAssignment` are `null` if not yet created/assigned — never an error, a
new investor's profile is genuinely empty until they fill it in.

### `PUT /api/v1/invest/profile`

Request body — any subset of these fields; omitted fields are left unchanged (partial update):

```json
{ "dateOfBirth": "1990-01-01", "gender": "female", "occupation": "Engineer", "annualIncomeBand": "10-25L", "addressLine1": "...", "addressLine2": "...", "city": "Mumbai", "state": "Maharashtra", "pincode": "400001" }
```

Response: `{ "profile": { /* full row after update */ } }`. `400` on invalid JSON.

### `GET /api/v1/invest/account`

`{ "account": { ... } | null }` — read-only; opening an account is an explicit action (below), not
implicit on first read.

### `POST /api/v1/invest/account`

Opens an investment account via the mock `InvestmentProvider`. **Idempotent** — calling this twice
returns the same account, never opens a second one. `{ "account": { "account_number": "...", "status": "active", "opened_at": "..." } }`.

### `GET /api/v1/invest/risk-profile`

`{ "riskProfile": { "risk_category": "moderate", "score": 50, "answers": {...}, "assessed_at": "..." } | null }`

### `PUT /api/v1/invest/risk-profile`

Request body — raw questionnaire answers, each 1-5:

```json
{ "horizonScore": 4, "lossToleranceScore": 3, "incomeStabilityScore": 4, "experienceScore": 3 }
```

The server derives `score` (0-100) and `risk_category` (`conservative` \| `moderate` \|
`aggressive`) — never trust a client-supplied score. `400 {"error": "Risk questionnaire requires all of: horizonScore, lossToleranceScore, incomeStabilityScore, experienceScore, each 1-5"}` if any field is missing or out of range.

### `GET` / `PUT /api/v1/invest/preferences`

```json
{ "preferredCategories": ["Large Cap", "ELSS"], "preferredPlan": "direct", "sipDay": 5, "goals": [{"type": "retirement", "targetAmount": 5000000, "targetDate": "2050-01-01"}] }
```

`preferredPlan` is `"direct"` or `"regular"`; `sipDay` is 1-28.

---

## Module 2 — Compliance Engine

Nine independent items: `mobile`, `email`, `pan`, `identity`, `nominee`, `bank`, `fatca`,
`risk_profile`, `investment_ready`. Each has its own status; `investment_ready` is **derived**
(auto-completes once the other 8 are done) and can never be submitted directly.

Item status values: `pending` \| `in_progress` \| `verified` \| `rejected` \| `needs_review` \|
`completed`. `verified` and `completed` both count as "done" for progress purposes.

### `GET /api/v1/invest/compliance`

```json
{
  "overallStatus": "in_progress",
  "completed": 4,
  "total": 9,
  "percent": 44,
  "items": [
    { "item_key": "mobile", "status": "completed", "provider": null, "provider_reference": null, "rejection_reason": null, "completed_at": "...", "updated_at": "..." },
    { "item_key": "pan", "status": "verified", "provider": "mock-kyc", "provider_reference": "kycsess_...", "rejection_reason": null, "completed_at": "...", "updated_at": "..." },
    { "item_key": "investment_ready", "status": "pending", "...": "..." }
  ]
}
```

`overallStatus`: `completed` if every item is done; `rejected` if any item is rejected;
`needs_review` if any item needs manual review; `in_progress` if anything has started;
`pending` otherwise.

### `POST /api/v1/invest/compliance/items/{itemKey}`

The brief's example path is `POST /invest/compliance/start` — implemented per-item instead
(`POST .../items/mobile`, `.../items/pan`, etc.) since "each compliance item should be
independent" is an explicit design requirement; a single shared `start` endpoint would blur that.

Request/response per item:

| itemKey | Request body | Success status | Notes |
|---|---|---|---|
| `mobile`, `email` | `{ "otp": "123456" }` | `completed` | Mock OTP — `123456` always succeeds, anything else is `rejected`. No real SMS/email sent. |
| `pan` | `{ "pan": "ABCDE1234F" }` | `verified` \| `needs_review` \| `rejected` | Weighted mock outcome (~85% verified) via MockKYCProvider. |
| `identity` | `{ "pan": "...", "consentToken": "..." }` | `verified` \| `needs_review` \| `rejected` | `consentToken` is required — `400` without it. Fetches a mock document, then checks mock CKYC status. |
| `nominee` | `{ "name": "...", "relationship": "...", "allocationPct": 100, "minor": false, "guardianName": null }` | `completed` | Persists a real row in `nominees`. `rejected` if required fields are missing/invalid. |
| `bank` | `{ "accountNumber": "...", "ifsc": "...", "accountHolderName": "..." }` | `completed` \| `needs_review` | Mock penny-drop (~90% success). Persists a masked row in `bank_accounts`. `rejected` if fields are missing. |
| `fatca` | `{ "declared": true }` | `completed` | Must be literal `true` — anything else is `rejected`. |
| `risk_profile` | `{}` | `completed` \| `rejected` | Checks whether a `risk_profiles` row already exists (via `PUT /risk-profile` first) — this endpoint doesn't itself collect the questionnaire. |
| `investment_ready` | — | — | `400` always — derived only, never directly submitted. |

Response shape (every item, on success):

```json
{ "item": { "item_key": "pan", "status": "verified", "provider": "mock-kyc", "provider_reference": "kycsess_...", "rejection_reason": null, "completed_at": "...", "updated_at": "..." }, "overallStatus": "in_progress" }
```

`400 {"error": "..."}` on validation failure (missing fields, unknown itemKey, or the
`investment_ready` guard) — the error message is human-readable and safe to surface directly in a
UI toast.

---

## Error shape (every endpoint)

```json
{ "error": "human-readable message" }
```

`401` = not signed in. `400` = validation failure (bad JSON, missing/invalid fields, disallowed
action). No endpoint currently returns `403` — role-scoped endpoints (advisor/admin) arrive with
Module 9 (CRM) and will use `lib/apiAuth.js`'s `requireRole()`, added in this pass for that future
use (see that file — `forbidden()` exists but nothing calls it yet).
