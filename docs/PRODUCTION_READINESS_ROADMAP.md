# MF Pulse × Suasion Securities — Production Readiness Roadmap

**Phase 3 planning document. No Phase 3 implementation has started — this is the audit and plan
the brief asked for, for priority confirmation before any code is written.**

Date: 2026-07-20. Audited against main as of commit `0f09ec4` (Journeys 1–4 live in production
on mock providers, 168/168 tests green).

How to read this document:

- **§1** is the executive summary and the three-bucket rollup.
- **§2–§12** are the per-domain gap analyses the brief requested, each ending in a
  classification table.
- **§13** is the milestone roadmap with dependencies; **§14** is the recommended order.
- **§15** is the list of information and commercial actions required from Suasion Securities —
  the external long poles that gate live investing.
- **§16** states what this document deliberately does not claim.

Classification legend, used everywhere:

| Mark | Meaning |
|---|---|
| ✅ | **Already implemented** — live in the codebase today, with file references |
| 🟡 | **Ready for implementation** — pure engineering, no provider/commercial/regulatory dependency (at most a trivial self-serve account signup, noted where so) |
| 🔴 | **Blocked** — requires provider documentation/credentials, commercial onboarding, or regulatory/legal action by Suasion Securities before engineering can responsibly proceed |

---

## 1. Executive summary

The platform is further along than a typical "mock phase" suggests. The business-logic layer is
finished and proven: identity, a 9-item compliance engine, order lifecycle, SIP mandates,
source-agnostic portfolio, document vault with audit timelines, in-app notifications, and audit
logging all run in production against real Neon, exercised end-to-end by 168 integration tests
through the real HTTP routes. Every external touchpoint already sits behind one of five provider
interfaces ([types.js](../frontend/app/lib/invest/providers/types.js): `KYCProvider`,
`InvestmentProvider`, `PaymentProvider`, `PortfolioProvider`, `DocumentProvider`) with a single
swap point ([providers/index.js](../frontend/app/lib/invest/providers/index.js)). The brief's
core architectural requirement — *"real provider integrations should replace mock providers
without changing business logic"* — is already the structure of the code, not an aspiration.

The rollup across every item in §2–§12:

- **Already implemented:** the full investor journey on mocks — registration → onboarding →
  compliance → orders → portfolio → documents — plus deploy/test/data infrastructure.
- **Ready for implementation (no external blocker):** identity hardening (email verification,
  reset delivery, revocable sessions, rate limiting, MFA-ready schema, RBAC), real object
  storage, reports/download center, CRM (Journey 5), full notification service (Journey 6),
  STP/SWP order types, and — critically — all the *integration scaffolding* (webhook framework,
  reconciliation engine, provider conformance tests, credential/config management) that must
  exist before any real provider goes live.
- **Blocked on Suasion Securities' commercial/regulatory actions:** everything that touches real
  money or real KYC — BSE StAR MF credentials and membership, KRA/CKYC access, PAN and bank
  verification vendors, RTA data feeds, payment/mandate rails, DLT registration for SMS.

The single biggest schedule risk is not engineering: it is the **commercial onboarding track
(§15)**. BSE membership, KRA agreements, and verification-vendor contracts have lead times
measured in weeks-to-months and are entirely outside the codebase. Recommendation: start those
conversations now, in parallel with milestones M1–M5, which need nothing external.

One high-leverage fact worth surfacing early: configuring a **single email-provider API key**
(Resend is already scaffolded in [auth.js](../frontend/app/lib/auth.js)) simultaneously unlocks
password-reset delivery, email verification, magic-link sign-in, *and* flips sessions from JWT
to server-revocable database sessions — the code for all four already exists and is env-gated.

---

## 2. Identity

**Current state.** Credentials auth is real and carefully built: registration and login routes,
bcrypt cost-12 hashing with a timing-equalized dummy-hash compare so user enumeration by
response time is not possible ([auth.js:19–36](../frontend/app/lib/auth.js)), a custom Neon
adapter, and a password-reset flow that already defends against host-header reset-poisoning
([forgot-password/route.js](../frontend/app/api/auth/forgot-password/route.js)) and stores
single-use purpose-tagged tokens. Sessions are JWT today **by constraint, not choice**: Auth.js
requires JWT when Credentials is the only provider; the code automatically upgrades to
database-backed (server-revocable) sessions the moment any second provider (Resend/OAuth) is
configured. OAuth (Google/GitHub) is scaffolded behind env flags. There is no MFA, no rate
limiting, and email verification has schema support (`users.email_verified`,
`verification_tokens`) but no delivery path — no email provider key is configured.

| Item | Status | Notes |
|---|---|---|
| Registration + login (credentials) | ✅ | bcrypt-12, enumeration-safe |
| Session management | ✅/🟡 | JWT now; DB sessions auto-activate with ESP/OAuth key; tune `maxAge` down from Auth.js defaults for a financial app |
| Password reset | 🟡 | Token flow + poisoning defense done; **delivery** needs an ESP key (self-serve signup) |
| Email verification | 🟡 | Schema ready; flow + delivery needs the same ESP key |
| Rate limiting (login/OTP/register) | 🟡 | Nothing exists today; needed before real users |
| MFA readiness | 🟡 | Design TOTP secret + recovery-code tables and enrollment flow behind a flag; enforcement can wait |
| OAuth (Google) | 🟡 | Already env-gated in auth.js; needs client ID/secret when wanted (future, per brief) |
| RBAC (user/advisor/ops roles) | 🟡 | `advisors`/`rm_assignments` tables exist; no role claims or route guards yet — prerequisite for CRM and admin |

## 3. Investor onboarding

**Current state.** The complete journey the brief lists is implemented end-to-end on mocks and
verified by the Journey 1 E2E suite ([journey1-onboarding.e2e.test.js](../frontend/app/api/v1/invest/journey1-onboarding.e2e.test.js)):
personal details (DOB, gender, occupation, income band, full address) in `investor_profiles`,
PAN (masked last-4 by design — see §11), nominee, bank account (with a `needs_review` path so a
failed verification is never silently lost), FATCA declaration (strict explicit-true), risk
questionnaire with auditable raw answers, investment preferences (categories, direct/regular
plan, SIP day, goals), consent-token gating for identity-document fetches, document uploads
(metadata; §8 for storage), and a derived `investment_ready` state that auto-completes at 100%.
A guided onboarding UI exists at [/invest/onboarding](../frontend/app/invest/onboarding).

Gaps against the brief's list: explicit **tax-residency fields** (today captured only inside the
FATCA declaration payload — should be first-class columns), **consent versioning** (which policy
text was agreed, when), and **profile management** (view/edit/reset/delete — partially pending
from the earlier Production Activation track).

| Item | Status | Notes |
|---|---|---|
| Personal details / PAN / DOB / address / occupation | ✅ | `investor_profiles` (sql/neon/009) |
| Nominee, bank, FATCA, risk, preferences, consent, investment-ready | ✅ | 9-item compliance engine, all through real routes |
| Document uploads | ✅/🟡 | Metadata + events live; real binary storage is §8 |
| Tax residency as first-class data | 🟡 | Small schema + form addition |
| Consent versioning + audit | 🟡 | Store policy version/timestamp per consent |
| Profile management (view/edit/delete) | 🟡 | Extends existing identityService |

## 4. KYC & verification

**Current state.** `KYCProvider` is a clean interface with a mock behind it; the compliance
engine treats verification outcomes (`verified` / `needs_review` / `rejected`) as data, so a
real provider only changes *who answers*, not *what happens next*. Mobile/email OTP flows are
real flows with mock delivery.

**What real KYC requires (all 🔴, commercial/regulatory — see §15):** CKYC access is via CERSAI
registration as a reporting entity; KRA verification (CVL/CAMS/NDML/Karvy) requires agreements
with the KRA; PAN verification requires an agreement with Protean (NSDL e-Gov) or a licensed
vendor; bank verification (penny-drop / reverse-penny-drop) requires a commercial vendor
(Setu/Cashfree/Signzy-class); Aadhaar-based flows are legally restricted to licensed entities
and should only ever be reached through such a vendor. **Do not build against guessed API
shapes** — adapters get written from official specs after onboarding.

| Item | Status | Notes |
|---|---|---|
| KYCProvider abstraction + mock | ✅ | Interface proven by compliance engine |
| OTP flows (mobile/email) | ✅/🟡 | Logic real; SMS delivery blocked (§9), email delivery needs ESP key |
| Adapter skeletons + config slots for real providers | 🟡 | Env-driven registry, credential handling, error taxonomy — buildable now (M5) |
| CKYC/KRA verification (live) | 🔴 | CERSAI/KRA onboarding + official specs |
| PAN verification (live) | 🔴 | Protean or licensed vendor agreement |
| Bank verification (live) | 🔴 | Penny-drop vendor agreement |
| Full-PAN/PII handling policy | 🟡 | Today only masked last-4 is stored (deliberate); before live KYC, decide store-encrypted vs pass-through-and-mask, and implement (§11) |

## 5. BSE StAR MF

**Current state.** `InvestmentProvider` (account opening, order submit/cancel/status, SIP
mandate creation) is implemented by `MockInvestmentProvider` with a realistic order lifecycle;
the order engine on top handles drafts, terminal-state protection, timelines, compliance
gating, and cross-user isolation — all provider-independent.

**Integration architecture (design, buildable as scaffolding now):** a
`BseStarMfInvestmentProvider` implementing the same interface, plus the operations the mock
never needed: UCC/client-master registration (maps from `investor_profiles` + compliance data),
FATCA/nominee upload, folio capture on first fill, XSIP registration for SIPs, STP/SWP order
types (not yet in the order engine — pure 🟡 schema/service work), payment initiation handoff
(§7), order-status polling with retry/backoff, transaction-history pull, and a daily
**reconciliation job** diffing internal `investment_orders`/`portfolio_holdings` against
provider records — the reconciliation framework itself is buildable against mocks today.
Exact transport (SOAP/REST endpoints, file uploads, field enums) comes **only** from official
BSE StAR MF documentation after membership — per the brief, none of it is invented here.

| Item | Status | Notes |
|---|---|---|
| Provider-independent order engine + timeline | ✅ | orderService.js + 010 migration |
| SIP mandates (create, gate on readiness) | ✅ | `sip_mandates` |
| STP / SWP order types | 🟡 | Order-engine + mock extension; provider execution later |
| Reconciliation engine (vs mock) | 🟡 | Daily diff job + break reports — M5 |
| Retry/error taxonomy per provider call | 🟡 | M5 scaffolding |
| BSE membership, API credentials, UAT access | 🔴 | Suasion commercial action (§15) |
| Live UCC/folio/purchase/redemption/XSIP | 🔴 | Written from official spec post-onboarding |

## 6. CAMS / KFintech (RTA)

**Current state.** `PortfolioProvider` abstracts holdings retrieval (mock today), and — a real
asset — **CAS import already works as a user-supplied flow**: PDF parsing, scheme matching,
transaction normalization (including STP/SWP transaction types), and XIRR-capable revaluation
live in [portfolioImport/](../frontend/app/lib/portfolioImport/) with migration 007/008. So
"portfolio retrieval without any RTA agreement" exists today via user-uploaded CAS.

**Live RTA integration (🔴):** automated reverse feeds / statement retrieval / document
retrieval from CAMS, KFintech, or MFCentral all require commercial agreements (typically
predicated on distributor/RIA status). The abstraction to slot them into is `PortfolioProvider`
plus the Document Vault for retrieved statements.

| Item | Status | Notes |
|---|---|---|
| PortfolioProvider abstraction + mock | ✅ | Journey 3 |
| CAS import (user-uploaded) + XIRR math | ✅ | portfolioImport/, 007/008 |
| RTA-independent normalization layer | ✅ | casNormalizer handles both RTAs' formats |
| Feed-ingestion + reconciliation slots | 🟡 | M5 scaffolding against mocks |
| Automated CAMS/KFintech/MFCentral feeds | 🔴 | Commercial agreements (§15) |

## 7. Payments

**Current state.** `PaymentProvider` interface + mock exist; orders reference payment status.
No gateway is hardcoded anywhere — satisfying the brief's constraint by construction.

**Design position to confirm:** for exchange-routed mutual-fund flows, payment collection and
e-mandates (NACH) typically run **through the exchange's own payment layer** rather than a
generic PSP; a separate gateway would mainly serve non-transactional payments. The abstraction
therefore stays provider-shaped: initiate → redirect/collect → webhook/callback →
reconciliation, with mandate lifecycle (register/activate/pause/cancel) modeled first-class.
The webhook-ingestion framework (signed, idempotent, replayable) is pure 🟡 engineering and is
prerequisite scaffolding for *any* real provider.

| Item | Status | Notes |
|---|---|---|
| PaymentProvider abstraction + mock | ✅ | No gateway assumptions in business logic |
| Webhook framework (signed, idempotent, stored+replayable) | 🟡 | M5 |
| Mandate lifecycle model (beyond SIP mandate row) | 🟡 | States + events + reconciliation |
| Refund/failure state machine | 🟡 | Modeled against mock first |
| Live UPI/net-banking/NACH rails | 🔴 | Follows the BSE decision + agreements (§15) |

## 8. Documents & storage

**Current state (Journey 4, live).** Canonical vault: categories/types/status/visibility,
trigger-maintained full-text search, per-document audit timeline, share/archive/download flows,
auto-generated investment confirmations on order completion, cross-user isolation. Storage refs
are provider-issued (mock) — **no real binary storage exists**, by design.

| Item | Status | Notes |
|---|---|---|
| Vault, search, timelines, auto contract notes | ✅ | documentService.js, 011 migration |
| Real object storage behind DocumentProvider | 🟡 | Vercel Blob / S3-compatible / Neon storage; presigned upload+download; only a self-serve account needed |
| Retention/expiry enforcement (`expires_at` exists) | 🟡 | Scheduled sweep |
| Advisor-visible sharing (RBAC-enforced) | 🟡 | With Journey 5 + RBAC |

## 9. Notifications

**Current state.** In-app channel is real end-to-end: `notifyUser()` writes `notifications`
rows consumed by [/invest/notifications](../frontend/app/invest/notifications). No email/SMS/
push channels, no template registry, no preferences.

| Item | Status | Notes |
|---|---|---|
| In-app notifications | ✅ | notifications.js + 010 migration + UI |
| Template registry + event→notification map + preferences | 🟡 | Journey 6 core |
| Email channel | 🟡 | Same ESP key as §2 (one key, four unlocks) |
| Push (FCM/APNs) | 🟡 | Config-only accounts; web push first |
| SMS | 🔴 | India requires TRAI **DLT registration** (entity + sender ID + approved templates) before any SMS vendor will deliver — a Suasion business action |

## 10. Reports

**Current state.** The raw materials all exist: portfolio valuation vs live NAV, transaction
history, capital-gains/tax logic (taxIntelligence from the research platform), XIRR math
(revaluation layer), structured report objects (earlier IOS phase), and a Document Vault to file
outputs into. What does not exist: statement *generators*, a PDF renderer, a download center,
and export APIs.

| Item | Status | Notes |
|---|---|---|
| Underlying analytics (valuation, gains, XIRR, tax) | ✅ | Reuse, don't rebuild |
| Statement generators (portfolio, transactions, SIP summary, holdings, capital gains FY-wise) | 🟡 | Deterministic JSON → vault |
| PDF rendering pipeline | 🟡 | Server-side (no client dependency) |
| Download center UI + export APIs | 🟡 | Vault-backed |

## 11. Security audit

Grounded in code, not aspiration — what is genuinely good, and what must change before real
money:

**Solid today:** parameterized SQL everywhere (no string-built queries found in the invest
surface); bcrypt-12 with enumeration-safe timing; reset-poisoning defense; per-route server-side
session checks (`auth()`) with public research routes deliberately public (no blanket
middleware); strict cross-user isolation proven by tests on every journey; append-only
`audit_events` wired through all invest services (Module 11); PII minimization by design
(masked PAN only, banded income); secrets only in GitHub Actions/Vercel env (a prior incident
audit confirmed no secrets in repo); honest state machines (no fake success states).

**Gaps, all 🟡 unless noted:** no rate limiting (worst on login/OTP/forgot-password); JWT
sessions until an ESP/OAuth key exists (revocation impossible today) and expiry untuned; no
MFA; no RBAC enforcement; CSRF — Auth.js covers auth routes, app POST routes rely on
SameSite cookies and should add origin verification; no CSP/security headers; no error
monitoring (Sentry-class) for the app itself (data pipeline monitoring exists); no dependency/
secret scanning in CI; XSS posture is React-default escaping — needs a one-time audit for any
raw-HTML rendering; full-PII handling policy (encryption at rest for real PAN/bank numbers, or
never-store) must be decided **before** live KYC (🔴-adjacent: policy decision).

## 12. Compliance & operational readiness (non-engineering)

Work that must happen outside the codebase before handling real customer money. **This section
lists categories, not asserted legal obligations — exact requirements must be confirmed with
BSE/AMFI/SEBI and counsel (§16).**

Commercial provider onboarding (§15) · regulatory registrations appropriate to Suasion's model
(distribution vs advisory determines direct/regular-plan flows — the platform already models
both in `investment_preferences.preferred_plan`) · security assessment/pentest by a third party
· privacy review against India's DPDP Act (consent records exist; a formal review does not) ·
terms of service + privacy policy drafting · grievance/support process (and SCORES linkage if
applicable) · operational runbooks · disaster recovery (Neon PITR exists — a documented,
*rehearsed* restore does not) · business continuity plan · incident response plan.

---

## 13. Milestone roadmap

Each milestone is shippable independently. "Dep" lists hard dependencies only.

| # | Milestone | Contents | Dep | External needs |
|---|---|---|---|---|
| M1 | **Identity & access hardening** | ESP key in env (activates reset delivery, email verification, magic-link, DB-revocable sessions); rate limiting on auth/OTP/order routes; session expiry tuning; MFA-ready schema; RBAC roles + route guards; security headers; Sentry; CI dependency+secret scanning | — | ESP account (self-serve, minutes) |
| M2 | **Onboarding & vault completion** | Real object storage behind DocumentProvider; presigned upload/download; tax-residency fields; consent versioning; profile management (view/edit/delete); retention sweep | M1 (RBAC for advisor visibility) | Storage account (self-serve) |
| M3 | **Reports & download center** | Statement generators; PDF pipeline; download center; export APIs; capital-gains FY statements; XIRR wired into invest reports | M2 (storage) | — |
| M4 | **CRM (Journey 5) + Notifications (Journey 6)** | Client lifecycle, lead conversion, advisor assignment, tasks, notes, service requests, document requests, comms history; template registry, event map, email channel, preferences, web push | M1 (RBAC, ESP) | — |
| M5 | **Live-provider scaffolding** | Env-driven provider registry; credential/config management; signed idempotent webhook framework; reconciliation engine (daily diff + break reports, proven on mocks); provider conformance test suite (run journey tests against any adapter); STP/SWP order types; retry/error taxonomy | — | — |
| M6 | **Commercial onboarding track** (business, runs in parallel with all of the above) | BSE membership + StAR MF credentials + UAT; KRA/CKYC agreements; PAN-verification vendor; bank-verification vendor; DLT registration; RTA/MFCentral agreements; payment-rails decision; legal/compliance workstream (§12) | — | **Everything in §15** |
| M7 | **BSE StAR MF live integration** | BseStarMfInvestmentProvider (UCC, folio, purchase, redemption, XSIP, status, history) from official docs; real KYC adapters; RTA feed adapter; payments via chosen rail; reconciliation live; internal pilot behind feature flag | M5 + M6 | UAT then production credentials |
| M8 | **Launch hardening** | Third-party security assessment; DR restore drill; runbooks; support/grievance process live; incident response; go-live checklist | M7 | Assessor engagement |

## 14. Recommended implementation order

**M1 → M5 → M2 → M3 → M4 → M7 → M8, with M6 started immediately and running in parallel
throughout.**

Rationale: M1 is first because it is the highest security-return-per-effort on the platform
(one env key alone activates four dormant features) and RBAC gates two later milestones. M5
comes early — before more user-facing work — because the scaffolding it builds (webhooks,
reconciliation, conformance tests) is exactly what makes M7 a bounded, low-drama integration
instead of a rewrite under pressure; it also needs zero external input, so it can absorb the
waiting time while M6's commercial lead times run. M2–M4 then deliver continuous user-visible
value on mocks in whatever order business prefers (the stated order minimizes rework: storage
before reports, RBAC before CRM). M7 begins the day BSE UAT credentials and official docs
arrive; M8 closes.

If M6 stalls entirely, M1–M5 still leave the platform materially better: hardened identity,
real documents, reports, CRM, notifications — a complete advisory/research product with
investing dormant behind flags.

## 15. Required from Suasion Securities (the external long poles)

Information and commercial actions engineering cannot do and should not guess:

1. **BSE StAR MF**: membership status (existing member code or application), API credential
   issuance, official Web Services documentation, UAT environment access. Also confirm the
   intended registration category (distributor/ARN vs advisory/RIA) — it decides
   regular-vs-direct-plan order flows.
2. **KYC**: chosen KRA and agreement status; CERSAI/CKYC registration; PAN-verification vendor;
   bank-verification (penny-drop) vendor selection and contract.
3. **Payments**: confirm whether collection + NACH mandates run through BSE's payment layer or
   a separate approved aggregator; sponsor-bank details if applicable.
4. **RTA data**: whether CAMS/KFintech/MFCentral feed agreements will be pursued (CAS upload
   already covers the interim).
5. **SMS**: TRAI DLT entity registration, sender ID, and template approvals.
6. **Legal/compliance**: counsel confirmation of the §12 checklist; T&C and privacy policy
   text; grievance process ownership; third-party security assessor.
7. **Minor self-serve accounts** (engineering can execute given a company account): email
   provider (Resend/SES), object storage, error monitoring.

## 16. What this document does not claim

Per the brief's constraints: no provider API shapes have been invented — every 🔴 adapter is
specified only as "implements the existing interface, written from official documentation after
onboarding." No regulatory obligations are asserted as fact; §12/§15 are categories to confirm
with counsel and the providers themselves. Where lead times or requirements are stated
qualitatively ("weeks-to-months"), they are planning heuristics, not commitments.
