"use client";
import { track } from "../lib/track";

// Soft, non-modal advisor CTA — a single dismissable-by-scrolling-past banner, not a popup.
// Placed at the natural end of a research page, never interrupts the reading flow above it.
export default function AdvisorSoftCTA({ context }) {
  return (
    <div className="mt-7 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white/[0.015] px-4 py-3.5">
      <div className="text-[12.5px] text-ink-muted">
        <span className="font-medium text-ink">Need help interpreting this fund?</span> Talk to an advisor for a portfolio review.
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
