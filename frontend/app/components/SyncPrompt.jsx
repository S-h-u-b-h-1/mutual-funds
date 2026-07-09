"use client";
import { useEffect, useState } from "react";
import { getSyncStatus, migrateLocalToCloud } from "../lib/cloudSync";

// Migration UX (frontend integration sprint, Phase 6). Renders globally (mounted once in
// app/layout.js) so it appears wherever a just-signed-in user lands, not tied to any one page.
// Minimal, non-invasive: a single dismissible bottom banner, not a modal — never blocks the app.
const LOCAL_KEYS = ["mfp_watchlist", "mfp_research_notes", "mfp_recent_views", "mfp_recent_searches", "mfp_recent_compares"];
// Per-browser, not per-account — deliberately not "have I ever migrated" (server-side), since a
// second device's local data is genuinely different and worth its own prompt the first time this
// browser sees a signed-in session. Set once the user has answered either way; skipping never
// touches their local data, matching the spec exactly.
const SEEN_KEY = "mfp_migration_prompt_seen";

function hasLocalData() {
  return LOCAL_KEYS.some((k) => {
    try {
      const v = JSON.parse(localStorage.getItem(k) || "null");
      if (!v) return false;
      return Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0;
    } catch {
      return false;
    }
  });
}

export default function SyncPrompt() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY) === "true") return;
    getSyncStatus().then((s) => {
      if (s.loggedIn && hasLocalData()) setVisible(true);
    });
  }, []);

  function dismiss() {
    localStorage.setItem(SEEN_KEY, "true");
    setVisible(false);
  }

  async function accept() {
    setBusy(true);
    const result = await migrateLocalToCloud();
    setBusy(false);
    setDone(true);
    localStorage.setItem(SEEN_KEY, "true");
    // migrate() itself already no-ops safely if called twice (audit_log marker) — this timeout
    // just clears the banner, it isn't what makes re-entry safe.
    setTimeout(() => setVisible(false), result ? 2500 : 0);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-accent/40 bg-[#0d0f17] px-4 py-3 shadow-xl sm:inset-x-auto sm:right-4">
      {done ? (
        <p className="text-[12.5px] text-pos">✓ Synced to your account.</p>
      ) : (
        <>
          <p className="text-[12.5px] text-ink-muted">Sync your local research to your account?</p>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={dismiss} className="text-[12px] text-ink-faint transition-colors hover:text-ink-muted">
              Skip
            </button>
            <button
              onClick={accept}
              disabled={busy}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-accent-soft disabled:opacity-50"
            >
              {busy ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
