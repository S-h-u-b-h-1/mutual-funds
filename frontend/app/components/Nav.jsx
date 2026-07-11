import Link from "next/link";
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
    <header className="sticky top-0 z-40 border-b border-line bg-bg shadow-[0_1px_0_rgb(var(--color-border)/0.35)]">
      <div className="container-px flex h-16 items-center gap-5">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="MF Pulse home">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-accent text-sm font-semibold text-white shadow-glow" aria-hidden="true">M</span>
          <span className="hidden leading-none sm:block">
            <span className="block text-sm font-semibold tracking-[-0.025em] text-ink">MF Pulse</span>
            <span className="mt-1 block text-[9px] font-medium uppercase tracking-[0.15em] text-ink-faint">Research network</span>
          </span>
        </Link>

        <nav className="hidden min-w-0 items-center gap-0.5 xl:flex" aria-label="Primary navigation">
          {LINKS.map(([label, href]) => (
            <Link key={href} href={href} aria-current={active === href ? "page" : undefined} className={`rounded-lg px-2.5 py-2 text-[12.5px] font-medium ${active === href ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-strong hover:text-ink"}`}>
              {label}
            </Link>
          ))}
        </nav>

        <div id="search" className="ml-auto hidden w-full max-w-[280px] 2xl:block"><Search /></div>

        <div className="ml-auto flex shrink-0 items-center gap-2 xl:ml-0">
          <Link href="/data-status" className="hidden xl:inline-flex"><FreshnessBadge status={freshness} timestamp={asOf}>{market.navLine}</FreshnessBadge></Link>
          <ThemeToggle />
          <AuthStatus />
          <MobileNav active={active} />
        </div>
      </div>

      <Link href="/data-status" className="flex min-h-7 items-center justify-center gap-2 border-t border-line bg-surface-2 px-4 py-1 text-[10.5px] text-ink-faint hover:text-ink-muted xl:hidden">
        <span className="truncate">{market.navLine}</span><span aria-hidden="true">·</span><span className="shrink-0">{market.sessionLabel}</span>
      </Link>
    </header>
  );
}
