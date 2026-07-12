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

export default function Nav({ active }) {
  const market = marketStatus(asOf);
  const freshness = market.tone === "pos" ? "current" : market.tone === "neg" ? "stale" : "delayed";

  return (
    <NavChrome>
      <div className="container-px pointer-events-auto">
        <div className="nav-surface flex min-h-[66px] items-center gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5" aria-label="MF Pulse home">
            <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-2xl bg-ink text-sm font-semibold text-bg shadow-glow transition-transform group-hover:-translate-y-0.5" aria-hidden="true">
              <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgb(var(--color-brand)/0.85),transparent_52%)]" />
              <span className="relative">M</span>
            </span>
            <span className="hidden leading-none sm:block">
              <span className="block text-[13px] font-semibold tracking-[-0.025em] text-ink">MF Pulse</span>
              <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.18em] text-ink-faint">Research terminal</span>
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 lg:flex" aria-label="Primary navigation">
            {LINKS.map(([label, href]) => {
              const isActive = active === href || (href !== "/" && active?.startsWith(href));
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`nav-link group relative rounded-full px-3.5 py-2 text-[12px] font-semibold tracking-[-0.01em] transition-spring ${isActive ? "text-ink" : "text-ink-muted hover:text-ink"}`}
                >
                  <span className={`absolute inset-0 rounded-full transition-spring ${isActive ? "bg-surface-2 shadow-[inset_0_0_0_1px_rgb(var(--color-border)/0.65)]" : "bg-transparent group-hover:bg-surface-2/70"}`} aria-hidden="true" />
                  <span className="relative">{label}</span>
                  <span className={`absolute inset-x-4 -bottom-1 h-px rounded-full bg-accent transition-spring ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50"}`} aria-hidden="true" />
                </Link>
              );
            })}
          </nav>

          <div id="search" className="ml-auto hidden xl:block xl:w-[250px]">
            <Search listenForOpenRequest triggerClassName="w-full border-line/80 bg-surface/80 shadow-none hover:border-accent/40" />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
            <Link href="/data-status" aria-label={`Data status: ${market.navLine}`} className="hidden 2xl:inline-flex">
              <FreshnessBadge status={freshness} timestamp={asOf}>{market.navLine}</FreshnessBadge>
            </Link>
            <ThemeToggle />
            <AuthStatus />
            <MobileNav active={active} />
          </div>
        </div>
      </div>

      <div className="container-px pointer-events-auto">
        <Link href="/data-status" className="mx-auto mt-1.5 flex min-h-7 max-w-[620px] items-center justify-center gap-2 rounded-full border border-line/70 bg-surface/80 px-4 py-1 text-[10.5px] text-ink-faint shadow-sm backdrop-blur-xl hover:text-ink-muted 2xl:hidden">
          <span className="truncate">{market.navLine}</span><span aria-hidden="true">·</span><span className="shrink-0">{market.sessionLabel}</span>
        </Link>
      </div>
    </NavChrome>
  );
}
