"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

function isActiveLink(active, href) {
  const pathname = String(href || "").split("#")[0];
  if (pathname === "/") return active === "/";
  return active === pathname || active?.startsWith(`${pathname}/`);
}

export default function DesktopNavMenus({ menus, active }) {
  const [openMenu, setOpenMenu] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    function closeFromOutside(event) {
      if (!navRef.current?.contains(event.target)) setOpenMenu(null);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") setOpenMenu(null);
    }
    function closeForOtherControl(event) {
      if (event.detail?.owner !== "primary-navigation") setOpenMenu(null);
    }
    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("mfp-nav-menu-open", closeForOtherControl);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("mfp-nav-menu-open", closeForOtherControl);
    };
  }, []);

  function toggleMenu(label) {
    const next = openMenu === label ? null : label;
    if (next) window.dispatchEvent(new CustomEvent("mfp-nav-menu-open", { detail: { owner: "primary-navigation" } }));
    setOpenMenu(next);
  }

  return (
    <nav ref={navRef} className="flex min-w-0 items-center justify-center gap-0.5 2xl:gap-1" aria-label="Primary navigation">
      {menus.map((menu) => {
        const isOpen = openMenu === menu.label;
        const isActive = menu.links.some(([, href]) => isActiveLink(active, href));
        return (
          <div key={menu.label} className="relative">
            <button
              type="button"
              onClick={() => toggleMenu(menu.label)}
              aria-haspopup="menu"
              aria-expanded={isOpen}
              className={`flex min-h-10 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold transition hover:bg-surface hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent/35 2xl:px-3.5 2xl:text-[13px] ${isActive || isOpen ? "bg-surface text-ink shadow-sm" : "text-ink-muted"}`}
            >
              {menu.shortLabel || menu.label}
              <span className={`text-sm leading-none text-ink-faint transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">⌄</span>
            </button>
            {isOpen && (
              <div role="menu" className="absolute left-1/2 top-[calc(100%+0.7rem)] z-[110] w-60 -translate-x-1/2 rounded-[1.25rem] border border-line bg-surface p-2 shadow-float">
                {menu.links.map(([label, href]) => {
                  const linkActive = isActiveLink(active, href);
                  return (
                    <Link key={`${menu.label}-${label}-${href}`} role="menuitem" href={href} onClick={() => setOpenMenu(null)} aria-current={linkActive ? "page" : undefined} className={`flex min-h-10 items-center justify-between rounded-xl px-3 text-sm font-semibold transition ${linkActive ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface-2 hover:text-ink"}`}>
                      {label}<span aria-hidden="true" className="text-ink-faint">→</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
