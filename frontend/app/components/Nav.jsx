import PremiumButton from "./ui/PremiumButton";
import MobileNav from "./MobileNav";
import { asOf } from "../lib/funds";
import { marketStatus } from "../lib/marketStatus";
import { PRIMARY_LINKS as LINKS } from "../lib/navLinks";

const DOT = { pos: "bg-pos", warn: "bg-warn", neg: "bg-neg" };
const TEXT = { pos: "text-pos", warn: "text-warn", neg: "text-neg" };

export default function Nav({ active }) {
  const ms = marketStatus(asOf);
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-md">
      <div className="container-px flex h-14 items-center justify-between">
        <a href="/" className="flex items-center gap-2.5 text-[15px] font-bold tracking-tight">
          <span className="h-2.5 w-2.5 rounded-full bg-pos" />
          MF&nbsp;Pulse
        </a>

        <nav className="hidden items-center gap-1 text-[13px] md:flex">
          {LINKS.map(([l, h]) => (
            <a
              key={h}
              href={h}
              aria-current={active === h ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 transition-colors ${
                active === h ? "bg-white/[0.06] text-ink" : "text-ink-muted hover:text-ink"
              }`}
            >
              {l}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a href="/status" className="hidden text-[12px] text-ink-faint transition-colors hover:text-ink-muted md:inline">
            status
          </a>
          <PremiumButton href="/#alerts" variant="ghost" className="hidden !px-3.5 !py-2 !text-[12px] sm:inline-flex">
            Get alerts
          </PremiumButton>
          <MobileNav active={active} />
        </div>
      </div>

      {/* real-time-experience strip (Phase 3): honest freshness + market-session facts, zero
          extra network cost (derived from the already-bundled asOf + server clock) */}
      <a
        href="/data-status"
        className="flex h-7 items-center gap-1 overflow-x-auto whitespace-nowrap border-t border-line/60 bg-white/[0.015] px-4 text-[10.5px] text-ink-faint transition-colors hover:text-ink-muted sm:justify-center sm:gap-3.5"
      >
        <span className="flex items-center gap-1.5 shrink-0">
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[ms.tone]}`} />
          <span className={TEXT[ms.tone]}>{ms.navLine}</span>
        </span>
        <span className="text-ink-faint/40 shrink-0">·</span>
        <span className="shrink-0">{ms.sessionLabel}</span>
        {ms.nextLabel && <><span className="text-ink-faint/40 shrink-0">·</span><span className="shrink-0">{ms.nextLabel}</span></>}
      </a>
    </header>
  );
}
