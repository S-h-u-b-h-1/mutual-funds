"use client";
import { useEffect, useRef, useState } from "react";

const LINKS = [
  ["Performance", "/performance"],
  ["Categories", "/categories"],
  ["Compare", "/compare"],
  ["Research", "/research"],
  ["Analytics", "/analytics"],
  ["Data status", "/data-status"],
];

export default function MobileNav({ active }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    if (open) {
      document.addEventListener("keydown", onKey);
      document.body.style.overflow = "hidden";
      // move focus into the sheet for keyboard users
      panelRef.current?.querySelector("a")?.focus();
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-nav"
        className="grid h-9 w-9 place-items-center rounded-lg border border-line text-ink-muted transition-colors hover:text-ink"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          {open ? (
            <>
              <path d="M4 4l10 10" />
              <path d="M14 4L4 14" />
            </>
          ) : (
            <>
              <path d="M2 5h14" />
              <path d="M2 9h14" />
              <path d="M2 13h14" />
            </>
          )}
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 top-14 z-40 bg-black/50" onClick={() => setOpen(false)} aria-hidden />
          <div
            id="mobile-nav"
            ref={panelRef}
            className="fixed inset-x-0 top-14 z-50 border-b border-line bg-[#080b14]/95 p-3 backdrop-blur-md"
          >
            <nav className="flex flex-col">
              {LINKS.map(([l, h]) => (
                <a
                  key={h}
                  href={h}
                  onClick={() => setOpen(false)}
                  aria-current={active === h ? "page" : undefined}
                  className={`rounded-lg px-3 py-3 text-[15px] transition-colors ${
                    active === h ? "bg-white/[0.06] text-ink" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {l}
                </a>
              ))}
              <a href="/#alerts" onClick={() => setOpen(false)} className="mt-1 rounded-lg bg-accent px-3 py-3 text-center text-[14px] font-semibold text-white">
                Get Flow Alerts
              </a>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}
