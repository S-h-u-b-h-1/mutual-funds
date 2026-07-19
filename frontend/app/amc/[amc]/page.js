import Link from "next/link";
import { sb } from "../../lib/supabase";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import Tracker from "../../components/Tracker";
import WatchButton from "../../components/WatchButton";
import NextActions from "../../components/NextActions";
import ProvenanceDisclosure from "../../components/ui/ProvenanceDisclosure";
import { getFund, asOf, allFunds } from "../../lib/funds";
import { getArticlesForEntity, relativeTime } from "../../lib/news";
import { amcIntel, amcSlugify, gradeTone } from "../../lib/amcIntel";
import trendData from "../../data/amc_trend.json";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(Number(n || 0));
const pct = (n, digits = 1) => n == null ? "Not available" : `${Number(n).toFixed(digits)}%`;
const CLASS_COLOR = { Equity: "#34d399", Debt: "#60a5fa", Hybrid: "#a78bfa", Other: "#fbbf24", Solution: "#f472b6" };

export async function generateMetadata({ params }) {
  return { title: decodeURIComponent(params.amc) };
}

function ScoreEvidence({ intel }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="eyebrow text-ink-faint">AMC quality score</div>
          <div className="mt-3 flex items-end gap-3"><span className="financial-number text-5xl font-semibold tracking-tight text-ink">{intel.score}</span><span className="mb-1 text-sm text-ink-faint">/100</span><span className={`mb-1 rounded-full border border-current/25 px-2.5 py-1 text-xs font-semibold ${gradeTone(intel.grade) === "pos" ? "text-pos" : gradeTone(intel.grade) === "warn" ? "text-warn" : "text-neg"}`}>Grade {intel.grade}</span></div>
        </div>
        <div className="max-w-md text-sm leading-6 text-ink-muted">A deterministic research indicator built only from the available fund-health, peer-return, category-position, volatility and completeness evidence. It is not an AMC credit rating or recommendation.</div>
      </div>
      <details className="group mt-5 border-t border-line pt-4">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl border border-line px-4 text-sm font-semibold text-ink-muted outline-none hover:border-line-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-accent">Explain AMC score <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span></summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Average fund health", intel.avgHealth == null ? "Unavailable" : `${intel.avgHealth}/100`, "Canonical fund health scores"],
            ["Beat category average", pct(intel.beatPct, 0), "Funds with 1Y return above their category average"],
            ["Top-quartile category", pct(intel.topQPct, 0), `${intel.topQ} canonical funds at or above their category's 75th percentile`],
            ["Average volatility", pct(intel.avgVol), "Observed 90-day annualised volatility input"],
            ["Input completeness", pct(intel.completeness, 0), "Canonical funds with both 1Y return and volatility"],
          ].map(([label, value, detail]) => <div key={label} className="rounded-xl bg-surface-2 p-4"><div className="text-[11px] text-ink-faint">{label}</div><div className="financial-number mt-1 text-lg font-semibold text-ink">{value}</div><p className="mt-2 text-[11px] leading-5 text-ink-muted">{detail}</p></div>)}
        </div>
        <p className="mt-4 text-xs leading-5 text-ink-muted">Available components are weighted and renormalised by the existing AMC intelligence engine. Missing components are dropped; they are never assigned an average value.</p>
      </details>
    </article>
  );
}

function FundRanking({ title, detail, items, tone }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-5">
      <div className={`eyebrow ${tone}`}>{title}</div>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{detail}</p>
      <ol className="mt-4 divide-y divide-line/70">
        {items.map((fund, index) => <li key={fund.code} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><span className="financial-number mt-0.5 text-xs text-ink-faint">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><Link href={`/fund/${fund.code}`} className="block break-words text-sm font-semibold leading-5 text-ink hover:text-accent">{fund.name}</Link><div className="mt-1 flex flex-wrap items-start gap-x-3 gap-y-1 text-[11px] text-ink-faint"><span>{fund.category}</span><span>1Y {pct(fund.r1y)}</span><details><summary className="cursor-pointer font-semibold text-ink-muted outline-none focus-visible:ring-2 focus-visible:ring-accent">Health {fund.health == null ? "unavailable" : `${fund.health}/100`}</summary><p className="mt-2 max-w-sm rounded-lg bg-bg p-3 font-normal leading-5 text-ink-muted">Canonical fund-health evidence supplied by the quality engine. Open the fund to inspect components, weights, missing inputs and methodology.</p></details></div></div></li>)}
      </ol>
    </article>
  );
}

function Distribution({ summary, total }) {
  return (
    <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="eyebrow text-ink-faint">Fund distribution</div><h2 className="section-title mt-2">Where this AMC is present</h2>
      <div className="mt-5 space-y-4">{summary.map((item) => { const share = total ? (Number(item.schemes) / total) * 100 : 0; return <div key={item.asset_class}><div className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2 font-medium text-ink"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_COLOR[item.asset_class] || "#64748b" }} />{item.asset_class}</span><span className="financial-number text-ink-muted">{fmt(item.schemes)} · {share.toFixed(1)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full" style={{ width: `${share}%`, background: CLASS_COLOR[item.asset_class] || "#64748b" }} /></div></div>; })}</div>
    </article>
  );
}

export default async function AmcPage({ params }) {
  const amc = decodeURIComponent(params.amc);
  const enc = encodeURIComponent(amc);
  const shortName = amc.replace(" Mutual Fund", "");
  const [summary, schemes, news] = await Promise.all([
    sb(`mv_amc_summary?amc_name=eq.${enc}&select=asset_class,schemes&order=schemes.desc`),
    sb(`dim_scheme?amc_name=eq.${enc}&asset_class=eq.Equity&select=scheme_code,scheme_name,asset_class&limit=40`),
    getArticlesForEntity({ entityType: "amc", entityName: shortName, limit: 3 }),
  ]);

  if (!summary.length) {
    return <><Nav /><Tracker event="amc_view" payload={{ amc, found: false }} /><main id="main-content" className="container-px py-24 text-center"><h1 className="page-title">AMC not found</h1><p className="mt-3 text-sm text-ink-muted">No verified AMC record matches “{amc}”.</p><Link className="mt-6 inline-flex min-h-11 items-center rounded-full border border-line px-5 text-sm font-semibold text-accent" href="/amc">Browse AMCs</Link></main></>;
  }

  const total = summary.reduce((sum, item) => sum + Number(item.schemes), 0);
  const dominantClass = summary[0]?.asset_class;
  const intel = dominantClass ? amcIntel(allFunds(), amcSlugify(shortName), dominantClass.toLowerCase()) : null;
  const trend = trendData.amcs[amc];
  const trendChange = trend ? trend[trend.length - 1][1] - trend[0][1] : null;
  const strongest = intel?.categories?.[0];

  return (
    <>
      <Nav active="/amc" />
      <Tracker event="amc_view" payload={{ amc }} view={{ type: "amc", id: amc, name: shortName }} />
      <main id="main-content" className="container-px py-10 sm:py-14">
        <header className="grid gap-7 border-b border-line pb-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div><Link href="/amc" className="text-xs font-semibold text-ink-muted hover:text-accent">← AMC directory</Link><div className="eyebrow mt-5 text-accent">AMC intelligence · {dominantClass}</div><h1 className="page-title mt-3">{amc}</h1><p className="mt-4 max-w-3xl text-sm leading-6 text-ink-muted">Understand this fund house through observed scheme coverage, peer-relative fund evidence and explicit limitations—not brand reputation or an inferred corporate rating.</p></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[34rem]">{[
            ["Schemes", fmt(total)], ["Asset classes", summary.length], ["Peer rank", intel?.rank ? `#${intel.rank} / ${intel.totalAmcs}` : "Unavailable"], ["30d index", trendChange == null ? "Unavailable" : `${trendChange >= 0 ? "+" : ""}${trendChange.toFixed(1)}%`],
          ].map(([label, value]) => <div key={label} className="rounded-2xl border border-line bg-surface p-4"><div className="text-[10px] uppercase tracking-[0.1em] text-ink-faint">{label}</div><div className="financial-number mt-2 break-words text-lg font-semibold text-ink">{value}</div></div>)}</div>
        </header>

        <ProvenanceDisclosure className="mt-6" source="AMFI NAV universe and NAV history" sourceUrl="https://www.amfiindia.com" updatedAt={asOf} confidence="Unavailable" coverage={intel ? `${intel.fundCount} canonical ${intel.assetClass} funds · ${intel.completeness}% score-input coverage` : `${total} schemes`} freshness="Daily on trading days" methodology="The AMC engine groups plan variants into canonical funds, computes observed fund-health and peer evidence, then drops and renormalises unavailable score components." limitations="The AMC engine does not emit an independent confidence rating. This is research evidence, not an AMC credit rating. Public sources do not provide authoritative AMC-level AUM, governance quality or individual AMC net flows." />

        <section className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]" aria-labelledby="executive-title">
          <article className="rounded-2xl border border-line bg-ink p-6 text-bg sm:p-8"><div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-bg/55">Executive summary</div><h2 id="executive-title" className="mt-3 text-2xl font-semibold tracking-tight">{intel?.rank ? `${shortName} ranks #${intel.rank} among ${intel.totalAmcs} ${intel.assetClass} peers on observed 1-year fund returns.` : `${shortName} does not yet have enough 1-year evidence for a peer rank.`}</h2><p className="mt-4 max-w-3xl text-sm leading-6 text-bg/70">{intel ? `${intel.beatPct ?? 0}% of eligible canonical funds beat their category average. ${strongest ? `${strongest.category} is the strongest observed category by average fund health (${strongest.avgHealth ?? "unavailable"}/100).` : "Category strength is unavailable."}` : "The AMC intelligence engine has no eligible canonical-fund cohort for this dominant asset class."}</p></article>
          <article className="rounded-2xl border border-line bg-surface p-6"><div className="eyebrow text-ink-faint">Confidence and update</div><dl className="mt-4 space-y-4 text-sm"><div><dt className="text-ink-faint">Latest official NAV evidence</dt><dd className="financial-number mt-1 font-semibold text-ink">{asOf}</dd></div><div><dt className="text-ink-faint">Score-input coverage</dt><dd className="financial-number mt-1 font-semibold text-ink">{intel ? `${intel.completeness}%` : "Unavailable"}</dd></div><div><dt className="text-ink-faint">Confidence interpretation</dt><dd className="mt-1 leading-6 text-ink-muted">{intel ? `Based on ${intel.fundCount} canonical funds; ${100 - intel.completeness}% lack either 1Y return or volatility evidence and reduce confidence.` : "Official data not yet available."}</dd></div></dl></article>
        </section>

        {intel ? <>
          <section className="mt-8"><ScoreEvidence intel={intel} /></section>
          <section className="mt-8 grid gap-4 lg:grid-cols-2"><FundRanking title="Best observed fund health" detail="Highest deterministic fund-health scores within this AMC and asset class—not a buy list." items={intel.best} tone="text-pos" /><FundRanking title="Weakest observed fund health" detail="Lowest available fund-health scores, shown for investigation rather than judgment." items={intel.weakest} tone="text-neg" /></section>
          <section className="mt-8 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,.8fr)]">
            <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="eyebrow text-ink-faint">Category presence</div><h2 className="section-title mt-2">Strength varies across categories.</h2><div className="mt-5 grid gap-3 sm:grid-cols-2">{intel.categories.map((category) => <details key={category.category} className="group rounded-xl border border-line p-4"><summary className="cursor-pointer list-none outline-none focus-visible:ring-2 focus-visible:ring-accent"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold text-ink">{category.category}</h3><p className="mt-1 text-xs text-ink-faint">{category.count} canonical fund{category.count === 1 ? "" : "s"}</p></div><span className="financial-number shrink-0 text-sm font-semibold text-ink">{category.avgHealth == null ? "—" : `${category.avgHealth}/100`}</span></div></summary><div className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-muted"><p>Average 1Y return: {pct(category.avgR1y)} · average volatility: {pct(category.avgVol)}.</p><p className="mt-1">Engine label: {category.rating}. This is based on available canonical fund health, not a standalone category recommendation.</p>{category.topCode && <Link href={`/fund/${category.topCode}`} className="mt-2 inline-block font-semibold text-accent">Open highest observed 1Y fund →</Link>}</div></details>)}</div></article>
            <Distribution summary={summary} total={total} />
          </section>
        </> : <section className="mt-8 rounded-2xl border border-line bg-surface p-8"><h2 className="section-title">AMC intelligence unavailable</h2><p className="mt-3 text-sm leading-6 text-ink-muted">The deterministic engine could not form an eligible canonical-fund cohort for this AMC and asset class. No score or rank is shown.</p></section>}

        <section className="mt-8 grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="eyebrow text-ink-faint">Research notes</div><h2 className="section-title mt-2">What deserves a closer look</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-ink-muted"><li>• Review the categories where health and 1-year returns diverge; an AMC-wide average can hide uneven fund evidence.</li>{intel?.beatPct != null && <li>• {intel.beatPct}% of eligible funds beat their own category average over 1 year; inspect the individual fund history before drawing a conclusion.</li>}{strongest && <li>• {strongest.category} has the highest observed average health in this cohort; verify its {strongest.count} constituent fund{strongest.count === 1 ? "" : "s"} separately.</li>}<li>• Plan variants are grouped into canonical funds for AMC analysis, while fund pages still preserve Direct/Regular and Growth/IDCW distinctions.</li></ul></article>
          <article className="rounded-2xl border border-line bg-surface p-5 sm:p-6"><div className="eyebrow text-warn">Limitations</div><h2 className="section-title mt-2">What this page cannot establish</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-ink-muted"><li>• AMC-level AUM, profitability, governance quality and service quality are not available from the connected public source.</li><li>• Individual AMC net flows are not published in the connected AMFI monthly category-flow dataset, so the previous flow cards have been removed.</li><li>• Fund health is a transparent MF Pulse research indicator—not a licensed CRISIL, Morningstar or Value Research rating.</li><li>• Missing return or volatility history lowers coverage and is not replaced by category averages.</li></ul></article>
        </section>

        {news.length > 0 && <section className="mt-8"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="eyebrow text-ink-faint">Recent evidence</div><h2 className="section-title mt-2">News mentioning this AMC</h2></div><Link href="/news" className="text-sm font-semibold text-accent">All news →</Link></div><div className="mt-4 grid gap-3 md:grid-cols-3">{news.map((item) => <a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer" className="rounded-2xl border border-line bg-surface p-4 hover:border-line-strong"><div className="text-[11px] text-ink-faint">{item.source?.name || "Unknown source"} · {relativeTime(item.publishedAt)}</div><h3 className="mt-2 text-sm font-semibold leading-5 text-ink">{item.title}</h3></a>)}</div></section>}

        <section className="mt-8" aria-labelledby="schemes-title"><div className="flex flex-wrap items-end justify-between gap-3"><div><div className="eyebrow text-ink-faint">Official NAV records</div><h2 id="schemes-title" className="section-title mt-2">Equity schemes</h2></div>{schemes.length === 40 && <span className="text-xs text-ink-faint">First 40 records</span>}</div><div className="mt-4 grid gap-3 lg:hidden">{schemes.map((scheme) => { const fund = getFund(String(scheme.scheme_code)); return <article key={scheme.scheme_code} className="rounded-2xl border border-line bg-surface p-4"><div className="flex items-start justify-between gap-3"><Link href={`/fund/${scheme.scheme_code}`} className="break-words text-sm font-semibold leading-5 text-ink">{scheme.scheme_name}</Link><WatchButton code={scheme.scheme_code} name={scheme.scheme_name} amc={amc} /></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted"><span>{fund?.category || "Category unavailable"}</span><span className="financial-number">NAV {fund?.nav != null ? `₹${Number(fund.nav).toFixed(2)}` : "unavailable"}</span><span className="financial-number">{fund?.navDate || "No date"}</span></div></article>; })}</div><div className="mt-4 hidden overflow-hidden rounded-2xl border border-line bg-surface lg:block"><table className="w-full text-sm"><caption className="sr-only">Equity schemes, latest NAV date and watchlist action.</caption><thead className="border-b border-line bg-surface-2 text-left text-[10px] uppercase tracking-[0.1em] text-ink-faint"><tr><th className="w-14 px-4 py-3">Track</th><th className="px-3 py-3">Scheme</th><th className="px-3 py-3">Category</th><th className="px-3 py-3 text-right">NAV</th><th className="px-4 py-3 text-right">As of</th></tr></thead><tbody>{schemes.map((scheme) => { const fund = getFund(String(scheme.scheme_code)); return <tr key={scheme.scheme_code} className="border-b border-line/70 last:border-0"><td className="px-4 py-3"><WatchButton code={scheme.scheme_code} name={scheme.scheme_name} amc={amc} /></td><td className="px-3 py-3"><Link href={`/fund/${scheme.scheme_code}`} className="font-medium text-ink hover:text-accent">{scheme.scheme_name}</Link></td><td className="px-3 py-3 text-ink-muted">{fund?.category || "—"}</td><td className="financial-number px-3 py-3 text-right text-ink">{fund?.nav != null ? `₹${Number(fund.nav).toFixed(2)}` : "—"}</td><td className="financial-number px-4 py-3 text-right text-ink-muted">{fund?.navDate || "—"}</td></tr>; })}</tbody></table></div></section>

        <NextActions items={[intel && { label: `Open full ${intel.assetClass} intelligence`, href: `/signals/${amcSlugify(shortName)}/${dominantClass.toLowerCase()}` }, { label: "Compare AMC", href: `/compare?amcs=${enc}` }, { label: "See all AMCs", href: "/amc" }, { label: "Research categories", href: "/categories" }]} />
      </main>
      <Footer note={<span>AMFI NAV evidence as of {asOf} · AMC score is deterministic research, not a licensed rating or investment recommendation.</span>} />
    </>
  );
}
