import { getRecentArticles, getIngestionRuns, getSimilarPastArticles, getNewsSourceHealth } from "../lib/news";
import { newsStatus } from "../lib/newsStatus";
import { impactChainsFor, themesFor, impactScoreFor, researchLinksFor, fundsWorthResearching, sectorExposure, THEMES } from "../lib/marketImpact";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import ProductBreadcrumbs from "../components/ProductBreadcrumbs";
import GlassPanel from "../components/ui/GlassPanel";
import NewsClient from "../components/NewsClient";
import FreshnessBadge from "../components/ui/FreshnessBadge";

export const metadata = { title: "Market News Intelligence" };
export const revalidate = 300;

// Server-only enrichment (marketImpact.js reads the 4MB funds.json bundle — never import it from
// a "use client" file). Computed once per revalidate window (300s), not per request. Per-article
// try/catch so one malformed article's links can never blank the whole page.
async function enrichArticle(article, { withHistory = false } = {}) {
  try {
    const chains = impactChainsFor(article.links);
    const themes = themesFor(article.links);
    const impact = impactScoreFor(article);
    const research = researchLinksFor(article);

    const funds = {};
    const sectors = {};
    const seen = new Set();
    for (const l of article.links || []) {
      const key = `${l.entityType}:${l.entityName}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (l.entityType === "category" || l.entityType === "amc" || l.entityType === "index") {
        funds[key] = fundsWorthResearching(l, { limit: 2 });
      } else if (l.entityType === "sector") {
        sectors[l.entityName] = sectorExposure(l.entityName, { limit: 2 });
      }
    }

    // News Intelligence 2.0 (Phase 3, terminal sprint) — historical context: other real articles
    // the same primary rule previously fired on. Only computed for a bounded subset (withHistory)
    // — an extra DB round-trip per article isn't worth paying for all 120 fetched articles when
    // only the most recent/relevant ones are likely to actually get expanded and read.
    const primaryRuleId = chains[0]?.ruleId;
    const similarPast = withHistory && primaryRuleId
      ? await getSimilarPastArticles({ ruleId: primaryRuleId, excludeArticleId: article.id, limit: 3 })
      : [];

    return { ...article, chains, themes, impact, research, exposure: { funds, sectors }, similarPast };
  } catch {
    return { ...article, chains: [], themes: [], impact: null, research: [], exposure: { funds: {}, sectors: {} }, similarPast: [] };
  }
}

export default async function News() {
  const referenceNow = new Date().toISOString();
  let articles = [];
  let runs = [];
  let sources = null;
  try {
    [articles, runs, sources] = await Promise.all([
      getRecentArticles({ limit: 120 }),
      getIngestionRuns({ limit: 20 }),
      getNewsSourceHealth(),
    ]);
  } catch {
    articles = [];
    runs = [];
  }

  const HISTORY_BOUND = 30; // cap the extra "similar past events" query to the most recent 30 articles
  articles = await Promise.all(articles.map((a, i) => enrichArticle(a, { withHistory: i < HISTORY_BOUND })));
  const themeCounts = THEMES.reduce((acc, t) => {
    acc[t] = articles.filter((a) => a.themes?.includes(t)).length;
    return acc;
  }, {});

  const status = newsStatus(runs);

  // "Sources active" = distinct sources with at least one successful ingestion run in the
  // fetched run history — a real, traceable count from news_ingestion_runs, not a guess.
  const activeSources = sources ? sources.filter(s => s.state === "healthy").length : "Unavailable";

  const lastFetchedLabel = status.lastSuccessAt
    ? new Date(status.lastSuccessAt).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }) + " IST"
    : "never";

  return (
    <>
      <Nav active="/news" />
      <main className="container-px py-10 sm:py-14">
        <ProductBreadcrumbs items={[["Markets", "/markets"], ["News", null]]} />
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div><div className="eyebrow text-accent">News intelligence</div><h1 className="page-title mt-3">Connect financial events to mutual-fund research.</h1><p className="measure mt-4 text-sm leading-6 text-ink-muted">Near-real-time financial news, regulatory updates, and market events mapped to relevant categories, AMCs, sectors, and funds through traceable rules.</p></div>
          <FreshnessBadge status={status.tone === "pos" ? "current" : status.tone === "warn" ? "delayed" : "stale"}>{status.tone === "pos" ? "Near-real-time feed" : status.label}</FreshnessBadge>
        </div>

        <GlassPanel className="mt-8 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                Last fetched
              </div>
              <div className="mt-1 text-[14px] font-semibold tnum text-ink">{lastFetchedLabel}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                Healthy sources
              </div>
              <div className="mt-1 text-[14px] font-semibold tnum text-ink">{activeSources}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.09em] text-ink-faint">
                Ingestion status
              </div>
              <div
                className={`mt-1 text-[14px] font-semibold ${
                  status.tone === "pos" ? "text-pos" : status.tone === "warn" ? "text-warn" : "text-neg"
                }`}
              >
                {status.tone === "pos" ? "Recently updated" : status.tone === "warn" ? "Delayed" : "Not running"}
              </div>
            </div>
          </div>
          {status.tone !== "pos" && (
            <p
              className={`mt-3 text-[12px] leading-relaxed ${
                status.tone === "warn" ? "text-warn" : "text-neg"
              }`}
            >
              {status.label}
            </p>
          )}
        </GlassPanel>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Market impact overview">
          <div className="research-surface p-4"><div className="eyebrow">Articles</div><div className="financial-number mt-2 text-xl font-semibold text-ink">{articles.length}</div><p className="mt-1 text-xs text-ink-faint">Current fetched window</p></div>
          <div className="research-surface p-4"><div className="eyebrow">Themes</div><div className="financial-number mt-2 text-xl font-semibold text-ink">{Object.values(themeCounts).filter(Boolean).length}</div><p className="mt-1 text-xs text-ink-faint">Themes with matching articles</p></div>
          <div className="research-surface p-4"><div className="eyebrow">Healthy sources</div><div className="financial-number mt-2 text-xl font-semibold text-ink">{activeSources}</div><p className="mt-1 text-xs text-ink-faint">Recent success and dated content</p></div>
          <div className="research-surface p-4"><div className="eyebrow">Method</div><div className="mt-2 text-sm font-semibold text-ink">Rule-based links</div><p className="mt-1 text-xs text-ink-faint">No generative classification</p></div>
        </section>

        <details className="research-surface mt-4 p-4">
          <summary className="cursor-pointer text-sm font-semibold">Source-by-source health</summary>
          <p className="mt-2 text-xs text-ink-faint">Recent ingestion does not make old articles current. Health uses the last 20 runs per source, a one-hour success window and a 48-hour article-age threshold. Undated or future-dated articles are degraded.</p>
          {sources ? <ul className="mt-3 space-y-2 text-xs">{sources.map(source => <li key={source.name}>
            <strong>{source.name}</strong> — {source.state}; {source.failedRuns}/{source.sampledRuns} sampled runs failed; latest article: {source.lastArticleAt || "date unavailable"}
          </li>)}</ul> : <p className="mt-3 text-sm">Source health is unavailable.</p>}
        </details>

        <div className="mt-10">
          <NewsClient articles={articles} runs={runs} themeCounts={themeCounts} allThemes={THEMES} referenceNow={referenceNow} />
        </div>
      </main>
      <Footer
        note={
          <span>
            News from RBI, SEBI, Economic Times, Mint, CNBC-TV18 · classification is rule-based, not
            AI-generated · see /methodology
          </span>
        }
      />
    </>
  );
}
