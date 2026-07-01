import { notFound } from "next/navigation";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import Tracker from "../../components/Tracker";
import SectionHeader from "../../components/ui/SectionHeader";
import DataTable from "../../components/ui/DataTable";
import StatStrip from "../../components/ui/StatStrip";
import Badge from "../../components/ui/Badge";
import HealthCell from "../../components/ui/HealthCell";
import NextActions from "../../components/NextActions";
import { allFunds, asOf } from "../../lib/funds";
import { fundHealth, gradeTone } from "../../lib/fundHealth";
import { short } from "../../lib/format";

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  return { title: `${decodeURIComponent(params.category)} funds` };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (v) => (v == null ? <span className="text-ink-faint">—</span> : <span className={v >= 0 ? "text-pos tnum" : "text-neg tnum"}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>);

const cols = [
  { key: "rank", label: "#", muted: true, render: (r) => r._rank },
  { key: "name", label: "Fund", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/fund/${r.code}`}>{short(r.name)}<span className="block text-[11px] text-ink-faint">{r.amc} · {r.plan}</span></a> },
  { key: "health", label: "Health", align: "right", render: (r) => <HealthCell score={r._h} grade={r._g} tone={r._h != null ? gradeTone(r._g) : null} /> },
  { key: "r1m", label: "1M", align: "right", render: (r) => pct(r.r1m) },
  { key: "r1y", label: "1Y", align: "right", render: (r) => pct(r.r1y) },
  { key: "vol90", label: "Vol", align: "right", render: (r) => (r.vol90 == null ? <span className="text-ink-faint">—</span> : <span className="tnum text-ink-muted">{r.vol90}</span>) },
];

export default function CategoryDetail({ params }) {
  const category = decodeURIComponent(params.category);
  const funds = allFunds()
    .filter((f) => f.category === category && f.isGrowth && !f.isIdcw && f.assetClass === "Equity" && f.r1m != null)
    .map((f) => { const h = fundHealth(f); return { ...f, _h: h?.overall ?? null, _g: h?.grade ?? null }; })
    .sort((a, b) => b.r1m - a.r1m);
  if (!funds.length) notFound();

  const rets = funds.map((f) => f.r1m);
  const avg = rets.reduce((s, v) => s + v, 0) / rets.length;
  const med = median(rets);
  const breadth = Math.round((100 * rets.filter((v) => v > 0).length) / rets.length);
  const healths = funds.map((f) => f._h).filter((v) => v != null);
  const avgHealth = healths.length ? Math.round(healths.reduce((s, v) => s + v, 0) / healths.length) : null;
  const improving = funds.filter((f) => f.trend != null && f.trend >= 60).length;
  const weakening = funds.filter((f) => f.trend != null && f.trend <= 40).length;
  const vols = funds.map((f) => f.vol90).filter((v) => v != null);
  const avgVol = vols.length ? vols.reduce((s, v) => s + v, 0) / vols.length : null;
  const riskLevel = avgVol == null ? "—" : avgVol < 12 ? "Low" : avgVol < 20 ? "Moderate" : avgVol < 30 ? "High" : "Very high";
  const momentum = improving > weakening ? "improving" : improving < weakening ? "fading" : "mixed";
  const rows = funds.map((f, i) => ({ ...f, _key: f.code, _rank: i + 1 }));

  return (
    <>
      <Nav active="/categories" />
      <Tracker event="category_view" payload={{ category, funds: funds.length }} view={{ type: "category", id: category, name: category }} />
      <main className="container-px py-9">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint"><a className="hover:text-ink" href="/categories">Categories</a> · {category}</div>
        <h1 className="mt-2 text-[28px] sm:text-[32px] font-bold tracking-tightest text-ink">{category}</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          {funds.length} equity Growth funds · momentum is <b className="text-ink">{momentum}</b> ({improving} improving / {weakening} weakening) · risk is <b className="text-ink">{riskLevel.toLowerCase()}</b>. Real AMFI NAV, as of {asOf}.
        </p>

        <div className="mt-5 max-w-3xl">
          <StatStrip items={[
            { label: "Funds", value: funds.length },
            { label: "Avg 1M", value: `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`, tone: avg >= 0 ? "pos" : "neg" },
            { label: "Median 1M", value: `${med >= 0 ? "+" : ""}${med.toFixed(2)}%` },
            { label: "Breadth", value: `${breadth}%`, sub: "positive" },
            { label: "Avg health", value: avgHealth ?? "—", sub: "0–100" },
            { label: "Risk level", value: riskLevel, sub: avgVol ? `${avgVol.toFixed(0)}% vol` : "" },
          ]} />
        </div>

        <section className="mt-7">
          <SectionHeader eyebrow="ranked by 1-month NAV return" title="Funds in this category" action={<Badge tone="pos" dot>real NAV</Badge>} />
          <DataTable columns={cols} rows={rows} footnote={`Equity Growth plans. Health = MF Pulse Fund Health Score. Source: AMFI. As of ${asOf}.`} />
        </section>

        <NextActions items={[
          { label: "AMC quality leaders", href: "/performance" },
          { label: "All categories", href: "/categories" },
          { label: "Full fund screener", href: "/funds" },
          { label: "Today's market brief", href: "/brief" },
        ]} />
      </main>
      <Footer />
    </>
  );
}
