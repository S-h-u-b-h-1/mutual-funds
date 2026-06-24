import { notFound } from "next/navigation";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import Tracker from "../../components/Tracker";
import NavChart from "../../components/NavChart";
import SectionHeader from "../../components/ui/SectionHeader";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge from "../../components/ui/Badge";
import { getFund, cohortOf, asOf } from "../../lib/funds";
import { getNavHistory } from "../../lib/mfapi";
import { fundSignals, researchSummary, visibleReturns } from "../../lib/fundAnalysis";

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const f = getFund(params.scheme_code);
  return { title: f ? `${f.name.replace(/ - (Direct|Regular).*/i, "")} — ${f.amc}` : "Fund" };
}

const freshness = (d) =>
  d === 0 ? ["pos", "NAV current"] : d <= 2 ? ["pos", `${d}d old`] : d <= 7 ? ["warn", `${d}d old`] : ["neg", "Stale"];

function Ret({ label, v }) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.015] px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold tnum ${v >= 0 ? "text-pos" : "text-neg"}`}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</div>
    </div>
  );
}

export default async function FundPage({ params }) {
  const f = getFund(params.scheme_code);
  if (!f) notFound();

  const cohort = cohortOf(f);
  const history = await getNavHistory(f.code);
  const sig = fundSignals(f, cohort);
  const rets = visibleReturns(f);
  const [fTone, fLabel] = freshness(f.staleDays);
  const histDays = history?.points?.length || 0;

  return (
    <>
      <Nav active="/funds" />
      <Tracker event="fund_view" payload={{ code: f.code, category: f.category, amc: f.amc }} />
      <main className="container-px py-8">
        {/* 1 · Identity */}
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Fund · {f.code}</div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] sm:text-[30px] font-bold tracking-tightest text-ink">{f.name.replace(/ - (Direct|Regular).*/i, "")}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
              <a className="hover:text-ink" href={`/amc/${encodeURIComponent(f.amc + " Mutual Fund")}`}>{f.amc}</a>
              <span className="text-ink-faint">·</span><span>{f.category}</span>
              <Badge>{f.plan}</Badge><Badge>{f.option}</Badge>
              {f.assetClass && <Badge tone="neutral">{f.assetClass}</Badge>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">Latest NAV</div>
            <div className="text-[24px] font-bold tnum text-ink">₹{f.nav.toFixed(2)}</div>
            <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-ink-faint">
              <span>{f.navDate}</span><Badge tone={fTone} dot>{fLabel}</Badge>
            </div>
          </div>
        </div>

        {f.isIdcw && (
          <div className="mt-4 rounded-lg border border-warn/30 bg-warn/[0.06] px-4 py-2.5 text-[12.5px] text-warn">
            IDCW plan — NAV-based returns are distorted by dividend payouts. Use the Growth plan for fair performance comparison.
          </div>
        )}

        {/* 2 · Performance summary */}
        <section className="mt-7">
          <SectionHeader eyebrow="point-to-point NAV return · real AMFI" title="Performance" action={<Badge tone="pos" dot>live</Badge>} />
          {rets.length ? (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">{rets.map(([l, v]) => <Ret key={l} label={l} v={v} />)}</div>
          ) : (
            <div className="rounded-lg border border-line bg-white/[0.015] px-4 py-3 text-[13px] text-ink-faint">Insufficient history to compute returns.</div>
          )}
          {f.catRank && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-ink-muted">
              <span>Category rank <b className="text-ink">#{f.catRank}</b> / {f.catSize} ({f.plan} {f.category})</span>
              <span>Percentile <b className="text-ink">{f.catPct}</b></span>
              {f.trend != null && <span>Trend score <b className="text-ink">{f.trend}/100</b> ({f.trend >= 60 ? "improving" : f.trend <= 40 ? "weakening" : "steady"})</span>}
            </div>
          )}
        </section>

        {/* 3 · NAV trend chart */}
        <section className="mt-7">
          <SectionHeader eyebrow={history ? "source: MFAPI.in (AMFI NAV history)" : "history source unavailable"} title="NAV trend" />
          <GlassPanel className="p-5 sm:p-6"><NavChart points={history?.points} code={f.code} /></GlassPanel>
        </section>

        <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* 4 · Peer comparison */}
          <GlassPanel className="p-5">
            <SectionHeader title="Peers" />
            {cohort ? (
              <ul className="space-y-2.5 text-[12.5px]">
                <li className="flex justify-between"><span className="text-ink-faint">Peer set</span><span className="text-ink-muted">{f.plan} {f.category} · {cohort.count}</span></li>
                <li className="flex justify-between"><span className="text-ink-faint">Peer avg 1M</span><span className={cohort.avg >= 0 ? "text-pos tnum" : "text-neg tnum"}>{cohort.avg >= 0 ? "+" : ""}{cohort.avg.toFixed(2)}%</span></li>
                <li className="flex justify-between gap-2"><span className="text-ink-faint">Best peer</span><a className="truncate text-ink hover:text-accent-soft" href={`/fund/${cohort.best.code}`}>{cohort.best.name.replace(/ - (Direct|Regular).*/i, "")} ({cohort.best.ret >= 0 ? "+" : ""}{cohort.best.ret}%)</a></li>
                <li className="flex justify-between gap-2"><span className="text-ink-faint">This fund</span><span className="text-ink">#{f.catRank} of {f.catSize}</span></li>
              </ul>
            ) : (
              <p className="text-[12.5px] text-ink-faint">No comparable peer cohort (needs an equity Growth category cohort).</p>
            )}
          </GlassPanel>

          {/* 5 · Signals */}
          <GlassPanel className="p-5">
            <SectionHeader title="Signals" />
            <div className="space-y-2 text-[12.5px]">
              {sig.positive.map((s, i) => <div key={`p${i}`} className="text-ink-muted"><span className="text-pos">▲</span> {s}</div>)}
              {sig.caution.map((s, i) => <div key={`c${i}`} className="text-ink-muted"><span className="text-warn">●</span> {s}</div>)}
              {sig.warnings.map((s, i) => <div key={`w${i}`} className="text-ink-faint"><span className="text-neg">▸</span> {s}</div>)}
              {!sig.positive.length && !sig.caution.length && !sig.warnings.length && <div className="text-ink-faint">No notable signals.</div>}
            </div>
          </GlassPanel>

          {/* 7 · Data quality */}
          <GlassPanel className="p-5">
            <SectionHeader title="Data quality" />
            <ul className="space-y-2.5 text-[12.5px]">
              <li className="flex justify-between"><span className="text-ink-faint">NAV history</span><span className="text-ink-muted tnum">{histDays ? `${histDays} points` : "—"}</span></li>
              <li className="flex justify-between"><span className="text-ink-faint">Latest NAV</span><span className="text-ink-muted">{f.navDate} <Badge tone={fTone} dot>{fLabel}</Badge></span></li>
              <li className="flex justify-between"><span className="text-ink-faint">90-day history</span><span>{f.quality.has90d ? <Badge tone="pos">yes</Badge> : <Badge tone="warn">no</Badge>}</span></li>
              <li className="flex justify-between"><span className="text-ink-faint">Category mapped</span><span>{f.quality.hasCategory ? <Badge tone="pos">yes</Badge> : <Badge tone="warn">no</Badge>}</span></li>
              <li className="flex justify-between"><span className="text-ink-faint">Source</span><span className="text-ink-muted">AMFI{history ? " + MFAPI" : ""}</span></li>
            </ul>
          </GlassPanel>
        </div>

        {/* 6 · Research summary */}
        <section className="mt-7">
          <SectionHeader eyebrow="deterministic · every figure computed from NAV" title="Research summary" />
          <GlassPanel className="p-5 sm:p-6"><p className="text-[13.5px] leading-relaxed text-ink-muted">{researchSummary(f, cohort)}</p></GlassPanel>
        </section>
      </main>
      <Footer note={<span>NAV as of {f.navDate} · daily data, not real-time · past performance ≠ future returns · source AMFI / MFAPI. Platform as of {asOf}.</span>} />
    </>
  );
}
