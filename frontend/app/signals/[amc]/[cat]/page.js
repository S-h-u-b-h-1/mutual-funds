import { notFound } from "next/navigation";
import { sb } from "../../../lib/supabase";
import Nav from "../../../components/Nav";
import Footer from "../../../components/Footer";
import Tracker from "../../../components/Tracker";
import SectionHeader from "../../../components/ui/SectionHeader";
import GlassPanel from "../../../components/ui/GlassPanel";
import StatStrip from "../../../components/ui/StatStrip";
import DataTable from "../../../components/ui/DataTable";
import Badge from "../../../components/ui/Badge";
import { allFunds, asOf } from "../../../lib/funds";
import { amcIntel, amcSlugify } from "../../../lib/amcIntel";
import { signalSlug } from "../../../lib/signalSlug";

export const revalidate = 600;

const pct = (v, dp = 1) => (v == null ? <span className="text-ink-faint">—</span> : <span className={v >= 0 ? "text-pos tnum" : "text-neg tnum"}>{v >= 0 ? "+" : ""}{v.toFixed(dp)}%</span>);
const inr = (n) => `₹${new Intl.NumberFormat("en-IN").format(Math.round(n))} Cr`;
const gradeTone = (g) => (g === "A" || g === "B+" || g === "B" ? "pos" : g === "C" ? "warn" : "neg");

export async function generateMetadata({ params }) {
  const it = amcIntel(allFunds(), params.amc, params.cat);
  return { title: it ? `${it.amcName} · ${it.assetClass} — AMC Intelligence` : "AMC Intelligence" };
}

const fundCols = [
  { key: "name", label: "Fund", render: (r) => <a className="text-ink hover:text-accent-soft" href={`/fund/${r.code}`}>{r.name}<span className="block text-[11px] text-ink-faint">{r.category}{r.variantCount > 1 ? ` · ${r.variantCount} variants` : ""}{r.direct ? " · Direct" : ""}{r.regular ? "/Regular" : ""}</span></a> },
  { key: "health", label: "Health", align: "right", render: (r) => (r.health == null ? <span className="text-ink-faint">—</span> : <span className={`tnum font-semibold ${gradeTone(r.grade) === "pos" ? "text-pos" : gradeTone(r.grade) === "warn" ? "text-warn" : "text-neg"}`}>{r.health} {r.grade}</span>) },
  { key: "r1m", label: "1M", align: "right", render: (r) => pct(r.r1m) },
  { key: "r1y", label: "1Y", align: "right", render: (r) => pct(r.r1y) },
  { key: "r3y", label: "3Y", align: "right", render: (r) => pct(r.r3y) },
  { key: "vol90", label: "Vol", align: "right", render: (r) => (r.vol90 == null ? <span className="text-ink-faint">—</span> : <span className="tnum text-ink-muted">{r.vol90}</span>) },
  { key: "maxdd90", label: "MaxDD", align: "right", render: (r) => (r.maxdd90 == null ? <span className="text-ink-faint">—</span> : <span className="tnum text-neg">{r.maxdd90}</span>) },
];

export default async function AmcIntel({ params }) {
  const it = amcIntel(allFunds(), params.amc, params.cat);
  if (!it) notFound();

  // flow signal context (sample) — optional
  let sig = null;
  try {
    const signals = await sb("v_signals?select=*", { revalidate: 600 });
    sig = signals.find((s) => amcSlugify(s.amc_name.replace(" Mutual Fund", "")) === params.amc && (s.asset_class || "").toLowerCase() === params.cat) || null;
  } catch {}

  const rows = it.canon.map((c) => ({ ...c, _key: c.code }));

  return (
    <>
      <Nav active="/signals" />
      <Tracker event="amc_intel_view" payload={{ amc: it.amcName, category: it.assetClass }} />
      <main className="container-px py-8">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint"><a className="hover:text-ink" href="/signals">Flow signals</a> · AMC Intelligence</div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] sm:text-[30px] font-bold tracking-tightest text-ink">{it.amcName} · {it.assetClass}</h1>
            <p className="mt-1 text-[13px] text-ink-muted">{it.fundCount} {it.assetClass.toLowerCase()} funds (canonical) · {it.totalVariants} scheme variants · as of {asOf}</p>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">AMC score</div>
            <div className="flex items-center justify-end gap-2"><span className="text-[30px] font-bold tnum text-ink">{it.score}</span><Badge tone={gradeTone(it.grade)} dot>{it.grade}</Badge></div>
          </div>
        </div>

        {/* AMC scoring breakdown */}
        <div className="mt-5 max-w-3xl">
          <StatStrip items={[
            { label: "Avg health", value: it.avgHealth ?? "—", sub: "0–100" },
            { label: "Beat category (1Y)", value: it.beatPct == null ? "—" : `${it.beatPct}%`, tone: (it.beatPct ?? 0) >= 50 ? "pos" : "neg" },
            { label: "Top-quartile funds", value: it.topQ, sub: `${it.topQPct}%` },
            { label: "Avg volatility", value: it.avgVol == null ? "—" : `${it.avgVol}%` },
            { label: "Data completeness", value: `${it.completeness}%` },
          ]} />
        </div>

        {/* peer rank */}
        <GlassPanel className="mt-5 p-5">
          <SectionHeader title="AMC return rating" />
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            {it.rank != null ? (
              <><b className="text-ink">{it.amcName}</b> ranks <b className="text-ink">#{it.rank} of {it.totalAmcs}</b> AMCs in {it.assetClass} by average 1-year return
                ({pct(it.myAvg1y)} vs category average {pct(it.catAvgRet)}) — {it.percentile}th percentile.
                Strongest house: {it.topAmc}; weakest: {it.weakAmc}.</>
            ) : "Not enough 1-year history to rank this AMC against peers."}
          </p>
        </GlassPanel>

        {/* flow signal context */}
        <GlassPanel className="mt-5 p-5">
          <SectionHeader title="Flow signal context" action={<Badge tone="warn">sample</Badge>} />
          {sig ? (
            <p className="text-[13px] leading-relaxed text-ink-muted">
              This AMC/category was flagged as a <b className="text-ink">{sig.signal === "inflow_surge" ? "net inflow surge" : "net outflow surge"}</b>
              {" "}({inr(sig.net_flow_cr)}, z {Number(sig.z_score).toFixed(1)}). <span className="text-ink-faint">Monthly flow figures are illustrative sample — SEBI flows are PDF-only — so this page is built on verified AMFI-NAV fund performance below, not the flow value.</span>
            </p>
          ) : (
            <p className="text-[13px] text-ink-faint">No active flow signal for this AMC/category. The intelligence below is computed from verified AMFI NAV performance.</p>
          )}
        </GlassPanel>

        {/* category strength */}
        <section className="mt-7">
          <SectionHeader eyebrow="by fund health + 1Y return · not marketing language" title={`Where ${it.amcName} is strongest in ${it.assetClass}`} />
          <div className="overflow-x-auto rounded-xl border border-line bg-white/[0.015]">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-line text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">
                <th className="px-3.5 py-2.5 text-left">Sub-category</th><th className="px-3.5 py-2.5 text-right">Funds</th><th className="px-3.5 py-2.5 text-right">Avg health</th><th className="px-3.5 py-2.5 text-right">Avg 1Y</th><th className="px-3.5 py-2.5 text-left">Top fund</th><th className="px-3.5 py-2.5 text-right">Rating</th>
              </tr></thead>
              <tbody>
                {it.categories.map((c) => (
                  <tr key={c.category} className="border-b border-line/60 last:border-0">
                    <td className="px-3.5 py-2.5 font-medium text-ink">{c.category}</td>
                    <td className="px-3.5 py-2.5 text-right tnum text-ink-muted">{c.count}</td>
                    <td className="px-3.5 py-2.5 text-right tnum text-ink">{c.avgHealth ?? "—"}</td>
                    <td className="px-3.5 py-2.5 text-right">{pct(c.avgR1y)}</td>
                    <td className="px-3.5 py-2.5"><a className="text-[12px] text-ink-muted hover:text-ink" href={`/fund/${c.topCode}`}>{(c.topName || "").slice(0, 30)}</a></td>
                    <td className="px-3.5 py-2.5 text-right"><Badge tone={c.rating === "Strong" ? "pos" : c.rating === "Weak" ? "neg" : "warn"}>{c.rating}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* best / weakest */}
        <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-pos">Best funds (by health)</div>
            <DataTable columns={fundCols.slice(0, 4)} rows={it.best.map((c) => ({ ...c, _key: c.code }))} />
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neg">Weakest funds (by health)</div>
            <DataTable columns={fundCols.slice(0, 4)} rows={it.weakest.map((c) => ({ ...c, _key: c.code }))} />
          </div>
        </div>

        {/* all canonical funds + variant expand */}
        <section className="mt-7">
          <SectionHeader eyebrow="canonical funds · Direct/Regular collapsed" title={`All ${it.amcName} ${it.assetClass} funds`} action={<Badge tone="pos" dot>real AMFI NAV</Badge>} />
          <DataTable columns={fundCols} rows={rows} footnote={`Canonical funds (one per investment idea). Health = MF Pulse Fund Health Score. Source: AMFI NAV, as of ${asOf}.`} />
          <details className="mt-3 rounded-lg border border-line bg-white/[0.015] px-4 py-2.5">
            <summary className="cursor-pointer text-[12.5px] text-ink-muted hover:text-ink">Show all {it.totalVariants} scheme variants (Direct / Regular / IDCW)</summary>
            <div className="mt-3 space-y-1">
              {it.canon.flatMap((c) => c.variants).map((v) => (
                <a key={v.code} href={`/fund/${v.code}`} className="flex items-center justify-between gap-2 text-[12px] text-ink-muted hover:text-ink">
                  <span className="truncate">{v.name}</span><span className="shrink-0 text-ink-faint">{v.plan} · {v.option}</span>
                </a>
              ))}
            </div>
          </details>
        </section>

        <p className="mt-4 text-[11px] text-ink-faint">
          Source: AMFI daily NAV (returns/risk) + MF Pulse computed Health Score · latest NAV {asOf} · flow data is illustrative sample.
          Verify on the <a className="hover:text-ink" href="/data-quality">data-quality report</a>.
        </p>
      </main>
      <Footer note={<span>AMC scoring from verified AMFI-NAV fund performance · flow figures sample · not investment advice.</span>} />
    </>
  );
}
