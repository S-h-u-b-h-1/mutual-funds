# MF Pulse data ownership and publication contract

Version 1, adopted during 2026-09-08 remediation. This records existing ownership rather than moving databases. No mirror may independently override authoritative financial data.

| Domain | Authoritative store/source | Derived store | Public serving layer |
| --- | --- | --- | --- |
| Scheme identity | Official AMFI NAVAll, archived in Supabase | Neon mirror | Versioned funds bundle |
| Daily NAV | Official AMFI publication, archived in Supabase | Neon mirror | Versioned funds bundle |
| NAV history | Official AMFI historical reports | Validated local history and Neon mirror | Computed bundle |
| Returns/risk | Versioned computation from official NAV history | Publication JSON | Publication JSON |
| Factsheets | AMC source documents and Supabase archive | Parsed metadata JSON; Neon legacy mirror | Metadata JSON with source dates |
| Monthly flows/AUM | AMFI MCR in Supabase | Neon legacy mirror | Supabase public views |
| News | Publisher documents in Supabase | Neon mirror | Supabase public views/server composition |
| Signals | Rules applied to authoritative flows/news | Computed bundles/mirrors | Versioned bundle or source-backed view |
| Users/auth | Neon | None | Authenticated server APIs |
| Portfolio holdings/transactions | Neon user-owned ledger | Date-stamped valuation/report cache | Authenticated server APIs |
| Analytics | Supabase event store | Privacy-safe aggregates | No public raw search queries |
| Newsletter interest | Neon `newsletter_subscriptions` | None | Rate-limited server endpoint |

## Publication

`scripts.publication_contract` emits `frontend/app/data/publication.json` with an immutable content-derived ID, source date, schema version, checksums, output/source counts, required coverage, build commit and status. All financial bundle changes must regenerate this manifest. Coverage floors and >15% relative coverage regression gates run before promotion. Missing metrics remain null.

History anchors use calendar months and the nearest prior official observation, no more than seven calendar days before the target. One year and shorter are cumulative NAV returns; three/five years are CAGR using actual elapsed days / 365.25. IDCW NAV-only returns remain unavailable. Ten-year and since-inception returns are not claimed until the required official history and inception evidence are present.

Portfolio current values require positive NAVs on one common source date. Heterogeneous source dates are reported explicitly as unavailable; they are never combined into an authoritative dated total or XIRR. Historical/common-date pricing can be added through the same lookup interface. Report/metrics/events/header persistence is transactional.

## Divergence classification

Neon public-data copies are mirrors, not fallback authorities. Counts alone do not prove equality. `scripts.compare_supabase_neon_counts` provides the existing count comparison; row identity/value/date checks must accompany a cutover. Current divergence in flows/factsheets/news is classified as stale mirror, not a mandate to overwrite either database. User-domain count differences are expected because Neon alone owns these records.

## Deferred data operations

No historical user, upload, audit, or financial row is deleted by this remediation. Existing test users need owner classification (automated test, demo, obsolete, real) before cleanup. Existing duplicate summary uploads updated holdings by upsert; transaction rows have their own fingerprint uniqueness. A future cleanup must report affected upload/report references and preserve audit history.
