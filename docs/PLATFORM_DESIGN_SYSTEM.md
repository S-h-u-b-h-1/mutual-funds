# Suasion Platform Design System

The Invest, Advisor, Operations and Management surfaces share a small set of contract-neutral
primitives in `frontend/app/components/invest/PlatformPrimitives.jsx`.

## Shared primitives

- `KpiCard` — label, server-derived value, detail and optional status.
- `QueueCard` — queue name, status and backend availability detail.
- `AwaitingData` — explicit unavailable-data copy; never a fabricated zero.
- `LoadingSkeleton` — semantic `role=status` loading state with `aria-busy`.
- `EmptyState` — responsive empty state with optional action.
- `ErrorState` — alert state with an explicit retry callback.
- `SectionHeader` — consistent heading, description and action alignment.
- `StatusPill` — centralized lifecycle coloring and accessible status name in `InvestShell`.
- `TransactionTimeline` — shared money-movement lifecycle rendering.

## Accessibility rules

- Interactive controls use native buttons, links, inputs and labels.
- Loading regions expose `role="status"` and `aria-busy="true"`.
- Recoverable failures use `role="alert"` and a visible retry action.
- Status badges expose an accessible `Status: …` name.
- Cards remain `min-w-0`; grids collapse before 768px and must not create horizontal overflow.
- Motion must remain optional; skeleton and transitions must respect the global reduced-motion rule.

## Contract discipline

Primitives accept display data only. They do not fetch, infer business states, calculate financial
metrics, or decide permissions. Each workspace owns its API adapter and passes server-derived data
into these components.
