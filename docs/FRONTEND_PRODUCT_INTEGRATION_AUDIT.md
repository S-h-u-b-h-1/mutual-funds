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
| `/amc/[amc]` | Connected | Executive summary, explainable AMC/fund-health evidence, category presence, distribution, coverage, limitations, official NAV records and news | Authoritative AMC-level AUM, governance, flow and independent confidence contracts remain unavailable and are explicitly labelled |
| `/benchmark/[slug]` | Partially Connected | Funds mapped to the benchmark | Thin entity page; lacks source definition, coverage, freshness, limitations and comparison framing |
| `/manager/[slug]` | Partially Connected | Factsheet-derived current manager/fund links | Current-manager coverage is low and tenure history is unavailable; limitations need stronger prominence |
| `/discover` | Partially Connected | Evidence-led fund/category discovery | Distinct recommendation, activity, quality and popularity signals are not consistently separated |
| `/signals` | Connected | Rule-based movement signals | Severity, coverage and methodology need more progressive disclosure |
| `/signals/[amc]/[cat]` | Connected | Full deterministic AMC/category intelligence | Functionally deep but visually technical; needs alignment with redesigned AMC summary |
| `/compare` | Connected | Fund and AMC comparisons, saved comparison persistence, server-side fund selection and explicit missing evidence | Large matrices remain dense after the conclusion layer; selected AMC evidence is now fetched on demand |
| `/research` | Connected | Strategy builder, imported/saved strategies, notes and server-side fund selection | Relationship to portfolio remains intentionally research-only until an approved order-draft contract exists |
| `/portfolio` | Partially Connected | Authenticated holdings, upload, valuation, invested value, gains, XIRR, leaders and deterministic intelligence | Draft/review/approval, history, snapshot diff, daily change and full production persistence certification still require backend contracts |
| `/news` | Connected | Live/recent articles, source health and rule-based entity relevance | Terminal density and impact confidence compete with source hierarchy on mobile |
| `/methodology` | Static / Partially Connected | Calculation explanations | Not searchable and not consistently deep-linked from individual metrics |
| `/data-quality` | Connected | Public 40-field completeness matrix, coverage/missing values, source registry state, freshness, confidence, validation, filters, search, sort, expandable detail and mobile cards | Additional fields should enter only through the backend source registry and generated coverage artifact |
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

## Implementation and certification evidence

Completed in this integration sprint:

- Public data-quality matrix exposes 40 registered or measured fields without inventing source or confidence metadata.
- Important funds, performance, category, AMC and comparison pages share one provenance disclosure grammar.
- Fund quality and AMC quality scores expose components, methodology and missing-data behavior through keyboard-accessible native disclosures.
- AMC intelligence now separates executive evidence, confidence/coverage, best and weakest observed fund health, category presence, distribution, notes and limitations. Unsupported AMC-level flows were removed.
- Portfolio UI was reconciled against the current authenticated API fields for invested value, gain/loss, XIRR, latest NAV date, valuation confidence and performance leaders. History and daily change remain unavailable when the API omits them.
- Frontend lint completes with zero warnings and errors; the production build completes across 62 routes.
- `/research` no longer serializes the full fund universe. Its former generated HTML was approximately 2.37 MB; the certified development navigation transferred 16.3 KB compressed and decoded to 81.0 KB.
- Fund comparison fell from 356.3 KB compressed / 6.45 MB decoded to 18.2 KB / 87.0 KB by using server-side search.
- AMC comparison fell from 347.5 KB compressed / 6.39 MB decoded to a 25.7 KB / 136.0 KB page plus a 122.1 KB selected-AMC evidence request for the default three AMCs.
- Data quality and AMC intelligence were exercised at 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 CSS pixels with zero page-level horizontal overflow. Mobile cards replace the AMC scheme table below the desktop breakpoint.

Open production gates and next plan:

1. Apply and certify the server-side Invest identity/compliance migration and API contract before exposing an Invest navigation promise.
2. Add portfolio import drafts, reconciliation, ambiguity resolution, approval, retry, cancellation, stored history and snapshot-diff contracts.
3. Add regulated order draft, compliance gate, payment handoff and transaction-event contracts before rendering an investment button.
4. Split the 60.5 KB fund-page client chunk into lazy sections; its total first-load JavaScript is currently 173 KB, within the 200 KB budget but the largest customer route.
5. Verify signed-in portfolio upload, refresh, logout/login and cross-device persistence with a dedicated non-production account.
6. Restrict operational routes (`/analytics`, `/internal/*`) behind server-authorized roles and consolidate public status information.

## Definition of done

The integration is complete only when production evidence shows that:

- A first-time visitor can identify the source, date, confidence and limitation behind major claims.
- Every score exposes its measured components and missing evidence.
- All visible controls work with keyboard, pointer and touch, or are absent/disabled with a reason.
- No route fabricates missing investment, compliance or transaction state.
- All nine target widths have zero page-level overflow and no clipped primary action.
- Production APIs, console state and screenshots match the claimed experience.
