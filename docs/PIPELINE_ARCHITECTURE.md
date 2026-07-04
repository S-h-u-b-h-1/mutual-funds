# MF Pulse — Production Pipeline Architecture (P0 Audit)

> Ground truth only — every claim below was verified by reading actual workflow YAML, running
> `gh run list`/`gh run view --log-failed`, querying Supabase directly, and checking live Vercel
> deployment metadata. Nothing here is inferred from code comments alone.

## The chain, as it exists right now

```
AMFI (NAVAll.txt)
   │
   ├─▶ daily-nav.yml (cron 14:30 UTC Mon–Sat) ──▶ scripts/cloud_pipeline.py ──▶ Supabase fact_nav_daily
   │        STOPS HERE. Never rebuilds bundles. Never commits. Never deploys.
   │
   ├─▶ news_ingest.yml (cron every 3h) ──▶ scripts/ingest_news.py ──▶ Supabase news_articles
   │        STOPS HERE. No bundle/deploy dependency (fine — /news reads Supabase live).
   │
   ├─▶ factsheets.yml (cron 5th of month) ──▶ scripts/factsheet_pipeline.py ──▶ metadata.json
   │        Commits metadata.json directly. Never calls archive_factsheets.py (separate,
   │        unwired script — factsheet_archive table is fed by NOTHING automated).
   │
   └─▶ production-refresh.yml (workflow_dispatch ONLY — manual)
            AMFI → cloud_pipeline.py → ingest_news.py → build_performance.py → build_daily.py
            → pytest gate → git commit+push → vercel deploy (needs VERCEL_TOKEN, absent)
            This is the ONLY workflow that does the full chain. It has ZERO runs, ever.
```

**The gap, in one sentence:** the only workflow that regenerates `funds.json`/`performance.json`/
`daily.json` and deploys them is manual-only and has never run; the workflow that *is* scheduled
never touches those files. Fresh NAV in the database and fresh data on the website are two
completely disconnected outcomes today.

## Per-step audit

| Step | Running? | Frequency | Trigger | Consumes | Produces | Failure mode | Detected? | Reported? | Recovered? |
|---|---|---|---|---|---|---|---|---|---|
| AMFI download | Yes, inside cloud_pipeline.py | On each pipeline invocation | Called by daily-nav.yml / production-refresh.yml | `portal.amfiindia.com/spages/NAVAll.txt` | in-memory NAV rows | AMFI unreachable/format change | Script exits non-zero | GH Actions run marked failed | No retry |
| Parser | Yes | Same as above | Same | Raw NAVAll.txt | Parsed scheme/NAV rows | Malformed line | Per earlier fix, malformed rows skipped, not fatal | Only in step logs | N/A |
| Warehouse write | **Ran on old code only — new loud-fail code has not had a real successful run yet** | Meant to be daily | daily-nav.yml cron | Parsed rows | Supabase `fact_nav_daily`, `dim_scheme` | Missing secret (was silent, now `exit 1`); RLS/permission error (untested) | Now yes (loud) | Yes (`::error::` + red run) | No retry |
| Analytics (matviews) | Called inside cloud_pipeline.py via `refresh_analytics()` RPC | Tied to warehouse write | Same | `fact_nav_daily` | `mv_asset_class_summary`, `mv_amc_summary` | RPC failure | Only if pipeline checks return code | Only in logs | No |
| Intelligence engine (`build_performance.py`, `build_daily.py`) | **Never runs in CI at all** | N/A — local-only today | Nobody | Supabase/local NAV | `performance.json`, `daily.json` | N/A | No | No | No |
| Factsheet archive (`archive_factsheets.py`) | **Never runs in CI** | N/A | Nobody | Existing archive rows | `factsheet_archive` snapshots, `fund_history_events` | N/A | No | No | No |
| JSON generation | Only ever run manually/locally by an operator | N/A | Manual | Supabase + AMFI file | `frontend/app/data/*.json` | N/A | No | No | No |
| Commit of regenerated JSON | Only inside `production-refresh.yml`, which has never run | N/A | Manual dispatch (never invoked) | Changed `*.json` | git commit on `main` | Data-quality gate (pytest) failure | Yes, blocks commit | Yes | No |
| Next.js build/deploy | **Working, confirmed live** — git push → Vercel auto-deploy | On every push to `main` | GitHub webhook (Vercel integration) | Repo contents | Vercel deployment | Build error | Yes (Vercel dashboard/API) | Only visible via Vercel, not surfaced to the app | No |
| Production website | Serving real data, but 4 days stale as of this audit (`2026-06-30`, "4d ago") on the live homepage | — | — | Last-deployed static bundle | HTML/JSON to users | Stale bundle | **No** — nothing currently asserts staleness as a failure | Only the "Nd ago" badge, informational not alerting | No |

## What's actually solid (don't touch)

- AMFI parsing, NAV ingestion logic, and matview refresh — code is correct, just not being invoked on a schedule that reaches production.
- Vercel git-integration auto-deploy — confirmed via live deployment metadata (`source: "git"`, `readyState: "READY"`, no error) on the most recent push. The historical Root Directory misconfiguration documented in `docs/PRODUCTION_FRESHNESS_INCIDENT.md` is no longer reproducing — this path now works.
- `news_ingest.yml`'s architecture (schedule → Supabase → live server read, no static bundle) is the right shape and needs no bundle/deploy step by design.

## What's broken, ranked by impact

1. **No scheduled workflow performs ingest → rebuild bundles → commit → (deploy).** This is the entire reason the site is stale. `daily-nav.yml` ingests but stops; `production-refresh.yml` does the full job but only runs on manual click, and has never been clicked.
2. **Silent-success masked total pipeline inactivity for ~10 days.** Confirmed directly against the database: `fact_nav_daily` still has exactly 14,224 rows (the original manual seed), `fact_pipeline_runs` still has exactly 3 rows (all from 2026-06-24), `news_articles` has 0 rows — despite GitHub Actions showing repeated green "success" for both `daily-nav.yml` and `news_ingest.yml` through 2026-07-03. Those greens were the pre-fix silent-skip behavior; today's loud-failure version hasn't had its first real scheduled run yet (next one: 14:30 UTC today).
3. **Exposed credential:** `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL` exist as plaintext **repository Variables** (not Secrets) — added 2026-07-04T01:37–01:38, readable via `gh variable list` with no masking. The correctly-scoped Secrets versions were added later (09:27–09:29) and are what workflows actually use (`vars.*` vs `secrets.*` contexts don't overlap, so the variables are functionally dead — but the key is still sitting in plaintext).
4. **`VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` are not configured.** Only `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` exist as real secrets. This matters less than it did before finding #2 above, since git-push-triggered deploy already works — but it means `production-refresh.yml`'s explicit deploy step can never run, and there's no fallback if git-integration ever breaks again.
5. **`DATABASE_URL` (Neon) is declared as a secret but referenced in zero workflow files.** The entire Neon dual-write layer built in the prior sprint has never executed in CI — it only ever ran when manually invoked locally.
6. **`archive_factsheets.py`, `compare_supabase_neon_counts.py`, `persist_market_quotes.py` are not wired into any workflow.** They exist, are tested locally, and do nothing in production.
7. **CI is red on the actual `main` branch right now** — `ModuleNotFoundError: No module named 'psycopg'` and a missing `data/NAVAll.txt` FileNotFoundError. Both fixes exist locally (uncommitted) from this session's earlier work but were never pushed.
8. **No live staleness assertion anywhere.** The homepage's "4d ago" badge is informational, not a gate — nothing fails a build or pages anyone when data crosses a staleness threshold.

Phases 2–12 (workflow-by-workflow verification, secret verification, the live end-to-end test, and the fixes) follow this document.
