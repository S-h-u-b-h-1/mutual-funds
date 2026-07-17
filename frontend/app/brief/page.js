import { sb } from "../lib/supabase";
import { buildBrief } from "../lib/brief";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import GlassPanel from "../components/ui/GlassPanel";
import SectionHeader from "../components/ui/SectionHeader";
import StatStrip from "../components/ui/StatStrip";
import TrustBar from "../components/ui/TrustBar";
import SignalCard from "../components/ui/SignalCard";
import NextActions from "../components/NextActions";
import BriefActions from "../components/BriefActions";

export const metadata = { title: "Market Brief" };
export const revalidate = 600;

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const inr = (n) => `${n >= 0 ? "+" : "−"}₹${fmt(Math.abs(Math.round(n)))} Cr`;
const lakhCr = (n) => `₹${(n / 100000).toFixed(2)}L Cr`;

// No per-AMC drill-down exists for category-level flow data (see brief.js's header comment), so
// each entry is plain text, not a link.
function FlowList({ items, tone }) {
  if (!items.length) return <div className="text-[13px] text-ink-faint">None this month.</div>;
  return (
    <ul className="divide-y divide-line">
      {items.map((r, i) => (
        <li key={r.name} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-4 text-right text-[11px] text-ink-faint tnum">{i + 1}</span>
            <span className="truncate text-ink">{r.name}</span>
          </span>
          <span className={`tnum font-semibold ${tone === "pos" ? "text-pos" : "text-neg"}`}>{r.v >= 0 ? "+" : "−"}₹{fmt(Math.abs(Math.round(r.v)))} Cr</span>
        </li>
      ))}
    </ul>
  );
}

export default async function Brief() {
  let headline = [], categoryFlows = [], signals = [], byClass = [], lastRun = [];
  try {
    [headline, categoryFlows, signals, byClass, lastRun] = await Promise.all([
      sb("v_flow_headline?select=*", { revalidate: 600 }),
      sb("v_amc_flows?select=amc_name,asset_class,net_flow_cr,category", { revalidate: 600 }),
      sb("v_signals?select=*", { revalidate: 600 }),
      sb("mv_asset_class_summary?select=*", { revalidate: 600 }),
      sb("fact_pipeline_runs?pipeline=eq.nav_daily&select=finished_at,status&order=finished_at.desc&limit=1", { revalidate: 600 }),
    ]);
  } catch {}
  const flow = headline[0] || {};
  const brief = buildBrief({ headline: flow, categoryFlows, signals });
  const latest = byClass.map((r) => r.latest_nav_date).sort().at(-1);
  const generated = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

  // Freshness guard (production-freshness incident, 2026-07-04): a real, visible signal for
  // whether this Brief reflects current data — never silently show old numbers as if current.
  // Same 2/7-day thresholds as marketStatus.js / ingestion/freshness.py, applied here too.
  const staleDays = latest ? Math.floor((Date.now() - new Date(`${latest}T00:00:00Z`).getTime()) / 86400000) : null;
  const isStale = staleDays == null || staleDays > 2;
  const lastRunAt = lastRun[0]?.finished_at ? new Date(lastRun[0].finished_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST" : "never recorded";

  const stats = [
    { label: "Equity net", value: inr(flow.equity_net_cr ?? 0), tone: "pos" },
    { label: "Debt net", value: inr(flow.debt_net_cr ?? 0), tone: "neg" },
    { label: "Total AUM", value: lakhCr(flow.total_aum_cr ?? 0) },
    { label: "Signals", value: signals.length },
  ];

  return (
    <>
      <Nav active="/brief" />
      <main className="container-px py-10 sm:py-14">
        {/* Masthead */}
        <div className="eyebrow text-accent">Morning brief · Fund flows · {flow.month || "—"}</div>
        <h1 className="page-title mt-3 max-w-3xl">What changed, why it matters, and what to research next.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">A concise deterministic briefing from the latest available NAV, flow, and signal data. Designed to be reviewed in under five minutes.</p>
        <TrustBar asOf={latest} className="mt-3" sources={[{ label: "Generated", value: generated }, { label: "Method", value: "rule-based" }]} />
        <div className="mt-5"><BriefActions date={latest || generated} /></div>

        {isStale && (
          <div className="mt-4 max-w-3xl rounded-xl border border-neg/40 bg-neg/10 px-4 py-3 text-[13px] text-neg">
            <b>Brief is stale.</b> Latest available data: {latest || "no NAV date on record"}.
            Pipeline last ran: {lastRunAt}. Numbers below are real but not current — treat this as
            a snapshot of the last successful ingestion, not today&rsquo;s market.
          </div>
        )}

        {/* Data-scope disclosure */}
        <div className="mt-5 max-w-3xl rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-[12.5px] text-warn">
          <b>Disclosure:</b> <span className="text-ink-muted">Monthly net-flow figures are real, from AMFI&rsquo;s Monthly Report — but industry-wide per fund category, not broken out by individual AMC. &ldquo;Top inflow/outflow&rdquo; below ranks categories, not AMCs. Scheme &amp; NAV data is daily from AMFI.</span>
        </div>

        <div className="mt-6 max-w-3xl"><StatStrip items={stats} /></div>

        {/* Executive summary */}
        <section className="mt-9 max-w-3xl">
          <SectionHeader eyebrow="01" title="Executive summary" />
          <GlassPanel className="p-5 sm:p-6">
            <p className="text-[16px] leading-relaxed text-ink">{brief.lead}</p>
            {brief.paragraphs[1] && <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">{brief.paragraphs[1]}</p>}
          </GlassPanel>
        </section>

        {/* Top in / out */}
        <section className="mt-9 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <SectionHeader eyebrow="02" title="Top equity inflows" />
            <GlassPanel className="px-5 py-2"><FlowList items={brief.topInflows} tone="pos" /></GlassPanel>
          </div>
          <div>
            <SectionHeader eyebrow="03" title="Top equity outflows" />
            <GlassPanel className="px-5 py-2"><FlowList items={brief.topOutflows} tone="neg" /></GlassPanel>
          </div>
        </section>

        {/* Category commentary */}
        <section className="mt-9 max-w-3xl">
          <SectionHeader eyebrow="04" title="Category commentary" />
          <GlassPanel className="space-y-4 p-5 sm:p-6">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-pos">Equity</div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{brief.commentary.equity}</p>
            </div>
            <div className="hairline h-px" />
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-wider text-[#60a5fa]">Debt</div>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">{brief.commentary.debt}</p>
            </div>
          </GlassPanel>
        </section>

        {/* Signals */}
        {signals.length > 0 && (
          <section className="mt-9 max-w-3xl">
            <SectionHeader eyebrow="05" title="Flagged signals" action={<a className="hover:text-ink" href="/signals">All →</a>} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {signals.slice(0, 6).map((s, i) => (
                <SignalCard key={i} assetClass={s.asset_class} signal={s.signal} z={Number(s.z_score).toFixed(1)} value={inr(s.net_flow_cr)} />
              ))}
            </div>
          </section>
        )}

        {/* Risks & methodology */}
        <section className="mt-9 max-w-3xl">
          <SectionHeader eyebrow="06" title="Risks & methodology" />
          <GlassPanel className="p-5 sm:p-6">
            <ul className="space-y-2.5 text-[13.5px] leading-relaxed text-ink-muted">
              {brief.risks.map((r, i) => (
                <li key={i} className="flex gap-2.5"><span className="text-ink-faint">—</span><span>{r}</span></li>
              ))}
            </ul>
            <p className="mt-4 border-t border-line pt-4 text-[12.5px] leading-relaxed text-ink-faint">
              This note is composed deterministically from the underlying flow and signal data — no generative
              model is used, so every figure traces directly to the dataset. Full method on the{" "}
              <a className="text-ink-muted hover:text-ink" href="/methodology">methodology</a> page.
            </p>
          </GlassPanel>
        </section>

        <div className="max-w-3xl">
          <NextActions items={[
            { label: "Today's market news & impact", href: "/news" },
            { label: "All flow signals", href: "/signals" },
            { label: "Compare AMCs", href: "/compare" },
            { label: "Category leaders", href: "/categories" },
          ]} />
        </div>
      </main>
      <Footer note={<span>Not investment advice · auto-generated from AMFI / SEBI data · {generated}.</span>} />
    </>
  );
}
