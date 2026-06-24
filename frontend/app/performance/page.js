import Nav from "../components/Nav";
import Footer from "../components/Footer";
import Tracker from "../components/Tracker";
import SectionHeader from "../components/ui/SectionHeader";
import DataTable from "../components/ui/DataTable";
import TrustBar from "../components/ui/TrustBar";
import Badge from "../components/ui/Badge";
import ExportCsv from "../components/ExportCsv";
import { toCsv } from "../lib/csv";
import performance from "../data/performance.json";

export const metadata = { title: "Fund Performance Intelligence" };

const WIN = [["r1w", "1W"], ["r1m", "1M"], ["r3m", "3M"], ["r6m", "6M"], ["r1y", "1Y"]];
const fmtPct = (v) => (v == null ? <span className="text-ink-faint">—</span> : <span className={v >= 0 ? "text-pos tnum" : "text-neg tnum"}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>);
const shortName = (n) => n.replace(/ - (Direct|Regular).*/i, "");

const fundCols = [
  { key: "rank", label: "#", muted: true, render: (r) => r._rank },
  { key: "name", label: "Fund", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/amc/${encodeURIComponent(r.amc + " Mutual Fund")}`}>{shortName(r.name)}<span className="block text-[11px] text-ink-faint">{r.amc} · {r.category}</span></a> },
  ...WIN.map(([k, l]) => ({ key: k, label: l, align: "right", render: (r) => fmtPct(r[k]) })),
];
const csvCols = [
  { key: "name", label: "Fund", get: (r) => shortName(r.name) },
  { key: "amc", label: "AMC" }, { key: "category", label: "Category" }, { key: "nav", label: "NAV" },
  ...WIN.map(([k, l]) => ({ key: k, label: `${l} return %` })),
];

const amcCols = [
  { key: "rank", label: "#", muted: true, render: (r) => r._rank },
  { key: "amc", label: "AMC", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/amc/${encodeURIComponent(r.amc + " Mutual Fund")}`}>{r.amc}</a> },
  { key: "funds", label: "Funds", align: "right", mono: true, muted: true },
  { key: "avg", label: "Avg 1M", align: "right", render: (r) => fmtPct(r.avg) },
  { key: "pct_outperform", label: "% beat cat.", align: "right", mono: true, render: (r) => `${r.pct_outperform.toFixed(0)}%` },
  { key: "score", label: "Quality", align: "right", render: (r) => <span className="font-semibold tnum text-ink">{r.score.toFixed(0)}</span> },
];

export default function Performance() {
  const topFunds = performance.top.map((r, i) => ({ ...r, _key: r.code, _rank: i + 1 }));
  const topAmcs = performance.amcs.slice(0, 15).map((r, i) => ({ ...r, _key: r.amc, _rank: i + 1 }));

  return (
    <>
      <Nav active="/research" />
      <Tracker event="performance_view" payload={{ page: "performance" }} />
      <main className="container-px py-10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Performance Intelligence</div>
        <h1 className="mt-2 text-[28px] sm:text-[34px] font-bold tracking-tightest text-ink">Equity fund performance</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          Real point-to-point NAV returns over 1W–1Y for {performance.universe.toLocaleString("en-IN")} equity
          <b className="text-ink"> Direct/Growth</b> plans. Every figure is a direct AMFI NAV calculation — no sample data.
        </p>
        <TrustBar asOf={performance.asOf} label="AMFI NAV" className="mt-3" sources={[{ label: "Universe", value: `${performance.universe} funds` }, { label: "Windows", value: "1W–1Y" }]} />

        {/* Auto research insights */}
        <section className="mt-7">
          <SectionHeader eyebrow="auto-generated · traceable to NAV" title="What the data says" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {performance.insights.map((t, i) => (
              <div key={i} className="glass p-4 text-[13.5px] leading-relaxed text-ink-muted"><span className="text-accent-soft">▸</span> {t}</div>
            ))}
          </div>
        </section>

        {/* Top performers, multi-window */}
        <section className="mt-9">
          <SectionHeader eyebrow="real NAV returns" title="Top performers" action={<div className="flex items-center gap-2"><Badge tone="pos" dot>live</Badge><ExportCsv csv={toCsv(performance.top, csvCols)} filename="mfpulse-top-funds.csv" report="top_funds" /></div>} />
          <DataTable columns={fundCols} rows={topFunds} footnote="Point-to-point NAV return per window. Source: AMFI NAV history." />
        </section>

        {/* AMC quality leaders */}
        <section className="mt-9">
          <SectionHeader eyebrow="% of funds beating category median (1M)" title="AMC quality leaders" action={<a className="hover:text-ink" href="/categories">Categories →</a>} />
          <DataTable columns={amcCols} rows={topAmcs} footnote="Quality = 0.55·(% beating category median) + 0.25·breadth + 0.20·avg-return factor. Real NAV, last month." />
        </section>
      </main>
      <Footer note={<span>Past performance is not indicative of future returns · not investment advice · source <a className="text-ink-muted hover:text-ink" href="https://www.amfiindia.com">AMFI</a>.</span>} />
    </>
  );
}
