import Link from "next/link";
import Nav from "./components/Nav";
import Footer from "./components/Footer";
import Tracker from "./components/Tracker";
import AlertSignup from "./components/AlertSignup";
import HomeWatchlistSection from "./components/HomeWatchlistSection";
import GlassPanel from "./components/ui/GlassPanel";
import Badge from "./components/ui/Badge";
import { SearchLauncher } from "./components/Search";
import { allFunds, asOf } from "./lib/funds";
import { getTopHeadlines } from "./lib/news";
import { marketStatus } from "./lib/marketStatus";
import { sb } from "./lib/supabase";
import { requireUser } from "./lib/apiAuth";
import { query } from "./lib/db";
import { allMetadata } from "./lib/metadata";
import fieldCoverage from "./data/fieldCoverage.json";
import daily from "./data/daily.json";

const inr = new Intl.NumberFormat("en-IN");
const fmt = (n) => inr.format(Number(n || 0));
const inrCr = (n) => `₹${fmt(Math.round(n))} Cr`;
const lakhCr = (n) => `₹${(n / 100000).toFixed(2)}L Cr`;
const signedInrCr = (n) => `${n >= 0 ? "+" : "−"}₹${fmt(Math.abs(Math.round(n)))} Cr`;
const pctStr = (n, dp = 1) => `${n >= 0 ? "+" : ""}${Number(n).toFixed(dp)}%`;
const freshnessTone = (tone) => (tone === "pos" ? "current" : tone === "neg" ? "stale" : "delayed");

// Every card in the daily workspace carries this triplet, per the redesign brief's explicit
// requirement: no insight is shown without the reader being able to see where it came from,
// when it's from, and how sure the platform is. Confidence is never a vibe — it's derived from
// a real coverage/validation number upstream (see each section's own comment for its formula).
function Provenance({ source, timestamp, confidence }) {
  const tone = confidence === "High" ? "text-pos" : confidence === "Medium" ? "text-warn" : "text-ink-faint";
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-ink-faint">
      <span>Source: {source}</span>
      {timestamp && <span>· {timestamp}</span>}
      {confidence && <span className={tone}>· {confidence} confidence</span>}
    </div>
  );
}

function WorkspaceSection({ n, title, detail, action, children }) {
  return (
    <section className="mt-10 sm:mt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
            <span className="financial-number">{n}</span> {title}
          </div>
          {detail && <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{detail}</p>}
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function BriefItem({ headline, detail, source, timestamp, confidence, href }) {
  return (
    <Link href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noopener noreferrer" : undefined} className="group block border-b border-line/70 py-4 first:pt-0 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[14px] font-semibold leading-snug text-ink group-hover:text-accent-soft">{headline}</h3>
        <span className="mt-0.5 shrink-0 text-ink-faint transition group-hover:translate-x-1 group-hover:text-accent" aria-hidden="true">→</span>
      </div>
      {detail && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{detail}</p>}
      <Provenance source={source} timestamp={timestamp} confidence={confidence} />
    </Link>
  );
}

export default async function HomePage() {
  const funds = allFunds();
  const amcCount = new Set(funds.map((f) => f.amc).filter(Boolean)).size;
  const market = marketStatus(asOf);

  const [headlines, signals, flowHeadline, user] = await Promise.all([
    getTopHeadlines({ limit: 5 }).catch(() => []),
    sb("v_signals?select=*&limit=4", { revalidate: 600 }).catch(() => []),
    sb("v_flow_headline?select=*", { revalidate: 600 }).then((r) => r[0] || {}).catch(() => ({})),
    requireUser(),
  ]);

  let portfolioReport = null;
  if (user) {
    try {
      const r = await query(
        `select summary, generated_at from portfolio_reports where user_id = $1 and report_type = 'portfolio_health' order by generated_at desc limit 1`,
        [user.id]
      );
      portfolioReport = r.rows[0] || null;
    } catch {}
  }
  const ps = portfolioReport?.summary?.portfolioSummary;
  const leaders = portfolioReport?.summary?.performanceLeaders;

  const primaryNews = headlines[0];
  const industryStatements = (daily.industry?.statements || []).slice(0, 2);
  const improvingCategories = (daily.categoryRotation || []).filter((c) => c.severity === "positive").slice(0, 2);
  const improvingAmcs = (daily.amcMomentum || []).filter((a) => a.severity === "positive").slice(0, 2);
  const metaN = fieldCoverage.fields?.Documents?.Factsheet?.universe_n ?? 0;
  const factsheetAmcCount = new Set(allMetadata().map((m) => m.amc).filter(Boolean)).size;

  return (
    <>
      <Nav active="/" />
      <Tracker event="page_view" payload={{ page: "home" }} />
      <main>
        {/* Compact hero — the workspace below is the point, not the pitch */}
        <section className="relative overflow-hidden pb-8 pt-10 sm:pt-12">
          <div className="absolute left-1/2 top-4 h-[320px] w-[640px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
          <div className="container-px relative">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-[2rem] font-semibold leading-[1.05] tracking-[-0.05em] text-ink sm:text-[2.6rem]">Your morning mutual fund workspace.</h1>
                <p className="mt-3 max-w-2xl text-[14px] leading-6 text-ink-muted">Everything that changed since you last looked — NAV, flows, your portfolio, and what&rsquo;s worth researching next. Every number below traces to an official source.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-ink-faint">
                <Badge tone={freshnessTone(market.tone) === "current" ? "pos" : freshnessTone(market.tone) === "stale" ? "neg" : "warn"} dot>{market.navLine}</Badge>
                <Link href="/data-status" className="font-semibold text-accent">Data health →</Link>
              </div>
            </div>
            <div className="mt-6"><SearchLauncher /></div>
          </div>
        </section>

        <div className="container-px pb-16 sm:pb-20">
          {/* 1. Morning Brief */}
          <WorkspaceSection n="01" title="Morning Brief" detail="What actually changed today, each with its own source and confidence — not a recap of yesterday's page." action={<Link href="/brief" className="premium-link">Full brief <span aria-hidden="true">→</span></Link>}>
            <GlassPanel className="p-5 sm:p-6">
              <BriefItem
                headline="AMFI NAV refreshed"
                detail={`Latest official daily NAV bundle is dated ${asOf || "unavailable"}.`}
                source="AMFI NAVAll.txt" timestamp={asOf} confidence={freshnessTone(market.tone) === "current" ? "High" : "Medium"}
                href="/data-status"
              />
              {industryStatements.map((s, i) => (
                <BriefItem key={i} headline="Market breadth" detail={s} source="AMFI daily NAV, computed" timestamp={asOf} confidence="High" href="/brief" />
              ))}
              {signals[0] && (
                <BriefItem
                  headline={`${signals[0].asset_class} flow anomaly`}
                  detail={`${signals[0].signal === "inflow_surge" ? "Inflow" : "Outflow"} surge — z-score ${Number(signals[0].z_score).toFixed(1)}, net flow ${signedInrCr(signals[0].net_flow_cr)} this month.`}
                  source="AMFI Monthly Report (MCR)" timestamp={signals[0].month} confidence={Math.abs(signals[0].z_score) >= 3 ? "High" : "Medium"}
                  href="/signals"
                />
              )}
              {primaryNews && (
                <BriefItem
                  headline={primaryNews.title}
                  source={primaryNews.source?.name || "News source"}
                  timestamp={primaryNews.publishedAt ? new Date(primaryNews.publishedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null}
                  confidence="Attributed"
                  href={primaryNews.url}
                />
              )}
              <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
                Not shown yet: new fund launches, mergers, SEBI circulars and AMC announcements — no clean, automatable official feed for these has been wired in. Disclosed here rather than shown with invented content.
              </p>
            </GlassPanel>
          </WorkspaceSection>

          {/* 2. Portfolio Overview */}
          <WorkspaceSection n="02" title="Portfolio Overview" action={<Link href="/portfolio" className="premium-link">{ps ? "Full report" : "Upload CAS"} <span aria-hidden="true">→</span></Link>}>
            {ps ? (
              <GlassPanel className="p-5 sm:p-6">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div><div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Invested</div><div className="mt-1 financial-number text-lg font-semibold text-ink">{ps.investedValue != null ? inrCr(ps.investedValue) : "—"}</div></div>
                  <div><div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Gain / Loss</div><div className={`mt-1 financial-number text-lg font-semibold ${(ps.gainLoss ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{ps.gainLoss != null ? signedInrCr(ps.gainLoss) : "—"} {ps.gainLossPct != null && `(${pctStr(ps.gainLossPct)})`}</div></div>
                  <div><div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">XIRR</div><div className="mt-1 financial-number text-lg font-semibold text-ink">{ps.xirr != null ? pctStr(ps.xirr) : "Not enough transaction history"}</div></div>
                  <div><div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Health score</div><div className="mt-1 financial-number text-lg font-semibold text-ink">{ps.healthScore ?? "—"}</div></div>
                </div>
                {leaders && (leaders.bestByReturnPct || leaders.poorestByReturnPct) && (
                  <div className="mt-5 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-2">
                    {leaders.bestByReturnPct && (
                      <div className="text-[12.5px]"><span className="text-pos">Best performer</span> — <span className="text-ink">{leaders.bestByReturnPct.schemeName}</span> <span className="tnum text-ink-faint">({pctStr(leaders.bestByReturnPct.returnPct)})</span></div>
                    )}
                    {leaders.poorestByReturnPct && (
                      <div className="text-[12.5px]"><span className="text-neg">Poorest performer</span> — <span className="text-ink">{leaders.poorestByReturnPct.schemeName}</span> <span className="tnum text-ink-faint">({pctStr(leaders.poorestByReturnPct.returnPct)})</span></div>
                    )}
                  </div>
                )}
                <Provenance source="Your uploaded CAS + AMFI daily NAV" timestamp={ps.latestOfficialNavDate ? `valued as of ${ps.latestOfficialNavDate}` : null} confidence={ps.valuationConfidence || null} />
                <p className="mt-2 text-[11px] text-ink-faint">Day-over-day change isn&rsquo;t tracked yet — that needs daily valuation history, not yet built.</p>
              </GlassPanel>
            ) : (
              <GlassPanel className="flex flex-col items-center justify-between gap-4 p-6 sm:flex-row">
                <div>
                  <h3 className="text-base font-semibold text-ink">{user ? "Upload your CAS to see your portfolio here" : "Sign in and upload your CAS statement"}</h3>
                  <p className="mt-1 text-[13px] text-ink-muted">Real invested value, gain/loss, XIRR, and best/worst performer — computed from your actual holdings, never estimated.</p>
                </div>
                <Link href="/portfolio" className="btn-premium-primary shrink-0">Get started</Link>
              </GlassPanel>
            )}
          </WorkspaceSection>

          {/* 3. Market Signals */}
          <WorkspaceSection n="03" title="Market Signals" detail="Only statistically verified deviations — a category's flow this month vs. its own trailing average." action={<Link href="/signals" className="premium-link">All signals <span aria-hidden="true">→</span></Link>}>
            {signals.length ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {signals.map((s, i) => {
                  const up = s.signal === "inflow_surge";
                  return (
                    <GlassPanel key={i} className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg text-sm font-bold ${up ? "bg-pos/10 text-pos" : "bg-neg/10 text-neg"}`}>{up ? "↑" : "↓"}</span>
                        <span className="text-xs font-bold tnum text-ink-faint">z {Number(s.z_score).toFixed(1)}</span>
                      </div>
                      <h3 className="mt-2.5 text-[13.5px] font-semibold text-ink">{s.asset_class}</h3>
                      <p className="mt-1 text-[12px] text-ink-muted">{up ? "Net inflow" : "Net outflow"} surge, {signedInrCr(s.net_flow_cr)} — deviates ≥1.8 standard deviations from its trailing average, not a small blip.</p>
                      <Provenance source="AMFI Monthly Report (MCR)" timestamp={s.month} confidence={Math.abs(s.z_score) >= 3 ? "High" : "Medium"} />
                    </GlassPanel>
                  );
                })}
              </div>
            ) : (
              <GlassPanel className="p-6 text-[13px] text-ink-muted">No active signals this month — surges appear when a category's monthly flow deviates sharply from trend.</GlassPanel>
            )}
          </WorkspaceSection>

          {/* 4. Research Opportunities */}
          <WorkspaceSection n="04" title="Research Opportunities" detail="Categories and AMCs whose 1-month rank improved against their own 3-month average — evidence-based, not a tip." action={<Link href="/dashboard" className="premium-link">Research queue <span aria-hidden="true">→</span></Link>}>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Improving categories</div>
                {improvingCategories.length ? improvingCategories.map((c) => (
                  <GlassPanel key={c.name} className="mb-2.5 p-4">
                    <div className="flex items-center justify-between">
                      <Link href={`/categories/${encodeURIComponent(c.name)}`} className="text-[13.5px] font-semibold text-ink hover:text-accent-soft">{c.name}</Link>
                      <span className="tnum text-[12px] text-pos">#{c.rank3m}→#{c.rank1m}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-ink-muted">1M average {pctStr(c.avg1m)} vs 3M average {pctStr(c.avg3m)}.</p>
                    <Provenance source="AMFI daily NAV, 1M-vs-3M category rank" timestamp={asOf} confidence="High" />
                  </GlassPanel>
                )) : <GlassPanel className="p-4 text-[12.5px] text-ink-muted">No categories showing meaningful rank improvement today.</GlassPanel>}
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Improving AMCs</div>
                {improvingAmcs.length ? improvingAmcs.map((a) => (
                  <GlassPanel key={a.name} className="mb-2.5 p-4">
                    <div className="flex items-center justify-between">
                      <Link href={`/amc/${encodeURIComponent(a.name + " Mutual Fund")}`} className="text-[13.5px] font-semibold text-ink hover:text-accent-soft">{a.name}</Link>
                      <span className="tnum text-[12px] text-pos">#{a.rank3m}→#{a.rank1m}</span>
                    </div>
                    <p className="mt-1 text-[12px] text-ink-muted">1M average {pctStr(a.avg1m)} vs 3M average {pctStr(a.avg3m)}.</p>
                    <Provenance source="AMFI daily NAV, 1M-vs-3M AMC rank" timestamp={asOf} confidence="High" />
                  </GlassPanel>
                )) : <GlassPanel className="p-4 text-[12.5px] text-ink-muted">No AMCs showing meaningful rank improvement today.</GlassPanel>}
              </div>
            </div>
          </WorkspaceSection>

          {/* 5. Industry Snapshot */}
          <WorkspaceSection n="05" title="Industry Snapshot" action={<Link href="/brief" className="premium-link">Full industry brief <span aria-hidden="true">→</span></Link>}>
            <GlassPanel className="p-5 sm:p-6">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div><div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Total industry AUM</div><div className="mt-1 financial-number text-lg font-semibold text-ink">{flowHeadline.total_aum_cr ? lakhCr(flowHeadline.total_aum_cr) : "—"}</div></div>
                <div><div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Equity net (month)</div><div className={`mt-1 financial-number text-lg font-semibold ${(flowHeadline.equity_net_cr ?? 0) >= 0 ? "text-pos" : "text-neg"}`}>{flowHeadline.equity_net_cr != null ? signedInrCr(flowHeadline.equity_net_cr) : "—"}</div></div>
                <div><div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">1-day breadth</div><div className="mt-1 financial-number text-lg font-semibold text-ink">{daily.industry?.breadth1d != null ? `${daily.industry.breadth1d}%` : "—"}</div></div>
                <div><div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Risk regime</div><div className="mt-1 text-lg font-semibold text-ink">{daily.industry?.riskRegime || "—"}</div></div>
              </div>
              <Provenance source="AMFI Monthly Report (MCR) · AMFI daily NAV" timestamp={flowHeadline.month ? `flow: ${flowHeadline.month} · breadth: ${asOf}` : asOf} confidence="High" />
              <p className="mt-3 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
                Not shown yet: SIP statistics (no clean official per-scheme source found), new-scheme launches and closures (tracked internally by the coverage engine, not yet exposed here), and regulatory updates.
              </p>
            </GlassPanel>
          </WorkspaceSection>

          {/* 6. Watchlist */}
          <WorkspaceSection n="06" title="Watchlist" detail="What changed for the funds you're tracking, compared against what this browser last saw." action={<Link href="/funds" className="premium-link">Browse funds <span aria-hidden="true">→</span></Link>}>
            <GlassPanel className="p-5 sm:p-6"><HomeWatchlistSection /></GlassPanel>
          </WorkspaceSection>

          {/* 7. Data Health */}
          <WorkspaceSection n="07" title="Data Health" detail="Shown openly, not hidden — including where coverage is thin." action={<Link href="/data-status" className="premium-link">Full data status <span aria-hidden="true">→</span></Link>}>
            <GlassPanel className="p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">NAV freshness</div>
                  <div className="mt-1 text-[14px] font-semibold text-ink">{market.navLine}</div>
                  <Provenance source="AMFI NAVAll.txt" timestamp={asOf} confidence={freshnessTone(market.tone) === "current" ? "High" : "Medium"} />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Scheme coverage</div>
                  <div className="mt-1 text-[14px] font-semibold text-ink">{fmt(funds.length)} schemes · {fmt(amcCount)} AMCs</div>
                  <Provenance source="AMFI NAVAll.txt, full universe" timestamp={asOf} confidence="High" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-[0.08em] text-ink-faint">Fund-level detail (manager, expense, holdings)</div>
                  <div className="mt-1 text-[14px] font-semibold text-ink">{fmt(metaN)} verified schemes · {factsheetAmcCount} AMC factsheet engines</div>
                  <Provenance source="AMC factsheet PDF" timestamp={fieldCoverage.factsheetLastUpdated} confidence="Low" />
                </div>
              </div>
              <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
                MF Pulse shows coverage gaps as they are — {fmt(metaN)} of {fmt(funds.length)} schemes have factsheet-verified detail so far, growing with each AMC we add. A low number here means real, disclosed thinness, not a hidden problem. Full per-field breakdown on the data status page.
              </p>
            </GlassPanel>
          </WorkspaceSection>
        </div>

        <section className="container-px pb-16"><AlertSignup /></section>
      </main>
      <Footer note={<span>Daily NAV intelligence from AMFI · latest available date: <b className="text-ink-muted">{asOf || "unavailable"}</b> · <Link href="/data-status" className="text-accent">Review data status →</Link></span>} />
    </>
  );
}
