# Invest Platform — API Contracts

Documents every Invest endpoint live as of this pass: Journey 1 (Investor Identity + Compliance
Engine), Journey 2 (Order Management), Journey 3 (Portfolio), and Journey 4 (Document Vault). This
is the contract for frontend integration: request/response shapes here are stable; any breaking
change gets a version bump or a new field, not a silent reshape. Endpoints for Journeys 5-6 (CRM,
Notifications) will be appended here as each lands — see `docs/INVEST_PLATFORM_ARCHITECTURE.md`
for the full target surface.

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

## Journey 2 — Order Management

Order lifecycle: `draft` → `submitted` → `processing` → `units_pending` → `completed` \|
`failed` \| `retry_required`, plus `cancelled` (from any non-terminal state) and `reversed` (an
explicit action on a completed order only). **Placing an order or SIP requires compliance to be
fully `completed` and an active investment account** — both checked server-side on every call, not
just at signup; a `400` with a clear message is returned otherwise, e.g.
`"Compliance must be fully completed before placing an order."`

No background worker exists — `GET /orders/{orderId}` is the polling entry point: it recomputes
status from elapsed time since submission on every call (not just returning a stored value), so
poll it (e.g. every 5-10s while an order is non-terminal) rather than assuming push updates.

### `GET /api/v1/invest/orders`

```json
{ "orders": [ { "id": "...", "scheme_code": "119551", "order_type": "purchase", "amount": 5000, "units": null, "status": "processing", "provider_order_id": "ord_...", "rejection_reason": null, "created_at": "...", "updated_at": "..." } ] }
```

### `POST /api/v1/invest/orders`

Request:

```json
{ "schemeCode": "119551", "orderType": "purchase", "amount": 5000, "draft": false }
```

`orderType`: `purchase` \| `redemption` \| `switch_in` \| `switch_out`. Either `amount` or `units`
is required. `switch_in`/`switch_out` also require `relatedSchemeCode` (the other leg of the
switch). `draft` (optional, default `false`): `true` creates without submitting to the provider —
call `POST /orders/{orderId}/submit` later to send it. Response: `{ "order": { ... } }` — same
shape as the list endpoint's rows.

### `GET /api/v1/invest/orders/{orderId}`

Order Details + Order Timeline in one call. Refreshes status first (see the polling note above).

```json
{
  "order": { "id": "...", "status": "units_pending", "...": "..." },
  "timeline": [
    { "from_status": null, "to_status": "submitted", "reason": null, "created_at": "..." },
    { "from_status": "submitted", "to_status": "processing", "reason": null, "created_at": "..." },
    { "from_status": "processing", "to_status": "units_pending", "reason": null, "created_at": "..." }
  ]
}
```

`404 {"error": "Order not found"}` if the order doesn't exist or belongs to another user — the two
cases are deliberately indistinguishable in the response, so a client can't probe for the
existence of another user's order id.

### `POST /api/v1/invest/orders/{orderId}/submit`

Submits a `draft` order (see the `draft` flag above). `400` if the order isn't in `draft`.
Response: `{ "order": { ... } }`.

### `POST /api/v1/invest/orders/{orderId}/cancel`

Allowed from `draft`, `submitted`, or `processing` — not from `units_pending` onward (allotment is
too far along to cancel, matching real fund-order behavior) or any terminal state. `400
{"error": "Order cannot be cancelled from status: units_pending."}` otherwise. Response:
`{ "order": { ..., "status": "cancelled" } }`.

### `POST /api/v1/invest/orders/{orderId}/retry`

Only valid when `status` is `retry_required` — resubmits to the (mock) provider. `400` otherwise.
Response: `{ "order": { ..., "status": "submitted" } }`.

### `GET` / `POST /api/v1/invest/sips`

```json
{ "schemeCode": "119551", "amount": 2000, "frequency": "monthly", "startDate": "2026-08-01", "endDate": null }
```

`frequency`: `monthly` \| `weekly` \| `quarterly`. Response: `{ "sip": { "id": "...", "mandate_status": "active", "provider_mandate_id": "mandate_...", "...": "..." } }`. `GET` returns `{ "sips": [...] }`.

### Frontend integration notes (state, edge cases, empty states)

- **Empty state**: `GET /orders` with no orders yet returns `{ "orders": [] }` — not a 404, not
  an error. Same for `GET /sips`.
- **The ~8% immediate-rejection case**: `POST /orders` can return a `submitted`-shaped success
  response where `order.status` is actually `"failed"` with a `rejection_reason` set — this is a
  deliberate mock-realism choice (a real order gateway can reject at submission), not a bug. Check
  `order.status`, don't assume `200` means `"submitted"`.
- **`retry_required` needs a distinct UI state**: an order can resolve to `retry_required` after
  processing (not just `completed`/`failed`) — this is the one non-terminal-looking status that
  still needs a user action (`POST .../retry`) rather than more waiting.
- **Timeline ordering**: `timeline` is chronological (oldest first) — render top-to-bottom or
  reverse client-side as needed, it's not pre-reversed.
- **Compliance-gate failures surface as normal `400`s**, not a special error code — match on the
  message text if the UI wants to redirect to `/invest` onboarding specifically (e.g.
  `error.includes("Compliance must be fully completed")`), since no separate error `code` field
  exists yet.

---

## Journey 3 — Portfolio

Source-agnostic: a holding may originate from a CAS import, a completed Journey 2 order, or an
explicit mock-connect action (below) — every endpoint in this section returns the same shape
regardless, and a single scheme held via two different sources consolidates into **one** row
(see `sources` in the holdings shape). Nothing here recomputes analytics itself; it's a thin read
layer over the existing, already-live `frontend/app/lib/portfolioIntelligence/*` engine that also
backs `/api/v1/portfolio/intelligence` (the pre-Invest CAS-import page) — same math, same
`portfolio_holdings`/`portfolio_transactions` tables, different API surface.

**Empty-state contract**: every endpoint below returns a clean `200` with a zeroed/empty shape for
a user with no holdings yet — never a `400`. This is a deliberate improvement over
`/api/v1/portfolio/intelligence`'s `400 "No holdings to analyze"`: a brand-new investor with zero
holdings is a normal, common state, not an error condition.

### `GET /api/v1/invest/portfolio`

Combined view — everything a dashboard needs in one call.

```json
{
  "holdings": [
    {
      "schemeCode": "119551", "schemeName": "...", "isin": "...", "units": 245.318,
      "avgCost": 42.10, "purchaseValue": 10332.89, "currentValue": 11145.02,
      "amc": "...", "category": "Large Cap", "benchmark": "...", "expenseRatio": 0.45,
      "nav": 45.43, "weight": 22.3,
      "sources": [ { "source": "mock-connected", "folioNumber": "MOCK12345678", "units": 245.318, "currentValue": 11145.02 } ]
    }
  ],
  "unresolved": [],
  "summary": { "totalValue": 50000, "investedValue": 46000, "gainLoss": 4000, "gainLossPct": 8.7, "xirr": 12.1, "holdingsCount": 4, "healthScore": 72, "qualityScore": 68, "effectiveHoldings": 3.2, "effectiveAmcs": 2.8, "effectiveCategories": 3.1, "staleHoldingCount": 0, "latestNavCoveragePct": 100 },
  "allocation": { "amc": [ { "name": "...", "value": 22000, "weight": 44 } ], "category": [...], "benchmark": [...], "sector": {...} },
  "topHoldings": [ /* top N by weight, subset of holdings */ ],
  "performanceLeaders": [ /* best/worst performing holdings by return */ ],
  "strengths": ["..."], "weaknesses": ["..."], "bottomLine": "..."
}
```

Empty state: `{ "holdings": [], "unresolved": [], "summary": { "totalValue": 0, "investedValue": 0, "gainLoss": 0, "gainLossPct": null, "xirr": null, "holdingsCount": 0, "healthScore": null, "qualityScore": null, "effectiveHoldings": 0, "effectiveAmcs": 0, "effectiveCategories": 0 }, "allocation": null, "topHoldings": [], "performanceLeaders": [] }`.

**`sources`** on each holding is the source-agnostic guarantee made concrete: if a scheme was
partly CAS-imported and partly bought through a completed order, this array has two entries and
`units`/`currentValue` on the parent object are already summed — the frontend never needs to merge
by source itself. **`unresolved`** lists any `portfolio_holdings` rows whose `scheme_code` no
longer resolves to a live fund (delisted/merged schemes) — surfaced, not silently dropped or
crashed on.

### `GET /api/v1/invest/portfolio/summary`

`{ "summary": { /* same shape as above */ } }` — for a lightweight dashboard widget that doesn't need full holdings.

### `GET /api/v1/invest/portfolio/holdings`

`{ "holdings": [...], "unresolved": [...] }` — same per-holding shape as the combined view, standalone.

### `GET /api/v1/invest/portfolio/allocation`

`{ "allocation": { "amc": [...], "category": [...], "benchmark": [...], "sector": {...} } }`.
Empty state: `{ "allocation": { "amc": [], "category": [], "benchmark": [], "sector": null } }`.

### `GET /api/v1/invest/portfolio/performance`

```json
{
  "valuation": { "investedValue": 46000, "currentValue": 50000, "gainLoss": 4000, "gainLossPct": 8.7, "xirr": 12.1 },
  "performanceLeaders": [...],
  "history": [ { "snapshot_date": "2026-07-01", "total_value": 48500, "holdings_count": 4 } ],
  "historyNote": null
}
```

`history` is real daily `portfolio_snapshots` rows, oldest first — **never backfilled or
estimated**. `historyNote` is non-null (and `history` may be short) until at least 3 snapshots
exist: `"Only 1 historical snapshot(s) recorded — too little to chart a trend yet. This grows over
time, never backfilled with estimates."` Render `history` as a real (if short) line, not a fake
smooth curve, while `historyNote` is present. Empty state (no holdings at all):
`{ "valuation": null, "performanceLeaders": [], "history": [], "historyNote": "No holdings yet." }`.

### `GET /api/v1/invest/portfolio/history?limit=50`

Portfolio Timeline — merges order lifecycle events (Journey 2) and settled transactions (CAS
import + reconciled orders) into one chronological feed, newest first.

```json
{
  "events": [
    { "type": "order_status", "label": "Units allotted", "schemeCode": "119551", "orderType": "purchase", "amount": 5000, "units": 110.5, "reason": null, "occurredAt": "..." },
    { "type": "transaction", "label": "Investment settled", "schemeCode": "119551", "amount": 5000, "source": "invest-order", "occurredAt": "..." }
  ]
}
```

`limit` (query param, optional): clamped to `[1, 200]`, defaults to `50`. Only emits event types
this platform has real data for today — `label` values map from real order statuses
(`submitted`/`processing`/`units_pending`/`completed`/`failed`/`cancelled`/`retry_required`/
`reversed`) and real transaction types
(`purchase`/`redemption`/`switch_in`/`switch_out`/`dividend_payout`/`dividend_reinvest`).
"Document Generated" / "Advisor Note" event types are **not yet emitted** — they arrive with
Journeys 4/5's real data, never stubbed in ahead of that.

### `POST /api/v1/invest/portfolio/connect`

Explicit, user-initiated only — generates a realistic demo portfolio for a user with no holdings
yet, using real, currently-active fund identities (real scheme code, current NAV/AMC/category);
only the "you hold N units, purchased on date D" fact is synthetic. Every row this creates is
tagged `source: "mock-connected"`, distinct from `"cas"` (real CAS import) and `"invest-order"`
(a real completed order) everywhere downstream. **Never called automatically** — this platform
does not fabricate a user's financial position without an explicit tap.

**Idempotent**: a second call for an already-connected user returns the existing portfolio
unchanged, not a fresh/different one.

```json
{ "alreadyConnected": false, "holdings": [...], "unresolved": [], "summary": {...}, "allocation": {...}, "topHoldings": [...], "performanceLeaders": [...] }
```

(Same shape as `GET /portfolio`, plus the leading `alreadyConnected` flag.)

### Frontend integration notes

- **Empty state is `200`, not `400`** — every endpoint above; see the empty-state contract note at
  the top of this section. Render an empty/zeroed dashboard, not an error screen, for a
  brand-new investor.
- **`unresolved` is not an error** — a delisted/merged scheme in a user's real CAS-imported
  history is a legitimate state. Surface it as "N holdings need review" or similar, don't drop it
  silently and don't treat its presence as a failed request.
- **One consolidated row per scheme, `sources` shows the breakdown** — never sum
  `holdings[].units` across rows for the "same" fund; if a scheme appears via two sources it is
  already one row with `units` pre-summed and `sources` listing the parts.
- **A completed Journey 2 order updates the portfolio automatically** — no separate "sync" call is
  needed after an order reaches `completed`; `GET /portfolio*` reflects it on the next read.
- **`connectMockPortfolio` is a deliberate, opt-in demo action** — surface it as something like
  "Connect a demo portfolio" for a first-time/empty-state user, not auto-triggered on page load,
  and don't re-offer it once `alreadyConnected` comes back `true` on a prior call.
- **`historyNote` gates how `performance.history` should render** — a non-null note means fewer
  than 3 real snapshots exist yet; show the real (short) series plainly rather than smoothing or
  projecting a trend from it.

---

## Journey 4 — Document Vault

The canonical document layer for the whole platform — Research and Invest can both write into it
in the future; nothing here is tied to a specific provider (mock or real). **No real binary
storage backend exists this phase** — every `storageRef`/`storage_ref` is a synthetic reference
from `documentProvider` (mock today), never real file bytes. `POST /upload` accepts document
**metadata** (title, category, tags, mimeType, fileSizeBytes), not a real file body.

Categories: `identity` \| `compliance` \| `portfolio` \| `transactions` \| `statements` \| `tax` \|
`mandates` \| `research_exports` \| `advisor_documents` \| `other`. Doc types:
`cas` \| `account_statement` \| `investment_confirmation` \| `tax_statement` \| `kyc_pdf` \|
`mandate` \| `advisor_note` \| `user_upload`. Status: `generated` \| `uploaded` \| `reviewed` \|
`verified` \| `archived` \| `expired` (`reviewed`/`verified` are valid states reserved for a future
advisor-review workflow — Journey 5 — no endpoint transitions a document to them yet). Visibility:
`private` \| `shared` \| `advisor` \| `internal` — captured now for future RBAC, but **not yet
enforced across users**: every endpoint below is self-service (the caller's own documents only,
same as every other Invest endpoint). An advisor actually seeing a `shared`-visibility document is
Journey 5 (CRM)'s concern, built on this same column.

### `GET /api/v1/invest/documents`

Simple list, latest first. Optional `?category=`, `?status=`, `?limit=` (default 50, clamped to
1-200 — `?limit=0` resolves to the 50 default, not 0, the same `parseInt(...) || 50` convention
used by `/portfolio/history`). `{ "documents": [ { "id": "...", "category": "tax", "doc_type": "tax_statement", "title": "...", "description": null, "tags": [], "source": "mock-generated", "provider": "mock-document-generator", "storage_ref": "doc_...", "mime_type": "application/pdf", "file_size_bytes": 128233, "status": "generated", "visibility": "private", "related_entity_type": "order", "related_entity_id": "...", "expires_at": null, "created_at": "...", "updated_at": "..." } ] }`.
Empty vault: `{ "documents": [] }`, not an error.

### `GET /api/v1/invest/documents/{id}`

Document Details + Document Timeline in one call: `{ "document": { ... same shape as above ... }, "timeline": [ { "id": "...", "event_type": "generated", "actor_user_id": null, "metadata": {}, "created_at": "..." } ] }`.
`404 {"error": "Document not found"}` if it doesn't exist or belongs to another user (deliberately
indistinguishable, same as orders).

### `GET /api/v1/invest/documents/search`

Full-text + multi-filter search, all params optional and combinable: `?keyword=` (ranks by
relevance via Postgres `ts_rank` when present, otherwise sorted by `created_at desc`),
`?category=`, `?status=`, `?source=` (`mock-generated` \| `user-upload`), `?tags=fy25,urgent`
(comma-separated, array-overlap match — any tag matches), `?dateFrom=`, `?dateTo=` (ISO dates,
inclusive, filter on `created_at`), `?limit=`. There is no `owner` param — search is always scoped
to the caller; accepting an arbitrary owner would be a cross-user data leak, not a feature.
Response: `{ "documents": [...] }`, same shape as the list endpoint.

### `POST /api/v1/invest/documents/upload`

```json
{ "category": "tax", "docType": "user_upload", "title": "My Form 16", "description": null, "tags": ["fy2025-26"], "mimeType": "application/pdf", "fileSizeBytes": 55000 }
```

`category` and `docType` (default `"user_upload"`) are validated against the fixed lists above —
`400` on an unrecognized value or a missing `title`. Response: `{ "document": { ..., "source": "user-upload", "status": "uploaded" } }`.

### `POST /api/v1/invest/documents/{id}/archive`

No body. `400 {"error": "Document is already archived."}` if already archived — otherwise
`{ "document": { ..., "status": "archived" } }`. `404` if not found/not yours.

### `POST /api/v1/invest/documents/{id}/download`

No body. Records a `downloaded` timeline event and returns `{ "document": { ... } }` (including
its `storage_ref`) — **not a binary response**; there is no real object-storage backend to stream
bytes from this phase (see the section intro). Never changes `status`; safe to call repeatedly.

### `POST /api/v1/invest/documents/{id}/share`

```json
{ "visibility": "advisor", "note": "for Q3 review" }
```

`visibility` must be one of the 4 values above — `400` otherwise. Also how a share is **revoked**:
pass `visibility: "private"`. Records a `shared` timeline event with the note. Response:
`{ "document": { ..., "visibility": "advisor" } }`.

### Frontend integration notes

- **Empty vault is `200`, not `404`/`400`** — `GET /documents` and `/documents/search` both return
  `{ "documents": [] }` for a brand-new user.
- **`/download` doesn't return a file.** Mock phase has no real storage backend — treat the
  response as "record the download + fetch the reference," not an actual browser download. A real
  provider swap would change what `storage_ref` resolves to, not this endpoint's shape.
  `/upload` is the mirror case: it accepts metadata only, never a real file body.
  `document_events`/`document.status` are also honest about the same distinction (`source` on
  every document is exactly `mock-generated` or `user-upload` — never anything implying a real
  provider is involved yet).
- **A completed Journey 2 order generates a document automatically** — `investment_confirmation`,
  tagged `related_entity_type: "order"` / `related_entity_id: <orderId>`, the moment the order
  reaches `completed` (mirroring a real brokerage's contract note on settlement). No separate call
  is needed; it will already be in `GET /documents` on the next read.
  `reviewed`/`verified` statuses and their timeline events **do not have a live trigger yet** —
  they exist in the schema for a future advisor-review workflow (Journey 5), so don't build UI
  that assumes a document can reach them today.
- **`visibility` is not yet cross-user enforced.** Setting a document to `shared`/`advisor` today
  only changes that flag on the document itself — it does not yet grant an advisor account actual
  access via any endpoint. Treat it as "marked for future sharing," not "is currently shared with
  someone," until Journey 5 lands.

---

## Error shape (every endpoint)

```json
{ "error": "human-readable message" }
```

`401` = not signed in. `400` = validation failure (bad JSON, missing/invalid fields, disallowed
action). No endpoint currently returns `403` — role-scoped endpoints (advisor/admin) arrive with
Module 9 (CRM) and will use `lib/apiAuth.js`'s `requireRole()`, added in this pass for that future
use (see that file — `forbidden()` exists but nothing calls it yet).
