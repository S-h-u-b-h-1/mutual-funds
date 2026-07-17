import { sb } from "../lib/supabase";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";
import StatStrip from "../components/ui/StatStrip";
import DataTable from "../components/ui/DataTable";
import { getFreshnessSummary } from "../lib/freshnessService";

export const metadata = { title: "Data Status" };
export const revalidate = 60;

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const COLOR = { green: "#34d399", amber: "#fbbf24", red: "#f87171" };
const LABEL = { green: "Operational", amber: "Degraded / stale", red: "Down" };

function Dot({ status }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR[status] || "#5b6577" }} />;
}
function daysSince(d) {
  return d ? Math.floor((Date.now() - new Date(d + "T00:00:00Z").getTime()) / 86400000) : null;
}

export default async function DataStatus() {
  let health = [], runs = [], byClass = [], flow = [];
  let ok = true;
  try {
    [health, runs, byClass, flow] = await Promise.all([
      sb("v_latest_health?select=*", { revalidate: 60 }),
      sb("v_recent_runs?select=*&limit=10", { revalidate: 60 }),
      sb("mv_asset_class_summary?select=*", { revalidate: 60 }),
      sb("v_flow_headline?select=*", { revalidate: 60 }),
    ]);
  } catch {
    ok = false;
  }
  // Pipeline reliability stats — fetched independently so a missing view never breaks the page.
  let pstats = {};
  try {
    const s = await sb("v_pipeline_stats?select=*", { revalidate: 60 });
    pstats = s[0] || {};
  } catch {}
  // News freshness — live-queried like everything else here (user-reported gap 2026-07-07: this
  // page showed NAV freshness but nothing at all for news, so "news updated" was invisible).
  let newsAt = null;
  try {
    const n = await sb("news_articles?select=fetched_at&order=fetched_at.desc&limit=1", { revalidate: 60 });
    newsAt = n?.[0]?.fetched_at ?? null;
  } catch {}
  const newsAgo = newsAt ? Math.round((Date.now() - new Date(newsAt).getTime()) / 3600000) : null;
  const h = health[0] || {};
  let freshness = { explanation: null, rawAheadOfBundle: null, bundleAsOf: null };
  try {
    freshness = await getFreshnessSummary();
  } catch {}
  const latestNav = byClass.map((r) => r.latest_nav_date).sort().at(-1);
  const totalSchemes = byClass.reduce((s, r) => s + Number(r.schemes), 0);
  const stale = daysSince(latestNav);
  const navStatus = !ok ? "red" : stale == null ? "red" : stale <= 2 ? "green" : stale <= 7 ? "amber" : "red";
  // Real since 2026-07-17 (AMFI Monthly Report / MCR, industry-wide per fund category — see
  // docs/DATA_COVERAGE_MATRIX.md's Flow Signals pivot). Same 45-day monthly-cadence staleness
  // threshold used everywhere else in this codebase for factsheet/portfolio-disclosure fields
  // (docs/DATA_SOURCE_REGISTER.md's "Stale-data threshold" policy), not an arbitrary number.
  const flowMonthAge = flow[0]?.month ? Math.floor((Date.now() - new Date(`${flow[0].month}T00:00:00Z`).getTime()) / 86400000) : null;
  const flowStatus = flowMonthAge == null ? "red" : flowMonthAge <= 45 ? "green" : flowMonthAge <= 75 ? "amber" : "red";
  const lastSuccess = runs.find((r) => r.status === "success");
  const overall = !ok ? "red" : [navStatus, flowStatus].includes("red") ? "red" : [navStatus, flowStatus].includes("amber") ? "amber" : "green";

  const runCols = [
    { key: "pipeline", label: "Pipeline", render: (r) => r.pipeline },
    { key: "status", label: "Status", render: (r) => <span className="inline-flex items-center gap-1.5"><Dot status={r.status === "success" ? "green" : "red"} />{r.status}</span> },
    { key: "source", label: "Source", muted: true, render: (r) => r.source },
    { key: "rows_ingested", label: "Rows", align: "right", mono: true, render: (r) => (r.rows_ingested != null ? fmt(r.rows_ingested) : "—") },
    { key: "duration_ms", label: "Duration", align: "right", mono: true, muted: true, render: (r) => (r.duration_ms != null ? `${r.duration_ms} ms` : "—") },
    { key: "finished_at", label: "Finished", align: "right", muted: true, render: (r) => new Date(r.finished_at).toLocaleString("en-IN") },
  ];

  const stats = [
    { label: "Total schemes", value: fmt(totalSchemes) },
    { label: "AMC houses", value: byClass.length ? "51" : "—" },
    { label: "NAV rows", value: h.total_nav_rows ? fmt(h.total_nav_rows) : "—" },
    { label: "Events", value: h.total_events != null ? fmt(h.total_events) : "—" },
    { label: "Latest NAV", value: latestNav || "—" },
    { label: "News fetched", value: newsAgo == null ? "—" : newsAgo < 1 ? "<1h ago" : `${newsAgo}h ago`, tone: newsAgo != null && newsAgo <= 4 ? "pos" : undefined },
    { label: "Flow month", value: flow[0]?.month || "—" },
  ];

  return (
    <>
      <Nav active="/status" />
      <main className="container-px py-10 sm:py-14">
        <div className="eyebrow text-accent">Observability</div>
        <h1 className="page-title mt-3">Data status</h1>
        <div className="mt-2 flex items-center gap-2 text-[14px]">
          <Dot status={overall} />
          <span className="font-medium" style={{ color: COLOR[overall] }}>{LABEL[overall]}</span>
          <span className="text-ink-faint">· every number below traces to a source &amp; timestamp</span>
        </div>

        {/* Freshness cards */}
        <section className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <GlassPanel className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-ink">NAV freshness</div>
              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: COLOR[navStatus] }}><Dot status={navStatus} />{navStatus}</span>
            </div>
            <div className="mt-3 text-[26px] font-bold tnum">{stale == null ? "—" : `${stale}d`}</div>
            <div className="text-[12px] text-ink-muted">since latest AMFI NAV ({latestNav || "—"})</div>
            <div className="mt-2 text-[11px] text-ink-faint">Source: AMFI NAVAll · daily pipeline. {navStatus === "amber" && "Stale — pending next scheduled trading day run (daily at 20:00 IST)."}</div>
            {freshness.bundleAsOf && <div className="mt-1 text-[11px] text-ink-faint">Site bundle (funds.json/etc.): {freshness.bundleAsOf}{freshness.explanation ? ` — ${freshness.explanation}` : ""}</div>}
          </GlassPanel>
          <GlassPanel className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="text-[13px] font-semibold text-ink">Monthly flow freshness</div>
              <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: COLOR[flowStatus] }}><Dot status={flowStatus} />{LABEL[flowStatus]}</span>
            </div>
            <div className="mt-3 text-[26px] font-bold tnum">{flow[0]?.month || "—"}</div>
            <div className="text-[12px] text-ink-muted">latest reporting month{flowMonthAge != null && ` · ${flowMonthAge}d ago`}</div>
            <div className="mt-2 text-[11px] text-ink-faint">Source: AMFI Monthly Report (MCR) — real, industry-wide net flow per fund category, refreshed weekly. Not broken out by individual AMC (AMFI's public export has no AMC-level breakdown).</div>
          </GlassPanel>
        </section>

        {/* Coverage */}
        <section className="mt-6"><StatStrip items={stats} /></section>

        {/* Pipeline reliability monitoring */}
        <section className="mt-9">
          <SectionHeader eyebrow="reliability · nav_daily" title="Pipeline monitoring" />
          <StatStrip
            items={[
              { label: "Success rate", value: pstats.success_rate != null ? `${pstats.success_rate}%` : "—", tone: (pstats.success_rate ?? 100) >= 95 ? "pos" : "neg" },
              { label: "Total runs", value: pstats.total_runs != null ? fmt(pstats.total_runs) : "—" },
              { label: "Consecutive fails", value: pstats.consecutive_failures ?? "—", tone: (pstats.consecutive_failures ?? 0) > 0 ? "neg" : "pos" },
              { label: "Last failure", value: pstats.last_failed_at ? new Date(pstats.last_failed_at).toLocaleDateString("en-IN") : "none" },
            ]}
          />
          {pstats.last_error && (
            <GlassPanel className="mt-3 p-4">
              <div className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">Last error</div>
              <code className="mt-1.5 block break-words text-[12px] text-neg">{pstats.last_error}</code>
            </GlassPanel>
          )}
          <p className="mt-2 text-[11px] text-ink-faint">Alerts on failure / stale data → GitHub annotation (always) · Slack &amp; webhook when configured (<code className="text-ink-muted">SLACK_WEBHOOK_URL</code>, <code className="text-ink-muted">ALERT_WEBHOOK_URL</code>).</p>
        </section>

        {/* Pipeline runs */}
        <section className="mt-9">
          <SectionHeader eyebrow={lastSuccess ? `last success ${new Date(lastSuccess.finished_at).toLocaleString("en-IN")}` : "no runs yet"} title="Recent pipeline runs" />
          {runs.length ? (
            <DataTable columns={runCols} rows={runs.map((r, i) => ({ ...r, _key: i }))} footnote="Append-only audit log (fact_pipeline_runs). Every ingestion records source, timing, rows, and status." />
          ) : (
            <GlassPanel className="p-6 text-[13px] text-ink-muted">No pipeline runs recorded yet.</GlassPanel>
          )}
        </section>
      </main>
      <Footer note={<span>Freshness &amp; runs from <code className="text-ink-muted">fact_system_health</code> / <code className="text-ink-muted">fact_pipeline_runs</code> · auto-refresh 60s.</span>} />
    </>
  );
}
