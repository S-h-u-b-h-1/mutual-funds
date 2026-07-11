import { sb } from "../lib/supabase";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import SectionHeader from "../components/ui/SectionHeader";
import GlassPanel from "../components/ui/GlassPanel";
import StatStrip from "../components/ui/StatStrip";
import Badge from "../components/ui/Badge";
import performance from "../data/performance.json";

export const metadata = { title: "Data Quality" };
export const revalidate = 300;

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);

export default async function DataQuality() {
  let byClass = [];
  try {
    byClass = await sb("mv_asset_class_summary?select=*", { revalidate: 300 });
  } catch {}
  const totalSchemes = byClass.reduce((s, r) => s + Number(r.schemes), 0);
  const latestNav = byClass.map((r) => r.latest_nav_date).sort().at(-1) || "—";

  const datasets = [
    { name: "Scheme NAVs", source: "AMFI NAVAll (daily)", type: "real", freshness: `latest ${latestNav}`, coverage: `${fmt(totalSchemes)} schemes`, ok: true },
    { name: "30-day equity index", source: "AMFI NAV history", type: "real", freshness: "30-day window", coverage: "47 AMCs", ok: true },
    { name: "Fund performance (returns)", source: "AMFI NAV history", type: "real", freshness: `as of ${performance.asOf}`, coverage: `${fmt(performance.universe)} equity Growth funds`, ok: true },
    { name: "User events", source: "first-party (live)", type: "real", freshness: "real-time", coverage: "aggregate-only, PII-free", ok: true },
    { name: "Monthly net flows", source: "— (SEBI report is PDF-only)", type: "sample", freshness: "static", coverage: "7 AMCs, synthetic", ok: false },
    { name: "Flow signals", source: "derived from monthly flows", type: "sample", freshness: "static", coverage: "depends on sample flows", ok: false },
    { name: "Market brief / heatmap / network", source: "derived from monthly flows", type: "sample", freshness: "static", coverage: "illustrative", ok: false },
  ];
  const real = datasets.filter((d) => d.type === "real").length;
  const score = Math.round((real / datasets.length) * 100);

  return (
    <>
      <Nav active="/research" />
      <main className="container-px py-10 sm:py-14">
        <div className="eyebrow text-accent">Trust · Data quality report</div>
        <h1 className="page-title mt-3">Data quality</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          Full transparency on every dataset. <b className="text-pos">Real</b> data is sourced live from AMFI and
          recalculated daily. <b className="text-warn">Sample</b> data (monthly flows and everything derived from it)
          is clearly quarantined and labelled everywhere it appears — never presented as authoritative.
        </p>

        <div className="mt-6 max-w-3xl">
          <StatStrip
            items={[
              { label: "Real datasets", value: `${real} / ${datasets.length}`, tone: "pos" },
              { label: "Real-data coverage", value: `${score}%`, tone: score >= 50 ? "pos" : "neg" },
              { label: "NAV freshness", value: latestNav, sub: "AMFI · daily" },
              { label: "Sample (quarantined)", value: datasets.length - real, tone: "neg", sub: "labelled" },
            ]}
          />
        </div>

        <section className="mt-8">
          <SectionHeader eyebrow="source · freshness · lineage" title="Dataset classification" />
          <div className="overflow-x-auto rounded-xl border border-line bg-surface">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">
                  <th className="px-3.5 py-2.5 text-left">Dataset</th>
                  <th className="px-3.5 py-2.5 text-left">Source</th>
                  <th className="px-3.5 py-2.5 text-left">Type</th>
                  <th className="px-3.5 py-2.5 text-left">Freshness</th>
                  <th className="px-3.5 py-2.5 text-left">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {datasets.map((d) => (
                  <tr key={d.name} className="border-b border-line/60 last:border-0">
                    <td className="px-3.5 py-2.5 font-medium text-ink">{d.name}</td>
                    <td className="px-3.5 py-2.5 text-ink-muted">{d.source}</td>
                    <td className="px-3.5 py-2.5"><Badge tone={d.ok ? "pos" : "warn"} dot>{d.ok ? "real" : "sample"}</Badge></td>
                    <td className="px-3.5 py-2.5 text-ink-muted">{d.freshness}</td>
                    <td className="px-3.5 py-2.5 text-ink-muted">{d.coverage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <GlassPanel className="mt-8 max-w-3xl p-5 sm:p-6">
          <h2 className="text-[15px] font-semibold text-ink">Why flows are still sample</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-muted">
            SEBI/AMFI publish monthly net inflows/outflows only as PDF (no machine-readable endpoint — verified).
            The CSV and Excel ingestion loaders are built and tested; the moment one monthly export is connected,
            real flows replace the sample and every flow surface becomes authoritative. Until then we&rsquo;d rather
            label it honestly than overstate it.
          </p>
        </GlassPanel>
      </main>
      <Footer note={<span>Every displayed number traces to its source. <a className="text-ink-muted hover:text-ink" href="/methodology">Methodology →</a></span>} />
    </>
  );
}
