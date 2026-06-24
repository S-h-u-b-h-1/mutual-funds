import { notFound } from "next/navigation";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import Tracker from "../../components/Tracker";
import SectionHeader from "../../components/ui/SectionHeader";
import DataTable from "../../components/ui/DataTable";
import StatStrip from "../../components/ui/StatStrip";
import Badge from "../../components/ui/Badge";
import { allFunds, asOf } from "../../lib/funds";

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  return { title: `${decodeURIComponent(params.category)} funds` };
}

const pct = (v) => (v == null ? <span className="text-ink-faint">—</span> : <span className={v >= 0 ? "text-pos tnum" : "text-neg tnum"}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>);
const short = (n) => n.replace(/ - (Direct|Regular).*/i, "");

const cols = [
  { key: "rank", label: "#", muted: true, render: (r) => r._rank },
  { key: "name", label: "Fund", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/fund/${r.code}`}>{short(r.name)}<span className="block text-[11px] text-ink-faint">{r.amc} · {r.plan}</span></a> },
  { key: "r1m", label: "1M", align: "right", render: (r) => pct(r.r1m) },
  { key: "r6m", label: "6M", align: "right", render: (r) => pct(r.r6m) },
  { key: "r1y", label: "1Y", align: "right", render: (r) => pct(r.r1y) },
];

export default function CategoryDetail({ params }) {
  const category = decodeURIComponent(params.category);
  const funds = allFunds()
    .filter((f) => f.category === category && f.isGrowth && !f.isIdcw && f.assetClass === "Equity" && f.r1m != null)
    .sort((a, b) => b.r1m - a.r1m);
  if (!funds.length) notFound();

  const rets = funds.map((f) => f.r1m);
  const avg = rets.reduce((s, v) => s + v, 0) / rets.length;
  const breadth = Math.round((100 * rets.filter((v) => v > 0).length) / rets.length);
  const rows = funds.map((f, i) => ({ ...f, _key: f.code, _rank: i + 1 }));

  return (
    <>
      <Nav active="/categories" />
      <Tracker event="category_view" payload={{ category }} />
      <main className="container-px py-9">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint"><a className="hover:text-ink" href="/categories">Categories</a> · {category}</div>
        <h1 className="mt-2 text-[28px] sm:text-[32px] font-bold tracking-tightest text-ink">{category}</h1>
        <p className="mt-2 text-[14px] text-ink-muted">{funds.length} equity Growth funds · 1-month NAV performance · as of {asOf}.</p>

        <div className="mt-5 max-w-2xl">
          <StatStrip items={[
            { label: "Funds", value: funds.length },
            { label: "Avg 1M", value: `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`, tone: avg >= 0 ? "pos" : "neg" },
            { label: "Breadth", value: `${breadth}%`, sub: "positive" },
            { label: "Leader 1M", value: `+${funds[0].r1m.toFixed(1)}%`, tone: "pos", sub: funds[0].amc },
          ]} />
        </div>

        <section className="mt-7">
          <SectionHeader eyebrow="ranked by 1-month NAV return" title="Funds in this category" action={<Badge tone="pos" dot>real NAV</Badge>} />
          <DataTable columns={cols} rows={rows} footnote={`Equity Growth plans. Direct & Regular shown together here; fund pages rank them separately. Source: AMFI. As of ${asOf}.`} />
        </section>
      </main>
      <Footer />
    </>
  );
}
