import { sb } from "../lib/supabase";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import CompareClient from "../components/CompareClient";
import AdvisorSoftCTA from "../components/AdvisorSoftCTA";
import trendData from "../data/amc_trend.json";

export const metadata = { title: "Compare AMCs" };
export const revalidate = 3600;

export default async function Compare() {
  let summary = [];
  try {
    summary = await sb("mv_amc_summary?select=*", { revalidate: 3600 });
  } catch {}

  const meta = {};
  for (const r of summary) {
    const m = (meta[r.amc_name] ||= { total: 0, equity: 0, _cls: new Set() });
    m.total += Number(r.schemes);
    if (r.asset_class === "Equity") m.equity += Number(r.schemes);
    m._cls.add(r.asset_class);
  }
  for (const m of Object.values(meta)) {
    m.classes = m._cls.size;
    delete m._cls;
  }

  return (
    <>
      <Nav active="/compare" />
      <main className="container-px py-10">
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tightest text-ink">AMC Comparison Center</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          Compare AMCs side-by-side on 30-day equity performance, scheme mix, and breadth — from real
          AMFI NAV history.
        </p>
        <div className="mt-8">
          <CompareClient amcs={trendData.amcs} meta={meta} />
        </div>
        <AdvisorSoftCTA context="compare" />
      </main>
      <Footer note={<span>30-day equity index from real AMFI NAV history · scheme counts from latest AMFI data.</span>} />
    </>
  );
}
