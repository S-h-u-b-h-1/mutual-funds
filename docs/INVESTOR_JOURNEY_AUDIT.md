# MF Pulse / Suasion Securities — Investor Journey Audit

**Audit Date**: 2026-07-28  
**Scope**: Full End-to-End Investor Lifecycle

---

## Complete Investor Journey Lifecycle

```
[Register / Login]
       │
       ▼
[Investor Onboarding & Compliance]
  ├── Legal Name & DOB Verification
  ├── PAN Validation (Format & Verification)
  ├── Address & Contact Details
  ├── Bank Account Setup & Verification
  ├── Nominee Declaration
  ├── FATCA / CRS Declaration
  ├── PEP (Politically Exposed Person) Declaration
  └── Risk Profile Assessment
       │
       ▼
[Investment Readiness Evaluation] ──(State Machine: Complete / Pending / Failed)
       │
       ▼
[Portfolio Setup]
  ├── Import Existing Portfolio (CAMS / KFintech CAS PDF Upload & Parse)
  └── OR Scheme Discovery & Search by Name
       │
       ▼
[Transaction Execution]
  ├── Purchase (Lump Sum)
  ├── SIP Creation & Mandate Registration
  ├── Redemption (Holding-first validation)
  └── Switch (Same-AMC scheme exchange)
       │
       ▼
[Post-Transaction Operations]
  ├── Order Tracking & Status Reconciliation
  ├── Document Storage in Vault
  └── Notification Preferences & Audit Logs
```

---

## Onboarding Matrix & Backend Verification

| Step / Requirement | Frontend Path | Backend Endpoint | Database Persistence | Verification Status | Production Status |
|---|---|---|---|---|---|
| **Identity & DOB** | `/invest/onboarding` | `/api/v1/invest/profile` | `investor_profiles` | **VERIFIED** | Real DB / Mock Provider |
| **PAN Verification** | `/invest/compliance` | `/api/v1/invest/compliance/items/pan` | `compliance_items` | **VERIFIED** | Real DB / Mock KRA |
| **Bank Account** | `/invest/compliance` | `/api/v1/invest/compliance/items/bank` | `bank_accounts` | **VERIFIED** | Real DB / Mock PennyDrop |
| **Nominee** | `/invest/compliance` | `/api/v1/invest/compliance/items/nominee` | `nominees` | **VERIFIED** | Real DB / Persistence |
| **FATCA / CRS** | `/invest/compliance` | `/api/v1/invest/compliance/items/fatca` | `fatca_declarations` | **VERIFIED** | Real DB / Persistence |
| **PEP Declaration** | `/invest/compliance` | `/api/v1/invest/compliance/items/pep` | `pep_declarations` | **VERIFIED** | Real DB / Persistence |
| **Risk Profile** | `/invest/onboarding` | `/api/v1/invest/risk-profile` | `risk_profiles` | **VERIFIED** | Real DB / Model |
| **CAS PDF Import** | `/invest/portfolio` | `/api/v1/portfolio/upload` | `portfolios`, `holdings` | **VERIFIED** | Parser + ISIN Match |

---

## Investment Readiness State Machine

Backend investment readiness (`/api/v1/invest/account`) evaluates compliance items and returns a single authoritative status:
- **`COMPLETE`**: User is allowed to execute Purchase, SIP, Redemption, and Switch.
- **`PENDING`**: Verification in progress; transaction forms show requirement checklist.
- **`FAILED` / `MISSING`**: Blocks transaction submission and directs user to `/invest/compliance`.
