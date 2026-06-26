# Search & Coverage Validation Audit — 2026-06-26

**Verdict:** every AMFI scheme is now searchable **and** openable. The discoverability hole
(5,645 schemes searchable but 404 on click) is closed. Numbers below are reproducible from
`data/NAVAll.txt` + live Supabase `dim_scheme` + `frontend/app/data/funds.json`.

## Phase 1 — Scheme coverage (the gap, quantified)

| Metric | Count | Source |
|---|---:|---|
| Schemes available from source (AMFI NAVAll.txt = Supabase `dim_scheme`) | **14,224** | live count `content-range: …/14224` |
| Ingested / stored (parsed into the pipeline) | 14,224 | `parse_file` |
| Priced (has a NAV value) | 13,981 | |
| Active (NAV ≤ 7 days old) | 8,503 | |
| **Searchable** (`dim_scheme`) | **14,224** | Search.jsx → PostgREST |
| **Openable / routable** (`funds.json`, before fix) | **8,579** | `/fund/[code]` resolves only these |
| **Hidden from routing** (searchable but 404) | **5,645** | 14,224 − 8,579 |
| Canonical funds (variants collapsed) | ~5,600 | `canonicalKey` grouping |

### Why the 5,645 were hidden — single root cause
`scripts/build_performance.py` trimmed `funds.json` with:
```python
keep = {c: f for c, f in funds.items() if f["r1m"] is not None or f["active"]}
```
A scheme was written **only** if it had a 1-month return *or* a ≤7-day-fresh NAV. Everything else
was dropped from `funds.json` — but remained in `dim_scheme`, which the search box queries. So
search surfaced 14,224 schemes while `/fund/[code]` (`getFund` → `funds.json`) returned
`notFound()` for 5,645 of them.

**Breakdown of the 5,645 (every difference explained):**
| Reason | Count | Meaning |
|---|---:|---|
| Dormant (NAV > 365d stale) | 5,235 | wound-up / merged schemes — AMFI still lists last NAV |
| Stale (8–365d) | 167 | between fresh and dormant, no recent return |
| Unpriced (no NAV at all) | 243 | AMFI lists the scheme but publishes no NAV |

**Important trust finding:** **0** truly-active schemes (NAV ≤ 7d) were ever hidden. The hole
was entirely dead/dormant/unpriced schemes — but they were still *advertised* by search, so the
fix is to make them openable (honestly labelled), not to hide them.

## Phase 2 — Search layer audit

| Layer | Before | After |
|---|---|---|
| SQL/API filter | `ilike *term*` on name+amc | unchanged (correct, nothing removed) |
| `LIMIT` | **40** (artificial) | **300**, `order=scheme_name.asc` (deterministic; exact names always surface) |
| Canonical cap | 8 | 12 |
| Hidden/active flags silently removing rows | none | none |
| Latest-NAV requirement in search | none | none |
| **Routing** (the actual defect) | code → `notFound()` for 5,645 | **every code resolves** |

Nothing in the search path silently removes schemes. The defect was routing, not the query.

## Phase 3 — Performance completeness (3 honest denominators)

| Field | Full universe (14,224) | Active (8,503) | Investable (active·Growth·non-IDCW, 3,467) |
|---|---:|---:|---:|
| Has NAV | 98% | 100% | 100% |
| Has history | 28% | 47% | **100%** |
| Has returns | 28% | 47% | **99%** |
| Has benchmark | 40% | 53% | 45% |
| Has health score | 28% | 47% | **100%** |
| Has category | 100% | 100% | 100% |
| Has AMC | 100% | 100% | 100% |

Full-universe return coverage is intentionally low — most schemes are IDCW (returns suppressed
as indefensible) or dormant (no fresh NAV). On the **investable** set that actually drives
rankings, coverage is essentially complete. Benchmark mapping (SEBI category-standard) covers
main categories; FMP/index/niche categories are unmapped (known gap, never faked).

## Phase 4 — Discovery validation

- Pulled **all 14,224** live `dim_scheme` codes → cross-checked against `funds.json`.
- **Searchable-but-not-openable: 0.** Openable-but-not-searchable: 0.
- Reproducible random **500-sample** (seed 42), 4 checks each (searched / opened / routed /
  displayed): **0 failures.**

## Phase 5 — Canonical validation

Canonical collapse is **display-only**. Each variant keeps its own `scheme_code` and is
independently routable (all 14,224 open). Search shows the canonical fund + an "N variants"
chip; the AMC Intelligence page expands every Direct/Regular/IDCW variant. Guard test
`test_canonical_collapse_loses_no_variant` asserts grouping accounts for every fund — no variant
is ever permanently hidden.

## Phase 6 — Investor experience

- "SBI Small Cap" → canonical SBI Small Cap Fund (+ variant count) → opens (Direct-Growth pick).
- Every variant code (Direct/Regular Growth, IDCW, Direct IDCW) is independently openable.
- Exact scheme-name search returns that scheme (300-row ordered window guarantees it appears).

## Phase 7 — Fixes shipped

1. `scripts/reconcile_coverage.py` (new) — completes `funds.json` to all 14,224 with honest
   identity-only records (null returns, status `dormant|stale|unpriced`). No network, no fabrication.
2. `scripts/build_performance.py` — `keep = funds` (every priced scheme kept). Permanent fix +
   regression-guarded by a test.
3. `frontend/app/fund/[scheme_code]/page.js` — null-NAV safe; dormant/stale/unpriced banner.
4. `frontend/app/components/Search.jsx` — limit 40→300, ordered, canonical cap →12.
5. `tests/test_search_coverage.py` (new, 6 tests) — routable==source, no fabricated returns on
   dormant/unpriced, every record has routable identity, build keeps all, canonical loses none.

## Final report

| Metric | Value |
|---|---:|
| Source scheme count | **14,224** |
| Database (searchable) count | **14,224** |
| Searchable scheme count | **14,224** |
| Openable / routable count | **14,224** (was 8,579) |
| Canonical fund count | ~5,600 |
| Missing scheme count | **0** (was 5,645) |
| Coverage % (routable / source) | **100%** (was 60.3%) |
| Search coverage % (openable / searchable) | **100%** |
| Performance coverage % (returns / investable) | **99%** |

**Reasons for the previously-missing 5,645:** dormant 5,235 · stale 167 · unpriced 243 — all
dropped by the `r1m-or-active` keep filter; none were truly active. Full recovered list:
`data/warehouse/recovered_schemes.txt`. First 100 by name printed in the audit run (see commit).

Every active scheme — and every dormant/unpriced one AMFI lists — can now be discovered, opened,
routed and displayed, with dead schemes labelled honestly rather than hidden or faked.
