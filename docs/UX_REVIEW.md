# UX review

Review date: 24 July 2026.

## Improvements made

- Unified Investor navigation, cards, status pills, skeletons, empty states and error surfaces.
- Added truthful next-step language and provider references to financial timelines.
- Added retry and refresh affordances to the Transactions route.
- Preserved mobile-first touch targets and horizontal-safe filter bars.
- Kept unavailable Advisor, Operations and Management data visibly unavailable instead of inventing
  business metrics.
- Added same-AMC explanation and linked-leg messaging to the Switch journey.
- Added reduced-motion rules and semantic loading/alert regions.

## Remaining UX issues

- Dialog focus management is semantic but not yet a single reusable focus-trap pattern.
- Advisor/Operations/Management workflows cannot be fully validated until their permissions and data
  contracts are live.
- Payment-attempt detail and SIP installment history cannot be shown until backend metadata exists.
- Full browser-matrix visual review remains a release gate.

## Non-blocking future enhancements

- Add route-level optimistic refresh indicators where server contracts permit it.
- Add keyboard shortcuts only after the navigation model stabilizes.
- Add saved filters and return-to-scroll-position for large document and transaction histories.
- Add authenticated visual regression baselines for light/dark and reduced-motion modes.

All financial copy remains deliberately conservative: unavailable data is labelled, processing is not
presented as completion, and support paths remain visible.
