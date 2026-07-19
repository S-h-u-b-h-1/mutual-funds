# Next AMC Playbook

Research Intelligence Upgrade, Mission 13. Per the brief: this is explicitly a planning document,
not an implementation. Three real AMC adapters are live (SBI 152, HDFC 241, ICICI Prudential 580 —
973 schemes, 6.84% of the universe). This documents what building those three actually taught us,
so the fourth (Nippon India, next by scheme count per `docs/AMC_LAYOUT_CATALOG.md`) goes faster
and hits fewer of the same mistakes. **Nippon India is not implemented by this document — it is
planned for, per the brief's own instruction to stop at planning.**

## What actually transfers between AMCs, evidence-based after 3

Confirmed reusable, zero changes needed across all 3 integrations:
- `extract.py`'s `parse_date_string()` / `parse_numeric_string()` value converters
- `scripts/ingest_factsheets.py`'s AMFI scheme-matching step (`_match_and_collect`, `collapse()`)
- `normalize.py`'s `validate()` / `completeness()`
- `provenance.py`'s recording (generic over `(src_files, rows)`)
- The `SchemeMetadata` dataclass shape itself — never needed a new field across 3 AMCs with 3
  different document layouts

Confirmed **not** reusable — genuinely AMC-specific every time, no shortcut found:
- **Document topology.** Three AMCs, three different answers to "where does one scheme's data
  start and end": SBI = whole PDF is one scheme; HDFC = combined PDF, multi-page-per-scheme,
  needs a "Contd from previous page" merge step; ICICI = combined PDF, exactly one page per
  scheme, no merge step at all. This is decided by inspecting real fetched pages, not guessable
  from the AMC's name or size.
- **Every field's anchor text.** Benchmark, AUM, fund manager, riskometer, expense ratio, and
  inception date each use a different label, position, or presence pattern per AMC — see the
  full comparison table in `docs/AMC_LAYOUT_CATALOG.md`. Zero anchor patterns have repeated
  across any two of the three AMCs so far.
- **Fetch mechanism.** SBI: fully open. HDFC and ICICI: listing page is WAF-blocked but the PDF
  file itself is on an unprotected path (found via web search, not guessable in advance).

## The real failure mode: single-sample verification

Every real bug found in the ICICI build came from testing against all 75 real pages instead of
one sample page, after the adapter already looked "done" against a first example:

1. **Multi-manager schemes** — the manager regex only matched when the name was on its own line;
   real multi-manager pages put `Name (Managing...)` inline, repeated per manager. Invisible in a
   single-manager sample.
2. **Benchmark fallback** — some (older-style) scheme pages have no labeled `"Benchmark\n{name}"`
   line at all, only a returns-table row label. Invisible unless you hit one of those pages.
3. **Exit load newline assumption** — the anchor required a literal newline after the colon; some
   real pages continue on the same line. Invisible in whichever sample happened to have the
   newline.
4. **Two-digit year dates** (`23-May-08`) — a format neither SBI nor HDFC had ever produced.
   Invisible until a scheme old enough to use it showed up.
5. **Missing `source_date`** — the adapter extracted every field except the document's own "as of"
   date, silently leaving every row's provenance incomplete, until the pipeline's own audit log
   was checked (not just the extracted fields).

None of these were "hard" fixes — each was a few lines. All five were invisible to spot-checking
one or two pages and only surfaced by running the adapter against the full real page set and
diffing the aggregate counts. **The playbook implication: budget the actual build time as
"iterate against 100% of real pages, not first-draft-against-one-sample" — this took roughly as
long as writing the initial adapter regexes did.**

Two more real bugs surfaced by process, not by field-level testing:
- **`collapse()` divergence** (Data Platform Mission 4): the AMFI-matching step and the
  provenance-matching step had each grown their own copy of the same normalization function,
  silently diverging. Fixed by making it one shared function. Lesson: when the same conceptual
  operation (a name-normalization comparison) is needed in two places, write it once and import
  it — don't let "it's a two-line function" justify a second copy.
- **Missing `pypdf` in `requirements.txt`** (Industry Coverage Expansion): a real, already-used
  dependency had never been declared because nothing that imported it had ever run in CI until a
  new test exercised that code path for the first time. Lesson: a green CI history is not proof a
  dependency is declared — it can mean the path that needs it has simply never run yet.

## Concrete playbook for the next AMC (Nippon India, when planning becomes implementation)

1. **Verify the fetch path first, before writing any extraction code.** Nippon India is already
   flagged WAF-protected in `playwright_fetch.py`, same tier HDFC and ICICI turned out to be in —
   the pattern that resolved for both (listing page blocked, direct PDF file unprotected) is the
   first thing to check, not assumed to repeat a third time.
2. **Fetch the real combined factsheet and read actual extracted text before writing a single
   regex.** Every AMC-specific anchor in this codebase was written by looking at real `pypdf`
   output, never designed from the PDF's visual layout or another AMC's pattern.
3. **Determine document topology explicitly**: one-PDF-per-scheme, or combined-with-continuation,
   or combined-one-page-always? This decides whether a page-merge step is needed at all.
4. **Write the adapter against one real scheme first** to get the shape right, exactly like the
   first three did — but budget real time for step 5, not just this step.
5. **Before calling it done, run against every real page/scheme the source document contains, not
   a sample.** Diff aggregate per-field counts the way `docs/AMC_LAYOUT_CATALOG.md`'s Mission 6
   table does. Any field whose count looks suspiciously low relative to how common that data
   normally is (e.g., 0 minimum-lumpsum extractions) is a signal to check anchor text against a
   page that isn't matching, not to accept the number.
6. **Reuse `parse_date_string()` / `parse_numeric_string()` from the first call** — do not write
   a new local `_to_iso()`; that duplication has already had to be found and removed twice
   (SBI+HDFC's original versions, in Universal Factsheet Platform Mission 2).
7. **Add real fixtures to `tests/test_factsheet_parsers.py`** structurally faithful to what the
   real PDF actually contains (not verbatim-copied — regression corpus rule, never commit
   copyrighted PDF text), covering at minimum: the common case, the multi-value/multi-manager
   case if one exists, and any format variant found during step 5.
8. **Confirm `requirements.txt` still has everything the new code path imports** — don't assume a
   green CI run before the change proves nothing new is missing.
9. **Verify coverage improvement with real before/after counts** (`docs/AMC_LAYOUT_CATALOG.md`
   Mission 6 pattern), backfill provenance against Neon, confirm via direct row-count query (not
   assumed), deploy via `production-refresh.yml`, verify live via `/api/freshness`.

## On layout families — still not enough evidence, now formally 3 of the stated 5–8

`docs/AMC_LAYOUT_CATALOG.md`'s Mission 8 already declined to propose layout families with 3 AMCs
done. Nothing found while building the user-facing profile UI on top of that data changes that
conclusion — if anything, it reinforces it: the UI code that consumes `SchemeMetadata`
(`ProfileField` in `FundPageClient.jsx`) never needed to know which AMC a value came from, because
the *shared* layer (the dataclass, `validate()`, `completeness()`, provenance) is what a
consuming feature actually touches. The *AMC-specific* layer (anchors, topology) stays isolated
inside each adapter, which is the architecture working as intended — it just isn't evidence for or
against families, because nothing about it required comparing anchor patterns across AMCs. A
fourth and fifth real AMC remain the way to actually test the families hypothesis, not a UI build
on top of already-normalized data.

## What this means for Nippon India specifically, if and when implementation is approved

- Expect the WAF-listing/unprotected-file fetch pattern to likely repeat (2 of 2 combined-PDF AMCs
  so far have had it) — but verify, don't assume.
- Expect at least one genuinely new anchor pattern for some field — 3 of 3 AMCs so far have
  contributed at least one field format never seen in the prior AMCs (SBI: anchor-free AUM; HDFC:
  cross-referenced riskometer glossary requiring a decision to leave it unextracted; ICICI:
  two-figure AUM, two-digit-year dates, inline multi-manager). Budget for discovering one, not for
  reusing patterns wholesale.
- Expect real bugs to surface only once tested against the full real page/scheme set — plan the
  build as "adapter draft + full-corpus verification pass," not "adapter draft, done."
