# Data Acquisition Roadmap

Data Platform Mission 3. Follows directly from `docs/FIELD_EXPANSION_MATRIX.md`'s P0–P3
classification — this doc is the "how and in what order," not a re-statement of "what's missing."
No proprietary connector is proposed anywhere below without a stated licensing position; where one
would be needed (external ratings) the recommendation is explicitly **do not build**, per the
brief's own instruction not to implement connectors without confirming they can be used.

Every source cited here is either a regulatory-mandated public disclosure (SID, SAI, factsheet,
monthly portfolio disclosure — all AMCs must publish these under SEBI Mutual Fund Regulations) or
AMFI/SEBI's own public data. Nothing below scrapes a paywalled or ToS-restricted third party.

---

## Phase 0 (do first — hours, not weeks): fix what's already built

These aren't acquisition tasks. The schema, the pipeline, and the provenance wiring already exist
for all three; something in the extraction step itself is wrong or missing.

| Field | Fix required | Why it's cheap |
|---|---|---|
| Minimum SIP | Add/correct the SBI adapter's regex for the "Minimum Investment" box's SIP line | Schema column, provenance tracking, and the PDF box itself all already exist — the adapter just doesn't match it. Every other field extracted from the same box works. |
| Minimum Investment (lumpsum) | Same fix, same box, different line | Same reasoning. |
| Launch Date, SIP Minimum, Lumpsum Minimum surfaced on the dashboard | Already done this mission — three `fieldRegistry.js` rows added, zero new ingestion | The audit engine (`market_coverage_audit.py`) already computed these; they just weren't wired to the JS-side registry the dashboard reads. |

**Legal/licensing:** none — this is a bug fix against an already-approved source.
**Automation feasibility:** trivial, same pipeline that already runs.

---

## Phase 1 (P2 — clear source, needs real new extraction work)

| Field | Primary source | Fallback | Public? | Format | Cadence | Automation feasibility | Legal/licensing |
|---|---|---|---|---|---|---|---|
| Expense Ratio | AMC website's dedicated TER disclosure page (not the factsheet — SBI's factsheet doesn't carry it at all) | AMC factsheet, where present | Yes, regulatory disclosure | HTML, per-AMC template | Varies by AMC, shorter than monthly for some | Medium — one adapter per AMC's TER page, same shape as the existing `ingestion/factsheet/adapters/` pattern | Public regulatory disclosure, no restriction |
| Exit Load | SID | AMC factsheet | Yes | PDF, free-text clause | Static, event-driven | Medium-high — needs structured parsing of a free-text clause ("1% if redeemed within 1 year, nil thereafter"), not just presence/absence | Public regulatory disclosure |
| Fund Manager (current, expanded beyond SBI) | AMC factsheet | — | Yes | PDF | Monthly | Medium — same adapter pattern as SBI's, replicated per AMC (Mission 5's actual purpose) | Public |
| Sector Allocation (expanded + contamination fix) | AMC factsheet summary | Derived from full monthly portfolio disclosure | Yes | PDF (summary) / XLS (full) | Monthly | Medium — fix the known subtotal/stock-name contamination defect before scaling, or it scales the defect too | Public |
| AUM (per-scheme, expanded) | AMC factsheet | AMC website dedicated AUM page (untried) | Yes | PDF / HTML | Monthly | Low, same pattern as existing pilot | Public |
| Riskometer (expanded) | AMC factsheet | AMC scheme page | Yes | PDF / HTML | Monthly | Low | Public |
| Lock-in | SID, statutory for ELSS | — | Yes | PDF | Static | Low for ELSS (hardcode as a rule: 3 years, SID as the citation) — **do not infer for any other category**, most open-ended schemes have none and the field must express "not applicable" distinctly from "unknown" | Public; ELSS lock-in is Income Tax Act law, not AMC discretion |
| Fund Objective | SID "Investment Objective" section | AMC factsheet short summary line | Yes | PDF | Static | Medium — first-ever SID free-text ingestion in this codebase, needs a new extraction target, not just a new field on the existing adapter | Public |

**Sequencing rationale:** these all reuse Mission 5's factsheet pipeline once it exists in
multi-AMC form — building the pipeline generically (Mission 5) and populating these fields are the
same engineering effort, not two separate projects.

---

## Phase 2 (P3 — needs new infrastructure before any scheme can be populated)

| Field | Primary source | Structured vs PDF | Cadence | Automation feasibility | Why it needs new infrastructure |
|---|---|---|---|---|---|
| Portfolio Holdings (complete, not top-10) | AMC monthly portfolio disclosure | Structured XLS/XLSX (the current pipeline only ever tries the factsheet's abbreviated top-10 PDF table) | Monthly | High effort, high payoff — XLS is more reliable than PDF table extraction once built | Different source file entirely from what's ingested today |
| Asset Allocation (equity/debt/cash %) | AMC factsheet (mandate) + monthly portfolio disclosure (actual) | PDF + XLS | Monthly (actual) / static (mandate) | Medium | Two distinct numbers (mandate range vs actual current split) must not be conflated into one field |
| Duration, Yield, Average Maturity, Modified Duration, Credit Quality | AMC factsheet "portfolio characteristics" / "rating profile" box (debt schemes only) | PDF table | Monthly | Medium-high — one parser investment covers all five, since they share the same source box | Debt/hybrid-only (~6,900 of 14,227 schemes) — needs asset-class-aware routing the current SBI-only equity-heavy pilot doesn't have. Credit Quality additionally needs rating-agency-name normalization (CRISIL AAA / ICRA AAA / CARE AAA → one canonical grade) |
| Portfolio Turnover | AMC factsheet | PDF | Monthly | Medium | Not currently extracted by any adapter at all |
| Manager History (tenure over time) | SAI | PDF, likely narrative/table hybrid | Static, append-only as changes occur | High | Needs a one-to-many table (scheme → manager → tenure start/end), not a column — first SAI ingestion of any kind in this codebase |
| Scheme Status (active/closed/merged) | Derived — AMFI's daily feed only lists active schemes, no status field exists | N/A — computed via presence/absence diff | Daily, as a diff | Medium | Cannot be extracted from a single day's snapshot at all; requires day-over-day comparison against `dim_scheme`. This is Mission 6 (Change Detection) — do not build a parallel one-off mechanism just for this field |

**Sequencing rationale:** every row here is blocked on Mission 5 (generic factsheet pipeline, for
the PDF-sourced fields) or Mission 6 (change detection, for Scheme Status) actually existing —
listing them as "acquire this data" tasks before those missions exist would understate the real
dependency.

---

## Explicitly out of scope — do not build

| Field | Why |
|---|---|
| Entry Load | Not a data gap — SEBI banned entry loads industry-wide in 2009 (circular SEBI/IMD/CIR No.4/168230/09). The true value is uniformly zero for the entire current universe. Correct implementation: one static citation, not a per-scheme extraction pipeline. |
| Fund Age | Pure arithmetic on Launch Date (today − launch date). Not an acquisition target; implement as a computed display value once Launch Date coverage grows. |
| Ratings (CRISIL / star ratings) | Requires a paid license from the rating agency. MF Pulse has none and does not scrape or infer these values from any source. **Do not build a connector without first confirming licensing terms with the rating agency** — this is the brief's own constraint, and it's a hard blocker, not an engineering one. MF Pulse's own internal rating (`qualityEngine.js`, 8 explainable dimensions, deterministic) is a separate, already-built thing and is not affected by this. |

---

## Priority order (combining Phase 0–2 into one sequence)

1. **Phase 0** — Minimum SIP / Minimum Investment extraction fix (hours; already-built pipeline, already-tracked provenance, zero new source work).
2. **Mission 5** (Factsheet Pipeline, generalized beyond SBI) — this is the actual unlock for nearly every Phase 1 and Phase 2 field. Building it once, well, is worth more than any single field on this list.
3. **Phase 1 fields**, populated as Mission 5 comes online per-AMC (Expense Ratio, Exit Load, Fund Manager, Sector Allocation, AUM, Riskometer, Lock-in, Fund Objective).
4. **Mission 6** (Change Detection) — unlocks Scheme Status and manager/expense/benchmark change events as a byproduct, not a separate build.
5. **Phase 2 debt-specific fields** (Duration, Yield, Average Maturity, Modified Duration, Credit Quality) as one parser investment, scoped to the debt/hybrid sub-universe specifically rather than assumed universal.
6. **Manager History** — lowest-frequency-of-change field on this list; correctness matters more than speed here, and it's the first SAI ingestion this codebase will have ever done.

Not resequenced by "easy wins first" beyond Phase 0 — Mission 5 gates almost everything else, so
front-loading it is what actually shortens the real timeline, even though it's not the single
cheapest individual field.
