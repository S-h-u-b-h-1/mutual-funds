import Link from "next/link";
import NavChrome from "./NavChrome";
import MobileNav from "./MobileNav";
import AuthStatus from "./AuthStatus";
import Search from "./Search";
import ThemeToggle from "./ui/ThemeToggle";
import FreshnessBadge from "./ui/FreshnessBadge";
import { asOf } from "../lib/funds";
import { marketStatus } from "../lib/marketStatus";
import { PRIMARY_LINKS as LINKS } from "../lib/navLinks";

const DESK = {
  Markets: "MKT",
  Funds: "FND",
  Research: "RSC",
  Portfolio: "PTF",
  Compare: "CMP",
  News: "NWS",
  Dashboard: "DB",
};

export default function Nav({ active }) {
  const market = marketStatus(asOf);
  const freshness = market.tone === "pos" ? "current" : market.tone === "neg" ? "stale" : "delayed";

  return (
    <NavChrome>
      <div className="container-px pointer-events-auto">
        <div className="nav-surface grid min-h-[72px] grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
          <Link href="/" className="group flex shrink-0 items-center gap-3 rounded-2xl px-1.5 py-1 transition hover:bg-surface-2/65" aria-label="MF Pulse home">
            <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-ink text-[13px] font-bold text-bg shadow-glow transition-transform group-hover:-translate-y-0.5" aria-hidden="true">
              <span className="absolute inset-0 bg-[linear-gradient(135deg,rgb(var(--color-brand)/0.95),transparent_58%),radial-gradient(circle_at_80%_10%,rgb(var(--color-information)/0.75),transparent_38%)]" />
              <span className="relative tracking-[-0.04em]">MF</span>
            </span>
            <span className="hidden leading-none sm:block">
              <span className="block text-[13px] font-bold tracking-[-0.025em] text-ink">MF Pulse</span>
              <span className="mt-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-pos" aria-hidden="true" />
                Institutional research
              </span>
            </span>
          </Link>

          <nav className="hidden min-w-0 items-center justify-center rounded-2xl border border-line/60 bg-bg/35 p-1 lg:flex" aria-label="Primary navigation">
            {LINKS.map(([label, href]) => {
              const isActive = active === href || (href !== "/" && active?.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  aria-current={isActive ? "page" : undefined}
                  className={`nav-link group relative flex min-h-11 items-center gap-2 overflow-hidden rounded-[0.95rem] px-3 py-2 text-[12px] font-semibold tracking-[-0.01em] transition-spring ${isActive ? "text-ink" : "text-ink-muted hover:text-ink"}`}
                >
                  <span className={`absolute inset-0 rounded-[0.95rem] transition-spring ${isActive ? "bg-surface shadow-[inset_0_0_0_1px_rgb(var(--color-border)/0.8),0_12px_30px_rgb(15_23_28/0.08)]" : "bg-transparent group-hover:bg-surface/80"}`} aria-hidden="true" />
                  <span aria-hidden="true" className={`relative hidden rounded-md border px-1.5 py-0.5 font-mono text-[9px] tracking-normal xl:inline-flex ${isActive ? "border-accent/30 bg-accent/10 text-accent" : "border-line/70 text-ink-faint group-hover:border-line-strong"}`}>{DESK[label] || label.slice(0, 3).toUpperCase()}</span>
                  <span className="relative">{label}</span>
                  <span className={`absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-accent transition-spring ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-45"}`} aria-hidden="true" />
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div id="search" className="hidden xl:block xl:w-[260px]">
              <Search listenForOpenRequest triggerClassName="w-full border-line/70 bg-bg/35 shadow-none hover:border-accent/40" />
            </div>
            <Link href="/data-status" aria-label={`Data status: ${market.navLine}`} className="hidden rounded-2xl border border-line/70 bg-bg/35 px-3 py-2 transition hover:border-accent/30 hover:bg-surface 2xl:inline-flex">
              <span className="flex flex-col">
                <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Data</span>
                <FreshnessBadge status={freshness} timestamp={asOf}>{market.sessionLabel}</FreshnessBadge>
              </span>
            </Link>
            <ThemeToggle className="hidden border-line/70 bg-bg/35 lg:inline-flex" />
            <AuthStatus />
            <MobileNav active={active} />
          </div>
        </div>
      </div>

      <div className="container-px pointer-events-auto">
        <Link href="/data-status" className="mx-auto mt-1.5 flex min-h-8 max-w-[680px] items-center justify-center gap-2 rounded-full border border-line/70 bg-surface/85 px-4 py-1 text-[10.5px] font-medium text-ink-faint shadow-sm backdrop-blur-xl hover:border-accent/30 hover:text-ink-muted 2xl:hidden">
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          <span className="truncate">{market.navLine}</span><span aria-hidden="true">·</span><span className="shrink-0">{market.sessionLabel}</span>
        </Link>
      </div>
    </NavChrome>
  );
}
