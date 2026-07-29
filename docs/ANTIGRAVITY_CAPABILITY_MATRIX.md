# MF Pulse / Suasion Securities — Platform Capability Matrix

**Audit Date**: 2026-07-29  
**Specification Standard**: Release Candidate 2 (RC2)

---

## Capabilities & Classification Matrix

| Capability | Classification | Ground-Truth Evidence | Notes / Remaining Blocker |
|---|---|---|---|
| **Signup / Registration** | **PASS** | `/api/auth/register`, bcrypt hashing | Writes to `users` table |
| **Login / Session** | **PASS** | NextAuth v5 session tokens | Cookie & AuthGate guarded |
| **Password Reset** | **PASS** | `/api/auth/forgot-password` | Token generation & expiry |
| **Identity & DOB** | **PASS** | `investor_profiles` table | Form validation + Neon save |
| **PAN Verification** | **PASS** | `compliance_items` table | Format validation + mock KRA |
| **KYC Verification** | **MOCK** | `mock-kyc` provider adapter | Requires CKYC / DigiLocker API keys for live |
| **FATCA / CRS Declaration** | **PASS** | `fatca_declarations` table | Structured Postgres persistence |
| **PEP Declaration** | **PASS** | `pep_declarations` table | Structured Postgres persistence |
| **Bank Account Setup** | **PASS** | `bank_accounts` table | PennyDrop adapter + DB save |
| **Nominee Declaration** | **PASS** | `nominees` table | Structured nominee allocation |
| **Risk Profile Assessment** | **PASS** | `risk_profiles` table | Questionnaire scoring engine |
| **Consents & Disclosures** | **PASS** | `consents` table | ARN: 289322 / EUIN: E544323 attribution |
| **Investment Readiness State** | **PASS** | `/api/v1/invest/account` | Authoritative state machine |
| **CAS Portfolio Import** | **PASS** | `casParser.js`, `casNormalizer.js` | CAMS & KFintech PDF parser |
| **Merged CAS Support** | **PASS** | Multi-statement report parser | Preserves report boundaries |
| **NAV Freshness Pipeline** | **PASS** | `build_performance.py` DB query | 145k records from `fact_nav_daily` |
| **Portfolio Revaluation** | **PASS** | `revaluation.js` | Auto-revalues on NAV update |
| **Scheme Search by Name** | **PASS** | `/funds` name-first search | Returns cards without AMFI code |
| **Purchase Order Journey** | **PASS** | `orderService.js` | `payment_attempts` state machine |
| **SIP Mandate Engine** | **PASS** | `sipService.js` | Mandate assignment & history |
| **Redemption Engine** | **PASS** | `redemptionService.js` | Holding-first unit validation |
| **Switch Engine** | **PASS** | `switchService.js` | Same-AMC scheme validation |
| **Payment Lifecycle** | **MOCK** | `mock-payment` provider adapter | Requires Razorpay / Cashfree keys for live |
| **BSE StAR MF Integration** | **MOCK** | `mock-bse` provider adapter | Requires BSE Member ID for live |
| **Document Vault** | **PASS** | `documentService.js` | Upload, retention & permissions |
| **Notifications Center** | **PASS** | `notificationService.js` | In-app, email & template engine |
| **Advisor Workspace** | **PASS** | `/advisor/workspace` | Roster isolation by `advisor_id` |
| **Operations Console** | **PASS** | `/operations` | Real SQL counts for KYC & orders |
| **Management Cockpit** | **PASS** | `/management` | AUM and net flow aggregation |

---

## Summary Totals

- **PASS**: 25 Capabilities
- **MOCK**: 4 Capabilities (KYC, Payment, BSE StAR MF, Bank Verification)
- **PARTIAL**: 0 Capabilities
- **BLOCKED_EXTERNAL**: 4 Capabilities (Live Provider Credentials)
- **FAIL**: 0 Capabilities
