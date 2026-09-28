# MF Pulse schema drift and release prerequisites

Captured 8 September 2026 using live information_schema/pg_constraint checks. Production branch: br-raspy-glitter-atut1ur7. Test branch: br-weathered-star-atigraez. Project: super-surf-43536488. No credential or user records are included.

## Result

**Update at 13:03:48 UTC:** after explicit user approval and fresh preflight, only 029–032 and 034 were applied transactionally. The immediate post-commit schema/integrity gate passed. The initial rejected attempt below remains historical context, not the current migration status. See `APPROVED_RELEASE_ACTIONS_2026-09-08.md` for exact checksums, unchanged row fingerprints/counts and the newly discovered credential-isolation release blocker.

Required now: 029 (transaction text/balance), 030 (unresolved holdings), 031 (transaction fingerprint constraint), 032 (statement valuation provenance), 034 (compliance storage and nominee/provider fields). Runtime CAS/onboarding/portfolio code already references these structures. Tests alone could not detect production drift because their branch contains them.

Migration 008's separate persistent-portfolio model is present on test but not used by the current application runtime; the current adapter uses existing plural portfolio_holdings/portfolio_transactions. It was reviewed but not applied merely for cosmetic parity. Account-lifecycle structures from the parked 024 change exist on test; the 024 file is absent from this repository branch and no current runtime references were found. Do not fabricate the missing migration history.

## Historical pre-migration column differences: present on test, absent on production

| Table | Missing production columns |
| --- | --- |
| account_lifecycle_events | created_at, detail, event, id, user_id |
| consent_records | consent_type, correlation_id, created_at, document_ref, id, source, status, user_id, version |
| fatca_declarations | additional_tax_residencies, country_of_birth, created_at, declared_at, id, is_us_citizen, is_us_person, place_of_birth, status, tax_residency_country, tin, tin_type, user_id, version |
| investment_accounts | failure_reason, provider, provider_client_reference, verified_at |
| investor_profiles | phone_number |
| nominees | sequence |
| pep_declarations | created_at, declared, declared_at, id, review_notes, reviewed_at, reviewed_by, status, user_id |
| portfolio | id |
| portfolio_folio | amc, created_at, folio_last4, folio_number_encrypted, folio_number_iv, folio_number_token, id, portfolio_id, registrar, status, user_id |
| portfolio_holding | active, average_cost, canonical_scheme_code, created_at, demat, first_seen_at, folio_id, id, import_id, invested_value, isin, last_seen_at, match_confidence, match_method, option, plan, portfolio_id, reconciliation_delta, reconciliation_status, source_scheme_name, statement_market_value, statement_nav, statement_nav_date, unit_balance, user_id |
| portfolio_holding_valuation | computed_at, gain_loss, holding_id, id, market_value, nav, nav_date, source, unit_balance, user_id |
| portfolio_holdings | statement_nav, statement_nav_date, statement_value |
| portfolio_import | approved_at, cancelled_at, checksum, created_at, declared_cost_value_total, declared_market_value_total, draft_holdings, draft_transactions, draft_warnings, id, original_file_retention_status, parse_version, portfolio_id, provider, reconciliation_cost_delta, reconciliation_cost_status, reconciliation_market_value_delta, reconciliation_market_value_status, reconciliation_status, source_type, statement_date, status, upload_id, user_id, warning_count |
| portfolio_snapshots | absolute_gain, absolute_return_pct, computed_by, latest_nav_coverage_pct, methodology_version, stale_holding_count, total_invested_value, xirr |
| portfolio_transactions | description, folio_id, portfolio_import_id, unit_balance |
| portfolio_unresolved_holdings | ambiguity_candidates, created_at, folio_number, id, isin, market_value_reported, purchase_value, raw_scheme_name, resolution_reason, resolution_status, resolved_at, source, status, units, upload_id, user_id |
| users | deactivated_at, deleted_at |

No production-only column was found in this comparison. Column parity does not prove default/constraint/index/RLS/function parity. The baseline marker hashes definitions to support future comparisons, but no clean replay/restore proof was completed.

## Initial constraint preflight (rechecked under lock before application)

Production has no portfolio_transactions_fingerprint_unique constraint. Zero duplicate natural-key groups were found on user_id, scheme_code, folio_number, transaction_date, transaction_type, amount, units, nav_value. The unique key permits SQL-null distinctions; exact-file advisory locking remains important. Zero duplicate nominee user groups were found before adding sequence default 1 and unique(user_id, sequence).

Observed counts: 33 users; 28 holdings; 44 uploads; 6 transactions; 7 nominees; 18 investment accounts; 19 investor profiles. No waiting locks. These are preflight observations, not authorization to skip a final recheck.

## Exact approved and subsequently applied file checksums

| File | SHA-256 |
| --- | --- |
| 029_cas_transaction_description.sql | 70b0a2431d60bf010d377cafc87aa9cfd298f26bd21a4dc96887325b6419317b |
| 030_unresolved_holdings.sql | 8c405c813b2863098c00b4cf393531fea7d33884cc75af363ad1e22b91aa075e |
| 031_transaction_idempotency.sql | 081606e4aeb440b6a89bd352d2b154f9e377aee2c3dce9bceadd659b6fc9dc7b |
| 032_holdings_statement_valuation.sql | d6e42219a49dc28df207f87cb9af8e2789f6cba36d36583c131b05ae7a68d7d2 |
| 034_compliance_model_hardening.sql | 95b40330a2501ed64e7b925e6e6956c1087cd7d161f0373b31ab387221482521 |

Use a real SQL parser when splitting these files: comments contain apostrophes and semicolons. Do not split on semicolons or strip only whole-line comments. Execute the complete reviewed statements and ledger insert in one transaction with a short lock timeout. Record each exact file only when actually applied; do not copy the test ledger into production.

## Applied during remediation

040_research_remediation.sql is recorded on both branches with SHA-256 c8bc625d774f5fd7e95f88a0bf9bcc8821579c89610c92a38c1de0f44f696e6b. It creates newsletter_subscriptions and schema_baselines. The latter column is schema_checksum, not checksum. PUBLIC privileges are revoked.

Before approval, the production ledger contained only 022, 033, 035, 036, 037, 038, 040. The approved transaction added only the five genuinely applied 029–032 and 034 entries with their exact file checksums. Earlier objects can exist without corresponding ledger entries; absence of an entry is not evidence that blindly replaying every old migration is safe. The production-remediation-2026-09-08 baseline marker deliberately records observed schema rather than invented past execution.

## Required verification after approval

1. Recheck collisions, target branch, recent writes and locks.
2. Apply only verified missing prerequisites; write exact checksums and notes atomically.
3. Run scripts.check_release_schema read-only on production, then the isolated integration suite.
4. Compare the four core user-domain counts and FK integrity; investigate any unexpected loss.
5. Capture a new post-migration baseline marker without overwriting the original.
6. Verify authenticated upload/onboarding/portfolio paths against the released app using approved isolated test access, never broad production test-user seeding.
7. Complete a supported clean-schema replay and restore exercise before claiming disaster-recovery readiness.
