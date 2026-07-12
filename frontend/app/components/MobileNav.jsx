"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSession, signOut } from "next-auth/react";
import { MOBILE_PRIMARY_LINKS, NAV_GROUPS } from "../lib/navLinks";

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

  return (
    <div className="xl:hidden">
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-label="Open all navigation" aria-expanded={open} aria-controls="mobile-navigation-drawer" className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-ink-muted shadow-sm transition hover:border-accent/40 hover:text-accent">
        <span aria-hidden="true" className="text-base">☰</span>
      </button>

      {mounted && createPortal(
        <>
          <nav className="fixed inset-x-2 bottom-2 z-[60] grid h-[60px] grid-cols-5 overflow-hidden rounded-2xl border border-line bg-surface/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-float backdrop-blur-xl" aria-label="Mobile primary navigation">
            {MOBILE_PRIMARY_LINKS.map(([label, href, icon]) => href === "#search" ? (
              <button key={label} type="button" onClick={openSearch} className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium text-ink-muted transition hover:bg-accent/10 hover:text-accent"><span className="text-lg leading-none" aria-hidden="true">{icon}</span>{label}</button>
            ) : (
              <a key={href} href={href} aria-current={active === href ? "page" : undefined} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition ${active === href ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-2 hover:text-ink"}`}><span className="text-lg leading-none" aria-hidden="true">{icon}</span>{label}</a>
            ))}
          </nav>

          {open && (
            <div className="fixed inset-0 z-[70] xl:hidden" role="dialog" aria-modal="true" aria-label="All navigation">
              <button type="button" className="absolute inset-0 bg-bg/70 backdrop-blur-sm" onClick={close} aria-label="Close navigation backdrop" />
              <section id="mobile-navigation-drawer" ref={panelRef} className="absolute inset-y-0 right-0 flex w-[min(92vw,420px)] flex-col overflow-hidden border-l border-line bg-surface shadow-float">
                <div className="flex items-center justify-between border-b border-line px-5 py-4">
                  <div><div className="text-sm font-semibold text-ink">Research areas</div><div className="mt-1 text-xs text-ink-faint">Move through MF Pulse by task</div></div>
                  <button type="button" onClick={close} className="grid h-10 w-10 place-items-center rounded-full border border-line text-lg text-ink-muted" aria-label="Close navigation">×</button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-5">
                  {NAV_GROUPS.map((group) => (
                    <div key={group.label} className="mb-6">
                      <div className="eyebrow px-2">{group.label}</div>
                      <nav className="mt-2 grid grid-cols-2 gap-1" aria-label={group.label}>
                        {group.links.map(([label, href]) => <a key={`${group.label}-${href}`} href={href} onClick={close} aria-current={active === href ? "page" : undefined} className={`min-h-11 rounded-xl px-3 py-3 text-sm font-medium ${active === href ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-strong hover:text-ink"}`}>{label}</a>)}
                      </nav>
                    </div>
                  ))}
                </div>
                {status !== "loading" && <div className="border-t border-line p-5 text-sm">{session ? <div className="flex items-center justify-between gap-3"><span className="truncate text-ink-muted">{session.user?.name || session.user?.email}</span><button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="font-medium text-ink">Sign out</button></div> : <a href="/login" className="font-medium text-accent">Sign in to sync your research →</a>}</div>}
              </section>
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  );
}
