# Canonical Fund Report (Phase 3)

MF Pulse treats one fund as **one investment idea**, not four scheme rows.

## Normalization
- **14,224 scheme codes → 5,598 canonical funds** (60.6% variant reduction).
- Deterministic, name-based (`scripts/canonical.py` + client mirror `lib/canonical.js`).
- Every active scheme maps to exactly one canonical fund (**100% mapping coverage**).
- `fund_family.json` stores `canonical_fund_id`, `canonical_fund_name`, `variant_scheme_codes`,
  `variant_count`.

## Where canonical funds are now used
| Surface | Status |
|---|---|
| Search dropdown | ✅ **collapses variants** — one row per canonical fund + a "N variants" chip, routing to the Direct-Growth variant |
| Daily attention / morning brief | ✅ deduped by canonical key (no repeated SBI Small Cap items) |
| Insights / explanation engine | ✅ one item per canonical fund + max-2-per-category diversity |
| Rankings (performance/category) | scheme-level by plan cohort (Direct vs Regular kept separate — correct for fair ranking) |

## What this fixed
- **Duplicate search results** — "SBI Small Cap" returned 4 rows; now 1 (with variant count).
- **Duplicate insights / noisy morning brief** — collapsed to canonical.
- **Repeated scheme rows** in attention items.

## Deliberately NOT collapsed
- **Performance ranking by plan** stays Direct-vs-Regular separated (different expense → different
  return; collapsing would mislead). The canonical fund is the *navigation/insight* unit; the
  plan variant is the *investable* unit, surfaced on the fund page.

## Verification
`tests/test_explain.py`: 4 SBI Small Cap variants → 1 canonical key; Direct+Regular of the same
fund → one explained item. Reproducible.
