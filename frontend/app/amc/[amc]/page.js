import { sb } from "../../lib/supabase";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import Tracker from "../../components/Tracker";
import Sparkline from "../../components/Sparkline";
import WatchButton from "../../components/WatchButton";
import SectionHeader from "../../components/ui/SectionHeader";
import MetricCard from "../../components/ui/MetricCard";
import GlassPanel from "../../components/ui/GlassPanel";
import SignalCard from "../../components/ui/SignalCard";
import PremiumButton from "../../components/ui/PremiumButton";
import NextActions from "../../components/NextActions";
import { slugify } from "../../lib/signalSlug";
import { getFund, asOf, allFunds } from "../../lib/funds";
import { getArticlesForEntity, relativeTime } from "../../lib/news";
import { amcIntel, amcSlugify, gradeTone } from "../../lib/amcIntel";
import Badge from "../../components/ui/Badge";
import trendData from "../../data/amc_trend.json";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(n);
const CLASS_COLOR = { Equity: "#34d399", Debt: "#60a5fa", Hybrid: "#a78bfa", Other: "#fbbf24", Solution: "#f472b6" };

export async function generateMetadata({ params }) {
  return { title: decodeURIComponent(params.amc) };
}

export default async function AmcPage({ params }) {
  const amc = decodeURIComponent(params.amc);
  const enc = encodeURIComponent(amc);

  const shortName = amc.replace(" Mutual Fund", "");
  const [summary, schemes, signals, news] = await Promise.all([
    sb(`mv_amc_summary?amc_name=eq.${enc}&select=asset_class,schemes&order=schemes.desc`),
    sb(`dim_scheme?amc_name=eq.${enc}&asset_class=eq.Equity&select=scheme_code,scheme_name,asset_class,fact_nav_daily(nav_value,nav_date)&limit=40`),
    sb(`v_signals?amc_name=eq.${enc}&select=*`),
    getArticlesForEntity({ entityType: "amc", entityName: shortName, limit: 3 }),
  ]);

  const total = summary.reduce((s, r) => s + Number(r.schemes), 0);
  const equityCount = summary.find((s) => s.asset_class === "Equity")?.schemes || 0;
  const trend = trendData.amcs[amc];
  const idxChange = trend ? trend[trend.length - 1][1] - trend[0][1] : null;

  // AMC Intelligence (Institutional Mission 5) — amcIntel.js already computes this (score, peer
  // rank, category strength, best/weakest funds), it just wasn't wired into this page before;
  // it lived only on the deeper /signals/[amc]/[cat] route. Keyed to the AMC's dominant asset
  // class by scheme count (summary is already sorted schemes.desc), matching the same (amc,
  // class) pair the NextActions link below already points to. Computed from funds.json — real
  // AMFI NAV/returns, independent of the Supabase queries above.
  const dominantClass = summary[0]?.asset_class;
  const intel = dominantClass ? amcIntel(allFunds(), amcSlugify(shortName), dominantClass.toLowerCase()) : null;

  if (!summary.length) {
    return (
      <>
        <Nav />
        <Tracker event="amc_view" payload={{ amc, found: false }} />
        <main className="container-px py-24 text-center text-ink-muted">
          No AMC named “{amc}”. <a className="text-accent-soft hover:underline" href="/">← Dashboard</a>
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <Tracker event="amc_view" payload={{ amc }} view={{ type: "amc", id: amc, name: amc.replace(" Mutual Fund", "") }} />

      <main className="container-px py-10 sm:py-14">
        <a href="/" className="text-[13px] text-ink-muted transition-colors hover:text-ink">← Dashboard</a>
        <h1 className="page-title mt-3">{amc}</h1>
        <div className="mt-1.5 text-[13px] text-ink-muted">{fmt(total)} schemes · latest AMFI NAV</div>

        <div className="mt-7 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <MetricCard value={fmt(total)} label="Total schemes" style={{ animationDelay: "0ms" }} />
          <MetricCard value={summary.length} label="Asset classes" style={{ animationDelay: "60ms" }} />
          <MetricCard value={fmt(equityCount)} label="Equity schemes" tone="pos" style={{ animationDelay: "120ms" }} />
          {idxChange != null && (
            <MetricCard value={`${idxChange >= 0 ? "+" : ""}${idxChange.toFixed(1)}`} label="30d equity index" tone={idxChange >= 0 ? "pos" : "neg"} style={{ animationDelay: "180ms" }} />
          )}
        </div>

        {trend && (
          <section className="mt-9">
            <SectionHeader eyebrow="real AMFI history" title="30-day equity index · normalised to 100" />
            <GlassPanel className="p-5 sm:p-6">
              <Sparkline points={trend} />
              <p className="mt-3 border-t border-line pt-3 text-[11.5px] leading-relaxed text-ink-faint">
                An equal-weighted average of this AMC&rsquo;s equity fund NAVs, indexed to start at 100 30 days
                ago — lets you compare the shape and magnitude of this AMC&rsquo;s recent performance regardless
                of any single fund&rsquo;s absolute NAV level.
              </p>
            </GlassPanel>
          </section>
        )}

        <section className="mt-9">
          <SectionHeader title="Schemes by asset class" />
          <div className="flex flex-wrap gap-2.5">
            {summary.map((r) => (
              <span key={r.asset_class} className="glass flex items-center gap-2 px-4 py-2.5 text-[13px]">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLOR[r.asset_class] || "#64748b" }} />
                {r.asset_class}
                <b className="tnum text-ink-muted">{fmt(r.schemes)}</b>
              </span>
            ))}
          </div>
        </section>

        {intel && (
          <section className="mt-9">
            <SectionHeader eyebrow={`${intel.assetClass} · vs ${intel.totalAmcs} peer AMCs`} title="AMC Intelligence" action={<a className="hover:text-ink" href={`/signals/${amcSlugify(shortName)}/${dominantClass.toLowerCase()}`}>Full breakdown →</a>} />
            <GlassPanel className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.1em] text-ink-faint">AMC score</div>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[28px] font-bold tnum text-ink">{intel.score}</span>
                    <Badge tone={gradeTone(intel.grade)} dot>{intel.grade}</Badge>
                  </div>
                </div>
                <p className="max-w-md text-[13px] leading-relaxed text-ink-muted">
                  {intel.rank != null ? (
                    <>Ranks <b className="text-ink">#{intel.rank} of {intel.totalAmcs}</b> {intel.assetClass} AMCs by average 1-year
                    return ({intel.percentile}th percentile). {intel.fundCount} canonical funds, {intel.totalVariants} scheme variants.</>
                  ) : (
                    <>Not enough 1-year history to rank against peers yet. {intel.fundCount} canonical funds, {intel.totalVariants} scheme variants.</>
                  )}
                </p>
              </div>
              {(intel.best?.length > 0 || intel.weakest?.length > 0) && (
                <div className="mt-5 grid grid-cols-1 gap-4 border-t border-line pt-4 sm:grid-cols-2">
                  {intel.best?.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-pos">Best (by health)</div>
                      {intel.best.slice(0, 3).map((f) => (
                        <a key={f.code} href={`/fund/${f.code}`} className="flex items-center justify-between gap-2 py-1 text-[12.5px] text-ink-muted hover:text-ink">
                          <span className="truncate">{f.name}</span>
                          <span className="shrink-0 tnum text-ink-faint">{f.health ?? "—"}</span>
                        </a>
                      ))}
                    </div>
                  )}
                  {intel.weakest?.length > 0 && (
                    <div>
                      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neg">Weakest (by health)</div>
                      {intel.weakest.slice(0, 3).map((f) => (
                        <a key={f.code} href={`/fund/${f.code}`} className="flex items-center justify-between gap-2 py-1 text-[12.5px] text-ink-muted hover:text-ink">
                          <span className="truncate">{f.name}</span>
                          <span className="shrink-0 tnum text-ink-faint">{f.health ?? "—"}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </GlassPanel>
          </section>
        )}

        {signals.length > 0 && (
          <section className="mt-9">
            <SectionHeader eyebrow="z-score ≥ 1.8" title="Flow signals" />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {signals.map((s, i) => (
                <SignalCard key={i} amc={amc.replace(" Mutual Fund", "")} assetClass={s.asset_class} signal={s.signal} z={Number(s.z_score).toFixed(1)} value={`₹${fmt(s.net_flow_cr)} Cr`} />
              ))}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
              A signal fires when this AMC&rsquo;s net flow in an asset class is an unusual outlier against its
              own trailing history (z-score, a measure of how many standard deviations away from normal) —
              not a prediction, a flag that something moved more than usual.
            </p>
          </section>
        )}

        {news.length > 0 && (
          <section className="mt-9">
            <SectionHeader eyebrow="rule-based market-relevance links" title="Recent news mentioning this AMC" action={<a className="hover:text-ink" href="/news">See all news →</a>} />
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

        <section className="mt-9">
          <SectionHeader title="Equity schemes · latest NAV" action={schemes.length === 40 ? "first 40" : ""} />
          <GlassPanel className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-ink-faint">
                  <th className="w-10 px-4 py-3" />
                  <th className="px-2 py-3 text-left font-semibold">Scheme</th>
                  <th className="px-2 py-3 text-left font-semibold">Category</th>
                  <th className="px-2 py-3 text-right font-semibold">NAV (₹)</th>
                  <th className="px-4 py-3 text-right font-semibold">As of</th>
                </tr>
              </thead>
              <tbody>
                {schemes.map((s) => {
                  const nav = (s.fact_nav_daily && s.fact_nav_daily[0]) || {};
                  const category = getFund(String(s.scheme_code))?.category;
                  return (
                    <tr key={s.scheme_code} className="border-t border-line transition-colors hover:bg-surface-2">
                      <td className="px-4 py-3 text-center"><WatchButton code={s.scheme_code} name={s.scheme_name} amc={amc} /></td>
                      <td className="px-2 py-3">
                        <a className="text-ink hover:text-accent-soft" href={`/fund/${s.scheme_code}`}>{s.scheme_name}</a>
                      </td>
                      <td className="px-2 py-3 text-ink-muted">
                        {category ? <a className="hover:text-ink" href={`/categories/${encodeURIComponent(category)}`}>{category}</a> : "—"}
                      </td>
                      <td className="px-2 py-3 text-right tnum">{nav.nav_value ? Number(nav.nav_value).toFixed(2) : "—"}</td>
                      <td className="px-4 py-3 text-right tnum text-ink-muted">{nav.nav_date || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </GlassPanel>
        </section>

        <NextActions items={[
          summary[0] && { label: `${amc.replace(" Mutual Fund", "")} scored — ${summary[0].asset_class} intelligence`, href: `/signals/${slugify(amc)}/${summary[0].asset_class.toLowerCase()}` },
          { label: "Compare AMC", href: `/compare?amcs=${enc}` },
          { label: "See all AMCs", href: "/amc" },
          { label: "Category leaders", href: "/categories" },
        ]} />

        <section className="mt-9">
          <GlassPanel className="flex flex-col items-center justify-between gap-4 p-6 sm:flex-row">
            <div>
              <h3 className="text-base font-semibold text-ink">Track this AMC&rsquo;s funds</h3>
              <p className="mt-1 text-[13px] text-ink-muted">Star any scheme above to add it to your watchlist, or get daily flow alerts.</p>
            </div>
            <PremiumButton href="/#alerts">Get flow alerts</PremiumButton>
          </GlassPanel>
        </section>
      </main>

      <Footer note={<span>Daily NAV from AMFI, as of {asOf} · drill-downs &amp; searches logged for product analytics.</span>} />
    </>
  );
}
