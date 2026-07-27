#!/usr/bin/env node
// Vercel "Ignored Build Step" — wires production deploys to the CI workflow's actual result.
// See docs/TEST_DATABASE_AND_CI.md's "Deploy gating" section for the full incident, rationale,
// and activation instructions (this file alone does nothing until pasted into Vercel's dashboard
// under Project Settings -> Git -> Ignored Build Step).
//
// Vercel's contract for this hook: exit 0 = SKIP this build (no deploy). Exit 1 = PROCEED.
// (Opposite of a typical shell "success" convention — this is Vercel's, not ours.)
//
// Verified need for this (2026-07-27): commits 8e355f2a and 7355886f both produced READY
// production deployments while their GitHub Actions "CI" run's conclusion was "failure" — Vercel's
// Git integration deploys on every push independent of CI status, with no built-in "wait for
// checks" option of its own. This script polls the GitHub Actions API for the pushed commit's CI
// result and answers Vercel's question with it.
//
// Deliberately fails OPEN (exit 1, proceed with the deploy) on every ambiguous case: no commit SHA
// in the environment, a GitHub API error, or a poll timeout. The alternative — failing closed —
// risks silently freezing every future production deploy behind a bug in THIS script or a GitHub
// API outage, which for a live financial product is a worse failure mode than staying exactly as
// gated as today (not at all) a little longer. Only a CONFIRMED CI failure blocks a deploy.
'use strict';
const https = require('https');

const REPO = 'S-h-u-b-h-1/mutual-funds';
const WORKFLOW_FILE = 'ci.yml';
const POLL_INTERVAL_MS = 15000;
// Measured full suite (frontend-tests, the slowest job): ~480s. This budgets ~1.5x that plus
// install/lint/build headroom for the other jobs. If a real run legitimately exceeds this, the
// fail-open default below lets the deploy proceed WITHOUT a confirmed-green signal — a known,
// deliberate limitation, not a silent bug. Raise this if that starts happening in practice.
const MAX_WAIT_MS = 12 * 60 * 1000;

function ghRequest(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.github.com',
        path,
        headers: {
          'User-Agent': 'mf-pulse-vercel-ignore-build-step',
          Accept: 'application/vnd.github+json',
          // Repo is public, so this works unauthenticated (60 req/hr limit). Set GITHUB_TOKEN as
          // a Vercel project env var (a fine-grained PAT with zero permissions is enough — this
          // only needs the public read the token would already have) if that ever gets hit.
          ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode >= 400) return reject(new Error(`GitHub API ${res.statusCode}: ${body.slice(0, 300)}`));
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function ciStateFor(sha) {
  const data = await ghRequest(`/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?head_sha=${sha}&per_page=5`);
  const run = (data.workflow_runs || [])[0];
  if (!run) return { state: 'not_found' };
  if (run.status !== 'completed') return { state: 'pending' };
  return { state: run.conclusion === 'success' ? 'success' : 'failure', run };
}

function proceed(reason) {
  console.log(`[ignore-build-step] PROCEED — ${reason}`);
  process.exit(1);
}

function skip(reason) {
  console.log(`[ignore-build-step] SKIP — ${reason}`);
  process.exit(0);
}

async function main() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (!sha) return proceed('no VERCEL_GIT_COMMIT_SHA in the environment (non-Git-triggered build?)');

  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    let result;
    try {
      result = await ciStateFor(sha);
    } catch (err) {
      return proceed(`GitHub API check failed (${err.message}) — not blocking deploys on our own tooling`);
    }
    if (result.state === 'success') return proceed(`CI run for ${sha} succeeded`);
    if (result.state === 'failure') {
      return skip(`CI run for ${sha} concluded '${result.run.conclusion}'`);
    }
    // 'pending' (still running) or 'not_found' (GitHub hasn't registered the run yet, which can
    // happen if this fires before the Actions webhook does) — keep waiting.
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return proceed(`timed out after ${MAX_WAIT_MS / 1000}s waiting for CI on ${sha} — not blocking deploys indefinitely`);
}

main();
