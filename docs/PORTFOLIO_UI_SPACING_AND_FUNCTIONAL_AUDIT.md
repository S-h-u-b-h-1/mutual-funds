# Portfolio UI Spacing and Functional Audit

Date: 2026-07-16
Scope: `/portfolio`, `PortfolioWorkspace.jsx`, global navigation interaction, and the currently exposed `/api/v1/portfolio/*` contracts.

## Certification boundary

This document records defects and fixes; it is not a production completion claim. The current upload endpoint parses and persists in one request. It does not expose a draft, ambiguity correction, reconciliation review, approval, cancellation-after-parse, import history, authoritative statement diff, valuation history, settings, report artifact, or deletion contract. UI controls for those operations must not be presented as working until Claude's authenticated APIs exist.

The current route can be certified locally for signed-out, empty, file-selection, request cancellation, upload failure, saved-holdings rendering, responsive layout, and controls backed by existing routes. Cross-device persistence, daily valuation updates, and review-before-save require an authenticated production fixture containing a supported real statement.

## Spacing system

| Token/class | Contract | Purpose |
|---|---|---|
| `.portfolio-shell` | 32 px mobile / 40 px desktop vertical rhythm | Separates major portfolio sections without giant blank regions |
| `.portfolio-section` | 16 px mobile / 20 px desktop internal rhythm; 112 px scroll offset | Prevents sticky navigation from covering section headings |
| `.portfolio-section-header` | 8–16 px heading/action separation | Keeps controls below headings on narrow screens |
| `.portfolio-card` | 16 px mobile / 20 px desktop padding | Primary low-border surface |
| `.portfolio-card-outlined` | Same padding plus one semantic border | Reserved for interactive, warning, or evidence surfaces |
| `.portfolio-grid-gap` | 12 px mobile / 16 px desktop | Consistent metric, leader, holding, and allocation grids |
| `.portfolio-control` | Minimum 44 px height | Inputs and selects with consistent touch/focus behavior |
| `.portfolio-table-cell` | 12–16 px horizontal, 12 px vertical | Dense but readable institutional table rhythm |

Outer page padding remains the global `.container-px` contract: 16 px at phone, 24 px at tablet, and 32 px at desktop, capped at 1240 px. The mobile dock reserves 92 px only below 1024 px.

## Findings and actions

| Area | Problem found | Severity | Action / required contract |
|---|---|---:|---|
| Page hierarchy | Import hero dominated the route even when a saved portfolio existed | High | Saved portfolio header and executive metrics move above import controls |
| Page hierarchy | Metrics, allocations and holdings were visually equal | High | Reorder into header, executive metrics, leaders, history, holdings, allocation, intelligence, changes, provenance |
| Borders | Nearly every nested block used a border, creating card-on-card noise | Medium | Use borderless primary cards and reserve borders for controls, evidence and state |
| Spacing | Ad hoc `space-y`, margins and padding produced inconsistent rhythm | Medium | Introduce the shared portfolio spacing classes above |
| Mobile table | Holdings existed only as a horizontally scrolling desktop table | High | Add dedicated mobile holding cards; keep the data table at large widths |
| Long names | Fund names, filenames and source labels could force intrinsic-width overflow | High | Apply `min-w-0`, wrapping/truncation with titles, and `minmax(0,1fr)` grids |
| Sticky content | Future section/table navigation risked sitting under the fixed navigation | Medium | Use `scroll-mt-28`; do not use a sticky mobile table header |
| Metrics | Frontend inferred best/poorest return from multiple possible fields | Critical | Remove financial ranking logic from the client; render only explicit API leader fields |
| Metrics | Invested value and gain were referenced although the current health report omits them | Critical | Show unavailable states until the summary API supplies invested value, gain, return and dates |
| Metric context | Tiles lacked consistent source date, explanation and stale state | High | Add visible evidence lines and native help text sourced from API metadata |
| Daily change | “Today's Gain” was a placeholder in a metric grid | Medium | Label NAV-day change unavailable and explain the missing daily valuation contract |
| Value history | No stored valuation endpoint exists | High | Show an honest no-history state; disable unsupported ranges |
| Performance leaders | “Best” and “Worst” did not specify the ranking metric | Critical | Use Best return %, Poorest return %, Largest contributor and Largest detractor headings |
| Performance leaders | Current UI ranked locally and could include stale/unreconciled data | Critical | Require `performanceLeaders` from the portfolio API with exclusions/confidence/as-of date |
| Holdings controls | Search, sort, grouping and evidence expansion were missing | High | Add non-financial client display controls over server holdings |
| Holdings actions | Compare and watchlist were absent | Medium | Wire to existing compare route and cloud watchlist adapter |
| Holdings pagination | Entire holdings payload loads at once | Medium | Client pagination can bound rendering now; server cursor pagination remains required |
| Allocation | Three charts appeared simultaneously and repeated the same visual grammar | Medium | Use one allocation dimension at a time with a tabular fallback |
| Allocation context | Sector data coverage was easy to miss | High | Keep coverage and methodology adjacent to the selected allocation |
| Import | Upload currently overwrites/upserts immediately after parsing | Critical | Keep button explicitly “Upload and save”; require draft APIs before “Save and start tracking” |
| Import | Provider selection and upload actions were separated from persistence consequences | High | Place truthful immediate-save notice beside the final upload action |
| Import | Progress could only describe a single pending request | Medium | Keep only server-confirmable Uploading/Processing/Saved/Failed states |
| Re-upload | No authoritative before/after approval or snapshot diff | Critical | Do not infer changes in the browser; request import diff/approval contracts |
| Persistence | “Saved” can only follow a successful upload response plus successful reload | High | Keep success tied to response; re-fetch holdings/report before showing dashboard |
| Loading | One 288 px skeleton did not match final layout | Low | Use structured header and metric skeletons to reduce layout shift |
| Errors | Errors were actionable but not classified visually by recovery path | Medium | Preserve focus movement and provide retry, choose another file, or sign-in action as applicable |
| Accessibility | Allocation bars lacked a concise screen-reader summary | High | Add hidden summaries and a visible table fallback |
| Accessibility | Gain/loss relied heavily on colour | High | Prefix values with “Gain”, “Loss”, or “Unavailable” in accessible labels and visible headings |
| Accessibility | Table had no caption or row detail control | Medium | Add caption, scoped headers, labelled expand buttons, and mobile cards |
| Accessibility | Upload drop zone was not itself keyboard interactive | Medium | Native labelled file input and explicit 44 px Choose PDF button remain the keyboard path |
| Buttons | Settings, report, delete, review, edit match, exclude and restore lack APIs | Critical | Do not render fake controls; list them as backend-gated in provenance |
| Performance | Portfolio is a single large client component | Medium | Split visual sections and lazy-load the future history chart; server summary remains required |
| Performance | Holdings and intelligence are sequential fetches | Medium | Fetch them in parallel when holdings exist; intelligence GET currently writes and needs backend repair |
| Performance | Embedded PDF preview eagerly allocates after selection | Low | Keep preview below confirmation and allow removal; future version should lazy-mount it |

## Responsive and overlap matrix

Target widths: 320, 375, 390, 430, 768, 1024, 1280, 1440 and 1920 px.

The required checks at every width are document horizontal overflow, header/action collision, long filename containment, long scheme-name wrapping, mobile dock clearance, desktop navigation clearance, table/card switch, filter wrapping, allocation legend wrapping, sticky offset, dialog/command palette layering, and 200% browser zoom. Local browser evidence is appended after implementation. Authenticated dashboard states still require a fixture account; signed-out coverage alone is not sufficient for a completion claim.

## Button inventory

| Control | Current certification state |
|---|---|
| Sign in | Existing route; verify locally and in production |
| Dashboard / import switch | Existing client state; verify at all widths |
| Provider selection | Existing client state; verify pressed state |
| Choose PDF / drag-drop / remove | Existing and locally verifiable |
| Upload and save / cancel / retry | Existing immediate-save contract; success requires real supported statement |
| Search / sort / filter / group / pagination | UI implementation; verify with persisted holdings fixture |
| Open fund / compare / watchlist / expand evidence | Existing target integrations; verify with fixture |
| Allocation dimension and table fallback | Client display controls; verify locally with fixture |
| History ranges | Disabled until real valuation points exist |
| Review, edit match, exclude, restore, approve, cancel draft | Backend-gated; not rendered as working |
| Settings / report / delete | Backend-gated; not rendered as working |

## Required backend contracts

1. Import draft creation/status/correction/approval/cancellation.
2. Persistent portfolio summary with portfolio name, statement date, valuation timestamp, official NAV date, invested value, absolute gain, return percentage, NAV-day change, XIRR, research score, confidence and provenance.
3. Explicit performance leaders with metric names, contribution values, exclusions, confidence and as-of dates.
4. Cursor-paginated holdings with folios, plan/option, NAV/date, gain, allocation, daily contribution and status.
5. Stored valuation history and range availability.
6. Import history and authoritative snapshot diff.
7. Portfolio settings, deletion receipt and server report artifact.
8. Read-only intelligence retrieval; the current GET writes metric, event and report rows on every read.

## Production gate

No completion claim is allowed until `mf-pulse.vercel.app` passes import → review → approve → refresh → logout/login → isolated browser persistence → official NAV refresh → unchanged units → updated value → every visible control → mobile → light/dark, with screenshots and DOM evidence. The present backend cannot perform the review/approve segment, so the production gate remains blocked by contract rather than treated as a UI pass.
