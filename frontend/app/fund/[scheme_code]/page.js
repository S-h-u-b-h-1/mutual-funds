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
import { fundSignals, researchSummary, visibleReturns, riskInterpretation, benchmarkRows } from "../../lib/fundAnalysis";
import { fundHealth, gradeTone, LABELS } from "../../lib/fundHealth";
import { getMetadata } from "../../lib/metadata";

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const f = getFund(params.scheme_code);
  return { title: f ? `${f.name.replace(/ - (Direct|Regular).*/i, "")} — ${f.amc}` : "Fund" };
}

const freshness = (d) => (d === 0 ? ["pos", "NAV current"] : d <= 2 ? ["pos", `${d}d old`] : d <= 7 ? ["warn", `${d}d old`] : ["neg", "Stale"]);
const sgn = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;

function Ret({ label, v, suffix }) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.015] px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">{label}{suffix ? <span className="ml-1 normal-case text-ink-faint">{suffix}</span> : null}</div>
      <div className={`mt-0.5 text-[15px] font-semibold tnum ${v >= 0 ? "text-pos" : "text-neg"}`}>{sgn(v)}</div>
    </div>
  );
}

function Metric({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between text-[12.5px]">
      <span className="text-ink-faint">{label}</span>
      <span className={tone === "pos" ? "text-pos tnum" : tone === "neg" ? "text-neg tnum" : "text-ink-muted tnum"}>{value}</span>
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
  const bench = benchmarkRows(f, cohort);
  const meta = getMetadata(f.code);                       // factsheet metadata when available
  const health = fundHealth({ ...f, expenseRatio: meta?.expense_ratio ?? null });  // cost activates with real TER
  const [fTone, fLabel] = freshness(f.staleDays);
  const histDays = history?.points?.length || 0;

  return (
    <>
      <Nav active="/funds" />
      <Tracker event="fund_view" payload={{ code: f.code, category: f.category, amc: f.amc }} />
      <main className="container-px py-8">
        {/* 1 · Header */}
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Fund · {f.code}</div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[24px] sm:text-[30px] font-bold tracking-tightest text-ink">{f.name.replace(/ - (Direct|Regular).*/i, "")}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-muted">
              <a className="hover:text-ink" href={`/amc/${encodeURIComponent(f.amc + " Mutual Fund")}`}>{f.amc}</a>
              <span className="text-ink-faint">·</span><a className="hover:text-ink" href={`/categories/${encodeURIComponent(f.category)}`}>{f.category}</a>
              <Badge>{f.plan}</Badge><Badge>{f.option}</Badge>
              {f.assetClass && <Badge tone="neutral">{f.assetClass}</Badge>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">Latest NAV</div>
            <div className="text-[24px] font-bold tnum text-ink">₹{f.nav.toFixed(2)}</div>
            <div className="mt-1 flex items-center justify-end gap-2 text-[11px] text-ink-faint"><span>{f.navDate}</span><Badge tone={fTone} dot>{fLabel}</Badge></div>
          </div>
        </div>

        {f.isIdcw && (
          <div className="mt-4 rounded-lg border border-warn/30 bg-warn/[0.06] px-4 py-2.5 text-[12.5px] text-warn">
            IDCW plan — NAV-based returns are distorted by dividend payouts. Use the Growth plan for fair performance comparison.
          </div>
        )}

        {/* 2 · Health Score */}
        {health && (
          <GlassPanel className="mt-6 p-5 sm:p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <div className={`grid h-20 w-20 shrink-0 place-items-center rounded-2xl border text-[34px] font-bold ${gradeTone(health.grade) === "pos" ? "border-pos/40 bg-pos/10 text-pos" : gradeTone(health.grade) === "warn" ? "border-warn/40 bg-warn/10 text-warn" : "border-neg/40 bg-neg/10 text-neg"}`}>{health.grade}</div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">Fund Health Score</div>
                  <div className="text-[30px] font-bold tnum text-ink">{health.overall}<span className="text-[15px] text-ink-faint">/100</span></div>
                  <div className="text-[11.5px] text-ink-faint">{health.confidence} confidence{!health.costAvailable && " · cost n/a"}</div>
                </div>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-3">
                {health.breakdown.map((b) => (
                  <div key={b.key}>
                    <div className="flex items-center justify-between text-[11px]"><span className="text-ink-faint">{LABELS[b.key]}</span><span className="tnum text-ink-muted">{b.score}</span></div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-accent-soft" style={{ width: `${b.score}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>
            <p className="mt-4 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-muted">{health.explanation}</p>
          </GlassPanel>
        )}

        {/* 3 · Performance */}
        <section className="mt-7">
          <SectionHeader eyebrow="point-to-point NAV return · 3Y/5Y annualised" title="Performance" action={<Badge tone="pos" dot>real AMFI</Badge>} />
          {rets.length ? (
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-7">{rets.map(([l, v, s]) => <Ret key={l} label={l} v={v} suffix={s} />)}</div>
          ) : (
            <div className="rounded-lg border border-line bg-white/[0.015] px-4 py-3 text-[13px] text-ink-faint">Insufficient history to compute returns.</div>
          )}
          {f.catRank && (
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[12.5px] text-ink-muted">
              <span>Category rank <b className="text-ink">#{f.catRank}</b> / {f.catSize} ({f.plan} {f.category})</span>
              <span>Percentile <b className="text-ink">{f.catPct}</b></span>
              {f.trend != null && <span>Trend <b className="text-ink">{f.trend}/100</b> ({f.trend >= 60 ? "improving" : f.trend <= 40 ? "weakening" : "steady"})</span>}
            </div>
          )}
        </section>

        {/* 4 · NAV chart */}
        <section className="mt-7">
          <SectionHeader eyebrow={history ? "source: MFAPI.in (AMFI NAV history)" : "history source unavailable"} title="NAV trend" />
          <GlassPanel className="p-5 sm:p-6"><NavChart points={history?.points} code={f.code} /></GlassPanel>
        </section>

        {/* 5 · Risk + 6 · Peers */}
        <div className="mt-7 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <GlassPanel className="p-5">
            <SectionHeader title="Risk" action={<Badge tone="pos" dot>90d daily series</Badge>} />
            {f.vol90 != null ? (
              <div className="space-y-2.5">
                <Metric label="Volatility (90d, annualised)" value={`${f.vol90}%`} />
                <Metric label="Volatility (30d)" value={`${f.vol30}%`} />
                <Metric label="Downside volatility" value={`${f.dvol90}%`} />
                <Metric label="Max drawdown (90d)" value={`${f.maxdd90}%`} tone="neg" />
                <Metric label="Drawdown from high" value={sgn(f.ddFromHigh)} tone={f.ddFromHigh < 0 ? "neg" : "pos"} />
                <Metric label="Negative NAV days" value={`${f.negDays} / ${f.quality?.obs ?? "—"}`} />
                <Metric label="Consistency" value={`${f.consistency}/100`} tone={f.consistency >= 55 ? "pos" : undefined} />
                <p className="border-t border-line pt-2.5 text-[12px] leading-relaxed text-ink-faint">{riskInterpretation(f)}</p>
              </div>
            ) : <p className="text-[12.5px] text-ink-faint">Insufficient daily history for risk metrics.</p>}
          </GlassPanel>

          <GlassPanel className="p-5">
            <SectionHeader title="Peers" />
            {cohort ? (
              <div className="space-y-2.5">
                <Metric label={`Peer set (${f.plan} ${f.category})`} value={cohort.count} />
                <Metric label="Peer avg 1M" value={sgn(cohort.avg)} tone={cohort.avg >= 0 ? "pos" : "neg"} />
                <Metric label="Peer median 1M" value={sgn(cohort.median ?? cohort.avg)} />
                <div className="flex items-center justify-between gap-2 text-[12.5px]"><span className="text-ink-faint">Best peer</span><a className="truncate text-ink hover:text-accent-soft" href={`/fund/${cohort.best.code}`}>{cohort.best.name.replace(/ - (Direct|Regular).*/i, "")} ({sgn(cohort.best.ret, 1)})</a></div>
                <Metric label="This fund" value={`#${f.catRank} of ${f.catSize}`} />
              </div>
            ) : <p className="text-[12.5px] text-ink-faint">No comparable equity-Growth peer cohort.</p>}
          </GlassPanel>
        </div>

        {/* 6 · Benchmark & peer outperformance */}
        {f.benchmark && (
          <section className="mt-7">
            <SectionHeader eyebrow={`category-standard benchmark${f.benchmarkStd ? " · SEBI" : " · varies by mandate"}`} title="Benchmark & peers" action={<Badge tone="neutral">{f.benchmark}</Badge>} />
            <GlassPanel className="p-5 sm:p-6">
              {bench.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead><tr className="border-b border-line text-[10.5px] uppercase tracking-[0.08em] text-ink-faint">
                      <th className="py-2 text-left">Window</th><th className="py-2 text-right">Fund</th><th className="py-2 text-right">Peer avg</th><th className="py-2 text-right">vs peers</th>
                    </tr></thead>
                    <tbody>
                      {bench.map((b) => (
                        <tr key={b.label} className="border-b border-line/50 last:border-0">
                          <td className="py-2 text-ink-muted">{b.label}{b.pa ? " p.a." : ""}</td>
                          <td className={`py-2 text-right tnum ${b.fund >= 0 ? "text-pos" : "text-neg"}`}>{sgn(b.fund, 1)}</td>
                          <td className="py-2 text-right tnum text-ink-faint">{sgn(b.peer, 1)}</td>
                          <td className={`py-2 text-right tnum font-semibold ${b.delta >= 0 ? "text-pos" : "text-neg"}`}>{b.delta >= 0 ? "+" : ""}{b.delta.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-3 text-[11.5px] leading-relaxed text-ink-faint">Compared against the {f.plan} {f.category} peer cohort (real NAV). Index-return comparison vs {f.benchmark} requires an index series — pending. 3Y/5Y annualised.</p>
                </div>
              ) : <p className="text-[12.5px] text-ink-faint">Not enough overlapping history for a peer comparison.</p>}
            </GlassPanel>
          </section>
        )}

        {/* 7 · Metadata + 8 · Signals + 10 · Data quality */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
          <GlassPanel className="p-5">
            <SectionHeader title="Portfolio & metadata" action={meta ? <Badge tone="pos" dot>factsheet</Badge> : null} />
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-[12.5px]"><span className="text-ink-faint">Benchmark</span><span className="text-right text-ink-muted">{(meta?.benchmark) || f.benchmark || "Not yet available"}</span></div>
              <Metric label="AUM" value={meta?.aum_crores != null ? `₹${meta.aum_crores.toLocaleString("en-IN")} Cr` : "Not yet available"} />
              <Metric label="Expense ratio" value={meta?.expense_ratio != null ? `${meta.expense_ratio}%${meta.direct_expense_ratio != null ? ` (Direct ${meta.direct_expense_ratio}%)` : ""}` : "Not yet available"} />
              <Metric label="Fund manager" value={meta?.fund_manager || "Not yet available"} />
              <Metric label="Riskometer" value={meta?.riskometer || "Not yet available"} />
              <Metric label="Exit load" value={meta?.exit_load || "Not yet available"} />
            </div>
            {meta?.holdings?.length ? (
              <div className="mt-3 border-t border-line pt-2.5">
                <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-faint">Top holdings</div>
                {meta.holdings.slice(0, 8).map((h) => (
                  <div key={h.name} className="flex justify-between text-[12px]"><span className="truncate text-ink-muted">{h.name}</span><span className="tnum text-ink">{h.weight}%</span></div>
                ))}
              </div>
            ) : null}
            {meta?.sector_allocation?.length ? (
              <div className="mt-3 border-t border-line pt-2.5">
                <div className="mb-1.5 text-[11px] uppercase tracking-[0.08em] text-ink-faint">Sector allocation</div>
                {meta.sector_allocation.slice(0, 8).map((s) => (
                  <div key={s.sector} className="flex justify-between text-[12px]"><span className="truncate text-ink-muted">{s.sector}</span><span className="tnum text-ink">{s.allocation_pct}%</span></div>
                ))}
              </div>
            ) : null}
            {!meta && <p className="mt-3 border-t border-line pt-2.5 text-[11.5px] leading-relaxed text-ink-faint">Benchmark is the SEBI category standard. AUM, expense, manager, holdings &amp; sectors come from AMC factsheet PDFs — parsers implemented &amp; tested; live ingestion pending. Never fabricated.</p>}
          </GlassPanel>

          <GlassPanel className="p-5">
            <SectionHeader title="Signals" />
            <div className="space-y-2 text-[12.5px]">
              {sig.positive.map((s, i) => <div key={`p${i}`} className="text-ink-muted"><span className="text-pos">▲</span> {s}</div>)}
              {sig.caution.map((s, i) => <div key={`c${i}`} className="text-ink-muted"><span className="text-warn">●</span> {s}</div>)}
              {sig.warnings.map((s, i) => <div key={`w${i}`} className="text-ink-faint"><span className="text-neg">▸</span> {s}</div>)}
              {!sig.positive.length && !sig.caution.length && !sig.warnings.length && <div className="text-ink-faint">No notable signals.</div>}
            </div>
          </GlassPanel>

          <GlassPanel className="p-5">
            <SectionHeader title="Data quality" />
            <div className="space-y-2.5">
              <Metric label="NAV history" value={histDays ? `${histDays} points` : "—"} />
              <Metric label="Risk observations" value={f.quality?.obs ? `${f.quality.obs} days` : "—"} />
              <div className="flex items-center justify-between text-[12.5px]"><span className="text-ink-faint">Latest NAV</span><span className="text-ink-muted">{f.navDate} <Badge tone={fTone} dot>{fLabel}</Badge></span></div>
              <div className="flex items-center justify-between text-[12.5px]"><span className="text-ink-faint">90-day history</span>{f.quality.has90d ? <Badge tone="pos">yes</Badge> : <Badge tone="warn">no</Badge>}</div>
              <div className="flex items-center justify-between text-[12.5px]"><span className="text-ink-faint">Category mapped</span>{f.quality.hasCategory ? <Badge tone="pos">yes</Badge> : <Badge tone="warn">no</Badge>}</div>
              <Metric label="Source" value={`AMFI${history ? " + MFAPI" : ""}`} />
            </div>
          </GlassPanel>
        </div>

        {/* 9 · Research summary */}
        <section className="mt-7">
          <SectionHeader eyebrow="deterministic · every figure computed from NAV" title="Research summary" />
          <GlassPanel className="p-5 sm:p-6"><p className="text-[13.5px] leading-relaxed text-ink-muted">{researchSummary(f, cohort)}</p></GlassPanel>
        </section>
      </main>
      <Footer note={<span>NAV as of {f.navDate} · daily data, not real-time · past performance ≠ future returns · source AMFI / MFAPI. Platform as of {asOf}.</span>} />
    </>
  );
}
