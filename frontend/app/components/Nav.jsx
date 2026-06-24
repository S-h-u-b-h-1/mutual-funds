import PremiumButton from "./ui/PremiumButton";
import MobileNav from "./MobileNav";

const LINKS = [
  ["Market Brief", "/brief"],
  ["Signals", "/signals"],
  ["Compare", "/compare"],
  ["Research", "/research"],
  ["Analytics", "/analytics"],
];

export default function Nav({ active }) {
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
    </header>
  );
}
