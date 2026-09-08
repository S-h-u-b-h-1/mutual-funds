# Approved release actions — 8 September 2026

## Outcome

Only production Neon migrations **029, 030, 031, 032 and 034** were applied at **13:03:48 UTC** to project `super-surf-43536488`, production branch `br-raspy-glitter-atut1ur7`. The immediate, separate read-only post-commit schema/referential-integrity gate passed.

**Credential isolation failed. No GitHub secret was uploaded and no application was deployed or promoted.** The existing `TEST_DATABASE_URL` points to the test endpoint, but its username/password also authenticated successfully against the verified production endpoint. Authentication only was tested; no production user-data query was executed through that credential. The credential value was not printed or recorded.

The previous test suite ran against the isolated test endpoint with a production-host guard. That guards configuration mistakes; it does not prove the credential itself cannot authenticate to production. This distinction corrects the earlier assumption of credential isolation.

## Verified migration inputs

| File | SHA-256 |
| --- | --- |
| 029_cas_transaction_description.sql | 70b0a2431d60bf010d377cafc87aa9cfd298f26bd21a4dc96887325b6419317b |
| 030_unresolved_holdings.sql | 8c405c813b2863098c00b4cf393531fea7d33884cc75af363ad1e22b91aa075e |
| 031_transaction_idempotency.sql | 081606e4aeb440b6a89bd352d2b154f9e377aee2c3dce9bceadd659b6fc9dc7b |
| 032_holdings_statement_valuation.sql | d6e42219a49dc28df207f87cb9af8e2789f6cba36d36583c131b05ae7a68d7d2 |
| 034_compliance_model_hardening.sql | 95b40330a2501ed64e7b925e6e6956c1087cd7d161f0373b31ab387221482521 |

All five files were reread and rehashed before execution. Statements were parsed with sqlparse 0.5.5 after comment removal; no entire-directory migration runner was used. No historical migration ledger was copied or backfilled.

## Transaction safeguards and preflight

- Verified production branch `ready`, `protected=true`; test branch `br-weathered-star-atigraez` is distinct and ready.
- All requested target additions and ledger entries were absent before execution.
- Zero transaction natural-key collision groups; zero duplicate nominee user groups.
- Zero waiting locks and zero unvalidated foreign keys in the preflight snapshot.
- `lock_timeout=5s`, `statement_timeout=60s`, `idle_in_transaction_session_timeout=30s`.
- Transaction-scoped advisory lock; explicit locks on affected tables; collision/schema/orphan checks repeated under lock before DDL.
- Temporary, transaction-local fingerprints for users, uploads, holdings, transactions, nominees, investor profiles and investment accounts. Post-DDL comparison excluded only newly added columns, preserving checks of every pre-existing row field. Any mismatch would raise and roll back the transaction.
- Exact migration checksum ledger inserts were in the same transaction as the corresponding DDL. Five entries committed, all with the timestamp above and `applied_by=codex-approved-remediation`.
- No historical rows were deleted, deduplicated, backfilled or directly rewritten. Only approved additive schema changes and migration-ledger inserts were persisted; temporary guards dropped on commit.

## Immediate read-only post-commit gate

The independent post-commit query used the required-column set in `scripts/check_release_schema.py`, checked the fingerprint constraint and nominee index, and checked six user-domain relationships and foreign-key validation state.

| Check | Result |
| --- | --- |
| Missing required columns | 0 |
| Transaction fingerprint unique constraint | Present and validated |
| Nominee slot unique index | Present, unique and valid |
| Orphan holdings / uploads / transactions / nominees / accounts / profiles | 0 / 0 / 0 / 0 / 0 / 0 |
| Unvalidated foreign keys | 0 |
| Newly applied ledger checksums | All five match approved files |
| Historical row fingerprint comparison inside transaction | Unchanged for all seven guarded tables |

| Core table | Before | After |
| --- | ---: | ---: |
| Users | 33 | 33 |
| Holdings | 28 | 28 |
| Uploads | 44 | 44 |
| Transactions | 6 | 6 |
| Nominees | 7 | 7 |
| Investment accounts | 18 | 18 |
| Investor profiles | 19 | 19 |

This verifies the scoped application prerequisites and checks above, not complete historical schema parity or backup recovery readiness.

## Secret-store status and release hold

Read-only GitHub secret-name inventory confirmed `TEST_DATABASE_URL` is absent in both `S-h-u-b-h-1/mutual-funds` and `S-h-u-b-h-1/MF-Pulse`. No secret-store mutation was attempted after the isolation failure. Existing production secrets were left unchanged.

Neon documents that ordinary child branches can inherit parent-role passwords, and new passwords are generated when a child is created from an already protected parent. Protecting production later is not evidence that an older test credential is isolated. The observed authentication results, not documentation alone, establish this failure. Reference: [Neon protected branches](https://neon.com/docs/guides/protected-branches).

Requested additional approval: create a new CI-only role on the test branch, grant only privileges required by the integration suite, confirm its credential is rejected by production, then store that new credential in the two approved repositories. Do not silently substitute a new credential or rotate a production role.

Application code remains uncommitted on `codex/mf-pulse-remediation-2026-09-08`. Prior local results remain 858 frontend tests, 179 Python tests, 42 browser checks and 11 independent AMFI comparisons passing. They were not rerun after this approval checkpoint, and are not claimed as a newly verified immutable release state. Resume repository reconciliation, exact-state release gates and candidate deployment only after credential separation is resolved. Real-money functionality remains prohibited; demo/sandbox boundaries must remain.
