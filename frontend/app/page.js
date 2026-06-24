// MF Pulse — Market Intelligence homepage. Dense, terminal-grade, trust-signaled.
import { sb } from "./lib/supabase";
import { buildBrief } from "./lib/brief";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Search from "./components/Search";
import Tracker from "./components/Tracker";
import Watchlist from "./components/Watchlist";
import FlowNetwork from "./components/FlowNetwork";
import FlowHeatmap from "./components/FlowHeatmap";
import AlertSignup from "./components/AlertSignup";
import SectionHeader from "./components/ui/SectionHeader";
import GlassPanel from "./components/ui/GlassPanel";
import StatStrip from "./components/ui/StatStrip";
import TrustBar from "./components/ui/TrustBar";
import Leaderboard from "./components/Leaderboard";
import SignalCard from "./components/ui/SignalCard";
import PremiumButton from "./components/ui/PremiumButton";
import Badge from "./components/ui/Badge";
import trendData from "./data/amc_trend.json";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const inr = (n) => `${n >= 0 ? "+" : "−"}₹${fmt(Math.abs(Math.round(n)))} Cr`;
const lakhCr = (n) => `₹${(n / 100000).toFixed(2)}L Cr`;
const strip = (s) => s.replace(" Mutual Fund", "");
const trendDelta = (amc) => {
  const p = trendData.amcs[amc];
  return p ? p[p.length - 1][1] - p[0][1] : null;
};

export default async function Page() {
  const [byClass, amcSummary, headline, amcFlows, signals, flowHistory] = await Promise.all([
    sb("v_asset_class_summary?select=*"),
    sb("v_amc_summary?select=*"),
    sb("v_flow_headline?select=*"),
    sb("v_amc_flows?select=amc_name,asset_class,net_flow_cr"),
    sb("v_signals?select=*"),
    sb("v_flow_history?select=*"),
  ]);
  const flow = headline[0] || {};
  const totalSchemes = byClass.reduce((s, r) => s + Number(r.schemes), 0);
  const latest = byClass.map((r) => r.latest_nav_date).sort().at(-1);
  const brief = buildBrief({ headline: flow, amcFlows, signals });

  // Per-AMC aggregation for leaderboard
  const agg = {};
  for (const r of amcSummary) {
    const a = (agg[r.amc_name] ||= { total: 0, equity: 0 });
    a.total += Number(r.schemes);
    if (r.asset_class === "Equity") a.equity += Number(r.schemes);
  }
  const flowByAmc = {};
  for (const r of amcFlows) {
    const f = (flowByAmc[r.amc_name] ||= { equity: null, debt: null });
    if (r.asset_class === "Equity") f.equity = Number(r.net_flow_cr);
    if (r.asset_class === "Debt") f.debt = Number(r.net_flow_cr);
  }
  const sigCount = {};
  for (const s of signals) sigCount[s.amc_name] = (sigCount[s.amc_name] || 0) + 1;

  const leaderboard = Object.entries(agg)
    .map(([amc, a]) => {
      const f = flowByAmc[amc] || {};
      const eq = f.equity ?? null, db = f.debt ?? null;
      const total = eq == null && db == null ? null : (eq || 0) + (db || 0);
      return {
        amc, name: strip(amc), equity: a.equity, idx: trendDelta(amc),
        equityFlow: eq, debtFlow: db, totalFlow: total, signals: sigCount[amc] || 0,
      };
    })
    .sort((x, y) => y.equity - x.equity)
    .slice(0, 15);

  // Flow network nodes (AMCs with monthly flow data)
  const netAgg = {};
  for (const r of amcFlows) {
    const a = (netAgg[r.amc_name] ||= { name: strip(r.amc_name), equity: 0, debt: 0 });
    if (r.asset_class === "Equity") a.equity = Number(r.net_flow_cr);
    if (r.asset_class === "Debt") a.debt = Number(r.net_flow_cr);
  }
  const networkNodes = Object.values(netAgg)
    .sort((a, b) => Math.abs(b.equity) + Math.abs(b.debt) - (Math.abs(a.equity) + Math.abs(a.debt)))
    .slice(0, 7);

  const stats = [
    { label: "Total AUM", value: lakhCr(flow.total_aum_cr ?? 0), sub: "sample" },
    { label: "Equity net", value: inr(flow.equity_net_cr ?? 0), tone: "pos", sub: "sample" },
    { label: "Debt net", value: inr(flow.debt_net_cr ?? 0), tone: "neg", sub: "sample" },
    { label: "Active signals", value: signals.length, sub: "z ≥ 1.8" },
    { label: "Schemes", value: fmt(totalSchemes), sub: "live · AMFI" },
    { label: "AMC houses", value: "51", sub: "live" },
  ];

  return (
    <>
      <Nav active="/" />
      <Tracker event="page_view" payload={{ page: "home" }} />

      <main className="container-px py-8 sm:py-10">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Market Intelligence · {flow.month || "—"}</div>
            <h1 className="mt-2 text-[26px] sm:text-[34px] font-bold tracking-tightest text-ink">India Mutual-Fund Flow Intelligence</h1>
          </div>
          <div className="flex gap-2">
            <PremiumButton href="/brief" variant="ghost">Market Brief</PremiumButton>
            <PremiumButton href="#alerts">Get Flow Alerts</PremiumButton>
          </div>
        </div>
        <TrustBar asOf={latest} className="mt-3.5" sources={[{ label: "NAVs", value: "AMFI" }, { label: "Flows", value: "SEBI · sample" }]} />

        {/* Market summary strip */}
        <div className="mt-6"><StatStrip items={stats} /></div>

        {/* Network + brief */}
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <GlassPanel className="lg:col-span-2 p-5 sm:p-6">
            <SectionHeader eyebrow={`net flows · ${flow.month || "—"}`} title="Fund-flow network · AMC → category" action={<Badge tone="warn">sample</Badge>} />
            <FlowNetwork nodes={networkNodes} />
          </GlassPanel>
          <GlassPanel className="p-5 sm:p-6">
            <SectionHeader title="Market brief" action={<a className="hover:text-ink" href="/brief">Full →</a>} />
            <p className="text-[13.5px] leading-relaxed text-ink-muted">{brief.lead}</p>
            <ul className="mt-4 space-y-2.5">
              {brief.bullets.map((b, i) => (
                <li key={i} className="flex items-start justify-between gap-3 text-[12.5px]">
                  <span className="text-ink-faint">{b.k}</span>
                  <span className={`text-right ${b.tone === "pos" ? "text-pos" : b.tone === "neg" ? "text-neg" : "text-ink"}`}>{b.v}</span>
                </li>
              ))}
            </ul>
          </GlassPanel>
        </div>

        {/* Search */}
        <div className="mt-6"><Search /></div>

        {/* Heatmap */}
        <section className="mt-9">
          <SectionHeader eyebrow="6-month history · sample" title="Net equity-flow heatmap" />
          <GlassPanel className="p-5 sm:p-6"><FlowHeatmap rows={flowHistory} assetClass="Equity" /></GlassPanel>
        </section>

        {/* Signals */}
        {signals.length > 0 && (
          <section className="mt-9">
            <SectionHeader eyebrow="z-score ≥ 1.8" title="Flow signals" action={<a className="hover:text-ink" href="/signals">All →</a>} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {signals.slice(0, 6).map((s, i) => (
                <SignalCard key={i} amc={strip(s.amc_name)} assetClass={s.asset_class} signal={s.signal} z={Number(s.z_score).toFixed(1)} value={inr(s.net_flow_cr)} />
              ))}
            </div>
          </section>
        )}

        {/* AMC leaderboard */}
        <section className="mt-9">
          <SectionHeader eyebrow="sortable · click any header" title="AMC leaderboard" action={<a className="hover:text-ink" href="/compare">Compare →</a>} />
          <Leaderboard rows={leaderboard} />
        </section>

        <Watchlist />
        <AlertSignup />
      </main>

      <Footer note={<span>Scheme &amp; NAV data <b className="text-ink-muted">live from AMFI</b> ({fmt(totalSchemes)} schemes, 51 AMCs, nightly). Net-flow figures <b className="text-warn">sample</b> until SEBI export is wired in.</span>} />
    </>
  );
}
