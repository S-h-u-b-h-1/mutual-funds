// Internal engineering dashboard (Phase 11 — Investor Operating System sprint). NOT linked from
// public nav, NOT in sitemap.js, noindex — this is for engineering to see real coverage/health
// gaps, not a user-facing trust page (that's /data-status). Every number here is computed live
// from the same bundles/views the rest of the app trusts — nothing here is a separate, possibly-
// stale "status page" number; if it says 7% manager coverage, that's the real, current figure.
import { sb } from "../../lib/supabase";
import { allFunds, coverage } from "../../lib/funds";
import { allMetadata, metadataStatus, allManagers } from "../../lib/metadata";
import { getIngestionRuns } from "../../lib/news";
import GlassPanel from "../../components/ui/GlassPanel";
import SectionHeader from "../../components/ui/SectionHeader";

export const metadata = { title: "Data Completeness (Internal)", robots: { index: false, follow: false } };
export const revalidate = 60;

const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
const fmt = (n) => new Intl.NumberFormat("en-IN").format(n || 0);

function Bar({ label, have, total, note }) {
  const p = pct(have, total);
  const tone = p >= 80 ? "#34d399" : p >= 40 ? "#fbbf24" : "#f87171";
  return (
    <div className="py-2">
      <div className="flex items-center justify-between text-[12.5px]">
        <span className="text-ink-muted">{label}</span>
        <span className="tnum text-ink">{fmt(have)} / {fmt(total)} · {p}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${p}%`, background: tone }} />
      </div>
      {note && <div className="mt-0.5 text-[10.5px] text-ink-faint">{note}</div>}
    </div>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[12.5px]">
      <span className="text-ink-faint">{label}</span>
      <span className={`tnum font-medium ${tone === "warn" ? "text-warn" : tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-ink"}`}>{value}</span>
    </div>
  );
}

export default async function DataCompleteness() {
  const funds = allFunds();
  const meta = allMetadata();
  const managers = allManagers();

  let pstats = {};
  let navRuns = [];
  let ok = true;
  try {
    const [s, r] = await Promise.all([
      sb("v_pipeline_stats?select=*", { revalidate: 60 }),
      sb("v_recent_runs?select=*&limit=10", { revalidate: 60 }),
    ]);
    pstats = s[0] || {};
    navRuns = r;
  } catch {
    ok = false;
  }
  const newsRuns = await getIngestionRuns({ limit: 30 });

  // Metadata field-level completeness (Phase 11 — real, per-field, over the 152-row factsheet
  // subset acquired so far — never inferred from a total-fund denominator that doesn't apply).
  const metaN = meta.length;
  const fieldHave = (key) => meta.filter((r) => {
    const v = r[key];
    return v != null && v !== "" && !(Array.isArray(v) && v.length === 0);
  }).length;

  const withBenchmark = funds.filter((f) => f.benchmark).length;

  const navRecency = navRuns[0]?.finished_at ? Math.round((Date.now() - new Date(navRuns[0].finished_at).getTime()) / 3600000) : null;
  const lastNewsSuccess = newsRuns.find((r) => r.status === "success");
  const newsRecency = lastNewsSuccess ? Math.round((Date.now() - new Date(lastNewsSuccess.finished_at).getTime()) / 3600000) : null;
  const newsRunningAtAll = newsRuns.length > 0;
  const navRunningAtAll = navRuns.length > 0;

  return (
    <main className="container-px py-10">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-warn">Internal · Engineering Only · not linked from navigation</div>
      <h1 className="mt-2 text-[26px] font-bold tracking-tightest text-ink">Data Completeness Dashboard</h1>
      <p className="mt-2 max-w-2xl text-[13px] text-ink-muted">
        Real coverage and pipeline-health figures, computed live from the same bundles/views the rest of
        the platform reads. Low numbers here are not hidden — that&rsquo;s the point of this page.
      </p>

      <section className="mt-8">
        <SectionHeader title="Scheme & NAV coverage" eyebrow="frontend/app/data/funds.json" />
        <GlassPanel className="p-5">
          <Bar label="Priced (has a NAV)" have={coverage.priced} total={coverage.total} />
          <Bar label="Active" have={coverage.active} total={coverage.total} />
          <Bar label="30d return computable" have={coverage.with30d} total={coverage.total} />
          <Bar label="90d return computable" have={coverage.with90d} total={coverage.total} />
          <Bar label="1Y return computable" have={coverage.with1y} total={coverage.total} />
          <Bar label="3Y return computable" have={coverage.with3y} total={coverage.total} />
          <Bar label="5Y return computable" have={coverage.with5y} total={coverage.total} />
          <Bar label="Risk metrics (vol/drawdown)" have={coverage.withRisk} total={coverage.total} />
          <Bar label="Category mapped" have={coverage.total - coverage.noCategory} total={coverage.total} />
          <Bar label="Benchmark mapped" have={withBenchmark} total={coverage.total} note="SEBI category-standard or named index — not factsheet-dependent" />
          <div className="mt-2 border-t border-line pt-2">
            <Row label="Missing latest NAV" value={fmt(coverage.missingLatest)} tone={coverage.missingLatest > 0 ? "warn" : "pos"} />
            <Row label="Stale ≥7d" value={fmt(coverage.stale7d)} tone="warn" />
            <Row label="Unpriced" value={fmt(coverage.unpriced)} />
          </div>
        </GlassPanel>
      </section>

      <section className="mt-8">
        <SectionHeader title="Factsheet metadata coverage" eyebrow={`${metaN} of ${fmt(coverage.total)} schemes — AMC PDF parsers acquired so far`} />
        <GlassPanel className="p-5">
          <Bar label="Fund manager" have={fieldHave("fund_manager")} total={metaN} />
          <Bar label="Expense ratio" have={fieldHave("expense_ratio")} total={metaN} />
          <Bar label="Benchmark (factsheet-named)" have={fieldHave("benchmark")} total={metaN} />
          <Bar label="Holdings" have={fieldHave("holdings")} total={metaN} />
          <Bar label="Sector allocation" have={fieldHave("sector_allocation")} total={metaN} />
          <Bar label="AUM" have={fieldHave("aum_crores")} total={metaN} />
          <Bar label="Riskometer" have={fieldHave("riskometer")} total={metaN} />
          <Bar label="Exit load" have={fieldHave("exit_load")} total={metaN} />
          <Bar label="Minimum SIP" have={fieldHave("minimum_sip")} total={metaN} />
          <Bar label="Launch date" have={fieldHave("launch_date")} total={metaN} />
          <div className="mt-2 border-t border-line pt-2">
            <Row label="Parsers implemented & tested" value={fmt(metadataStatus.parserReady)} />
            <Row label="Schemes populated" value={fmt(metadataStatus.populated)} />
            <Row label="Distinct managers resolved" value={fmt(managers.length)} />
          </div>
        </GlassPanel>
      </section>

      <section className="mt-8">
        <SectionHeader title="News pipeline coverage & health" eyebrow="news_ingestion_runs" />
        <GlassPanel className="p-5">
          <Row label="Ingestion runs recorded (fetched window)" value={fmt(newsRuns.length)} />
          <Row
            label="Last successful run"
            value={lastNewsSuccess ? `${newsRecency}h ago` : "never"}
            tone={!newsRunningAtAll || newsRecency == null ? "neg" : newsRecency > 6 ? "warn" : "pos"}
          />
          <Row label="Recent failures" value={fmt(newsRuns.filter((r) => r.status !== "success").length)} tone={newsRuns.some((r) => r.status !== "success") ? "warn" : "pos"} />
          {!newsRunningAtAll && (
            <p className="mt-2 border-t border-line pt-2 text-[11.5px] text-neg">
              Zero runs recorded at all. Most likely cause: SUPABASE_SERVICE_ROLE_KEY is not set as a GitHub
              Actions repo secret, so news_ingest.yml's own graceful-skip guard is firing every scheduled run
              without ever reaching Supabase. Confirm via `gh run view &lt;id&gt; --log` on the workflow.
            </p>
          )}
        </GlassPanel>
      </section>

      <section className="mt-8">
        <SectionHeader title="NAV pipeline health & cron" eyebrow="v_pipeline_stats / v_recent_runs" />
        <GlassPanel className="p-5">
          {ok ? (
            <>
              <Row label="Success rate" value={pstats.success_rate != null ? `${pstats.success_rate}%` : "—"} tone={(pstats.success_rate ?? 100) >= 95 ? "pos" : "warn"} />
              <Row label="Total runs recorded" value={fmt(pstats.total_runs)} />
              <Row label="Consecutive failures" value={pstats.consecutive_failures ?? "—"} tone={(pstats.consecutive_failures ?? 0) > 0 ? "neg" : "pos"} />
              <Row
                label="Last run"
                value={navRecency != null ? `${navRecency}h ago` : "never"}
                tone={!navRunningAtAll || navRecency == null ? "neg" : navRecency > 30 ? "warn" : "pos"}
              />
              {!navRunningAtAll && (
                <p className="mt-2 border-t border-line pt-2 text-[11.5px] text-neg">
                  Zero runs recorded. daily-nav.yml is very likely hitting the same missing-secret graceful
                  skip as news_ingest.yml above — the site&rsquo;s displayed fund data is currently served from
                  committed JSON bundles, not a live scheduled write path.
                </p>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-neg">Could not reach v_pipeline_stats / v_recent_runs this request.</p>
          )}
        </GlassPanel>
      </section>

      <section className="mt-8 mb-4">
        <SectionHeader title="API / data-source reachability" eyebrow="observed during this page's own render" />
        <GlassPanel className="p-5">
          <Row label="Supabase REST (PostgREST)" value={ok ? "reachable" : "unreachable this request"} tone={ok ? "pos" : "neg"} />
          <Row label="funds.json bundle" value={coverage.total ? `loaded, ${fmt(coverage.total)} schemes` : "empty/missing"} tone={coverage.total ? "pos" : "neg"} />
          <Row label="metadata.json bundle" value={metaN ? `loaded, ${metaN} schemes` : "empty"} tone={metaN ? "pos" : "warn"} />
        </GlassPanel>
      </section>
    </main>
  );
}
