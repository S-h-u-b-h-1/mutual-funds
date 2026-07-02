"use client";
// Interactive client half of /news — all filtering/sorting/theme-browsing/timeline-grouping
// happens over the already-fetched, already server-enriched article pool (no re-fetch, and no
// import of marketImpact.js here — that module is server-only, its output already arrives as
// plain fields on each article: chains/themes/impact/research/exposure, computed in page.js).
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

const TIMELINE_ORDER = ["Today", "Yesterday", "This Week", "Earlier"];
const IMPACT_TONE = { Critical: "accent", High: "accent", Medium: "neutral", Low: "neutral" };
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

// Today/Yesterday/This Week/Earlier (Phase 4) — computed against the real clock at render time
// (this is a client component, so a fresh Date() here is fine, no server/client mismatch risk).
function timelineBucket(publishedAt) {
  if (!publishedAt) return "Earlier";
  const d = new Date(publishedAt);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);
  if (d >= startOfToday) return "Today";
  if (d >= startOfYesterday) return "Yesterday";
  if (d >= startOfWeek) return "This Week";
  return "Earlier";
}

function ChainBreadcrumb({ chain }) {
  if (!chain || chain.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-[11.5px] text-ink-muted">
      {chain.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="rounded border border-line bg-white/[0.03] px-1.5 py-0.5 text-ink">{s}</span>
          {i < chain.length - 1 && <span className="text-ink-faint">→</span>}
        </span>
      ))}
    </div>
  );
}

function ExposureSection({ article: a }) {
  const funds = a.exposure?.funds || {};
  const sectors = a.exposure?.sectors || {};
  const fundEntries = Object.entries(funds).filter(([, v]) => v?.length > 0);
  const sectorEntries = Object.entries(sectors);
  if (!fundEntries.length && !sectorEntries.length) return null;

  return (
    <div className="mt-3 space-y-2 border-t border-line pt-2.5 text-[12px]">
      {fundEntries.map(([key, list]) => (
        <div key={key}>
          <span className="text-ink-faint">Funds worth researching ({key.split(":")[1]}): </span>
          {list.map((f, i) => (
            <span key={f.code}>
              <a href={`/fund/${f.code}`} className="text-ink hover:text-accent-soft">
                {f.name.replace(/ - (Direct|Regular).*/i, "")}
              </a>
              {f.grade && <span className="text-ink-faint"> ({f.grade})</span>}
              {i < list.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      ))}
      {sectorEntries.map(([sector, result]) => (
        <div key={sector}>
          <span className="text-ink-faint">Sector exposure ({sector}): </span>
          {result.available ? (
            result.funds.map((f, i) => (
              <span key={f.code}>
                <a href={`/fund/${f.code}`} className="text-ink hover:text-accent-soft">
                  {f.name.replace(/ - (Direct|Regular).*/i, "")}
                </a>
                <span className="text-ink-faint"> ({f.allocationPct}% allocation)</span>
                {i < result.funds.length - 1 ? ", " : ""}
              </span>
            ))
          ) : (
            <span className="text-ink-faint">Exposure unavailable.</span>
          )}
        </div>
      ))}
    </div>
  );
}

function NewsCard({ article: a, onRelatedClick, highlighted }) {
  const [expanded, setExpanded] = useState(false);
  const trackedExpand = useRef(false);
  const stale = isStale(a.publishedAt);
  const hasLinks = a.links && a.links.length > 0;
  const hasScores = (a.importance || 0) > 0 || (a.relevance || 0) > 0;
  const sentimentTone = SENTIMENT_TONE[a.sentiment];
  const topChain = a.chains?.[0];
  const secondaryThemes = (a.themes || []).filter((t) => t !== topChain?.theme);
  const research = Array.isArray(a.research) ? a.research : [];

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
        {a.impact?.tier && (
          <Badge
            tone={IMPACT_TONE[a.impact.tier] || "neutral"}
            title="Market Impact Score — breadth of affected sectors/categories/AMCs + regulatory weight + source credibility, not a sentiment signal"
          >
            {a.impact.tier} impact
          </Badge>
        )}
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
            <>
              {topChain && (
                <div className="mt-2">
                  <ChainBreadcrumb chain={topChain.chain} />
                  {secondaryThemes.length > 0 && (
                    <div className="mt-1 text-[10.5px] text-ink-faint">also relevant to: {secondaryThemes.join(", ")}</div>
                  )}
                </div>
              )}
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
              <ExposureSection article={a} />
              {research.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-2.5">
                  {research.map((r, i) => (
                    <a
                      key={i}
                      href={r.href}
                      onClick={() => track("news_research_link_click", { label: r.href })}
                      className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
                    >
                      {r.label}
                    </a>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </GlassPanel>
  );
}

function ThemeGrid({ articles, allThemes, themeCounts, activeTheme, onSelect }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Browse by theme</div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
            !activeTheme ? "border-accent bg-accent/10 text-accent-soft" : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
          }`}
        >
          All themes <span className="tnum text-ink-faint">{articles.length}</span>
        </button>
        {allThemes.map((t) => {
          const count = themeCounts[t] || 0;
          const active = activeTheme === t;
          return (
            <button
              key={t}
              type="button"
              disabled={count === 0 && !active}
              onClick={() => onSelect(t)}
              className={`rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors ${
                active
                  ? "border-accent bg-accent/10 text-accent-soft"
                  : count === 0
                  ? "border-line text-ink-faint/50 cursor-default"
                  : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              {t} <span className="tnum text-ink-faint">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function NewsClient({ articles = [], runs = [], themeCounts = {}, allThemes = [] }) {
  const [filter, setFilter] = useState("latest");
  const [theme, setTheme] = useState(null);
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

  function selectTheme(t) {
    setTheme(t);
    track("news_filter_used", { filter: t ? `theme:${t}` : "theme:all" });
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
    .filter((a) => !theme || a.themes?.includes(theme))
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
  // Timeline grouping only makes sense for chronological viewing — a "Most relevant"/"Highest
  // impact"/"Most connected" sort deliberately breaks date order, so grouping by date there
  // would look broken (e.g. a "Today" story below an "Earlier" one). Flat list for those.
  const useTimeline = sort === "latest";
  const buckets = useTimeline
    ? TIMELINE_ORDER.map((label) => ({ label, items: pool.filter((a) => timelineBucket(a.publishedAt) === label) })).filter((b) => b.items.length > 0)
    : [{ label: null, items: pool }];

  let cardIndex = 0;
  function renderCard(a) {
    cardIndex += 1;
    const showCta = cardIndex % 10 === 0;
    return (
      <div key={a.id}>
        <NewsCard
          article={a}
          onRelatedClick={(l) => setHighlightEntity(l.entityName)}
          highlighted={!!highlightEntity && a.links?.some((l) => l.entityName === highlightEntity)}
        />
        {showCta && <div className="my-3"><AdvisorSoftCTA context="news" /></div>}
      </div>
    );
  }

  return (
    <div>
      {allThemes.length > 0 && (
        <ThemeGrid articles={articles} allThemes={allThemes} themeCounts={themeCounts} activeTheme={theme} onSelect={selectTheme} />
      )}

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
        <div className="space-y-5">
          {buckets.map((b) => (
            <div key={b.label || "all"}>
              {b.label && <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{b.label}</div>}
              <div className="space-y-3">{b.items.map(renderCard)}</div>
            </div>
          ))}
        </div>
      )}

      {pool.length > 0 && cardIndex % 10 !== 0 && (
        <AdvisorSoftCTA context="news" />
      )}
    </div>
  );
}
