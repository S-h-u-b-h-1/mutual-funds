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
import { getArticlesForEntity, relativeTime } from "../../lib/news";

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  return { title: `${decodeURIComponent(params.category)} funds` };
}

const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (v) => (v == null ? <span className="text-ink-faint">—</span> : <span className={v >= 0 ? "text-pos tnum" : "text-neg tnum"}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>);

const cols = [
  { key: "rank", label: "#", muted: true, render: (r) => r._rank },
  { key: "name", label: "Fund", render: (r) => (
    <>
      <a className="text-ink hover:text-accent-soft" href={`/fund/${r.code}`}>{short(r.name)}</a>
      <span className="block text-[11px] text-ink-faint">
        <a className="hover:text-ink-muted" href={`/amc/${encodeURIComponent(r.amc + " Mutual Fund")}`}>{r.amc}</a> · {r.plan}
      </span>
    </>
  ) },
  { key: "health", label: "Health", align: "right", render: (r) => <HealthCell score={r._h} grade={r._g} tone={r._h != null ? gradeTone(r._g) : null} /> },
  { key: "r1m", label: "1M", align: "right", render: (r) => pct(r.r1m) },
  { key: "r1y", label: "1Y", align: "right", render: (r) => pct(r.r1y) },
  { key: "vol90", label: "Vol", align: "right", render: (r) => (r.vol90 == null ? <span className="text-ink-faint">—</span> : <span className="tnum text-ink-muted">{r.vol90}</span>) },
];

export default async function CategoryDetail({ params }) {
  const category = decodeURIComponent(params.category);
  const funds = allFunds()
    .filter((f) => f.category === category && f.isGrowth && !f.isIdcw && f.assetClass === "Equity" && f.r1m != null)
    .map((f) => { const h = fundHealth(f); return { ...f, _h: h?.overall ?? null, _g: h?.grade ?? null }; })
    .sort((a, b) => b.r1m - a.r1m);
  if (!funds.length) notFound();

  const news = await getArticlesForEntity({ entityType: "category", entityName: category, limit: 3 });

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
      <main className="container-px py-10 sm:py-14">
        <div className="eyebrow text-accent"><a className="hover:text-ink" href="/categories">Categories</a> · {category}</div>
        <h1 className="page-title mt-3">{category}</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          {funds.length} equity Growth funds · momentum is <b className="text-ink">{momentum}</b> ({improving} improving / {weakening} weakening) · risk is <b className="text-ink">{riskLevel.toLowerCase()}</b>. Real AMFI NAV, as of {asOf}.
        </p>

        <div className="mt-5 max-w-3xl">
          <StatStrip items={[
            { label: "Funds", value: funds.length },
            { label: "Avg 1M", value: `${avg >= 0 ? "+" : ""}${avg.toFixed(2)}%`, tone: avg >= 0 ? "pos" : "neg" },
            { label: "Median 1M", value: `${med >= 0 ? "+" : ""}${med.toFixed(2)}%` },
            { label: "Breadth", value: `${breadth}%`, sub: "positive", tip: "Share of funds in this category with a positive 1-month return — a quick read on how broadly the category is participating, not just its average." },
            { label: "Avg health", value: avgHealth ?? "—", sub: "0–100", tip: "Average of each fund's Health Score — a blend of performance vs. peers, risk, consistency, category rank, data quality and cost. Higher is better; see any fund's page for its own breakdown." },
            { label: "Risk level", value: riskLevel, sub: avgVol ? `${avgVol.toFixed(0)}% vol` : "", tip: "Based on average 90-day annualised volatility across the category's funds: Low <12%, Moderate 12–20%, High 20–30%, Very high >30%." },
          ]} />
        </div>

        <section className="mt-7">
          <SectionHeader eyebrow="ranked by 1-month NAV return" title="Funds in this category" action={<Badge tone="pos" dot>real NAV</Badge>} />
          <DataTable columns={cols} rows={rows} footnote={`Equity Growth plans. Health = MF Pulse Fund Health Score. Source: AMFI. As of ${asOf}.`} />
        </section>

        {news.length > 0 && (
          <section className="mt-9">
            <SectionHeader eyebrow="rule-based market-relevance links" title="Recent news relevant to this category" action={<a className="hover:text-ink" href="/news">See all news →</a>} />
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              {news.map((n) => (
                <a key={n.id} href={n.url} target="_blank" rel="noopener noreferrer" className="glass block p-3.5 text-[12.5px] transition-colors hover:bg-surface-strong">
                  <div className="text-ink-faint">{n.source?.name || "Unknown source"} · {relativeTime(n.publishedAt)}</div>
                  <div className="mt-1 font-medium text-ink">{n.title}</div>
                </a>
              ))}
            </div>
          </section>
        )}

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
