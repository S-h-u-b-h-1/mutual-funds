# Customer launch readiness

Last updated: 9 August 2026

This is the living customer-journey launch tracker for MF Pulse + Suasion Securities. It records
actual production behavior where verified, and separates frontend issues from backend, provider,
and business dependencies. Do not mark a journey ready only because a route exists.

Production checked: `https://mf-pulse.vercel.app`

Production commit checked: `d2884d2c6ae48c9864cd8ad9bf9f8d815af7f93a`

Production freshness checked:

- Bundle NAV date: 2026-08-07
- Raw latest date: 2026-08-09
- Production explanation: raw rows exist for 2026-08-09, while public bundles use the latest
  complete equity snapshot dated 2026-08-07.

## Journey readiness table

| Journey | Frontend status | Backend status | Provider dependency | Production verified? | Remaining blocker | Owner | Severity |
|---|---|---|---|---|---|---|---|
| Homepage | PASS | PASS | None | Yes | None found in current pass. | CODEX | P2 |
| Learn about mutual funds | PARTIAL | PASS | None | Partial | Homepage routes Learn to stock learning first; mutual-fund beginner education exists in fund/methodology context but needs a clearer mutual-fund learning entry. | CODEX | P1 |
| Search for a fund by name | PARTIAL | PASS | None | Yes | Production search works by name, but exposed internal AMFI code in the result row. Local fix validated: hide identifiers and show AMC/category/plan/NAV context; production verification pending deployment. | CODEX | P1 |
| Understand fund | PASS | PASS | None | Yes | Fund detail for Parag Parikh Flexi Cap loaded with breadcrumbs, source/freshness context and research actions. | CODEX | P2 |
| Compare fund | PARTIAL | PASS | None | Yes | Production compare accepts the selected fund, but the add-fund prompt said “scheme code.” Local fix validated: use fund name/AMC/category language; production verification pending deployment. | CODEX | P1 |
| Decide to invest | PARTIAL | BACKEND BLOCKED | Licensed execution providers | Yes | Research-to-Invest handoff exists and redirects signed-out users to login; actual investment execution remains provider/mock blocked. | CLAUDE / BUSINESS | P0 |
| Sign up | PARTIAL | PARTIAL | Email delivery provider if real verification is required | Not run end-to-end | Creating a production test customer requires an approved test identity/account. | BUSINESS | P1 |
| Verify identity | BACKEND BLOCKED | MOCK ONLY | KYC/CKYC/KRA provider | Not run end-to-end | Launch blocker report states KYC/document providers are mock. | CLAUDE / BUSINESS | P0 |
| Complete investor onboarding | PARTIAL | PARTIAL | KYC, document, bank verification providers | Source-audited | PEP step exists in current code; full production completion requires approved test account and provider mode clarity. | CLAUDE / BUSINESS | P1 |
| Complete compliance | PARTIAL | PARTIAL | KYC, bank, FATCA/PEP review provider rules | Source-audited | UI shows readiness %, steps, why required, next action and statuses. Provider truth remains mock until real adapters exist. | CLAUDE / BUSINESS | P1 |
| Add bank | BACKEND BLOCKED | MOCK ONLY | Bank verification / penny-drop provider | Not run end-to-end | Current copy discloses simulated penny-drop in onboarding. | CLAUDE / BUSINESS | P0 |
| Add nominee | PARTIAL | PASS | None for mock phase | Source-audited | Needs production-account E2E verification. | CODEX / CLAUDE | P1 |
| FATCA / CRS / PEP | PARTIAL | PARTIAL | Compliance review rules/provider where required | Source-audited | FATCA and PEP UI exist; PEP yes routes to manual review behavior and requires backend/provider policy validation. | CLAUDE / BUSINESS | P1 |
| Become investment ready | BACKEND BLOCKED | PARTIAL | Compliance/KYC/bank providers | Not run end-to-end | Readiness can only be certified after approved production test account and provider-mode decision. | CLAUDE / BUSINESS | P0 |
| Purchase | BACKEND BLOCKED | MOCK ONLY | BSE Star MF / execution + payment provider | Signed-out route verified | UI must not be certified launch-ready while provider is mock. | CLAUDE / BUSINESS | P0 |
| Payment | PROVIDER BLOCKED | MOCK ONLY | Payment / UPI / NACH provider | Not run end-to-end | No real money movement in current provider registry per launch blocker report. | BUSINESS | P0 |
| Order tracking | PARTIAL | PASS | Provider status feed for real execution | Source-audited | Transaction timeline exists; real provider statuses need production provider integration. | CLAUDE / BUSINESS | P1 |
| Portfolio import | PARTIAL | PASS | None for PDF import | Not run in this pass | CAS import exists, but the living audit must verify progress is tied to request lifecycle and not decorative timers. | CODEX | P1 |
| Portfolio dashboard | PARTIAL | PASS | None for imported holdings | Not run in this pass | Needs production test CAS and verification that every value shows valuation/NAV freshness and multi-folio handling. | CODEX | P1 |
| SIP | BACKEND BLOCKED | PARTIAL | Recurring job + payment/mandate provider | Not run end-to-end | Launch blocker report states recurring SIP installment job does not exist. | CLAUDE | P0 |
| Redemption | BACKEND BLOCKED | MOCK ONLY | Execution/provider settlement | Not run end-to-end | Frontend must continue using backend eligibility/timeline truth; real payout depends on provider. | CLAUDE / BUSINESS | P0 |
| Switch | BACKEND BLOCKED | MOCK ONLY | Execution/provider switch support | Not run end-to-end | Frontend must not claim completion until backend/provider states confirm both legs. | CLAUDE / BUSINESS | P0 |
| Statements/Documents | BACKEND BLOCKED | PARTIAL | Real document generation/storage | Not run end-to-end | Launch blocker report states downloads return metadata/no real bytes. | CLAUDE | P1 |
| Notifications | PARTIAL | PARTIAL | SMS/email/push provider | Not run end-to-end | In-app read/archive APIs exist; external delivery remains mock/provider blocked. | CLAUDE / BUSINESS | P1 |
| Profile | PARTIAL | PASS | None | Not run signed-in | Requires production test account for update/logout/login verification. | BUSINESS | P1 |
| Logout/login again | PARTIAL | PASS | None | Signed-out login redirect verified | Full loop requires approved test credentials. | BUSINESS | P1 |

## Current production findings

1. Production is current to `d2884d2`, so the previous IA/navigation and breadcrumb work is live.
2. Production homepage has no horizontal overflow at 1280px and exposes the intended top-level IA.
3. Production fund search by name works for “Parag Parikh Flexi Cap,” but displayed the AMFI code
   in the result row. This is a CODEX-owned P1 because normal investors should never need internal
   identifiers.
4. Production fund compare works for `/compare?mode=funds&funds=122639`, but the compare search
   placeholder said “scheme code.” This is a CODEX-owned P1.
5. Production `/invest` redirects signed-out users to `/login?callbackUrl=%2Finvest`.
6. Production `/operations` redirects signed-out users to `/login?callbackUrl=%2Foperations`; role
   behavior still needs a signed-in non-admin account check.

## Current frontend-owned fixes validated locally

- Hide internal identifiers in global search results and show fund context instead.
- Replace compare “scheme code” prompt with fund name / AMC / category language.
- Replace fund-detail “Copy Scheme Code” with “Copy research link.”
- Repair the 320px mobile bottom-search launcher so it opens the shared search dialog directly.

Local verification:

- `npm run lint --prefix frontend`: pass.
- `npm run build --prefix frontend`: pass, 114 routes built.
- `npm test --prefix frontend`: blocked by the repository's database safety guard because
  `DATABASE_URL` is not configured in this environment.
- Browser: home search result for “Parag Parikh Flexi Cap” shows AMC/category/plan/NAV context
  without raw AMFI code.
- Browser: 320px mobile bottom Search opens the shared search dialog and has no horizontal
  overflow.
- Browser: compare route uses “Search by fund name, AMC, or category.”
- Browser: fund detail shows “Copy research link” / “Share,” not “Copy Scheme Code.”

## Verification still required

- Approved production test customer for sign-up → onboarding → compliance → logout/login.
- Approved test CAS upload for import → review → save → revalue → portfolio.
- Provider-mode decision for mock vs real KYC, bank, payment, transaction, document, notification
  and execution adapters.
- Mobile matrix for the fixed search/compare/fund-detail surfaces after deployment: 320, 375, 390,
  768, 1024, 1440.
