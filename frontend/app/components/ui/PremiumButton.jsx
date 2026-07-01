"use client";
import { track } from "../../lib/track";

// Shared CTA button — tracking lives here once so every call site gets "cta_click" coverage
// for free (Phase 9), instead of hand-wiring track() at every usage across the app.
export default function PremiumButton({ href, children, variant = "primary", className = "", onClick, trackLabel, ...props }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-xl text-[13px] sm:text-sm font-semibold px-5 py-3 transition-all duration-200 active:scale-[0.98] whitespace-nowrap";
  const variants = {
    primary: "bg-accent text-white hover:bg-accent-soft shadow-glow",
    ghost: "bg-white/[0.04] text-ink border border-line-strong hover:bg-white/[0.08]",
    subtle: "text-ink-muted hover:text-ink",
  };
  const cls = `${base} ${variants[variant]} ${className}`;

  function handleClick(e) {
    track("cta_click", { label: trackLabel || (typeof children === "string" ? children : null), href: href || null });
    onClick?.(e);
  }

  return href ? (
    <a href={href} className={cls} onClick={handleClick} {...props}>{children}</a>
  ) : (
    <button className={cls} onClick={handleClick} {...props}>{children}</button>
  );
}
