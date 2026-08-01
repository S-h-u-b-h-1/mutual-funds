import Link from "next/link";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge, { EmptyState } from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { listSectors, getSectorAggregates, getSectorOperatingMetricTemplate, getSectorCompanies } from "../../lib/stocks/sectors";

export const dynamic = "force-dynamic";

async function loadSectors() {
  try {
    const sectors = await listSectors();
    const enriched = await Promise.all(sectors.map(async (sector) => ({
      ...sector,
      aggregates: await getSectorAggregates(sector.id),
      metricTemplate: await getSectorOperatingMetricTemplate(sector.id),
      companies: await getSectorCompanies(sector.id),
    })));
    return { sectors: enriched, error: null };
  } catch (error) {
    return { sectors: [], error: error?.message || "Sector API unavailable." };
  }
}

export default async function StockSectorsPage() {
  const { sectors, error } = await loadSectors();
  return (
    <>
      <Nav active="/stocks/sectors" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Stocks", "/stocks"], ["Sectors", null]]} />
        <div className="eyebrow text-accent">Stock sectors</div>
        <h1 className="page-title mt-3 max-w-4xl">Move from a sector to companies, operating metrics and source evidence.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">
          Sector pages are designed for sector-specific metrics. Banks should not look like cement companies; raw-material and operating metrics appear only when sourced.
        </p>

        <section className="mt-8">
          {sectors.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sectors.map((sector) => (
                <GlassPanel key={sector.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Badge tone="accent">{sector.slug}</Badge>
                      <h2 className="mt-3 text-lg font-semibold text-ink">{sector.name}</h2>
                    </div>
                    <span className="tnum text-sm text-ink-faint">{sector.aggregates.companyCount} companies</span>
                  </div>
                  {sector.description && <p className="mt-3 text-sm leading-6 text-ink-muted">{sector.description}</p>}
                  <div className="mt-4 grid gap-2 text-xs text-ink-muted">
                    <div className="rounded-xl bg-surface-2 p-3">{sector.aggregates.companiesWithValuationSnapshot} companies with valuation snapshots</div>
                    <div className="rounded-xl bg-surface-2 p-3">{sector.metricTemplate.length} sector-specific operating metrics defined</div>
                  </div>
                  <SectionHeader eyebrow="Companies" title="Available rows" action={sector.companies.length ? `${sector.companies.length}` : "None"} />
                  {sector.companies.length ? (
                    <div className="mt-3 grid gap-2">
                      {sector.companies.slice(0, 5).map((company) => (
                        <Link key={company.id} href={`/stocks/${company.id}`} className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-semibold text-ink-muted hover:text-accent">{company.display_name}</Link>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-ink-faint">No companies have been mapped to this sector yet.</p>
                  )}
                </GlassPanel>
              ))}
            </div>
          ) : (
            <EmptyState icon="🏭" title="No sector contracts are populated yet" hint={error || "Sector → companies → metrics will appear after backend ingestion."} />
          )}
        </section>
      </main>
      <Footer note={<span>Sector metrics are contract-driven and source-gated. Missing metrics are not replaced with generic tables.</span>} />
    </>
  );
}
