import Link from "next/link";
import NavChrome from "./NavChrome";
import MobileNav from "./MobileNav";
import AuthStatus from "./AuthStatus";
import Search from "./Search";
import ThemeToggle from "./ui/ThemeToggle";
import FreshnessBadge from "./ui/FreshnessBadge";
import { asOf } from "../lib/funds";
import { marketStatus } from "../lib/marketStatus";
const NAV_MENUS = [
  { label: "Research", links: [["Funds", "/funds"], ["AMCs", "/amc"], ["Categories", "/categories"], ["Benchmarks", "/performance"], ["Compare", "/compare"]] },
  { label: "Intelligence", links: [["Brief", "/brief"], ["News", "/news"], ["Signals", "/signals"], ["Market Map", "/market-map"]] },
  { label: "Personal", links: [["Dashboard", "/dashboard"], ["Portfolio", "/portfolio"], ["Watchlist", "/dashboard#watchlist"], ["Notebook", "/dashboard#notebook"]] },
];

export default function Nav({ active }) {
  const market = marketStatus(asOf);
  const freshness = market.tone === "pos" ? "current" : market.tone === "neg" ? "stale" : "delayed";

  return (
    <NavChrome className="hidden lg:block">
      <div className="container-px pointer-events-auto">
        <div className="nav-surface grid min-h-[68px] grid-cols-[auto_1fr_auto] items-center gap-3 px-3 py-2 sm:gap-4 sm:px-4">
          <Link href="/" className="group flex shrink-0 items-center gap-3 rounded-2xl px-1.5 py-1 transition hover:bg-surface-2/65" aria-label="MF Pulse home">
            <span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-ink text-[13px] font-bold text-bg shadow-glow transition-transform group-hover:-translate-y-0.5" aria-hidden="true">
              <span className="absolute inset-0 bg-[linear-gradient(135deg,rgb(var(--color-brand)/0.95),transparent_58%),radial-gradient(circle_at_80%_10%,rgb(var(--color-information)/0.75),transparent_38%)]" />
              <span className="relative tracking-[-0.04em]">MF</span>
            </span>
            <span className="hidden leading-none sm:block">
              <span className="block text-[13px] font-bold tracking-[-0.025em] text-ink">MF Pulse</span>
              <span className="mt-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-pos" aria-hidden="true" />
                {market.sessionLabel}
              </span>
            </span>
          </Link>

          <nav className="hidden min-w-0 items-center justify-center gap-1 lg:flex" aria-label="Primary navigation">
            {NAV_MENUS.map((menu) => {
              const isActive = menu.links.some(([, href]) => active === href || (href !== "/" && active?.startsWith(href)));
              return (
                <details key={menu.label} className="group relative">
                  <summary className={`flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition hover:bg-surface hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent/35 [&::-webkit-details-marker]:hidden ${isActive ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}>
                    {menu.label}
                    <svg className="h-3.5 w-3.5 text-ink-faint transition group-open:rotate-180" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </summary>
                  <div className="absolute left-1/2 top-[calc(100%+0.7rem)] z-[75] hidden w-56 -translate-x-1/2 rounded-[1.25rem] border border-line bg-surface p-2 shadow-float group-open:block">
                    {menu.links.map(([label, href]) => {
                      const linkActive = active === href || (href !== "/" && active?.startsWith(href));
                      return (
                        <Link key={href} href={href} aria-current={linkActive ? "page" : undefined} className={`flex min-h-10 items-center justify-between rounded-xl px-3 text-sm font-semibold transition ${linkActive ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-2 hover:text-ink"}`}>
                          {label}
                          <span aria-hidden="true" className="text-ink-faint">→</span>
                        </Link>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <div id="search" className="hidden sm:block">
              <Search listenForOpenRequest triggerClassName="border-line/70 bg-bg/35 shadow-none hover:border-accent/40" compact />
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
