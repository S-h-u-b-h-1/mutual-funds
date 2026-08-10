# Suasion Securities — Real-Investor Launch Executive Summary

Closing deliverable for the Suasion Securities real-investor launch-path mission, written
2026-08-10. Synthesizes `docs/LAUNCH_BLOCKER_REPORT.md` (Critical/High/Medium/Low findings, all
file:line-verified against live code), `docs/ONBOARDING_READINESS_TRACE.md` (field-by-field
onboarding trace), and this pass's own direct verification of the two most severe fixes shipped
today. Written conservatively, as instructed: this is a readiness *floor*, not a percentage.

## What changed in this pass

**The single most severe finding of this mission**: `OnboardingFlow.jsx`'s account-open trigger
was gated on `stepId === "fatca"`, but `pep` is the actual last step — so the trigger's own
condition was structurally false on every real walkthrough. No investor, ever, under any normal
use of the live app, could complete onboarding and end up with an actual investment account. Fixed,
tested against real Neon (new integration test drives the real routes in the wizard's real order,
confirms the account opens exactly when compliance completes, and confirms a real order can then be
placed), deployed, and verified live (`docs/ONBOARDING_READINESS_TRACE.md` has the full trace).

A second, related dead end was found and fixed the same pass: `/portfolio`'s session-expiry
handling silently swallowed a 401 into a generic error string that never rendered, because `view`
stayed `"dashboard"` and `holdings` stayed empty — so an investor whose session expired mid-visit
saw a *false* "No saved portfolio yet." empty state, not an error, not a sign-in prompt. Fixed to
redirect to `/login?callbackUrl=/portfolio`, mirroring the already-live `/invest/*` fix (H3).

Both fixes are live in production as of this pass (commits `c516611`, `a240204`; deployed via
`production-refresh.yml`, domain re-point verified against `deployedCommitSha`).

## Executive launch-readiness table

| Capability | Status | Production verified? | Real or mock? | External dependency | Business action needed | Owner | Launch blocker? |
|---|---|---|---|---|---|---|---|
| Investor onboarding wizard (all 9 compliance steps + account open) | Functional end-to-end | Yes — real-Neon integration test + live deploy | Flow is real; verification steps behind it are mock (see below) | None for the flow itself | None | Backend (done) | No, as of this pass (was Critical until today) |
| PAN / identity (KYC) verification | Weighted-random mock (~85% verified, ~15% needs_review), unrelated to actual PAN validity | No | Mock | Real KYC/CKYC provider, BSE Star MF or equivalent membership | Obtain provider access | Business/compliance | **Yes** |
| Bank account verification | Hardcoded `'penny_drop'` literal + bare `Math.random() < 0.9`, not routed through any provider abstraction | No | Mock, and mislabeled (claims a penny-drop occurred when none did) | Real penny-drop/bank-verification provider | Obtain provider access | Business/compliance | **Yes** |
| KRA (KYC Registration Agency) | Does not exist in the codebase at all — zero tables, zero provider interface | N/A | N/A — absent | Regulatory determination: is KRA a distinct requirement for Suasion's distributor structure? | Legal/compliance ruling | Business/legal | Unresolved — flagged, not built blind (C3) |
| FATCA / CRS / PEP declarations | Structured, versioned, consent-logged | Yes | Real mechanism, self-certification by design | None for FATCA/PEP; CRS multi-jurisdiction UI missing (schema ready, no field) | Confirm field set meets real regulatory requirement (migration's own header flags this as unconfirmed) | Backend + compliance | Partial — CRS gap, not fully blocking |
| Consent ledger | Append-only, real (`consent_records`) | Yes | Real, but only ~4 of 8 checklist categories wired: investment declaration, nominee, FATCA, PEP | None | Build registration/terms UI (doesn't exist anywhere), payment/mandate consent, communication consent | Backend | No (contained gap) |
| General Terms/Privacy consent | No UI, no persistence — not even a stub | No | Absent | None (internally buildable) | Build the UI + wire to consent ledger | Backend | Should be, for any regulated platform — flagged |
| Order placement (purchase/draft) | Real order engine, idempotent (C1 idempotency resolved), real DB persistence | Yes | Flow is real; investment provider is 100% mock | BSE Star MF (or equivalent) membership | Obtain membership | Business | **Yes** |
| SIP mandate creation | Real | Yes | Flow real; provider mock | Same as above | Same as above | Business | **Yes** |
| SIP recurring installment execution | Real scheduled job (`sip-installment-run`), idempotent, tested | Yes | Real trigger logic; underlying provider mock | Same as above | Same as above | Backend (done) + Business | Partially resolved — mechanism real, execution still mock |
| SIP mandate cancellation | **Does not exist** — no cancel endpoint, no UI | No | Absent | None (internally buildable) | Build it | Backend | Real customer-facing gap, not yet built |
| Redemption / Switch | Contracts built (eligible folios, exit-load, tax messaging, lifecycle) | Yes (contract level) | Flow real; provider mock | Same as C1 | Same as C1 | Business | **Yes** (via C1) |
| Payment execution | No real payment provider anywhere | No | Mock | Licensed payment/mandate provider (NACH/UPI Autopay) | Obtain provider | Business | **Yes** |
| Payment-attempt tracking | No dedicated entity — retries overwrite the prior attempt's provider reference; idempotency key reaches providers but both mock providers ignore it entirely | No | Mock (and a real gap that will resurface with a real provider) | None to fix the entity; a real provider integration must itself honor idempotency | Build the entity before/alongside a real provider integration | Backend | Not currently blocking (mock), will be if unaddressed at real-provider integration time |
| Document generation/download (statements, confirmations) | Metadata is real; **no actual file bytes are ever produced** — download route returns JSON, not a binary | No | Mock (randomly generated file size, hardcoded mime type) | A storage decision (S3-compatible / Vercel Blob) | Choose storage, build PDF rendering | Backend | **Yes**, independent of provider licensing — buildable today (H2) |
| Notification delivery (SMS/email/push) | Preferences, scheduling, read APIs all real; all 5 channel providers mock | Partial (platform real, channels not) | Mock | Transactional email/SMS provider (e.g. Resend) | Obtain provider — cheap, fast, not licensing-gated | Business | Real gap, but low-cost fix relative to C1 (H5) |
| Existing-investor CAS import (point-in-time) | Real: upload → parse → reconcile → view report | Yes, live and tested in production | Real | None | None | Backend (done) | No |
| Existing-investor persistent, revalued portfolio | Schema exists (migration 008: import/folio/holding/valuation + reconciliation math) but **is completely unwired — zero route callers anywhere** | No | Absent as a live feature, despite the schema being built | None (internally buildable) | Wire the schema to routes (tracked separately as Persistent Portfolio Phase 2+) | Backend | Not a launch blocker for CAS-upload-and-view, but blocks ongoing portfolio tracking |
| Automated existing-portfolio discovery (CAMS/KFin/MFCentral) | Does not exist — no PAN-lookup, no RTA connectivity of any kind | No | Absent, honestly so — never faked | Provider agreement with an RTA aggregator | Commercial negotiation | Business | Design-only per this mission's scope; real gap for a "just enter your PAN" experience |
| NAV / fund data freshness | Real AMFI pipeline, daily refresh, freshness badges | Yes | Real | None | Extend `assert_pipeline_freshness.py` to check per-scheme staleness distribution, not just the aggregate max (known, scoped, not yet built) | Backend | No (data itself is real and current; the *gate* has a known blind spot) |
| Stock/company valuation freshness | `source`/`as_of_date`/`computed_at` fields real and enforced (`source not null`) | Yes (schema/enforcement level) | Real provenance; no computed freshness *badge* exists yet (M2, corrected this pass) | Real stock/company data source (separately licensing-gated) | Build the badge once real data flows regularly | Backend | No |
| Distributor attribution (ARN 289322 / EUIN E544323) | Seeded, real values, stamped on every order/SIP | Code-verified; production-application of the seed migration not re-confirmed this pass | Real | None | None | Backend | No — cleanest item in this audit |
| Session-expiry handling (`/invest/*`, `/portfolio`) | Both fixed and live this session (H3 + this pass's `/portfolio` fix) | Yes | Real | None | None | Backend (done) | No |
| Internal console route gating (`/advisor/workspace`, `/operations`, `/management`) | Fixed and live (H6) — all three 404 for any non-privileged visitor | Yes | Real | None | None | Backend (done) | No |
| Operations exception queues | Reconciliation engine exists with 4 comparator types; missing KYC/bank/payment/stuck-order/SIP-failure comparators, no severity or direct-investor column | No | Partial | None (internally buildable) | Build the missing comparators | Backend | Not launch-blocking, but a real operational gap |

## Answers to the four closing questions

**1. Can I onboard a real investor today?**
Mechanically, yes — as of this pass's fix, a real person can complete every onboarding step and
the app will now correctly open an "active" investment account record. This was **not true** before
today: the account-open trigger's condition was structurally unreachable, so 100% of real
onboarding attempts silently failed at the very last step. But every verification behind that
flow — PAN, identity/KYC, bank penny-drop — is a mock or weighted-random simulation, not a check
against any real government or banking system. So: the *application flow* now works end to end;
nothing about the investor's actual identity, PAN validity, or bank ownership has been verified by
any real authority.

**2. Can I legally/technically execute their real mutual-fund purchase today?**
No. Every investment and payment provider in the system is mock (C1). An order can be created and
will receive a simulated outcome from the mock provider, but no real money moves, no order is
transmitted to BSE Star MF or any RTA, and no real unit allotment happens. This requires BSE Star MF
(or equivalent) membership, a CAMS/KFintech/CDSL integration agreement, and a licensed
payment/mandate provider — none of which exist in this codebase or, so far as code can determine,
commercially today.

**3. Can an existing investor bring their real portfolio into MF Pulse today?**
Partially. They can upload a real CAS PDF, have it parsed and reconciled against live NAV data, and
view a real, tested, production-live analysis of it — that part works today. What does not exist:
any automated pull of their holdings from CAMS/KFintech/MFCentral (confirmed absent, not faked —
no PAN-lookup of any kind), and the deeper persistent, continuously-revalued portfolio entity
(migration 008's schema, built but unwired to any route) that would let an imported portfolio be
tracked over time rather than viewed as a point-in-time report.

**4. What exactly must Suasion Securities obtain/do before accepting the first real investment?**
- BSE Star MF (or equivalent) membership — the actual mechanism to transmit a real fund order.
- A CAMS/KFintech/CDSL integration agreement for real KYC/CKYC/folio-level RTA connectivity.
- A licensed payment/mandate provider (NACH/UPI Autopay) for real money movement.
- A legal/compliance ruling on whether KRA registration is a distinct required step for Suasion's
  distributor structure (C3) — flagged, not assumed either way.
- A storage + PDF-rendering decision so document downloads produce real files (H2) — buildable
  today, independent of the above.
- A transactional email/SMS provider for real notification delivery (H5) — cheap and fast relative
  to the items above; worth pursuing in parallel, not sequentially after them.
- Sign-off that the current FATCA/CRS/PEP field set actually satisfies the real regulatory
  requirement — the migration's own header already flags this as engineering-sound but
  regulatorily unconfirmed.
- A decision on general Terms/Privacy consent UI, which does not exist anywhere in registration
  today — unrelated to C1, a real gap for any regulated platform.

None of the above can be completed by engineering alone; each is either a commercial agreement, a
regulatory determination, or a provider credential — consistent with this mission's own stop
conditions.
