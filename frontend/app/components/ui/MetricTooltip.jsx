"use client";
// Accessible inline explanation (Phase 6) — a small "?" that reveals plain-language context on
// hover or keyboard focus. Never assumes financial knowledge: every metric that needs one gets
// a real, specific explanation, not a generic "learn more."
export default function MetricTooltip({ children }) {
  return (
    <span className="group relative inline-flex" tabIndex={0}>
      <span className="grid h-3.5 w-3.5 cursor-help place-items-center rounded-full border border-line-strong text-[9px] font-semibold text-ink-faint transition-colors group-hover:border-accent group-hover:text-accent-soft group-focus:border-accent group-focus:text-accent-soft">?</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-1.5 w-56 -translate-x-1/2 rounded-lg border border-line-strong bg-[#0c1120] p-2.5 text-[11px] leading-relaxed text-ink-muted opacity-0 shadow-glass transition-opacity group-hover:opacity-100 group-focus:opacity-100">
        {children}
      </span>
    </span>
  );
}
