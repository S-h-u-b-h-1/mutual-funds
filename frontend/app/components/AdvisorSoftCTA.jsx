"use client";
import { useEffect, useState } from "react";
import { track } from "../lib/track";
import { getRecentViews } from "../lib/sessionMemory";

// Soft, non-modal advisor CTA — a single dismissable-by-scrolling-past banner, not a popup.
// Placed at the natural end of a research page, never interrupts the reading flow above it.
// Headline is contextual (Phase 10): context's prefix before ":" picks the copy, so existing
// call sites (context={`fund:${code}`}) keep working unchanged while new pages (compare, news)
// get copy that matches what they're actually asking the reader to review.
const HEADLINES = {
  fund: "Need professional guidance on this fund?",
  compare: "Need professional guidance on this comparison?",
  news: "Need professional guidance on how this affects your portfolio?",
};

// Engagement gate (Decision Support Phase 11): a first-touch visitor from a search engine
// shouldn't be offered an advisor before they've done any real research here. "Engaged" means
// this browser has looked at 3+ funds/AMCs/categories (ever, via the same mfp_recent_views
// localStorage sessionMemory already used by RecentActivity) — not this single page load.
// Starts hidden (SSR-safe, no localStorage on the server) and reveals only after the check.
const ENGAGEMENT_THRESHOLD = 3;

export default function AdvisorSoftCTA({ context }) {
  const [engaged, setEngaged] = useState(false);

  useEffect(() => {
    setEngaged(getRecentViews(null, 50).length >= ENGAGEMENT_THRESHOLD);
  }, []);

  if (!engaged) return null;

  const headline = HEADLINES[(context || "").split(":")[0]] || HEADLINES.fund;
  return (
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.015] px-4 py-3.5">
      <div className="text-[12.5px] text-ink-muted">
        <span className="font-medium text-ink">{headline}</span> Talk to an advisor for a portfolio review.
      </div>
      <a
        href="/advisor"
        onClick={() => track("advisor_cta_click", { context })}
        className="shrink-0 rounded-lg border border-line-strong px-3.5 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:border-accent hover:text-accent-soft"
      >
        Talk to an advisor →
      </a>
    </div>
  );
}
