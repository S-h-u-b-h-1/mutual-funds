import Link from "next/link";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Search from "./components/Search";
import Tracker from "./components/Tracker";
import AlertSignup from "./components/AlertSignup";
import KnowledgeGraphHero from "./components/KnowledgeGraphHero";
import FreshnessBadge from "./components/ui/FreshnessBadge";
import DataGapNotice from "./components/ui/DataGapNotice";
import { allFunds, asOf } from "./lib/funds";
import { graphNodes } from "./lib/graphNodes";
import { getTopHeadlines } from "./lib/news";
import { marketStatus } from "./lib/marketStatus";
import daily from "./data/daily.json";

const inr = new Intl.NumberFormat("en-IN");
const pct = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const formatNumber = (value) => inr.format(Number(value || 0));
const formatPercent = (value) => `${pct.format(Number(value || 0))}%`;
const shortName = (name = "") => name.replace(/ - (Direct|Regular).*/i, "").replace(/\s+/g, " ").trim();
const freshnessTone = (tone) => (tone === "pos" ? "current" : tone === "neg" ? "stale" : "delayed");

const VALUE_PROPS = [
  ["Research over ranking", "Fund movement, category context, news, gaps and caveats are visible before any conclusion."],
  ["Every action routes", "Primary CTAs open real product paths: search, compare, portfolio, queue, news or data status."],
  ["No fake live claims", "Daily NAV dates, source timestamps and missing-data states stay exposed."],
  ["Workspace continuity", "Watchlists, notes and comparisons keep users inside the same research thread."],
];

const WORKFLOWS = [
  { label: "Research funds", detail: "Study return, risk, benchmark, AMC and data-quality evidence.", href: "/funds" },
  { label: "Compare", detail: "Compare funds without forcing a false universal winner.", href: "/compare" },
  { label: "Portfolio review", detail: "Run deterministic portfolio intelligence on actual holdings.", href: "/portfolio" },
  { label: "Market brief", detail: "Read what changed in the current daily bundle.", href: "/brief" },
  { label: "Research queue", detail: "Inspect rule-based attention flags and their context.", href: "/dashboard" },
  { label: "News impact", detail: "Connect published financial events to research areas.", href: "/news" },
];

function SectionIntro({ eyebrow, title, detail, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl">
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.04em] text-ink sm:text-3xl">{title}</h2>
        {detail && <p className="mt-3 text-sm leading-6 text-ink-muted">{detail}</p>}
      </div>
      {action}
    </div>
  );
}

function MarketSnapshot({ funds, headlines, market, amcCount, benchmarkCount }) {
  const latestNews = headlines[0]?.publishedAt || headlines[0]?.published_at || null;
  const items = [
    ["Latest NAV", asOf || "Unavailable", "AMFI daily bundle"],
    ["Schemes", formatNumber(funds.length), "Current research universe"],
    ["AMCs", formatNumber(amcCount), "Fund houses covered"],
    ["Benchmarks", formatNumber(benchmarkCount), "Benchmark labels detected"],
    ["News update", latestNews ? new Date(latestNews).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Unavailable", "Source timestamp retained"],
    ["Session", market.sessionLabel, "Clock-derived status"],
  ];

  return (
    <section aria-label="Market snapshot" className="container-px -mt-6 relative z-10">
      <div className="grid overflow-hidden rounded-[1.6rem] border border-line/80 bg-surface shadow-float sm:grid-cols-2 lg:grid-cols-6">
        {items.map(([label, value, note]) => (
          <div key={label} className="border-b border-line/70 p-4 last:border-0 sm:border-r lg:border-b-0">
            <div className="eyebrow">{label}</div>
            <div className="mt-2 financial-number text-base font-semibold text-ink">{value}</div>
            <div className="mt-1 text-[11px] leading-snug text-ink-faint">{note}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function StoryRow({ item }) {
  return (
    <Link href={item.href} className="group grid gap-3 p-5 transition hover:bg-surface-2 sm:grid-cols-[150px_1fr_24px] sm:items-start">
      <div className="eyebrow pt-1">{item.label}</div>
      <div>
        <div className="text-sm font-semibold leading-snug text-ink">{item.value}</div>
        <p className="mt-1.5 text-[13px] leading-5 text-ink-muted">{item.detail}</p>
      </div>
      <span className="text-ink-faint transition group-hover:translate-x-1 group-hover:text-accent" aria-hidden="true">→</span>
    </Link>
  );
}

function OpportunityCard({ fund, index }) {
  return (
    <Link href={`/fund/${fund.code}`} className="group premium-card p-5 transition-spring hover:-translate-y-1 hover:border-accent/35">
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full border border-accent/25 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">#{index + 1} attention</span>
          <span className="financial-number rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-pos">{formatPercent(fund.r1m)} 1M</span>
        </div>
        <h3 className="mt-5 text-base font-semibold leading-snug text-ink">{shortName(fund.name)}</h3>
        <p className="mt-2 text-[13px] leading-5 text-ink-muted">{fund.category || "Uncategorised"} · {fund.amc || "AMC unavailable"}</p>
        <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-4 text-xs">
          <span className="text-ink-faint">1D movement</span>
          <span className="financial-number font-semibold text-ink">{formatPercent(fund.r1d)}</span>
        </div>
        <span className="premium-link mt-5">Open fund research <span aria-hidden="true">→</span></span>
      </div>
    </Link>
  );
}

function QueueCard({ item }) {
  return (
    <article className="premium-card p-5">
      <div className="relative">
        <div className="flex items-center justify-between gap-4">
          <span className="rounded-full border border-confidence/30 bg-confidence/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-confidence">Rule-based signal</span>
          <span className="financial-number text-xs text-ink-faint">{item.previous_value} → {item.current_value}</span>
        </div>
        <h3 className="mt-4 text-base font-semibold leading-snug text-ink">{item.title}</h3>
        <p className="mt-2 text-[13px] leading-5 text-ink-muted">{item.why || item.what}</p>
        <p className="mt-3 border-l-2 border-line-strong pl-3 text-xs leading-5 text-ink-faint">{item.context}</p>
        <Link href={item.entity_id ? `/fund/${item.entity_id}` : "/funds"} className="premium-link mt-4">Investigate <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}

function NewsCard({ headline, featured = false }) {
  const published = headline?.publishedAt || headline?.published_at;
  return (
    <Link href={headline?.url || "/news"} className={`group block rounded-[1.4rem] border border-line/80 bg-surface p-5 transition-spring hover:-translate-y-0.5 hover:border-accent/35 hover:bg-surface-2 ${featured ? "lg:row-span-2" : ""}`}>
      <div className="eyebrow">{headline?.source?.name || "News source"}</div>
      <h3 className={`${featured ? "mt-5 text-xl" : "mt-3 text-base"} font-semibold leading-tight tracking-[-0.025em] text-ink`}>{headline?.title || "No recent headline available"}</h3>
      {headline?.description && <p className="mt-3 line-clamp-4 text-[13px] leading-5 text-ink-muted">{headline.description}</p>}
      <div className="mt-5 flex items-center justify-between gap-3 text-xs text-ink-faint">
        <span>{published ? new Date(published).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Timestamp unavailable"}</span>
        <span className="transition group-hover:translate-x-1 group-hover:text-accent" aria-hidden="true">→</span>
      </div>
    </Link>
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
  const opportunities = (daily.gainers || []).slice(0, 4);
  const topCategories = graph.classes.slice(0, 6);
  const primaryNews = headlines[0];
  const story = [
    { label: "Breadth", value: `${formatNumber(daily.advancers)} advancing · ${formatNumber(daily.decliners)} declining`, detail: `${formatPercent(daily.breadth1d)} of tracked schemes advanced in the latest daily calculation bundle.`, href: "/brief" },
    { label: "Category", value: daily.topCategory || "Unavailable", detail: daily.topCategory ? `${daily.topCategory} leads the current category summary in the calculated bundle.` : "No category summary is available for this update.", href: "/categories" },
    { label: "AMC", value: daily.topAmc || "Unavailable", detail: daily.topAmc ? `${daily.topAmc} leads the current AMC summary in the calculated bundle.` : "No AMC summary is available for this update.", href: "/amc" },
    { label: "News context", value: primaryNews?.title || "No recent headline available", detail: primaryNews ? `${primaryNews.source?.name || "Published source"} · source timestamp retained` : "News availability is shown honestly when the source feed is empty.", href: "/news" },
  ];

  return (
    <>
      <Nav active="/" />
      <Tracker event="page_view" payload={{ page: "home" }} />
      <main>
        <section className="relative overflow-hidden pb-14 pt-12 sm:pt-16 lg:pb-20 lg:pt-20">
          <div className="absolute left-1/2 top-4 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
          <div className="container-px relative grid gap-8 lg:grid-cols-[1.04fr_.96fr] lg:items-center">
            <div className="reveal-card">
              <div className="inline-flex items-center gap-2 rounded-full border border-line/80 bg-surface/80 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint shadow-sm backdrop-blur-xl">
                <span className="h-2 w-2 rounded-full bg-pos" aria-hidden="true" />
                Indian mutual fund intelligence
              </div>
              <h1 className="mt-6 max-w-4xl text-[3rem] font-semibold leading-[0.98] tracking-[-0.07em] text-ink sm:text-[4.3rem] lg:text-[5.35rem]">A research terminal for mutual fund conviction.</h1>
              <p className="measure mt-6 text-base leading-7 text-ink-muted sm:text-lg">MF Pulse turns daily NAV data, fund metadata, research queues and market news into a premium decision workspace — without hiding source dates or data gaps.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/funds" className="btn-premium-primary">Research funds</Link>
                <Link href="/compare" className="btn-premium-secondary">Compare funds</Link>
                <Link href="/portfolio" className="btn-premium-secondary">Review portfolio</Link>
              </div>
              <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-ink-faint">
                <FreshnessBadge status={freshnessTone(market.tone)} timestamp={asOf}>{market.navLine}</FreshnessBadge>
                <span>{market.sessionLabel}</span>
                <Link href="/data-status" className="font-semibold text-accent">Data status →</Link>
              </div>
            </div>

            <div className="premium-card animate-float-soft p-4 sm:p-6">
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div><div className="eyebrow">Command search</div><h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-ink">Start anywhere in the research universe.</h2></div>
                  <span className="rounded-full bg-accent/10 px-3 py-1 text-[11px] font-semibold text-accent">⌘K</span>
                </div>
                <div className="mt-5"><Search /></div>
                <div className="mt-6 grid grid-cols-3 gap-2 border-t border-line/70 pt-5 text-center">
                  <div><div className="financial-number text-lg font-semibold text-ink">{formatNumber(funds.length)}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">Schemes</div></div>
                  <div><div className="financial-number text-lg font-semibold text-ink">{formatNumber(amcCount)}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">AMCs</div></div>
                  <div><div className="financial-number text-lg font-semibold text-ink">{formatNumber(benchmarkCount)}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-ink-faint">Benchmarks</div></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <MarketSnapshot funds={funds} headlines={headlines} market={market} amcCount={amcCount} benchmarkCount={benchmarkCount} />

        <section className="container-px py-16 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[.34fr_.66fr]">
            <SectionIntro eyebrow="Today’s investment story" title="A short, evidence-led read of what changed." detail="NAV movement, category context and headlines are separated so users do not confuse daily calculations with live money-flow claims." action={<Link href="/brief" className="premium-link">Open brief <span aria-hidden="true">→</span></Link>} />
            <div className="divide-y divide-line/70 overflow-hidden rounded-[1.6rem] border border-line/80 bg-surface shadow-glass">{story.map((item) => <StoryRow key={item.label} item={item} />)}</div>
          </div>
        </section>

        <section className="border-y border-line/80 bg-surface-2/80">
          <div className="container-px py-16 sm:py-20">
            <SectionIntro eyebrow="Why MF Pulse" title="Built for serious research, not dopamine ranking." detail="The interface behaves like a product shell: clear destinations, consistent cards, honest freshness, responsive actions and visible limitations." />
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {VALUE_PROPS.map(([title, detail], index) => (
                <article key={title} className="premium-card p-5 reveal-card" style={{ animationDelay: `${index * 70}ms` }}>
                  <div className="relative"><span className="financial-number text-xs text-ink-faint">0{index + 1}</span><h3 className="mt-8 text-base font-semibold text-ink">{title}</h3><p className="mt-2 text-[13px] leading-5 text-ink-muted">{detail}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="container-px py-16 sm:py-20">
          <SectionIntro eyebrow="Top opportunities" title="Funds drawing attention in the latest bundle." detail="Movement-led research prompts, not buy recommendations. Each card opens the fund evidence page." action={<Link href="/funds" className="premium-link">View all funds <span aria-hidden="true">→</span></Link>} />
          {opportunities.length ? <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{opportunities.map((fund, index) => <OpportunityCard key={fund.code} fund={fund} index={index} />)}</div> : <DataGapNotice className="mt-8">The current daily bundle has no opportunity list. MF Pulse does not fabricate ranking cards.</DataGapNotice>}
        </section>

        <section className="container-px pb-16 sm:pb-20">
          <SectionIntro eyebrow="Research queue" title="Rule-based signals with context attached." detail="Attention cards explain the observed metric change and route to the relevant fund page." action={<Link href="/dashboard" className="premium-link">Open dashboard <span aria-hidden="true">→</span></Link>} />
          {queue.length ? <div className="mt-8 grid gap-4 lg:grid-cols-2">{queue.map((item) => <QueueCard key={`${item.type}-${item.entity_id}`} item={item} />)}</div> : <DataGapNotice className="mt-8">The daily intelligence bundle contains no new research suggestions.</DataGapNotice>}
        </section>

        <section className="container-px pb-16 sm:pb-20">
          <div className="overflow-hidden rounded-[2rem] border border-line/80 bg-ink text-bg shadow-float">
            <div className="grid gap-8 p-6 sm:p-10 lg:grid-cols-[.58fr_.42fr] lg:items-center">
              <div><div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bg/55">Portfolio CTA</div><h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">Move from fund research to portfolio-level understanding.</h2><p className="mt-4 max-w-2xl text-sm leading-6 text-bg/70">Upload or enter holdings, then use the existing deterministic intelligence layer to inspect overlap, allocation, concentration and rebalance context.</p></div>
              <div className="flex flex-wrap gap-3 lg:justify-end"><Link href="/portfolio" className="btn-premium bg-bg text-ink hover:-translate-y-0.5 hover:bg-white">Review portfolio</Link><Link href="/methodology" className="btn-premium border border-bg/25 text-bg hover:-translate-y-0.5 hover:bg-bg/10">Read methodology</Link></div>
            </div>
          </div>
        </section>

        <section className="border-y border-line/80 bg-surface-2/80">
          <div className="container-px py-16 sm:py-20">
            <SectionIntro eyebrow="News intelligence" title="Published headlines, routed into research context." detail="News remains attributed and timestamped; the homepage does not convert headlines into unsupported predictions." action={<Link href="/news" className="premium-link">Open news desk <span aria-hidden="true">→</span></Link>} />
            {headlines.length ? <div className="mt-8 grid gap-4 lg:grid-cols-3">{headlines.slice(0, 5).map((headline, index) => <NewsCard key={headline.url || headline.title} headline={headline} featured={index === 0} />)}</div> : <DataGapNotice className="mt-8">No recent headlines are available from the source feed right now.</DataGapNotice>}
          </div>
        </section>

        <section className="container-px py-16 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[.38fr_.62fr]">
            <div>
              <SectionIntro eyebrow="Categories" title="Coverage graph, not a simulated flow chart." detail="The graph is computed from current scheme metadata. Node size reflects real fund counts; it does not invent inflow or outflow amounts." action={<Link href="/categories" className="premium-link">Browse categories <span aria-hidden="true">→</span></Link>} />
              <div className="mt-6 grid gap-2">
                {topCategories.map((category) => (
                  <Link key={category.name} href={`/categories/${encodeURIComponent(category.name)}`} className="flex items-center justify-between rounded-2xl border border-line/70 bg-surface px-4 py-3 text-sm transition hover:border-accent/35 hover:bg-surface-2"><span className="font-semibold text-ink">{category.name}</span><span className="financial-number text-ink-faint">{formatNumber(category.count)} funds</span></Link>
                ))}
              </div>
            </div>
            <div className="premium-card min-h-[390px] p-4"><div className="relative"><KnowledgeGraphHero classes={graph.classes} amcs={graph.amcs} fundCount={funds.length} amcCount={amcCount} categoryCount={graph.classes.length} benchmarkCount={benchmarkCount} /></div></div>
          </div>
        </section>

        <section className="container-px pb-16 sm:pb-20">
          <SectionIntro eyebrow="Research workflows" title="Every primary button now opens a real product path." detail="This section doubles as a button audit surface: each card is a link to a working route, not a decorative CTA." />
          <div className="mt-8 grid gap-px overflow-hidden rounded-[1.6rem] border border-line/80 bg-line sm:grid-cols-2 lg:grid-cols-3">
            {WORKFLOWS.map((item, index) => (
              <Link key={item.label} href={item.href} className="group min-h-[180px] bg-surface p-5 transition hover:bg-surface-2"><span className="financial-number text-xs text-ink-faint">0{index + 1}</span><h3 className="mt-8 text-base font-semibold text-ink">{item.label}</h3><p className="mt-2 text-[13px] leading-5 text-ink-muted">{item.detail}</p><span className="mt-5 inline-flex text-sm text-accent transition group-hover:translate-x-1" aria-hidden="true">→</span></Link>
            ))}
          </div>
        </section>

        <section className="container-px pb-16 sm:pb-20">
          <div className="grid gap-8 lg:grid-cols-[.38fr_.62fr]">
            <SectionIntro eyebrow="Trust layer" title="Premium means restraint, not decoration." detail="Freshness, limitations, source separation and accessible controls are part of the interface, not footnotes." />
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Source-backed data", "AMFI NAV records and attributed news timestamps remain visible."],
                ["Transparent calculations", "Ranks and signals expose the metric and observed change."],
                ["Freshness timeline", "Daily NAV data is dated; session labels are clearly clock-derived."],
                ["No invented flows", "Where inflow/outflow data is unavailable, the UI says so instead of showing false numbers."],
              ].map(([title, detail]) => (
                <div key={title} className="premium-card p-5"><div className="relative"><h3 className="text-sm font-semibold text-ink">{title}</h3><p className="mt-2 text-[13px] leading-5 text-ink-muted">{detail}</p></div></div>
              ))}
            </div>
          </div>
        </section>

        <section className="container-px pb-16"><AlertSignup /></section>
      </main>
      <Footer note={<span>Daily NAV intelligence from AMFI · latest available date: <b className="text-ink-muted">{asOf || "unavailable"}</b> · <Link href="/data-status" className="text-accent">Review data status →</Link></span>} />
    </>
  );
}
