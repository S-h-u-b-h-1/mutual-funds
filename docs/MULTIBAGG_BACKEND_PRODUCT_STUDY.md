# Multibagg AI Investor's Suite — Backend/Data Capability Study for MF Pulse

**Scope**: backend and data-architecture translation only. `docs/MULTIBAGG_COMPETITIVE_STUDY.md`
(same repo, written earlier the same day) already covers the UX/IA/visual-design side in depth —
this document does not repeat that; it starts from its findings and asks a narrower question for
each capability: *what backend data, event model, and freshness contract would a mutual-fund
equivalent need, and does MF Pulse already have it?*

**Method**: public-surface observation only. Fetched `https://www.multibagg.ai/investors-suite/portfolio`
directly this pass (not logged in) to independently confirm the navigation taxonomy and messaging
before writing this — the unauthenticated Portfolio page shows a bare "Connect Portfolio" gate,
confirming the real functional depth (dashboard, timeline, Ask Iris grounding) sits behind auth and
is not publicly inspectable. Everything about Multibagg's actual backend implementation below is
**inference from public UI/copy, not observed fact** — marked accordingly. Everything about MF
Pulse is verified directly against this session's own code, schema, and test runs, not assumed from
earlier documentation (per this mission's own standing rule). No proprietary Multibagg code or
design assets are reproduced.

---

## 1. Product capability study → mutual-fund translation

| Capability | Customer sees | Backend data likely required | Event/state model | Freshness expectation | Personalization | MF Pulse has? |
|---|---|---|---|---|---|---|
| **Portfolio** | Connect → dashboard, sector/risk decomposition | Broker OAuth token store or CAS parse, holdings table, live price feed | Portfolio snapshot + diff events | Intraday (equity) | Per-holding, per-user | **PARTIAL** — CAS import + revaluation exist and are now well-tested (this session's Phase 1/2 work); no broker/RTA OAuth sync (mode B below) |
| **Dashboard** | Consolidated value/gain/risk in one screen | Aggregation across portfolio+watchlist+alerts+timeline | None new — read model over existing state | Matches slowest underlying source | Per-user | **GAP** — no single consolidated endpoint yet; see §10 |
| **Timeline** | Chronological feed of filings/events per holding | Document ingestion + entity linking + per-user filter | Append-only event log, fanned out per relevant user | Near-real-time for filings | Filtered to user's holdings/watchlist | **PARTIAL** — a real event bus exists (`emitEvent`, 7 registered event types, production-tested) but its catalog is narrow; see §7 |
| **Discovery** | Thematic stock buckets (EV, Semiconductors...) | Static/curated theme→entity mapping, refreshed periodically | None — mostly batch-computed | Daily/weekly | Not personalized (explicitly, per directive) | **PARTIAL** — `/discover` exists (category chips, top-consistency/3M-return funds) but no named thematic buckets yet; see §11 |
| **Watchlists** | Multi-list stock tracking | User-scoped list + join to live data | None new | Matches underlying instrument | Per-list | Not audited this pass — out of scope, no CAS/onboarding overlap |
| **Ask Iris / AI interaction** | Conversational, cites source documents | RAG over indexed filings + grounding guardrails | None new — read-only over indexed corpus | Matches document index freshness | Full conversation history | **GAP** — no equivalent exists; see §9 for the data contract a safe version would need |
| **Alerts** | Price/filing/institutional-flow triggers | Rule evaluation against live/event data + delivery queue | Trigger→notify pipeline | Depends on trigger type | Per-user rule set | **PARTIAL** — a real notification platform exists (Phase 4.5/M5: schema, channel providers, preferences, exactly-once delivery, all tested) but its trigger catalog doesn't yet cover most Multibagg-equivalent MF triggers; see §8 |
| **Deep research** | Concall summaries, earnings tracker | Document processing pipeline (OCR/transcript + summarization) | Batch job per new document | Hours after filing | Not personalized | **N/A translation** — AMCs don't hold quarterly concalls per scheme; factsheet/SID/KIM cadence is monthly/on-amendment, not earnings-driven |
| **Market learning** | Concept explainers woven into UI | Structured fact/definition/interpretation content | None — static content, versioned | Rarely changes | Not personalized | **GAP** — no structured knowledge layer; tooltips exist ad hoc across pages, not a queryable backend model; see §6 |
| **Personalized investor experience** | Content scoped to user's actual holdings | Every above capability filtered by owned/watched entities | — | — | Core to every capability | **PARTIAL** — portfolio-scoped filtering exists for holdings/compliance; not yet for timeline/alerts/discovery |
| **Portfolio connection/sync** | "Connect Portfolio" broker OAuth | Token vault, periodic re-sync job, reconciliation on conflict | Sync job + diff/reconcile event | As fresh as the broker's own API | Per-user | **GAP for mode B** (see §3) — mode A (CAS) and mode C (Suasion-native) both exist but aren't reconciled into one model yet |
| **Data freshness (surfaced to user)** | "Prices might be delayed by a few minutes" disclaimer, live ticker | Per-source freshness tracking | — | Source-dependent, explicitly disclosed | — | **PARTIAL** — `/api/freshness` exists and is genuinely good (this session verified it end-to-end during the NAV incident) but is NAV-pipeline-specific, not a general per-source-type contract; see §4 |
| **Research freshness** | Implicit in filing timestamps | Per-document ingestion timestamp | — | Minutes for filings | — | **GAP** for factsheets/AMC notices specifically (news ingestion has its own freshness signal, verified in an earlier pass this session) |
| **Account/onboarding flow** | Gamified Quest (diamonds, streaks) | Progress tracking, reward state | Achievement-unlock events | N/A | Per-user progress | **STRONGER at MF Pulse** — the 8-step compliance/investment-readiness engine (identityService/complianceService, backend-authoritative, extensively tested this session and earlier) is a real regulatory onboarding flow, not gamification; not a fair comparison, different purpose (compliance vs. engagement) |

Translation examples the directive asked for, confirmed applicable:

| Stock concept | MF equivalent | Already exists? |
|---|---|---|
| Stock Watchlist | Fund Watchlist | Not audited this pass |
| Corporate Timeline | Fund/AMC/Portfolio Timeline | Event bus exists, catalog too narrow (§7) |
| Company filings | AMC factsheets / SID / KIM / monthly portfolio disclosures | Factsheet ingestion exists (Provenance Mission, earlier this session); SID/KIM document store does not |
| Market movers | Fund/category/AMC flows, NAV movement | Flow Signals (category-level, real MCR data) shipped earlier this session; fund-level "movers" framing not built |

**Explicitly irrelevant, not ported**: intraday price breakouts/candlestick technicals (NAV is
once-daily, EOD); concall summarization (no scheme-level concalls exist); broker execution
redirects (MF Pulse has a native order engine, strictly stronger for this specific capability).

---

## 2. Hypothesized portfolio architecture

Multibagg's public flow (Connect Portfolio → dashboard → AI questions → timeline → alerts) implies
this pipeline, inferred from the UI sequence, not observed:

```
Broker OAuth / CAS import
        │
        ▼
Raw holdings + transaction ledger
        │
        ▼
Entity resolution (ticker/ISIN → canonical company)
        │
        ▼
Live price join
        │
        ▼
Analytics (sector/risk/concentration)
        │
        ▼
AI context assembly (Ask Iris grounding)
        │
        ▼
Timeline filter + Alert evaluation
        │
        ▼
Dashboard read model
```

**MF Pulse's real, current pipeline** (verified this session, not the same as the above — mutual
funds have a materially different shape: no live intraday price, a canonical-scheme-resolution step
equity investing doesn't need, and a formal compliance gate before any transaction can occur):

```
CAS PDF (mode A) ──┐
Provider sync (mode B, not built) ──┼──▶ parse → normalize → canonical scheme resolution
Suasion order (mode C) ─────────────┘         │
                                               ▼
                                    portfolio_holdings / portfolio_transactions
                                    (this session: unresolved holdings now persist
                                     standing, not just in an upload response — §1A/§3)
                                               │
                                               ▼
                                    Daily NAV revaluation (production-refresh.yml,
                                    this session's Phase 1 NAV-freshness fix)
                                               │
                                               ▼
                                    currentValue / gainLoss / XIRR
                                    (XIRR now returns a reason when unavailable,
                                     never a fabricated 0 — this session, §Phase 4)
                                               │
                                               ▼
                        Portfolio API (fragmented today — see §10) → Dashboard
```

**Audit verdict**: the pipeline exists end-to-end and the P0 correctness work this session closed
several real gaps in it (transaction classification, idempotency, statement-vs-live valuation
distinction, unresolved-holdings persistence). What's genuinely missing relative to Multibagg's
model is the **reconciliation step across three sources** (§3) and a **single consolidated read API**
(§10) — the equivalent of their "dashboard" layer.

---

## 3. Portfolio sync model — three sources, one economic portfolio

The directive's explicit requirement: manual CAS import (A), authorized provider sync (B, future),
and Suasion-generated activity (C) must reconcile into ONE portfolio, never two.

**Current state, verified directly from the code, not assumed**: Mode A (CAS) writes to
`portfolio_holdings`/`portfolio_transactions` keyed on `(user_id, scheme_code, source,
folio_number)` with `source = 'cas'`. Mode C (Suasion orders) settles through
`portfolioService.js`, whose own header comment states the design intent explicitly: *"portfolio_holdings/
portfolio_transactions are the ONE canonical source regardless of origin — CAS import, a completed
Journey 2 order, or an explicit mock-connect action all write into the same two tables, tagged by
`source`. Nothing downstream (allocation, health score, valuation) needs to know which."* Confirmed
by reading `getUserHoldings`/`getUserTransactions` (`holdingsRead.js`), which `portfolioService.js`
calls directly against these exact tables — the same ones `casUpload.js` writes to. (`casUpload.js`
itself computes its own upload-response valuation via `buildHolding()`/`computePortfolioXirr()`
rather than calling `portfolioService.js`'s `revaluePortfolio()` — two call paths, but both reading
and writing the same underlying tables, which is the property that actually matters here.) **This is
a meaningfully better starting position than a from-scratch design would suggest**: the schema was
already source-agnostic (a `source` column, not two parallel tables), so modes A and C are not
actually "two separate portfolios" today — they already share one physical model, by explicit prior
design, not by accident. Mode B does not exist (no provider is connected yet — correctly not faked,
per this mission's own explicit constraint against building live provider integrations).

**What's still a real gap**: nothing currently *reconciles conflicting facts* across sources for the
same economic position. Example: if a CAS import reports 1000 units of a scheme in folio X, and a
Suasion-executed purchase later adds units to the same folio/scheme, does the next CAS re-import
correctly recognize "this folio now also reflects a Suasion-originated purchase" rather than
silently overwriting Suasion's own more-authoritative running balance? **Not yet verified — flagged
as the concrete next audit for Phase 2's accounting-reconciliation work already in progress this
session**, not answered by this document. The `ON CONFLICT ... DO UPDATE SET units = excluded.units`
upsert in `casUpload.js` (this session, unchanged) means a re-import currently **overwrites** the
unit count unconditionally — correct for "CAS is the fresher source of truth for a manually-tracked
folio," but not yet proven correct for "this folio also has Suasion activity," because that
cross-source precedence rule has never been explicitly decided or tested. This is the single most
important open question this study surfaces.

---

## 4. Data freshness model

Multibagg's public copy ("Prices might be delayed by a few minutes") implies a lightweight,
single-sentence freshness disclosure — not a structured per-source contract visible to the user.
The directive asks for something more rigorous than that on MF Pulse's side, which is the right call
for a platform that also executes real transactions (Multibagg does not).

**What MF Pulse already has, verified this session**: `/api/freshness`
(`frontend/app/api/freshness/route.js`) returns `rawLatest`, `bundleAsOf`, `bundleMatchesRaw`,
`pipelineHealth: {nav_latest_date, nav_staleness_days, total_schemes, total_nav_rows, status}`,
`deployedCommitSha`, `branch` — a genuinely good, real signal, live-verified during this session's
NAV-freshness incident closure (confirmed `bundleAsOf == rawLatest`, `status: "green"`). This is
**NAV/bundle-specific**, not the general `source_as_of/fetched_at/processed_at/served_at/status`
contract the directive asks for per data type.

**Gap, concretely**: no equivalent structured freshness object exists for AMC factsheets, portfolio
holdings (staleness of a given CAS import vs. today), transaction state (has this order's provider
callback been processed yet — the notification/reconciliation platforms track this internally but
don't expose a freshness-shaped summary), regulatory notices, scheme metadata, AUM, or risk metrics.
**Recommendation, not built this pass** (correctly out of scope — this document is study, not
implementation, per the directive's own "do not derail P0" instruction): a shared
`{source_as_of, fetched_at, processed_at, served_at, status}` shape, reused across every freshness
signal rather than each surface inventing its own — `/api/freshness`'s existing shape is the closest
real precedent to generalize from, not a green-field design.

---

## 5. Fund intelligence model

Checked the actual live fund data model (`frontend/app/data/funds.json`, 14,213 schemes) against
the directive's requested field list, rather than assuming coverage:

| Field | Present? |
|---|---|
| Identity, AMC, category, plan, option | Yes |
| Benchmark | Yes (`benchmark` field, confirmed in `buildHolding()`'s output this session) |
| NAV/date | Yes (`nav`, `navDate`, `staleDays`) |
| AUM/date | **No** — flagged as a known gap in an earlier session's own audit doc (`mfpulse-data-source-facts` memory: "no-AUM") |
| Expense ratio | Yes, via `getMetadata()` |
| Exit load, min investment, min SIP | Not verified this pass |
| Fund managers | Not verified this pass |
| Investment objective | Not verified this pass |
| Portfolio composition / top holdings / sector allocation | Exists per earlier Provenance Mission work (factsheet ingestion) for pilot AMCs only, not universal |
| Duration/credit quality (debt) | Debt metadata engine listed as a pending Provenance Mission phase — not yet built |
| Historical/rolling returns, risk metrics (Sharpe, volatility, drawdown, benchmark comparison) | Yes — confirmed real, computed from actual index NAV series (an earlier session's own verified work), not estimated |
| Peer/category comparison | Yes, via `/compare` and category views |
| Factsheet provenance, data freshness | Provenance engine exists (Data Platform Mission) but not universally wired |

**Verdict**: materially stronger than a "study says we lack fund intelligence" framing would
suggest — most of the hard, deterministic analytics (returns, risk, Sharpe, drawdown, benchmark
comparison, computed from real index data) already exist and were independently verified in earlier
sessions, not inferred here. The real gaps are specific, named fields (AUM, exit load, fund
managers, investment objective, debt duration/credit quality) — a field-coverage completion task,
not a new engine.

---

## 6. Education / knowledge model

Directive requirement: `fact`, `definition`, `interpretation`, `limitations`, `source/provenance`
per concept — explicitly NOT generated prose as the source of truth.

**Current state**: tooltips and explanatory copy exist ad hoc across fund pages, research cards, and
the goal-planning/tax-intelligence features (multiple earlier sessions' work). Grepped for a
structured, queryable knowledge model (a table or JSON keyed by concept, e.g. `xirr`, `exit_load`,
`sip`, with the four required fields) — **none exists**. Every explanation is currently embedded
directly in JSX/copy, not sourced from a shared backend fact store. This means the SAME concept
(e.g. "what is XIRR") could plausibly be worded differently in two different places, and there's no
single place to correct or version an explanation.

**Gap, not built this pass**: a `knowledge_facts` table or static registry (`concept`, `fact`,
`definition`, `interpretation`, `limitations`, `sourceUrl`/`sourceDoc`) that UI copy reads from
rather than hardcodes. This is real, valuable, low-risk work — a strong candidate for a focused
future slice, explicitly deferred here per "do not derail P0."

---

## 7. Personalized timeline — reuse the existing event bus, don't build a second one

The directive is explicit: "Use the existing event bus if appropriate. Avoid a second event
architecture." Verified the existing one directly (`frontend/app/lib/platform/events/core.js`) —
it's real, production-tested (Phase 4 M4, confirmed via this session's own full-suite runs), and its
current catalog is exactly 7 events: `InvestorCreated`, `ComplianceCompleted`, `InvestmentReady`,
`OrderSubmitted`, `OrderCompleted`, `PortfolioUpdated`, `NotificationSent`.

Every item on the directive's own requested Timeline content list already has a natural home in this
same architecture — extending the catalog, not building a second system:

| Directive's timeline item | Maps to existing event, or a clearly-scoped new one |
|---|---|
| Purchase submitted / units allotted | Extends `OrderSubmitted`/`OrderCompleted` (already exist) |
| SIP installment, mandate state | New event types, same bus |
| Redemption, switch | New event types, same bus (Redemption/Switch Contracts already exist as of an earlier session — this would be their first Timeline-visible surface) |
| Document generated | Document Vault (Journey 4, earlier session) already exists; not yet wired to emit an event |
| KYC/compliance update | `ComplianceCompleted` already exists |
| Portfolio import, unresolved CAS mapping | New — directly maps to this session's own new `portfolio_unresolved_holdings` table (§1A) |
| Fund manager/expense ratio/benchmark change, scheme merger | New — requires the AMC-notice ingestion this doesn't yet have (§12) |
| Freshness degradation | New — could emit from the `/api/freshness` pipeline health check |
| Notification sent | `NotificationSent` already exists |

**Verdict**: no new architecture needed. The concrete backend work is catalog extension +
emit-call wiring at each of the ~6 new event sites listed above, filtered to the owning user for a
Timeline read API — a well-scoped, bounded next slice once P0 accounting work closes.

---

## 8. Alerts — extend the existing notification platform, same reasoning as §7

`frontend/app/lib/platform/notifications/` (Phase 4.5/M5, this session's full-suite run confirms 14
tests passing against real Neon: preference evaluation, async delivery, exactly-once semantics,
dead-lettering) is a genuinely complete delivery engine. What it currently lacks is a **trigger
catalog** mapped to MF-relevant conditions — the directive's list (SIP due/failed, mandate issue,
purchase/redemption/switch completed, KYC/bank issue, portfolio import issue, NAV stale, AMC notice,
expense ratio/fund manager/riskometer change, scheme merger, allocation drift, large concentration,
document available) is a real, sensible, mostly-new set of trigger definitions to wire into the
EXISTING `sendNotification()` engine — not a new delivery system.

Explicitly correct in the directive: no speculative "buy this fund" recommendation alerts without a
suitability/compliance design first — this matches the Trust Sprint's own earlier regulatory-risk
audit finding (no guarantees, no buy recommendations) and should stay a hard boundary.

---

## 9. AI portfolio assistant — data contract, not implementation

No "Ask Pulse"/"Ask Iris" equivalent exists in MF Pulse today (confirmed by search — no RAG/LLM
grounding layer over portfolio data). The directive's own instruction is exactly right and matches
this mission's whole ethos: **the assistant must be grounded entirely in authoritative data, never
hallucinate a financial value.** The concrete backend requirement, before any AI layer is built, is
a **read-only, structured context API** the assistant would query rather than free-text search —
effectively the same shape as §10's Dashboard API, reused. Every example question the directive lists
("What is my XIRR?", "Why did my value change?", "What changed since my last CAS?") maps to a field
or diff already computable from real tables this session verified are correct:
- "What do I own / invested / gain" → `portfolio_holdings` + `revaluePortfolio()`
- "What is my XIRR" → `computePortfolioXirr()`'s new `portfolioStatus`/`byStatus` (this session) —
  already answers "is it available and why not" without the assistant needing to guess
- "What changed since my last CAS" → `portfolio_uploads` history + the new `portfolio_unresolved_holdings`
  resolve-tracking (this session)
- "Which holdings overlap" → the existing Overlap Engine (Portfolio Intelligence Phase B, earlier session)

**Verdict**: the DATA this assistant would need to stay grounded already substantially exists and
was substantially hardened this session. The gap is purely the conversational layer itself —
correctly out of scope for a backend-correctness pass.

---

## 10. Customer dashboard API — the real, current gap

Audited directly: there is currently no single endpoint returning portfolio value, invested value,
gain/loss, XIRR, valuation date, allocation, active SIPs, pending transactions, recent timeline, and
readiness in one response. `casUpload.js`'s response is upload-scoped, not a standing dashboard read.
`portfolioService.js` (Invest platform) and `holdingsRead.js`/`casNormalizer.js` (CAS import) are
two related-but-separate read paths for what should be one economic portfolio (see §3's precedence
question — this is the same underlying gap surfacing again from the dashboard-API angle). This
matches the directive's own instinct exactly: "the customer should not wait for 15 separate API
calls." **This is the single highest-leverage next piece of backend work once the P0 accounting
audit (Phase 2, in progress) closes** — a canonical read model over data that mostly already exists
and is now more correct than it was at the start of this session.

---

## 11. Discovery model

`/discover` exists (verified: category chips linking to `/categories/[name]`, funds ranked by
consistency/3-month return, category view counts) — real, but closer to a filtered leaderboard than
Multibagg's named-theme model ("India Semiconductor Push"). The directive's own MF-equivalent
examples (low-cost index funds, large-cap, flexi-cap, small-cap, tax-saving, liquid, short-duration
debt, hybrid, passive, by-AMC, by-risk, by-horizon) are all **derivable from fields that already
exist** in `funds.json` (`category`, `assetClass`, `expenseRatio`, `isDirect`) — this is a
curation/bucketing task over existing data, not a new data-acquisition task. Correctly scoped as a
P2 item per the directive's own execution order, not attempted this pass.

---

## 12. Data source study

| Source | MF Pulse status (verified this/earlier sessions) |
|---|---|
| AMFI (NAV, scheme master) | **Live, primary.** This session's own Phase 1 work fixed and backfilled the ingestion pipeline; confirmed green in production. |
| AMC factsheets | Ingested for pilot AMCs (Provenance Mission), not universal — expansion explicitly pending (Provenance Mission Phase 5). |
| SEBI / scheme documents (SID/KIM) | Not ingested. No document store exists for these. |
| BSE/NSE (relevant only for the equity legs of hybrid/index funds' benchmark data) | Real index NAV series exist for Alpha/Beta/Treynor computation (earlier session), not a live feed. |
| CAMS/KFin/MFCentral | Authorized-user CAS PDF parsing only (this session hardened this substantially) — no live authenticated provider connection, correctly not faked. |
| Financial news | Real ingestion pipeline exists (earlier session), own freshness signal. |
| Suasion transaction data | Real, native (Invest platform, multiple earlier sessions), now confirmed to share the same holdings/transactions tables as CAS import (§3). |

No scraping of protected/authenticated systems occurred or is proposed anywhere in this document,
consistent with the directive's own explicit constraint.

---

## 13. MF Pulse vs. Multibagg — honest comparison matrix

| Capability | Multibagg public experience | MF Pulse current | MF Pulse advantage | MF Pulse gap | Backend work | Priority |
|---|---|---|---|---|---|---|
| Portfolio import | Broker OAuth + CAS fallback | Native CAS engine, hardened extensively this session (classification, dedup, idempotency, statement-vs-live valuation) | Deeper CAS correctness, verified not assumed | No broker/RTA live sync (mode B) | Provider adapter (blocked — no credentials) | P1 (blocked) |
| Portfolio↔transaction reconciliation | Unknown (inferred: single broker-synced ledger) | Modes A/C share one schema already; precedence rule under conflict untested | Schema was already source-agnostic | No proven conflict-resolution rule | Design + test the precedence rule | **P0 — feeds directly into current accounting work** |
| Dashboard | Consolidated, one screen (inferred) | Fragmented across 2+ read paths | Underlying data mostly correct now | No single read model | Canonical Dashboard/Portfolio API | **P0, next** |
| Timeline | Real, filing-driven | Event bus exists, narrow catalog | Reuses proven infra, not a rebuild | Missing ~6 event types + emit sites | Catalog extension | P1 |
| Alerts | Real, multi-trigger | Notification platform exists, narrow trigger catalog | Delivery engine already exactly-once/tested | Missing MF-specific triggers | Trigger definitions | P1 |
| AI assistant | Real, RAG-grounded | None | — | No conversational layer at all | Grounded context API (data mostly ready) + LLM layer | P2 |
| Fund intelligence | Deep for equities | Deep for the fields that exist; AUM/exit-load/managers missing | Real computed risk metrics, verified | Named field gaps | Field completion, not new engine | P1 |
| Knowledge/education layer | Concall summaries (not transferable) | Ad hoc tooltips, no structured store | — | No fact/definition/interpretation/provenance model | New, small, low-risk | P2 |
| Discovery | Named themes | Category leaderboard | Real underlying data | No named buckets | Curation over existing fields | P2 |
| Onboarding/compliance | Gamified engagement | Real regulatory compliance engine | Not comparable — different purpose, MF Pulse's is a regulatory requirement Multibagg doesn't have | — | — | Already strong |
| Execution | Broker redirect | Native order engine (Purchase/SIP/Redeem/Switch) | Real transaction execution, Multibagg has none | — | — | Already strong |

---

## 14. What this changes about the current roadmap

Per the directive's own instruction, this study does not interrupt the in-progress P0 accounting
work. It does sharpen what comes right after it:

1. **Finish the current Phase 2 accounting-reconciliation audit** (already in progress) — §3 above
   found the precedence question it needs to answer explicitly (CAS re-import vs. Suasion-originated
   activity on the same folio).
2. **Canonical Dashboard/Portfolio API** (§10) is the highest-leverage next P0-adjacent piece — most
   of its underlying data is now correct, it just isn't exposed as one read.
3. **Event bus catalog extension** (§7) and **notification trigger catalog** (§8) are real, bounded,
   low-architectural-risk P1 work — reusing infrastructure this session confirmed is production-solid.
4. **AI assistant, discovery buckets, and the knowledge layer** (§9, §11, §6) are legitimate P2
   work — the data they'd need is mostly ready, but building the surface itself is correctly
   deferred until foundational correctness (still in progress) is done.
