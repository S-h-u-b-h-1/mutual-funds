import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Tracker from "../components/Tracker";
import SectionHeader from "../components/ui/SectionHeader";
import DataTable from "../components/ui/DataTable";
import ProvenanceDisclosure from "../components/ui/ProvenanceDisclosure";
import { allFunds, asOf } from "../lib/funds";

export const metadata = { title: "AMCs — MF Pulse" };
export const revalidate = 3600;

export default function AmcIndex() {
  const funds = allFunds();
  const byAmc = {};
  for (const f of funds) {
    if (!f.amc) continue;
    const a = (byAmc[f.amc] ||= { amc: f.amc, total: 0, equity: 0, debt: 0, hybrid: 0 });
    a.total++;
    if (f.assetClass === "Equity") a.equity++;
    if (f.assetClass === "Debt") a.debt++;
    if (f.assetClass === "Hybrid") a.hybrid++;
  }
  const rows = Object.values(byAmc).sort((a, b) => b.total - a.total).map((r, i) => ({ ...r, _rank: i + 1, _key: r.amc }));

  const cols = [
    { key: "rank", label: "#", muted: true, render: (r) => r._rank },
    { key: "amc", label: "AMC", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/amc/${encodeURIComponent(r.amc + " Mutual Fund")}`}>{r.amc}</a> },
    { key: "total", label: "Schemes", align: "right", mono: true },
    { key: "equity", label: "Equity", align: "right", mono: true, muted: true },
    { key: "debt", label: "Debt", align: "right", mono: true, muted: true },
    { key: "hybrid", label: "Hybrid", align: "right", mono: true, muted: true },
  ];

  return (
    <>
      <Nav active="/amc" />
      <Tracker event="page_view" payload={{ page: "amc_index" }} />
      <main className="container-px py-10 sm:py-14">
        <div className="eyebrow text-accent">Explore AMCs · {asOf}</div>
        <h1 className="page-title mt-3">Research every fund house in one frame.</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          {rows.length} AMCs, real scheme counts from AMFI. Open any AMC for its performance score,
          peer rank, and category strength — or use{" "}
          <a className="text-ink underline underline-offset-2 hover:text-accent-soft" href="/performance">AMC quality rankings</a> for a 1-month leaderboard.
        </p>
        <ProvenanceDisclosure className="mt-5" source="AMFI NAV universe" sourceUrl="https://www.amfiindia.com" updatedAt={asOf} confidence="High" coverage={`${rows.length} AMCs · ${funds.length.toLocaleString("en-IN")} schemes`} freshness="Daily on trading days" methodology="Scheme counts and asset-class distribution come from the generated AMFI universe. AMC scores on detail pages are deterministic and disclose their components." limitations="Public AMFI data does not provide AMC-level assets under management or organization-quality ratings; MF Pulse does not infer them." />
        <section className="mt-7">
          <SectionHeader eyebrow="sorted by total schemes" title="AMCs" />
          <DataTable columns={cols} rows={rows} footnote={`Scheme counts from AMFI NAV universe, as of ${asOf}. Click an AMC for full intelligence.`} />
        </section>
      </main>
      <Footer note={<span>{rows.length} AMCs · {funds.length.toLocaleString("en-IN")} schemes tracked · source AMFI, as of {asOf}.</span>} />
    </>
  );
}
