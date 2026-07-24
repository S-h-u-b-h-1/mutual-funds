# Frontend technical debt

Priorities are release impact, not a promise of backend scope.

| Priority | Debt | Estimated effort | Recommendation |
|---|---|---:|---|
| P0 | Production-like database and provider environment is not available to local integration tests. | 0.5–1 day setup | Provide a disposable Neon branch and provider sandboxes in CI; keep route tests independent. |
| P1 | Modal focus trap and focus-return behavior is not centralized across document/notification/fund dialogs. | 1 day | Extract a shared accessible dialog primitive and test Escape, initial focus and return focus. |
| P1 | The full Chrome/Edge/Safari/Firefox and 375–1920px matrix is not automated in this repository. | 1–2 days | Add a Playwright project matrix with authenticated fixtures and overflow/console assertions. |
| P1 | Payment-attempt history and retry metadata are not yet exposed by the backend. | Backend-dependent | Integrate the first-class resource without duplicating payment state in UI. |
| P2 | Advisor, Operations and Management workspaces still await scoped contracts. | Backend-dependent | Replace `AwaitingData` shells incrementally as contracts land. |
| P2 | SIP pause/modify/cancel and installment history are backend-dependent. | Backend-dependent | Keep controls informational until state transitions and permissions are published. |
| P2 | Large public research/fund pages contain heavier client components and remote data reads. | 1–2 days measured work | Profile real production traces before adding lazy boundaries or virtualization. |
| P3 | A few legacy public components use direct Supabase fetches outside the Investor API adapter. | 1–2 days | Consolidate only where duplicate request behavior is measured; do not broaden the adapter casually. |
| P3 | Some internal pages emit expected DNS warnings when external services are unavailable. | 0.5 day | Add observability-level filtering and explicit degraded-state telemetry in production. |

No debt item authorizes fabricated financial values or client-side business rules.
