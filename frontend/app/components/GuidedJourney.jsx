"use client";
import { track } from "../lib/track";

const OPTIONS = [
  { key: "research", icon: "🔎", title: "Research a fund", desc: "Health score, risk, benchmark & peer comparison", href: "/funds" },
  { key: "compare", icon: "⇄", title: "Compare funds", desc: "Side-by-side AMC performance & scheme mix", href: "/compare" },
  { key: "amcs", icon: "🏛", title: "Explore AMCs", desc: "Every fund house, ranked and scored", href: "/amc" },
  { key: "track", icon: "📈", title: "Track market changes", desc: "What moved today and why it matters", href: "/signals" },
  { key: "watchlist", icon: "★", title: "Build a watchlist", desc: "Save funds and follow their AMC's momentum", href: "/#watchlist" },
  { key: "advisor", icon: "💬", title: "Talk to an advisor", desc: "Get help interpreting a fund or portfolio", href: "/advisor" },
];

export default function GuidedJourney() {
  return (
    <section className="mt-8" id="get-started">
      <div className="mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">Get started</div>
        <h2 className="mt-1 text-[17px] font-semibold tracking-tight text-ink">What are you here to do?</h2>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {OPTIONS.map((o) => (
          <a
            key={o.key}
            href={o.href}
            onClick={() => track("onboarding_option_click", { option: o.key })}
            className="glass group flex items-start gap-3 p-4 transition-colors hover:bg-white/[0.045]"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-[16px]" aria-hidden>{o.icon}</span>
            <span>
              <span className="block text-[13.5px] font-semibold text-ink">{o.title}</span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-muted">{o.desc}</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
