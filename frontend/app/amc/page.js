import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Tracker from "../components/Tracker";
import SectionHeader from "../components/ui/SectionHeader";
import DataTable from "../components/ui/DataTable";
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
      <main className="container-px py-8 sm:py-10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Explore AMCs · {asOf}</div>
        <h1 className="mt-2 text-[26px] sm:text-[32px] font-bold tracking-tightest text-ink">Every fund house in one place</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          {rows.length} AMCs, real scheme counts from AMFI. Open any AMC for its performance score,
          peer rank, and category strength — or use{" "}
          <a className="text-ink underline underline-offset-2 hover:text-accent-soft" href="/performance">AMC quality rankings</a> for a 1-month leaderboard.
        </p>
        <section className="mt-7">
          <SectionHeader eyebrow="sorted by total schemes" title="AMCs" />
          <DataTable columns={cols} rows={rows} footnote={`Scheme counts from AMFI NAV universe, as of ${asOf}. Click an AMC for full intelligence.`} />
        </section>
      </main>
      <Footer note={<span>{rows.length} AMCs · {funds.length.toLocaleString("en-IN")} schemes tracked · source AMFI, as of {asOf}.</span>} />
    </>
  );
}
