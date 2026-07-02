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
