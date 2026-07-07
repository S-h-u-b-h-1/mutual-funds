// Watchlist Intelligence (Personal Operating System sprint, Phase 2) — server-only route since
// it needs allFunds()/metadata.json, which are never shipped to the client (see /api/search's
// own comment for why). The watchlist itself lives in the browser's localStorage, so the client
// component reads its own codes and asks this route for TODAY's real signal on each one.
//
// Deliberately returns only a snapshot of real numbers — no "yesterday vs today" here. This
// route has no memory of what a specific browser saw last time; that comparison is computed
// client-side against a locally-stored previous snapshot (see WatchlistIntelligence.jsx), which
// is the only honest way to answer "what changed since you last checked" without inventing a
// server-side per-user history that doesn't exist.
import { getFund, allFunds, asOf } from "../../lib/funds";
import { fundHealth } from "../../lib/fundHealth";
import { amcIntel, amcSlugify } from "../../lib/amcIntel";
import { researchPriority } from "../../lib/decisionEngine";
import { getArticlesForEntity } from "../../lib/news";

export async function GET(request) {
  const codes = (new URL(request.url).searchParams.get("codes") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30); // a watchlist this size already isn't "watching", it's the whole fund list

  if (!codes.length) return Response.json({ asOf, funds: [] });

  const funds = allFunds();
  const results = await Promise.all(
    codes.map(async (code) => {
      const f = getFund(code);
      if (!f) return { code, missing: true };

      const health = fundHealth(f);
      const amcInfo = amcIntel(funds, amcSlugify(f.amc), (f.assetClass || "").toLowerCase());
      const news = await Promise.all([
        getArticlesForEntity({ entityType: "category", entityName: f.category, limit: 2 }),
        getArticlesForEntity({ entityType: "amc", entityName: f.amc, limit: 2 }),
      ]).then(([a, b]) => {
        const seen = new Set();
        return [...a, ...b].filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true))).sort((x, y) => (y.relevance || 0) - (x.relevance || 0));
      });
      const topNews = news[0] || null;
      const priority = researchPriority(f, { amcPercentile: amcInfo?.percentile ?? null, newsImpact: topNews?.relevance ?? null });

      return {
        code,
        name: f.name,
        amc: f.amc,
        category: f.category,
        navDate: f.navDate,
        healthScore: health?.overall ?? null,
        healthGrade: health?.grade ?? null,
        attentionScore: f.attentionScore ?? null,
        attentionTier: f.attentionTier ?? null,
        attentionReason: f.attentionReason ?? null,
        amcRank: amcInfo?.rank ?? null,
        amcPercentile: amcInfo?.percentile ?? null,
        priorityScore: priority?.score ?? null,
        priorityTier: priority?.tier ?? null,
        topNews: topNews ? { title: topNews.title, url: topNews.url, relevance: topNews.relevance, publishedAt: topNews.publishedAt, source: topNews.source?.name ?? null } : null,
      };
    })
  );

  return Response.json({ asOf, funds: results });
}
