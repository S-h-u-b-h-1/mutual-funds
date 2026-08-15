# Mutual-fund execution compliance and activation

**Last reviewed:** 15 August 2026
**Current production state:** live transaction execution is locked.

This document is an operational implementation checklist. It is not legal advice and does not
replace written approval from AMFI, the chosen transaction platform, participating AMCs, payment
and KYC partners, or qualified legal/compliance professionals.

## 1. Product route: Regular plans through ARN/EUIN

MF Pulse's intended distributor route is limited to **Regular plans**:

- Distributor: Suasion Securities
- ARN recorded in the database: `289322`
- Default EUIN recorded in the database: `E544323`
- ARN validity date: not yet recorded; therefore the production gate treats it as unverified

An ARN/EUIN is transaction attribution, not a complete online-execution licence. It does not by
itself provide an order rail, KYC access, payment collection, AMC empanelment, two-factor
authentication, settlement, reconciliation, or investor grievance operations.

Direct plans are not routed through this ARN. A platform facilitating Direct-plan transactions
must use an eligible direct channel or the applicable SEBI Execution Only Platform framework.
MF Pulse must not silently relabel a Direct plan as Regular or claim distributor commission on it.

## 2. Hard production gate

The application exposes two independent readiness layers:

1. **Investor readiness:** identity, PAN/KYC, FATCA/CRS, PEP declaration, verified bank, nominee,
   risk profile and active account.
2. **Platform execution readiness:** the controls below.

Both layers must be complete at the moment of submission. In production, the backend blocks
purchase submission, order retry, redemption, switch and SIP mandate creation unless every
platform control is verified and `INVESTMENT_EXECUTION_ENABLED=true`.

Mock providers can be used in development and testing only. Production mock orders cannot
auto-progress into fabricated allotments or completed settlements.

## 3. Required controls and retained evidence

| Control | Evidence to retain before activation |
|---|---|
| Current ARN | Current AMFI record/certificate and exact validity date recorded in `arn_valid_until` |
| Current EUIN | Current EUIN record and mapping to the person responsible for each transaction |
| Annual DSC | Applicable AMFI Declaration of Self Certification acknowledgement |
| AMC empanelment | Current empanelment evidence for every AMC whose Regular plans are offered |
| Approved order rail | Signed BSE StAR MF, MFU or AMC/RTA agreement; member identifiers; UAT and production approval |
| KYC/AML production rail | Contract and credentials for permitted KYC/KRA/CKYC verification, FATCA/CRS and AML/manual review |
| Payment without pooling | Approved investor-to-clearing/AMC collection mechanism, verified bank ownership and webhook/reconciliation evidence |
| Transaction 2FA | Provider-approved two-factor authentication for applicable subscriptions/redemptions and mandate registration |
| Plan routing | Server-side Regular-plan allow-list for ARN orders; Direct plans blocked from the distributor route |
| Disclosures and consent | Versioned scheme/plan/option, risk-o-meter, load, TER/commission/conflict disclosures and investor consent evidence |
| Governance | Grievance and escalation process, privacy/security review, access controls, incident response and record retention |

Environment flags are attestations, not feature-development switches. A flag may be changed to
`true` only after its evidence is reviewed and the corresponding provider is genuinely registered
in `production` mode. Credentials must stay in the secret manager, never in source control.

## 4. Activation sequence

1. Confirm the legal entity/distributor record, current ARN validity date, EUIN status and DSC.
2. Complete AMC empanelment for the exact Regular-plan catalogue that will be offered.
3. Select BSE StAR MF, MFU or an approved AMC/RTA route; sign agreements; obtain UAT and
   production credentials; implement idempotent APIs and authenticated webhooks.
4. Contract and integrate approved KYC/KRA/CKYC, bank-verification and AML operations.
5. Contract and integrate an approved non-pooling payment/mandate rail with daily reconciliation.
6. Implement provider-approved 2FA and preserve the authorization evidence with the order.
7. Complete scheme disclosures, consent versioning, grievance, privacy, security and operational
   runbooks; perform an independent compliance review.
8. Run end-to-end UAT for success, failure, timeout, duplicate, cancellation, reversal,
   allotment, redemption payout and reconciliation cases.
9. Mark individual attestations true only after evidence review. Enable the final execution flag
   last, with rollback and monitoring ready.

## 5. Official sources used by the product checklist

- [AMFI distributor registration, ARN/EUIN and Code of Conduct](https://www.amfiindia.com/distributor)
- [AMFI ARN/EUIN, KYC and annual DSC forms](https://www.amfiindia.com/distributor-quick-access/downloads)
- [SEBI Master Circular for Mutual Funds, 20 March 2026](https://www.sebi.gov.in/sebi_data/attachdocs/mar-2026/1774024028162.pdf)
- [SEBI Execution Only Platform framework for Direct plans](https://www.sebi.gov.in/legal/circulars/jun-2023/regulatory-framework-for-execution-only-platforms-for-facilitating-transactions-in-direct-plans-of-schemes-of-mutual-funds_72479.html)
- [SEBI two-factor authentication circular](https://www.sebi.gov.in/legal/circulars/sep-2022/two-factor-authentication-for-transactions-in-units-of-mutual-funds_63557.html)
- [SEBI discontinuation of pooling of client funds and units](https://www.sebi.gov.in/web/?file=%2Fsebi_data%2Fattachdocs%2Foct-2021%2F1633347821555.pdf)
- [BSE StAR MF distributor registration FAQ](https://www.bseindia.com/downloads1/MFD%20Registration%20FAQs.pdf)

## 6. Information still required from Suasion

- ARN validity date and current AMFI evidence
- Current EUIN evidence and the responsible-person/adviser mapping policy
- Latest DSC acknowledgement
- AMC empanelment list and documentary evidence
- Chosen order platform, signed agreement, member code, UAT approval and production credentials
- KYC/KRA/CKYC and payment/mandate partner agreements and production credentials
- Approved disclosure, privacy, grievance, record-retention and information-security policies
- Named compliance owner and final launch sign-off
