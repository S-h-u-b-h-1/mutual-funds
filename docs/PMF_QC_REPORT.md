# PMF Sprint — Adversarial QC Report (2026-07-01)

Phase 11 production validation: 5 independent agents, each given ONLY the changed surface and
instructed to find real bugs — malformed input, boundary math, silent scale mismatches, HTML
spec violations — not to rubber-stamp the implementation. Full run: workflow `wf_d85f093d-e4b`.

## Real bugs found and fixed

| # | Severity | Surface | Bug | Fix |
|---|---|---|---|---|
| 1 | **Major** | `signals/[amc]/[cat]/page.js` | The per-fund Health column reused the **AMC-scale** `gradeTone` (6-band, A/B+/B/C/D/E) on a **fund-scale** grade (5-band, A/B/C/D/E) — exactly the conflation the file's own new warning comment says not to do. Currently masked (both scales happen to agree pixel-for-pixel on every value fundHealth can produce), but a real landmine — confirmed via `git diff` to predate this sprint's refactor, which only relocated it. | `fundCols`' Health column now imports and uses the fund-scale `gradeTone` from `lib/fundHealth.js`; only the AMC score badge uses `amcIntel.js`'s `gradeTone` (aliased `amcGradeTone`). |
| 2 | Minor | `lib/marketStatus.js` (renders on every page) | A malformed/unparseable `asOf` string produced `NaN`, bypassed the null guard, and would have shown "Latest NAV: ... (NaNd ago)" sitewide. | Parsed date is now validated with `isNaN()`; falls back to the existing "NAV date unavailable" path. |
| 3 | Minor | `page.js` (Category Rotation) | `Math.abs(0)` was unconditionally appended even in the "unchanged" branch, so a category with exactly zero rank movement would render "–0" instead of "–". Not triggered by today's data (all rotations are ±3/±4) but a real latent bug. | Zero-change now renders a bare "–", never "–0". |

## Real correctness/maintainability issues fixed
- **`<summary>` HTML content-model violation**: the collapsed sample-flow section nested a full `SectionHeader` (div/h2 wrappers) inside `<summary>`, which only permits phrasing content. Browsers rendered it fine but it failed the HTML5 spec. Restructured: `<summary>` now holds only plain text + a badge span; the full `SectionHeader` renders in the disclosure body, just below the summary line — same UX, spec-clean markup.
- **`nextScheduledRun()` epoch discrepancy**: the function's comment said the cron runs at 14:30 UTC (=20:00 IST), but the code built the returned `Date`'s epoch using a literal 20:00 UTC — the calendar date happened to be masked-correct because the only consumer formats it with `timeZone:"UTC"` and never reads the hour, but the raw epoch was wrong. Fixed to construct the true 14:30 UTC instant.
- **Hardcoded risk-free-rate label**: Sharpe/Sortino labels read "rf 6.5%" as a literal string instead of interpolating the `RF` constant — would silently go stale if the disclosed rate is ever updated. Now interpolated.
- **Fund page section-numbering drift**: restructuring left "5" and "6" reused twice and "10" reused twice in section comments (cosmetic, no runtime effect, but evidence of an incomplete pass). Renumbered 1–10 cleanly.
- **Duplicated magic threshold**: the `7`-day freshness cutoff was a literal repeated in `build_performance.py` (twice) and the regression test, with nothing enforcing agreement. Extracted to `FRESH_MAX_DAYS`, imported by the test — a future change to the threshold can no longer silently reintroduce the exact bug this sprint fixed without the test catching it.

## Checked and confirmed clean (no action needed)
- `build_performance.py`'s `stale_days <= FRESH_MAX_DAYS` gate: boundary-correct (inclusive), no
  variable-scoping/loop-leak bug, no downstream JS mishandling of the resulting nulls. Full test
  suite passes.
- `/data-status` route (linked sitewide by the freshness strip) resolves, HTTP 200.
- `Nav.jsx` tone maps cover every value `freshnessTone()` can return.
- No hardcoded "live"/"real-time" claims anywhere in the changed surface.
- Category-link URL encoding round-trips correctly through `/categories/[category]` for names
  containing spaces and `&`.

## Verification after fixes
- Full test suite: **108/108 pass**.
- `next build`: clean, 25 routes, zero warnings.
- Local smoke test post-fix: `/signals/sbi/equity` (200, AMC score + Health render), homepage
  (200, collapsed sample section renders exactly once), fund page (200).

Nothing found was a fabricated value, a fake trend, or a misleading claim — every issue was a
real code-correctness bug (a scale mismatch, an unguarded NaN path, a boundary edge case), which
is exactly the class of problem an adversarial QC pass before shipping is meant to catch.
