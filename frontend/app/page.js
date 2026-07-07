// MF Pulse — Market Intelligence homepage. Dense, terminal-grade, trust-signaled.
import { sb } from "./lib/supabase";
import { marketIntel } from "./lib/intel";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Search from "./components/Search";
import HomepageClient from "./components/HomepageClient";
import Tracker from "./components/Tracker";
import Watchlist from "./components/Watchlist";
import WatchlistIntelligence from "./components/WatchlistIntelligence";
import HeroVisual from "./components/HeroVisual";
import KnowledgeGraphHero from "./components/KnowledgeGraphHero";
import GuidedJourney from "./components/GuidedJourney";
import RecentActivity from "./components/RecentActivity";
import FlowHeatmap from "./components/FlowHeatmap";
import AlertSignup from "./components/AlertSignup";
import MarketNewsPulse from "./components/MarketNewsPulse";
import MarketTerminal from "./components/MarketTerminal";
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
import { getTopHeadlines } from "./lib/news";
import { impactChainsFor, impactScoreFor, researchLinksFor, fundsWorthResearching } from "./lib/marketImpact";
import { getMarketTerminal } from "./lib/marketTerminal";
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
  const newsHeadlines = await getTopHeadlines({ limit: 5 }).catch(() => []);
  const marketTerminal = await getMarketTerminal({ revalidate: 300 }).catch(() => null);
  // Phase 8 — enrich each headline with real market-impact data (chains/score/research/funds).
  // Defensive per-article try/catch: a single bad article can never break the homepage.
  const enrichedHeadlines = newsHeadlines.map((article) => {
    try {
      const entityLink = article.links?.find((l) => l.entityType === "category" || l.entityType === "amc");
      return {
        ...article,
        chains: impactChainsFor(article.links),
        impact: impactScoreFor(article),
        research: researchLinksFor(article),
        topFunds: entityLink ? fundsWorthResearching(entityLink, { limit: 2 }) : [],
      };
    } catch {
      return article;
    }
  });
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
  // Live Market Status & Time-of-day greeting (Indian Standard Time)
  const serverTime = new Date();
  const utcTime = serverTime.getTime() + (serverTime.getTimezoneOffset() * 60000);
  const istTime = new Date(utcTime + (3600000 * 5.5));
  const istHrs = istTime.getHours();
  const istMins = istTime.getMinutes();
  const istDay = istTime.getDay();
  const isWeekday = istDay >= 1 && istDay <= 5;
  const istTimeVal = istHrs * 100 + istMins;
  const isMarketOpen = isWeekday && istTimeVal >= 915 && istTimeVal <= 1530;

  let greeting = "Good evening";
  if (istHrs >= 5 && istHrs < 12) greeting = "Good morning";
  else if (istHrs >= 12 && istHrs < 17) greeting = "Good afternoon";

  // Dynamic Biggest Mover detection
  const topGainer = daily.gainers?.[0];
  const topFaller = daily.fallers?.[0];
  let biggestMover = null;
  if (topGainer && topFaller) {
    biggestMover = Math.abs(topGainer.r1d) >= Math.abs(topFaller.r1d) ? { ...topGainer, isGainer: true } : { ...topFaller, isGainer: false };
  } else if (topGainer) {
    biggestMover = { ...topGainer, isGainer: true };
  } else if (topFaller) {
    biggestMover = { ...topFaller, isGainer: false };
  }

  return (
    <>
      <Nav active="/" />
      <Tracker event="page_view" payload={{ page: "home" }} />

      <main className="container-px py-8 sm:py-10 space-y-8">
        
        {/* Command Palette search workspace trigger */}
        <div className="max-w-2xl mx-auto"><Search /></div>

        <HomepageClient
          byClass={byClass}
          amcSummary={amcSummary}
          headline={headline}
          amcFlows={amcFlows}
          signals={signals}
          flowHistory={flowHistory}
          newsHeadlines={newsHeadlines}
          marketTerminal={marketTerminal}
          totalSchemes={totalSchemes}
          realAmcCount={realAmcCount}
          realBenchmarkCount={realBenchmarkCount}
          amcDeltas={amcDeltas}
          leaderboard={leaderboard}
          networkNodes={networkNodes}
          stats={stats}
          greeting={greeting}
          isMarketOpen={isMarketOpen}
          biggestMover={biggestMover}
          daily={daily}
          enrichedHeadlines={enrichedHeadlines}
          performance={performance}
          intel={intel}
        />

        {/* Dynamic 3D Universe Graph */}
        <div className="rounded-2xl border border-line bg-white/[0.015] p-4 sm:p-5">
          <KnowledgeGraphHero
            classes={graph.classes}
            amcs={graph.amcs}
            fundCount={totalSchemes}
            amcCount={realAmcCount}
            categoryCount={graph.classes.length}
            benchmarkCount={realBenchmarkCount}
          />
        </div>

        {/* Why investors use MF Pulse */}
        <section className="mt-9">
          <SectionHeader eyebrow="not another screener" title="Why investors use MF Pulse" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { t: "It explains why, not just what", d: "Every score, rank and attention flag shows its metric, previous value, current value and source — nothing asks to be taken on faith.", href: "/funds", cta: "Open any fund →" },
              { t: "It connects news to your funds", d: "A deterministic rule engine maps RBI, SEBI and market events to the categories, sectors and AMCs they may affect — every link traceable to a rule, never a black box.", href: "/news", cta: "See today's news →" },
              { t: "It updates itself, and proves it", d: "NAVs, analytics and news refresh automatically on a published schedule, and the live status page shows exactly when each layer last updated.", href: "/status", cta: "Check the refresh timeline →" },
            ].map((c) => (
              <a key={c.t} href={c.href} className="glass group flex flex-col p-5 transition-colors hover:bg-white/[0.045]">
                <span className="text-[13.5px] font-semibold text-ink">{c.t}</span>
                <span className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-ink-muted">{c.d}</span>
                <span className="mt-3 text-[12px] text-accent-soft">{c.cta}</span>
              </a>
            ))}
          </div>
        </section>

        <AlertSignup />
      </main>

      <Footer note={<span><b className="text-ink-muted">Daily NAV intelligence</b> from AMFI — latest available: {latest} ({fmt(totalSchemes)} schemes, 51 AMCs). Monthly net-flow figures are <b className="text-warn">sample data</b> until the SEBI export is wired in. <a className="text-ink-muted hover:text-ink" href="/data-status">Data status →</a></span>} />
    </>
  );
}
