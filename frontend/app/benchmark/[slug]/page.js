import { notFound } from "next/navigation";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import Tracker from "../../components/Tracker";
import SectionHeader from "../../components/ui/SectionHeader";
import DataTable from "../../components/ui/DataTable";
import StatStrip from "../../components/ui/StatStrip";
import Badge from "../../components/ui/Badge";
import HealthCell from "../../components/ui/HealthCell";
import { getBenchmark, getFund, asOf } from "../../lib/funds";
import { canonicalKey, canonicalName } from "../../lib/canonical";
import { fundHealth, gradeTone } from "../../lib/fundHealth";
import { short } from "../../lib/format";

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const b = getBenchmark(params.slug);
  return { title: b ? `${b.name} — Benchmark` : "Benchmark" };
}

const pct = (v) => (v == null ? <span className="text-ink-faint">—</span> : <span className={v >= 0 ? "text-pos tnum" : "text-neg tnum"}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>);

const cols = [
  { key: "name", label: "Fund", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/fund/${r.code}`}>{short(r.name)}<span className="block text-[11px] text-ink-faint">{r.amc} · {r.category}</span></a> },
  { key: "health", label: "Health", align: "right", render: (r) => <HealthCell score={r._h} grade={r._g} tone={r._h != null ? gradeTone(r._g) : null} /> },
  { key: "r1m", label: "1M", align: "right", render: (r) => pct(r.r1m) },
  { key: "r1y", label: "1Y", align: "right", render: (r) => pct(r.r1y) },
];

export default function BenchmarkPage({ params }) {
  const b = getBenchmark(params.slug);
  if (!b) notFound();

  // De-dupe to one row per canonical fund idea (a benchmark is shared by many plan variants).
  const groups = new Map();
  for (const code of b.codes) {
    const f = getFund(code);
    if (!f) continue;
    const k = canonicalKey(f.name);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(f);
  }
  const isDG = (f) => f.isDirect && f.isGrowth;
  const rows = [...groups.values()].map((variants) => {
    const pick = variants.find(isDG) || variants.find((v) => v.isGrowth) || variants[0];
    const h = fundHealth(pick);
    return { ...pick, name: canonicalName(pick.name), _key: pick.code, _h: h?.overall ?? null, _g: h?.grade ?? null, variantCount: variants.length };
  }).sort((a, b2) => (b2.r1y ?? -999) - (a.r1y ?? -999));

  const r1ys = rows.map((r) => r.r1y).filter((v) => v != null);
  const avgR1y = r1ys.length ? r1ys.reduce((s, v) => s + v, 0) / r1ys.length : null;
  const withReturns = rows.filter((r) => r.r1m != null).length;

  return (
    <>
      <Nav active="/funds" />
      <Tracker event="page_view" payload={{ page: "benchmark", benchmark: b.name }} />
      <main className="container-px py-9">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Benchmark</div>
        <h1 className="mt-2 text-[24px] sm:text-[30px] font-bold tracking-tightest text-ink">{b.name}</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          {rows.length} fund{rows.length === 1 ? "" : "s"} track this benchmark (SEBI category-standard mapping, or the fund's own named index). Index-level return comparison needs an index NAV series we don&rsquo;t ingest yet — figures below are the funds' own real NAV performance.
        </p>

        <div className="mt-5 max-w-2xl">
          <StatStrip items={[
            { label: "Funds tracking", value: rows.length },
            { label: "With 1Y return", value: withReturns },
            { label: "Avg 1Y (of these funds)", value: avgR1y == null ? "—" : `${avgR1y >= 0 ? "+" : ""}${avgR1y.toFixed(1)}%`, tone: avgR1y >= 0 ? "pos" : "neg" },
          ]} />
        </div>

        <section className="mt-7">
          <SectionHeader eyebrow="real AMFI NAV" title="Funds tracking this benchmark" action={<Badge tone="pos" dot>real NAV</Badge>} />
          <DataTable columns={cols} rows={rows} footnote={`One row per canonical fund (Direct/Regular/IDCW variants collapsed). As of ${asOf}.`} />
        </section>
      </main>
      <Footer note={<span>Benchmark mapping from SEBI category standards / fund-named index · performance from AMFI NAV · not investment advice.</span>} />
    </>
  );
}
