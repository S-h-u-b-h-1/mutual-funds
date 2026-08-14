import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { companyResearchHref, getStockIndustryGroups } from "../../lib/stocks/universe";
import { getIndustryResearchModel } from "../../lib/stocks/researchProfiles";

export const metadata = { title: "Indian Stock Sectors — Drivers, KPIs & Companies | MF Pulse" };

export default function StockSectorsPage() {
  const groups = getStockIndustryGroups();
  const sectors = Object.entries(groups).sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  return <>
    <Nav active="/stocks/sectors" />
    <main id="main-content" className="container-px py-10 sm:py-14">
      <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Sectors", null]]} />
      <div className="eyebrow text-accent">Sector intelligence map</div>
      <h1 className="page-title mt-3 max-w-4xl">Different businesses need different questions.</h1>
      <p className="measure mt-4 text-sm leading-6 text-ink-muted">Explore every covered company through its official index classification, then use sector-specific operating drivers, KPIs, risks and valuation lenses instead of applying one generic score.</p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[[sectors.length, "industry groups"], [Object.values(groups).flat().length, "covered companies"], [groups["Financial Services"]?.length || 0, "financial companies"], [groups["Information Technology"]?.length || 0, "technology companies"]].map(([value, label]) => <GlassPanel key={label} className="p-4"><div className="text-2xl font-semibold text-ink tnum">{value}</div><div className="mt-1 text-xs text-ink-muted">{label}</div></GlassPanel>)}
      </div>

      <section className="mt-10 grid gap-5 xl:grid-cols-2">
        {sectors.map(([industry, companies]) => {
          const model = getIndustryResearchModel(industry);
          return <GlassPanel key={industry} className="overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4"><div><Badge tone="accent">{companies.length} companies</Badge><h2 className="mt-3 text-xl font-semibold text-ink">{industry}</h2></div><Link href={`/stocks/screener?industry=${encodeURIComponent(industry)}`} className="shrink-0 text-xs font-semibold text-accent">Filter sector →</Link></div>
              <p className="mt-3 text-sm leading-6 text-ink-muted">{model.model}</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div><h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">What drives earnings</h3><ul className="mt-2 space-y-1.5">{model.drivers.map((item) => <li key={item} className="text-xs leading-5 text-ink-muted">• {item}</li>)}</ul></div>
                <div><h3 className="text-xs font-semibold uppercase tracking-wider text-ink-faint">KPIs to collect</h3><ul className="mt-2 space-y-1.5">{model.kpis.map((item) => <li key={item} className="text-xs leading-5 text-ink-muted">• {item}</li>)}</ul></div>
              </div>
            </div>
            <div className="border-t border-line bg-surface-2/50 p-4 sm:p-5">
              <SectionHeader eyebrow="Covered companies" title="Open a company study" action={`${companies.length} total`} />
              <div className="grid gap-2 sm:grid-cols-2">{companies.slice(0, 8).map((company) => <Link key={company.isin || company.nseSymbol} href={companyResearchHref(company)} className="rounded-xl border border-line bg-surface px-3 py-2.5 hover:border-accent/40"><div className="truncate text-xs font-semibold text-ink">{company.name}</div><div className="mt-1 font-mono text-[10px] text-accent">{company.nseSymbol || `BSE ${company.bseCode}`}</div></Link>)}</div>
              {companies.length > 8 && <Link href={`/stocks/screener?industry=${encodeURIComponent(industry)}`} className="mt-3 inline-flex text-xs font-semibold text-accent">View all {companies.length} companies →</Link>}
            </div>
          </GlassPanel>;
        })}
      </section>
    </main>
    <Footer note={<span>Industry classifications come from the dated official index snapshot. KPI frameworks guide evidence collection; they are not company scores.</span>} />
  </>;
}
