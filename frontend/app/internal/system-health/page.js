// /internal/system-health — production pipeline health dashboard (P0 go-live sprint, Phase 8).
// NOT linked from navigation, noindex — same internal-only convention as /internal/neon-status
// and /internal/data-completeness. Every indicator below is a live query or a live public-API
// call made on this request (subject to each helper's own revalidate window) — nothing here is
// a hardcoded snapshot from when this page was built.
import { freshnessTone } from "../../lib/marketStatus";
import {
  getWorkflowStatuses,
  getDeploymentCurrency,
  getFreshnessChain,
  getPipelineRuns,
  getNewsFreshness,
  getFactsheetFreshness,
} from "../../lib/pipelineHealth";
import { getFreshnessSummary } from "../../lib/freshnessService";
import GlassPanel from "../../components/ui/GlassPanel";
import SectionHeader from "../../components/ui/SectionHeader";
import Badge from "../../components/ui/Badge";
import daily from "../../data/daily.json";

export const metadata = { title: "System Health (Internal)", robots: { index: false, follow: false } };
export const revalidate = 120;

const TONE_TEXT = { pos: "text-pos", warn: "text-warn", neg: "text-neg" };
const TONE_DOT = { pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" };
const fmt = (n) => (n == null ? "—" : new Intl.NumberFormat("en-IN").format(n));
const ago = (ts) => {
  if (!ts) return "never";
  const hrs = (Date.now() - new Date(ts).getTime()) / 3600000;
  if (hrs < 1) return `${Math.round(hrs * 60)}m ago`;
  if (hrs < 48) return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};
const staleDays = (dateStr) => (dateStr ? Math.round((Date.now() - new Date(dateStr + "T00:00:00Z").getTime()) / 86400000) : null);

function Row({ label, value, tone, href }) {
  const content = (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
      <span className="text-ink-faint">{label}</span>
      <span className={`tnum flex shrink-0 items-center gap-1.5 font-medium ${tone ? TONE_TEXT[tone] : "text-ink"}`}>
        {tone && <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />}
        {value}
      </span>
    </div>
  );
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" className="block transition-colors hover:bg-white/[0.03] -mx-2 px-2 rounded">{content}</a> : content;
}

const WORKFLOW_LABEL = { "ci.yml": "CI (tests + build)", "production-refresh.yml": "Production Refresh", "news_ingest.yml": "News ingestion", "factsheets.yml": "Monthly factsheets" };
const MONTHLY_WORKFLOW = "factsheets.yml"; // "never run" here just means the 5th-of-month cron hasn't fired yet this month — not necessarily broken

function workflowTone(w) {
  if (w.conclusion === "success") return "pos";
  if (w.neverRun) return w.workflow === MONTHLY_WORKFLOW ? "warn" : "neg";
  if (w.conclusion === "failure") return "neg";
  return "warn";
}

export default async function SystemHealth() {
  const [workflows, deployCurrency, chain, pipelineRuns, newsFreshAt, factsheetFreshAt, freshness] = await Promise.all([
    getWorkflowStatuses(),
    getDeploymentCurrency(),
    getFreshnessChain(),
    getPipelineRuns(8),
    getNewsFreshness(),
    getFactsheetFreshness(),
    getFreshnessSummary(),
  ]);

  const navDays = staleDays(chain.navLatest);
  const navTone = freshnessTone(navDays);

  // Same chain logic as scripts/assert_pipeline_freshness.py (Phase 9) — mirrored here for
  // display, not re-derived differently, so this page and the automated gate never disagree.
  const analyticsCaughtUp = chain.health?.nav_latest_date && chain.navLatest ? chain.health.nav_latest_date >= chain.navLatest : null;
  const bundleCaughtUp = chain.health?.nav_latest_date && daily.asOf ? daily.asOf >= chain.health.nav_latest_date : null;

  const checks = [
    { label: "NAV freshness", tone: navTone },
    { label: "Analytics vs NAV", tone: analyticsCaughtUp == null ? "warn" : analyticsCaughtUp ? "pos" : "neg" },
    { label: "JSON bundle vs analytics", tone: bundleCaughtUp == null ? "warn" : bundleCaughtUp ? "pos" : "neg" },
    ...workflows.map((w) => ({ label: WORKFLOW_LABEL[w.workflow], tone: workflowTone(w) })),
    { label: "Deployment currency", tone: deployCurrency.current == null ? "warn" : deployCurrency.current ? "pos" : "warn" },
  ];
  const healthyCount = checks.filter((c) => c.tone === "pos").length;
  const failedCount = checks.filter((c) => c.tone === "neg").length;
  const overallTone = failedCount > 0 ? "neg" : healthyCount === checks.length ? "pos" : "warn";
  const overallLabel = failedCount > 0 ? `${failedCount} failing` : healthyCount === checks.length ? "all healthy" : "degraded";

  return (
    <main className="container-px py-10">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-warn">Internal · Engineering Only · not linked from navigation</div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[26px] font-bold tracking-tightest text-ink">Production Pipeline Health</h1>
        <Badge tone={overallTone} dot>{healthyCount}/{checks.length} checks · {overallLabel}</Badge>
      </div>
      <p className="mt-2 max-w-2xl text-[13px] text-ink-muted">
        Every number below is queried live on this request (each with its own short cache window) —
        nothing here is a hardcoded snapshot. See <code className="text-ink-muted">docs/PIPELINE_ARCHITECTURE.md</code> for
        the full audit this page is built from.
      </p>

      <section className="mt-8">
        <SectionHeader title="Freshness chain" eyebrow="NAV → analytics → JSON bundle, each compared to the one before it" />
        <GlassPanel className="p-5">
          <Row label="Latest NAV date (fact_nav_daily)" value={chain.navLatest ? `${chain.navLatest} (${navDays}d ago)` : "unavailable"} tone={navTone} />
          <Row label="Analytics snapshot (fact_system_health)" value={chain.health?.nav_latest_date ? `reflects ${chain.health.nav_latest_date}${analyticsCaughtUp ? " — caught up" : " — BEHIND"}` : "no snapshot"} tone={analyticsCaughtUp == null ? "warn" : analyticsCaughtUp ? "pos" : "neg"} />
          <Row label="JSON bundle (daily.json asOf)" value={`${daily.asOf}${bundleCaughtUp == null ? "" : bundleCaughtUp ? " — caught up" : " — BEHIND"}`} tone={bundleCaughtUp == null ? "warn" : bundleCaughtUp ? "pos" : "neg"} />
        </GlassPanel>
        {/* Same FreshnessService every other surface (/status, /data-status, /api/freshness)
            reads — shown here too so this page can never disagree with them about what "fresh"
            means today, even though the chain above (mirroring the CI gate's own logic) is a
            separate, deliberately more granular comparison. */}
        {freshness.explanation && (
          <p className={`mt-2 text-[12px] ${freshness.rawAheadOfBundle ? "text-warn" : "text-ink-muted"}`}>{freshness.explanation}</p>
        )}
      </section>

      <section className="mt-8">
        <SectionHeader title="Workflow status" eyebrow="live from GitHub Actions (public API, no token)" />
        <GlassPanel className="p-5">
          {workflows.map((w) => (
            <Row
              key={w.workflow}
              label={WORKFLOW_LABEL[w.workflow]}
              value={w.neverRun ? "never run" : `${w.conclusion || w.status || "unknown"} · ${ago(w.ranAt)}`}
              tone={workflowTone(w)}
              href={w.url}
            />
          ))}
        </GlassPanel>
      </section>

      <section className="mt-8">
        <SectionHeader title="Deployment" eyebrow="this deployment's build commit vs. real HEAD on main" />
        <GlassPanel className="p-5">
          <Row label="This deployment's commit" value={deployCurrency.deployedSha ? deployCurrency.deployedSha.slice(0, 7) : "unknown (system env vars not exposed)"} />
          <Row label="Real HEAD on main" value={deployCurrency.headSha ? `${deployCurrency.headSha.slice(0, 7)} — ${deployCurrency.headMessage}` : "unavailable"} />
          <Row label="Currency" value={deployCurrency.current == null ? "unknown" : deployCurrency.current ? "deployment matches HEAD" : "deployment is BEHIND HEAD"} tone={deployCurrency.current == null ? "warn" : deployCurrency.current ? "pos" : "warn"} />
        </GlassPanel>
      </section>

      <section className="mt-8">
        <SectionHeader title="Other data freshness" />
        <GlassPanel className="p-5">
          <Row label="Latest news article fetched" value={ago(newsFreshAt)} tone={newsFreshAt ? "pos" : "warn"} />
          <Row label="Latest factsheet snapshot" value={ago(factsheetFreshAt)} tone={factsheetFreshAt ? "pos" : "warn"} />
        </GlassPanel>
      </section>

      <section className="mt-8 mb-4">
        <SectionHeader title="Recent pipeline runs" eyebrow="fact_pipeline_runs, last 8" />
        <GlassPanel className="p-5">
          {pipelineRuns.length > 0 ? (
            pipelineRuns.map((r, i) => (
              <Row
                key={i}
                label={`${r.pipeline} · ${r.finished_at ? new Date(r.finished_at).toLocaleString("en-IN") : "in progress"}`}
                value={`${r.status}${r.rows_ingested != null ? ` · ${fmt(r.rows_ingested)} rows` : ""}${r.duration_ms != null ? ` · ${(r.duration_ms / 1000).toFixed(1)}s` : ""}`}
                tone={r.status === "success" ? "pos" : "neg"}
              />
            ))
          ) : (
            <p className="text-[12.5px] text-ink-faint">No pipeline runs recorded.</p>
          )}
        </GlassPanel>
      </section>
    </main>
  );
}
