import Link from "next/link";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Search from "./components/Search";
import Tracker from "./components/Tracker";
import RecentActivity from "./components/RecentActivity";
import WatchlistIntelligence from "./components/WatchlistIntelligence";
import AlertSignup from "./components/AlertSignup";
import KnowledgeGraphHero from "./components/KnowledgeGraphHero";
import FreshnessBadge from "./components/ui/FreshnessBadge";
import DataGapNotice from "./components/ui/DataGapNotice";
import { allFunds, asOf } from "./lib/funds";
import { graphNodes } from "./lib/graphNodes";
import { getTopHeadlines } from "./lib/news";
import { marketStatus } from "./lib/marketStatus";
import daily from "./data/daily.json";

const formatNumber = (value) => new Intl.NumberFormat("en-IN").format(value);
const shortName = (name = "") => name.replace(/ - (Direct|Regular).*/i, "").replace(/\s+/g, " ").trim();

const WORKFLOWS = [
  { label: "Research funds", detail: "Study returns, risk, portfolio evidence, management and known data gaps.", href: "/funds", icon: "01" },
  { label: "Compare funds", detail: "Understand meaningful differences without forcing a universal winner.", href: "/compare", icon: "02" },
  { label: "Understand risk", detail: "Read volatility and drawdown in category and benchmark context.", href: "/performance", icon: "03" },
  { label: "Track a watchlist", detail: "Return to funds you follow and review what changed since your last visit.", href: "/dashboard#watchlist", icon: "04" },
  { label: "Review a portfolio", detail: "Use your actual holdings with deterministic portfolio intelligence.", href: "/portfolio", icon: "05" },
  { label: "Explore news impact", detail: "Connect financial events to AMCs, categories and relevant funds.", href: "/news", icon: "06" },
  { label: "Build a strategy", detail: "Organize a multi-fund research thesis and compare allocations.", href: "/research", icon: "07" },
  { label: "Save research notes", detail: "Keep observations attached to the fund and evidence you reviewed.", href: "/dashboard#notebook", icon: "08" },
];

function ResearchStrip({ funds, headlines, market }) {
  const amcCount = new Set(funds.map((fund) => fund.amc).filter(Boolean)).size;
  const latestNews = headlines[0]?.publishedAt || headlines[0]?.published_at || null;
  const items = [
    ["Latest NAV", asOf || "Unavailable", "AMFI"],
    ["News update", latestNews ? new Date(latestNews).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Unavailable", "Published source time"],
    ["Schemes tracked", formatNumber(funds.length), "Current research universe"],
    ["AMC coverage", `${amcCount} fund houses`, "Derived from scheme records"],
    ["Market session", market.sessionLabel, "Clock-derived, not holiday-aware"],
  ];
  return (
    <section aria-label="Research data status" className="grid overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-2 lg:grid-cols-5">
      {items.map(([label, value, note]) => <div key={label} className="border-b border-line p-4 last:border-0 sm:border-r lg:border-b-0"><div className="eyebrow">{label}</div><div className="mt-2 text-sm font-semibold text-ink tnum">{value}</div><div className="mt-1 text-[11px] leading-snug text-ink-faint">{note}</div></div>)}
    </section>
  );
}

export default async function HomePage() {
  const funds = allFunds();
  const graph = graphNodes(funds);
  const headlines = await getTopHeadlines({ limit: 5 }).catch(() => []);
  const market = marketStatus(asOf);
  const amcCount = new Set(funds.map((fund) => fund.amc).filter(Boolean)).size;
  const benchmarkCount = new Set(funds.map((fund) => fund.benchmark).filter(Boolean)).size;
  const queue = (daily.explained || []).slice(0, 4);
  const primaryNews = headlines[0];
  const changed = [
    { label: "Category movement", value: daily.topCategory || "Unavailable", detail: daily.topCategory ? `${daily.topCategory} leads the current category summary in the daily calculated bundle.` : "No category summary is available for this update.", href: "/categories" },
    { label: "AMC movement", value: daily.topAmc || "Unavailable", detail: daily.topAmc ? `${daily.topAmc} leads the current AMC summary in the daily calculated bundle.` : "No AMC summary is available for this update.", href: "/amc" },
    { label: "Fund attention", value: queue[0]?.title || "No new attention flag", detail: queue[0]?.why || "The current daily bundle contains no new rule-based fund flag.", href: queue[0]?.entity_id ? `/fund/${queue[0].entity_id}` : "/funds" },
    { label: "News context", value: primaryNews?.title || "No recent headline available", detail: primaryNews ? `${primaryNews.source?.name || "Published source"} · source timestamp retained` : "News availability is shown honestly when the source feed is empty.", href: "/news" },
  ];

  return (
    <>
      <Nav active="/" />
      <Tracker event="page_view" payload={{ page: "home" }} />
      <main>
        <section className="container-px grid gap-10 pb-10 pt-12 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:pb-16 lg:pt-20">
          <div>
            <div className="eyebrow text-accent">Indian mutual fund research · evidence before claims</div>
            <h1 className="mt-5 max-w-3xl text-[2.65rem] font-semibold leading-[1.02] tracking-[-0.055em] text-ink sm:text-[3.6rem] lg:text-[4.25rem]">Understand Indian mutual funds beyond returns.</h1>
            <p className="measure mt-6 text-base leading-7 text-ink-muted sm:text-lg">Research funds, compare risk, follow market changes, connect news to portfolios, and understand what deserves your attention.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/funds" className="inline-flex min-h-11 items-center rounded-full bg-accent px-5 text-sm font-semibold text-white hover:bg-accent-soft">Research a fund</Link>
              <Link href="/compare" className="inline-flex min-h-11 items-center rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-ink hover:bg-surface-strong">Compare funds</Link>
              <Link href="/dashboard" className="inline-flex min-h-11 items-center rounded-full border border-line bg-transparent px-5 text-sm font-medium text-ink-muted hover:text-ink">Open my workspace</Link>
            </div>
            <Link href="/brief" className="mt-5 inline-flex text-sm font-medium text-accent hover:text-accent-soft">Read the Morning Brief →</Link>
          </div>
          <div className="research-surface-raised p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><div className="eyebrow">Start with a question</div><h2 className="mt-2 text-lg font-semibold text-ink">Search the research universe</h2></div><FreshnessBadge status={market.tone === "pos" ? "current" : market.tone === "warn" ? "delayed" : "stale"}>{asOf || "NAV unknown"}</FreshnessBadge></div>
            <div className="mt-5"><Search /></div>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line pt-5 text-center"><div><div className="financial-number text-lg font-semibold text-ink">{formatNumber(funds.length)}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">Schemes</div></div><div><div className="financial-number text-lg font-semibold text-ink">{amcCount}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">AMCs</div></div><div><div className="financial-number text-lg font-semibold text-ink">{benchmarkCount}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">Benchmarks</div></div></div>
          </div>
        </section>

        <div className="container-px"><ResearchStrip funds={funds} headlines={headlines} market={market} /></div>

        <section className="container-px py-14 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[.36fr_.64fr]"><div><div className="eyebrow">What changed today</div><h2 className="section-title mt-3">A short evidence-led market read.</h2><p className="mt-3 text-sm leading-6 text-ink-muted">Daily NAV measures and published news are shown separately so market movement is not confused with event context.</p><Link href="/brief" className="mt-5 inline-flex text-sm font-medium text-accent">Open the full brief →</Link></div><div className="divide-y divide-line rounded-2xl border border-line bg-surface">{changed.map((item) => <Link key={item.label} href={item.href} className="group grid gap-2 p-5 hover:bg-surface-2 sm:grid-cols-[150px_1fr_20px] sm:items-start"><div className="eyebrow pt-1">{item.label}</div><div><div className="text-sm font-semibold leading-snug text-ink">{item.value}</div><p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{item.detail}</p></div><span className="text-ink-faint group-hover:translate-x-1 group-hover:text-accent" aria-hidden="true">→</span></Link>)}</div></div>
        </section>

        <section className="border-y border-line bg-surface-2"><div className="container-px py-14 sm:py-20"><div className="flex flex-wrap items-end justify-between gap-5"><div><div className="eyebrow">What deserves attention</div><h2 className="section-title mt-3">Research suggestions, not recommendations.</h2></div><Link href="/dashboard" className="text-sm font-medium text-accent">Open research queue →</Link></div>{queue.length ? <div className="mt-8 grid gap-3 lg:grid-cols-2">{queue.map((item) => <article key={`${item.type}-${item.entity_id}`} className="research-surface p-5"><div className="flex items-center justify-between gap-4"><span className="rounded-full border border-confidence/30 bg-confidence/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-confidence">Rule-based signal</span><span className="financial-number text-xs text-ink-faint">{item.previous_value} → {item.current_value}</span></div><h3 className="mt-4 text-base font-semibold leading-snug text-ink">{item.title}</h3><p className="mt-2 text-[13px] leading-5 text-ink-muted">{item.why}</p><p className="mt-3 border-l-2 border-line-strong pl-3 text-xs leading-5 text-ink-faint">{item.context}</p><Link href={`/fund/${item.entity_id}`} className="mt-4 inline-flex text-sm font-medium text-accent">Investigate the fund →</Link></article>)}</div> : <DataGapNotice className="mt-8">The daily intelligence bundle contains no new research suggestions. MF Pulse does not fill an empty queue with fabricated insights.</DataGapNotice>}</div></section>

        <section className="container-px py-14 sm:py-20"><div className="max-w-2xl"><div className="eyebrow">What you can do</div><h2 className="section-title mt-3">Move from a question to traceable evidence.</h2></div><div className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">{WORKFLOWS.map((item) => <Link key={item.label} href={item.href} className="group min-h-[190px] bg-surface p-5 hover:bg-surface-2"><span className="financial-number text-xs text-ink-faint">{item.icon}</span><h3 className="mt-8 text-base font-semibold text-ink">{item.label}</h3><p className="mt-2 text-[13px] leading-5 text-ink-muted">{item.detail}</p><span className="mt-5 inline-flex text-sm text-accent group-hover:translate-x-1" aria-hidden="true">→</span></Link>)}</div></section>

        <section className="container-px pb-14 sm:pb-20"><div className="grid gap-8 lg:grid-cols-[.4fr_.6fr]"><div><div className="eyebrow">Research universe</div><h2 className="section-title mt-3">Capital flows through a connected evidence network.</h2><p className="mt-3 text-sm leading-6 text-ink-muted">Asset classes form the research clusters. AMC node size reflects the number of real scheme records connected to each cluster. This is a map of coverage—not a prediction or simulated live flow.</p><DataGapNotice title="How to read this view" className="mt-5">The network uses the current scheme bundle. It does not claim to visualize investor money movement or recommend an AMC.</DataGapNotice></div><div className="research-surface min-h-[360px] p-4"><KnowledgeGraphHero classes={graph.classes} amcs={graph.amcs} fundCount={funds.length} amcCount={amcCount} categoryCount={graph.classes.length} benchmarkCount={benchmarkCount} /></div></div></section>

        <section className="border-y border-line bg-surface-2"><div className="container-px py-14 sm:py-20"><div className="flex items-end justify-between gap-5"><div><div className="eyebrow">Personal workspace</div><h2 className="section-title mt-3">Continue where your research stopped.</h2></div><Link href="/dashboard" className="text-sm font-medium text-accent">Open workspace →</Link></div><div className="mt-8 grid gap-5 lg:grid-cols-2"><RecentActivity /><WatchlistIntelligence /></div></div></section>

        <section className="container-px py-14 sm:py-20"><div className="grid gap-8 lg:grid-cols-[.38fr_.62fr]"><div><div className="eyebrow">Why trust MF Pulse</div><h2 className="section-title mt-3">Confidence begins with visible limitations.</h2><p className="mt-3 text-sm leading-6 text-ink-muted">The product distinguishes source data, calculated measures, research suggestions and missing evidence.</p></div><div className="grid gap-3 sm:grid-cols-2">{[["Source-backed data","AMFI NAV records and attributed news sources remain visible."],["Transparent calculations","Ranks and signals expose the metric and observed change."],["Freshness timeline","Update dates are stated; daily NAV data is never described as live."],["Coverage disclosure","Missing metadata stays visible instead of being silently inferred."]].map(([title, detail]) => <div key={title} className="research-surface p-5"><h3 className="text-sm font-semibold text-ink">{title}</h3><p className="mt-2 text-[13px] leading-5 text-ink-muted">{detail}</p></div>)}</div></div></section>

        <section className="container-px pb-16"><div className="rounded-3xl border border-line bg-accent px-6 py-10 text-white sm:px-10 sm:py-12"><div className="max-w-2xl"><div className="text-xs font-medium uppercase tracking-[0.15em] text-white/65">Research first</div><h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">Build conviction from evidence, then seek professional guidance when needed.</h2><div className="mt-7 flex flex-wrap gap-3"><Link href="/funds" className="inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-accent">Start researching</Link><Link href="/advisor" className="inline-flex min-h-11 items-center rounded-full border border-white/35 px-5 text-sm font-medium text-white">Review with an advisor</Link></div></div></div></section>

        <section className="container-px pb-16"><AlertSignup /></section>
      </main>
      <Footer note={<span>Daily NAV intelligence from AMFI · latest available date: <b className="text-ink-muted">{asOf || "unavailable"}</b> · <Link href="/data-status" className="text-accent">Review data status →</Link></span>} />
    </>
  );
}
