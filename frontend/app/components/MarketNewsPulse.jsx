"use client";
// Homepage "Market News Pulse" — surfaces the highest market-relevance headlines from the
// news ingestion pipeline. Every "why it matters" line traces to a real news_market_links row
// produced by the deterministic rule engine (ingestion/market_reaction.py) — hedged language
// only, never a prediction or recommendation. Honest empty state when no articles exist yet.
import SectionHeader from "./ui/SectionHeader";
import PremiumButton from "./ui/PremiumButton";
import Badge, { EmptyState } from "./ui/Badge";
import { CATEGORY_LABELS, relativeTime } from "../lib/news";
import { track } from "../lib/track";

const CATEGORY_TONE = {
  rbi: "accent",
  sebi: "accent",
  amfi: "accent",
  market_moving: "warn",
};

function categoryBadge(category) {
  if (!category) return null;
  const label = CATEGORY_LABELS[category] || category;
  const tone = CATEGORY_TONE[category] || "neutral";
  return <Badge tone={tone}>{label}</Badge>;
}

function whyItMatters(links) {
  if (!links || links.length === 0) return null;
  const phrases = links.slice(0, 2).map((l) => {
    const relation = l.relation ? l.relation.charAt(0).toUpperCase() + l.relation.slice(1) : "Relevant to";
    return `${relation} ${l.entityType}: ${l.entityName}`;
  });
  return phrases.join(" · ");
}

function HeadlineCard({ article }) {
  const isOfficial = article.source?.credibility === "official";
  const why = whyItMatters(article.links);

  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("homepage_news_click", { article: article.id })}
      className="glass block p-4 transition-colors hover:bg-white/[0.04]"
    >
      <div className="flex flex-wrap items-center gap-2">
        {isOfficial ? <Badge tone="accent">official</Badge> : null}
        {categoryBadge(article.category)}
        <span className="text-[11px] text-ink-faint">{relativeTime(article.publishedAt)}</span>
      </div>
      <div className="mt-2 text-[13.5px] font-medium leading-snug text-ink">{article.title}</div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
        {article.source?.name && <span>{article.source.name}</span>}
      </div>
      {why && (
        <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
          <span className="text-accent-soft">▸</span> {why}
        </p>
      )}
    </a>
  );
}

export default function MarketNewsPulse({ articles }) {
  const hasArticles = Array.isArray(articles) && articles.length > 0;

  return (
    <>
      <SectionHeader
        eyebrow="real-time market intelligence"
        title="Market News Pulse"
        action={
          <PremiumButton href="/news" variant="subtle">
            See all news →
          </PremiumButton>
        }
      />
      {hasArticles ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {articles.slice(0, 5).map((a) => (
            <HeadlineCard key={a.id} article={a} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon="📰"
          title="No market news yet"
          hint="News ingestion is configured but no articles are available yet. Run the news pipeline to populate this section."
        />
      )}
    </>
  );
}
