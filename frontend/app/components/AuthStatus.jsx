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
      <a href="/login" className="text-[12px] text-ink-faint transition-colors hover:text-ink-muted">
        Sign in
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2 text-[12px]">
      <span
        className="hidden text-ink-faint sm:inline"
        title={syncMode === "cloud" ? "Your research is synced to your account" : "Saved on this device only"}
      >
        {syncMode === "cloud" ? "☁ Synced" : "⚠ Local only"}
      </span>
      <span className="hidden max-w-[120px] truncate text-ink-muted md:inline">{session.user?.name || session.user?.email}</span>
      <button
        onClick={() => signOut({ callbackUrl: "/" })}
        className="text-ink-faint transition-colors hover:text-ink-muted"
      >
        Sign out
      </button>
    </div>
  );
}
