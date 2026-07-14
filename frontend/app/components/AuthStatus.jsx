"use client";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { getSyncStatus } from "../lib/cloudSync";
import { getStoredProfile, optionLabel } from "../lib/userProfile";

// Minimal auth/sync status indicator (frontend integration sprint, Phase 8) — a small client
// island dropped into Nav.jsx/MobileNav.jsx, not a redesign of either. Shows exactly four
// states: loading (renders nothing, avoids a flash), signed-out ("Sign in" link), signed-in +
// cloud-synced, signed-in + local-only (the bare-Credentials-only jwt fallback — see auth.js).
export default function AuthStatus() {
  const { data: session, status } = useSession();
  const [syncMode, setSyncMode] = useState(null);
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function refresh() { getSyncStatus().then((s) => setSyncMode(s.mode)); }
    refresh();
    window.addEventListener("mfp-sync", refresh);
    return () => window.removeEventListener("mfp-sync", refresh);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    function refreshProfile() { setProfile(getStoredProfile(session.user)); }
    refreshProfile();
    window.addEventListener("storage", refreshProfile);
    window.addEventListener("mfp-profile-updated", refreshProfile);
    return () => {
      window.removeEventListener("storage", refreshProfile);
      window.removeEventListener("mfp-profile-updated", refreshProfile);
    };
  }, [session]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (status === "loading") return null;

  if (!session) {
    return (
      <a href="/login" className="hidden min-h-10 items-center rounded-full border border-line/80 bg-surface px-4 text-[12px] font-semibold text-ink-muted shadow-sm transition hover:border-accent/35 hover:text-ink sm:inline-flex">
        Sign in
      </a>
    );
  }

  const label = session.user?.name || session.user?.email || "Profile";
  const initials = label
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "P";

  return (
    <div ref={menuRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex min-h-10 items-center gap-2 rounded-full border border-line/80 bg-surface px-1.5 py-1 text-[12px] shadow-sm transition hover:border-accent/35 hover:bg-surface-2"
        title={label}
      >
        <span className="relative grid h-7 w-7 place-items-center rounded-full bg-accent/12 text-[10px] font-bold text-accent" aria-hidden="true">
          {initials}
          <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${syncMode === "cloud" ? "bg-pos" : "bg-warn"}`} />
        </span>
        <span className="hidden text-ink-muted 2xl:inline">{syncMode === "cloud" ? "Synced" : "Local"}</span>
        <svg className="h-3.5 w-3.5 text-ink-faint" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+0.6rem)] z-[80] w-[280px] overflow-hidden rounded-[1.4rem] border border-line bg-surface shadow-float">
          <div className="border-b border-line/70 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-ink text-xs font-bold text-bg" aria-hidden="true">{initials}</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink">{label}</div>
                <div className="truncate text-xs text-ink-faint">{session.user?.email}</div>
              </div>
            </div>
            <div className="mt-3 rounded-2xl bg-surface-2 p-3 text-xs text-ink-muted">
              <span className="font-semibold text-ink">{optionLabel("goals", profile?.primaryGoal)}</span>
              <span className="mx-1.5 text-ink-faint">·</span>
              <span>{optionLabel("risk", profile?.riskComfort)}</span>
            </div>
          </div>
          <div className="p-2 text-sm">
            <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className="flex min-h-10 items-center justify-between rounded-xl px-3 font-medium text-ink-muted hover:bg-surface-2 hover:text-ink">
              Profile
              <span aria-hidden="true">→</span>
            </Link>
            <Link role="menuitem" href="/dashboard" onClick={() => setOpen(false)} className="flex min-h-10 items-center justify-between rounded-xl px-3 font-medium text-ink-muted hover:bg-surface-2 hover:text-ink">
              Dashboard
              <span aria-hidden="true">→</span>
            </Link>
            <button role="menuitem" type="button" onClick={() => signOut({ callbackUrl: "/" })} className="mt-1 flex min-h-10 w-full items-center rounded-xl px-3 text-left font-semibold text-neg hover:bg-neg/10">
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
