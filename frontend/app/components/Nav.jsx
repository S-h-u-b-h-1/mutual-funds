import Link from "next/link";
import NavChrome from "./NavChrome";
import MobileNav from "./MobileNav";
import AuthStatus from "./AuthStatus";
import Search, { SearchLauncher } from "./Search";
import ThemeToggle from "./ui/ThemeToggle";
import FreshnessBadge from "./ui/FreshnessBadge";
import { asOf } from "../lib/funds";
import { marketStatus } from "../lib/marketStatus";
import { DESKTOP_NAV_GROUPS } from "../lib/navLinks";

function isActiveLink(active, href) {
  const path = href?.split("#")[0];
  if (!path) return false;
  if (path === "/") return active === "/";
  if (path === "/invest") return active === "/invest" || active?.startsWith("/invest/");
  return active === path || active?.startsWith(`${path}/`);
}

export default function Nav({ active }) {
  const market = marketStatus(asOf);
  const freshness = market.tone === "pos" ? "current" : market.tone === "neg" ? "stale" : "delayed";

  return (
    <>
      <NavChrome className="hidden border-b border-line/80 bg-surface/90 backdrop-blur-2xl lg:block">
        <div className="container-px pointer-events-auto">
          <div className="grid min-h-[72px] grid-cols-[auto_1fr_auto] items-center gap-4">
            <Link href="/" className="group flex shrink-0 items-center gap-3 rounded-xl py-1 pr-2" aria-label="MF Pulse home">
              <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-xl bg-ink text-[12px] font-bold text-bg shadow-glow transition-transform group-hover:-translate-y-0.5" aria-hidden="true">
                <span className="absolute inset-0 bg-[linear-gradient(135deg,rgb(var(--color-brand)/0.95),transparent_58%),radial-gradient(circle_at_80%_10%,rgb(var(--color-information)/0.75),transparent_38%)]" />
                <span className="relative tracking-[-0.04em]">MF</span>
              </span>
              <span className="leading-none">
                <span className="block text-[14px] font-bold tracking-[-0.025em] text-ink">MF Pulse</span>
                <span className="mt-1.5 flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-faint">
                  <span className={`h-1.5 w-1.5 rounded-full ${market.tone === "neg" ? "bg-neg" : market.tone === "warn" ? "bg-warn" : "bg-pos"}`} aria-hidden="true" />
                  {market.sessionLabel}
                </span>
              </span>
            </Link>

            <nav className="flex min-w-0 items-center justify-center gap-0.5" aria-label="Primary navigation">
              {DESKTOP_NAV_GROUPS.map((menu) => {
                const isActive = menu.links.some(([, href]) => isActiveLink(active, href));
                return (
                  <details key={menu.label} className="group relative">
                    <summary className={`flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition hover:bg-surface-2 hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent/35 xl:px-3.5 xl:text-[13px] [&::-webkit-details-marker]:hidden ${isActive ? "bg-accent/10 text-accent" : "text-ink-muted"}`}>
                      {menu.label}
                      <svg className="h-3.5 w-3.5 text-ink-faint transition group-open:rotate-180" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </summary>
                    <div className={`absolute top-[calc(100%+0.65rem)] z-[75] hidden w-64 rounded-[1.25rem] border border-line bg-surface p-2 shadow-float group-open:block ${menu.label === "More" ? "right-0" : "left-1/2 -translate-x-1/2"}`}>
                      <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">{menu.label}</div>
                      {menu.links.map(([label, href]) => {
                        const linkActive = isActiveLink(active, href);
                        return (
                          <Link key={`${menu.label}-${label}-${href}`} href={href} aria-current={linkActive ? "page" : undefined} className={`flex min-h-10 items-center justify-between rounded-xl px-3 text-sm font-semibold transition ${linkActive ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-2 hover:text-ink"}`}>
                            {label}<span aria-hidden="true" className="text-ink-faint">→</span>
                          </Link>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
            </nav>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              <SearchLauncher compact className="inline-flex min-w-10 justify-center xl:min-w-[92px]" />
              <Link href="/data-status" aria-label={`Data status: ${market.navLine}`} className="hidden rounded-xl border border-line/70 bg-bg/35 px-3 py-2 transition hover:border-accent/30 hover:bg-surface 2xl:inline-flex">
                <span className="flex flex-col">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-ink-faint">Data health</span>
                  <FreshnessBadge status={freshness} timestamp={asOf}>{market.navLine}</FreshnessBadge>
                </span>
              </Link>
              <ThemeToggle className="border-line/70 bg-bg/35" />
              <AuthStatus />
            </div>
          </div>
        </div>
      </NavChrome>

      {!active?.startsWith("/invest") && (
        <MobileNav active={active} marketLine={market.navLine} sessionLabel={market.sessionLabel} />
      )}

      {/* One search dialog serves desktop, mobile and the homepage launcher. */}
      <Search listenForOpenRequest triggerClassName="sr-only" compact />
    </>
  );
}
