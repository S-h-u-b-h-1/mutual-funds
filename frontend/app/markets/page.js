import Link from "next/link";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import GlassPanel from "../components/ui/GlassPanel";
import Badge from "../components/ui/Badge";

export default function MarketsPage() {
  return (
    <>
      <Nav active="/markets" />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <div className="eyebrow text-accent">Markets</div>
        <h1 className="page-title mt-3 max-w-4xl">Market context without mixing research and execution.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">
          Markets is the cross-asset context layer for MF Pulse. It links mutual-fund market maps, news, signals and future raw-material intelligence while keeping Suasion Invest clearly mutual-fund execution.
        </p>
        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["Market Map", "Category and market movement context.", "/market-map", "Live route"],
            ["News", "Source-linked market updates.", "/news", "Research"],
            ["Signals", "Unusual movement investigation.", "/signals", "Discovery"],
            ["Raw Materials", "Commodity prices, units, location, trend and source when licensed/public feeds exist.", "/markets/raw-materials", "Data-gated"],
          ].map(([title, detail, href, status]) => (
            <Link key={title} href={href} className="premium-card p-5 transition hover:-translate-y-0.5 hover:border-accent/35">
              <div className="relative">
                <Badge tone={status === "Data-gated" ? "warn" : "accent"}>{status}</Badge>
                <h2 className="mt-4 text-base font-semibold text-ink">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">{detail}</p>
              </div>
            </Link>
          ))}
        </section>
      </main>
      <Footer note={<span>Market data surfaces disclose source and freshness. Missing feeds remain unavailable.</span>} />
    </>
  );
}
