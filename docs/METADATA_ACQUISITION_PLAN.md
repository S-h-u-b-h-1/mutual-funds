# Metadata Acquisition Plan

Provenance Mission Phase 2. How MF Pulse gets from today's real state (1 AMC, 1 document type,
152 schemes) to the Phase 5 three-AMC pilot and beyond — grounded in exactly what the existing
`ingestion/factsheet/` code can and cannot do today, verified by reading it, not assumed.

## Current state, precisely

| | Reality |
|---|---|
| AMC adapters that exist as code | 4 — SBI, HDFC, ICICI, Nippon (`ingestion/factsheet/adapters/`), all `implemented = True` |
| AMC adapters that have ever produced real data | **1 — SBI only** |
| Why the other 3 have never run | **Not a parser problem. A wiring problem.** `ingestion/factsheet/run.py`'s `run_all()` correctly iterates the full adapter registry and would call HDFC/ICICI/Nippon — but nothing in the production path calls `run_all()`. The actual monthly cron (`.github/workflows/factsheets.yml` → `scripts/factsheet_pipeline.py` → `scripts/ingest_factsheets.py`) imports `SBIAdapter` directly and iterates a hardcoded `CURATED` list of SBI URLs only. `run.py` is dead code today. |
| Document types ever fetched | **1 — the AMC factsheet PDF.** No adapter has ever attempted a monthly portfolio disclosure spreadsheet, an SID/KIM, or an HTML scheme page, for any AMC including SBI. |
| Schemes covered | 152 of 14,216 (1.07%), all SBI, all equity/hybrid — no SBI debt scheme is in the covered set despite SBI having debt schemes in the AMFI universe |
| Pipeline schedule health | **Actually running on schedule** — confirmed via `gh run list`: the July 5 2026 monthly run completed successfully. The metadata bundle *looks* 18+ days stale because `scripts/ingest_factsheets.py` writes a **hardcoded `"asOf": "2026-06-23"` string literal** (line 148) instead of the real run date, and because the SBI source PDFs themselves are dated archival documents (Dec 2022 / Jan 2023) rather than current-month filings — three different, unrelated reasons for the same visible symptom, now disentangled. |

## Phase 4 fix plan (mechanical, before any new AMC is attempted)

1. **Retire the split.** Make `scripts/ingest_factsheets.py` (or its successor) call the registry-driven `run_all()` path instead of hardcoding `SBIAdapter`. The curated-URL-list approach that makes SBI reliable (direct per-scheme PDF URLs, no discovery needed) should become one strategy a `DocumentDiscoveryAdapter` can use, not a parallel pipeline.
2. **Fix `asOf`.** Stamp the bundle with the actual run timestamp; keep each row's `source_date` as the AMC document's own stated date. These are two different facts (`when did we last run` vs `how old is the source`) that must never collapse into one field.
3. **Fix the Direct/Regular broadcast bug.** `ingest_factsheets.py`'s matching loop applies one parsed `SchemeMetadata` object identically to every AMFI scheme code whose name prefix-matches — expense ratio (which genuinely differs Direct vs Regular) would be silently wrong the moment SBI's expense-ratio extraction starts working, or for any AMC whose factsheet states plan-specific figures. Currently masked only because expense_ratio happens to be 0% populated for SBI today. This is exactly the "no Direct/Regular mixups" failure mode Phase 5's acceptance criteria name — fix before it's masked by luck on a second AMC too.
4. **Wire `playwright_fetch.py` in, or replace it.** It is well-written and targets the right portals (HDFC/ICICI/Nippon/Axis) but has never been executed in this environment — not imported by any entrypoint, and Playwright's browser binaries are not confirmed installed here. Phase 5 must either get it running for real or find directly-fetchable URLs (SBI's pattern) for the pilot AMCs.

## AMC rollout order

Reuses the prioritization already researched in `docs/AMC_FACTSHEET_AUDIT.md` (16 AMCs surveyed
for factsheet layout consistency) rather than re-deriving it. That document's P1 tier — SBI,
HDFC, ICICI Prudential, Nippon India — was chosen because those four AMCs cover the majority of
industry AUM, so they yield the most coverage per unit of adapter effort. This plan adds the
acquisition-method dimension that document didn't need at the time (it was scoped to factsheet
layout only):

| AMC | Adapter code | Acquisition method status | Blocking issue |
|---|---|---|---|
| SBI | implemented, proven | **[VERIFIED] working** — direct per-scheme PDF URLs, no discovery step needed | None — this is the reference implementation |
| HDFC | implemented, fixture-tested | **[UNVERIFIED]** — consolidated factsheet PDF (136pp per `FACTSHEET_INGESTION_REPORT.md`'s prior fetch attempt), splits per-scheme data across pages | `base.py`'s `pypdf` text extraction can't reliably attribute a page-split table to the right scheme; needs positional extraction, not yet built |
| ICICI Prudential | implemented, fixture-tested | **[UNVERIFIED]** — portal is JS-gated per `playwright_fetch.py`'s own comment | `playwright_fetch.py` targets it but has never been run here |
| Nippon India | implemented, fixture-tested | **[UNVERIFIED]** — JS-gated portal, same as ICICI | Same — untested Playwright path |

Recommended pilot pair for Phase 5, choosing for acquisition-method diversity rather than
adapter-code readiness alone (since all three non-SBI adapters are equally untested in practice):

- **HDFC** — represents the "consolidated PDF, positional extraction needed" pattern named in
  the mission brief.
- **One of Nippon / Kotak / Axis** — represents the "portfolio spreadsheet / web disclosure"
  pattern. Of these, only Nippon has an existing (untested) adapter; Kotak and Axis have neither
  an adapter nor a captured portal URL — starting from Nippon reuses more of what already exists.
  If Nippon's monthly portfolio disclosure turns out to be PDF-only rather than XLS, Kotak or
  Axis should be tried next specifically because a spreadsheet source is the point of this slot,
  not just "a second AMC."

P2/P3 AMCs (Mirae, Motilal Oswal, DSP, Aditya Birla, UTI, Franklin Templeton, Canara Robeco,
Tata, HSBC, Invesco) are explicitly out of scope until the pilot passes its acceptance criteria —
per the mission brief: "do not expand to additional AMCs until pilot accuracy is demonstrated."

## Sequencing dependency

Phase 5 (pilot) cannot start meaningfully before Phase 4's four fixes above land — running a
second AMC through the currently-hardcoded, currently-buggy pipeline would just reproduce the
same architectural problem for a second AMC instead of fixing it once. Phase 4 → Phase 5 is a
hard dependency, not just a numbering convention.
