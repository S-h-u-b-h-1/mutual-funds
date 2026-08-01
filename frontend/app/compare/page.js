import { sb } from "../lib/supabase";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ProductBreadcrumbs from "../components/ProductBreadcrumbs";
import CompareClient from "../components/CompareClient";
import CompareFundsClient from "../components/CompareFundsClient";
import AdvisorSoftCTA from "../components/AdvisorSoftCTA";
import ProvenanceDisclosure from "../components/ui/ProvenanceDisclosure";
import { getFund, allFunds, asOf } from "../lib/funds";
import { fundHealth } from "../lib/fundHealth";
import trendData from "../data/amc_trend.json";

export const metadata = { title: "Compare center" };
export const revalidate = 3600;

export default async function Compare({ searchParams }) {
  const fundsQuery = searchParams?.funds || "";
  const fundMode = searchParams?.mode === "funds" || Boolean(fundsQuery);
  const allFundsList = allFunds();
  
  if (fundMode) {
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

    return (
      <>
        <Nav active="/compare" />
        <main className="container-px py-10 sm:py-14">
          <ProductBreadcrumbs items={[["Mutual Funds", "/funds"], ["Compare", null]]} />
          <div className="eyebrow text-accent">Comparison research</div>
          <h1 className="page-title mt-3">Understand differences before choosing what to research next.</h1>
          <p className="measure mt-4 text-sm leading-6 text-ink-muted">Compare observed performance, risk, health, and data completeness. MF Pulse does not label one fund a universal winner.</p>
          <ProvenanceDisclosure className="mt-5" source="AMFI NAV history" sourceUrl="https://www.amfiindia.com" updatedAt={asOf} confidence="High" coverage={`${allFundsList.length.toLocaleString("en-IN")} scheme records available for selection`} freshness="Daily on trading days" methodology="Comparison metrics use the same deterministic return, risk, category-percentile and health-score functions as each fund page." limitations="A missing metric stays unavailable. Comparison describes evidence differences and is not a suitability decision." />
          <div className="mt-8">
            <CompareFundsClient initialFunds={initialFunds} />
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
      <main className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Mutual Funds", "/funds"], ["Compare", null]]} />
        <div className="eyebrow text-accent">AMC comparison</div>
        <h1 className="page-title mt-3">Compare fund houses in the same research frame.</h1>
        <p className="measure mt-4 text-sm leading-6 text-ink-muted">
          Compare AMCs side-by-side on 30-day equity performance, scheme mix, and breadth — from real
          AMFI NAV history.
        </p>
        <ProvenanceDisclosure className="mt-5" source="AMFI NAV history and latest scheme universe" sourceUrl="https://www.amfiindia.com" updatedAt={asOf} confidence="High" coverage={`${Object.keys(trendData.amcs).length} AMCs with 30-day trend series`} freshness="Daily on trading days" methodology="AMC comparison normalizes observed equity-fund NAV history and combines it with current scheme distribution." limitations="The public source does not include AMC-level AUM or qualitative corporate-governance ratings; those fields are not inferred." />
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
