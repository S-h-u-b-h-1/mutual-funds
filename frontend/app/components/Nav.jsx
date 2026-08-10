import Link from "next/link";
import NavChrome from "./NavChrome";
import MobileNav from "./MobileNav";
import AuthStatus from "./AuthStatus";
import Search, { SearchLauncher } from "./Search";
import ThemeToggle from "./ui/ThemeToggle";
import { asOf } from "../lib/funds";
import { marketStatus } from "../lib/marketStatus";
import { NAV_GROUPS } from "../lib/navLinks";

const group = (label) => NAV_GROUPS.find((item) => item.label === label);
const NAV_MENUS = [
  { ...group("Mutual Funds"), shortLabel: "Funds" },
  group("Stocks"),
  group("Markets"),
  group("Portfolio"),
  {
    label: "Research",
    links: [
      ["Learning Home", "/learn"],
      ["Compare Funds", "/compare"],
      ["Fund Methodology", "/methodology"],
      ["Data Quality", "/data-quality"],
      ["Data Status", "/data-status"],
      ["Help Center", "/help"],
    ],
  },
  group("Invest"),
].filter(Boolean);

function isActiveLink(active, href) {
  if (!href || href.includes("#")) return active === href.split("#")[0];
  if (href === "/") return active === "/";
  if (href === "/invest") return active === "/invest" || active?.startsWith("/invest/");
  return active === href || active?.startsWith(`${href}/`);
}

export default function Nav({ active }) {
  const market = marketStatus(asOf);

  const brand = (
    <Link href="/" className="group flex shrink-0 items-center gap-2.5 rounded-2xl px-1.5 py-1 transition hover:bg-surface-2/65" aria-label="MF Pulse home">
      <span className="relative grid h-10 w-10 place-items-center overflow-hidden rounded-2xl bg-ink text-[12px] font-bold text-bg shadow-glow transition-transform group-hover:-translate-y-0.5 sm:h-11 sm:w-11 sm:text-[13px]" aria-hidden="true">
        <span className="absolute inset-0 bg-[linear-gradient(135deg,rgb(var(--color-brand)/0.95),transparent_58%),radial-gradient(circle_at_80%_10%,rgb(var(--color-information)/0.75),transparent_38%)]" />
        <span className="relative tracking-[-0.04em]">MF</span>
      </span>
      <span className="leading-none">
        <span className="block text-[13px] font-bold tracking-[-0.025em] text-ink">MF Pulse</span>
        <span className="mt-1.5 hidden text-[8.5px] font-semibold uppercase tracking-[0.16em] text-ink-faint sm:block">Evidence-led research</span>
      </span>
    </Link>
  );

  return (
    <>
    <NavChrome className="hidden xl:block">
      <div className="container-px pointer-events-auto">
        <div className="nav-surface grid min-h-[68px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 sm:px-4">
          {brand}

          <nav className="flex min-w-0 items-center justify-center gap-0.5 2xl:gap-1" aria-label="Primary navigation">
            {NAV_MENUS.map((menu) => {
              const isActive = menu.links.some(([, href]) => isActiveLink(active, href));
              return (
                <details key={menu.label} className="group relative">
                  <summary className={`flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition hover:bg-surface hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent/35 2xl:px-3.5 2xl:text-[13px] [&::-webkit-details-marker]:hidden ${isActive ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}>
                    {menu.shortLabel || menu.label}
                    <svg className="h-3.5 w-3.5 text-ink-faint transition group-open:rotate-180" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </summary>
                  <div className="absolute left-1/2 top-[calc(100%+0.7rem)] z-[75] hidden w-60 -translate-x-1/2 rounded-[1.25rem] border border-line bg-surface p-2 shadow-float group-open:block">
                    {menu.links.map(([label, href]) => {
                      const linkActive = isActiveLink(active, href);
                      return (
                        <Link key={`${menu.label}-${label}-${href}`} href={href} aria-current={linkActive ? "page" : undefined} className={`flex min-h-10 items-center justify-between rounded-xl px-3 text-sm font-semibold transition ${linkActive ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-2 hover:text-ink"}`}>
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
            <div id="search">
              <Search listenForOpenRequest triggerClassName="border-line/70 bg-bg/35 shadow-none hover:border-accent/40" compact />
            </div>
            <ThemeToggle className="border-line/70 bg-bg/35" />
            <AuthStatus />
          </div>
        </div>
      </div>

      <div className="container-px pointer-events-auto">
        <Link href="/data-status" className="mx-auto mt-1.5 flex min-h-8 max-w-[680px] items-center justify-center gap-2 rounded-full border border-line/70 bg-surface/85 px-4 py-1 text-[10.5px] font-medium text-ink-faint shadow-sm backdrop-blur-xl hover:border-accent/30 hover:text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          <span className="truncate">{market.navLine}</span><span aria-hidden="true">·</span><span className="shrink-0">{market.sessionLabel}</span>
        </Link>
      </div>
    </NavChrome>

    <NavChrome className="xl:hidden">
      <div className="container-px pointer-events-auto">
        <div className="nav-surface flex min-h-[64px] items-center justify-between gap-2 px-2.5 py-2 sm:px-3">
          {brand}
          <div className="ml-auto flex items-center gap-1.5">
            <SearchLauncher compact className="inline-flex w-auto border-line/70 bg-bg/35 px-3 shadow-none" />
            <ThemeToggle className="hidden border-line/70 bg-bg/35 sm:inline-flex" />
            <AuthStatus />
            <MobileNav active={active} />
          </div>
        </div>
        <Link href="/data-status" className="mx-auto mt-1.5 flex min-h-7 max-w-[620px] items-center justify-center gap-2 rounded-full border border-line/70 bg-surface/90 px-3 py-1 text-[10px] font-medium text-ink-faint shadow-sm backdrop-blur-xl">
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          <span className="truncate">{market.navLine}</span><span aria-hidden="true">·</span><span className="shrink-0">{market.sessionLabel}</span>
        </Link>
      </div>
    </NavChrome>
    </>
  );
}
