"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession, signOut } from "next-auth/react";
import { MOBILE_PRIMARY_LINKS, NAV_GROUPS } from "../lib/navLinks";

function DockIcon({ name }) {
  const common = "h-5 w-5";
  if (name === "pulse") return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 13h3l2-6 4 12 2.5-7H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
  if (name === "search") return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="5.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="m15.2 15.2 4.1 4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
  if (name === "funds") return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 18V9m7 9V5m7 13v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
  if (name === "portfolio") return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.5 8.5h11A1.5 1.5 0 0 1 19 10v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18V10a1.5 1.5 0 0 1 1.5-1.5Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M9 8.5V6.75A2.25 2.25 0 0 1 11.25 4.5h1.5A2.25 2.25 0 0 1 15 6.75V8.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
  return (
    <svg className={common} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function MobileNav({ active }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const { data: session, status } = useSession();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab" || !open) return;
      const focusable = panelRef.current?.querySelectorAll('a, button:not([disabled])');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => panelRef.current?.querySelector("button")?.focus());
    }
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function openSearch() {
    close();
    requestAnimationFrame(() => window.dispatchEvent(new Event("mfp-open-search")));
  }

  function openMenu() {
    setOpen(true);
    requestAnimationFrame(() => panelRef.current?.querySelector("button")?.focus());
  }

  return (
    <div className="lg:hidden">
      {mounted && createPortal(
        <>
          <nav className="mobile-dock fixed inset-x-3 bottom-3 z-[60] grid h-[70px] grid-cols-5 overflow-hidden rounded-[1.6rem] border border-line/80 bg-surface/95 px-1.5 py-1.5 shadow-float backdrop-blur-2xl lg:hidden" aria-label="Mobile primary navigation">
            {MOBILE_PRIMARY_LINKS.map(([label, href, icon]) => {
              const isActive = href !== "#search" && href !== "#menu" && (active === href || (href !== "/" && active?.startsWith(href)));
              if (href === "#search") {
                return (
                  <button key={label} type="button" onClick={openSearch} className="group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-[1.15rem] text-[10px] font-semibold text-ink-muted transition hover:bg-accent/10 hover:text-accent">
                    <DockIcon name={icon} />
                    <span>{label}</span>
                  </button>
                );
              }
              if (href === "#menu") {
                return (
                  <button key={label} ref={triggerRef} type="button" onClick={openMenu} aria-label="Open all navigation" aria-expanded={open} aria-controls="mobile-navigation-drawer" className="group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-[1.15rem] text-[10px] font-semibold text-ink-muted transition hover:bg-accent/10 hover:text-accent">
                    <DockIcon name={icon} />
                    <span>{label}</span>
                  </button>
                );
              }
              return (
                <a key={href} href={href} aria-current={isActive ? "page" : undefined} className={`group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-[1.15rem] text-[10px] font-semibold transition ${isActive ? "bg-ink text-bg shadow-[0_10px_28px_rgb(15_23_28/0.18)]" : "text-ink-muted hover:bg-surface-2 hover:text-ink"}`}>
                  <DockIcon name={icon} />
                  <span>{label}</span>
                  {isActive && <span className="absolute top-1.5 h-1 w-5 rounded-full bg-accent" aria-hidden="true" />}
                </a>
              );
            })}
          </nav>

          {open && (
            <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="All navigation">
              <button type="button" className="absolute inset-0 bg-bg/72 backdrop-blur-md" onClick={close} aria-label="Close navigation backdrop" />
              <section id="mobile-navigation-drawer" ref={panelRef} className="mobile-sheet absolute inset-x-2 bottom-2 flex max-h-[88dvh] flex-col overflow-hidden rounded-[1.9rem] border border-line/80 bg-surface/95 shadow-float backdrop-blur-2xl">
                <div className="mx-auto mt-3 h-1.5 w-11 rounded-full bg-line-strong" aria-hidden="true" />
                <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Navigation matrix</div>
                    <div className="mt-1 text-base font-semibold tracking-[-0.025em] text-ink">MF Pulse terminal</div>
                    <div className="mt-1 text-xs text-ink-faint">Research, portfolio, market and trust workflows</div>
                  </div>
                  <button type="button" onClick={close} className="grid h-10 w-10 place-items-center rounded-full border border-line/80 bg-surface-2 text-lg text-ink-muted hover:text-ink" aria-label="Close navigation">×</button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-5">
                  {NAV_GROUPS.map((group) => (
                    <div key={group.label} className="mb-6">
                      <div className="eyebrow px-2">{group.label}</div>
                      <nav className="mt-2 grid grid-cols-2 gap-1" aria-label={group.label}>
                        {group.links.map(([label, href]) => <a key={`${group.label}-${href}`} href={href} onClick={close} aria-current={active === href ? "page" : undefined} className={`min-h-12 rounded-2xl px-3 py-3 text-sm font-semibold transition ${active === href ? "bg-accent/12 text-accent shadow-[inset_0_0_0_1px_rgb(var(--color-brand)/0.16)]" : "text-ink-muted hover:bg-surface-strong hover:text-ink"}`}>{label}</a>)}
                      </nav>
                    </div>
                  ))}
                </div>
                {status !== "loading" && (
                  <div className="border-t border-line/70 p-5 text-sm">
                    {session ? (
                      <div className="grid gap-3">
                        <a href="/profile" onClick={close} className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-line bg-surface-2 px-3 text-ink-muted">
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-ink">Account profile</span>
                            <span className="block truncate text-[11px] text-ink-faint">{session.user?.email || session.user?.name}</span>
                          </span>
                          <span aria-hidden="true">→</span>
                        </a>
                        <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="min-h-11 rounded-full bg-ink px-4 font-semibold text-bg">Sign out</button>
                      </div>
                    ) : (
                      <a href="/login" className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-accent px-4 font-semibold text-white">Sign in to sync research</a>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  );
}
