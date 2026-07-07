import { sb } from "../lib/supabase";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import CompareClient from "../components/CompareClient";
import CompareFundsClient from "../components/CompareFundsClient";
import AdvisorSoftCTA from "../components/AdvisorSoftCTA";
import { getFund, allFunds } from "../lib/funds";
import { fundHealth } from "../lib/fundHealth";
import trendData from "../data/amc_trend.json";

export const metadata = { title: "Compare center" };
export const revalidate = 3600;

export default async function Compare({ searchParams }) {
  const fundsQuery = searchParams?.funds || "";
  
  if (fundsQuery) {
    const codes = fundsQuery.split(",").map(c => c.trim()).filter(Boolean);
    const initialFunds = codes.map(code => {
      const f = getFund(code);
      if (!f) return null;
      const h = fundHealth(f);
      return {
        ...f,
        _h: h?.overall ?? null,
        _g: h?.grade ?? null
      };
    }).filter(Boolean);

    const allFundsList = allFunds().map(f => {
      const h = fundHealth(f);
      return {
        code: f.code,
        name: f.name,
        amc: f.amc,
        category: f.category,
        plan: f.plan,
        isDirect: f.isDirect,
        r1m: f.r1m,
        r3m: f.r3m,
        r1y: f.r1y,
        vol90: f.vol90,
        maxdd90: f.maxdd90,
        consistency: f.consistency,
        _h: h?.overall ?? null,
        _g: h?.grade ?? null
      };
    });

    return (
      <>
        <Nav active="/compare" />
        <main className="container-px py-10">
          <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tightest text-ink">Fund Comparison Center</h1>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
            Compare mutual funds side-by-side on explainable diagnostics, peer returns, and risk metrics.
          </p>
          <div className="mt-8">
            <CompareFundsClient initialFunds={initialFunds} allFundsList={allFundsList} />
          </div>
          <p className="mt-6 text-right text-[11.5px] text-ink-faint">
            <a href="/compare" className="transition-colors hover:text-ink">Switch to AMC Comparison Center →</a>
          </p>
          <AdvisorSoftCTA context="compare" />
        </main>
        <Footer note={<span>Individual fund metrics calculated from real AMFI NAV history.</span>} />
      </>
    );
  }

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
        <p className="mt-4 text-right text-[11.5px] text-ink-faint">
          <a href="/research" className="transition-colors hover:text-ink">More reports &amp; analysis tools in the Research Hub →</a>
        </p>
        <AdvisorSoftCTA context="compare" />
      </main>
      <Footer note={<span>30-day equity index from real AMFI NAV history · scheme counts from latest AMFI data.</span>} />
    </>
  );
}
