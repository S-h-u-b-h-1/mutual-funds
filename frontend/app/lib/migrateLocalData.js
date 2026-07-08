"use client";
// Client-side trigger for /api/v1/sync/migrate — the server can't read localStorage, so this is
// the one piece of that migration that has to run in the browser. Called from login/register on
// successful sign-in (see app/login/page.js, app/register/page.js). Best-effort and silent: if it
// fails, the user's localStorage data is untouched and nothing is lost, just not cloud-synced yet.
function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export async function migrateLocalDataToCloud() {
  if (typeof window === "undefined") return null;
  try {
    const payload = {
      watchlist: readJson("mfp_watchlist", []),
      notes: readJson("mfp_research_notes", {}),
      recentViews: readJson("mfp_recent_views", []),
      recentSearches: readJson("mfp_recent_searches", []),
      recentComparisons: readJson("mfp_recent_compares", []),
    };
    const res = await fetch("/api/v1/sync/migrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
