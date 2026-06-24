import PremiumButton from "./ui/PremiumButton";

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
      <div className="container-px flex items-center justify-between h-14">
        <a href="/" className="flex items-center gap-2.5 font-bold tracking-tight text-[15px]">
          <span className="h-2.5 w-2.5 rounded-full bg-pos animate-ring" />
          MF&nbsp;Pulse
        </a>
        <nav className="hidden md:flex items-center gap-1 text-[13px]">
          {LINKS.map(([l, h]) => (
            <a
              key={h}
              href={h}
              className={`px-3 py-1.5 rounded-lg transition-colors ${
                active === h ? "text-ink bg-white/[0.06]" : "text-ink-muted hover:text-ink"
              }`}
            >
              {l}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <a href="/status" className="hidden sm:inline text-[12px] text-ink-faint hover:text-ink-muted transition-colors">
            status
          </a>
          <PremiumButton href="/#alerts" variant="ghost" className="!px-3.5 !py-2 !text-[12px]">
            Get alerts
          </PremiumButton>
        </div>
      </div>
    </header>
  );
}
