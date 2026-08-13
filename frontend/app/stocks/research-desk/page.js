import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge, { EmptyState } from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { FREE_RESEARCH_LANES } from "../../lib/stocks/evidenceFramework";
import { getRecentArticles, relativeTime } from "../../lib/news";
import { getIndexUniverse, getStockUniverseSummary, STOCK_INDEX_KEYS } from "../../lib/stocks/universe";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock Research Desk — MF Pulse", description: "Sourced Indian company, sector and regulatory intelligence with explicit evidence boundaries." };

function universeBreakdown() {
  const seen = new Set();
  const companies = STOCK_INDEX_KEYS.flatMap((key) => getIndexUniverse(key).constituents).filter((company) => {
    const id = company.isin || company.nseSymbol || company.bseCode || company.name;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const industries = Object.entries(companies.reduce((map, company) => {
    map[company.industry] = (map[company.industry] || 0) + 1;
    return map;
  }, {})).sort((a, b) => b[1] - a[1]);
  return { companies, industries };
}

const relevantCategories = new Set(["earnings", "corporate", "sector", "market_moving", "macro", "rbi", "sebi"]);

export default async function StockResearchDeskPage() {
  const [articles, summary] = await Promise.all([getRecentArticles({ limit: 100 }), Promise.resolve(getStockUniverseSummary())]);
  const { companies, industries } = universeBreakdown();
  const researchNews = articles.filter((article) => relevantCategories.has(article.category)).slice(0, 14);
  const officialNews = articles.filter((article) => article.source?.credibility === "official").slice(0, 6);
  const latestPublished = researchNews.map((item) => item.publishedAt).filter(Boolean).sort().at(-1) || null;

  return <>
    <Nav active="/stocks" />
    <main id="main-content" className="container-px py-10 sm:py-14">
      <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Research desk", null]]} />
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_360px]">
        <div><div className="eyebrow text-accent">Free-source intelligence</div><h1 className="page-title mt-3 max-w-4xl">Follow evidence, not a flashing price ticker.</h1><p className="measure mt-4 text-sm leading-6 text-ink-muted">A focused desk for company developments, earnings context, regulation and sector signals. Every item keeps its publisher and original destination; primary filings outrank commentary.</p><div className="mt-6 flex flex-wrap gap-3"><Link href="/stocks/universe" className="btn-premium-primary">Choose a company</Link><Link href="/stocks/sources" className="btn-premium-secondary">Inspect every source</Link></div></div>
        <GlassPanel className="p-5"><SectionHeader eyebrow="Coverage now" title={`${companies.length} unique companies`} /><div className="grid grid-cols-2 gap-2">{[[summary.records, "Index records"], [industries.length, "Industry labels"], [researchNews.length, "Recent signals"], [latestPublished ? relativeTime(latestPublished) : "—", "Latest item"]].map(([value, label]) => <div key={label} className="rounded-2xl bg-surface-2 p-3"><div className="financial-number text-base font-semibold text-ink">{value}</div><div className="mt-1 text-[10px] text-ink-faint">{label}</div></div>)}</div><p className="mt-3 text-[11px] leading-5 text-ink-faint">A news signal is not a verified company fact until checked against the original filing.</p></GlassPanel>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-5">{FREE_RESEARCH_LANES.map(([question, evidence, cadence], index) => <GlassPanel key={question} className="p-4"><div className="text-[10px] font-semibold text-accent">0{index + 1}</div><h2 className="mt-2 text-sm font-semibold text-ink">{question}</h2><p className="mt-2 text-xs leading-5 text-ink-muted">{evidence}</p><div className="mt-3 text-[10px] text-ink-faint">{cadence}</div></GlassPanel>)}</section>

      <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <GlassPanel className="p-5"><SectionHeader eyebrow="Company and market context" title="Latest sourced developments" action={researchNews.length ? `${researchNews.length} shown` : "Awaiting feed"} />{researchNews.length ? <div className="divide-y divide-line">{researchNews.map((article) => <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer" className="block py-4"><div className="flex flex-wrap items-center gap-2"><Badge tone={article.source?.credibility === "official" ? "pos" : "neutral"}>{article.category || "news"}</Badge><span className="text-[10px] text-ink-faint">{article.source?.name || "Source unavailable"} · {relativeTime(article.publishedAt)}</span></div><h3 className="mt-2 text-sm font-semibold leading-6 text-ink hover:text-accent">{article.title}</h3>{article.summary && <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-muted">{article.summary}</p>}</a>)}</div> : <EmptyState icon="◌" title="No current feed items available" hint="The desk fails closed when the source database is unavailable; it does not generate substitute headlines." />}</GlassPanel>

        <div className="space-y-6"><GlassPanel className="p-5"><SectionHeader eyebrow="Primary-source lane" title="Regulatory releases" />{officialNews.length ? <div className="space-y-3">{officialNews.map((article) => <a key={article.id} href={article.url} target="_blank" rel="noopener noreferrer" className="block rounded-2xl bg-surface-2 p-3"><div className="text-[10px] font-semibold text-accent">{article.source?.name} · {relativeTime(article.publishedAt)}</div><div className="mt-2 text-xs font-semibold leading-5 text-ink">{article.title}</div></a>)}</div> : <p className="text-xs leading-5 text-ink-muted">No recent SEBI or RBI release is available in the current feed window.</p>}</GlassPanel>
        <GlassPanel className="p-5"><SectionHeader eyebrow="Universe map" title="Largest industry groups" /><div className="space-y-3">{industries.slice(0, 8).map(([industry, count]) => <Link key={industry} href={`/stocks/universe?q=${encodeURIComponent(industry)}`} className="flex items-center justify-between gap-3 text-xs"><span className="text-ink-muted hover:text-accent">{industry}</span><span className="financial-number rounded-full bg-surface-2 px-2 py-1 text-ink">{count}</span></Link>)}</div></GlassPanel></div>
      </section>

      <GlassPanel className="mt-8 p-5 sm:p-6"><SectionHeader eyebrow="Collection boundary" title="What remains intentionally separate" /><div className="grid gap-4 text-sm leading-6 text-ink-muted md:grid-cols-3"><p><span className="font-semibold text-ink">Market chart:</span> TradingView embed only; MF Pulse does not copy or redistribute its quote.</p><p><span className="font-semibold text-ink">Company facts:</span> extracted only from filings and company documents with period, unit and source attached.</p><p><span className="font-semibold text-ink">Conclusions:</span> strengths, risks and strategy verdicts remain unavailable where evidence coverage is incomplete.</p></div></GlassPanel>
    </main>
    <Footer note={<span>News and filings support research; they are not recommendations, price targets or guarantees of completeness.</span>} />
  </>;
}
