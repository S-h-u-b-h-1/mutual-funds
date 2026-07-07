import { sb } from "../lib/supabase";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import GlassPanel from "../components/ui/GlassPanel";
import { getFreshnessChain, getPipelineRuns, getNewsFreshness, getFactsheetFreshness } from "../lib/pipelineHealth";
import { marketStatus } from "../lib/marketStatus";
import { asOf } from "../lib/funds";

export const metadata = { title: "System status" };
export const revalidate = 300;

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);

function daysSince(dateStr) {
  if (!dateStr) return 999;
  const d = new Date(dateStr + "T00:00:00Z");
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

const ago = (ts) => {
  if (!ts) return "never";
  const hrs = (Date.now() - new Date(ts).getTime()) / 3600000;
  if (hrs < 1) return `${Math.max(1, Math.round(hrs * 60))}m ago`;
  if (hrs < 48) return `${Math.round(hrs)}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

export default async function Status() {
  let byClass = [], headline = [], signals = [], ok = true;
  let chain = { navLatest: null, health: null }, pipelineRuns = [], newsAt = null, factsheetAt = null;
  try {
    [byClass, headline, signals, chain, pipelineRuns, newsAt, factsheetAt] = await Promise.all([
      sb("mv_asset_class_summary?select=*", { revalidate: 300 }),
      sb("v_flow_headline?select=*", { revalidate: 300 }),
      sb("v_signals?select=z_score", { revalidate: 300 }),
      getFreshnessChain(),
      getPipelineRuns(1),
      getNewsFreshness(),
      getFactsheetFreshness(),
    ]);
  } catch {
    ok = false;
  }
  const ms = marketStatus(asOf);
  const lastRun = pipelineRuns?.[0] ?? null;

  const totalSchemes = byClass.reduce((s, r) => s + Number(r.schemes), 0);
  const latest = byClass.map((r) => r.latest_nav_date).sort().at(-1);
  const stale = daysSince(latest);
  const checks = [
    { label: "Data API (Supabase / PostgREST)", ok, detail: ok ? "reachable" : "unreachable" },
    { label: "NAV freshness", ok: stale <= 5, detail: latest ? `latest ${latest} (${stale}d ago)` : "no data" },
    { label: "Scheme coverage", ok: totalSchemes >= 8000, detail: `${fmt(totalSchemes)} schemes` },
    { label: "Flow signals", ok: true, detail: `${signals.length} active` },
  ];
  const allGood = checks.every((c) => c.ok);

  return (
    <>
      <Nav active="/status" />
      <main className="container-px py-10">
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tightest text-ink">System status</h1>
        <div className={`mt-2 flex items-center gap-2 text-[14px] font-medium ${allGood ? "text-pos" : "text-neg"}`}>
          <span className="h-2 w-2 rounded-full bg-current animate-ring" />
          {allGood ? "All systems operational" : "Degraded — see below"}
        </div>

        <GlassPanel className="mt-7 divide-y divide-line px-5 sm:px-6">
          {checks.map((c) => (
            <div key={c.label} className="flex items-center gap-3 py-4 text-[13.5px]">
              <span>{c.ok ? "✅" : "⚠️"}</span>
              <span className="flex-1 text-ink">{c.label}</span>
              <span className="tnum text-ink-muted">{c.detail}</span>
            </div>
          ))}
        </GlassPanel>

        {/* Unified refresh timeline (beta-readiness Phase 4) — the same live sources every other
            surface uses (site-wide nav strip via marketStatus, /internal/system-health), shown in
            one place so no two pages can disagree about "when did X last update". */}
        <h2 className="mt-9 text-[15px] font-semibold tracking-tight text-ink">Data refresh timeline</h2>
        <p className="mt-1 text-[12.5px] text-ink-muted">
          {ms.sessionLabel}
          {ms.nextLabel ? ` · ${ms.nextLabel}` : ""} · NAVs are published by AMFI after market close on
          trading days — nothing here is live intraday pricing, and this page says so rather than implying it.
        </p>
        <GlassPanel className="mt-3 divide-y divide-line px-5 sm:px-6">
          {[
            { label: "Latest NAV (this site's bundle)", value: asOf, tone: ms.tone },
            { label: "Latest NAV (warehouse)", value: chain.navLatest ?? "unavailable" },
            { label: "Ingestion pipeline last executed", value: lastRun?.finished_at ? `${ago(lastRun.finished_at)} · ${lastRun.status}${lastRun.rows_ingested != null ? ` · ${fmt(lastRun.rows_ingested)} rows` : ""}` : "no run recorded" },
            { label: "Analytics snapshot refreshed", value: chain.health?.captured_at ? `${ago(chain.health.captured_at)} · reflects ${chain.health.nav_latest_date}` : "no snapshot" },
            { label: "News last fetched", value: ago(newsAt) },
            { label: "Factsheets last archived", value: ago(factsheetAt) },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-3 py-3.5 text-[13px]">
              <span className="flex-1 text-ink-muted">{r.label}</span>
              <span className={`tnum ${r.tone === "neg" ? "text-neg" : r.tone === "warn" ? "text-warn" : "text-ink"}`}>{r.value}</span>
            </div>
          ))}
        </GlassPanel>
        <p className="mt-2 text-[11px] text-ink-faint">
          Refresh schedule: NAV + bundles rebuild after AMFI publishes (evenings, Mon–Sat) with a morning
          catch-up pass; news every 3 hours; factsheets monthly. Deep engineering view: <a className="text-ink-muted hover:text-ink" href="/internal/system-health">/internal/system-health</a>.
        </p>
      </main>
      <Footer note={<span>Flow headline month: {headline[0]?.month || "—"} · auto-refreshes every 5 min.</span>} />
    </>
  );
}
