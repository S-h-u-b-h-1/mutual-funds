# Persistent Portfolio Audit

Verified directly against the current schema (`sql/neon/002_auth_and_user_data.sql`,
`sql/neon/003_investor_intelligence.sql`, `sql/neon/007_cas_import.sql`), the live API
routes, and `.github/workflows/production-refresh.yml` — not against any prior session's
claims. Every finding below cites the exact file/table it comes from.

## 1. What already IS persisted server-side (Neon), correctly

- **`portfolio_holdings`** — one row per `(user_id, scheme_code, source, folio_number)`.
  Written by both the CSV/manual path (`app/api/v1/portfolio/upload/route.js`) and the CAS
  path (`app/lib/portfolioImport/upload/casUpload.js`). This is real, server-owned data —
  it survives logout, browser refresh, and a second device, because it's read fresh from
  Neon on every request via `getUserHoldings()` (`app/lib/portfolioImport/holdingsRead.js`).
- **`portfolio_transactions`** — written only by the CAS ledger-format path (the
  Consolidated Account *Summary* sub-format produces zero transactions, since a summary
  statement has no transaction history to extract — confirmed empirically this session:
  8/8 holdings, 0 transactions, on the one real CAMS Summary tested).
- **`portfolio_uploads`** — an audit-log row per upload attempt (success/partial/failed),
  with `content_sha256`/`file_size_bytes`/`provider`/`identity_check_note` added by
  migration 007 for the CAS path specifically.
- **`portfolio` (cache row)** — one row per user (its primary key IS `user_id`, not an
  independent `id` — see Finding 4 below), holding `total_value`/`holdings_count`/
  `last_computed_at`. Updated by both the upload path and `/api/v1/portfolio/intelligence`.
- **Current value is genuinely live, not stale** — `getUserHoldings()` enriches every
  stored holding with `getFund(scheme_code)`, which reads `funds.json` — refreshed daily
  by `production-refresh.yml`. So the dashboard's *current* market value already reflects
  the latest AMFI NAV on every page view. What's missing is a stored *history* of that
  value over time (Finding 3), not the live figure itself.

## 2. What is temporary / client-only

- **Upload History list** (`PortfolioWorkspace.jsx`, `HISTORY_KEY =
  "mfp-portfolio-upload-history-v1"`) — lives entirely in `localStorage`, keyed per
  browser. This does **not** survive a second device or a cleared browser, and is why the
  "Last Updated" / "Recent Upload" cards can go blank on a fresh device even though the
  actual holdings are still there server-side. It is UI-only convenience state, never read
  by any API — the real holdings/report data always comes from `/api/v1/portfolio/holdings`
  and `/api/v1/portfolio/intelligence`, which are correctly server-authoritative.
- **`consent`, `file`, `activeStage`, `busy`, `error`** and similar upload-flow state —
  in-memory React state only, as expected for transient UI state.

## 3. The real gap: no daily valuation history exists

- `production-refresh.yml` — **zero references to any `portfolio_*` table.** Grepped the
  full workflow file directly; confirmed empty. The daily AMFI NAV refresh pipeline does
  not touch user portfolios in any way today.
- `portfolio_snapshots` — `unique(user_id, snapshot_date)`, so at most **one row per
  calendar day**, and it is only ever written at **upload time** (inside
  `casUpload.js`), never on a schedule. A user who doesn't re-upload never gets a second
  snapshot, no matter how much the market moves. Also: the column comment documents
  `allocation jsonb` as `{ byAmc, byCategory, byAssetClass, bySector }`, but
  `casUpload.js`'s actual insert only populates `byAmc` and `byCategory` — `byAssetClass`
  and `bySector` are silently absent from every row written so far.
- `portfolio_metrics` / `portfolio_reports` / `portfolio_events` — written by
  `GET /api/v1/portfolio/intelligence`, but **unconditionally on every call**, with no
  dedup and no "only if holdings changed" check (confirmed by reading the route directly:
  every `computeReport()` call from the frontend — on page load, after upload, and
  presumably a "Refresh analysis" button — inserts one new row into each of these three
  tables). A user who simply revisits their dashboard repeatedly accumulates unbounded
  rows with no signal of which one is "the" value at a given date. This is the opposite of
  Phase 10's requirement ("do not recompute expensive analytics when only unrelated data
  changed") and needs a real fix, not just a new valuation table layered on top.
- **Conclusion: there is no mechanism today by which a portfolio's value changes because
  the market moved, without the user re-uploading a statement.** This is the core problem
  the new mission is asking to solve, and the audit confirms it's real, not assumed.

## 4. Structural mismatches against the target domain model

- **`portfolio` has no independent `id`** — its primary key is `user_id` itself, meaning
  the current schema hard-assumes exactly one portfolio per user. The target model's
  `GET /api/v1/portfolio/:portfolioId` needs a real surrogate key.
- **No `portfolio_folio` table** — folio is just a `text` column on `portfolio_holdings`
  and `portfolio_transactions`, **stored in plain text**, not encrypted or tokenized.
  This is a direct, current gap against the new mission's Phase 13 requirement.
- **No `portfolio_import` (review-draft) concept** — `portfolio_uploads` is a flat log
  row, not a draft/approval unit. There is no `reconciliation_status`, no `parse_version`,
  no `original_file_retention_status` column, and — most importantly — **no draft state at
  all**: `casUpload.js` parses and commits to `portfolio_holdings`/`portfolio_transactions`/
  `portfolio_snapshots` in the same request, with no approve/correct/exclude/cancel step.
  This was already flagged as a gap in the prior Institutional Portfolio Import Engine
  mission's final report (task #255) and remains true.
- **No `portfolio_valuation` or `portfolio_holding_valuation` tables** — these don't exist
  in any form. `portfolio_snapshots` is the closest analog but conflates "allocation
  breakdown" with "point-in-time value" and is upload-triggered only (Finding 3).
- **`portfolio_holdings` has no history** — `unique(user_id, scheme_code, source,
  folio_number)` with `on conflict ... do update set units = excluded.units, avg_cost =
  excluded.avg_cost, imported_at = excluded.imported_at` means **a re-import silently
  overwrites the previous units value in place**. The prior state is gone the instant a
  new statement is approved. Phase 6 (diffing added vs. removed vs. changed holdings
  across imports) is impossible against the current table without a schema change, because
  the "before" side of the diff no longer exists by the time you'd compute it.

## 5. Security/privacy gaps specific to this mission's Phase 13

- Folio numbers: plain text at rest (Finding 4).
- No deletion endpoint exists for a portfolio or its holdings — grepped every
  `app/api/v1/portfolio/**/route.js` file for `export async function DELETE`: zero matches.
  A user cannot currently remove their imported portfolio through any API.
- No audit log entries are written for portfolio actions specifically (`audit_log` exists
  and is used for `sign_up`, but nothing in the portfolio import/read path writes to it).
- The original PDF is never persisted to disk (confirmed multiple times this session,
  `casPdf.js` operates on the in-memory buffer only) — this part already meets the
  "no PDF retention by default" requirement.

## 6. What's NOT broken, to avoid re-solving it

- Scheme resolution (`schemeResolver.js`, 7-tier waterfall), CAS parsing for the
  Consolidated Account Summary sub-format, checksum-based duplicate-upload detection, and
  same-folio+same-ISIN duplicate-row dedup are all real, tested, and verified against a
  real statement this session. None of that needs to be rebuilt — the new persistence
  layer should sit on top of it, not replace it.
- `schemeResolver.js`, `getFund()`/`funds.json`, and the existing Portfolio Intelligence
  analytics (`healthReport.js`, `analytics.js`, `allocations.js`) are real, working, and
  should be reused for the new `portfolio_valuation`/`portfolio_holding_valuation` compute
  step, not duplicated.

## 7. Direct answers to the audit's required questions

| Question | Answer |
|---|---|
| What currently persists in Neon? | `portfolio_holdings`, `portfolio_transactions`, `portfolio_uploads`, `portfolio` (cache row), and (upload-triggered only) `portfolio_snapshots`/`portfolio_metrics`/`portfolio_reports`/`portfolio_events`. |
| What is temporary / React-state-only? | Upload-flow UI state (file, stage, busy, error). |
| What only lives in localStorage? | The Upload History *list* shown in the UI — not the underlying holdings or computed report data. |
| What survives logout? | Everything in Neon (above) — confirmed by code path, not yet by a live browser test (that's Phase 16). |
| What survives another device? | The same Neon data should, since it's all `user_id`-scoped and none of it depends on localStorage — again, not yet live-verified. |
| What is recalculated daily? | Nothing, for portfolios. `funds.json` (and therefore each holding's live NAV/value on read) refreshes daily, but no portfolio-specific table is touched by the daily pipeline. |
| What is stale or disconnected? | `portfolio_metrics`/`portfolio_reports`/`portfolio_events` grow unboundedly with no retention or dedup logic; `portfolio_snapshots.allocation` is missing 2 of its 4 documented keys for every CAS-sourced row so far. |
