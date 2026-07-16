# Portfolio UI Functional Audit

Date: 2026-07-16
Scope: `/portfolio`, its navigation entry points, `PortfolioWorkspace.jsx`, and the currently available `/api/v1/portfolio/*` routes.

## Certification status

This is an evidence log, not a completion claim. The current backend does not yet expose the draft, approval, history, valuation, diff, settings, report-download, or deletion contracts required for the requested persistent portfolio experience. Those controls must not be presented as working until the contracts below exist and are verified on the public production domain.

## Current persistence boundary

| Data or state | Current owner | Survives refresh/logout/device? | Finding |
|---|---|---:|---|
| Holdings | Neon via `GET /api/v1/portfolio/holdings` | Yes by architecture; production E2E still required | Server-authoritative |
| Intelligence report | Recomputed by `GET /api/v1/portfolio/intelligence` and written to Neon | Yes by architecture; production E2E still required | The GET has write side effects and creates duplicate metric/report/event rows on repeated reads |
| Upload result | `POST /api/v1/portfolio/upload` | Yes, but it saves immediately | There is no review-before-save boundary |
| Upload history shown in the UI | `localStorage` | No | Misleading and must be removed |
| Previous-upload comparison shown in the UI | `localStorage` snapshots | No | Not authoritative; must be removed |
| File, drag state, request state | React state | No, intentionally | Correct transient usage |

## Route and component audit

| Surface | Control/state | Classification before repair | Evidence / action |
|---|---|---|---|
| `/portfolio` | Navigation entry | Working | Links from primary navigation, dashboard, and homepage resolve to `/portfolio` |
| `/portfolio` | Sign-in CTA | Working | Routes to `/login?callbackUrl=/portfolio` |
| Import | Statement-type buttons | Working | Changes the `source` submitted to the upload API |
| Import | Choose PDF | Working but incompletely labelled | Native picker works; accessible label/instructions need strengthening |
| Import | Drag and drop | Working | File is validated client-side before submission |
| Import | Long PDF filename | Clipped/overflow risk | Grid lacked `minmax(0,1fr)` and filename relied on truncation; repaired to wrap inside its card |
| Import | PDF preview | Working where the browser supports embedded PDFs | Fallback copy is present |
| Import | Process statement | Misleading | Calls an endpoint that saves immediately; no review or approve step exists |
| Import | Cancel upload | Missing | Current fetch has no `AbortController` |
| Import | Retry | Incomplete | User can click process again, but no explicit retry state |
| Progress | Seven-stage pipeline | Misleading | Advances every 650 ms, unrelated to backend state |
| Progress | Screen-reader status | Incomplete | Final messages use live regions, but fake intermediate stages are not reliable |
| Save | Confirmation | Incomplete | Success was described as “processed” and redirected on a timer instead of explicitly confirming server persistence |
| Dashboard | Holdings after refresh | Working by code path | Fetches server holdings when the authenticated workspace mounts |
| Dashboard | Current value | Working with limitations | Comes from the server intelligence response or server-enriched holdings; valuation date is absent |
| Dashboard | Invested value / gain | Misleading ownership | Calculated in the browser; the brief requires financial metrics from the portfolio API |
| Dashboard | Today’s gain | Placeholder | Correctly states that daily unit-level snapshots are unavailable, but should be supplied by valuation API |
| Dashboard | Last updated | Misleading | Read from localStorage upload history rather than the server |
| Dashboard | Refresh analysis | Incomplete / harmful | Calls a GET endpoint that writes duplicate metric, event, and report rows |
| Dashboard | Allocation cards | Working with available intelligence payload | Empty states exist; chart summaries need explicit text for assistive technology |
| Dashboard | Holding links | Working | Open `/fund/:schemeCode`; public-route auth bug exists outside this component and remains separately tracked |
| Dashboard | Holdings search/sort/filter/group/consolidate | Missing | Requires UX plus richer holdings contract |
| History | Timeline | Misleading | Browser-local list, not server history |
| History | Ranges | Missing | No valuation-history API |
| Updated statement | Diff | Misleading | Browser-local snapshot comparison, not persisted import snapshots |
| Review | Match, exclude, restore, approve, cancel | Missing | No draft/approval API |
| Settings | Rename/delete | Missing | No portfolio settings/delete API |
| Report | Download | Missing | No report artifact API |
| Watchlist/compare | Per-holding actions | Missing | Do not expose until real integrations are wired |

## Layout and responsive audit

Test targets are 320, 375, 430, tablet portrait/landscape, 1024, 1280, 1440, and ultra-wide. The confirmed source-level overflow defect is the selected-file/review grid: intrinsic filename width could expand the first column and create excess space or horizontal overflow on the right. The repair is:

- `min-w-0` on grid items;
- `minmax(0,1fr)` for flexible columns;
- `overflow-hidden` on the selected-file card;
- `break-all` plus a native title for long filenames.

Browser certification at every target remains required after the authenticated flow can be exercised. Global navigation also needs separate certification because desktop navigation and the bottom dock coexist at some tablet/laptop widths.

## Accessibility audit

Confirmed strengths: semantic buttons, minimum 40–44 px targets on primary actions, visible error and status regions, `aria-pressed` on segmented controls, and a labelled PDF object.

Open items: accessible file-input name/instructions, focus movement after errors and confirmed saves, cancellable progress, non-colour status labels, table caption/keyboard strategy, textual chart summaries, reduced-motion behavior, and modal focus trapping once review/settings dialogs exist.

## Performance audit

- The portfolio page is mostly one large client component, so data fetching and the whole dashboard hydrate in the browser.
- Holdings and intelligence are fetched sequentially on mount; upload success repeats both calls.
- `GET /intelligence` performs database writes and is invoked on page load and manual refresh, so reads are neither cheap nor side-effect free.
- Embedded PDF preview is created eagerly after selection.
- Charts are currently CSS bars, so there is no chart-library cost on this route.
- Prior production build evidence: shared first-load JS was about 87.4 kB and the largest portfolio-adjacent routes were in the low-100 kB range. Fresh route-specific build and field Web Vitals evidence must be recorded after the API-backed redesign.
- Public-domain LCP, CLS, INP, and hydration-error certification is not yet available.

## Required backend contracts (do not mock)

All responses must be authenticated and user-scoped. IDs are opaque UUIDs. Financial fields must include their source and valuation/as-of date where applicable.

### 1. Create import draft

`POST /api/v1/portfolio/imports` as multipart form data (`source`, `file`). It must parse without applying holdings.

```json
{
  "import": {
    "id": "uuid",
    "status": "draft",
    "provider": "cams",
    "statementDate": "2026-06-30",
    "parseStage": "ready_for_review",
    "summary": {
      "holdingsExtracted": 12,
      "holdingsMatched": 11,
      "ambiguousHoldings": 1,
      "unresolvedHoldings": 0,
      "investedValue": 100000,
      "statementValue": 126000,
      "reconciliationDifference": 0,
      "confidence": "high"
    },
    "holdings": []
  }
}
```

Errors must distinguish `unsupported_provider`, `encrypted_pdf`, `duplicate_upload`, `file_too_large`, `parse_failed`, and `authentication_expired`.

### 2. Import status

`GET /api/v1/portfolio/imports/:importId` returns `stage` (`uploading`, `reading_statement`, `extracting_folios`, `resolving_schemes`, `reconciling_values`, `ready_for_review`, `failed`) plus the draft when ready. Polling, SSE, or another documented transport is acceptable; the UI must not infer progress from time.

### 3. Correct draft rows

`PATCH /api/v1/portfolio/imports/:importId/holdings/:holdingId`

```json
{ "canonicalSchemeCode": "string", "excluded": false }
```

The response must return the updated holding, summary, unresolved count, and whether approval is allowed.

### 4. Approve or cancel

- `POST /api/v1/portfolio/imports/:importId/approve` returns `{ portfolio, import, latestValuation }` only after the transaction commits.
- `POST /api/v1/portfolio/imports/:importId/cancel` returns the cancelled import and must not alter the active portfolio.
- Approval must be idempotent and reject unresolved critical ambiguities.

### 5. Persistent portfolio read

`GET /api/v1/portfolios/:portfolioId` returns header metadata, API-computed metrics, confidence, source/methodology references, current holdings summary, and latest official valuation date. It must be read-only and cacheable per user where safe.

### 6. Holdings

`GET /api/v1/portfolios/:portfolioId/holdings?cursor=&limit=&query=&sort=&group=&consolidate=` returns paginated canonical holdings plus separate folios and server-computed values/dates/status. It must include stable IDs for fund, holding, and folio actions.

### 7. Valuation history

`GET /api/v1/portfolios/:portfolioId/valuations?range=since_import|1m|3m|6m|1y|all` returns only real stored dates with value, invested value, gain/loss, NAV coverage, stale count, and source. No synthetic points.

### 8. Imports and diff

- `GET /api/v1/portfolios/:portfolioId/imports`
- `GET /api/v1/portfolio/imports/:importId/diff`

The diff must provide new/removed funds, increased/decreased units, new/closed folios, value/allocation/risk/score changes, and the IDs/dates of both snapshots.

### 9. Settings and deletion

- `PATCH /api/v1/portfolios/:portfolioId` for name/settings.
- `DELETE /api/v1/portfolios/:portfolioId` with an explicit confirmation token or body. It must delete or tombstone all user-visible portfolio data consistently and return a deletion receipt.

### 10. Report artifact

`POST /api/v1/portfolios/:portfolioId/reports` returns a server-generated report job/artifact with methodology version and as-of date. The UI must not assemble financial report values independently.

## Production acceptance gate

Completion requires a disposable-account run on the public domain: import, review, approve, refresh, logout/login, isolated browser/device, backend value comparison, valuation-date check, duplicate upload, updated-statement diff, deletion, and screenshots of each major state. Until that run passes, the answers to “persistent across refresh/logout/device,” “updated by persisted daily NAV valuation,” and “every visible control clicked” remain **not yet proven in production**.

## Local browser certification evidence (2026-07-16)

Authenticated with a newly created disposable local-test account backed by the configured database. A generated, explicitly non-CAS PDF was used only to exercise selection, layout, and failure handling; it was not accepted as portfolio data.

Verified controls:

- unauthenticated redirect to sign-in and callback to `/portfolio` after registration;
- Portfolio Dashboard / Re-upload Statement view switch;
- all three provider selectors;
- primary and empty-state Upload Portfolio Statement actions;
- Choose PDF and file selection;
- long filename containment in the selected-file card;
- Upload and save failure path, explicit Retry upload, and Remove;
- mobile all-navigation open state;
- desktop theme toggle and account menu.

The invalid fixture produced an expected HTTP 400. The UI retained no holdings, changed the action to Retry, focused an actionable error, and stated “Portfolio not yet saved to your account.” The raw parser error was replaced with supported-provider/unlocked-PDF guidance.

Responsive horizontal-overflow checks with the long filename selected:

| Viewport width | Document scroll width | Horizontal overflow |
|---:|---:|---:|
| 320 | 311 | None (9 px scrollbar/gutter difference) |
| 375 | 366 | None |
| 430 | 421 | None |
| 768 | 759 | None |
| 1024 | 1015 | None |
| 1280 | 1271 | None |
| 1440 | 1431 | None |
| 1920 | 1911 | None |

Build result after the repairs: production build passed. `/portfolio` is 7.48 kB route code, 120 kB first-load JS, with 87.4 kB shared JS. Public field LCP, CLS, and INP are still not certified.
