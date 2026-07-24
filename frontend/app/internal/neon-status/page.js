// /internal/neon-status — Neon migration canary (Phase 2 Neon migration sprint). NOT linked
// from navigation, noindex — mirrors data-completeness's own internal-only convention. Shows
// whether Neon is a trustworthy read source yet, side-by-side with the real Supabase numbers
// it would eventually replace. READ_FROM_NEON stays false regardless of what this page shows —
// flipping it is a separate, deliberate decision made after this page has been trusted for a
// real stretch of time, not something this canary does itself.
import { sb, sbCount } from "../../lib/supabase";
import { READ_FROM_NEON } from "../../lib/db";
import {
  checkNeonConnection,
  getNeonFreshness,
  getNeonNewsCount,
  getNeonPipelineRuns,
  getNeonMarketQuotes,
  getNeonLastRefresh,
  getNeonCounts,
} from "../../lib/neonReads";
import GlassPanel from "../../components/ui/GlassPanel";
import SectionHeader from "../../components/ui/SectionHeader";

export const metadata = { title: "Neon Status (Internal)", robots: { index: false, follow: false } };
// This page performs live database comparisons and must never be prerendered during a build.
// Keeping it dynamic also makes an unavailable Neon/Supabase dependency a visible page state
// rather than a release failure.
export const dynamic = "force-dynamic";
export const revalidate = 60;

const TABLES = [
  "dim_scheme", "fact_nav_daily", "fact_pipeline_runs", "fact_system_health",
  "news_sources", "news_articles", "news_entities", "news_market_links", "news_sentiment",
  "news_ingestion_runs", "market_quotes", "market_quote_runs",
  "factsheet_archive", "fund_history_events", "user_events", "alerts", "advisor_leads",
];

const fmt = (n) => (n == null ? "—" : new Intl.NumberFormat("en-IN").format(n));
const ago = (ts) => {
  if (!ts) return "never";
  const hrs = (Date.now() - new Date(ts).getTime()) / 3600000;
  return hrs < 1 ? "<1h ago" : `${Math.round(hrs)}h ago`;
};

function Row({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[12.5px]">
      <span className="text-ink-faint">{label}</span>
      <span className={`tnum font-medium ${tone === "warn" ? "text-warn" : tone === "neg" ? "text-neg" : tone === "pos" ? "text-pos" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function CompareRow({ label, supabaseCount, neonCount }) {
  const match = supabaseCount != null && neonCount != null && supabaseCount === neonCount;
  const errored = supabaseCount == null || neonCount == null;
  return (
    <div className="flex items-center justify-between border-b border-line/50 py-1.5 text-[12.5px] last:border-0">
      <span className="text-ink-faint">{label}</span>
      <span className="tnum flex items-center gap-3">
        <span className="text-ink-muted">supabase {fmt(supabaseCount)}</span>
        <span className="text-ink-muted">neon {fmt(neonCount)}</span>
        <span className={errored ? "text-neg" : match ? "text-pos" : "text-warn"}>
          {errored ? "error" : match ? "match" : `diff ${neonCount - supabaseCount >= 0 ? "+" : ""}${neonCount - supabaseCount}`}
        </span>
      </span>
    </div>
  );
}

export default async function NeonStatus() {
  const connected = await checkNeonConnection();

  const [freshness, newsCount, pipelineRuns, marketQuotes, lastRefresh, neonCounts] = await Promise.all([
    getNeonFreshness(),
    getNeonNewsCount(),
    getNeonPipelineRuns(5),
    getNeonMarketQuotes(),
    getNeonLastRefresh(),
    getNeonCounts(),
  ]);

  const supaCounts = {};
  await Promise.all(
    TABLES.map(async (t) => {
      supaCounts[t] = await sbCount(t);
    })
  );

  let supaFreshness = null;
  try {
    const rows = await sb("fact_system_health?select=*&order=captured_at.desc&limit=1", { revalidate: 60 });
    supaFreshness = rows?.[0] ?? null;
  } catch {
    supaFreshness = null;
  }

  const mismatches = TABLES.filter((t) => supaCounts[t] !== neonCounts?.[t]);

  return (
    <main className="container-px py-10">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-warn">Internal · Engineering Only · not linked from navigation</div>
      <h1 className="mt-2 text-[26px] font-bold tracking-tightest text-ink">Neon Migration Status</h1>
      <p className="mt-2 max-w-2xl text-[13px] text-ink-muted">
        Real, live-queried numbers from both databases — nothing here is cached from a prior migration
        run. Supabase remains the sole read source for every live page; this canary exists to build
        confidence in Neon before READ_FROM_NEON is ever flipped on.
      </p>

      <section className="mt-8">
        <SectionHeader title="Connection & cutover flag" eyebrow="frontend/app/lib/db.js" />
        <GlassPanel className="p-5">
          <Row label="Neon connection" value={connected ? "connected" : "unreachable / DATABASE_URL not set"} tone={connected ? "pos" : "neg"} />
          <Row label="READ_FROM_NEON" value={READ_FROM_NEON ? "true (frontend reading from Neon!)" : "false (Supabase still serves all reads)"} tone={READ_FROM_NEON ? "warn" : "pos"} />
        </GlassPanel>
      </section>

      <section className="mt-8">
        <SectionHeader title="Freshness — Neon vs Supabase" eyebrow="fact_system_health" />
        <GlassPanel className="p-5">
          <Row label="Neon: latest NAV date" value={freshness?.nav_latest_date ?? "no snapshot yet"} tone={freshness ? "pos" : "neg"} />
          <Row label="Neon: NAV staleness" value={freshness?.nav_staleness_days != null ? `${freshness.nav_staleness_days}d` : "—"} />
          <Row label="Neon: news articles" value={fmt(newsCount)} tone={newsCount ? "pos" : "warn"} />
          <Row label="Neon: last market-quote fetch" value={ago(lastRefresh?.last_market_quote)} tone={lastRefresh?.last_market_quote ? "pos" : "warn"} />
          <Row label="Neon: last NAV pipeline run" value={ago(lastRefresh?.last_pipeline_run)} />
          <Row label="Neon: last news ingestion run" value={ago(lastRefresh?.last_news_run)} />
          <div className="mt-2 border-t border-line pt-2">
            <Row label="Supabase: latest NAV date" value={supaFreshness?.nav_latest_date ?? "unavailable"} />
            <Row label="Supabase: NAV staleness" value={supaFreshness?.nav_staleness_days != null ? `${supaFreshness.nav_staleness_days}d` : "—"} />
          </div>
        </GlassPanel>
      </section>

      <section className="mt-8">
        <SectionHeader title="Recent Neon pipeline runs" eyebrow="fact_pipeline_runs, last 5" />
        <GlassPanel className="p-5">
          {pipelineRuns && pipelineRuns.length > 0 ? (
            pipelineRuns.map((r, i) => (
              <Row key={i} label={`${r.pipeline} · ${new Date(r.finished_at).toLocaleString("en-IN")}`} value={r.status} tone={r.status === "success" ? "pos" : "neg"} />
            ))
          ) : (
            <p className="text-[12.5px] text-ink-faint">No pipeline runs recorded in Neon yet.</p>
          )}
        </GlassPanel>
      </section>

      <section className="mt-8">
        <SectionHeader title="Market quotes (Neon-only — no Supabase equivalent)" eyebrow={`${fmt(marketQuotes?.length)} instruments`} />
        <GlassPanel className="p-5">
          {marketQuotes && marketQuotes.length > 0 ? (
            marketQuotes.slice(0, 6).map((q) => (
              <Row key={q.symbol} label={`${q.name} (${q.group_name})`} value={`${q.price} ${q.currency || ""} · ${ago(q.fetched_at)}`} />
            ))
          ) : (
            <p className="text-[12.5px] text-ink-faint">No market quotes persisted yet.</p>
          )}
          {marketQuotes && marketQuotes.length > 6 && (
            <p className="mt-2 text-[11px] text-ink-faint">+{marketQuotes.length - 6} more instruments not shown</p>
          )}
        </GlassPanel>
      </section>

      <section className="mt-8 mb-4">
        <SectionHeader title="Row-count comparison — every table" eyebrow={`${mismatches.length}/${TABLES.length} mismatched`} />
        <GlassPanel className="p-5">
          {TABLES.map((t) => (
            <CompareRow key={t} label={t} supabaseCount={supaCounts[t]} neonCount={neonCounts?.[t]} />
          ))}
          {mismatches.length > 0 && (
            <p className="mt-3 border-t border-line pt-2 text-[11.5px] text-ink-faint">
              A mismatch is expected for any table dual-write hasn&rsquo;t run against yet, or for
              dim_scheme/fact_nav_daily specifically (deliberately deferred to a real pipeline run —
              see docs/NEON_MIGRATION_AUDIT.md) — not necessarily a bug.
            </p>
          )}
        </GlassPanel>
      </section>
    </main>
  );
}
