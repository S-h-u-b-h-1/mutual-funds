// Internal engineering dashboard (Phase 11 — Investor Operating System sprint). NOT linked from
// public nav, NOT in sitemap.js, noindex — this is for engineering to see real coverage/health
// gaps, not a user-facing trust page (that's /data-status). Every number here is computed live
// from the same bundles/views the rest of the app trusts — nothing here is a separate, possibly-
// stale "status page" number; if it says 7% manager coverage, that's the real, current figure.
import { sb } from "../../lib/supabase";
import { coverage } from "../../lib/funds";
import { allMetadata, metadataStatus, allManagers } from "../../lib/metadata";
import { getIngestionRuns } from "../../lib/news";
import GlassPanel from "../../components/ui/GlassPanel";
import SectionHeader from "../../components/ui/SectionHeader";
import fieldCoverage from "../../data/fieldCoverage.json";
import { FIELD_REGISTRY, computeConfidence } from "../../lib/fieldRegistry";

export const metadata = { title: "Data Completeness (Internal)", robots: { index: false, follow: false } };
export const revalidate = 60;

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n || 0);

const CONFIDENCE_TONE = { High: "#34d399", Medium: "#fbbf24", Low: "#f87171", "N/A": "#6b7280" };

function FieldRow({ entry }) {
  const cov = entry.key
    ? (() => {
        const [group, name] = entry.key.split(".");
        return fieldCoverage.fields?.[group]?.[name] ?? null;
      })()
    : null;
  const coveragePct = cov ? cov.universe_pct : 0;
  const missingCount = cov ? fieldCoverage.denominators.universe - cov.universe_n : fieldCoverage.denominators.universe;
  const confidence = computeConfidence(entry, cov ? coveragePct : null);
  const lastUpdated =
    entry.status === "no_schema" || entry.status === "not_yet_assessed" || entry.status === "blocked_by_license"
      ? "—"
      : entry.key?.startsWith("Identity") || entry.key?.startsWith("Performance")
        ? fieldCoverage.amfiLastUpdated
        : fieldCoverage.factsheetLastUpdated || "—";
  const statusLabel =
    entry.status === "no_schema" ? "No schema slot" : entry.status === "blocked_by_license" ? "Blocked — licensing" : entry.status === "not_yet_assessed" ? "Not yet assessed" : null;

  return (
    <tr className="border-b border-line/60 last:border-0 align-top">
      <td className="px-3 py-2.5">
        <div className="text-[12.5px] font-medium text-ink">{entry.label}</div>
        {entry.notes && <div className="mt-0.5 max-w-md text-[11px] leading-snug text-ink-faint">{entry.notes}</div>}
      </td>
      <td className="px-3 py-2.5 text-right tnum text-[12.5px] text-ink">
        {statusLabel ? <span className="text-ink-faint">{statusLabel}</span> : `${coveragePct}%`}
      </td>
      <td className="px-3 py-2.5 text-right tnum text-[12.5px] text-ink-muted">{statusLabel ? "—" : fmt(missingCount)}</td>
      <td className="px-3 py-2.5 text-[11.5px] text-ink-muted">{entry.officialSource || "—"}</td>
      <td className="px-3 py-2.5 text-[11.5px] text-ink-muted whitespace-nowrap">{lastUpdated}</td>
      <td className="px-3 py-2.5 text-right">
        <span
          className="rounded px-1.5 py-0.5 text-[11px] font-semibold"
          style={{ color: CONFIDENCE_TONE[confidence], backgroundColor: `${CONFIDENCE_TONE[confidence]}1a` }}
        >
          {confidence}
        </span>
      </td>
    </tr>
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
        <SectionHeader
          title="Field-level coverage matrix"
          eyebrow={`${FIELD_REGISTRY.length} required fields · computed live from data/warehouse/field_coverage.json · asOf ${fieldCoverage.asOf}`}
        />
        <GlassPanel className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">
                  <th className="px-3 py-2.5 text-left">Field</th>
                  <th className="px-3 py-2.5 text-right">Coverage</th>
                  <th className="px-3 py-2.5 text-right">Missing</th>
                  <th className="px-3 py-2.5 text-left">Official Source</th>
                  <th className="px-3 py-2.5 text-left">Last Updated</th>
                  <th className="px-3 py-2.5 text-right">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {FIELD_REGISTRY.map((entry) => (
                  <FieldRow key={entry.id} entry={entry} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-3 py-2.5 text-[11px] text-ink-faint">
            Confidence: High = coverage ≥90% AND validated AND primary official source. Medium = coverage ≥40% AND
            (validated OR primary source). Low = below both thresholds but non-zero. N/A = 0% populated, no schema
            slot, or licensing-blocked. Methodology and full per-field reasoning: <code>docs/DATA_COVERAGE_MATRIX.md</code>,
            source strategy: <code>docs/DATA_SOURCE_REGISTER.md</code>.
          </p>
        </GlassPanel>
      </section>

      <section className="mt-8">
        <SectionHeader title="Pipeline metadata (auxiliary)" eyebrow={`${metaN} of ${fmt(coverage.total)} schemes have any factsheet at all`} />
        <GlassPanel className="p-5">
          <Row label="Parsers implemented & tested" value={fmt(metadataStatus.parserReady)} />
          <Row label="Schemes with any factsheet metadata" value={fmt(metadataStatus.populated)} />
          <Row label="Distinct managers resolved" value={fmt(managers.length)} />
          <Row label="Missing latest NAV" value={fmt(coverage.missingLatest)} tone={coverage.missingLatest > 0 ? "warn" : "pos"} />
          <Row label="Stale ≥7d" value={fmt(coverage.stale7d)} tone="warn" />
          <Row label="Unpriced" value={fmt(coverage.unpriced)} />
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
              Actions repo secret, so news_ingest.yml’s own graceful-skip guard is firing every scheduled run
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
