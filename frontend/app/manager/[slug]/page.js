import { notFound } from "next/navigation";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import Tracker from "../../components/Tracker";
import SectionHeader from "../../components/ui/SectionHeader";
import DataTable from "../../components/ui/DataTable";
import StatStrip from "../../components/ui/StatStrip";
import Badge from "../../components/ui/Badge";
import HealthCell from "../../components/ui/HealthCell";
import { getManager } from "../../lib/metadata";
import { getFund } from "../../lib/funds";
import { fundHealth, gradeTone } from "../../lib/fundHealth";
import { short } from "../../lib/format";

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const m = getManager(params.slug);
  return { title: m ? `${m.name} — Fund Manager` : "Manager" };
}

const pct = (v) => (v == null ? <span className="text-ink-faint">—</span> : <span className={v >= 0 ? "text-pos tnum" : "text-neg tnum"}>{v >= 0 ? "+" : ""}{v.toFixed(1)}%</span>);

const cols = [
  { key: "name", label: "Fund", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/fund/${r.code}`}>{short(r.name)}<span className="block text-[11px] text-ink-faint">{r.category} · {r.plan}</span></a> },
  { key: "health", label: "Health", align: "right", render: (r) => <HealthCell score={r._h} grade={r._g} tone={r._h != null ? gradeTone(r._g) : null} /> },
  { key: "r1y", label: "1Y", align: "right", render: (r) => pct(r.r1y) },
  { key: "catPct", label: "Cat %ile", align: "right", render: (r) => (r.catPct == null ? <span className="text-ink-faint">—</span> : <span className="tnum text-ink-muted">{r.catPct}</span>) },
];

export default function ManagerPage({ params }) {
  const mgr = getManager(params.slug);
  if (!mgr) notFound();

  // De-dupe to one row per fund (codes include all plan variants).
  const seen = new Set();
  const rows = [];
  for (const code of mgr.codes) {
    const f = getFund(code);
    if (!f || seen.has(f.name.split(" - ")[0])) continue;
    seen.add(f.name.split(" - ")[0]);
    const h = fundHealth(f);
    rows.push({ ...f, _key: code, _h: h?.overall ?? null, _g: h?.grade ?? null });
  }
  rows.sort((a, b) => (b._h ?? -1) - (a._h ?? -1));

  const healths = rows.map((r) => r._h).filter((v) => v != null);
  const avgHealth = healths.length ? Math.round(healths.reduce((s, v) => s + v, 0) / healths.length) : null;
  const r1ys = rows.map((r) => r.r1y).filter((v) => v != null);
  const avgR1y = r1ys.length ? r1ys.reduce((s, v) => s + v, 0) / r1ys.length : null;
  const leaders = rows.filter((r) => r.catPct != null && r.catPct >= 75).length;

  return (
    <>
      <Nav active="/funds" />
      <Tracker event="manager_view" payload={{ manager: mgr.slug, funds: rows.length }} />
      <main className="container-px py-9">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Fund Manager</div>
        <h1 className="mt-2 text-[28px] sm:text-[32px] font-bold tracking-tightest text-ink">{mgr.name}</h1>
        <p className="mt-2 max-w-2xl text-[14px] text-ink-muted">
          {rows.length} fund{rows.length === 1 ? "" : "s"} managed (from real factsheet attribution). Health &amp; returns are real NAV-derived; manager mapping is from AMC factsheets.
        </p>

        <div className="mt-5 max-w-2xl">
          <StatStrip items={[
            { label: "Funds managed", value: rows.length },
            { label: "Avg health", value: avgHealth ?? "—", sub: "0–100" },
            { label: "Avg 1Y", value: avgR1y == null ? "—" : `${avgR1y >= 0 ? "+" : ""}${avgR1y.toFixed(1)}%`, tone: avgR1y >= 0 ? "pos" : "neg" },
            { label: "Category leaders", value: leaders, sub: "≥75th %ile" },
          ]} />
        </div>

        <section className="mt-7">
          <SectionHeader eyebrow="real NAV health + returns" title="Funds managed" action={<Badge tone="pos" dot>factsheet-mapped</Badge>} />
          <DataTable columns={cols} rows={rows} footnote="Manager attribution from AMC factsheets; performance computed from AMFI NAV. One row per fund (plans combined)." />
        </section>
      </main>
      <Footer note={<span>Manager mapping from AMC factsheets · performance from AMFI NAV · not investment advice.</span>} />
    </>
  );
}
