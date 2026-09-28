# Isolated CI credential and release gates — 8 September 2026

## Credential setup: complete; application deployment: held

The newly approved CI role is `mf_pulse_ci_20260908`. Its fresh, randomly generated password was created only on the isolated Neon test branch. No production credential was changed or reused. The old local test credential, which can authenticate to production, was **not** uploaded.

Approved target: project `super-surf-43536488`, branch `br-weathered-star-atigraez`, endpoint `ep-bitter-union-atj8og0c`, database `neondb`. Production is the distinct branch `br-raspy-glitter-atut1ur7`.

The role has no superuser, CREATEDB, CREATEROLE, replication, BYPASSRLS, role memberships, database/table ownership, or public-schema CREATE permission. Grants are restricted to the operation-specific tables in `scripts/ci_database_privileges.json`, plus CONNECT, public-schema USAGE and USAGE on sequences attached to INSERT targets. No default future-object grants were added. Existing migration tests inspect schema; no DDL or ownership privilege is required.

## Isolation and encrypted storage evidence

- A native identity query inside the new role's test connection matched all five approved identity fields.
- A transaction containing test INSERT, SELECT, UPDATE and DELETE operations passed and was rolled back.
- Live role attributes and memberships confirmed the privilege restrictions above.
- Authentication against the verified production endpoint using the **new** CI credential was rejected with PostgreSQL SQLSTATE `28P01`, including the repeat immediately before upload. No production user-data query was executed with that credential. A separate production metadata check confirmed that this role does not exist there.
- GitHub encrypted Actions secret `TEST_DATABASE_URL` was stored in `S-h-u-b-h-1/mutual-funds` at **13:43:46 UTC** and `S-h-u-b-h-1/MF-Pulse` at **13:43:47 UTC**. Secret-name/timestamp inventory verified storage without retrieving values. Existing production secrets were unchanged.
- No credential was printed, committed or written to an output file. The provisioning process retained it in memory for local verification and supplied it to the GitHub client through standard input. The encrypted URL requires full TLS certificate and hostname verification.

## Fail-closed CI controls

Node and Python check both URL configuration and native connected identity before test fixtures or cleanup. The required identity includes project, branch, endpoint, database and CI role. Missing/mismatched values stop the suite. Python repeats the check on guarded database connections; the authenticated browser test verifies it before creating its disposable fixture.

CI supplies both database environment variables only from `TEST_DATABASE_URL`. It does not reference the production database secret. Workflow commands never interpolate a connection string into command text or echo it. Python on Ubuntu uses `/etc/ssl/certs/ca-certificates.crt` explicitly: bundled libpq's default/system trust path failed on the hosted runner, whereas the explicit operating-system CA bundle succeeded without weakening TLS. Error diagnostics use fixed safe categories, never raw driver messages.

The inherited workflow also contained the production Supabase public URL/anonymous key for builds and browsers. This was removed in `0f5d59b`: CI now points the optional public mirror to an unconfigured loopback endpoint, with a dummy key. This verifies explicit unavailable-source states without production mirror reads or analytics writes. New workflow tests refuse restoration of production secret fallbacks or per-job mirror overrides. Earlier build/browser attempts are **not** evidence of zero production-mirror access; the then-running browser job was cancelled when this dependency was identified. No production database admin credential was supplied to those jobs, and the new CI Neon credential remained isolated. Full live-source integration is a separate read-only audit, not claimed by the unavailable-mirror browser gate.

Browser checks wait for the Python, build and frontend integration gates to prevent overlapping writes to the shared test database. The two repository runs are executed sequentially for the same reason. Automatic Vercel deployment is disabled for the remediation branch. No main-branch push, merge, application deployment or promotion is authorized by successful credential setup alone.

## Execution record

- New-role local checkpoint: read-only schema gate passed; 191 Python tests passed. The first full frontend run had 873 passes and one test-discovery failure; a comment containing `requireUser()` had incorrectly classified an operator-secret route. Discovery now checks actual imports, and two explicit operator authorization tests cover the route.
- First hosted run [34233896274](https://github.com/S-h-u-b-h-1/mutual-funds/actions/runs/34233896274), commit `85fe0ac9fd8eacd937e53f6cd4fe0a9b34ca370e`, failed honestly: two SIP scheduling assertions, two Next.js internal-link build errors, and the Python TLS preflight. Browser checks were skipped, not passed.
- The SIP failure exposed real recent-submit deduplication that ignored start/end dates. Both dates now participate in the query, including null-safe end-date matching. A regression checks different schedules remain distinct and an identical retry still deduplicates. The link errors were fixed without disabling lint.
- Intermediate run `34234878042` was superseded after its Python TLS check failed; it is not passing evidence.
- Hosted run [34235052185](https://github.com/S-h-u-b-h-1/mutual-funds/actions/runs/34235052185), commit `a57170e52da22b87ba40fd67d441690f2450662e`: build passed; frontend had 875 passes and one permission denial in the new fixture's timestamp UPDATE. The fixture was rewritten to use existing INSERT privileges, not broaden the CI role. Python had 188 passes and one module skip hiding six search checks; a committed 14,347-code public AMFI source snapshot now makes those checks available in a fresh checkout.
- Run [34235774285](https://github.com/S-h-u-b-h-1/mutual-funds/actions/runs/34235774285) passed all six newly enabled search checks and the SIP date regression. A faster runner exposed one older test-fixture collision: the fresh-order test reused the draft-only test's amount inside the documented five-second duplicate window. Its request is now distinct; its submission assertions and the application's duplicate-submit protection are unchanged.
- Latest local new-role schema/Python rerun: schema pass, **194 tests passed**, zero skips. Hosted verification is being rerun; neither repository is yet certified green on the reconciled release candidate.
- Run [34236057080](https://github.com/S-h-u-b-h-1/mutual-funds/actions/runs/34236057080), commit `7753118c6c0a488a4efe8d30d728005373d496bb`, passed Python, build and all frontend tests. Its browser job was cancelled to remove the production public-mirror dependency described above. It is not a complete release-gate pass.
- Run [34236541278](https://github.com/S-h-u-b-h-1/mutual-funds/actions/runs/34236541278), commit `0f5d59bc627afa8cbf18433313a5fa4b26ea62c3`, passed 876 frontend tests (including 74 tenant-boundary cases and 16 identity guards), 197 Python tests with zero skips, build and the production dependency audit. Browser checks had 40 passes and two failures: mobile stock-grid overflow and search reopening after browser Back. The recorded screenshots/traces were inspected. The candidate now uses a shrinkable stock grid, framework navigation and a guard against stale queued native dialog-close events; the Back test repeats reopening three times.

An additional artifact-upload gate scans the exact configured test URL and decoded password in report files and decompressed ZIP trace entries. Any match or scan error blocks upload, including after a failed browser run. Regression tests cover plain files, password-only leaks, compressed traces and missing scan credentials. No secret values appear in diagnostic output.

The reconciled candidate `ed22462b64a56da0c29d9a11347fb9f48b2fd51e` passed all origin gates in [34238269253](https://github.com/S-h-u-b-h-1/mutual-funds/actions/runs/34238269253): 876 frontend, 205 Python and 42 browser checks; artifact scan passed. Its first mirror run [34240660463](https://github.com/S-h-u-b-h-1/MF-Pulse/actions/runs/34240660463) verified the isolated identity and passed Python, but two password-reset assertions received 429 because repeated suites shared the durable `unknown` IP bucket. Fixtures now use a unique documentation-range IPv6 address, and an additional assertion confirms both attempts still reach the real rate limiter. No application limit or database privilege is weakened. Both repositories must rerun the resulting test-only candidate revision.

## Remaining release work

## Reconciled publication checkpoint

Latest origin/main is `9403eadcc641950358652adc71b6d1d2994f4d3d`; the mirror main has no unique commits and is 456 commits behind it. Reconciliation incorporates that origin history on the remediation branch only. Neither main branch is changed. The two financial-bundle conflicts retain the corrected calculation outputs; comparison against origin confirmed no NAV or scheme-identity divergence. A post-rebuild comparison confirmed zero unintended financial/identity changes.

The daily summary and coverage artifacts were regenerated from the corrected funds and a fresh official NAVAll fetch: **14,347 source schemes, zero missing, zero delisted**. All original origin rank-history bytes remain intact; the normal builder appended its new snapshot. Funds, performance and daily summaries now agree on **7 September 2026**.

Publication ID: `2026-09-07-b38408ba2e0a`; aggregate checksum: `b38408ba2e0aa576ec39f2460f16de959a2715993760c075f85d83f1303fd375`. Its `buildCommit` records the actual generator source checkout `5bb1f86742c1094ad1add21632d2532cf062773c`; data inputs/outputs are separately identified by their checksums. It is not presented as a self-referential final release commit. Forty focused financial/publication/search/data tests passed after reconciliation. Full exact-candidate CI in both repositories is the remaining gate at this committed report checkpoint.

**First complete isolated hosted pass:** [34237466961](https://github.com/S-h-u-b-h-1/mutual-funds/actions/runs/34237466961), commit `2700574a758408731e88279b445081dd41d88c0c`, passed all four jobs: 876 frontend tests, 197 Python tests and 42 browser checks, zero skips/failures. This is the pre-reconciliation checkpoint, not the final candidate. The new publication-date gate independently caught the old daily bundle's 4 September date versus the corrected funds/performance date of 7 September; reconciliation must rebuild it before the next release-gate run.

Independent official-source refresh at **14:12:31 UTC** again matched **11/11** sampled schemes with no calculation differences. At approximately **14:14 UTC**, a separate read-only production schema/integrity check again found no missing columns, zero orphan relationships and zero unvalidated foreign keys. All five approved migration checksums still match disk and ledger; production users/holdings/uploads/transactions remain 33/28/44/6. This operator check did not use the CI credential and is not part of CI database access.

Complete hosted CI in both repositories, reconcile later origin/main data commits without restoring broken financial outputs, regenerate the publication manifest and run all financial, schema, tenant and browser gates on that exact candidate. Keep historical failures and report precise tested commits. Production migration evidence is in `APPROVED_RELEASE_ACTIONS_2026-09-08.md`.

Real-money investing remains prohibited. All investment, KYC, payment, SIP, redemption, switch and document/provider workflows remain explicitly sandbox/demo-only. The broader audit's incomplete features, data-depth limitations and post-deployment checks remain open; successful CI is not a production-completion certificate.
