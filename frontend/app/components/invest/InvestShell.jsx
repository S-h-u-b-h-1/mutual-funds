"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { setInvestSessionKey } from "../../lib/invest/api";

const links = [
  ["Overview", "/invest", "⌂"], ["Portfolio", "/invest/portfolio", "◒"],
  ["Orders", "/invest/orders", "↗"], ["Transactions", "/invest/transactions", "⇄"],
  ["Readiness", "/invest/compliance", "✓"], ["Documents", "/invest/documents", "▤"],
  ["SIPs", "/invest/sips", "⌁"], ["Notifications", "/invest/notifications", "◌"], ["Advisor", "/invest/advisor", "◇"],
];

export function InvestIcon({ children }) {
  return <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-surface-2 text-sm text-accent">{children}</span>;
}

export default function InvestShell({ eyebrow = "Suasion Invest", title, description, actions, children }) {
  const path = usePathname();
  const { data: session } = useSession();
  const firstName = session?.user?.name?.split(" ")?.[0] || "Investor";
  setInvestSessionKey(session?.user?.id || session?.user?.email || null);
  return (
    <main className="min-h-screen bg-bg pb-28 pt-5 lg:pb-12 lg:pt-8">
      <div className="container-px mx-auto grid max-w-[1500px] gap-6 lg:grid-cols-[238px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-28 rounded-[1.8rem] border border-line bg-surface p-3 shadow-sm">
            <Link href="/invest" className="flex items-center gap-3 rounded-2xl px-3 py-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-ink text-xs font-bold text-bg">SS</span>
              <span><span className="block text-sm font-bold text-ink">Suasion Invest</span><span className="block text-[11px] text-ink-faint">Powered by MF Pulse</span></span>
            </Link>
            <nav className="mt-3 grid gap-1" aria-label="Invest navigation">
              {links.map(([label, href, icon]) => {
                const active = path === href || (href !== "/invest" && path.startsWith(`${href}/`));
                return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition ${active ? "bg-ink text-bg shadow-sm" : "text-ink-muted hover:bg-surface-2 hover:text-ink"}`}><span aria-hidden="true" className="w-5 text-center">{icon}</span>{label}</Link>;
              })}
            </nav>
            <div className="mt-4 rounded-2xl bg-accent/10 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[.16em] text-accent">Secure workspace</div>
              <p className="mt-2 text-xs leading-5 text-ink-muted">Your investment readiness and financial records stay separate from public research.</p>
              <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold text-accent"><span aria-hidden="true">✓</span> Session protected · source-aware</div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[.19em] text-accent">{eyebrow}</div>
              <h1 className="mt-2 text-[clamp(2rem,4vw,3.35rem)] font-semibold leading-[.98] tracking-[-.055em] text-ink">{title}</h1>
              {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-muted">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
          </header>
          <div aria-label={`Workspace for ${firstName}`}>{children}</div>
        </section>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-[65] grid grid-cols-5 rounded-[1.6rem] border border-line/80 bg-surface/95 p-1.5 pb-[calc(.375rem+env(safe-area-inset-bottom))] shadow-float backdrop-blur-2xl lg:hidden" aria-label="Invest mobile navigation">
        {links.slice(0, 4).concat([["More", "/invest/more", "••"]]).map(([label, href, icon]) => {
          const active = path === href || (href !== "/invest" && path.startsWith(`${href}/`));
          return <Link key={label} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-[58px] min-w-0 flex-col items-center justify-center gap-1 rounded-[1.15rem] text-[10px] font-semibold ${active ? "bg-ink text-bg" : "text-ink-muted"}`}><span className="text-base" aria-hidden="true">{icon}</span><span className="truncate">{label}</span></Link>;
        })}
      </nav>
    </main>
  );
}

export function Card({ className = "", children }) { return <section className={`min-w-0 rounded-[1.65rem] border border-line bg-surface shadow-sm ${className}`}>{children}</section>; }
export function ButtonLink({ href, children, secondary = false }) { return <Link href={href} className={`inline-flex min-h-11 items-center justify-center rounded-full px-5 text-sm font-semibold transition ${secondary ? "border border-line bg-surface text-ink hover:bg-surface-2" : "bg-ink text-bg hover:opacity-90"}`}>{children}</Link>; }
export function StatusPill({ status }) {
  const done = ["completed", "verified", "active", "ready", "scheduled"].includes(status);
  const review = status === "needs_review" || status === "rejected" || status === "failed" || status === "retry_required";
  const label = String(status || "pending").replaceAll("_", " ");
  return <span role="status" aria-label={`Status: ${label}`} className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ${done ? "bg-pos/10 text-pos" : review ? "bg-neg/10 text-neg" : "bg-surface-2 text-ink-muted"}`}>{label}</span>;
}
