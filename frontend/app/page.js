// MF Pulse — Market Intelligence homepage. Dense, terminal-grade, trust-signaled.
import { sb } from "./lib/supabase";
import { marketIntel } from "./lib/intel";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Search from "./components/Search";
import Tracker from "./components/Tracker";
import Watchlist from "./components/Watchlist";
import HeroVisual from "./components/HeroVisual";
import KnowledgeGraphHero from "./components/KnowledgeGraphHero";
import GuidedJourney from "./components/GuidedJourney";
import FlowHeatmap from "./components/FlowHeatmap";
import AlertSignup from "./components/AlertSignup";
import SectionHeader from "./components/ui/SectionHeader";
import GlassPanel from "./components/ui/GlassPanel";
import StatStrip from "./components/ui/StatStrip";
import Leaderboard from "./components/Leaderboard";
import DataTable from "./components/ui/DataTable";
import SignalCard from "./components/ui/SignalCard";
import PremiumButton from "./components/ui/PremiumButton";
import Badge from "./components/ui/Badge";
import { allFunds } from "./lib/funds";
import { graphNodes } from "./lib/graphNodes";
import trendData from "./data/amc_trend.json";
import performance from "./data/performance.json";
import daily from "./data/daily.json";

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
    sb("mv_asset_class_summary?select=*"),
    sb("mv_amc_summary?select=*"),
    sb("v_flow_headline?select=*"),
    sb("v_amc_flows?select=amc_name,asset_class,net_flow_cr"),
    sb("v_signals?select=*"),
    sb("v_flow_history?select=*"),
  ]);
  const flow = headline[0] || {};
  const totalSchemes = byClass.reduce((s, r) => s + Number(r.schemes), 0);
  const latest = byClass.map((r) => r.latest_nav_date).sort().at(-1);
  const intel = marketIntel(trendData.amcs);
  const funds = allFunds();
  const graph = graphNodes(funds); // top-18 AMCs shown visually; real totals below are unclipped
  const realAmcCount = new Set(funds.map((f) => f.amc).filter(Boolean)).size;
  const realBenchmarkCount = new Set(funds.map((f) => f.benchmark).filter(Boolean)).size;
  const amcDeltas = Object.fromEntries(Object.entries(trendData.amcs).map(([k, p]) => [k, p[p.length - 1][1] - p[0][1]]));
  const moverCol = (label) => [
    { key: "name", label, render: (r) => <a className="text-ink hover:text-accent-soft" href={`/amc/${encodeURIComponent(r.amc)}`}>{r.name}</a> },
    { key: "change", label: "30d Δ", align: "right", render: (r) => <span className={r.change >= 0 ? "text-pos tnum" : "text-neg tnum"}>{r.change >= 0 ? "+" : ""}{r.change.toFixed(2)}</span> },
  ];
  const amcCols = [
    { key: "rank", label: "#", muted: true, render: (r) => r._rank },
    { key: "amc", label: "AMC", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/amc/${encodeURIComponent(r.amc + " Mutual Fund")}`}>{r.amc}</a> },
    { key: "funds", label: "Funds", align: "right", mono: true, muted: true },
    { key: "avg", label: "Avg 1M", align: "right", render: (r) => <span className={r.avg >= 0 ? "text-pos tnum" : "text-neg tnum"}>{r.avg >= 0 ? "+" : ""}{r.avg.toFixed(1)}%</span> },
    { key: "score", label: "Quality", align: "right", render: (r) => <span className="font-semibold tnum text-ink">{r.score.toFixed(0)}</span> },
  ];
  const dailyCol = [
    { key: "name", label: "Fund", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/fund/${r.code}`}>{r.name.replace(/ - (Direct|Regular).*/i, "")}<span className="block text-[11px] text-ink-faint">{r.amc}</span></a> },
    { key: "r1d", label: "1D", align: "right", render: (r) => <span className={r.r1d >= 0 ? "text-pos tnum" : "text-neg tnum"}>{r.r1d >= 0 ? "+" : ""}{r.r1d.toFixed(2)}%</span> },
  ];

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

  // Hero strip leads with REAL, traceable metrics (no synthetic AUM/flows up top).
  const topPerf = performance.top[0];
  const stats = [
    { label: "Schemes tracked", value: fmt(totalSchemes), sub: "AMFI · daily" },
    { label: "AMC houses", value: "51", sub: "AMFI" },
    { label: "Top fund · 1M", value: `+${topPerf.r1m.toFixed(1)}%`, tone: "pos", sub: topPerf.amc },
    { label: "Market momentum", value: `${intel.avg >= 0 ? "+" : ""}${intel.avg.toFixed(2)}`, tone: intel.avg >= 0 ? "pos" : "neg", sub: "avg AMC 30d index" },
    { label: "Latest NAV", value: latest, sub: "AMFI" },
    { label: "Flow signals", value: signals.length, sub: "flows · sample" },
  ];

  return (
    <>
      <Nav active="/" />
      <Tracker event="page_view" payload={{ page: "home" }} />

      <main className="container-px py-8 sm:py-10">
        {/* Header — what MF Pulse is, in one sentence, above the fold */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Today&rsquo;s Market Pulse · {latest}</div>
            <h1 className="mt-2 text-[26px] sm:text-[34px] font-bold tracking-tightest text-ink">India Mutual-Fund Performance Intelligence</h1>
            <p className="mt-2.5 text-[14.5px] leading-relaxed text-ink-muted">
              MF Pulse helps Indian investors make better mutual fund decisions through verified
              data, institutional-grade research, and explainable market intelligence.
            </p>
          </div>
          <div className="flex gap-2">
            <PremiumButton href="/categories" variant="ghost">Categories</PremiumButton>
            <PremiumButton href="/performance">Top Performers</PremiumButton>
          </div>
        </div>

        {/* Real ecosystem graph — every AMC, category and benchmark this platform connects.
            Node size = real fund count, not decoration. Three.js on capable devices, a
            layout-matched static SVG everywhere else (SSR, reduced-motion, mobile, no-WebGL). */}
        <div className="mt-6 rounded-2xl border border-line bg-white/[0.015] p-4 sm:p-5">
          <KnowledgeGraphHero
            classes={graph.classes}
            amcs={graph.amcs}
            fundCount={totalSchemes}
            amcCount={realAmcCount}
            categoryCount={graph.classes.length}
            benchmarkCount={realBenchmarkCount}
          />
        </div>

        <GuidedJourney />

        {/* Market summary strip */}
        <div className="mt-6"><StatStrip items={stats} /></div>

        {/* What changed today — REAL 1-day NAV moves, answers "what changed since yesterday" first */}
        <section className="mt-6">
          <SectionHeader
            eyebrow={`1-day NAV moves · ${daily.advancers} up / ${daily.decliners} down · breadth ${daily.breadth1d}%`}
            title="What deserves attention today"
            action={<Badge tone={daily.breadth1d >= 50 ? "pos" : "neg"} dot>{(daily.industry?.riskRegime || "").toLowerCase() || (daily.breadth1d >= 50 ? "risk-on" : "risk-off")}</Badge>}
          />
          {daily.insights.length > 0 && (
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              {daily.insights.map((i, k) => <div key={k} className="glass p-3 text-[13px] text-ink-muted"><span className="text-accent-soft">▸</span> {i.summary}</div>)}
            </div>
          )}
          {/* Why it matters — deterministic explanation engine (metric · prev → curr) */}
          {daily.explained.length > 0 && (
            <div className="mb-4 grid gap-2.5 sm:grid-cols-2">
              {daily.explained.map((i, k) => (
                <a key={k} href={`/fund/${i.entity_id}`} className="glass p-3.5 transition-colors hover:bg-white/[0.04]">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-medium text-ink">{i.title}</span>
                    <Badge tone={i.severity === "caution" ? "warn" : "pos"}>{i.value}</Badge>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">{i.why} {i.care}</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink-faint"><span className="text-ink-muted">Context:</span> {i.context}</p>
                  <p className="mt-1 text-[10.5px] tnum text-ink-faint">{i.metric}: {i.previous_value} → {i.current_value} · attention {i.attentionScore}/100</p>
                </a>
              ))}
            </div>
          )}
          {daily.industry && (
            <div className="mb-4 rounded-lg border border-line bg-white/[0.02] px-4 py-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Industry intelligence · {daily.industry.riskRegime}</div>
              <ul className="space-y-1 text-[12.5px] text-ink-muted">
                {daily.industry.statements.map((s, k) => <li key={k}><span className="text-accent-soft">›</span> {s}</li>)}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-pos">Today&rsquo;s gainers</div>
              <DataTable columns={dailyCol} rows={daily.gainers.map((f) => ({ ...f, _key: f.code }))} />
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neg">Today&rsquo;s fallers</div>
              <DataTable columns={dailyCol} rows={daily.fallers.map((f) => ({ ...f, _key: f.code }))} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-faint">1-day NAV return, equity Growth funds · today&rsquo;s top fund (30d): {daily.topFund?.name?.replace(/ - (Direct|Regular).*/i, "")} · source AMFI, {daily.asOf}.</p>
        </section>

        {/* Performance pulse — REAL data leads the page */}
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <GlassPanel className="lg:col-span-2 p-5 sm:p-6">
            <SectionHeader eyebrow={`auto-generated · as of ${performance.asOf}`} title="What the data says" action={<Badge tone="pos" dot>real</Badge>} />
            <ul className="space-y-3">
              {performance.insights.map((t, i) => (
                <li key={i} className="text-[13.5px] leading-relaxed text-ink-muted"><span className="text-accent-soft">▸</span> {t}</li>
              ))}
            </ul>
          </GlassPanel>
          <GlassPanel className="p-5 sm:p-6">
            <SectionHeader title="Top performers · 1M" action={<a className="hover:text-ink" href="/performance">All →</a>} />
            <ul className="space-y-3">
              {performance.top.slice(0, 5).map((f) => (
                <li key={f.code} className="flex items-center justify-between gap-3 text-[12.5px]">
                  <a className="truncate text-ink hover:text-accent-soft" href={`/amc/${encodeURIComponent(f.amc + " Mutual Fund")}`}>{f.name.replace(/ - (Direct|Regular).*/i, "")}</a>
                  <span className="shrink-0 font-semibold tnum text-pos">+{f.r1m.toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </GlassPanel>
        </div>

        {/* Search */}
        <div className="mt-6"><Search /></div>

        {/* Market intelligence — REAL 30-day equity index, no sample */}
        <section className="mt-9">
          <SectionHeader eyebrow="30-day equity index · real AMFI NAV history" title="Market intelligence" action={<Badge tone="pos" dot>live data</Badge>} />
          <StatStrip
            items={[
              { label: "30d momentum", value: `${intel.avg >= 0 ? "+" : ""}${intel.avg.toFixed(2)}`, tone: intel.avg >= 0 ? "pos" : "neg", sub: "avg index Δ" },
              { label: "Breadth", value: `${intel.positive}/${intel.n}`, sub: `${(intel.breadth * 100).toFixed(0)}% positive` },
              { label: "Dispersion", value: intel.dispersion.toFixed(1), sub: "gain−loss range" },
              { label: "Volatility", value: intel.stdev.toFixed(2), sub: "std dev of Δ" },
              { label: "Best", value: `+${intel.gainers[0]?.change.toFixed(1)}`, tone: "pos", sub: intel.gainers[0]?.name },
              { label: "Worst", value: intel.losers[0]?.change.toFixed(1), tone: "neg", sub: intel.losers[0]?.name },
            ]}
          />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-pos">Top gainers</div>
              <DataTable columns={moverCol("AMC")} rows={intel.gainers.map((r) => ({ ...r, _key: r.amc }))} />
            </div>
            <div>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neg">Top laggards</div>
              <DataTable columns={moverCol("AMC")} rows={intel.losers.map((r) => ({ ...r, _key: r.amc }))} />
            </div>
          </div>

          {/* Category rotation — real 1M-vs-3M rank movement, previously computed but unsurfaced */}
          {daily.categoryRotation?.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">Category rotation · 1M rank vs 3M rank</div>
              <div className="flex flex-wrap gap-2">
                {daily.categoryRotation.map((c) => (
                  <a
                    key={c.name}
                    href={`/categories/${encodeURIComponent(c.name)}`}
                    className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                  >
                    <span>{c.name}</span>
                    <span className={c.rank_change > 0 ? "text-pos tnum font-semibold" : c.rank_change < 0 ? "text-neg tnum font-semibold" : "text-ink-faint tnum"}>
                      {c.rank_change === 0 ? "–" : `${c.rank_change > 0 ? "↑" : "↓"}${Math.abs(c.rank_change)}`}
                    </span>
                  </a>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-ink-faint">Rank change = 1-month category rank minus 3-month rank, by avg NAV return · ↑ improving, ↓ weakening.</p>
            </div>
          )}
        </section>

        {/* AMC quality leaders — REAL */}
        <section className="mt-9">
          <SectionHeader eyebrow="% of funds beating category median · 1M" title="AMC quality leaders" action={<a className="hover:text-ink" href="/performance">Full ranking →</a>} />
          <DataTable columns={amcCols} rows={performance.amcs.slice(0, 6).map((r, i) => ({ ...r, _key: r.amc, _rank: i + 1 }))} footnote="Quality score blends outperformance, breadth, and average return. Real AMFI NAV, last month." />
        </section>

        {/* Sample flow zone — clearly quarantined, awaiting authoritative SEBI data. Collapsed by
            default: not yet decision-grade, so it shouldn't compete with real intelligence above. */}
        <section className="mt-9">
          <details className="group">
            {/* <summary> only permits phrasing content (+ an optional leading heading) per the
                HTML5 spec — the full SectionHeader (with its div/h2 wrappers) renders just below
                the summary line instead, inside the disclosure body, not nested inside it. */}
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
              <span>Fund flows (sample) · illustrative sample, awaiting SEBI export</span>
              <span className="shrink-0 text-ink-faint transition-transform group-open:rotate-180">▾</span>
            </summary>
            <SectionHeader title="Fund flows (sample)" action={<Badge tone="warn">sample</Badge>} />
            <GlassPanel className="p-5 sm:p-6"><FlowHeatmap rows={flowHistory} assetClass="Equity" /></GlassPanel>
            <GlassPanel className="mt-4 p-5 sm:p-6">
              <div className="mb-3 text-[12px] text-ink-faint">Capital-allocation network · AMC → category (illustrative)</div>
              <HeroVisual nodes={networkNodes} />
            </GlassPanel>
          </details>
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

        <Watchlist amcDeltas={amcDeltas} />
        <AlertSignup />
      </main>

      <Footer note={<span><b className="text-ink-muted">Daily NAV intelligence</b> from AMFI — latest available: {latest} ({fmt(totalSchemes)} schemes, 51 AMCs). Monthly net-flow figures are <b className="text-warn">sample data</b> until the SEBI export is wired in. <a className="text-ink-muted hover:text-ink" href="/data-status">Data status →</a></span>} />
    </>
  );
}
