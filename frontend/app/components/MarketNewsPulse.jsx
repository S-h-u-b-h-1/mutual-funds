"use client";
// Homepage "Today's Biggest Market Events" — impact-first cards built from the same real
// news_market_links rows /news uses, now joined against marketImpact.js's chains/score/research
// (computed server-side in page.js and passed down as plain props — this file never imports
// marketImpact.js/funds.js directly, mirroring the server/client split documented there).
// Every "why investors should care" line recombines real chain/link data — hedged language only,
// never a prediction or recommendation. Honest empty state and honest degrade-to-simple-card
// when enrichment is unavailable for a given article.
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

const IMPACT_TONE = { Critical: "accent", High: "accent", Medium: "neutral", Low: "neutral" };
const CHAIN_STEP_LIMIT = 4;

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

// Hedged "why investors should care" sentence — recombines the top chain's last (fund-level)
// step with the strongest link's relation phrase. Never invents a new claim.
function whyInvestorsCare(topChain, links) {
  if (!topChain?.chain?.length) return null;
  const implication = topChain.chain[topChain.chain.length - 1];
  const relevantLink = (links || []).find((l) => l.ruleId === topChain.ruleId) || links?.[0];
  const target = relevantLink ? `${relevantLink.entityType}: ${relevantLink.entityName}` : topChain.theme;
  return `May affect ${target} — ${implication.charAt(0).toLowerCase()}${implication.slice(1)}.`;
}

function ChainBreadcrumb({ chain }) {
  if (!chain || chain.length === 0) return null;
  const steps = chain.slice(0, CHAIN_STEP_LIMIT);
  const extra = chain.length - steps.length;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-[11.5px] text-ink-muted">
      {steps.map((s, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="rounded border border-line bg-white/[0.03] px-1.5 py-0.5 text-ink">{s}</span>
          {i < steps.length - 1 && <span className="text-ink-faint">→</span>}
        </span>
      ))}
      {extra > 0 && <span className="text-ink-faint">+{extra} more</span>}
    </div>
  );
}

function affectedChips(links) {
  const seen = new Set();
  const chips = [];
  for (const l of links || []) {
    if (l.entityType !== "category" && l.entityType !== "sector") continue;
    const key = `${l.entityType}:${l.entityName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    chips.push(l);
  }
  return chips;
}

function EventCard({ article: a }) {
  const isOfficial = a.source?.credibility === "official";
  const topChain = a.chains?.[0];
  const hasImpactData = !!(topChain && a.impact);
  const care = hasImpactData ? whyInvestorsCare(topChain, a.links) : whyItMatters(a.links);
  const chips = affectedChips(a.links);
  const research = Array.isArray(a.research) ? a.research.slice(0, 3) : [];
  const topFunds = Array.isArray(a.topFunds) ? a.topFunds : [];

  return (
    <div className="glass p-4">
      <div className="flex flex-wrap items-center gap-2">
        {isOfficial ? <Badge tone="accent">official</Badge> : null}
        {categoryBadge(a.category)}
        {hasImpactData && (
          <Badge tone={IMPACT_TONE[a.impact.tier] || "neutral"} title="Market Impact Score — breadth of affected sectors/categories/AMCs + regulatory weight + source credibility, not a sentiment signal">
            {a.impact.tier} impact
          </Badge>
        )}
        <span className="text-[11px] text-ink-faint">{relativeTime(a.publishedAt)}</span>
      </div>

      <a
        href={a.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => track("homepage_news_click", { article: a.id })}
        className="mt-2 block text-[13.5px] font-medium leading-snug text-ink hover:text-accent-soft transition-colors"
      >
        {a.title}
      </a>

      <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-ink-faint">
        {a.source?.name && <span>{a.source.name}</span>}
      </div>

      {hasImpactData ? (
        <>
          <ChainBreadcrumb chain={topChain.chain} />
          <div className="mt-1 text-[10.5px] text-ink-faint">traced to rule: {topChain.ruleId}</div>

          {chips.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {chips.map((c, i) => (
                <span key={i} className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">
                  {c.entityName}
                </span>
              ))}
            </div>
          )}

          {care && (
            <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
              <span className="text-accent-soft">▸</span> {care}
            </p>
          )}

          {(research.length > 0 || topFunds.length > 0) && (
            <div className="mt-3 border-t border-line pt-2.5">
              {research.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
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
              {topFunds.length > 0 && (
                <div className="mt-2 text-[11.5px] text-ink-muted">
                  <span className="text-ink-faint">Funds worth researching: </span>
                  {topFunds.map((f, i) => (
                    <span key={f.code}>
                      <a href={`/fund/${f.code}`} className="text-ink hover:text-accent-soft">
                        {f.name.replace(/ - (Direct|Regular).*/i, "")}
                      </a>
                      {i < topFunds.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        care && (
          <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
            <span className="text-accent-soft">▸</span> {care}
          </p>
        )
      )}
    </div>
  );
}

export default function MarketNewsPulse({ articles }) {
  const hasArticles = Array.isArray(articles) && articles.length > 0;

  return (
    <>
      <SectionHeader
        eyebrow="real-time market intelligence"
        title="Today's Biggest Market Events"
        action={
          <PremiumButton href="/news" variant="subtle">
            See all news →
          </PremiumButton>
        }
      />
      {hasArticles ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {articles.slice(0, 5).map((a) => (
            <EventCard key={a.id} article={a} />
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
