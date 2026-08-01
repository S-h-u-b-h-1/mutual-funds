import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ProductBreadcrumbs from "../../components/ProductBreadcrumbs";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge, { EmptyState } from "../../components/ui/Badge";
import SectionHeader from "../../components/ui/SectionHeader";
import { listCommodities, getLatestCommodityPrice } from "../../lib/stocks/commodityService";

export const dynamic = "force-dynamic";

async function loadCommodities() {
  try {
    const commodities = await listCommodities();
    const rows = await Promise.all(commodities.map(async (commodity) => ({ ...commodity, latestPrice: await getLatestCommodityPrice(commodity.id) })));
    return { commodities: rows, error: null };
  } catch (error) {
    return { commodities: [], error: error?.message || "Commodity API unavailable." };
  }
}

function formatPrice(price) {
  if (!price) return "Price unavailable";
  return `${price.currency || "INR"} ${Number(price.price).toLocaleString("en-IN")} / ${price.unit}`;
}

export default async function RawMaterialsPage() {
  const { commodities, error } = await loadCommodities();
  return (
    <>
      <Nav active="/markets/raw-materials" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Markets", "/markets"], ["Raw materials", null]]} />
        <div className="eyebrow text-accent">Markets · Raw materials</div>
        <h1 className="page-title mt-3 max-w-4xl">Commodity context for stock research, only when sourced.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">
          This surface is ready for licensed or public commodity contracts. It will not claim BigMint or any other vendor feed is live until a real provider contract is connected and source metadata is present.
        </p>

        <section className="mt-8">
          <GlassPanel className="p-5">
            <SectionHeader eyebrow="Feed status" title="Commodity price coverage" action={commodities.length ? `${commodities.length} commodities` : "Awaiting data"} />
            {commodities.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <caption className="sr-only">Raw material price coverage with source, unit, location and date.</caption>
                  <thead className="border-y border-line bg-surface-2 text-left text-xs text-ink-faint">
                    <tr><th className="px-3 py-3">Commodity</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Price</th><th className="px-3 py-3">Location</th><th className="px-3 py-3">Date</th><th className="px-3 py-3">Source</th></tr>
                  </thead>
                  <tbody>
                    {commodities.map((commodity) => (
                      <tr key={commodity.id} className="border-b border-line">
                        <th className="px-3 py-3 text-left font-semibold text-ink">{commodity.name}</th>
                        <td className="px-3 py-3 text-ink-muted">{commodity.category}</td>
                        <td className="px-3 py-3 tnum text-ink-muted">{formatPrice(commodity.latestPrice)}</td>
                        <td className="px-3 py-3 text-ink-muted">{commodity.latestPrice?.location || "—"}</td>
                        <td className="px-3 py-3 text-ink-muted">{commodity.latestPrice?.assessmentDate || "—"}</td>
                        <td className="px-3 py-3 text-ink-muted">{commodity.latestPrice?.source || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="⛓️" title="No raw-material feed is connected yet" hint={error || "Expected contract: commodity, price, unit, location, date, trend and source. Until then this page stays explicitly unavailable."} />
            )}
            <div className="mt-5 rounded-2xl border border-warn/30 bg-warn/10 p-4 text-sm leading-6 text-ink-muted">
              <Badge tone="warn">No live-feed claim</Badge>
              <p className="mt-2">Company margin impact must not be inferred from commodity price movement alone. Pricing power, hedging, inventory timing and product mix require separate evidence.</p>
            </div>
          </GlassPanel>
        </section>
      </main>
      <Footer note={<span>Raw-material prices require source, unit, location and assessment date. Missing vendor contracts remain visible as unavailable.</span>} />
    </>
  );
}
