# MF Pulse Frontend Redesign Audit

Date: 11 July 2026  
Scope: `frontend/app`, shared components, frontend libraries, route handlers, local persistence, authentication surfaces, data bundles, and responsive behavior.

## Executive assessment

MF Pulse already contains a broad and unusually credible research product: daily NAV intelligence, category and AMC movement, fund health, news-to-entity links, research notes, comparisons, watchlists, portfolio ingestion, freshness reporting, and internal operational views. The core weakness is not feature depth. It is that the frontend presents nearly every feature with the same visual weight, the same glass-panel vocabulary, and route-specific navigation. Users must infer the product model from pages instead of being taught it by the interface.

The redesign should preserve the data and decision engines while replacing the presentation layer with a calm research workspace. The key organizing idea is **capital flows through an evidence network**. Every primary page should answer one research question, expose its evidence and freshness, and end with a clear next step.

## System-wide findings

- Information architecture is route-led rather than task-led. Morning preparation, discovery, comparison, monitoring, and portfolio review are not expressed as coherent workflows.
- Desktop navigation exposes only a fraction of the product. Mobile navigation is largely a collapsed variant rather than a touch-first research structure.
- Pages repeatedly assemble one-off headings, pills, panels, and tables. Shared components exist, but do not yet form an application shell or consistent page grammar.
- The dark visual treatment uses extensive glass effects, white overlays, hardcoded color utilities, and very bold headings. It lacks a true light theme and makes long research sessions tiring.
- Hierarchy is shallow: many pages are long sequences of similarly styled cards. Conclusions, evidence, limitations, and actions are not consistently separated.
- Financial numbers do not have a universally enforced tabular-number treatment. Type sizes and weights are locally chosen.
- Trust information exists (`TrustBar`, freshness services, status pages), but is not consistently attached to the claims it qualifies.
- Tables work on desktop but mostly overflow or compress on mobile. There is no shared mobile row/card transformation.
- Several labels overstate certainty or freshness (for example “live” on daily NAV-derived views and “Best fund”). Copy must distinguish daily, delayed, near-real-time, and incomplete data.
- Client-heavy components such as `HomepageClient`, `FundPageClient`, `DailySessionWorkflow`, and `ResearchWorkspaceClient` are very large and mix orchestration, presentation, and state.
- Two Three.js components already visualize financial networks with real inputs, but their product meaning, fallback, lifecycle, and reduced-motion behavior need a unified implementation.
- Auth, cloud sync, portfolio calculations, analytics, and API routes are meaningful business infrastructure and must remain behaviorally intact.

## Route audit

### Overview and daily workflow

| Route | Purpose / primary user / core question | Current issues | Primary action and recommended structure |
| --- | --- | --- | --- |
| `/` | Product orientation and daily entry point for all investors. “What is MF Pulse, what changed, and where should I begin?” | Too many competing modules; value proposition and daily state compete; dense client component; trust disclosure appears late; returning-user content lacks clear separation. | **Research a fund.** Positioning hero → real research strip → what changed → attention queue → workflow paths → personal workspace → trust → responsible CTA. |
| `/brief` | Five-minute morning briefing for active researchers. “What changed since my last review?” | Reads like a static report; sample-flow caveats are distant from related sections; no review/resume state; sections have equal visual weight. | **Review today’s queue.** Date/freshness → regime → three key changes → expandable evidence sections → watchlist/portfolio relevance → next actions → print/save/review state. |
| `/dashboard` | Personal research dashboard for signed-in or returning users. “What needs my attention now?” | Mixes global research queue, local storage widgets, news, and system links without prioritization; weak empty/auth states. | **Continue research.** Personal status header → priority queue → watchlist/portfolio changes → recent work → notebook → data limitations. |
| `/market-map` | Visual market/category exploration for researchers. “Where is movement concentrated?” | Visualization and explanation are not sufficiently coupled; mobile interaction is unclear; legend and timestamps need stronger hierarchy. | **Inspect a cluster.** Market summary → interactive map with accessible table fallback → selected cluster evidence → related funds/news. |
| `/performance` | Performance overview for comparative researchers. “Where is return leadership and how durable is it?” | Metric density arrives before explanatory context; daily-return data can be mistaken for recommendations; table-first behavior is weak on mobile. | **Explore a category.** Regime context → period controls → leadership/distribution → methodology and confidence → research links. |

### Fund and entity research

| Route | Purpose / primary user / core question | Current issues | Primary action and recommended structure |
| --- | --- | --- | --- |
| `/funds` | Fund discovery and screening. “Which funds match my research criteria?” | Server filters are basic; only one dense result presentation; direct/regular and growth/IDCW distinctions are buried in names; top-80 truncation is not a research workflow; selection is visually detached. | **Build a comparison.** Search + compact filters → saved views → table/card/mobile modes → visible missing data → sticky selection tray → quick preview. |
| `/fund/[scheme_code]` | Signature institutional fund workspace. “What is known, what changed, and what should I investigate?” | A 1,000-line client component creates an endless sequence of equal panels; header, executive conclusion, evidence, gaps, and actions blur together; responsive cognitive load is high. | **Add to research queue.** Research header → executive snapshot → attention thesis → tabbed/progressive performance, risk, portfolio, management, events → checklist → next steps; persistent evidence/freshness rail on desktop. |
| `/categories` | Category landscape. “Which categories are moving and with what confidence?” | “Best fund” and “live” are too absolute for daily NAV data; leaderboard dominates context; no distribution or regime explanation. | **Open a category.** Category regime summary → sortable landscape → distribution → movement/context → methodology. |
| `/categories/[category]` | Category drill-down. “How do funds in this category compare?” | Primarily a ranked list plus news; ranking methodology and data gaps are understated; lacks risk/dispersion context and peer visualization. | **Compare category peers.** Category thesis → peer distribution → research table → relevant events → compare tray. |
| `/amc` | AMC landscape. “Which fund houses show meaningful changes?” | Card/list hierarchy is repetitive; organizational context and coverage confidence are limited. | **Research an AMC.** Landscape summary → momentum/coverage matrix → AMC directory → methodology. |
| `/amc/[amc]` | AMC research view. “What is happening across this fund house?” | Mixes flows, fund performance, metadata, and news without a single executive thesis; name normalization leaks into URLs/content. | **Inspect AMC funds.** Institutional header → executive movement summary → category/fund portfolio → flows and news → managers/data gaps → actions. |
| `/benchmark/[slug]` | Benchmark constituent fund research. “Which funds reference this benchmark and how are they behaving?” | Mostly a linked fund table; lacks benchmark definition, coverage, relative-performance framing, and comparison path. | **Compare benchmark peers.** Benchmark profile → coverage/freshness → relative fund table → category context → compare. |
| `/manager/[slug]` | Manager research page. “Which funds does this manager run and what evidence is available?” | Thin factsheet-derived page; missing tenure gaps and manager-history limitations are not prominent; performance can imply attribution. | **Review managed funds.** Manager identity/coverage → tenure timeline → fund matrix → known gaps → compare/research actions. |
| `/discover` | Evidence-led idea discovery. “What may be worth researching?” | Many independent lists with similar cards; discovery reasons are inconsistent; popularity and analytical signals are mixed. | **Open a research suggestion.** Intent selector → evidence-based collections → reason/confidence/time → popularity separated as activity, not quality. |
| `/signals` and `/signals/[amc]/[cat]` | Rule-based movement detection. “Which changes exceed normal ranges?” | Statistical detail and research meaning are not progressively disclosed; signal urgency can be overstated; limited next-step support. | **Investigate a signal.** Signal overview → severity/confidence legend → filterable queue → detail with baseline, cause candidates, limitations, and related research. |

### Comparison, workspace, and portfolio

| Route | Purpose / primary user / core question | Current issues | Primary action and recommended structure |
| --- | --- | --- | --- |
| `/compare` | Fund or AMC comparison. “Where do these options differ, and what remains unknown?” | Mode-switching is indirect; large metric tables precede conclusions; selection and saved state feel separate; no explicit uncertainty summary. | **Save comparison.** Selection header → at-a-glance evidence statements (no winner) → performance/risk visuals → detailed metrics → similarities/differences/unknowns → actions. |
| `/research` | Strategy builder and research workspace for advanced users. “How can I organize a multi-fund thesis?” | Dense, dark, isolated visual style; 500+ line client component; terminology assumes expertise; relationship to compare/notebook/dashboard is unclear. | **Create a strategy.** Workspace objective → imported funds → allocation/research tools → evidence notebook → limitations → save/export. |
| `/portfolio` (currently API-driven journey surfaced through dashboard/workspace components) | Portfolio review for investors and advisors. “What does my actual portfolio reveal?” | No clear top-level route in the current page inventory despite portfolio APIs; upload, matching, intelligence, and disclosures are fragmented; consent and approximation caveats need a guided journey. | **Review my portfolio.** Consent → import/manual entry → matching/error resolution → overview → allocation/risk/overlap/news → confidence/gaps → research opportunities → advisor review. |
| Watchlist surfaces | Ongoing monitoring. “What changed in funds I follow?” | Watchlist exists as widgets/local+cloud persistence, not a clear destination; empty, signed-out, and migrated states are scattered. | **Review changes.** Dedicated workspace section/route → changed since last visit → fund list → related news/signals → sync status. |

### News and intelligence

| Route | Purpose / primary user / core question | Current issues | Primary action and recommended structure |
| --- | --- | --- | --- |
| `/news` | Near-real-time financial news connected to fund research. “Which events matter to categories, AMCs, funds, or my portfolio?” | Rich entity linking is presented as a feed/terminal hybrid; impact, freshness, and source health compete; no persistent view mode; “real-time” implications need correction. | **Research an impact.** Market impact overview → theme/source/impact controls → timeline/terminal/card modes → entity and portfolio relevance → source health and refresh interval. |
| Market terminal components | Compact monitoring for experienced users. “What arrived recently and how is it classified?” | Useful density but weak onboarding and mobile behavior; terminal aesthetic can dominate research semantics. | **Open related research.** Compact chronological view with explicit delayed/near-real-time label, keyboard navigation, and accessible expanded row. |

### Support, trust, and conversion

| Route | Purpose / primary user / core question | Current issues | Primary action and recommended structure |
| --- | --- | --- | --- |
| `/methodology` | Explain calculations and limits. “How was this derived?” | Generic section list; insufficient cross-linking to metrics; no version/change history; dense definitions lack examples. | **Inspect a method.** Searchable metric index → calculation → interpretation → limitations → sources/version. |
| `/data-quality` | User-facing completeness explanation. “Can I trust this page’s data?” | Separate quality destination can become a dumping ground; page-level trust is still needed; visual hierarchy is report-like. | **Inspect missing coverage.** Plain-language status → coverage dimensions → affected experiences → remediation/freshness. |
| `/data-status` | Dataset and pipeline status. “How current and complete is the research data?” | Technical and user-facing concerns mix; repeated with `/status`; freshness dates need a unified component. | **Check a dataset.** Overall state → user-impact summary → dataset table → recent runs → limitations. |
| `/status` | Public service status. “Is MF Pulse operating normally?” | Duplicates data-status concepts; deep operational links distract typical users. | **View affected systems.** Service summary → incidents → freshness timeline → link to detailed data coverage. |
| `/advisor` | Responsible handoff to professional guidance. “How do I request a review?” | Conversion form is visually disconnected from research context; privacy/expectation setting can be stronger. | **Request advisor review.** Scope and non-advisory context → what to prepare → accessible form → response expectations/privacy. |
| `/about` | Product trust and mission. “Who built this and why should I trust it?” | Thin narrative and weak proof architecture; limited link to methodology/sources. | **See methodology.** Mission → principles → evidence/source model → responsible-use statement → team/contact. |

### Authentication

| Route | Purpose / primary user / core question | Current issues | Primary action and recommended structure |
| --- | --- | --- | --- |
| `/login` | Access synced research. “How do I resume my workspace?” | Bare form lacks benefits, trust, password guidance, error hierarchy, and theme-complete shell. | **Sign in.** Focused auth shell → value/context → providers/form → recovery → privacy/security note. |
| `/register` | Create a synced account. “What will be saved and why?” | Bare form; cloud/local behavior not explained; consent and password feedback are minimal. | **Create account.** Benefits + data ownership → form → clear validation → sign-in fallback. |
| `/forgot-password` | Request recovery. | Minimal confirmation/error states; no explanation of expiry or delivery timing. | **Send reset link.** Focused form → privacy-safe confirmation → sign-in return. |
| `/reset-password` | Complete recovery. | Token/error/success states need stronger hierarchy and password requirements. | **Set new password.** Token state → requirements → form → success/sign-in. |

### Internal and operational pages

| Route | Purpose / primary user / core question | Current issues | Primary action and recommended structure |
| --- | --- | --- | --- |
| `/internal/data-completeness` | Operators and analysts. “Where are the largest data gaps?” | Long operational report with consumer styling; remediation priority is hard to scan. | **Inspect affected records.** KPI summary → prioritized gaps → affected routes/entities → source/remediation details. |
| `/internal/neon-status` | Engineers/operators. “Is Neon data and sync healthy?” | Technical diagnostics lack a consistent ops shell and severity model. | **Investigate failure.** Environment/state header → checks → recent failures → runbook links. |
| `/internal/system-health` | Engineers/operators. “Which pipeline or product subsystem is unhealthy?” | Repeats public status information; long card stacks; limited incident correlation. | **Open runbook.** Operational summary → dependency map → incidents/runs → remediation. |
| `/analytics` | Product team. “Which research workflows are used?” | Internal analytics appears alongside user product routes; governance and event caveats are understated. | **Inspect a journey.** Restricted ops shell → adoption funnel → workflow engagement → instrumentation quality. |

## Shared component and architecture audit

### Preserve behavior

- `frontend/app/lib/cloudSync.js` and all `/api/v1/sync/*` handlers.
- Authentication adapters, route handlers, password reset, and session behavior.
- Portfolio import parsers, schema, holdings reads, and deterministic intelligence/calculation modules.
- Tracking, analytics events, news classification/entity links, freshness service, data readers, and backend integrations.
- Existing route URLs, unless an additive alias/redirect is introduced.

### Refactor presentation

- Replace `Nav` + `MobileNav` with one `AppShell` composed of desktop research navigation, mobile bottom navigation, command search, theme toggle, freshness access, and account controls.
- Establish primitives only where reused: `PageHeader`, `ResearchHeader`, `SectionHeader`, `Surface`, `MetricCard`, `InsightCard`, `TrustBadge`, `FreshnessBadge`, `ConfidenceBadge`, `DataGapNotice`, `ChartFrame`, `ResearchTable`, `FilterBar`, `ActionDock`, `CompareTray`, `DisclosurePanel`, and shared states.
- Break oversized clients by research section and preserve state boundaries close to the interaction that needs them.
- Keep route data loading in Server Components; isolate chart, storage, WebGL, and input interactions as client islands.
- Replace raw `<a>` for internal navigation with `next/link` during touched-route refactors.

## Responsive and accessibility audit

- Introduce a skip link, semantic landmark structure, consistent focus ring, 44px touch targets, and visible current navigation state.
- Provide text summaries/tables for every chart and static fallback for WebGL.
- Use real buttons for actions, labels/descriptions for forms, announced async states, and focus management for drawers/dialogs.
- Convert research tables to prioritized mobile records rather than horizontal miniatures. Preserve missing values and comparison selection.
- Ensure 320px layouts retain fund identity, latest NAV/date, conclusion, trust, and primary actions without clipping.
- Respect reduced motion and tab visibility for all animation; never encode positive/negative state by color alone.

## Recommended information architecture

1. **Overview:** Home, Morning Brief, Market Pulse.
2. **Research:** Funds, Categories, AMCs, Benchmarks, Managers, Compare, Discover.
3. **Intelligence:** News Intelligence, Signals, Market Map, Research Queue.
4. **Workspace:** Dashboard, Watchlist, Notebook, Strategy Builder, Portfolio Intelligence.
5. **Support:** Methodology, Data Status, Advisor, About.

Desktop should use a persistent top-level research shell with grouped navigation and command search. Mobile should prioritize Home, Search, Brief, Watchlist, and Workspace in a bottom bar, with the full information architecture in a touch drawer.

## Migration priorities

1. Tokens, type, themes, focus/motion, and foundational surfaces.
2. App shell, navigation, command search, and responsive page frame.
3. Homepage and evidence-network visualization.
4. Fund screener and fund research workspace.
5. Compare, research queue, notebook, watchlist, and strategy workflow.
6. News intelligence and Morning Brief.
7. Guided portfolio review.
8. AMC, category, benchmark, manager, signals, discovery, and market views.
9. Auth, support, advisor, public status, and internal operations shell.
10. Cross-route accessibility, performance, mobile, visual, and persistence regression QA.

This audit is the implementation baseline. It does not authorize changes to calculations, API semantics, authentication behavior, persistence models, data pipelines, or infrastructure.
