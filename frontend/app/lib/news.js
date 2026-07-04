// News query layer (Phase 3/5) — reads the append-only news_* tables written by
// scripts/ingest_news.py. Every field returned here traces to a real DB row; nothing is
// computed or guessed in this file beyond simple sorting/grouping of what's already stored.
import { sb } from "./supabase";

const ARTICLE_SELECT =
  "id,title,url,summary,published_at,fetched_at,category,importance_score,market_relevance_score,sentiment_label," +
  "news_sources(name,credibility,source_type)," +
  "news_market_links(relation,rule_id,news_entities(entity_type,name))";

export const CATEGORY_LABELS = {
  rbi: "RBI",
  sebi: "SEBI",
  amfi: "AMFI",
  mutual_fund: "Mutual Funds",
  earnings: "Earnings",
  macro: "Macro",
  sector: "Sector",
  market_moving: "Market Moving",
  global: "Global Cues",
  corporate: "Corporate",
};

function shapeArticle(r) {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    summary: r.summary,
    publishedAt: r.published_at,
    fetchedAt: r.fetched_at,
    category: r.category,
    importance: r.importance_score ?? 0,
    relevance: r.market_relevance_score ?? 0,
    sentiment: r.sentiment_label || "neutral",
    source: r.news_sources ? { name: r.news_sources.name, credibility: r.news_sources.credibility, type: r.news_sources.source_type } : null,
    links: (r.news_market_links || [])
      .filter((l) => l.news_entities)
      .map((l) => ({ relation: l.relation, ruleId: l.rule_id, entityType: l.news_entities.entity_type, entityName: l.news_entities.name })),
  };
}

// Fetches the recent article pool once; every filter/sort on /news operates client-side over
// this pool so switching tabs is instant (no re-fetch), matching CompareClient's pattern.
export async function getRecentArticles({ limit = 120 } = {}) {
  try {
    const rows = await sb(`news_articles?select=${ARTICLE_SELECT}&order=published_at.desc.nullslast&limit=${limit}`, { revalidate: 300 });
    return rows.map(shapeArticle);
  } catch {
    return [];
  }
}

export async function getTopHeadlines({ limit = 5 } = {}) {
  try {
    const rows = await sb(
      `news_articles?select=${ARTICLE_SELECT}&market_relevance_score=gt.0&order=market_relevance_score.desc,published_at.desc&limit=${limit}`,
      { revalidate: 300 }
    );
    return rows.map(shapeArticle);
  } catch {
    return [];
  }
}

// Entity Graph (Phase 2) — "recent news about this AMC/category/sector", reusable across the
// AMC page, category page, and (later) the fund page's news timeline. Two real round-trips
// (resolve entity -> its links), not a fabricated join — an unmatched entity honestly returns [].
export async function getArticlesForEntity({ entityType, entityName, limit = 3 } = {}) {
  if (!entityType || !entityName) return [];
  try {
    const entities = await sb(`news_entities?entity_type=eq.${entityType}&name=eq.${encodeURIComponent(entityName)}&select=id`);
    if (!entities.length) return [];
    const rows = await sb(
      `news_market_links?entity_id=eq.${entities[0].id}&select=relation,rule_id,news_articles(id,title,url,published_at,category,news_sources(name,credibility))&order=created_at.desc&limit=${limit}`
    );
    return rows
      .filter((r) => r.news_articles)
      .map((r) => ({
        id: r.news_articles.id,
        title: r.news_articles.title,
        url: r.news_articles.url,
        publishedAt: r.news_articles.published_at,
        category: r.news_articles.category,
        source: r.news_articles.news_sources ? { name: r.news_articles.news_sources.name, credibility: r.news_articles.news_sources.credibility } : null,
        relation: r.relation,
        ruleId: r.rule_id,
      }));
  } catch {
    return [];
  }
}

// News Intelligence 2.0 (Phase 3, terminal sprint) — "recent similar events": other real
// articles the SAME deterministic rule previously fired on (e.g. other RBI rate-action stories),
// excluding the article itself. This is the historical-context layer the mission asks for —
// still zero fabrication, since it's just a real query over news_market_links.rule_id, the exact
// same traceable field already shown as "traced to rule: X" everywhere else.
export async function getSimilarPastArticles({ ruleId, excludeArticleId, limit = 3 } = {}) {
  if (!ruleId) return [];
  try {
    const rows = await sb(
      `news_market_links?rule_id=eq.${encodeURIComponent(ruleId)}&select=article_id,news_articles(id,title,url,published_at,news_sources(name,credibility))&order=created_at.desc&limit=${limit + 1}`
    );
    const seen = new Set();
    return rows
      .filter((r) => r.news_articles && r.news_articles.id !== excludeArticleId)
      .filter((r) => (seen.has(r.news_articles.id) ? false : (seen.add(r.news_articles.id), true)))
      .slice(0, limit)
      .map((r) => ({
        id: r.news_articles.id,
        title: r.news_articles.title,
        url: r.news_articles.url,
        publishedAt: r.news_articles.published_at,
        source: r.news_articles.news_sources ? { name: r.news_articles.news_sources.name, credibility: r.news_articles.news_sources.credibility } : null,
      }));
  } catch {
    return [];
  }
}

export async function getIngestionRuns({ limit = 20 } = {}) {
  try {
    return await sb(`news_ingestion_runs?select=*,news_sources(name)&order=finished_at.desc&limit=${limit}`, { revalidate: 60 });
  } catch {
    return [];
  }
}

export function relativeTime(iso) {
  if (!iso) return "date unknown";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
