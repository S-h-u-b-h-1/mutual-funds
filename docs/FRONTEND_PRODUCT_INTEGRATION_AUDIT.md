# MF Pulse × Suasion Securities — Frontend Product Integration Audit

Date: 19 July 2026  
Scope: every visible App Router page, shared navigation and UI primitives, generated frontend data artifacts, authenticated portfolio APIs, and currently disconnected deterministic engines.

## Executive finding

MF Pulse is already a credible mutual-fund research product. Its strongest capabilities are verified AMFI data, fund/category/AMC research, explainable quality scoring, generated coverage artifacts, source records, portfolio import and persistence, deterministic portfolio analytics, news relevance, watchlists, and research synchronization.

It is not yet a complete Suasion Securities investment platform. Compliance, order execution, payment, transaction tracking, document custody, goal tracking, SIP management, advisor servicing, notifications, tax reports, and operational administration do not have complete customer-facing journeys or shared API contracts. Those experiences must not be implied by decorative dashboard cards.

The immediate frontend integration priority is therefore:

1. Make existing research evidence, coverage, confidence, freshness, and methodology consistently visible.
2. Turn data completeness and AMC intelligence into understandable public product experiences.
3. Keep the persistent portfolio truthful while newer backend contracts arrive.
4. Establish an Invest information architecture without presenting unimplemented regulated actions as available.

## Classification vocabulary

- **Connected** — live or generated verified data reaches a functional UI.
- **Partially Connected** — meaningful real data is present, but important evidence, states, or actions are missing.
- **Dead** — a visible control or route has no useful result.
- **Placeholder** — the interface implies a capability that is not implemented.
- **Static** — editorial or bundled content, intentionally not live.
- **Duplicate** — substantially overlaps another route or control.
- **Hidden Backend Capability** — implemented engine/data that is not meaningfully exposed.
- **Needs Backend API** — frontend cannot complete the experience without an authoritative contract.
- **Needs UI Only** — backend evidence exists; presentation and interaction are the remaining work.

## Visible route audit

| Route | Current classification | What is connected | Principal integration gap |
| --- | --- | --- | --- |
| `/` | Partially Connected | AMFI-derived brief, research signals, authenticated portfolio summary, watchlist, coverage artifact | Research and Invest are not clearly separated; too many acquisition/workspace sections compete with the next action |
| `/brief` | Partially Connected | Daily bundle, category commentary, signals | Some sections retain report-like density and legacy flow framing; evidence hierarchy is inconsistent |
| `/dashboard` | Partially Connected | Research queue, portfolio entry, watchlist/notebook/comparison sync, news | Product dashboard is a research workspace rather than the requested investor command center; internal links leak into customer UI |
| `/market-map` | Partially Connected | Derived market/category visualization | Accessible evidence table, mobile interaction, selection explanation and current-source context need strengthening |
| `/performance` | Connected | AMFI NAV-derived returns, risk, AMC quality and CSV export | Quality/freshness evidence is mostly page-level instead of metric-level |
| `/funds` | Connected | Server-side generated fund universe, coverage filters, comparison selection | Result cap is not paginated; mobile density and persistent filters need improvement |
| `/fund/[scheme_code]` | Partially Connected | Fund profile, quality engine, factsheets, provenance, risk/performance, notes and related research | High cognitive load; explainable score and provenance are buried in a very large client component |
| `/categories` | Connected | AMFI-derived category movement and export | Coverage/confidence is page-level; distribution and category limitations are understated |
| `/categories/[category]` | Partially Connected | Category peer funds and news | Ranking evidence, missing-data summary and mobile comparison path are incomplete |
| `/amc` | Partially Connected | AMC scheme counts and research links | Does not preview AMC quality, coverage or confidence despite existing engine |
| `/amc/[amc]` | Partially Connected / Needs UI Only | Live scheme summary, NAV history, AMC intelligence, signals, news | Existing intelligence is one dense block; score evidence, category presence, coverage, limitations and provenance are not a coherent executive view |
| `/benchmark/[slug]` | Partially Connected | Funds mapped to the benchmark | Thin entity page; lacks source definition, coverage, freshness, limitations and comparison framing |
| `/manager/[slug]` | Partially Connected | Factsheet-derived current manager/fund links | Current-manager coverage is low and tenure history is unavailable; limitations need stronger prominence |
| `/discover` | Partially Connected | Evidence-led fund/category discovery | Distinct recommendation, activity, quality and popularity signals are not consistently separated |
| `/signals` | Connected | Rule-based movement signals | Severity, coverage and methodology need more progressive disclosure |
| `/signals/[amc]/[cat]` | Connected | Full deterministic AMC/category intelligence | Functionally deep but visually technical; needs alignment with redesigned AMC summary |
| `/compare` | Partially Connected | Fund and AMC comparisons, saved comparison persistence | Large matrices dominate conclusions; uncertainty and provenance should be summarized before detail |
| `/research` | Partially Connected | Strategy builder, reports and research workspace | Dense client surface; relationship to compare, notes and portfolio is unclear |
| `/portfolio` | Partially Connected | Authenticated holdings, upload, valuation, invested value, gains, XIRR, leaders and deterministic intelligence | Draft/review/approval, history, snapshot diff, daily change and full production persistence certification still require backend contracts |
| `/news` | Connected | Live/recent articles, source health and rule-based entity relevance | Terminal density and impact confidence compete with source hierarchy on mobile |
| `/methodology` | Static / Partially Connected | Calculation explanations | Not searchable and not consistently deep-linked from individual metrics |
| `/data-quality` | Partially Connected / Needs UI Only | Dataset status and provenance labels | Does not expose the live field matrix, missing percentages, validation, filters, search or detail explanations |
| `/data-status` | Connected | Live pipeline/freshness/system data | Technical reliability and customer-facing data trust are mixed together |
| `/status` | Duplicate / Partially Connected | Service and refresh state | Overlaps `/data-status`; internal engineering path is exposed in customer copy |
| `/about` | Static | Product mission and source summary | Suasion Securities identity, governance and trust proof are not yet articulated |
| `/advisor` | Partially Connected | Advisor enquiry form | No authenticated booking, messaging, review request or ticket lifecycle API |
| `/login` | Connected | Authentication and protected-route callback | No broader Invest readiness or privacy context |
| `/register` | Connected | Account plus research-profile creation | Not a KYC onboarding flow and must not be presented as compliance completion |
| `/forgot-password` | Connected | Recovery request | Minor UX polish only |
| `/reset-password` | Connected | Token-based password reset | Minor UX polish only |
| `/profile` | Partially Connected | Persisted research profile and account state | Investment identity, compliance and service preferences are not modeled |
| `/profile/setup` | Partially Connected | Research-profile setup | Duplicates some registration intent fields; not compliance onboarding |
| `/analytics` | Connected but misplaced | First-party aggregate analytics | Internal product surface is not access-restricted or separated by an operations shell |
| `/internal/data-completeness` | Connected / Hidden Backend Capability | Generated field coverage, source registry, pipeline health | Strong evidence is hidden in an engineering table and not optimized for mobile or public trust |
| `/internal/neon-status` | Connected internal | Database diagnostics | Needs a restricted operational shell; should never be treated as an investor page |
| `/internal/system-health` | Connected internal / Duplicate | Multi-system health diagnostics | Overlaps public status routes; requires access control and runbook-first layout |

## Existing capabilities that should be surfaced now

| Capability | Current implementation | Integration status |
| --- | --- | --- |
| Field completeness matrix | `fieldCoverage.json`, `FIELD_REGISTRY`, internal completeness page | Hidden Backend Capability; public premium UI required |
| Official-source registry | `FIELD_REGISTRY`, provenance schema and acquisition documents | Partially Connected; needs reusable metric-level presentation |
| Explainable fund quality | `qualityEngine.js`, fund health breakdown and decision support | Connected but buried; reusable expandable score UI required |
| AMC intelligence | `amcIntel.js` and AMC/category signal route | Partially Connected; executive AMC page required |
| Portfolio accounting | `/api/v1/portfolio/intelligence`, revaluation and performance leaders | Connected to portfolio UI; history/draft/diff contracts remain incomplete |
| Portfolio tax engine | `portfolioIntelligence/taxEngine.js` | Hidden Backend Capability; no authoritative report contract or UI |
| Goal planning | `portfolioIntelligence/goalPlanning.js` | Hidden Backend Capability; no persisted goals contract or customer UI |
| Rebalance/recommendation engines | deterministic portfolio intelligence modules | Partially Connected; must remain research suggestions, not regulated advice or executable orders |
| Sync collections, alerts, notes, watchlist, comparisons | `/api/v1/sync/*` | Connected in scattered widgets; no unified saved-work workspace |
| Factsheet provenance | generated metadata plus ingestion provenance schema | Partially Connected on covered fund pages; absent from many entity/list pages |

## Suasion Invest product gap audit

| Required journey | Current state | Required next contract |
| --- | --- | --- |
| Investment Readiness / KYC | Not implemented | Authoritative KYC step/status API, consent/audit records, provider redirects and fallback requirements |
| Bank, nominee and FATCA | Not implemented | Verified compliance provider states and document requirements |
| Invest/review/payment | Not implemented | Order draft, suitability/compliance gates, payment handoff and idempotent confirmation |
| Transaction lifecycle | Not implemented | Submitted → payment confirmed → processing → units allotted → completed event timeline |
| SIP management | Not implemented | Mandate, schedule, pause/cancel and upcoming-debit APIs |
| Goals | Engine exists, persistence absent | User goals, assumptions, progress, contribution plan and evidence timestamps |
| Document vault | Not implemented | Secure document metadata, signed download, retention, consent and deletion contracts |
| Advisor service | Basic contact only | Availability, appointments, messages, review requests and support-ticket APIs |
| Notifications | Sync settings/alerts exist | Investor notification inbox, delivery status and regulated-message taxonomy |
| Tax reports | Deterministic module only | Server-generated, versioned tax report artifact and disclaimer contract |
| Operations/admin | Internal diagnostics only | Role-based access, audit log, compliance queue, support and reporting contracts |

## Cross-product UI findings

- Research and Invest need distinct top-level identities with a shared trust system.
- The current app shell is research-oriented; it cannot yet truthfully advertise KYC, investing or transaction management.
- Source, freshness, confidence, coverage and methodology are represented by several one-off components and page-local fragments. They need one reusable disclosure grammar.
- Dense tables still rely on horizontal scrolling on several mobile routes.
- Many internal links use raw anchors; touched routes should migrate to `next/link` without changing URLs.
- Large client components (`FundPageClient`, portfolio workspace, compare and research clients) increase hydration and make interaction ownership difficult to audit.
- Existing focus tokens, skip link, theme support and reduced-motion CSS are valuable foundations, but button-level accessible names and mobile table alternatives remain inconsistent.

## Integration sequence

1. Public data completeness matrix with filters, search, sorting, expandable source/validation evidence and mobile cards.
2. Shared provenance disclosure for important research metrics and entity headers.
3. AMC executive redesign using only `amcIntel` and verified query results.
4. Reusable explainable quality-score disclosure, first applied to AMC intelligence and then fund summaries.
5. Portfolio contract reconciliation and removal/disablement of any control unsupported by the live API.
6. Spacing, button, accessibility and performance certification across nine widths.
7. Add the Research/Invest information architecture only when the first authoritative Invest API contract is ready.

## Definition of done

The integration is complete only when production evidence shows that:

- A first-time visitor can identify the source, date, confidence and limitation behind major claims.
- Every score exposes its measured components and missing evidence.
- All visible controls work with keyboard, pointer and touch, or are absent/disabled with a reason.
- No route fabricates missing investment, compliance or transaction state.
- All nine target widths have zero page-level overflow and no clipped primary action.
- Production APIs, console state and screenshots match the claimed experience.
