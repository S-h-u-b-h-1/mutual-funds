# Factsheet Platform Audit

Universal Factsheet Intelligence Platform, Mission 1. Every adapter reviewed line by line
against what it actually does (not what its docstring claims) — `sbi.py` and `hdfc.py` are real
and validated against live PDFs; `icici.py` and `nippon.py` are stubs with `implemented = True`
that has never been checked against a real document (the same false-positive HDFC's stub carried
until Data Platform Mission 5 found and fixed it — see `docs/FACTSHEET_PIPELINE.md`).

## The central finding

**Neither of the two real, validated adapters uses `extract.py`'s generic label-based
extraction.** Both `SBIAdapter.parse_scheme_block()` and `HDFCAdapter.parse_scheme_block()` are
100% custom regex, written from scratch against each AMC's real PDF text. This isn't an
oversight — it's what two independent, evidence-based build-and-verify passes converged on. A
generic "find `Label: value`" extractor (`extract.py`'s `labeled()`) already exists, was already
built for exactly this purpose (Provenance Mission Phase 4), and neither real adapter uses it,
because neither AMC's actual factsheet text — after plain `pypdf` extraction — looks anything
like clean `Label: value` lines. This matters for how the rest of this mission gets scoped: the
premise "prefer reusable extractors over AMC-specific regex" is correct in spirit but the
evidence from two AMCs so far says the *anchor-finding and document-structure* logic is
genuinely AMC-specific, while a narrower set of *value-parsing* primitives (below) really is
shared and should be wired in rather than reinvented.

## What's actually shared vs. AMC-specific, evidence-based

| Concern | Shared today? | Evidence |
|---|---|---|
| Percentage-value parsing (`12.34%` → `12.34`) | **Duplicated, should be shared** | `extract.py`'s `PCT`/`parse_pct()` already does this generically. SBI's `SECTOR`/`HOLDING` regexes and HDFC's `EXPENSE` regex each re-implement the same `\d{1,3}(?:\.\d{1,2})?%` pattern inline instead of calling it. |
| Currency/crores-amount parsing (`₹1,23,456.78 Cr` → `123456.78`) | **Duplicated, should be shared** | `extract.py`'s `MONEY`/`parse_aum()` exist for this. SBI's `CRORES` regex and HDFC's `AUM` regex each hand-roll the same `[\d,]+\.\d+` → `float(...replace(",",""))` conversion. |
| Date-string → ISO conversion | **Duplicated, should be shared** | `extract.py`'s `parse_date()` already tries multiple formats (`%d-%b-%Y`, `%d/%m/%Y`, `%B %d, %Y`, etc.) against a labeled value. SBI's `_to_iso()` and HDFC's `_to_iso()` are two separate, narrower, single-purpose reimplementations (SBI only tries `%d/%m/%Y`; HDFC only tries `%B %d, %Y` variants) that would both work as call sites into the one that already exists. |
| Amount parsing (`Rs. 5,000` → `5000.0`) | **Duplicated, should be shared** | `extract.py`'s `parse_amount()` exists and is unused by both real adapters (neither currently extracts minimum SIP/lumpsum, so this hasn't surfaced as duplication yet — but it will the moment that Phase 0 fix from `docs/DATA_ACQUISITION_ROADMAP.md` lands). |
| Scheme-block splitting (where does one scheme's data start/end) | **Genuinely AMC-specific** | SBI: trivial, one PDF = one scheme. HDFC: page-aware, a scheme can span 2 pages via a "Contd from previous page" marker with no equivalent in SBI's world at all. These are different *document topologies*, not a formatting difference a shared splitter could paper over without first knowing which topology it's looking at (see Layout Families, below). |
| Field anchor/label text | **Genuinely AMC-specific, sometimes not even label-based** | HDFC finds AUM via a literal `"ASSETS UNDER MANAGEMENT"` header. SBI has no such header anywhere — it finds AUM via a bare `"₹NNN,NNN.NN Crores"` pattern with no anchor text at all, matched by position (last such number in the block). These are different *extraction paradigms*, not the same extraction with different label strings. |
| Fund manager extraction | **Genuinely AMC-specific, different paradigm entirely** | HDFC: anchored table (`"FUND MANAGER ¥\nName Since Total Exp\n{rows}"`), multi-manager, each with a "Since" date. SBI: **no anchor at all** — a heuristic scan for any line matching `Mr./Ms./Mrs. X & Mr./Ms./Mrs. Y` (requires the `&` specifically to avoid a known ambiguity where a solo `"Mr. X"` line is unreliable in SBI's PDFs — a defect *specific to SBI's layout* that has no HDFC equivalent because HDFC's table format has no such ambiguity). Sharing this would mean picking one paradigm and forcing the other AMC through it — actively worse than two adapters, not more DRY. |
| Validation (`normalize.validate()`) | **Already correctly shared** | Both adapters return `SchemeMetadata` and go through the same `validate()`/`completeness()` in `normalize.py`. No duplication found here. |
| Provenance recording | **Already correctly shared** | `ingestion/factsheet/provenance.py` is generic over `(src_files, rows)` — needed zero changes to support HDFC (see `docs/FACTSHEET_PIPELINE.md`). No duplication found here. |

## Orchestration: two paths exist, only one is real

`ingestion/factsheet/run.py` + `registry.py` iterate `ADAPTERS` generically and call each
adapter's `run()`/`fetch()`/`parse()`. This looks like the "universal" orchestrator the new
mission wants — but it is **not the production path**. `scripts/ingest_factsheets.py` is: it's
tested, wired to `provenance.py` and `archive_factsheets.py`, and is what Data Platform Mission 5
extended to add HDFC. `run.py`'s own `main()` has never been run against real data in this
session's testing and was not touched by Mission 5. This is itself a form of the duplication this
audit was asked to find: two orchestrators, one real. Consolidating onto one (almost certainly
`scripts/ingest_factsheets.py`, since it's the proven one) is lower-risk than building a third.

## `icici.py` / `nippon.py`: same false-positive HDFC had

Both stubs set `implemented = True` and rely entirely on `base.py`'s generic
`parse_scheme_block()` — the same combination that turned out to be non-functional for HDFC
(`factsheet_url()` pointing at a WAF-blocked listing page, and the generic label-based
extraction not matching the real document). Given the central finding above, there is no reason
to expect either to work without the same real-PDF verification pass HDFC just went through:
finding the actual current factsheet URL, confirming it's fetchable, and writing AMC-specific
extraction against real (not assumed) text. Treat their `implemented = True` flag as unverified,
not as evidence of readiness, in any scoping decision.

## Update 2026-07-19: the shared primitives were wired in and verified

Universal Factsheet Platform Mission 2 (scoped down per this audit's own finding, per user
direction): `extract.py` gained `parse_date_string()` and `parse_numeric_string()` — the genuinely
shared conversion logic identified above — and `sbi.py`/`hdfc.py` now call them instead of each
maintaining its own local `_to_iso()`. The anchor/label regexes (BENCHMARK, MANAGER, SECTOR,
HOLDING, EXPENSE, INCEPTION, etc.) were **not** touched, per this audit's recommendation that
they're genuinely AMC-specific.

Verified with a controlled before/after diff, not assumed: ran the real pipeline on the old code
(`git stash`), recorded exact per-field population counts, ran it again on the new code, and
diffed every one of the 393 real scheme rows field-by-field. Result: **393/393 rows identical
across all 9 checked fields except launch_date, which gained exactly 8 new values (385→393) with
zero existing value altered.** The 8 newly-populated dates come from HDFC schemes whose real
inception-date text used a day-month-abbreviation format HDFC's own narrow 3-format `_to_iso()`
never tried (it only tried month-name-first variants) but `extract.py`'s already-existing format
list did — a real, previously-silent extraction failure fixed as a side effect of removing the
duplication, not introduced by it. Full test suite: 112 passed, 12 skipped, 2 pre-existing
unrelated failures (confirmed via the same `git stash` control — present on both old and new code,
tracked separately in `docs/DATA_COVERAGE_MATRIX.md`, not caused by this change).

## What this means for the rest of this mission

- **Do build**: shared value-parsing primitives (percentage, currency, date, amount) as the one
  place that logic lives, with every adapter calling into them instead of re-deriving. This is a
  real, bounded, low-risk refactor of `extract.py` plus updating `sbi.py`/`hdfc.py` to call it —
  not a rewrite.
- **Be skeptical of "layout family" classification as a near-term win.** Two AMCs, two
  genuinely different document topologies (one-PDF-per-scheme vs. one-combined-PDF-with-
  continuation-pages) and two genuinely different manager-extraction paradigms (labeled table vs.
  anchor-free heuristic scan). That's not yet enough evidence to define real families with
  confidence — it's evidence that *at least two* families exist. A third and fourth real AMC
  integration would tell us far more about where the real boundaries are than any amount of
  speculation from two data points. Recommend treating "layout families" as a hypothesis to test
  against Mission 11's regression corpus, not a taxonomy to design up front.
- **Consolidate orchestration onto `scripts/ingest_factsheets.py` before adding more adapters to
  either path** — running two orchestrators forward in parallel would compound, not reduce,
  duplication.
