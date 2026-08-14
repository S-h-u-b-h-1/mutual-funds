import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { companyResearchHref, getUniqueStockUniverse } from "../../lib/stocks/universe";
import { getOpenCompanyProfile } from "../../lib/stocks/researchProfiles";

export const metadata = { title: "Indian Stock Screener & Research Explorer — MF Pulse" };

const INDEX_FILTERS = [["all", "All covered companies"], ["NIFTY50", "NIFTY 50"], ["BSE100", "BSE 100"], ["both", "In both indices"]];

function filterCompanies(companies, { q = "", index = "all", industry = "all" }) {
  const needle = String(q).trim().toLowerCase();
  return companies.filter((company) => {
    const memberships = company.memberships.map((item) => item.key);
    const indexMatch = index === "all" || (index === "both" ? memberships.includes("NIFTY50") && memberships.includes("BSE100") : memberships.includes(index));
    const industryMatch = industry === "all" || company.industry === industry;
    const searchMatch = !needle || [company.name, company.nseSymbol, company.bseCode, company.isin, company.industry].filter(Boolean).some((value) => String(value).toLowerCase().includes(needle));
    return indexMatch && industryMatch && searchMatch;
  });
}

export default async function StockScreenerPage({ searchParams }) {
  const params = await searchParams;
  const companies = getUniqueStockUniverse();
  const industries = [...new Set(companies.map((company) => company.industry))].sort();
  const filters = { q: params?.q || "", index: params?.index || "all", industry: params?.industry || "all" };
  const results = filterCompanies(companies, filters);

  return <>
    <Nav active="/stocks/screener" />
    <main id="main-content" className="container-px py-10 sm:py-14">
      <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Screener", null]]} />
      <div className="eyebrow text-accent">Working research explorer</div>
      <h1 className="page-title mt-3 max-w-4xl">Find a company by index, industry or verified identifier.</h1>
      <p className="measure mt-4 text-sm leading-6 text-ink-muted">This screen searches the complete 100-company official universe now. Ratio screens will be activated only when normalized, comparable statements cover the required companies and periods.</p>

      <GlassPanel className="mt-8 p-5 sm:p-6">
        <form className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_220px_260px_auto]" action="/stocks/screener">
          <label className="sr-only" htmlFor="company-search">Search companies</label>
          <input id="company-search" name="q" defaultValue={filters.q} placeholder="Name, NSE symbol, BSE code or ISIN" className="min-h-12 rounded-xl border border-line bg-surface-2 px-4 text-sm text-ink outline-none focus:border-accent" />
          <label className="sr-only" htmlFor="index-filter">Index</label>
          <select id="index-filter" name="index" defaultValue={filters.index} className="min-h-12 rounded-xl border border-line bg-surface-2 px-4 text-sm text-ink outline-none focus:border-accent">{INDEX_FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <label className="sr-only" htmlFor="industry-filter">Industry</label>
          <select id="industry-filter" name="industry" defaultValue={filters.industry} className="min-h-12 rounded-xl border border-line bg-surface-2 px-4 text-sm text-ink outline-none focus:border-accent"><option value="all">All industries</option>{industries.map((industry) => <option key={industry} value={industry}>{industry}</option>)}</select>
          <button className="btn-premium-primary min-h-12" type="submit">Apply filters</button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">{INDEX_FILTERS.slice(1).map(([value, label]) => <Link key={value} href={`/stocks/screener?index=${value}`} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-accent hover:text-accent">{label}</Link>)}</div>
      </GlassPanel>

      <section className="mt-8">
        <SectionHeader eyebrow="Results" title={`${results.length} matching ${results.length === 1 ? "company" : "companies"}`} action={`${companies.length} covered`} />
        <div className="grid gap-3 lg:grid-cols-2">
          {results.map((company) => {
            const profile = getOpenCompanyProfile(company);
            return <Link key={company.isin || company.nseSymbol} href={companyResearchHref(company)} className="group rounded-2xl border border-line bg-surface p-5 shadow-glass transition hover:-translate-y-0.5 hover:border-accent/40">
              <div className="flex items-start justify-between gap-4"><div><h2 className="text-base font-semibold text-ink group-hover:text-accent">{company.name}</h2><p className="mt-1 font-mono text-[11px] text-accent">{company.nseSymbol || "NSE —"} · BSE {company.bseCode || "—"}</p></div><div className="flex flex-wrap justify-end gap-1">{company.memberships.map((membership) => <Badge key={membership.key} tone="neutral">{membership.key}</Badge>)}</div></div>
              <p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-muted">{profile.description}</p>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3"><span className="text-xs text-ink-faint">{company.industry}</span><span className="text-xs font-semibold text-accent">Open full study →</span></div>
            </Link>;
          })}
        </div>
        {!results.length && <GlassPanel className="p-8 text-center"><h2 className="text-lg font-semibold text-ink">No companies match these filters</h2><p className="mt-2 text-sm text-ink-muted">Try a broader index or industry, or clear the search phrase.</p><Link href="/stocks/screener" className="mt-4 inline-flex text-sm font-semibold text-accent">Reset filters →</Link></GlassPanel>}
      </section>

      <GlassPanel className="mt-8 border-missing/25 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-semibold text-ink">Why ROCE/P-E screens are not mixed into these results</div><p className="mt-1 text-xs leading-5 text-ink-muted">A blank metric is not zero, and banks cannot be compared with manufacturers using the same ratios. Financial screens will state coverage, period, formula and sector rules before ranking anything.</p></div><Badge tone="warn">Fundamentals ingestion pending</Badge></div></GlassPanel>
    </main>
    <Footer note={<span>Screening is discovery, not a recommendation. Verify the latest filings and suitability independently.</span>} />
  </>;
}
