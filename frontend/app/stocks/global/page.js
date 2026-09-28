import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge, { EmptyState } from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { getGlobalEquityUniverse } from "../../lib/fiscalAi/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Global Equities Research — MF Pulse" };

const compactUsd = (value) => value == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);

export default async function GlobalEquitiesPage({ searchParams }) {
  const params = await searchParams;
  const query = String(params?.q || "").trim();
  const country = String(params?.country || "").trim().toUpperCase();
  const sector = String(params?.sector || "").trim();
  let universe = { companies: [], pagination: { totalCount: 0 }, filters: { countries: [], sectors: [] } };
  let error = null;
  try {
    universe = await getGlobalEquityUniverse({ query, country, sector });
  } catch (caught) {
    error = caught?.message || "Global equities are temporarily unavailable.";
  }

  return (
    <>
      <Nav active="/stocks" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Global equities", null]]} />
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_360px]">
          <div>
            <div className="eyebrow text-accent">Fiscal.ai connected research</div>
            <h1 className="page-title mt-3 max-w-4xl">Global equities, with the source data kept visible.</h1>
            <p className="measure mt-4 text-sm leading-6 text-ink-muted">Explore every company authorized by the connected Fiscal.ai key. Each company report combines split-adjusted price history, standardized annual financials, ratios, and recent-news context when that dataset is available.</p>
          </div>
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Connected coverage" title={`${universe.pagination.totalCount || 0} companies`} />
            <div className="space-y-3 text-sm leading-6 text-ink-muted">
              <p><Badge tone="pos">Live API</Badge> Server-side access with cached responses; the credential is never sent to the browser.</p>
              <p><Badge tone="warn">Plan limit</Badge> This key currently authorizes 99 companies, not Fiscal.ai&apos;s complete 55,000+ catalogue.</p>
            </div>
          </GlassPanel>
        </section>

        <form action="/stocks/global" className="mt-8 grid gap-2 rounded-[1.4rem] border border-line bg-surface p-2 shadow-sm md:grid-cols-[minmax(0,1fr)_150px_230px_auto]" role="search">
          <label className="sr-only" htmlFor="global-search">Search global equities</label>
          <input id="global-search" name="q" defaultValue={query} className="min-h-12 min-w-0 rounded-2xl bg-transparent px-4 text-sm text-ink outline-none placeholder:text-ink-faint" placeholder="Company, ticker, exchange, sector…" />
          <select name="country" defaultValue={country} aria-label="Country" className="min-h-12 rounded-2xl border border-line bg-surface-2 px-3 text-sm text-ink">
            <option value="">All countries</option>
            {universe.filters.countries.map((code) => <option value={code} key={code}>{code}</option>)}
          </select>
          <select name="sector" defaultValue={sector} aria-label="Sector" className="min-h-12 rounded-2xl border border-line bg-surface-2 px-3 text-sm text-ink">
            <option value="">All sectors</option>
            {universe.filters.sectors.map((item) => <option value={item} key={item}>{item}</option>)}
          </select>
          <button className="min-h-12 rounded-full bg-ink px-5 text-sm font-semibold text-bg" type="submit">Explore</button>
        </form>

        <GlassPanel className="mt-6 overflow-hidden">
          <div className="p-5 pb-3">
            <SectionHeader eyebrow="Authorized universe" title={query || country || sector ? `${universe.companies.length} matches` : "Companies available now"} action="Fiscal.ai v3" />
          </div>
          {universe.companies.length ? (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[780px] text-left text-sm">
                <thead className="bg-surface-2 text-[10px] uppercase tracking-[0.1em] text-ink-faint">
                  <tr><th className="px-5 py-3">Company</th><th className="px-4 py-3">Market</th><th className="px-4 py-3">Sector</th><th className="px-4 py-3 text-right">Market cap</th><th className="px-5 py-3 text-right">Report</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {universe.companies.map((company) => (
                    <tr key={company.companyKey} className="hover:bg-surface-2/60">
                      <td className="px-5 py-3"><div className="font-semibold text-ink">{company.name}</div><div className="mt-1 font-mono text-[11px] text-ink-faint">{company.companyKey}</div></td>
                      <td className="px-4 py-3 text-ink-muted"><div>{company.listing.exchangeCode} · {company.listing.ticker}</div><div className="mt-1 text-[11px] text-ink-faint">{company.country || "Country unavailable"} · {company.listing.tradingCurrency || "—"}</div></td>
                      <td className="px-4 py-3 text-ink-muted">{company.sector || "Not classified"}</td>
                      <td className="px-4 py-3 text-right font-mono text-ink-muted">{compactUsd(company.marketCapUsd)}</td>
                      <td className="px-5 py-3 text-right"><Link className="text-xs font-semibold text-accent" href={`/stocks/global/${encodeURIComponent(company.companyKey)}`}>Open →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="border-t border-line p-5"><EmptyState icon="⌕" title={error ? "Fiscal.ai is unavailable" : "No matching company"} hint={error || "Try a broader name, ticker, country, or sector."} /></div>}
        </GlassPanel>
      </main>
      <Footer note={<span>Global-equity research is informational only. Coverage reflects the connected Fiscal.ai plan and is not an offer to trade.</span>} />
    </>
  );
}
