# Frontend Integration Report — Mission A

Connects the auth/cloud-sync backend (`AUTH_SYNC_ARCHITECTURE.md`) to the current Antigravity
frontend, which had evolved significantly (Strategy Builder, Daily Session, the "Financial
Operating System" homepage, premium research workspace) between when the backend sprint started
and when this integration began. No UI redesign, no component removal — persistence logic only.

## 1. All 19 localStorage keys, mapped

| Key | Status | Notes |
|---|---|---|
| `mfp_watchlist` | **Synced** | `WatchButton`, `Watchlist`, `WatchlistIntelligence` → `cloudSync.getWatchlist/saveWatchlist/removeFromWatchlist` |
| `watchlist` (bare, no prefix) | **Bug fixed, removed** | Was a second, incompatible watchlist disconnected from the real one — see §3 |
| `mfp_research_notes` | **Synced** | `ResearchNotes`, `NotebookPreview`, `ResearchWorkspaceClient`'s notes panel → `getNotes/getAllNotes/saveNote/deleteNote` |
| `mfp_recent_views` | **Synced** | `Tracker`, `RecentActivity`, `AdvisorSoftCTA` → `getHistory/saveHistory` |
| `mfp_recent_visits` (bare) | **Bug fixed, removed** | Duplicate view-tracking system, unified into `mfp_recent_views` via `getHistory`/`saveHistory` — see §3 |
| `mfp_recent_searches` | **Synced** | `Search.jsx` → `getSearchHistory/saveSearch` (folds into history as `entityType: 'search'` server-side) |
| `mfp_recent_compares` | **Synced** | `CompareClient`, `SavedComparisons` → `getComparisons/saveComparison/deleteComparison` |
| `mfp_compare_ws` | **Synced (unified)** | Was a second, separate local-only workspace list written alongside `mfp_recent_compares` on every save, never reconciled — unified onto the one comparisons resource, see §3 |
| `mfp_left_collapsed` | **Synced** | `HomepageClient` panel toggle → `getPreferences/savePreferences`, mapped into `dashboard_layout.leftCollapsed` |
| `mfp_right_collapsed` | **Synced** | Same, `dashboard_layout.rightCollapsed` |
| `mfp_audio_enabled` | **Synced** | Same, `dashboard_layout.audioEnabled`; `DailySessionWorkflow.jsx` still reads this key directly, which is safe since `savePreferences()` keeps it correctly mirrored |
| `mfp_migration_prompt_seen` | **New, local-only by design** | Added for `SyncPrompt.jsx` (§5) — per-browser "have I been asked" flag, deliberately never synced |
| `mfp_watchlist_snapshot` | **Local-only (by design)** | `WatchlistIntelligence`'s diff-baseline cache — derived data, recomputed fresh on any device, not user-authored |
| `mfp_onboarded_v2` | **Local-only (by design)** | Fund-page onboarding-tour-seen flag — UI chrome, not research data |
| `mfp_sid` | **Local-only (by design)** | Per-browser analytics session id — syncing this would actively break analytics dedup |
| `mfp_pinned_pages` | **Local-only — future backend required** | Command-palette shortcuts; personal curation worth syncing eventually, but no backend bucket exists today |
| `mfp_screener` | **Local-only — future backend required** | One saved screener query string; doesn't fit the current `dashboard_layout`/`theme` preferences shape |
| `mfp_strategies` | **Local-only — future backend required** | Strategy Builder (`ResearchWorkspaceClient.jsx`). No backend table/API exists for this concept at all — building one is new schema+API work, out of this integration's "connect, don't build new features" scope |
| `mfp_session_completed_${date}` | **Local-only — future backend required** | Daily Session's per-day journal log (`DailySessionWorkflow.jsx`). Structurally its own concept (statements/funds/cohorts/questions/observations per calendar day), doesn't map onto any of the 6 sync buckets as-is |
| `mfp_portfolio` | **Not implemented (unchanged)** | Referenced only in a comment in `portfolioSchema.js` — explicitly architecture-only, no reads/writes exist anywhere, matches Mission B's future scope |

**Collections** (`user_collections`/`user_collection_items`) and **Preferences**' `theme` field have
real backend support but zero current frontend consumer — nothing to wire because nothing calls them
yet. Left ready for future use, not invented a UI for.

## 2. Duplicate keys removed / unified

Two were genuine pre-existing bugs (accidental divergence, not intentional design):
- **Bare `"watchlist"`** (`CompareFundsClient.jsx`'s "Add all to Watchlist", `HomepageClient.jsx`'s demo button) — wrote plain scheme-code strings to a key nothing else read. Funds added there never showed up as watchlisted anywhere else in the app. Fixed: both now call `saveWatchlist()`.
- **`mfp_recent_visits`** (`Search.jsx`'s command palette, `FundPageClient.jsx`'s own tracking) — a second view-history system, different shape, no cloud sync, never reconciled with `mfp_recent_views`. `FundPageClient`'s copy was a straight duplicate of what `Tracker.jsx` already recorded on the same page load and is removed outright; `Search.jsx` now reads/writes through `getHistory()`/`saveHistory()`.

One was intentional-but-fragile duplication, unified rather than "fixed" as a bug:
- **`mfp_compare_ws` + `mfp_recent_compares`** — `CompareClient.jsx`'s "save workspace" wrote both together on every save (`persistWs()` then `recordComparison()`), but they were never a single source of truth — `SavedComparisons.jsx` only ever read the second one. Unified onto one cloud-syncable resource; `deleteComparison()` now accepts either the cloud id or the local name (or both) since local entries have no id of their own, preserving delete-a-saved-comparison for anonymous users.

## 3. Other bugs found and fixed along the way

Four pre-existing missing-import bugs in `FundPageClient.jsx` (`gradeTone`, `researchSummary`,
`relativeTime`, `completenessTone`) — none related to this integration, but the page was 500ing
entirely before these fixes, which would have blocked verifying the watchlist/notes wiring on it
regardless. Root cause: recent Antigravity commits (`121a123`, `21c1189`) added JSX referencing
these helpers without adding their imports.

## 4. Migration UX (Phase 6)

The original backend sprint wired `migrateLocalDataToCloud()` as a **silent** call on every
login/register success. This integration's own spec asks for a **confirmation prompt** instead —
those two are contradictory (silent auto-migration would already be done by the time a prompt
could offer it). Fixed: removed the silent calls, added `SyncPrompt.jsx` — a small dismissible
banner mounted once in the root layout, shown only when signed in AND real local data exists.
Accept syncs; skip leaves local data untouched; a per-browser flag (not a server-side "ever
migrated" flag) prevents re-nagging without incorrectly suppressing the prompt on a genuinely
different second device.

## 5. Auth UX consistency (Phase 8)

`AuthStatus.jsx` — signed-out shows "Sign in"; signed-in shows name, sync mode (☁ Synced / ⚠
Local only), and "Sign out". Wired into `Nav.jsx`'s desktop bar (additive, next to the existing
"Get alerts" button — nothing removed) and a matching minimal row in `MobileNav.jsx`'s panel.

## 6. Verification

**Build**: `npm run build` — clean, all 51 routes generated, zero errors. Independently
re-confirmed on GitHub Actions' own CI runner (`gh run list` shows both integration commits
passing the "Next.js build" job on fresh infrastructure, not just locally).

**Tool blocker, disclosed**: `preview_start` (the sanctioned dev-server tool) hit a hard,
workspace-level port-3000 lock from another session that persisted across autoPort, an explicit
port-3001 config, and an entirely new config name — three genuinely distinct attempts, all
identical failures. `claude-in-chrome` had zero connected browsers. Per your explicit, repeated
instruction, I started the dev server via Bash on port 3001 instead. This means verification
below is **functional** (real HTTP requests against a real running server, real database) rather
than **visual** (no screenshots/click-testing were possible this pass) for everything wired since
the block hit. The one exception: watchlist add/remove and notes save/delete were click-tested in
a real browser earlier in this session, before the block, on the identical `cloudSync.js` pattern
every other component now also uses.

**46 automated checks, all passing** — a single consolidated suite
(`scripts/test_backend_sync.mjs`; the original 36 plus supplementary coverage folded in as
permanent regression tests: comparisons/preferences isolation, cross-device via two independent
sessions on one account, a full 5-category migration payload with per-category count assertions
and post-migration querying, and alert-rule-cap re-confirmation), covering:

| Area | Result |
|---|---|
| Anonymous mode | Watchlist/notes/comparisons/preferences all confirmed writing to the correct localStorage keys with the correct shapes when signed out (no session = no cloud calls attempted). Strategy Builder and Daily Session are local-only by design (§1) — nothing to break. |
| Logged-in mode | Watchlist, notes, history, comparisons, collections, preferences, alerts all round-trip through the real `/api/v1/sync/*` APIs against the disposable Neon branch. Logout/login-again persistence confirmed via the cross-device check below (a fresh session logging into the same account sees the same data — a login/logout cycle is a strict subset of that). |
| Migration | Full 5-category payload (watchlist, notes, views, searches, comparisons) migrated with correct per-category counts; second call correctly no-ops (`{migrated:false, reason:"already_migrated"}`); migrated data independently re-queried (not just counted) to confirm it's actually there. |
| Cross-device | Simulated via two independent sessions on the same real account (device A writes, device B — a fresh cookie jar, i.e. a different browser — logs in and sees A's watchlist item and note). |
| Cross-user isolation | Re-confirmed across every resource type including two not in the original 36-check suite: comparisons (B's delete of A's comparison safely no-ops, A's data survives) and preferences (B's write never affects A's). |
| Security regression | Full 46-check suite re-run clean after all frontend changes; alert-rule 50-cap explicitly re-confirmed still rejects a 51st rule with 429 post-wiring. |
| Pages | `/`, `/fund/[scheme_code]`, `/compare`, `/research`, `/dashboard`, `/login`, `/register`, `/forgot-password` — all HTTP 200, zero server errors (one transient webpack first-compile warning self-resolved on the same request, consistent with a known dev-mode-only artifact from earlier in this session). |

## 7. Remaining blockers before Mission B (portfolio/Gemini)

**None that are load-bearing.** The one real open item is that `mfp_strategies`,
`mfp_pinned_pages`, `mfp_screener`, and `mfp_session_completed_*` have no backend yet — this is a
documented, deliberate scope boundary (§1), not a defect, and doesn't block anything else.

The one genuine caveat: this pass's verification is functional/API-level rather than
click-tested/visual for everything wired after the port-3000 block hit (§6). If pixel-level
confidence matters before Mission B, the dev server is currently live on `localhost:3001` (started
via Bash per your instruction) and ready for either a screen-share style check or for
`preview_start` to be retried once the other session's lock clears.
