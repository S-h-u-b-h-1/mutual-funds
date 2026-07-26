# Investor experience corrective audit

Updated 26 July 2026.

## Infrastructure already present

- `/portfolio` is an authenticated, persistent portfolio workspace.
- CAMS CAS PDF, KFintech CAS PDF and MF Central summary PDF uploads are supported by the existing
  server boundary. Parsing, scheme resolution, transaction extraction, source provenance, duplicate
  upload detection and user-scoped persistence already exist.
- Journey 3 APIs provide consolidated holdings, valuation, allocation, performance, history and data
  quality. The Invest portfolio page reuses those APIs rather than creating a second portfolio engine.
- Scheme identity helpers resolve ISIN first, then AMFI code and exact normalized name; ambiguous
  matches remain unresolved instead of being guessed.

## Corrective implementation

- Added contextual back navigation to secondary Invest routes.
- Replaced raw scheme-code entry in Purchase and SIP creation with server-backed search by fund name,
  AMC or category. The selected canonical code is submitted only after the investor chooses a result.
- Transaction timelines now resolve a backend scheme code to the human-readable scheme name.
- Empty Investor Dashboard and Invest Portfolio states now point to the real authenticated statement
  import workspace instead of implying that automatic discovery exists.
- Preserved truthful provider language: no PAN-only lookup, no fabricated provider connection, and no
  automatic redemption/switch eligibility for imported holdings.

## Functional import methods

The functional investor-facing import method is authenticated PDF statement upload through the
existing `/api/v1/portfolio/upload` boundary. The UI supports the three documented statement types;
the backend detects and cross-checks the registrar. Automatic PAN discovery, live RTA connections,
email-derived retrieval and provider account linking are unavailable and are not represented as live.

## Remaining gaps

The current upload contract persists after parsing rather than creating a reviewable draft. Consent,
provider authorization, import-status polling, cross-provider folio reconciliation, holding-level
servicing eligibility and report-generation contracts remain backend dependencies. Existing investors
can import supported CAS statements today when authenticated and holding data can be parsed, but the
full authorized provider-discovery journey is not yet end-to-end.

## Onboarding field matrix

| Area | Frontend | Backend contract | Database evidence | Required before invest | Status |
|---|---|---|---|---|---|
| Identity/profile | DOB, gender, occupation, income band, city/state/PIN | Profile update/read | Profile record | Backend readiness | Implemented |
| Contact/PAN/identity | OTP, PAN, identity consent step | Compliance item endpoints | Compliance items | Backend readiness | Implemented in current provider mode |
| Risk/preferences | Risk sliders, plan preference, SIP day, goal | Risk/preferences endpoints | Profile/preferences records | Suitability/readiness policy | Implemented |
| Bank | Account holder, account number, IFSC | Bank compliance item | Bank account record | Verified bank | Implemented in current provider mode |
| Nominee | Name, relationship, allocation | Nominee compliance item | Nominee record | Policy-dependent | Implemented where contract accepts it |
| FATCA/tax declaration | Declaration acknowledgement | FATCA compliance item | Compliance item | Readiness contract | Implemented in current provider mode |
| Import consent/authorization | Not yet an automatic-provider step | No provider authorization contract | No consented provider-link record | Required for discovery | Backend contract required |

Regulatory requirements not represented by a published backend contract are not inferred by the
frontend; compliance and legal policy must decide whether additional fields are mandatory.

## Manual verification

- Chromium browser pass: `/funds` at 375px had equal viewport and document widths; protected `/invest/*`
  routes redirected to login without overflow and with no console errors.
- API smoke checks confirmed human-friendly search results for “Parag Parikh” and the canonical code
  response remains available to the adapter.
- Production build: 97 routes. Lint passed.
