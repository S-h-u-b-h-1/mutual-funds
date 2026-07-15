# UX Redesign Audit — Navigation, Dashboard, Homepage Graph, AMC Comparison

Date: 2026-07-15  
Scope: frontend page structure, interaction design, responsive behavior, accessibility, and verified-data presentation only.

## Current problems

- Navbar search is visually too dominant on desktop because it renders as a wide permanent launcher.
- Primary navigation uses many adjacent links, creating cramped labels and reliance on truncation at intermediate widths.
- Homepage universe graph is mostly a decorative network; it does not expose enough usable AMC/category/fund-count interactions.
- Dashboard daily workflow is too large, dark, and checklist-like; it forces audit language instead of helping users complete research.
- AMC comparison is shallow: it mainly compares 30-day AMC equity index movement, equity scheme count, total scheme count, and asset-class count.

## Affected components

- `frontend/app/components/Nav.jsx`
- `frontend/app/components/Search.jsx`
- `frontend/app/components/KnowledgeGraphHero.jsx`
- `frontend/app/lib/graphNodes.js`
- `frontend/app/components/DailySessionWorkflow.jsx`
- `frontend/app/components/CompareClient.jsx`
- `frontend/app/compare/page.js`
- `frontend/app/page.js`

## Dead or weak buttons found

- Navbar search works, but the default visual treatment makes it look like a permanent input rather than a command action.
- Dashboard workflow buttons work but use “audit verification” language and gate progress on arbitrary checkbox actions.
- AMC comparison save/load/delete works through existing comparison sync helpers; copy/share/export/report controls are not present and should not be added without implementation.
- AMC rating, flow, and update controls do not have verified backend contracts; they must render unavailable states, not fake data.

## Responsive problems

- Desktop nav has too many peer links for the available width.
- Homepage graph needs a mobile-first list/treemap fallback instead of forcing a small 3D/network visual.
- AMC comparison table needs a card-like mobile alternative and sticky section navigation.
- Dashboard workflow uses excessive vertical space.

## Accessibility problems

- Current command palette keyboard navigation exists, but focus trapping is limited by the native dialog implementation and should retain visible focus states.
- Graph nodes need labelled buttons/links and chart summary text.
- Dashboard workflow should use semantic buttons and status text, not clickable divs with nested inert checkboxes.
- Comparison controls need labelled search and filters.

## Missing data contracts

- Verified AMC Research Rating contract:
  - methodology version
  - dimensions and weights
  - source dates
  - coverage
  - missing inputs
  - confidence
  - change rationale
- Verified AMC update/timeline contract:
  - date
  - event type
  - source
  - affected funds
  - before/after
  - confidence
  - official/editorial classification
  - why it matters
- Verified AMC flow/AUM contract:
  - monthly net flow
  - quarterly trend
  - AUM trend
  - market share
  - category flow mix
  - source and publication date
- Canonical fund-family identifier contract. Until supplied, the frontend can only approximate families from scheme names and must label this limitation.

## Proposed solution

- Replace the wide navbar search with a compact command button that opens the existing command palette.
- Redesign nav into institutional top-level groups with accessible dropdowns.
- Turn the homepage graph into a research universe explorer with filters, selected AMC/category details, and mobile list fallback.
- Replace the dashboard wizard with a compact Morning Research Workflow: progress, five stages, reviewed/skip actions, evidence links, notes, and completion summary.
- Rebuild AMC comparison around 2–4 selected AMCs, searchable multi-select, executive dimensions, category matrix, fund-level rows, unavailable rating/flow/update states, and working save/delete/copy/open/compare actions.

## Previous Codex work observed

- Navigation and mobile dock were recently redesigned.
- Auth/profile gating was recently added.
- Portfolio import/dashboard was recently redesigned.
- These changes are preserved; this pass edits only the requested nav/dashboard/home graph/AMC comparison surfaces.
