# Onboarding Readiness Trace — Suasion Real-Investor Launch Path

Field-by-field audit of the investor onboarding/compliance pipeline: frontend input →
validation → persistence → audit trail → readiness calculation → downstream investment usage.
Written 2026-08-10 as part of the Suasion Securities real-investor launch-path mission. Every
row below was verified against current code, not against prior docs — file:line citations are in
the underlying audit; this doc records the verdicts and what changed as a result.

## Headline finding (fixed this pass)

**No real investor could reach `investment_ready = true` through the live app, at all, under any
normal walkthrough — unconditionally, not an edge case.** `OnboardingFlow.jsx` only ever opened
an investment account from inside the `fatca` step's own submit handler
(`if (stepId === "fatca" && result.overallStatus === "completed")`). Since `pep` is the last step
in the wizard's fixed order, `overallStatus` can never actually be `"completed"` at the moment
`fatca` is submitted — it only reaches `"completed"` when `pep` is submitted, by which point
`stepId` is `"pep"`, not `"fatca"`, so the condition was always false on every real walkthrough.
A user who completed every step exactly as presented saw "Saved securely" and a dashboard that
flipped to "ready" (itself misleading — driven only by compliance status, not account existence),
then hit a raw, unactionable `"An active investment account is required before placing an order."`
error the first time they tried to buy a fund, with no button, link, or guidance anywhere in the
app to recover. The only escape was to manually revisit and resubmit an already-completed step,
which nothing in the UI prompts anyone to do.

This was invisible to the existing test suite: `journey1-onboarding.e2e.test.js` and the
`makeInvestmentReadyUser` test helper both call the account-opening service function directly,
independent of and before any compliance submission — proving the service layer works without
ever exercising the UI's actual trigger logic. Structurally the same failure shape as the earlier
PEP-array bug (docs/tests assumed wiring the UI never had) — except that bug blocked only
PEP-decliners; this one blocked everyone.

**Fix**: `OnboardingFlow.jsx`'s trigger now fires on `result.overallStatus === "completed"`
unconditionally, after any step's submission — not gated to one hardcoded step name. Safe to call
even when already complete (e.g. revisiting a finished step): `identityService.ensureAccount()` is
genuinely idempotent (checks for an existing account first, backstopped by a unique-constraint
race handler). Verified via a new real-Neon integration test
(`frontend/app/api/v1/invest/onboardingAccountTrigger.e2e.test.js`) that drives the real compliance
routes in the wizard's exact order and empirically confirms: `overallStatus` stays non-`completed`
through all nine prior steps including `fatca`, flips to `completed` exactly at `pep`, no account
exists before that point, opening it succeeds, and the investor can immediately place a real (mock)
order — the full chain, not just the trigger condition in isolation.

## Field-by-field verdicts

| Field | Required (gates readiness)? | Collected? | Server-validated? | Persisted? | Audited? | Provider-verified? | Used by investment gate? | Production-ready? |
|---|---|---|---|---|---|---|---|---|
| Account creation | yes | yes | email regex + 8-char password; `name` optional despite client `required` | `users` | yes (`sign_up`) | N/A | — | Was NO (account-open bug); **fixed this pass** |
| Email verification | yes | **partial — no email-address input in the step at all** | literal `"123456"` match only | compliance-item status only; no `users.email_verified` write | yes | **NO — no OTP ever sent, no provider call** | yes | NO — structurally hollow |
| Mobile verification | yes | yes (phone + OTP) | real format check (7–15 digits) | `investor_profiles.phone_number` | yes | mock OTP only | yes | Mock-sound (real number required before the check runs) |
| PAN | yes | yes (client `required`) | **NO — zero format/presence check server-side** | only if truthy and not provider-rejected | yes | mock, weighted-random, unrelated to actual PAN validity | yes | NO — same "verified with nothing real behind it" class as pre-fix mobile/PEP |
| Date of birth | **NO — not in ITEM_KEYS, absent from readiness entirely** | yes | NO format/plausibility/age check | `investor_profiles.date_of_birth` | yes (generic) | N/A | **NO — flag** | NO |
| Name | cosmetically yes, server-optional | yes, signup only | length cap only | `users.name` | yes | **NO — never cross-checked against PAN/bank/nominee name anywhere** | NO | NO |
| Address | **NO — ungated like DOB** | **partial — city/state/pincode only; `address_line1`/`address_line2` columns exist with zero UI/API path to ever populate them** | no pincode/format check | partial | yes (generic) | N/A | **NO — flag** | NO |
| KYC status (`identity` item) | yes | yes (PAN re-entry + consent) | only consent-token presence enforced | `compliance_items` | yes | mock/weighted-random | yes | NO — explicitly mock |
| KRA status | unresolved | NO | N/A | **NO — zero kra_* tables/columns anywhere** | N/A | NO — no provider interface exists | NO, doesn't exist | NO — genuine absence; C3 in Launch Blocker Report, needs regulatory determination |
| CKYC | yes, folded into `identity` | implicit via PAN | mock weighted 80/15/5 regardless of PAN validity | **NOT durably — used transiently then discarded, no `ckyc_number`/`ckyc_status` column anywhere** | indirect only | mock only | yes, folded in | NO |
| FATCA declaration | yes | yes (country + 2 checkboxes) | `declared` must be literal `true`; US-person always routes to `needs_review` | `fatca_declarations`, versioned | yes + `recordConsent` | N/A, self-certification by design | yes | Partial — engineering-sound; migration's own header flags the field set as regulatorily unconfirmed |
| CRS | nominally yes, bundled under FATCA | **NO — `additional_tax_residencies` column exists, zero UI field for it** | N/A | column exists, always null in practice | N/A | N/A | **NO — flag: a multi-tax-residency investor cannot declare that fact anywhere** | NO |
| Tax residency (primary) | yes, `NOT NULL` | yes | format-only, 2-letter regex not a real ISO-3166 list | `fatca_declarations.tax_residency_country` | yes | NO | yes | Partial |
| PEP declaration | yes | yes (radio, required) | must be explicit boolean | `pep_declarations` | yes + `recordConsent` | N/A by design, deliberate | yes | **Yes for what it claims to be** — the earlier session's fix; the wizard's sequencing around it was the remaining bug, now fixed |
| Occupation | **NO — ungated** | yes | NO enum/non-empty enforcement | `investor_profiles.occupation` | yes (generic) | N/A | **NO — flag, AML/risk-relevant field with zero gate** | NO |
| Income range | **NO — ungated** | yes (banded select) | NO — accepts any string, not checked against the frontend's own enum | `investor_profiles.annual_income_band` | yes (generic) | N/A | **NO — flag** | NO |
| Nominee | yes | yes, but **UI only supports one nominee** (hardcoded `allocationPct:100`) though the backend supports multi-nominee via `sequence` | name/relationship presence + allocation bounds | `nominees`, upsert-by-sequence (no duplication on resubmit) | yes + `recordConsent` | N/A — self-declared is correct, no real registry exists | yes | Yes for single-nominee; multi-nominee is schema-ready, UI-absent |
| Bank account number | yes | yes | presence only, no format/checksum | masked, `bank_accounts.account_number_masked` | yes | NO — see verification method row | yes; re-checked live at order-submit time | NO |
| IFSC | yes | yes | **presence only — no format regex** (real IFSC is 11 chars, structured) | plaintext, unmasked | yes | NO | yes, bundled | NO |
| Account holder name match | implied by the field label | yes | **presence only — never compared against `users.name` or any KYC record, zero matching logic exists** | verbatim string | yes (bundled) | NO | yes (bundled) | NO — exactly the bug class this audit hunted: reads as verified, nothing checks it |
| Bank verification method | yes | N/A, backend outcome | N/A | **hardcoded literal `'penny_drop'` written regardless of what actually happened** | yes (status only) | **NO — not even routed through the mock-provider abstraction; `Math.random() < 0.9` bare coin-flip, no provider call at all** | yes | NO, and mislabeled — claims a penny-drop occurred when none did, even in mock form |
| General consent/terms acceptance | arguably should be, for any regulated platform | **NO — no ToS/Privacy checkbox exists anywhere in registration or onboarding** | N/A | **NO — `consent_type` lists `'terms'/'privacy'` as schema examples; grep confirms neither is ever actually written** | N/A | N/A | NO | NO — entirely unimplemented, not even a UI stub |
| Distributor attribution (ARN 289322 / EUIN E544323) | yes, for any real order | N/A, firm-level config | N/A | seeded with the real values, confirmed not placeholders | yes, on every order/mandate | N/A, internal config | yes, stamped on every order/SIP | **Yes — the one field in this audit with no gap found.** (Could not re-confirm the seed migration was actually *applied* to the production branch this pass — code-level confirmation only.) |

## Consent ledger (mission section 4)

A real append-only ledger exists (`consent_records`: `user_id, consent_type, version, status,
source, document_ref, correlation_id, created_at`), written via `recordConsent()`. But only 4 of
the ~8 checklist categories actually call it: **investment_declaration** (identity step),
**nominee_declaration**, **fatca_declaration**, **pep_declaration**. Not covered: registration/
terms (no UI field exists to consent to in the first place), mobile/email/PAN/bank verification,
payment/mandate/transaction authorization (`'transaction_authorization'` is a comment-listed
example type, never actually written), communication preferences (same — comment-only, unwritten).
The mechanism is sound; its coverage is roughly half of what a full regulated-platform audit trail
would need.

## Payment attempt entity (mission section 5)

No `payment_attempts` table exists — payment state lives only as columns on
`investment_orders`/`sip_mandates`. `retryOrder()` never re-calls the payment provider (so a retry
can't double-charge), but it does re-call the investment provider and overwrites
`provider_order_id`/`submitted_at` in place — the prior attempt's provider reference is lost, and
`order_status_history` logs status transitions, not per-attempt provider references. The
`idempotencyKey: order.id` now reaches both provider calls, but both mock providers **ignore it
entirely**, generating a fresh reference and a fresh random outcome on every call regardless of the
key. `docs/PROVIDER_METADATA.md` already names this gap explicitly. Net: C1's idempotency prevents
duplicate order *rows*, but nothing records or proves how many times the investment provider was
actually asked to place a given order across retries.

## What this doc deliberately does not resolve

KRA's regulatory status (C3), CRS multi-jurisdiction UI collection, general terms/consent UI, and
the payment-attempt entity are all real, confirmed gaps — tracked here and in
`docs/LAUNCH_BLOCKER_REPORT.md`, not fixed in this pass. This doc's scope was tracing and fixing
the one gap that blocked 100% of onboarding outright; the rest are real but narrower, and are
sequenced by severity in the Launch Blocker Report.
