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

export const metadata = { title: "Category Intelligence" };

const pct = (v) => <span className={v >= 0 ? "text-pos tnum" : "text-neg tnum"}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>;
const short = (n) => n.replace(/ - (Direct|Regular).*/i, "");

const cols = [
  { key: "rank", label: "#", muted: true, render: (r) => r._rank },
  { key: "category", label: "Category", render: (r) => <a className="font-medium text-ink hover:text-accent-soft" href={`/categories/${encodeURIComponent(r.category)}`}>{r.category}</a> },
  { key: "count", label: "Funds", align: "right", mono: true, muted: true },
  { key: "avg", label: "Avg 1M", align: "right", render: (r) => pct(r.avg) },
  { key: "breadth", label: "Breadth", align: "right", mono: true, render: (r) => `${r.breadth.toFixed(0)}%` },
  { key: "best", label: "Best fund", render: (r) => <span className="text-[12px]"><a className="text-ink hover:text-accent-soft" href={`/fund/${r.best.code}`}>{short(r.best.name).slice(0, 34)}</a> <span className="text-pos">+{r.best.ret.toFixed(1)}%</span></span> },
];

const csvCols = [
  { key: "category", label: "Category" }, { key: "count", label: "Funds" }, { key: "avg", label: "Avg 1M %" },
  { key: "breadth", label: "Breadth %" }, { key: "best", label: "Best fund", get: (r) => `${short(r.best.name)} (+${r.best.ret}%)` },
];

export default function Categories() {
  const rows = performance.categories.map((c, i) => ({ ...c, _key: c.category, _rank: i + 1 }));
  const lead = performance.categories[0];

  return (
    <>
      <Nav active="/categories" />
      <Tracker event="category_view" payload={{ page: "categories" }} />
      <main className="container-px py-10">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Category Intelligence</div>
        <h1 className="mt-2 text-[28px] sm:text-[34px] font-bold tracking-tightest text-ink">Which categories are leading?</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-muted">
          One-month NAV performance by equity category across {performance.universe.toLocaleString("en-IN")} Direct/Growth
          funds. {lead && <><b className="text-pos">{lead.category}</b> leads at +{lead.avg.toFixed(1)}%.</>} Real AMFI NAV.
        </p>
        <TrustBar asOf={performance.asOf} label="AMFI NAV" className="mt-3" sources={[{ label: "Categories", value: `${performance.categories.length}` }, { label: "Window", value: "1 month" }]} />

        <section className="mt-8">
          <SectionHeader eyebrow="ranked by 1-month avg NAV return" title="Category leaderboard" action={<div className="flex items-center gap-2"><Badge tone="pos" dot>live</Badge><ExportCsv csv={toCsv(performance.categories, csvCols)} filename="mfpulse-categories.csv" report="categories" /></div>} />
          <DataTable columns={cols} rows={rows} footnote="Avg = mean 1-month NAV return of the category's equity Growth funds. Breadth = % with positive returns. Source: AMFI." />
        </section>
      </main>
      <Footer note={<span>Not investment advice · category mapping from AMFI scheme classification · source AMFI.</span>} />
    </>
  );
}
