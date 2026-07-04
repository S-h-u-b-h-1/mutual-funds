// Server-only pipeline/deployment health signals (P0 go-live sprint, Phase 8). Every function
// degrades to null on error — a monitoring page must never crash or show a fake "healthy" from
// a caught exception; the page itself renders every null as an explicit "unknown", never blank.
import { sb } from "./supabase";

const REPO = "S-h-u-b-h-1/mutual-funds"; // public repo — Actions run history is readable with
// no token (verified live before wiring this in); revalidate is 10min to stay well under the
// unauthenticated GitHub API's 60 req/hr-per-IP limit even across multiple ISR-caching instances.
const WORKFLOWS = ["ci.yml", "production-refresh.yml", "news_ingest.yml", "factsheets.yml"];
const GH_REVALIDATE = 600;

async function safeJson(url) {
  try {
    const res = await fetch(url, { next: { revalidate: GH_REVALIDATE }, headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function getWorkflowStatuses() {
  return Promise.all(
    WORKFLOWS.map(async (wf) => {
      const data = await safeJson(`https://api.github.com/repos/${REPO}/actions/workflows/${wf}/runs?per_page=1`);
      const run = data?.workflow_runs?.[0];
      return {
        workflow: wf,
        conclusion: run?.conclusion ?? null,
        status: run?.status ?? null,
        ranAt: run?.run_started_at ?? null,
        url: run?.html_url ?? null,
        neverRun: data != null && (data.total_count ?? 0) === 0,
      };
    })
  );
}

// This running deployment's own build-time commit (Vercel auto-injects this — no token needed,
// works only if "Automatically expose System Environment Variables" is on) vs. the repo's real
// current HEAD (public API, no token). If either side is unavailable, `current` reports null
// (unknown) rather than a guessed true/false.
export async function getDeploymentCurrency() {
  const deployedSha = process.env.VERCEL_GIT_COMMIT_SHA || null;
  const head = await safeJson(`https://api.github.com/repos/${REPO}/commits/main`);
  const headSha = head?.sha ?? null;
  return {
    deployedSha,
    deployedMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE || null,
    headSha,
    headMessage: head?.commit?.message?.split("\n")[0] ?? null,
    headAt: head?.commit?.author?.date ?? null,
    current: deployedSha && headSha ? deployedSha === headSha : null,
  };
}

export async function getFreshnessChain() {
  try {
    const [navRows, healthRows] = await Promise.all([
      sb("fact_nav_daily?select=nav_date&order=nav_date.desc&limit=1", { revalidate: 300 }),
      sb("fact_system_health?select=*&order=captured_at.desc&limit=1", { revalidate: 300 }),
    ]);
    return { navLatest: navRows?.[0]?.nav_date ?? null, health: healthRows?.[0] ?? null };
  } catch {
    return { navLatest: null, health: null };
  }
}

export async function getPipelineRuns(limit = 8) {
  try {
    return await sb(`fact_pipeline_runs?select=*&order=finished_at.desc&limit=${limit}`, { revalidate: 300 });
  } catch {
    return [];
  }
}

export async function getNewsFreshness() {
  try {
    const rows = await sb("news_articles?select=fetched_at&order=fetched_at.desc&limit=1", { revalidate: 300 });
    return rows?.[0]?.fetched_at ?? null;
  } catch {
    return null;
  }
}

export async function getFactsheetFreshness() {
  try {
    const rows = await sb("factsheet_archive?select=fetched_at&order=fetched_at.desc&limit=1", { revalidate: 300 });
    return rows?.[0]?.fetched_at ?? null;
  } catch {
    return null;
  }
}
