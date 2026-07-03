# Production Freshness Incident — 2026-07-04

## Root causes (two, independent, both confirmed live)

### 1. Zero GitHub Actions secrets configured

`gh secret list -R S-h-u-b-h-1/mutual-funds` returns **nothing** — not one secret exists on this
repo. Confirmed by reading the actual run logs (not inferring from green checkmarks):

```
##[warning]SUPABASE_SERVICE_ROLE_KEY not set — skipping ingestion.
  SUPABASE_SERVICE_ROLE_KEY:
```

Every scheduled run of `daily-nav.yml` and `news_ingest.yml` has been hitting this exact
graceful-skip path and reporting **success** in 6-10 seconds — far too fast for a real ingestion
(downloading/parsing a 1.6MB AMFI file and writing 14k+ rows takes noticeably longer). Verified
directly in Supabase:

| Table | Real state |
|---|---|
| `fact_nav_daily` | latest `nav_date` = **2026-06-23** (10 days stale as of this incident) |
| `fact_pipeline_runs` | exactly 3 rows, all dated 2026-06-24 — the one-time manual project seed, never touched since |
| `news_articles` | **0 rows**, ever |
| `mv_asset_class_summary` | correctly reflects the same stale `fact_nav_daily` — not separately broken, just accurately showing stale source data |

**This was previously reported** (see [[mfpulse-ci-secret-missing]]) but not yet fixed. This
incident re-confirms it's still true and quantifies the actual staleness (10 days) and blast
radius (zero news ever, zero pipeline runs since project creation).

### 2. Vercel's GitHub auto-deploy has been failing on every single push (newly discovered)

Every deployment this project has ever shown live was triggered by a **manual** `vercel --prod`
CLI call from inside the `frontend/` directory — not by pushing to `main`. Proof: every "Ready"
deployment in `vercel ls` is paired with a near-simultaneous "Error" deployment aliased
`frontend-git-main-*` (Vercel's naming convention for git-integration-triggered builds). Its
actual build log:

```
Cloning github.com/S-h-u-b-h-1/mutual-funds (Branch: main, Commit: 82d2b13)
Running "vercel build"
Error: > Couldn't find any `pages` or `app` directory. Please create one under the project root
```

**Cause:** the Vercel project's **Root Directory** setting is not set to `frontend`. Git-triggered
builds clone the whole monorepo and try to build from the repo root, where there is no `app/` —
the real Next.js app lives in `frontend/app/`. My manual CLI deploys have always worked because
running `vercel --prod` from inside `frontend/` makes the CLI itself resolve the project root
correctly, independent of this broken dashboard setting.

**Impact:** if manual CLI deploys had ever stopped (session end, different operator, assuming
"push to main" is enough — the normal expectation for a repo with Vercel connected), the site
would have silently frozen at whatever was last manually deployed, with no error visible anywhere
a normal user would look — only in Vercel's own deployments list, easy to miss among the "Ready"
manual ones.

### 3. Minor, related: CI's frontend-build fallback pointed at a deleted Supabase project

`ci.yml` had a hardcoded fallback `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
pointing at `autijihzocnxduipeaop` — the old "FinPulse" project, deleted when this project
migrated to MF-Pulse (`fffxwcpptpyjuifknayj`). Doesn't affect production (Vercel's own project
env vars are separately configured and correct — production has been serving real MF-Pulse data
all along), only means CI's build check wasn't exercising the real, current backend. Fixed to the
current project's real (public, RLS-protected) anon key.

## What was fixed this incident

| Fix | File |
|---|---|
| Skip-path now fails loudly (`exit 1`, `::error::`) instead of silently succeeding (`exit 0`, `::warning::`) — a pipeline that cannot do its job should show red, not blend in with real successes | `.github/workflows/daily-nav.yml`, `.github/workflows/news_ingest.yml` |
| Stale CI fallback pointing at a deleted Supabase project | `.github/workflows/ci.yml` |
| `/brief` now shows an explicit, real, data-driven stale banner — "Brief is stale. Latest available data: `<date>`. Pipeline last ran: `<time>`." — sourced from `fact_pipeline_runs`, not hardcoded | `frontend/app/brief/page.js` |
| New on-demand "Production Refresh" workflow: ingest NAV + news → rebuild static bundles → data-quality gate → commit → deploy (via Vercel CLI from the correct subdirectory, sidestepping the broken git-integration path entirely) | `.github/workflows/production-refresh.yml` |
| This document | `docs/PRODUCTION_FRESHNESS_INCIDENT.md` |

## What still requires you — nothing here can be done through my tools

1. **Add `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_URL`** as repo secrets (Settings → Secrets and
   variables → Actions). I'm barred from ever handling API keys/tokens myself, even with
   explicit authorization — this is a hard rule, not a missing capability.
2. **Fix the Vercel Root Directory setting**: Vercel dashboard → your project → Settings →
   General → Build & Development Settings → Root Directory → set to `frontend` → Save. I have no
   tool that can change this — it's not exposed by the Vercel MCP tools or CLI available to me,
   only the dashboard (or the full REST API with a token I don't have).
3. **Optional but recommended**: add `VERCEL_TOKEN` (+ `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`) as
   secrets so `production-refresh.yml`'s deploy step can run automatically. Without it, that
   workflow will still ingest/rebuild/commit correctly, but you'd need to run `vercel --prod`
   yourself afterward (or fix #2 above so the automatic git-triggered deploy starts working).
4. Once secrets exist, either wait for the next scheduled run or trigger **Production Refresh**
   manually (Actions tab → "Production Refresh (manual)" → Run workflow) to force it right now.
