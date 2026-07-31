# Investor Onboarding UX Audit

**Date:** 27 July 2026  
**Scope:** authenticated Suasion Invest onboarding, readiness, existing-investor import and first-investment handoff.

**Correction (2026-07-30, Auth+Onboarding truth audit)**: this doc's own line below —
"Protected `/invest/*` routes use the shared Invest shell and redirect unauthenticated users to
login" — does not match the current code. Verified directly: there is no `middleware.js`, no
server-component redirect, and no client-side `useSession()`-based redirect anywhere in the
`/invest/*` page tree (repo-wide search for `router.push("/login")`/`redirect("/login")` patterns
returns two hits, both unrelated to route gating). An unauthenticated visitor's browser fully loads
the `/invest/*` page shell; every underlying API call then 401s and the frontend shows an inline
"session expired" message rather than redirecting. No data is exposed (the API layer is fully
gated — verified separately), so this is a UX gap, not a security one — but it is real, not
"protected" as stated. This is frontend route-guarding, Codex's ownership area, not something this
pass implements. The Mobile OTP and FATCA rows below are also now incomplete — see
`docs/SUASION_PLATFORM_STATUS.md` Section 4 and `docs/INVEST_API_CONTRACTS.md`'s Module 2 table for
the current, real payload requirements (`phoneNumber` for mobile; `taxResidencyCountry` and related
fields for FATCA; a new `pep` item).

## Journey map — current implementation

`/register` and `/login` create or restore the authenticated session. Protected `/invest/*`
routes use the shared Invest shell and redirect unauthenticated users to login. `/invest` loads
profile plus compliance and directs incomplete investors to `/invest/onboarding`.

`/invest/onboarding` is the guided form surface. The supported persisted capabilities are:

| Requirement | Frontend | Backend contract | Provider/environment | Readiness effect |
|---|---:|---:|---|---|
| Mobile OTP | Yes | Yes | Mock OTP (`123456`) | Blocking |
| Email OTP | Yes | Yes | Mock OTP (`123456`) | Blocking |
| PAN | Yes | Yes | Mock KYC provider | Blocking; result is not live KRA/CKYC |
| Identity consent/check | Yes | Yes | Mock document + KYC providers | Blocking |
| Personal profile | Yes | Yes | Stored investor profile | Informational/persisted; not a compliance item |
| Risk profile | Yes | Yes | Deterministic questionnaire engine | Blocking |
| Investment preferences | Yes | Yes | Stored preferences | Optional for readiness |
| Bank | Yes | Yes | Simulated penny-drop | Blocking; may become `needs_review` |
| Nominee | Yes | Yes | Stored nominee record | Blocking |
| FATCA declaration | Yes | Yes | Structured boolean declaration only | Blocking |
| Investment-ready gate | Yes | Yes, derived | Compliance service | Derived; never submitted directly |

`/invest/compliance` is the authoritative readiness summary. Its percentage and status come
from `GET /api/v1/invest/compliance`; the frontend does not calculate a second readiness value.
`/portfolio` is the existing CAS import journey for CAMS CAS PDF, KFintech CAS PDF and MF Central
summary PDF. It does not claim PAN-only discovery. `/invest/redeem` and `/invest/switch` now use
holding-first selectors and their live eligibility contracts. `/invest/orders` and the shared
`TransactionTimeline` provide truthful post-submission tracking.

## UX corrections in this slice

- Added the missing email verification step to the guided flow.
- Resume now chooses the first incomplete backend compliance item when no explicit step is given.
- Known profile fields are prefilled from the stored profile response.
- “Next” can no longer bypass persistence; the primary action is “Save and continue”.
- A successful save advances one step, while rejected/needs-review responses keep the investor on
  the current step with the backend message.
- Progress shows backend-derived completed checks and percentage alongside the current step.
- Mock KYC, OTP and penny-drop behaviour remains explicitly labelled; no DigiLocker, PAN discovery,
  live KRA/CKYC, real payment gateway or live investment provider is implied.

## Remaining launch risks

- Mock verification providers are not production identity, bank or payment rails.
- FATCA is currently a single declaration because no structured FATCA/CRS contract is published.
- Consent records are represented only where the current compliance contract accepts them; separate
  terms/privacy/distributor-consent resources are not exposed as independent APIs.
- Authenticated browser E2E still requires isolated database/provider fixtures and `DATABASE_URL`.
- Payment-attempt history and real gateway redirect contracts remain backend dependencies.
- Full mobile and cross-browser certification requires a running authenticated test environment.

## Certification verdict

**CONDITIONALLY READY.** The frontend onboarding flow now resumes against backend readiness and
hands off to existing investment journeys without inventing provider behaviour. Production launch
still depends on replacing mock verification/payment rails and completing authenticated E2E.
