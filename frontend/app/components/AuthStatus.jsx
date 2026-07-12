"use client";
import { useSession, signOut } from "next-auth/react";
import { useEffect, useState } from "react";
import { getSyncStatus } from "../lib/cloudSync";

// Minimal auth/sync status indicator (frontend integration sprint, Phase 8) — a small client
// island dropped into Nav.jsx/MobileNav.jsx, not a redesign of either. Shows exactly four
// states: loading (renders nothing, avoids a flash), signed-out ("Sign in" link), signed-in +
// cloud-synced, signed-in + local-only (the bare-Credentials-only jwt fallback — see auth.js).
export default function AuthStatus() {
  const { data: session, status } = useSession();
  const [syncMode, setSyncMode] = useState(null);

  useEffect(() => {
    function refresh() { getSyncStatus().then((s) => setSyncMode(s.mode)); }
    refresh();
    window.addEventListener("mfp-sync", refresh);
    return () => window.removeEventListener("mfp-sync", refresh);
  }, [session]);

  if (status === "loading") return null;

  if (!session) {
    return (
      <a href="/login" className="hidden min-h-10 items-center rounded-full border border-line/80 bg-surface px-3.5 text-[12px] font-semibold text-ink-muted shadow-sm transition hover:border-accent/35 hover:text-ink sm:inline-flex">
        Profile
      </a>
    );
  }

  return (
    <div className="hidden items-center gap-2 rounded-full border border-line/80 bg-surface px-1.5 py-1 text-[12px] shadow-sm sm:flex">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-accent/12 text-[11px] font-semibold text-accent" aria-hidden="true">
        {(session.user?.name || session.user?.email || "P").slice(0, 1).toUpperCase()}
      </span>
      <span
        className="hidden text-ink-faint lg:inline"
        title={syncMode === "cloud" ? "Your research is synced to your account" : "Saved on this device only"}
      >
        {syncMode === "cloud" ? "Synced" : "Local"}
      </span>
      <span className="hidden max-w-[110px] truncate font-medium text-ink-muted xl:inline">{session.user?.name || session.user?.email}</span>
      <button
        type="button"
        onClick={() => signOut({ callbackUrl: "/" })}
        className="rounded-full px-2.5 py-1.5 text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink-muted"
      >
        Sign out
      </button>
    </div>
  );
}
