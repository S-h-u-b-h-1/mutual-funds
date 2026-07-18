# Factsheet Ingestion Pipeline

Data Platform Mission 5. `scripts/ingest_factsheets.py` is now genuinely multi-AMC — SBI plus a
new, real, tested HDFC integration — proving the pipeline was never actually SBI-hardcoded
architecture, only SBI-hardcoded *content* (a single curated URL list). Adding a third AMC means
adding one entry to `SOURCES`, not writing a new script.

## A real duplicate-system problem, found and consolidated, not built around

Before touching anything, a repo-wide look for existing factsheet infrastructure (required by
this mission's own "do not build duplicate systems" constraint) found one already half-built and
never finished: `ingestion/factsheet/base.py`, `extract.py`, `registry.py`, `run.py`, and adapter
stubs for HDFC/ICICI/Nippon — a generic `FactsheetAdapter` framework with real extraction
helpers, apparently from an earlier, uncompleted attempt at this exact mission (Provenance Mission
Phase 4, still marked pending in the task tracker despite this code existing).

It was never actually wired to anything live: `ingestion/factsheet/run.py`'s orchestrator writes
to the same `frontend/app/data/metadata.json` that `scripts/ingest_factsheets.py` writes to, but
nothing calls it, no test exercises it end-to-end, and `HDFCAdapter.implemented = True` turned out
to be untrue in practice — its `factsheet_url()` pointed at a stale listing-page URL that plain
HTTP fetches 403 on (confirmed empirically, not assumed), same WAF issue `playwright_fetch.py`'s
own docstring already flagged for this exact AMC. The test suite's own `HDFC_BLOCK` fixture
(`tests/test_factsheet_parsers.py`) was a synthetic, never-verified guess at HDFC's factsheet
format — a "Label: value" layout the real document doesn't use at all.

Resolution: kept `FactsheetAdapter`/`normalize.py`/`extract.py` (genuinely well-built, real
extraction primitives) as the shared base class every adapter inherits from — SBI already did,
HDFC now does too. Retired nothing destructively; `ingestion/factsheet/run.py` and the ICICI/
Nippon stubs are untouched and still exist for a future AMC, but `scripts/ingest_factsheets.py` —
the one script that's actually tested, scheduled-adjacent, and wired to provenance/archive — stays
the single real entrypoint. Not two systems converged into one by picking a winner; one system
that already existed got its first real, verified second adapter.

## Two acquisition shapes, because two AMCs' real sites are actually different

| | SBI | HDFC |
|---|---|---|
| Document shape | One PDF per scheme (40 curated URLs) | One PDF covers every active scheme |
| Discovery | Hand-curated per-scheme URLs (site has no clean index) | Hand-verified single URL, found via web search after the listing page 403'd every UA tried |
| Splitting | N/A — one fetch, one scheme | Page-aware: a scheme can span 2 pages ("....Contd from previous page"), so `HDFCAdapter.parse()` overrides the generic page-join-then-regex-split flow and walks pypdf pages directly, merging continuation pages back into the scheme that started them |
| Extraction | Full custom regex override (`SBIAdapter.parse_scheme_block`) | Full custom regex override (`HDFCAdapter.parse_scheme_block`) — the generic label-based `extract.py` helpers don't match either AMC's real layout closely enough to use as-is |

`scripts/ingest_factsheets.py`'s `SOURCES` list declares which shape each AMC uses; `_match_and_collect()`
is the one shared function both shapes funnel through to resolve AMFI scheme codes.

## Real coverage impact — verified, not projected

Ran for real (392 network fetches: 41 SBI PDFs + 1 combined HDFC PDF, then the coverage audit
engine), not simulated. Before → after, universe-wide (14,227 schemes):

| Field | Before (SBI only) | After (+ HDFC) |
|---|---:|---:|
| Expense Ratio | 0.0% (0) | **1.69% (241)** — first real data this product has ever had for this field |
| Exit Load | 0.0% (0) | **1.69% (241)** — same |
| AUM | 1.07% (152) | 2.76% (393) |
| Fund Manager | 0.08% (12) | **1.75% (249)** — 20x |
| Launch Date | 1.07% (152) | 2.71% (385) |
| Holdings / Sector Allocation / Riskometer | 0.18% / 1.07% / 1.07% | unchanged — HDFC's combined factsheet doesn't carry these reliably (see Limitations) |

152 SBI + 241 HDFC = 393 total scheme rows, matched against 53 real HDFC funds via the same
`normalize.collapse()` prefix-match SBI already used. 51/53 HDFC funds matched at least one AMFI
code on the first attempt; a real apostrophe divergence between the factsheet's "HDFC Children's
Fund" and AMFI's registered "HDFC Childrens Fund" was found and fixed in `collapse()` itself
(benefits every AMC's matching, not just HDFC). One fund ("HDFC Multi-Asset Allocation Fund" vs
AMFI's "HDFC Multi-Asset Fund") is a genuine naming divergence between two official sources, not a
formatting issue — left unmatched rather than guessed.

## Provenance — extended, verified against production

`ingestion/factsheet/provenance.py` needed no changes to support a second AMC — it was already
generic over `src_files`/`rows`, not SBI-specific. Ran for real against Neon production
(`super-surf-43536488`): `source_documents`/`source_document_versions` grew from 41 to 94 (one
per fund now, across both AMCs), `source_extractions` from 780 to 2,455.

Two real bugs caught by actually re-running the pipeline twice in the same session, not just once:

1. **The scheme-name matching bug fixed earlier this mission (Data Platform Mission 4) generalized
   correctly** — `collapse()` now lives in one place (`normalize.py`) and both AMCs' matching goes
   through it, so it can't silently diverge again the way it did the first time.
2. **`field_validation_results` had no idempotency guard.** `source_extractions` upserts correctly
   via its partial unique index, but re-running the pipeline against unchanged data still returned
   the same `extraction_id` and inserted a *new* validation log row for it every time — a real
   violation of this mission's own "every ingestion job must be idempotent" constraint, found only
   by actually re-running twice. Fixed with a `NOT EXISTS` guard (`ingestion/factsheet/provenance.py`)
   — no schema migration needed. A real unique index on `(source_extraction_id, check_name)` would
   be the more durable fix; noted for Mission 9 (Data Quality Engine) rather than done here as a
   scope-creeping migration.

## Known limitations — disclosed, not hidden

- **Two AMCs, not the universe.** 393 of ~14,227 schemes (2.76%). Duration/Yield/Credit Quality/
  Portfolio Turnover/Manager History/Scheme Status remain unaddressed per
  `docs/DATA_ACQUISITION_ROADMAP.md`'s Phase 2 — this mission proved the *pipeline* generalizes,
  not that every field does.
- **Riskometer, Holdings, and Sector Allocation are deliberately unpopulated for HDFC.** Verified
  against the real document, not assumed: riskometer is cross-referenced to a separate 16-page
  glossary section with no per-scheme value on the scheme's own page; the Industry Allocation
  table's sector names extract with mangled leading letters (a font/encoding artifact in that
  specific table style — "Banks" reads as "an s"); no holdings table was found in this factsheet
  at all (HDFC appears to publish that separately, in its monthly portfolio disclosure XLS, not
  the factsheet — consistent with `docs/FIELD_EXPANSION_MATRIX.md`'s Holdings row). Storing any of
  these would have meant guessing or fabricating — left null instead.
- **The HDFC factsheet URL needs manual refresh monthly**, same as SBI's curated list — the
  listing page is behind a WAF that blocks every plain-HTTP User-Agent tried (confirmed, not
  assumed); discovering the next month's URL needs a browser-driving tool or Playwright (not
  installed in this environment), not a plain `requests` call.
- **`ingest_factsheets.py` is still not wired into any scheduled GitHub Actions workflow** —
  unchanged from Mission 4's own disclosure. Running it requires a human (or an agent) to trigger
  it manually.
- **Minimum SIP / Minimum Investment remain at 0% for both AMCs** — a pre-existing, already-
  documented Mission 2/3 finding (the SBI adapter's regex never matches those labels); HDFC's
  factsheet doesn't carry a clean per-scheme minimum-investment figure either, so this mission
  doesn't move that number. Still the cheapest real fix on the roadmap.
