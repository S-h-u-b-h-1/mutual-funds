# Production Release Runbook

Production Deployment Integrity mission, 2026-07-19. Written after a real incident: two green
`production-refresh.yml` runs left `mf-pulse.vercel.app` serving a commit 4 pushes behind `main`
while every step reported success. Root cause, fix, and the standing verification process are
below.

## The one pipeline

`.github/workflows/production-refresh.yml` is the only path that moves code or data from `main`
onto the public domain. There is no separate "just deploy code" workflow — pushing to `main`
alone does **not** move `mf-pulse.vercel.app` (see "Why a plain `git push` isn't enough" below).
To get a code change live, push to `main`, then either wait for the next scheduled run (14:30 UTC
and 05:00 UTC daily) or trigger it manually:

```
gh workflow run production-refresh.yml
```

## Normal deployment procedure

1. Commit and push to `main` as usual (owner identity, Conventional Commits — see repo's git
   commit policy).
2. Trigger `production-refresh.yml` (scheduled runs handle this automatically twice a day; use
   `gh workflow run production-refresh.yml` for an on-demand release).
3. The job runs, in order: download AMFI data once → ingest NAV → ingest news (non-fatal) →
   rebuild bundles → data-quality gate (`pytest tests/`) → live-data-guarantee assertion → commit
   any changed bundles → **determine whether production needs re-pointing** → point the domain at
   the right deployment → **verify production actually reflects HEAD** (always runs, hard-fails
   the job on mismatch).
4. Check the run: `gh run view <run-id>` (prefer this over `gh run watch`, which has its own
   long-lived-connection timeouts unrelated to whether the run actually succeeded).
5. Cross-check `https://mf-pulse.vercel.app/api/freshness` — `deployedCommitSha` must equal
   `git rev-parse HEAD`. **A green workflow is not proof of a fresh deployment on its own; this
   endpoint is.**

## Why a plain `git push` isn't enough

Vercel's git integration builds every push to `main` automatically, but the custom domain
`mf-pulse.vercel.app` does not auto-follow new production deployments on this project — it stays
aliased to whatever it was last explicitly pointed at. Only step 6 of the workflow
(`Point mf-pulse.vercel.app at this refresh's deployment`) moves the alias. This is a real,
confirmed property of this specific project's Vercel configuration, not a general Vercel
behavior — don't assume push-to-deploy without checking `/api/freshness` after any push you care
about.

## The 2026-07-19 incident: what actually happened

Steps 5-7 used to all share one gate: `if: steps.bundles.outputs.changed == 'true'`, where
`changed` is set by step 3 diffing `frontend/app/data/` against what's already committed. That
answers "did THIS run's AMFI ingest produce new bundle data" — a fine trigger for step 5
(committing bundles), but the **wrong** trigger for steps 6/7 (pointing the domain at HEAD),
because it silently assumes bundle changes are the only reason HEAD would move.

Four commits landed directly via `git push` in this session (frontend feature work, no data
bundle changes). Two `workflow_dispatch` runs followed, both correctly re-ingesting already-fresh
AMFI data, both correctly computing `changed=false`, both therefore skipping steps 5-7 entirely —
a "skipped" conclusion, which GitHub Actions treats as passing, not failing. The job summary
showed green. `mf-pulse.vercel.app` kept serving the pre-session commit throughout. Caught only by
manually comparing `/api/freshness`'s `deployedCommitSha` against `git log`.

**Fix**: a new step 5b (`Determine whether production needs re-pointing`) runs unconditionally,
compares the *live* `deployedCommitSha` (fetched from `/api/freshness` itself, not assumed) against
this run's HEAD, and sets `needed=true` if they differ, if bundles changed, or if production was
unreachable (fails open — an unnecessary re-alias is harmless, a silently skipped necessary one is
this incident). Step 6 now gates on that. Step 7 (verify) is now **unconditional** — the standing
assertion that catches this exact bug class even if step 5b itself has a future bug.

## Stale-SHA diagnosis (ground-truth checklist)

When in doubt about what's actually live, check in this order — each is an independent source,
don't trust just one:

1. **Local/remote HEAD**: `git rev-parse HEAD` vs `git rev-parse origin/main` (after `git fetch`).
   They should match; if not, you haven't pushed yet.
2. **What the last CI run built**: `gh run view <run-id>` shows the checkout step's SHA (it always
   checks out `origin/main` at trigger time).
3. **Step-level outcome**: `gh api repos/<owner>/<repo>/actions/jobs/<job-id> --jq '.steps[] | "\(.number)\t\(.status)\t\(.conclusion)\t\(.name)"'`
   — look specifically for steps 5/6/7 (or 5b/6/7 post-fix). `skipped` on 6/7 with a `needed=false`
   from 5b is fine (production was already current); `skipped` for any other reason is the bug
   class this runbook exists for.
4. **What Vercel actually deployed and aliased**: `GET https://api.vercel.com/v6/deployments?projectId=<id>&teamId=<org>&target=production`
   with `Authorization: Bearer $VERCEL_TOKEN` — find the deployment whose
   `meta.githubCommitSha` matches HEAD, confirm `readyState: READY`.
5. **What the domain is aliased to**: `GET https://api.vercel.com/v9/projects/<id>/domains?teamId=<org>`
   or check the Vercel dashboard → project → Settings → Domains → `mf-pulse.vercel.app`.
6. **What's actually being served, at runtime**: `curl -s https://mf-pulse.vercel.app/api/freshness`
   — this is the only one of the six that reads a value baked into the *running* deployment
   (`process.env.VERCEL_GIT_COMMIT_SHA`, injected by Vercel at build time), not metadata about a
   deployment that may or may not be the one actually attached to the domain. Treat this as the
   tie-breaker if any of the above disagree.

## Common alias failures

- **Missing/invalid `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`**: step 6 hard-fails
  immediately with a specific message (which secret, and what to fix) before attempting any
  Vercel API call — check that step's log first, not the Vercel dashboard.
- **Git-integration deployment never appears**: step 6 polls for ~5 minutes (10 attempts × 30s)
  for a deployment matching HEAD's SHA, then falls back to a direct `vercel deploy --prebuilt
  --prod` + `vercel alias set`. If even the fallback fails, Vercel's git integration itself is
  likely disconnected — check project Settings → Git in the Vercel dashboard.
- **Alias succeeds but `/api/freshness` still shows the old SHA**: propagation lag — step 7
  already retries (5× with 45s waits, plus a 75s initial wait when step 6 just ran). If it still
  fails after that, the alias may have pointed at the wrong deployment UID; check step 6's
  "Aliasing mf-pulse.vercel.app -> deployment ..." log line against the Vercel dashboard.
- **`mf-pulse.vercel.app not attached to project`**: `VERCEL_PROJECT_ID` points at the wrong
  project. Step 6 checks this explicitly before attempting to deploy anything.

## Rollback procedure

No rollback automation exists by design — this documents the manual procedure, which is what to
use unless a genuinely urgent, verified-broken production deployment justifies building it.

1. **Identify the last known-good commit**: `git log --oneline` on `main`, or check
   `gh run list --workflow=production-refresh.yml` for the last run whose step 7 passed.
2. **Find that commit's Vercel deployment**: query
   `GET /v6/deployments?projectId=<id>&teamId=<org>&target=production` and match
   `meta.githubCommitSha` to the known-good SHA. If it was pruned, re-deploy it directly:
   `git checkout <good-sha> -- . && cd frontend && vercel deploy --prebuilt --prod`.
3. **Re-point the alias**: `vercel alias set <deployment-url> mf-pulse.vercel.app --token=$VERCEL_TOKEN`
   (the same call step 6 makes) or via the Vercel dashboard → Deployments → find the deployment →
   "Promote to Production".
4. **Verify**: `python -m scripts.verify_public_domain_freshness --expected-sha <good-sha>`
   — same script the pipeline itself uses, safe to run by hand.
5. **Database**: do **not** roll back Neon/Supabase state alongside a code rollback unless the
   broken deployment actually wrote incompatible data (check `sql/neon/*` migration history for
   anything applied after the good commit). A code-only regression almost never needs this — most
   incidents here have been deployment-pointer problems, not data corruption.
6. **Root-cause before re-deploying forward**: don't re-push the same broken commit without
   understanding what made it broken; that's how staleness incidents compound.

## Ownership of release steps

| Step | What it does | Owner if it breaks |
|---|---|---|
| 0-2 (AMFI download, NAV ingest, news ingest) | Data acquisition | `scripts/cloud_pipeline.py`, `scripts/ingest_news.py` |
| 3-4b (bundle rebuild, quality gate, freshness assertion) | Data → static JSON, correctness gate | `scripts/build_performance.py`, `scripts/build_daily.py`, `tests/`, `scripts/assert_pipeline_freshness.py` |
| 5 (commit bundles) | Persist refreshed data to git | This workflow file |
| 5b (staleness check) | Decide if production needs re-pointing | This workflow file |
| 6 (alias) | Point `mf-pulse.vercel.app` at the right deployment | This workflow file + Vercel project config (secrets, domain attachment) |
| 7 (verify) | Prove production matches HEAD | `scripts/verify_public_domain_freshness.py` |

## Expected environment variables (repo secrets, Settings → Secrets and variables → Actions)

| Secret | Used by | Required for |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Steps 1, 2, 3 | NAV/news ingestion, coverage audit |
| `DATABASE_URL` | Steps 1, 4 | Neon mirror write, test suite |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | Step 6 | Domain aliasing — without these, code still deploys via Vercel's git integration but the custom domain never moves |

At runtime (Vercel-injected, not repo secrets — see
[Vercel system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)):
`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_REF` (branch), `VERCEL_ENV` — all read by
`/api/freshness` and never overridden or cached by the app.
