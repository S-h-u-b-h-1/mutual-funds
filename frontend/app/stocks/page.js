import Link from "next/link";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ProductBreadcrumbs from "../components/ProductBreadcrumbs";
import GlassPanel from "../components/ui/GlassPanel";
import Badge, { EmptyState } from "../components/ui/Badge";
import SectionHeader from "../components/ui/SectionHeader";
import { listCompaniesBySector, searchCompanies } from "../lib/stocks/companyService";
import { EXAMPLE_SCREENS } from "../lib/stocks/screener";

export const dynamic = "force-dynamic";

async function safeCompanies(query) {
  try {
    const cleanQuery = String(query || "").trim();
    return { companies: cleanQuery ? await searchCompanies(cleanQuery, { limit: 12 }) : await listCompaniesBySector({ limit: 8 }), error: null, query: cleanQuery };
  } catch (error) {
    return { companies: [], error: error?.message || "Stock company API unavailable.", query: String(query || "").trim() };
  }
}

const workflows = [
  ["Research a company", "Start with business, sector, financial quality and source freshness before reading valuation.", "/stocks", "Research"],
  ["Open the research desk", "Track sourced company, sector and regulatory developments without mixing news with primary evidence.", "/stocks/research-desk", "Live evidence"],
  ["Explore the universe", "Browse the current official NIFTY 50 and BSE 100 constituent snapshots with identifiers.", "/stocks/universe", "150 records"],
  ["Open the strategy lab", "Study quality, valuation, earnings, resilience, cyclical and cash-yield frameworks with explicit rejection rules.", "/stocks/strategies", "6 playbooks"],
  ["Run a screen", "Use backend filters for ROCE, debt, growth, cash flow and dividends. Missing metrics do not pass silently.", "/stocks/screener", "Discover"],
  ["Study sectors", "Move from sector to companies, operating metrics, raw-material exposures and relevant events.", "/stocks/sectors", "Sectors"],
  ["Build a thesis", "Use private notes for thesis, risks, catalysts, valuation, management and open questions.", "/learn/stocks#thesis", "Learn"],
  ["Inspect the sources", "See which exchange, company, regulator and publisher channels are active, ready or licence-gated.", "/stocks/sources", "Evidence"],
];

const learning = [
  ["How to research a company", "Business model → unit economics → financials → management → valuation → risks."],
  ["How to read annual reports", "Read the narrative and notes before treating headline ratios as truth."],
  ["How to track risks", "Separate temporary volatility from business, governance, balance-sheet and commodity risks."],
];

const highlightedScreens = ["highRoce", "lowDebtToEquity", "strongSalesGrowth", "cashFlowGenerators", "qualityAndSafe", "dividendStocks"];

export default async function StocksHome({ searchParams }) {
  const params = await searchParams;
  const { companies, error, query } = await safeCompanies(params?.q);
  const screens = highlightedScreens.map((key) => [key, EXAMPLE_SCREENS[key]]).filter(([, screen]) => screen);

  return (
    <>
      <Nav active="/stocks" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Stocks", null]]} />
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div>
            <div className="eyebrow text-accent">Stocks research</div>
            <h1 className="page-title mt-3 max-w-4xl">Research Indian companies without turning MF Pulse into a stock broker.</h1>
            <p className="measure mt-4 text-sm leading-6 text-ink-muted">
              Stocks is a separate research, discovery, portfolio-intelligence, watchlist and learning product area. No buy/sell/order controls are exposed because no stock execution backend exists.
            </p>
            <form action="/stocks" className="mt-7 flex max-w-2xl flex-col gap-2 rounded-[1.4rem] border border-line bg-surface p-2 shadow-sm sm:flex-row" role="search">
              <label className="sr-only" htmlFor="stock-search">Search companies</label>
              <input id="stock-search" name="q" defaultValue={query} className="min-h-12 flex-1 rounded-2xl bg-transparent px-4 text-sm text-ink outline-none placeholder:text-ink-faint" placeholder="Search company, ticker, ISIN…" />
              <button className="min-h-12 rounded-full bg-ink px-5 text-sm font-semibold text-bg" type="submit">Search</button>
            </form>
            <Link href="/stocks/demo" className="mt-3 inline-flex text-sm font-semibold text-accent">View the interactive stock-analysis demo →</Link>
          </div>
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Product boundary" title="What Stocks can do today" />
            <div className="grid gap-3 text-sm text-ink-muted">
              <div className="rounded-2xl bg-surface-2 p-4"><Badge tone="accent">Research</Badge><p className="mt-2">Company pages, screens, sectors, learning and private notes.</p></div>
              <div className="rounded-2xl bg-surface-2 p-4"><Badge tone="neutral">No trading</Badge><p className="mt-2">No Buy, Sell, Place Order, SIP, pledge or broker execution language.</p></div>
              <div className="rounded-2xl bg-surface-2 p-4"><Badge tone="warn">Data-gated</Badge><p className="mt-2">Missing financial, price, commodity or event contracts show unavailable states.</p></div>
            </div>
          </GlassPanel>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {workflows.map(([title, detail, href, tag]) => (
            <Link key={title} href={href} className="premium-card p-5 transition hover:-translate-y-0.5 hover:border-accent/35">
              <div className="relative">
                <Badge tone="accent">{tag}</Badge>
                <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
              </div>
            </Link>
          ))}
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Company discovery" title={query ? `Search results for “${query}”` : "Available company universe"} action={companies.length ? `${companies.length} shown` : "Contract-driven"} />
            {companies.length ? (
              <div className="divide-y divide-line">
                {companies.map((company) => (
                  <Link key={company.id} href={`/stocks/${company.id}`} className="flex items-center justify-between gap-4 py-3 text-sm hover:text-accent">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{company.displayName}</span>
                      <span className="mt-0.5 block text-xs text-ink-faint">{company.nseSymbol || company.bseCode || company.isin || "Identifier pending"}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-faint">Open →</span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon="🏢" title="No public company rows are available yet" hint={error || "Once Claude's company universe is populated, this section will list real companies."} />
            )}
          </GlassPanel>

          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Common screens" title="Start with a question" />
            <div className="grid gap-3">
              {screens.map(([key, screen]) => (
                <Link key={key} href={`/stocks/screener?screen=${key}`} className="rounded-2xl border border-line bg-surface-2 p-4 transition hover:border-accent/35">
                  <div className="text-sm font-semibold text-ink">{screen.label}</div>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">{screen.description}</p>
                </Link>
              ))}
            </div>
          </GlassPanel>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-3">
          {learning.map(([title, detail]) => (
            <GlassPanel key={title} className="p-5">
              <div className="eyebrow">Learn in context</div>
              <h2 className="mt-2 text-base font-semibold text-ink">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
            </GlassPanel>
          ))}
        </section>
      </main>
      <Footer note={<span>Stocks research is informational only. MF Pulse does not provide stock execution or recommendations.</span>} />
    </>
  );
}
