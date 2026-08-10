"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession, signOut } from "next-auth/react";
import { NAV_GROUPS } from "../lib/navLinks";

function SearchIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="10.8" cy="10.8" r="5.8" stroke="currentColor" strokeWidth="1.8" />
      <path d="m15.2 15.2 4.1 4.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon({ open }) {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {open ? (
        <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      ) : (
        <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

function activeLink(active, href) {
  const path = href.split("#")[0];
  if (path === "/") return active === "/";
  return active === path || active?.startsWith(`${path}/`);
}

export default function MobileNav({ active, marketLine, sessionLabel }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const menuButtonRef = useRef(null);
  const panelRef = useRef(null);
  const { data: session, status } = useSession();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") close();
      if (event.key !== "Tab" || !open) return;
      const focusable = panelRef.current?.querySelectorAll('a, button:not([disabled]), summary');
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
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  function close({ restoreFocus = true } = {}) {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => menuButtonRef.current?.focus());
  }

  function openSearch() {
    close({ restoreFocus: false });
    requestAnimationFrame(() => window.dispatchEvent(new Event("mfp-open-search")));
  }

  return (
    <>
      <header className="sticky top-0 z-[60] border-b border-line/80 bg-surface/95 shadow-sm backdrop-blur-2xl lg:hidden">
        <div className="container-px flex min-h-[64px] items-center gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="MF Pulse home">
            <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-ink text-[11px] font-bold text-bg shadow-glow" aria-hidden="true">
              <span className="absolute inset-0 bg-[linear-gradient(135deg,rgb(var(--color-brand)/0.95),transparent_58%)]" />
              <span className="relative">MF</span>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold tracking-[-0.025em] text-ink">MF Pulse</span>
              <span className="mt-1 block truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-faint">{sessionLabel}</span>
            </span>
          </Link>

          <Link href="/data-status" className="ml-auto hidden max-w-[42%] items-center gap-2 rounded-full border border-line/70 bg-bg/50 px-3 py-2 text-[10px] font-semibold text-ink-muted sm:flex" aria-label={`Data status: ${marketLine}`}>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" aria-hidden="true" />
            <span className="truncate">{marketLine}</span>
          </Link>

          <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:ml-0">
            <button type="button" onClick={openSearch} className="grid h-10 w-10 place-items-center rounded-xl border border-line/80 bg-surface-2 text-ink-muted hover:border-accent/40 hover:text-accent" aria-label="Search MF Pulse">
              <SearchIcon />
            </button>
            <button ref={menuButtonRef} type="button" onClick={() => setOpen((value) => !value)} className={`grid h-10 w-10 place-items-center rounded-xl border transition ${open ? "border-accent bg-accent text-white" : "border-line/80 bg-surface-2 text-ink-muted hover:border-accent/40 hover:text-accent"}`} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation-drawer">
              <MenuIcon open={open} />
            </button>
          </div>
        </div>
      </header>

      {mounted && open && createPortal(
        <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button type="button" className="absolute inset-0 bg-bg/72 backdrop-blur-md" onClick={() => close()} aria-label="Close navigation backdrop" />
          <section id="mobile-navigation-drawer" ref={panelRef} className="mobile-sheet absolute inset-x-2 top-2 flex max-h-[calc(100dvh-1rem)] flex-col overflow-hidden rounded-[1.5rem] border border-line/80 bg-surface/98 shadow-float backdrop-blur-2xl sm:left-auto sm:right-3 sm:w-[430px]">
            <div className="flex items-center justify-between border-b border-line/70 px-5 py-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">MF Pulse navigation</div>
                <div className="mt-1 text-base font-semibold tracking-[-0.025em] text-ink">Explore research and investing</div>
              </div>
              <button type="button" onClick={() => close()} className="grid h-10 w-10 place-items-center rounded-xl border border-line/80 bg-surface-2 text-ink-muted" aria-label="Close navigation menu"><MenuIcon open /></button>
            </div>

            <div className="grid grid-cols-4 gap-2 border-b border-line/70 p-4">
              {[["Home", "/"], ["Funds", "/funds"], ["Brief", "/brief"], ["Portfolio", "/portfolio"]].map(([label, href]) => (
                <Link key={href} href={href} onClick={() => close({ restoreFocus: false })} className={`flex min-h-11 items-center justify-center rounded-xl px-2 text-center text-xs font-semibold ${activeLink(active, href) ? "bg-ink text-bg" : "bg-accent/10 text-accent"}`}>{label}</Link>
              ))}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {NAV_GROUPS.map((group) => {
                const groupActive = group.links.some(([, href]) => activeLink(active, href));
                return (
                  <details key={group.label} className="group rounded-2xl border border-line/70 bg-surface-2/55" open={groupActive}>
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
                      {group.label}<span className="text-ink-faint transition group-open:rotate-45" aria-hidden="true">＋</span>
                    </summary>
                    <nav className="grid grid-cols-2 gap-1 border-t border-line/60 p-2" aria-label={group.label}>
                      {group.links.map(([label, href]) => {
                        const current = activeLink(active, href);
                        return <Link key={`${group.label}-${href}-${label}`} href={href} onClick={() => close({ restoreFocus: false })} aria-current={current ? "page" : undefined} className={`min-h-11 rounded-xl px-3 py-2.5 text-[12px] font-semibold ${current ? "bg-accent/12 text-accent" : "text-ink-muted hover:bg-surface hover:text-ink"}`}>{label}</Link>;
                      })}
                    </nav>
                  </details>
                );
              })}
            </div>

            {status !== "loading" && (
              <div className="border-t border-line/70 p-4 text-sm">
                {session ? (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Link href="/profile" onClick={() => close({ restoreFocus: false })} className="flex min-h-11 min-w-0 items-center rounded-xl bg-surface-2 px-3 font-semibold text-ink">Account</Link>
                    <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="min-h-11 rounded-xl border border-line px-4 font-semibold text-ink-muted">Sign out</button>
                  </div>
                ) : (
                  <Link href="/login" className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-accent px-4 font-semibold text-white">Sign in to sync your research</Link>
                )}
              </div>
            )}
          </section>
        </div>,
        document.body
      )}
    </>
  );
}
