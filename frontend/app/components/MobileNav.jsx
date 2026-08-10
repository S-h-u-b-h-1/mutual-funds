"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession, signOut } from "next-auth/react";
import { NAV_GROUPS } from "../lib/navLinks";

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

  function openMenu() {
    setOpen(true);
    requestAnimationFrame(() => panelRef.current?.querySelector("button")?.focus());
  }

  return (
    <div className="xl:hidden">
      <button ref={triggerRef} type="button" onClick={openMenu} aria-label="Open navigation" aria-expanded={open} aria-controls="mobile-navigation-drawer" className="flex min-h-10 items-center gap-2 rounded-full border border-line/80 bg-bg/35 px-3 text-xs font-semibold text-ink-muted shadow-sm hover:border-accent/35 hover:text-ink">
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        <span className="hidden sm:inline">Menu</span>
      </button>
      {mounted && createPortal(
        <>
          {open && (
            <div className="fixed inset-0 z-[70] xl:hidden" role="dialog" aria-modal="true" aria-label="All navigation">
              <button type="button" className="absolute inset-0 bg-bg/72 backdrop-blur-md" onClick={close} aria-label="Close navigation backdrop" />
              <section id="mobile-navigation-drawer" ref={panelRef} className="mobile-menu-panel absolute inset-x-2 top-2 flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-[1.9rem] border border-line/80 bg-surface/95 shadow-float backdrop-blur-2xl sm:left-auto sm:right-3 sm:w-[680px]">
                <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Explore MF Pulse</div>
                    <div className="mt-1 text-base font-semibold tracking-[-0.025em] text-ink">Research and portfolio workspace</div>
                    <div className="mt-1 text-xs text-ink-faint">Funds, stocks, markets, evidence and account tools</div>
                  </div>
                  <button type="button" onClick={close} className="grid h-10 w-10 place-items-center rounded-full border border-line/80 bg-surface-2 text-lg text-ink-muted hover:text-ink" aria-label="Close navigation">×</button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-5 sm:grid sm:grid-cols-2 sm:gap-x-4">
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
