import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import Nav from "../../components/Nav";
import FundPageClient from "../../components/FundPageClient";
import Footer from "../../components/Footer";
import Tracker from "../../components/Tracker";
import NavChart from "../../components/NavChart";
import VolatilityChart from "../../components/VolatilityChart";

const RollingReturnChart = dynamic(() => import("../../components/RollingReturnChart"), { ssr: false });
import SectionHeader from "../../components/ui/SectionHeader";
import GlassPanel from "../../components/ui/GlassPanel";
import Badge from "../../components/ui/Badge";
import AdvisorSoftCTA from "../../components/AdvisorSoftCTA";
import WatchButton from "../../components/WatchButton";
import NextActions from "../../components/NextActions";
import ResearchNotes from "../../components/ResearchNotes";
import MetricTooltip from "../../components/ui/MetricTooltip";
import { getFund, cohortOf, asOf, benchmarkSlug, allFunds } from "../../lib/funds";
import { getNavHistory } from "../../lib/mfapi";
import { fundSignals, researchSummary, visibleReturns, riskInterpretation, benchmarkRows } from "../../lib/fundAnalysis";
import { fundHealth, gradeTone, LABELS } from "../../lib/fundHealth";
import { getMetadata, managerSlug } from "../../lib/metadata";
import { portfolioRisk } from "../../lib/portfolio";
import { fundCompleteness, researchReadiness, completenessTone } from "../../lib/completeness";
import { getArticlesForEntity, relativeTime } from "../../lib/news";
import { betaAlphaFor } from "../../lib/riskMetrics";
import { calendarReturns, rollingReturns } from "../../lib/rollingReturns";
import { amcIntel, amcSlugify } from "../../lib/amcIntel";
import { researchPriority, TIER_TONE, CONFIDENCE_LABEL, CONFIDENCE_TONE } from "../../lib/decisionEngine";

export const revalidate = 3600;

export async function generateMetadata({ params }) {
  const f = getFund(params.scheme_code);
  return { title: f ? `${f.name.replace(/ - (Direct|Regular).*/i, "")} — ${f.amc}` : "Fund" };
}

const freshness = (d) => (d == null ? ["neg", "No NAV"] : d === 0 ? ["pos", "NAV current"] : d <= 2 ? ["pos", `${d}d old`] : d <= 7 ? ["warn", `${d}d old`] : ["neg", "Stale"]);
// Listing state for schemes AMFI still lists but that are dormant/unpriced — shown honestly, never 404'd.
function listingNotice(f) {
  const st = f.quality?.status;
  if (st === "unpriced" || f.nav == null) return ["No NAV published", "AMFI lists this scheme but has not published a NAV, so no price, returns or risk can be shown. Identity only."];
  if (st === "dormant" || (f.staleDays != null && f.staleDays > 365)) return ["Dormant scheme", `Last NAV was ${f.navDate} (${f.staleDays}d ago). Likely wound up or merged — shown for reference; returns are not computed on a stale NAV.`];
  if (!f.active && f.staleDays > 7) return ["NAV stale", `Last NAV ${f.navDate} (${f.staleDays}d ago). Returns/risk are withheld until a fresh NAV — never extrapolated.`];
  return null;
}
const sgn = (v, dp = 2) => `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;

// AMC Rank (Phase 3 — Entity Graph) — how this fund ranks among its own AMC's other funds by
// Health Score, not just its category peers. Live-computed (no precomputed field exists for
// this), same discipline as the category page's own live ranking: real funds only (active,
// priced), never a fabricated position when there's nothing to rank against.
function amcRank(f) {
  const peers = allFunds().filter((x) => x.amc === f.amc && x.active !== false && x.nav != null);
  const scored = peers.map((x) => ({ code: x.code, h: fundHealth(x)?.overall ?? null })).filter((x) => x.h != null);
  if (scored.length < 2) return null;
  scored.sort((a, b) => b.h - a.h);
  const idx = scored.findIndex((x) => x.code === f.code);
  return idx === -1 ? null : { rank: idx + 1, total: scored.length };
}

// Suggested Comparisons (Phase 9, terminal sprint — Research Assistant foundation) — real same-
// category-and-plan peers, ranked by the same Health Score shown above, excluding this fund.
// Deterministic, no invented "similar fund" logic beyond what catRank/catSize already use.
function suggestedComparisons(f, limit = 3) {
  const peers = allFunds().filter((x) => x.category === f.category && x.plan === f.plan && x.code !== f.code && x.active !== false && x.nav != null);
  return peers
    .map((x) => {
      const h = fundHealth(x);
      return { code: x.code, name: x.name.replace(/ - (Direct|Regular).*/i, ""), amc: x.amc, r1m: x.r1m ?? null, health: h?.overall ?? null, grade: h?.grade ?? null };
    })
    .filter((x) => x.health != null)
    .sort((a, b) => b.health - a.health)
    .slice(0, limit);
}

// Plain-language explanations for the Health Score's components (Phase 6 — never assume
// financial knowledge). Keyed to fundHealth.js's LABELS.
const HEALTH_COMPONENT_EXPLAIN = {
  performance: "How this fund's returns compare to its own history and peers — real NAV returns, not projections.",
  consistency: "How often this fund posted a positive daily return over the last 90 days. Higher = steadier, not necessarily higher-returning.",
  risk: "Based on volatility and maximum drawdown over 90 days — how much the NAV has swung, including its worst peak-to-trough fall.",
  categoryRank: "This fund's percentile rank against peers in the same category and plan (Direct/Regular), by recent return.",
  dataQuality: "How complete and fresh the underlying data is for this specific fund — stale or missing data lowers this, not the fund itself.",
  cost: "Based on the expense ratio disclosed in the AMC's factsheet. Shows 'cost n/a' when that factsheet hasn't been acquired yet — never estimated.",
  factsheet: "Whether AMC-disclosed portfolio data (holdings, sectors) was available to cross-check this fund's real diversification.",
};

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
  const port = portfolioRisk(meta);                       // portfolio risk from real holdings/sectors
  const health = fundHealth({
    ...f,
    expenseRatio: meta?.expense_ratio ?? null,            // cost activates with real TER
    metaComplete: meta?.completeness ?? null,             // factsheet component activates with real data
    portfolioScore: port?.score ?? null,
  });
  const [fTone, fLabel] = freshness(f.staleDays === 9999 ? null : f.staleDays);
  const notice = listingNotice(f);
  const histDays = history?.points?.length || 0;
  const completeness = fundCompleteness(f, meta);
  const readiness = researchReadiness(f, meta);
  const aRank = amcRank(f);
  const relatedNews = await Promise.all([
    getArticlesForEntity({ entityType: "category", entityName: f.category, limit: 3 }),
    getArticlesForEntity({ entityType: "amc", entityName: f.amc, limit: 3 }),
  ]).then(([catNews, amcNews]) => {
    const seen = new Set();
    return [...catNews, ...amcNews]
      .filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
      .sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
      .slice(0, 3);
  });
  // Institutional risk ratios — computed only when 1Y return + risk series exist (no estimation).
  const RF = 6.5; // disclosed risk-free (≈ India 1Y T-bill)
  const sharpe = f.r1y != null && f.vol90 ? +((f.r1y - RF) / f.vol90).toFixed(2) : null;
  const sortino = f.r1y != null && f.dvol90 ? +((f.r1y - RF) / f.dvol90).toFixed(2) : null;
  // Real Beta/Alpha/Info Ratio/Treynor — only for the ~227 funds benchmarked exactly to Nifty 50
  // TRI or Sensex TRI, only with enough real overlapping history (see lib/riskMetrics.js for the
  // disclosed price-index-vs-TRI caveat this carries).
  const riskStats = betaAlphaFor(history?.points, f.benchmark, { riskFreeAnnualPct: RF });
  const calReturns = calendarReturns(history?.points);
  const rollReturns = rollingReturns(history?.points, 12);
  const comparisons = suggestedComparisons(f);

  // Calculate category averages for Volatility, Drawdown, and Consistency to add peer context
  const peers = allFunds().filter(
    (x) => x.category === f.category && x.plan === f.plan && x.active !== false && x.nav != null
  );
  const peerVol = peers.map(x => x.vol90).filter(v => v != null);
  const categoryAvgVol = peerVol.length ? +(peerVol.reduce((s, v) => s + v, 0) / peerVol.length).toFixed(2) : null;

  const peerDvol = peers.map(x => x.dvol90).filter(v => v != null);
  const categoryAvgDvol = peerDvol.length ? +(peerDvol.reduce((s, v) => s + v, 0) / peerDvol.length).toFixed(2) : null;

  const peerMaxdd = peers.map(x => x.maxdd90).filter(v => v != null);
  const categoryAvgMaxdd = peerMaxdd.length ? +(peerMaxdd.reduce((s, v) => s + v, 0) / peerMaxdd.length).toFixed(2) : null;

  const peerConsistency = peers.map(x => x.consistency).filter(v => v != null);
  const categoryAvgConsistency = peerConsistency.length ? +(peerConsistency.reduce((s, v) => s + v, 0) / peerConsistency.length).toFixed(1) : null;

  // Decision Engine (Decision Support sprint) — Research Priority Score extends the existing
  // attention_score (real 1M-vs-3M category rank movement, from scripts/explain.py) with AMC
  // standing and linked-news impact, both real and already computed elsewhere on this page.
  const amcInfo = amcIntel(allFunds(), amcSlugify(f.amc), (f.assetClass || "").toLowerCase());
  const newsImpact = relatedNews.length ? Math.max(...relatedNews.map((n) => n.relevance || 0)) : null;
  const priority = researchPriority(f, { amcPercentile: amcInfo?.percentile ?? null, newsImpact });

  // "Why This Fund Deserves Attention" (Phase 2, Decision Support sprint) — every reason is
  // real and traceable: metric, previous value, current value, source, timestamp. Only reason
  // types with a genuine before/after value pair are ever shown; nothing is inferred.
  const attentionReasons = [];
  if (f.attentionScore != null) {
    attentionReasons.push({
      metric: "Category rank (3M → 1M)",
      detail: f.attentionReason,
      source: "AMFI NAV, category cohort ranking",
      timestamp: f.navDate,
    });
  }
  if (relatedNews.length) {
    const top = [...relatedNews].sort((a, b) => (b.relevance || 0) - (a.relevance || 0))[0];
    attentionReasons.push({
      metric: "Linked market news",
      detail: `"${top.title}" — relevance ${top.relevance}/100, linked via this fund's category (${f.category}) or AMC (${f.amc}).`,
      source: top.source?.name || "News source",
      timestamp: top.publishedAt,
    });
  }
  if (amcInfo?.rank != null) {
    attentionReasons.push({
      metric: "AMC standing",
      detail: `${f.amc} ranks #${amcInfo.rank} of ${amcInfo.totalAmcs} ${f.assetClass || ""} AMCs (percentile ${amcInfo.percentile}), beat rate ${amcInfo.beatPct}%.`,
      source: "Cross-AMC comparison, same asset class",
      timestamp: asOf,
    });
  }
  // Chronological, not insertion order — this is the fund's real decision timeline today.
  // Deeper history (factsheet/manager/benchmark changes) will extend this automatically once
  // factsheet_archive holds a second snapshot per scheme (detect_changes() is already wired for
  // it) — not shown yet because showing it would mean inferring a change from one data point.
  attentionReasons.sort((a, b) => String(b.timestamp || "").localeCompare(String(a.timestamp || "")));

  return (
    <>
      <Nav active="/funds" />
      <Tracker event="fund_view" payload={{ code: f.code, category: f.category, amc: f.amc }} view={{ type: "fund", id: f.code, name: f.name.replace(/ - (Direct|Regular).*/i, ""), amc: f.amc, category: f.category }} />
      <FundPageClient fund={f} cohort={cohort} history={history} sig={sig} rets={rets} bench={bench} meta={meta} port={port} health={health} notice={notice} fTone={fTone} fLabel={fLabel} sharpe={sharpe} sortino={sortino} riskStats={riskStats} calReturns={calReturns} rollReturns={rollReturns} comparisons={comparisons} relatedNews={relatedNews} priority={priority} attentionReasons={attentionReasons} completeness={completeness} readiness={readiness} aRank={aRank} asOf={asOf} categoryAvgVol={categoryAvgVol} categoryAvgDvol={categoryAvgDvol} categoryAvgMaxdd={categoryAvgMaxdd} categoryAvgConsistency={categoryAvgConsistency} />
      <Footer note={<span>NAV as of {f.navDate} · daily data, not real-time · past performance ≠ future returns · source AMFI / MFAPI. Platform as of {asOf}.</span>} />
    </>
  );
}
