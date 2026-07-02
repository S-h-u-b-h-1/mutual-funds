"use client";
// Interactive client half of /news (Phase 3/5) — all filtering/sorting happens over the
// already-fetched article pool (no re-fetch), mirroring the CompareClient split pattern.
// Every relation shown is a real row from news_market_links; nothing here is inferred or
// hallucinated — hedged language ("may affect" etc.) is preserved verbatim from the data.
import { useEffect, useRef, useState } from "react";
import { track } from "../lib/track";
import { relativeTime, CATEGORY_LABELS } from "../lib/news";
import Badge, { EmptyState } from "./ui/Badge";
import GlassPanel from "./ui/GlassPanel";
import AdvisorSoftCTA from "./AdvisorSoftCTA";

const FILTERS = [
  { key: "latest", label: "Latest", test: null },
  { key: "market_moving", label: "Market Moving", test: (a) => a.category === "market_moving" },
  { key: "rbi", label: "RBI", test: (a) => a.category === "rbi" },
  { key: "sebi", label: "SEBI", test: (a) => a.category === "sebi" },
  { key: "mutual_fund", label: "Mutual Funds", test: (a) => a.category === "mutual_fund" },
  { key: "macro", label: "Macro", test: (a) => a.category === "macro" },
  { key: "sector", label: "Sector", test: (a) => a.category === "sector" },
  { key: "earnings", label: "Earnings", test: (a) => a.category === "earnings" },
  { key: "global", label: "Global Cues", test: (a) => a.category === "global" },
];

const SORTS = [
  { key: "latest", label: "Latest" },
  { key: "relevant", label: "Most relevant" },
  { key: "impact", label: "Highest impact" },
  { key: "connected", label: "Most connected" },
];

const FRESHNESS = [
  { key: "all", label: "All time" },
  { key: "24h", label: "Last 24h" },
  { key: "7d", label: "Last 7d" },
];

const CREDIBILITY_TONE = { official: "accent" };
const SENTIMENT_TONE = { positive: "pos", negative: "neg", mixed: "warn" };

function sourceCredibilityTone(source) {
  if (!source) return "neutral";
  return CREDIBILITY_TONE[source.credibility] || "neutral";
}

function isStale(publishedAt) {
  if (!publishedAt) return false;
  return Date.now() - new Date(publishedAt).getTime() > 48 * 60 * 60 * 1000;
}

function withinFreshness(publishedAt, key) {
  if (key === "all") return true;
  if (!publishedAt) return false;
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  if (key === "24h") return ageMs <= 24 * 60 * 60 * 1000;
  if (key === "7d") return ageMs <= 7 * 24 * 60 * 60 * 1000;
  return true;
}

function NewsCard({ article: a, onRelatedClick, highlighted }) {
  const [expanded, setExpanded] = useState(false);
  const trackedExpand = useRef(false);
  const stale = isStale(a.publishedAt);
  const hasLinks = a.links && a.links.length > 0;
  const hasScores = (a.importance || 0) > 0 || (a.relevance || 0) > 0;
  const sentimentTone = SENTIMENT_TONE[a.sentiment];

  function toggleExpand() {
    setExpanded((v) => !v);
    if (!trackedExpand.current) {
      trackedExpand.current = true;
      track("news_expand_why", { article: a.id });
    }
  }

  return (
    <GlassPanel className={`p-4 sm:p-5 transition-colors ${highlighted ? "border-accent bg-accent/[0.04]" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Badge tone={sourceCredibilityTone(a.source)}>{a.source?.name || "Unknown source"}</Badge>
        <Badge tone="neutral">{CATEGORY_LABELS[a.category] || a.category}</Badge>
        {sentimentTone && <Badge tone={sentimentTone}>{a.sentiment}</Badge>}
        <span className="text-[11px] text-ink-faint">
          {relativeTime(a.publishedAt)}
          {stale && <span className="text-ink-faint"> · older story</span>}
        </span>
      </div>

      <a
        href={a.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("news_article_click", { article: a.id })}
        className="block text-[15px] font-semibold leading-snug text-ink hover:text-accent-soft transition-colors"
      >
        {a.title}
      </a>

      {a.summary && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{a.summary}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px]">
        <a
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("news_source_click", { article: a.id, label: a.source?.name })}
          className="text-accent-soft hover:underline"
        >
          source ↗
        </a>
        {hasScores && (
          <span className="tnum text-ink-faint">
            Impact {a.importance || 0}/100 · Relevance {a.relevance || 0}/100
          </span>
        )}
      </div>

      {hasLinks && (
        <div className="mt-3">
          <button
            type="button"
            onClick={toggleExpand}
            className="text-[12px] font-medium text-ink-muted hover:text-accent-soft transition-colors"
          >
            Why this matters {expanded ? "▴" : "▾"}
          </button>
          {expanded && (
            <ul className="mt-2 space-y-2 border-l border-line pl-3">
              {a.links.map((l, i) => (
                <li key={i} className="text-[12.5px] text-ink-muted">
                  <span>
                    {l.relation} {l.entityType}:{" "}
                    <button
                      type="button"
                      onClick={() => {
                        track("news_related_category_click", { category: l.entityName });
                        onRelatedClick?.(l);
                      }}
                      className="font-medium text-ink underline decoration-dotted underline-offset-2 hover:text-accent-soft"
                    >
                      {l.entityName}
                    </button>
                  </span>
                  {l.ruleId && (
                    <div className="text-[10.5px] text-ink-faint mt-0.5">traced to rule: {l.ruleId}</div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </GlassPanel>
  );
}

export default function NewsClient({ articles = [], runs = [] }) {
  const [filter, setFilter] = useState("latest");
  const [sort, setSort] = useState("latest");
  const [source, setSource] = useState("all");
  const [highImpactOnly, setHighImpactOnly] = useState(false);
  const [freshness, setFreshness] = useState("all");
  const [highlightEntity, setHighlightEntity] = useState(null);

  useEffect(() => {
    track("news_page_view", {});
  }, []);

  const sources = Array.from(
    new Set(articles.map((a) => a.source?.name).filter(Boolean))
  ).sort();

  function matchesFilter(a, key) {
    const f = FILTERS.find((f) => f.key === key);
    return !f?.test || f.test(a);
  }

  function selectFilter(key) {
    setFilter(key);
    track("news_filter_used", { filter: key });
  }

  function selectSource(name) {
    setSource(name);
    track("news_filter_used", { filter: `source:${name}` });
  }

  function toggleHighImpact() {
    setHighImpactOnly((v) => {
      const next = !v;
      track("news_filter_used", { filter: next ? "high_impact_only" : "high_impact_off" });
      return next;
    });
  }

  function selectFreshness(key) {
    setFreshness(key);
    track("news_filter_used", { filter: `freshness:${key}` });
  }

  function selectSort(key) {
    setSort(key);
    track("news_filter_used", { filter: `sort:${key}` });
  }

  let pool = articles
    .filter((a) => matchesFilter(a, filter))
    .filter((a) => source === "all" || a.source?.name === source)
    .filter((a) => !highImpactOnly || (a.importance || 0) >= 60)
    .filter((a) => withinFreshness(a.publishedAt, freshness));

  pool = [...pool].sort((a, b) => {
    if (sort === "relevant") return (b.relevance || 0) - (a.relevance || 0);
    if (sort === "impact") return (b.importance || 0) - (a.importance || 0);
    if (sort === "connected") return (b.links?.length || 0) - (a.links?.length || 0);
    return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });

  const noArticlesAtAll = articles.length === 0;

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {FILTERS.map((f) => {
          const count = articles.filter((a) => matchesFilter(a, f.key)).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => selectFilter(f.key)}
              className={`rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                active
                  ? "border-accent bg-accent/10 text-accent-soft"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {f.label} <span className="tnum text-ink-faint">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5 text-[12px]">
        <label className="flex items-center gap-1.5 text-ink-muted">
          Source
          <select
            value={source}
            onChange={(e) => selectSource(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink"
          >
            <option value="all">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={toggleHighImpact}
          className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${
            highImpactOnly
              ? "border-accent bg-accent/10 text-accent-soft"
              : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
          }`}
        >
          High impact only
        </button>

        <div className="flex gap-1">
          {FRESHNESS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => selectFreshness(f.key)}
              className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${
                freshness === f.key
                  ? "border-accent bg-accent/10 text-accent-soft"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <label className="ml-auto flex items-center gap-1.5 text-ink-muted">
          Sort
          <select
            value={sort}
            onChange={(e) => selectSort(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {highlightEntity && (
        <div className="mb-3 flex items-center gap-2 text-[11.5px] text-accent-soft">
          <span>Highlighting articles connected to "{highlightEntity}"</span>
          <button
            type="button"
            onClick={() => setHighlightEntity(null)}
            className="text-ink-faint hover:text-ink underline"
          >
            clear
          </button>
        </div>
      )}

      {pool.length === 0 ? (
        noArticlesAtAll ? (
          <EmptyState
            title="No news yet"
            hint="News ingestion is configured but no articles are available yet. Run the news pipeline to populate this page."
          />
        ) : (
          <EmptyState
            title="No matching news"
            hint="No articles match the current filter. Try a different category or clear filters."
          />
        )
      ) : (
        <div className="space-y-3">
          {pool.map((a, i) => (
            <div key={a.id}>
              <NewsCard
                article={a}
                onRelatedClick={(l) => setHighlightEntity(l.entityName)}
                highlighted={!!highlightEntity && a.links?.some((l) => l.entityName === highlightEntity)}
              />
              {(i + 1) % 10 === 0 && <div className="my-3"><AdvisorSoftCTA context="news" /></div>}
            </div>
          ))}
        </div>
      )}

      {pool.length > 0 && pool.length % 10 !== 0 && (
        <AdvisorSoftCTA context="news" />
      )}
    </div>
  );
}
