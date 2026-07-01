import { sb } from "../lib/supabase";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import SectionHeader from "../components/ui/SectionHeader";
import GlassPanel from "../components/ui/GlassPanel";
import StatStrip from "../components/ui/StatStrip";
import TrustBar from "../components/ui/TrustBar";
import DataTable from "../components/ui/DataTable";
import { EmptyState } from "../components/ui/Badge";
import { getFund } from "../lib/funds";

export const metadata = { title: "Product analytics" };
export const revalidate = 120;

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const LABELS = {
  page_view: "Page views",
  search: "Searches",
  search_click: "Search clicks",
  amc_view: "AMC views",
  watchlist_add: "Watchlist adds",
  watchlist_remove: "Watchlist removes",
  alert_signup: "Alert sign-ups",
};

export default async function Analytics() {
  let events = [], searches = [], durations = [], charts = [], funnel = null, topFunds = [];
  try {
    [events, searches, durations, charts, [funnel], topFunds] = await Promise.all([
      sb("v_event_summary?select=*", { revalidate: 120 }),
      sb("v_top_searches?select=*", { revalidate: 120 }),
      sb("v_session_duration_by_page?select=*", { revalidate: 120 }).catch(() => []),
      sb("v_chart_interactions?select=*", { revalidate: 120 }).catch(() => []),
      sb("v_advisor_funnel?select=*", { revalidate: 120 }).catch(() => [null]),
      sb("v_top_funds_viewed?select=*", { revalidate: 120 }).catch(() => []),
    ]);
  } catch {}

  const totalEvents = events.reduce((s, e) => s + Number(e.events), 0);
  const maxEvents = Math.max(...events.map((e) => Number(e.events)), 1);
  const peakSessions = events.reduce((s, e) => Math.max(s, Number(e.sessions) || 0), 0);
  const lastSeen = events.map((e) => e.last_seen).filter(Boolean).sort().at(-1);

  const stats = [
    { label: "Total events", value: fmt(totalEvents) },
    { label: "Peak sessions", value: fmt(peakSessions), sub: "per type" },
    { label: "Event types", value: events.length },
    { label: "Top searches", value: searches.length },
  ];

  const searchCols = [
    { key: "rank", label: "#", align: "left", muted: true, render: (r) => r._rank },
    { key: "query", label: "Query", render: (r) => r.query },
    { key: "searches", label: "Searches", align: "right", mono: true, render: (r) => fmt(r.searches) },
  ];

  const pageCols = [
    { key: "page_path", label: "Page", render: (r) => r.page_path || "(unknown)" },
    { key: "sessions", label: "Sessions", align: "right", mono: true },
    { key: "median_seconds", label: "Median time", align: "right", mono: true, render: (r) => `${r.median_seconds}s` },
    { key: "avg_seconds", label: "Avg time", align: "right", mono: true, render: (r) => `${r.avg_seconds}s` },
  ];

  const chartCols = [
    { key: "chart", label: "Chart / control", render: (r) => r.chart || "(unlabelled)" },
    { key: "action", label: "Action", muted: true },
    { key: "interactions", label: "Interactions", align: "right", mono: true },
  ];

  const fundViewRows = topFunds.map((v) => ({ ...v, fund: getFund(v.scheme_code) })).filter((v) => v.fund);
  const fundCols = [
    { key: "name", label: "Fund", render: (r) => r.fund.name.replace(/ - (Direct|Regular).*/i, "") },
    { key: "views", label: "Views", align: "right", mono: true },
    { key: "sessions", label: "Sessions", align: "right", mono: true, muted: true },
  ];

  return (
    <>
      <Nav active="/analytics" />
      <main className="container-px py-10">
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tightest text-ink">Product Analytics</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          Live platform activity from real visitors — searches, drill-downs, watchlist actions and
          sign-ups. Aggregated only; no personal data is exposed. Internal dashboard, not for investors.
        </p>
        <TrustBar asOf={lastSeen ? new Date(lastSeen).toLocaleString("en-IN") : "—"} label="Live activity" className="mt-3" sources={[{ label: "Source", value: "user_events" }, { label: "PII", value: "none" }]} />

        <div className="mt-6 max-w-3xl"><StatStrip items={stats} /></div>

        <section className="mt-9">
          <SectionHeader eyebrow="user_events" title="Events by type" />
          {events.length ? (
            <GlassPanel className="p-5 sm:p-6">
              {events.map((e) => (
                <div key={e.event_type} className="flex items-center gap-4 py-2.5">
                  <span className="w-32 truncate text-[13px] text-ink-muted">{LABELS[e.event_type] || e.event_type}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                    <span className="block h-full rounded-full bg-gradient-to-r from-accent to-accent-soft" style={{ width: `${(Number(e.events) / maxEvents) * 100}%` }} />
                  </span>
                  <span className="w-16 text-right text-[13px] font-semibold tnum">{fmt(e.events)}</span>
                  <span className="hidden w-20 text-right text-[12px] text-ink-faint tnum sm:block">{fmt(e.sessions)} sess.</span>
                </div>
              ))}
            </GlassPanel>
          ) : (
            <EmptyState title="No events yet" hint="Interactions show up here as visitors use the site." />
          )}
        </section>

        <div className="mt-9 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section>
            <SectionHeader eyebrow="v_session_duration_by_page · which pages keep users longest" title="Time on page" />
            {durations.length ? (
              <DataTable columns={pageCols} rows={durations.map((d, i) => ({ ...d, _key: d.page_path || i }))} />
            ) : (
              <EmptyState title="Not enough session data yet" hint="Fires when a visitor leaves a page (pagehide)." />
            )}
          </section>

          <section>
            <SectionHeader eyebrow="v_chart_interactions · which charts/controls get opened" title="Chart engagement" />
            {charts.length ? (
              <DataTable columns={chartCols} rows={charts.map((c, i) => ({ ...c, _key: i }))} />
            ) : (
              <EmptyState title="No chart interactions yet" hint="Sorting a table or changing a chart range fires this." />
            )}
          </section>
        </div>

        <section className="mt-9">
          <SectionHeader eyebrow="v_top_funds_viewed · which funds are repeatedly viewed" title="Most-viewed funds" />
          {fundViewRows.length ? (
            <DataTable columns={fundCols} rows={fundViewRows.map((r) => ({ ...r, _key: r.scheme_code }))} />
          ) : (
            <EmptyState title="Not enough fund views yet" hint="Opening a fund page logs a view here." />
          )}
        </section>

        <section className="mt-9">
          <SectionHeader eyebrow="v_advisor_funnel · does the advisor CTA convert?" title="Advisor conversion funnel" />
          {funnel ? (
            <StatStrip items={[
              { label: "CTA clicks", value: fmt(funnel.cta_clicks || 0) },
              { label: "Form submits", value: fmt(funnel.submits || 0) },
              { label: "Leads stored", value: fmt(funnel.leads_stored || 0) },
              { label: "Click → submit rate", value: funnel.cta_clicks ? `${Math.round((100 * (funnel.submits || 0)) / funnel.cta_clicks)}%` : "—" },
            ]} />
          ) : <EmptyState title="No advisor funnel data yet" />}
        </section>

        <section className="mt-9">
          <SectionHeader eyebrow="intent signal" title="Top searches" />
          {searches.length ? (
            <DataTable columns={searchCols} rows={searches.map((s, i) => ({ ...s, _rank: i + 1, _key: s.query }))} />
          ) : (
            <EmptyState title="No searches yet" hint="Search the dashboard and they'll rank here." />
          )}
        </section>
      </main>
      <Footer note={<span>The behavioural dataset that turns this from a weekend project into a portfolio piece.</span>} />
    </>
  );
}
